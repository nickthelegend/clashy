// Clashy sponsor relay: pays every fee and rent so a player's wallet only ever holds USDC.
//
// The app builds a transaction with the sponsor as fee payer (and as the `payer` account of any instruction that
// creates an account), the player's wallet signs it (Privy, silently), and this relay checks it, adds the sponsor's
// signature and sends it to Solana or the MagicBlock rollup. It refuses anything that could spend the sponsor's SOL
// on something other than a Clashy game action:
//   - only Clashy player instructions (never admin, feed or VRF-callback instructions), Compute Budget, and creating
//     a USDC token account;
//   - the sponsor key may appear only as the fee payer, an instruction's `payer` or `rent_payer`, or the funder of a
//     USDC token account;
//   - every other required signature must already be there and valid;
//   - a per-wallet rate limit.
//   - with CLASHY_PRIVY_APP_SECRET set (chain/.env, gitignored): a valid Privy access token, and every wallet that signs
//     the transaction must be one of that Privy user's wallets. Off the local stack this is required; locally, a request
//     without a token is still served so device test wallets (automated browser tests) keep working.
// Besides game actions it pays for one plain-money move: sending USDC out of the player's own USDC account
// (TransferChecked on the USDC mint, signed by the player), so a USDC-only wallet can always withdraw.
// On the local stack it also runs a test-USDC faucet (the local mint authority is the local admin key).
// Read-only: GET /history?range=1h|24h|7d serves the prices the crank recorded (scripts/price-history.ts).
//
//   npx tsx scripts/sponsor.ts              (port 8790; CLASHY_SPONSOR_PORT to change)
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { ComputeBudgetProgram, PublicKey, Transaction, type Connection } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PrivyClient } from '@privy-io/server-auth';
import { fileURLToPath } from 'node:url';
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch { /* no chain/.env: Privy checks off */ }
import { SAMPLE_EVERY_SECS, downsample, readSamples, type Sample } from './price-history.ts';
import { BASE_URL, ER_URL, IS_LOCAL, USDC, USDC_MINT, base, er, giveUsdc, programId, sponsor, tokenBalance, usdcAta } from '../tests/common.ts';

const PORT = Number(process.env.CLASHY_SPONSOR_PORT ?? 8790);
const ORIGIN = process.env.CLASHY_APP_ORIGIN ?? '*';
const idl = JSON.parse(readFileSync(new URL('../target/idl/clashy.json', import.meta.url), 'utf8')) as {
  instructions: { name: string; discriminator: number[]; accounts: IdlAccount[] }[];
};
type IdlAccount = { name: string; accounts?: IdlAccount[] };
/** Nested account groups (stash_invest's `sw`) flattened in order, as they appear in the instruction. */
const flat = (accs: IdlAccount[]): { name: string }[] => accs.flatMap((a) => (a.accounts ? flat(a.accounts) : [a]));
/** Tokenized stocks a player may hold: the xStocks snapshotted onto the fork (scripts/fork-stocks.ts). */
const STOCK_MINTS = new Set<string>(
  (() => { try { return (JSON.parse(readFileSync(new URL('../.localnet/fork/stocks.json', import.meta.url), 'utf8')) as { stocks: { mint: string }[] }).stocks.map((x) => x.mint); } catch { return []; } })(),
);
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/** Player-facing instructions the sponsor pays for. Admin, feed, delegation-callback and VRF-callback ones are not here. */
const PLAYER_IXS = new Set([
  'init_player', 'open_duel', 'join_duel', 'cancel_duel', 'abort_duel', 'request_coin_roll', 'reveal_seed', 'commit_pick',
  'reveal_pick', 'delegate_duel', 'start_duel', 'check_duel', 'settle_duel', 'create_clan', 'join_clan', 'leave_clan',
  'deposit_chest', 'withdraw_chest', 'propose', 'vote', 'execute_proposal', 'reject_proposal', 'close_position',
  'declare_war', 'accept_war', 'cancel_war', 'settle_war', 'create_tournament', 'join_tournament', 'cancel_tournament',
  'request_tournament_coin', 'delegate_tournament', 'start_tournament', 'call_round', 'resolve_round', 'settle_tournament',
  'create_profile', 'set_avatar', 'set_limits', 'take_break', 'open_stash', 'set_goal', 'stash_save', 'stash_withdraw',
  'stash_invest', 'stash_sell', 'open_channel', 'delegate_channel', 'post_message', 'post', 'like',
]);
/** Instructions that may only run on the rollup (the rest only on Solana). */
const ER_IXS = new Set(['start_duel', 'check_duel', 'start_tournament', 'call_round', 'resolve_round', 'post_message', 'post', 'like']);
const SPONSOR_SLOTS = new Set(['payer', 'rent_payer']);
const PRIVY = process.env.CLASHY_PRIVY_APP_ID && process.env.CLASHY_PRIVY_APP_SECRET
  ? new PrivyClient(process.env.CLASHY_PRIVY_APP_ID, process.env.CLASHY_PRIVY_APP_SECRET) : null;
