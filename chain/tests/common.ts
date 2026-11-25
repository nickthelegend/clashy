// Shared harness for the Clashy end-to-end tests against the local MagicBlock stack
// (scripts/localnet.sh): base layer :8999, Ephemeral Rollup :7799.
// Prices are real: the crank reads Coinbase Exchange's public ticker (SOL, BTC, ETH) and Jupiter's price API
// (tokenized stocks: the xStocks themselves, which trade on Solana around the clock) and pushes them on chain.
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotent, getAssociatedTokenAddressSync, mintTo } from '@solana/spl-token';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Clashy } from '../target/types/clashy.ts';

const idl = JSON.parse(readFileSync(new URL('../target/idl/clashy.json', import.meta.url), 'utf8'));
export const BASE_URL = process.env.CLASHY_BASE ?? 'http://127.0.0.1:8999';
export const ER_URL = process.env.CLASHY_ER ?? 'http://127.0.0.1:7799';
/** Local stack (tests, app development) unless CLASHY_BASE points at devnet or mainnet. */
const BASE_HOST = (() => { try { return new URL(BASE_URL).hostname; } catch { return ''; } })();
/** Hosts a local chain can live on: this machine, or the Docker host / the compose service from inside a container. */
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', 'host.docker.internal', 'chain'];
if (process.env.CLASHY_LOCAL === '1' && !LOCAL_HOSTS.includes(BASE_HOST)) {
  throw new Error(`CLASHY_LOCAL=1 but ${BASE_HOST || BASE_URL} is not a local chain: refusing local rules (test faucet, local keys) against a real network`);
}
export const IS_LOCAL = BASE_HOST === '127.0.0.1' || BASE_HOST === 'localhost' || (process.env.CLASHY_LOCAL === '1' && LOCAL_HOSTS.includes(BASE_HOST));
function setupRequired(name: string, what: string): never {
  throw new Error(`Setup required: set ${name} (${what}) to run against ${BASE_URL}`);
}
/** The rollup validator duels, feeds and tournaments are delegated to (MagicBlock publishes theirs per region). */
export const LOCAL_ER_VALIDATOR = process.env.CLASHY_ER_VALIDATOR
  ? new PublicKey(process.env.CLASHY_ER_VALIDATOR)
  : IS_LOCAL ? new PublicKey('mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev') : setupRequired('CLASHY_ER_VALIDATOR', 'MagicBlock ER validator identity');
/** MagicBlock's VRF test queue, served on a local stack by their `vrf-oracle` (scripts/localnet.sh starts it). */
export const LOCAL_VRF_QUEUE = new PublicKey('GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb');
/** MagicBlock's VRF base queue with their hosted oracles on devnet and mainnet. */
export const BASE_VRF_QUEUE = new PublicKey('Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh');
export const PRICE_SCALE = 1_000_000;
export type CoinSource = { symbol: string; product?: string; mint?: string };
/** Config coins in order. Crypto prices from Coinbase; stocks are xStocks priced by Jupiter (24/7, on-chain trading). */
export const COINS: CoinSource[] = [
  { symbol: 'SOL', product: 'SOL-USD' },
  { symbol: 'BTC', product: 'BTC-USD' },
  { symbol: 'ETH', product: 'ETH-USD' },
  { symbol: 'NVDA', mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh' },
  { symbol: 'TSLA', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB' },
  { symbol: 'AAPL', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp' },
  { symbol: 'SPY', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W' },
  { symbol: 'GOOGL', mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN' },
];
/** The app's public calls feed, and the board end-to-end tests post to (never the public one). */
export const FEED_BOARD = 1;
export const TEST_BOARD = 9;
/** Pool mask for duels on the stocks only (coins 3..7). */
export const STOCK_MASK = 0b1111_1000;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest();

export function loadKeypair(path: string) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))));
}

