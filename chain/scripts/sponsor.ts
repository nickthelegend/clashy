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
//
//   npx tsx scripts/sponsor.ts              (port 8790; CLASHY_SPONSOR_PORT to change)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { ComputeBudgetProgram, PublicKey, Transaction, type Connection } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PrivyClient } from '@privy-io/server-auth';
import { fileURLToPath } from 'node:url';
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch { /* no chain/.env: Privy checks off */ }
import { BASE_URL, ER_URL, IS_LOCAL, USDC, USDC_MINT, base, er, giveUsdc, programId, sponsor, tokenBalance, usdcAta } from '../tests/common.ts';

const PORT = Number(process.env.CLASHY_SPONSOR_PORT ?? 8790);
const ORIGIN = process.env.CLASHY_APP_ORIGIN ?? '*';
const idl = JSON.parse(readFileSync(new URL('../target/idl/clashy.json', import.meta.url), 'utf8')) as {
  instructions: { name: string; discriminator: number[]; accounts: { name: string }[] }[];
};

/** Player-facing instructions the sponsor pays for. Admin, feed, delegation-callback and VRF-callback ones are not here. */
const PLAYER_IXS = new Set([
  'init_player', 'open_duel', 'join_duel', 'cancel_duel', 'abort_duel', 'request_coin_roll', 'reveal_seed', 'commit_pick',
  'reveal_pick', 'delegate_duel', 'start_duel', 'check_duel', 'settle_duel', 'create_clan', 'join_clan', 'leave_clan',
  'deposit_chest', 'withdraw_chest', 'propose', 'vote', 'execute_proposal', 'reject_proposal', 'close_position',
  'declare_war', 'accept_war', 'cancel_war', 'settle_war', 'create_tournament', 'join_tournament', 'cancel_tournament',
  'request_tournament_coin', 'delegate_tournament', 'start_tournament', 'call_round', 'resolve_round', 'settle_tournament',
]);
/** Instructions that may only run on the rollup (the rest only on Solana). */
const ER_IXS = new Set(['start_duel', 'check_duel', 'start_tournament', 'call_round', 'resolve_round']);
const SPONSOR_SLOTS = new Set(['payer', 'rent_payer']);
const PRIVY = process.env.CLASHY_PRIVY_APP_ID && process.env.CLASHY_PRIVY_APP_SECRET
  ? new PrivyClient(process.env.CLASHY_PRIVY_APP_ID, process.env.CLASHY_PRIVY_APP_SECRET) : null;
const AUTH_REQUIRED = !IS_LOCAL || process.env.CLASHY_RELAY_REQUIRE_AUTH === '1';
const byDisc = new Map(idl.instructions.map((ix) => [Buffer.from(ix.discriminator).toString('hex'), ix]));

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
      // create (0 or empty) / create-idempotent (1) a USDC account: [payer, ata, owner, mint, system, token]
      if (layer !== 'base') throw new Refused('token accounts are made on Solana');
      if (ix.data.length > 1 || (ix.data.length === 1 && ix.data[0] > 1)) throw new Refused('only creating a token account');
      if (!ix.keys[3]?.pubkey.equals(USDC_MINT)) throw new Refused('only USDC token accounts');
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