const AUTH_REQUIRED = !IS_LOCAL || process.env.CLASHY_RELAY_REQUIRE_AUTH === '1';
const byDisc = new Map(idl.instructions.map((ix) => [Buffer.from(ix.discriminator).toString('hex'), { name: ix.name, accounts: flat(ix.accounts) }]));

type Layer = 'base' | 'er';
class Refused extends Error { status = 400; }

/** Checks a transaction the sponsor is asked to pay for. Returns the wallets that signed it (for rate limiting). */
export function vet(tx: Transaction, layer: Layer): string[] {
  const me = sponsor.publicKey;
  if (!tx.feePayer?.equals(me)) throw new Refused('the sponsor must be the fee payer');
  if (tx.instructions.length === 0 || tx.instructions.length > 6) throw new Refused('1 to 6 instructions');
  const signers = new Set<string>();
  for (const ix of tx.instructions) {
    for (const k of ix.keys) if (k.isSigner && !k.pubkey.equals(me)) signers.add(k.pubkey.toBase58());
    if (ix.programId.equals(ComputeBudgetProgram.programId)) continue;
    if (ix.programId.equals(TOKEN_PROGRAM_ID)) {
      // withdrawing: TransferChecked (12) of USDC out of the signer's own USDC account [source, mint, dest, owner]
      if (layer !== 'base' || ix.data[0] !== 12 || ix.keys.length !== 4) throw new Refused('only a USDC transfer out of your own account');
      const [src, mint, , owner] = ix.keys;
      if (!mint.pubkey.equals(USDC_MINT) || !owner.isSigner || owner.pubkey.equals(me)) throw new Refused('only USDC, signed by its owner');
      if (!src.pubkey.equals(usdcAta(owner.pubkey))) throw new Refused('only from your own USDC account');
      continue;
    }
    if (ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      // create (0 or empty) / create-idempotent (1) a USDC or tokenized-stock account: [payer, ata, owner, mint, system, token]
      if (layer !== 'base') throw new Refused('token accounts are made on Solana');
      if (ix.data.length > 1 || (ix.data.length === 1 && ix.data[0] > 1)) throw new Refused('only creating a token account');
      const mint = ix.keys[3]?.pubkey;
      const usdcAcc = !!mint?.equals(USDC_MINT) && !!ix.keys[5]?.pubkey.equals(TOKEN_PROGRAM_ID);
      const stockAcc = !!mint && STOCK_MINTS.has(mint.toBase58()) && !!ix.keys[5]?.pubkey.equals(TOKEN_2022);
      if (!usdcAcc && !stockAcc) throw new Refused('only USDC or tokenized-stock token accounts');
      ix.keys.forEach((k, i) => { if (i !== 0 && k.pubkey.equals(me)) throw new Refused('the sponsor can only fund the account'); });
      continue;
    }
    if (!ix.programId.equals(programId)) throw new Refused(`program ${ix.programId.toBase58()} is not sponsored`);
    const def = byDisc.get(ix.data.subarray(0, 8).toString('hex'));
    if (!def || !PLAYER_IXS.has(def.name)) throw new Refused(`instruction ${def?.name ?? 'unknown'} is not sponsored`);
    if (ER_IXS.has(def.name) !== (layer === 'er')) throw new Refused(`${def.name} runs on ${ER_IXS.has(def.name) ? 'the rollup' : 'Solana'}`);
    ix.keys.forEach((k, i) => {
      if (k.pubkey.equals(me) && !SPONSOR_SLOTS.has(def.accounts[i]?.name ?? '')) {
        throw new Refused(`the sponsor cannot be ${def.name}.${def.accounts[i]?.name ?? `account ${i}`}`);
      }
    });
  }
  return [...signers];
}