const fromFile = (path: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
/** Which keys a process may load off the local stack (audits C1, M1): `admin` (setup, deploy, tests: all of them),
 *  `relay` (the sponsor only), `crank` (the crank only). Touching a key the role doesn't hold throws. */
const ROLE = process.env.CLASHY_ROLE ?? 'admin';
const holds = (k: 'admin' | 'crank' | 'sponsor') => IS_LOCAL || ROLE === 'admin' || (ROLE === 'relay' && k === 'sponsor') || (ROLE === 'crank' && k === 'crank');
const noKey = (what: string) => new Proxy({}, { get() { throw new Error(`this process (${ROLE}) holds no ${what} key`); } }) as Keypair;
/** A local test key, made on first use (local stack only). */
function localKey(path: string) {
  const url = new URL(path, import.meta.url);
  if (!existsSync(url)) writeFileSync(url, JSON.stringify([...Keypair.generate().secretKey]), { mode: 0o600 });
  return loadKeypair(path);
}
/** Admin key (config, coins, feeds; on devnet/mainnet also the upgrade authority, ideally a multisig). Off the local
 *  stack: CLASHY_AUTHORITY (a keypair file path; never printed). */
export const authority = !holds('admin') ? noKey('admin')
  : process.env.CLASHY_AUTHORITY ? fromFile(process.env.CLASHY_AUTHORITY)
    : IS_LOCAL ? loadKeypair('../.keys/local-authority.json') : setupRequired('CLASHY_AUTHORITY', 'path to the admin keypair');
/** Price crank: it can only push prices, and it must not be the admin key (audit C1, enforced by the program). Off the
 *  local stack: CLASHY_CRANK (a keypair file path; never printed). Locally: .keys/local-crank.json, made on first use. */
export const crank = !holds('crank') ? noKey('crank')
  : process.env.CLASHY_CRANK ? fromFile(process.env.CLASHY_CRANK)
    : IS_LOCAL ? localKey('../.keys/local-crank.json') : setupRequired('CLASHY_CRANK', 'path to the price-crank keypair (not the admin key)');
/** Pays every fee and rent so players only ever hold USDC. Off the local stack: CLASHY_SPONSOR (keypair file path; never printed). */
export const sponsor = !holds('sponsor') ? noKey('sponsor')
  : process.env.CLASHY_SPONSOR ? fromFile(process.env.CLASHY_SPONSOR)
    : IS_LOCAL ? loadKeypair('../.keys/local-sponsor.json') : setupRequired('CLASHY_SPONSOR', 'path to the fee/rent sponsor keypair');
/** The stake currency. The local fork serves mainnet USDC's address with a local mint authority (scripts/usdc-mint.ts). */
export const USDC_MINT = new PublicKey(process.env.CLASHY_USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC = 1_000_000;
/** Mainnet never gets a test faucet, whatever the environment says. */
export const IS_MAINNET = /mainnet/.test(BASE_HOST) || process.env.CLASHY_NET === 'mainnet';
/** Devnet test-USDC: our own mint (CLASHY_USDC_MINT) whose mint authority is CLASHY_FAUCET (a keypair file path, never
 *  printed). Circle's devnet USDC can't be minted by us, so the public beta uses this one and labels it test money. */
export const faucetAuthority = !IS_LOCAL && !IS_MAINNET && process.env.CLASHY_FAUCET ? fromFile(process.env.CLASHY_FAUCET) : null;
/** Whether this process can hand out test USDC: the local fork, or devnet with the test mint's authority. */
export const TEST_FAUCET = IS_LOCAL || !!faucetAuthority;
export const base = new Connection(BASE_URL, 'confirmed');
export const er = new Connection(ER_URL, 'confirmed');
const wallet = new anchor.Wallet(holds('admin') ? authority : ROLE === 'crank' ? crank : sponsor);
export const baseProgram = new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(base, wallet, { commitment: 'confirmed' }));
export const erProgram = new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(er, wallet, { commitment: 'confirmed' }));
export const programId = baseProgram.programId;

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const le64 = (n: number | bigint) => new BN(n.toString()).toArrayLike(Buffer, 'le', 8);
export const P = {
  config: pda(Buffer.from('config')),
  feed: (coin: number) => pda(Buffer.from('feed'), Buffer.from([coin])),
  auth: pda(Buffer.from('auth')),
  baseFeed: (coin: number) => pda(Buffer.from('bfeed'), Buffer.from([coin])),
  player: (owner: PublicKey) => pda(Buffer.from('player'), owner.toBuffer()),
  duel: (creator: PublicKey, nonce: number | bigint) => pda(Buffer.from('duel'), creator.toBuffer(), le64(nonce)),
  vault: (of: PublicKey) => pda(Buffer.from('vault'), of.toBuffer()),
  clan: (name: string) => pda(Buffer.from('clan'), Buffer.from(name)),
  chest: (clan: PublicKey) => pda(Buffer.from('chest'), clan.toBuffer()),
  member: (clan: PublicKey, wallet: PublicKey) => pda(Buffer.from('member'), clan.toBuffer(), wallet.toBuffer()),
  proposal: (clan: PublicKey, id: number | bigint) => pda(Buffer.from('proposal'), clan.toBuffer(), le64(id)),
  vote: (proposal: PublicKey, wallet: PublicKey) => pda(Buffer.from('vote'), proposal.toBuffer(), wallet.toBuffer()),
  position: (clan: PublicKey, id: number | bigint) => pda(Buffer.from('position'), clan.toBuffer(), le64(id)),
  war: (a: PublicKey, b: PublicKey, nonce: number | bigint) => pda(Buffer.from('war'), a.toBuffer(), b.toBuffer(), le64(nonce)),
  tour: (creator: PublicKey, nonce: number | bigint) => pda(Buffer.from('tour'), creator.toBuffer(), le64(nonce)),
  profile: (owner: PublicKey) => pda(Buffer.from('profile'), owner.toBuffer()),
  handle: (name: string) => pda(Buffer.from('handle'), Buffer.from(name)),
  registry: pda(Buffer.from('registry')),
  stash: (owner: PublicKey) => pda(Buffer.from('stash'), owner.toBuffer()),
  stashVault: (owner: PublicKey) => pda(Buffer.from('stashv'), owner.toBuffer()),
  holding: (owner: PublicKey, mint: PublicKey) => pda(Buffer.from('hold'), owner.toBuffer(), mint.toBuffer()),
  channel: (clan: PublicKey, id: number) => pda(Buffer.from('chan'), clan.toBuffer(), Buffer.from([id])),
  board: (id: number) => pda(Buffer.from('board'), Buffer.from([id])),
};