// ---- rate limit: 40 transactions per wallet per 10 s (a duel sends a few, a Royale round one per player)
const hits = new Map<string, number[]>();
function limit(wallets: string[]) {
  const now = Date.now();
  for (const w of wallets.length ? wallets : ['(sponsor-only)']) {
    const recent = (hits.get(w) ?? []).filter((t) => now - t < 10_000);
    if (recent.length >= (wallets.length ? 40 : 200)) throw Object.assign(new Refused('slow down: too many transactions'), { status: 429 });
    recent.push(now);
    hits.set(w, recent);
  }
}

async function confirm(conn: Connection, sig: string) {
  for (let i = 0; i < 150; i++) {
    const [st] = (await conn.getSignatureStatuses([sig])).value;
    if (st?.err) {
      const landed = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }).catch(() => null);
      throw Object.assign(new Error(`transaction failed: ${JSON.stringify(st.err)}`), { logs: landed?.meta?.logMessages ?? [] });
    }
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`not confirmed in time: ${sig}`);
}

// Privy user → their wallets, cached a few minutes (one API call per user, not per transaction)
const userWallets = new Map<string, { at: number; wallets: Set<string> }>();
async function walletsOf(userId: string) {
  const hit = userWallets.get(userId);
  if (hit && Date.now() - hit.at < 300_000) return hit.wallets;
  const user = await PRIVY!.getUserById(userId);
  const wallets = new Set(user.linkedAccounts.flatMap((a) => (a.type === 'wallet' && 'address' in a ? [String(a.address)] : [])));
  userWallets.set(userId, { at: Date.now(), wallets });
  return wallets;
}

/** With Privy configured: the bearer token must be valid and every player signer must be that user's wallet. */
async function authorize(token: string | undefined, signers: string[]) {
  if (!PRIVY) {
    if (AUTH_REQUIRED) throw Object.assign(new Refused('Setup required: CLASHY_PRIVY_APP_ID and CLASHY_PRIVY_APP_SECRET'), { status: 503 });
    return null;
  }
  if (!token) {
    if (AUTH_REQUIRED) throw Object.assign(new Refused('sign in first (no Privy access token)'), { status: 401 });
    return null; // local stack: device test wallets
  }
  let userId: string;
  try { userId = (await PRIVY.verifyAuthToken(token)).userId; } catch { throw Object.assign(new Refused('your sign-in expired; sign in again'), { status: 401 }); }
  const mine = await walletsOf(userId);
  for (const w of signers) if (!mine.has(w)) throw Object.assign(new Refused(`wallet ${w.slice(0, 6)}… is not yours`), { status: 403 });
  return userId;
}

async function relay(body: { tx?: string; layer?: Layer }, token?: string) {
  const layer: Layer = body.layer === 'er' ? 'er' : 'base';
  if (!body.tx) throw new Refused('tx (base64) is required');
  const tx = Transaction.from(Buffer.from(body.tx, 'base64'));
  const signers = vet(tx, layer);
  const user = await authorize(token, signers);
  limit(user ? [user, ...signers] : signers);
  tx.partialSign(sponsor);
  if (!tx.verifySignatures(true)) throw new Refused('a required signature is missing or invalid');
  const conn = layer === 'er' ? er : base;
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: layer === 'er' });
  await confirm(conn, sig);
  return { sig };
}