export async function until<T>(what: string, timeoutMs: number, probe: () => Promise<T | null | undefined | false>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await probe().catch(() => null);
    if (v) return v as T;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(800);
  }
}

/** Live price from Coinbase Exchange, scaled to 6 decimals. Throws on any API failure. */
export async function coinbasePrice(product: string): Promise<bigint> {
  const r = await fetch(`https://api.exchange.coinbase.com/products/${product}/ticker`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Coinbase ${product} answered HTTP ${r.status}`);
  const j = (await r.json()) as { price: string };
  const [i, f = ''] = j.price.split('.');
  return BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
}

const scale6 = (price: string | number) => {
  const [i, f = ''] = String(typeof price === 'number' ? price.toFixed(6) : price).split('.');
  return BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
};

/** Live USD prices of tokens on Solana from Jupiter's price API (one request for all mints). Throws on any gap.
 *  Jupiter's free API is rate-limited, so a reading is reused for 5 s; on a 429 the last reading is used while it
 *  is under 30 s old, and after that the error is thrown (stale prices are never pushed as fresh). */
let jupCache: { at: number; key: string; px: Map<string, bigint> } | null = null;
export async function jupiterPrices(mints: string[]): Promise<Map<string, bigint>> {
  const key = mints.join(',');
  if (jupCache && jupCache.key === key && Date.now() - jupCache.at < 5_000) return jupCache.px;
  try {
    const px = await fetchJupiterPrices(mints);
    jupCache = { at: Date.now(), key, px };
    return px;
  } catch (e) {
    if (jupCache && jupCache.key === key && Date.now() - jupCache.at < 30_000 && /429/.test((e as Error).message)) return jupCache.px;
    throw e;
  }
}
async function fetchJupiterPrices(mints: string[]): Promise<Map<string, bigint>> {
  const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Jupiter price API answered HTTP ${r.status}`);
  const j = (await r.json()) as Record<string, { usdPrice?: number }>;
  const out = new Map<string, bigint>();
  for (const m of mints) {
    const p = j[m]?.usdPrice;
    if (!p || !(p > 0)) throw new Error(`Jupiter has no price for ${m}`);
    out.set(m, scale6(p));
  }
  return out;
}

/** Live prices for every config coin, in config order. */
export async function livePrices(): Promise<bigint[]> {
  const mints = COINS.filter((c) => c.mint).map((c) => c.mint!);
  const [jup, ...cb] = await Promise.all([mints.length ? jupiterPrices(mints) : Promise.resolve(new Map()), ...COINS.filter((c) => c.product).map((c) => coinbasePrice(c.product!))]);
  let k = 0;
  return COINS.map((c) => (c.mint ? (jup as Map<string, bigint>).get(c.mint)! : (cb[k++] as bigint)));
}

export async function fundedKeypair(sol = 20) {
  const kp = Keypair.generate();
  const sig = await base.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await base.confirmTransaction(sig, 'confirmed');
  return kp;
}

export const usdcAta = (owner: PublicKey) => getAssociatedTokenAddressSync(USDC_MINT, owner, true);
/** Token balance of any SPL token account (0 when it does not exist). */
export async function tokenBalance(account: PublicKey): Promise<number> {
  const info = await base.getAccountInfo(account, 'confirmed');
  return info ? Number(info.data.readBigUInt64LE(64)) : 0;
}
export const usdcOf = (owner: PublicKey) => tokenBalance(usdcAta(owner));

/** Local fork only: mints test USDC (the local mint authority is the local admin key). The sponsor pays the account rent. */
export async function giveUsdc(owner: PublicKey, amount: number) {
  if (!TEST_FAUCET) throw new Error(`Setup required: test USDC is minted only on the local fork or on devnet with CLASHY_FAUCET (the test mint's authority), not ${BASE_URL}`);
  const ata = await createAssociatedTokenAccountIdempotent(base, sponsor, USDC_MINT, owner, { commitment: 'confirmed' });
  await mintTo(base, sponsor, USDC_MINT, ata, IS_LOCAL ? authority : faucetAuthority!, amount, [], { commitment: 'confirmed' });
  return ata;
}

/** A player holding only USDC: never airdropped a lamport, so every fee and rent must come from the sponsor. */
export async function usdcPlayer(amount = 100 * USDC) {
  const kp = Keypair.generate();
  await giveUsdc(kp.publicKey, amount);
  return kp;
}

const isSigner = (tx: Transaction, pk: PublicKey) => tx.instructions.some((ix) => ix.keys.some((k) => k.isSigner && k.pubkey.equals(pk)));
/** Signs with the fee payer and with each of `extra` the transaction actually needs. */
function signNeeded(tx: Transaction, payer: Keypair, extra: Keypair[]) {
  tx.partialSign(payer);
  for (const k of extra) if (!k.publicKey.equals(payer.publicKey) && isSigner(tx, k.publicKey)) tx.partialSign(k);
}
/** The sponsor is the fee payer; the player signs for what is theirs (their stake, their picks). */
const sponsoredWallet = (kp?: Keypair) => ({
  // getters: a crank process holds no sponsor key, and only touches this wallet if it tries to sponsor something
  get publicKey() { return sponsor.publicKey; },
  get payer() { return sponsor; },
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
    if (tx instanceof VersionedTransaction) throw new Error('versioned transactions are not used here');
    signNeeded(tx as Transaction, sponsor, kp ? [kp] : []);
    return tx;
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => { for (const t of txs) signNeeded(t as Transaction, sponsor, kp ? [kp] : []); return txs; },
});
export const programFor = (kp: Keypair, onEr = false) =>
  new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(onEr ? er : base, sponsoredWallet(kp) as unknown as anchor.Wallet, { commitment: 'confirmed' }));