async function faucet(body: { owner?: string }) {
  if (!IS_LOCAL) throw new Refused('the test-USDC faucet only runs on the local fork');
  const owner = new PublicKey(body.owner ?? '');
  if ((await tokenBalance(usdcAta(owner))) >= 500 * USDC) throw new Refused('this wallet already has 500+ test USDC');
  await giveUsdc(owner, 100 * USDC);
  return { usdc: (await tokenBalance(usdcAta(owner))) / USDC };
}

/** The crank's recorded prices over the last hour, day or week: at most 300 real samples, oldest first. */
const RANGES: Record<string, number> = { '1h': 3_600, '24h': 86_400, '7d': 7 * 86_400 };
function history(range: string | null) {
  const secs = RANGES[range ?? ''];
  if (!secs) throw new Refused(`range must be one of ${Object.keys(RANGES).join(', ')}`);
  let all: Sample[];
  try { all = readSamples(); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    throw Object.assign(new Refused(`No price history yet: chain/.localnet/price-history.jsonl does not exist. Run scripts/crank.ts, it records a sample every minute.`), { status: 503 });
  }
  const since = Math.floor(Date.now() / 1000) - secs;
  const inRange = all.filter((s) => s.t >= since);
  return { range, every: SAMPLE_EVERY_SECS, first: all[0]?.t ?? null, last: all.at(-1)?.t ?? null, count: inRange.length, points: downsample(inRange, 300) };
}

/**
 * Read-only market data proxy for Practice: every player's app shares one cached stream of Jupiter reads instead of
 * each browser hitting Jupiter's anonymous rate limit. Only the listed public GET endpoints pass; responses (and
 * Jupiter's own errors, with their status) are cached briefly per URL. Nothing is invented: a failure is passed on.
 */
const JUP_UPSTREAMS: Record<string, string> = {
  lite: 'https://lite-api.jup.ag', perps: 'https://perps-api.jup.ag',
  // the two on-chain order-book perps venues on Solana with a public market-data API
  phoenix: 'https://perp-api.phoenix.trade', pacifica: 'https://api.pacifica.fi',
};
const SYM = '[A-Za-z0-9-]{1,24}';
const JUP_ALLOWED = [
  /^\/lite\/price\/v3\?/, /^\/lite\/tokens\/v2\/(search|tag|toptrending|toporganicscore|toptraded|recent)\b/, /^\/perps\/v1\/pool-info\?/,
  /^\/phoenix\/exchange\/(markets|prices)$/,
  new RegExp(`^/phoenix/v1/(candles/${SYM}\\?|funding/${SYM}/rates\\?|view/orderbook/${SYM}$|market/${SYM}/stats\\?|trades/${SYM}/fills\\?)`),
  /^\/pacifica\/api\/v1\/info(\/prices|\/fees)?$/,
  /^\/pacifica\/api\/v1\/(kline|book|trades)\?/,
];
/** at: last attempt (drives the TTL); okAt: last good answer (a live number older than a minute is never served). */
const jupCache = new Map<string, { at: number; okAt: number; status: number; body: string; pending?: Promise<void> }>();
/** Live numbers (prices, books, trades, candles): never persisted, and a copy older than a minute is never served. */
const isLive = (path: string) => /^\/lite\/price|^\/phoenix\/(exchange\/prices|v1\/(candles|view\/orderbook|trades))|^\/pacifica\/api\/v1\/(info\/prices|kline|book|trades)/.test(path);
const jupTtl = (path: string) => (path.startsWith('/lite/price') ? 10_000 : /orderbook|\/book\?|\/trades\?|\/fills\?|prices$/.test(path) ? 1_500
  : /candles|kline/.test(path) ? 15_000 : path.startsWith('/perps') ? 30_000 : 60_000);
/**
 * Jupiter prices, shared per mint. Every screen asks for its own set of mints, and Jupiter's free price API allows only
 * a few reads a second, so caching per request URL spent the budget many times over. Here each mint's last good price
 * is kept for 10 s; stale mints from every client are read together, 50 per call, one call at a time, at most one a
 * second. A price older than a minute is never served; when nothing fresh is left the upstream error is passed on.
 */
const PRICE = new Map<string, { okAt: number; v: unknown }>();
let priceGate: Promise<void> = Promise.resolve();
let nextPriceAt = 0;
async function jupPrices(ids: string[]): Promise<{ status: number; body: string }> {
  const fresh = (m: string) => { const p = PRICE.get(m); return !!p && Date.now() - p.okAt <= 10_000; };
  const fail: { e: { status: number; body: string } | null } = { e: null };
  if (ids.some((m) => !fresh(m))) {
    const run = priceGate.then(async () => {
      const stale = ids.filter((m) => !fresh(m));
      for (let i = 0; i < stale.length; i += 50) {
        const batch = stale.slice(i, i + 50);
        const wait = nextPriceAt - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        nextPriceAt = Date.now() + 1_100;
        try {
          const r = await fetch(`${JUP_UPSTREAMS.lite}/price/v3?ids=${batch.join(',')}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
          const body = await r.text();
          if (!r.ok) { fail.e = { status: r.status, body }; continue; }
          const j = JSON.parse(body) as Record<string, unknown>;
          const t = Date.now();
          for (const m of batch) PRICE.set(m, { okAt: t, v: j[m] ?? null });
        } catch (e) {
          fail.e = { status: 502, body: JSON.stringify({ error: `lite unreachable: ${(e as Error).message}` }) };
        }
      }
    });
    priceGate = run.catch(() => undefined);
    await run;
  }
  const out: Record<string, unknown> = {};
  let any = false;
  for (const m of ids) {
    const p = PRICE.get(m);
    if (p && Date.now() - p.okAt <= 60_000) { any = true; if (p.v) out[m] = p.v; }
  }
  if (!any && fail.e) return fail.e;
  return { status: 200, body: JSON.stringify(out) };
}

async function jupProxy(path: string): Promise<{ status: number; body: string }> {
  if (!JUP_ALLOWED.some((r) => r.test(path))) return { status: 404, body: JSON.stringify({ error: 'not a proxied market endpoint' }) };
  if (path.startsWith('/lite/price/v3?')) {
    const ids = [...new Set((new URLSearchParams(path.split('?')[1]).get('ids') ?? '').split(',').filter((x) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x)))].slice(0, 300);
    if (!ids.length) return { status: 400, body: JSON.stringify({ error: 'ids: one or more token mints' }) };
    return jupPrices(ids);
  }
  const hit = jupCache.get(path);
  if (hit && Date.now() - hit.at < jupTtl(path)) return hit;
  if (hit?.pending) { await hit.pending; return jupCache.get(path)!; }
  const [, up, ...rest] = path.split('/');
  const entry = { at: hit?.at ?? 0, okAt: hit?.okAt ?? 0, status: hit?.status ?? 502, body: hit?.body ?? '', pending: undefined as Promise<void> | undefined };
  entry.pending = (async () => {
    try {
      const r = await fetch(`${JUP_UPSTREAMS[up]}/${rest.join('/')}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      const body = await r.text();
      // keep the last good answer through a rate limit for up to a minute, so a 429 burst does not blank every client
      // market lists keep their last good answer through any error; a price older than a minute is dropped instead
      if (r.ok || !hit?.body || (isLive(path) && Date.now() - entry.okAt > 60_000)) { entry.status = r.status; entry.body = body; }
      if (r.ok) entry.okAt = Date.now();
    } catch (e) {
      if (!hit?.body || (isLive(path) && Date.now() - entry.okAt > 60_000)) { entry.status = 502; entry.body = JSON.stringify({ error: `${up} unreachable: ${(e as Error).message}` }); }
    }
    entry.at = Date.now();
  })();
  jupCache.set(path, entry);
  if (jupCache.size > 500) jupCache.delete(jupCache.keys().next().value!);
  await entry.pending; entry.pending = undefined;
  if (entry.status === 200 && !isLive(path)) saveJupLists();
  return entry;
}

/* Market lists (tokens, perps pools) survive a relay restart: the last good answer is kept on disk and served while
 * Jupiter rate-limits a cold relay. Prices are never persisted (a stale price would be a made-up price). */
const JUP_DISK = fileURLToPath(new URL('../.localnet/jup-lists.json', import.meta.url));
function saveJupLists() {
  const keep: Record<string, { at: number; body: string }> = {};
  for (const [k, v] of jupCache) if (v.status === 200 && !isLive(k)) keep[k] = { at: v.at, body: v.body };
  try { writeFileSync(JUP_DISK, JSON.stringify(keep)); } catch { /* best effort */ }
}
try {
  const saved = JSON.parse(readFileSync(JUP_DISK, 'utf8')) as Record<string, { at: number; body: string }>;
  // loaded as already-expired entries: the first request refreshes them, and a 429 falls back to these bodies
  for (const [k, v] of Object.entries(saved)) jupCache.set(k, { at: Date.now() - 120_000, okAt: v.at, status: 200, body: v.body });
} catch { /* no saved lists yet */ }
// keep Practice's market lists warm so no player waits on a cold call
const WARM = ['/lite/tokens/v2/toptrending/1h?limit=100', '/lite/tokens/v2/toptrending/24h?limit=100', '/phoenix/exchange/markets', '/pacifica/api/v1/info', '/pacifica/api/v1/info/fees'];
setInterval(() => { for (const p of WARM) jupProxy(p).catch(() => {}); }, 55_000).unref();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const send = (status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data)); };
  try {
    if (req.method === 'GET' && req.url === '/info') {
      return send(200, { sponsor: sponsor.publicKey.toBase58(), usdcMint: USDC_MINT.toBase58(), faucet: IS_LOCAL, base: BASE_URL, er: ER_URL, privy: !!PRIVY, authRequired: AUTH_REQUIRED });
    }
    if (req.method === 'GET' && (req.url ?? '').split('?')[0] === '/history') {
      return send(200, history(new URL(req.url ?? '/', 'http://relay').searchParams.get('range')));
    }
    if (req.method === 'GET' && /^\/(jup|mkt)\//.test(req.url ?? '')) {
      const r = await jupProxy((req.url ?? '').slice(4));
      res.writeHead(r.status, { 'content-type': 'application/json' }).end(r.body);
      return;
    }
    if (req.method !== 'POST') return send(404, { error: 'not found' });
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) throw new Refused('body too large'); }
    const body = raw ? JSON.parse(raw) : {};
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (req.url === '/relay') return send(200, await relay(body, token));
    if (req.url === '/faucet') return send(200, await faucet(body));
    return send(404, { error: 'not found' });
  } catch (e) {
    const err = e as Error & { status?: number; logs?: string[]; transactionLogs?: string[] };
    const logs = err.logs ?? err.transactionLogs ?? [];
    // a transaction the chain refused (simulation or execution) is the caller's problem, not the relay's
    const chainRefused = logs.length > 0 || /Simulation failed|transaction failed|custom program error/i.test(err.message);
    send(err.status ?? (chainRefused ? 422 : 500), { error: err.message.split('\n')[0], logs });
  }
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`sponsor relay on :${PORT} · sponsor ${sponsor.publicKey.toBase58()} · ${IS_LOCAL ? 'local fork, test-USDC faucet on' : BASE_URL} · Privy ${PRIVY ? 'checks on' : 'off'}${AUTH_REQUIRED ? ' (required)' : ''}`);
  });
}
export { server };