/** Permissionless instructions (settle, resolve): only the sponsor signs. */
export const sponsorProgram = holds('sponsor')
  ? new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(base, sponsoredWallet() as unknown as anchor.Wallet, { commitment: 'confirmed' }))
  : (noKey('sponsor') as unknown as Program<Clashy>); // a crank process holds no sponsor key (audit C1)

/** Waits until a delegated account is back on Solana and owned by the program again. */
export async function waitHome(account: PublicKey, timeoutMs = 60_000) {
  return until(`${account.toBase58().slice(0, 8)} back on Solana`, timeoutMs, async () => {
    const info = await base.getAccountInfo(account, 'confirmed');
    return info?.owner.equals(programId) ? info : null;
  });
}

/** MagicBlock session keys (gpl_session, KeyspM2…): `owner` signs once to let a fresh session key act for them in Clashy
 *  for `secs`; the sponsor pays the token's rent. Returns the session key and its token. */
export const SESSION_PROGRAM = new PublicKey('KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5');
export async function createSession(owner: Keypair, secs = 3600) {
  const signer = Keypair.generate();
  const [token] = PublicKey.findProgramAddressSync([Buffer.from('session_token_v2'), programId.toBuffer(), signer.publicKey.toBuffer(), owner.publicKey.toBuffer()], SESSION_PROGRAM);
  const disc = createHash('sha256').update('global:create_session_v2').digest().subarray(0, 8);
  const validUntil = Buffer.alloc(8); validUntil.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + secs));
  const data = Buffer.concat([disc, Buffer.from([0]), Buffer.from([1]), validUntil, Buffer.from([0])]); // top_up None, valid_until Some, lamports None
  const ix = new TransactionInstruction({
    programId: SESSION_PROGRAM,
    keys: [
      { pubkey: token, isSigner: false, isWritable: true },
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: sponsor.publicKey, isSigner: true, isWritable: true },
      { pubkey: owner.publicKey, isSigner: true, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  await sendAndConfirmTransaction(base, new Transaction().add(ix), [sponsor, signer, owner], { commitment: 'confirmed' });
  return { signer, token };
}

/** A finished game comes home with a settlement Magic Action: MagicBlock runs settle_duel / settle_tournament on
 *  Solana right after the undelegation. Waits for that, and only if it never lands (actions are not atomic) settles by
 *  hand with `manual`. Returns who settled it. */
export async function settledByAction(account: PublicKey, kind: 'duel' | 'tournament', manual: () => Promise<unknown>, waitMs = 30_000): Promise<'magic action' | 'by hand'> {
  const done = kind === 'duel' ? 5 : 3;
  const ok = await until(`${kind} settled by the Magic Action`, waitMs, async () => {
    const info = await base.getAccountInfo(account, 'confirmed');
    if (!info?.owner.equals(programId)) return null;
    return baseProgram.coder.accounts.decode(kind, info.data).status === done ? true : null;
  }).catch(() => false);
  if (ok) return 'magic action';
  await manual();
  return 'by hand';
}

/** Sends on the rollup and polls for the result: its websocket confirmations are slow or absent,
 *  so Anchor's `.rpc()` would hang. Throws with the program logs when the transaction fails. */
export async function sendEr(builder: { transaction(): Promise<Transaction> }, signer?: Keypair, feePayer: Keypair = sponsor): Promise<string> {
  const tx = await builder.transaction();
  tx.feePayer = feePayer.publicKey;
  tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
  signNeeded(tx, feePayer, signer ? [signer] : []);
  let sig: string;
  try {
    sig = await er.sendRawTransaction(tx.serialize());
  } catch (e) {
    const x = e as { logs?: string[]; getLogs?: (c: Connection) => Promise<string[]> };
    const logs = x.logs?.length ? x.logs : ((await x.getLogs?.(er).catch(() => [])) ?? []);
    throw new Error(`rollup rejected the transaction: ${(e as Error).message}\n${logs.join('\n')}`);
  }
  const status = await until(`rollup confirmation of ${sig.slice(0, 10)}`, 30_000, async () => {
    const [st] = (await er.getSignatureStatuses([sig])).value;
    return st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') ? st : null;
  });
  if (status.err) {
    const landed = await er.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    throw new Error(`rollup transaction failed ${JSON.stringify(status.err)}\n${(landed?.meta?.logMessages ?? []).join('\n')}`);
  }
  return sig;
}

/** Idempotent setup: config (no VRF on the local stack), three Clashy feeds with live prices, delegated to the ER. */
export async function ensureSetup(treasuryOwner: PublicKey) {
  const cfg = await base.getAccountInfo(P.config);
  if (!cfg) {
    // the rake lands in the treasury owner's USDC account
    const treasury = await createAssociatedTokenAccountIdempotent(base, authority, USDC_MINT, treasuryOwner, { commitment: 'confirmed' });
    // off the local stack every coin is rolled by MagicBlock VRF; the commit-reveal fallback is refused
    await baseProgram.methods.initialize(300, !IS_LOCAL, crank.publicKey, treasury).accountsPartial({ authority: authority.publicKey, usdcMint: USDC_MINT }).rpc();
  }
  // the crank is its own key (audit C1): move an older config whose crank was the admin key onto it
  const cur = await baseProgram.account.config.fetch(P.config);
  if (!cur.crank.equals(crank.publicKey)) {
    await baseProgram.methods.updateConfig(cur.rakeBps, cur.vrfRequired, crank.publicKey, cur.treasury).accountsPartial({ authority: authority.publicKey }).rpc();
  }
  if (IS_LOCAL && (await base.getBalance(crank.publicKey)) < LAMPORTS_PER_SOL) {
    await base.confirmTransaction(await base.requestAirdrop(crank.publicKey, 5 * LAMPORTS_PER_SOL), 'confirmed');
  }
  // local stack: coin rolls go to MagicBlock's test queue, which their local vrf-oracle answers;
  // devnet and mainnet keep the base queue that initialize sets
  if (!(await baseProgram.account.config.fetch(P.config)).erValidator.equals(LOCAL_ER_VALIDATOR)) {
    await baseProgram.methods.setErValidator(LOCAL_ER_VALIDATOR).accountsPartial({ authority: authority.publicKey }).rpc();
  }
  const queue = IS_LOCAL ? LOCAL_VRF_QUEUE : BASE_VRF_QUEUE;
  if (!(await baseProgram.account.config.fetch(P.config)).vrfQueue.equals(queue)) {
    await baseProgram.methods.setVrfQueue().accountsPartial({ authority: authority.publicKey, queue }).rpc();
  }
  const startPx = await livePrices();
  for (let i = 0; i < COINS.length; i++) {
    const feed = P.feed(i);
    let info = await base.getAccountInfo(feed);
    if (!info) {
      await baseProgram.methods.initFeed(i).accountsPartial({ authority: authority.publicKey, feed }).rpc();
      const sym = Buffer.alloc(8);
      sym.write(COINS[i].symbol);
      await baseProgram.methods.setCoin(i, feed, [...sym]).accountsPartial({ authority: authority.publicKey }).rpc();
      info = await base.getAccountInfo(feed);
    }
    if (info!.owner.equals(programId)) {
      await baseProgram.methods.pushPrice(new BN(startPx[i].toString())).accountsPartial({ crank: crank.publicKey, feed }).signers([crank]).rpc();
      await baseProgram.methods.delegateFeed(i).accountsPartial({ authority: authority.publicKey, feed }).remainingAccounts([{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }]).rpc();
    }
  }
  // never-delegated Solana copies for Solana-side reads (clan trades)
  for (let i = 0; i < COINS.length; i++) {
    if (!(await base.getAccountInfo(P.baseFeed(i)))) {
      await baseProgram.methods.initBaseFeed(i).accountsPartial({ authority: authority.publicKey, feed: P.baseFeed(i) }).rpc();
    }
  }
  await pushBasePrices();
  // boards live on the rollup: the app's public calls feed, and a separate one end-to-end tests post to
  for (const id of [FEED_BOARD, TEST_BOARD]) {
    if (!(await base.getAccountInfo(P.board(id)))) {
      await baseProgram.methods.openBoard(id).accountsPartial({ authority: authority.publicKey, board: P.board(id) }).rpc();
    }
    if ((await base.getAccountInfo(P.board(id)))!.owner.equals(programId)) {
      await baseProgram.methods.delegateBoard(id).accountsPartial({ authority: authority.publicKey, board: P.board(id) }).remainingAccounts([{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }]).rpc();
    }
  }
  // the rollup clones delegated feeds on first use
  for (let i = 0; i < COINS.length; i++) await until(`feed ${i} on the rollup`, 30_000, () => er.getAccountInfo(P.feed(i)));
  await until('the calls board on the rollup', 30_000, () => er.getAccountInfo(P.board(FEED_BOARD)));
  await until('the test board on the rollup', 30_000, () => er.getAccountInfo(P.board(TEST_BOARD)));
  return (await baseProgram.account.config.fetch(P.config));
}

/** Crank: pushes live Coinbase prices into the delegated feeds on the rollup. Returns the prices pushed. */
export async function pushPrices(): Promise<bigint[]> {
  const prices = await livePrices();
  await Promise.all(prices.map((p, i) => sendEr(erProgram.methods.pushPrice(new BN(p.toString())).accountsPartial({ crank: crank.publicKey, feed: P.feed(i) }), crank, crank)));
  return prices;
}

/** Crank: writes live prices into the Solana-side base feeds, all coins in one transaction. */
export async function pushBasePrices(prices?: bigint[]): Promise<bigint[]> {
  const px = prices ?? (await livePrices());
  const ixs = await Promise.all(px.map((p, i) => baseProgram.methods.pushBasePrice(new BN(p.toString())).accountsPartial({ crank: crank.publicKey, feed: P.baseFeed(i) }).instruction()));
  const tx = new Transaction().add(...ixs);
  await sendAndConfirmTransaction(base, tx, [crank], { commitment: 'confirmed' });
  return px;
}

/** Keeps the crank pushing live prices every second until stop() is called. */
export function runCrank() {
  let on = true;
  let last: bigint[] = [];
  const loop = (async () => {
    while (on) {
      try { last = await pushPrices(); } catch (e) { console.error('crank:', (e as Error).message); }
      await sleep(1000);
    }
  })();
  return { stop: async () => { on = false; await loop; }, last: () => last };
}

export const lamports = (pk: PublicKey) => base.getBalance(pk, 'confirmed');
export const randomSeed = () => randomBytes(32);

/** Rolls a matched duel's coin the way this deployment allows: MagicBlock VRF where VRF is required (devnet, mainnet),
 *  otherwise the two players' commit-reveal. `progOf` returns the program signed by that player. */
export async function rollDuel(duel: PublicKey, a: Keypair, b: Keypair, seedA: Buffer, seedB: Buffer, progOf: (k: Keypair) => Program<Clashy>) {
  const cfg = await baseProgram.account.config.fetch(P.config);
  if (cfg.vrfRequired) {
    await progOf(b).methods.requestCoinRoll([...randomSeed()]).accountsPartial({ player: b.publicKey, payer: sponsor.publicKey, duel, oracleQueue: cfg.vrfQueue }).rpc();
    await until('MagicBlock VRF callback', 90_000, async () => ((await baseProgram.account.duel.fetch(duel)).status === 2 ? true : null));
  } else {
    await progOf(a).methods.revealSeed([...seedA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
    await progOf(b).methods.revealSeed([...seedB]).accountsPartial({ signer: b.publicKey, duel }).rpc();
  }
  return cfg.vrfRequired;
}
export { BN, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction };
