// Shared harness for the Clashy end-to-end tests against the local MagicBlock stack
// (scripts/localnet.sh): base layer :8999, Ephemeral Rollup :7799.
// Prices are real: the crank reads Coinbase Exchange's public ticker (SOL, BTC, ETH) and Jupiter's price API
// (tokenized stocks: the xStocks themselves, which trade on Solana around the clock) and pushes them on chain.
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotent, getAssociatedTokenAddressSync, mintTo } from '@solana/spl-token';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Clashy } from '../target/types/clashy.ts';

const idl = JSON.parse(readFileSync(new URL('../target/idl/clashy.json', import.meta.url), 'utf8'));
export const BASE_URL = process.env.CLASHY_BASE ?? 'http://127.0.0.1:8999';
export const ER_URL = process.env.CLASHY_ER ?? 'http://127.0.0.1:7799';
/** Local stack (tests, app development) unless CLASHY_BASE points at devnet or mainnet. */
export const IS_LOCAL = /127\.0\.0\.1|localhost/.test(BASE_URL);
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

/** Admin + crank key. Off the local stack it must come from CLASHY_AUTHORITY (a keypair file path; never printed). */
export const authority = process.env.CLASHY_AUTHORITY
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.CLASHY_AUTHORITY, 'utf8'))))
  : IS_LOCAL ? loadKeypair('../.keys/local-authority.json') : setupRequired('CLASHY_AUTHORITY', 'path to the admin/crank keypair');
/** Pays every fee and rent so players only ever hold USDC. Off the local stack: CLASHY_SPONSOR (keypair file path; never printed). */
export const sponsor = process.env.CLASHY_SPONSOR
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.CLASHY_SPONSOR, 'utf8'))))
  : IS_LOCAL ? loadKeypair('../.keys/local-sponsor.json') : setupRequired('CLASHY_SPONSOR', 'path to the fee/rent sponsor keypair');
/** The stake currency. The local fork serves mainnet USDC's address with a local mint authority (scripts/usdc-mint.ts). */
export const USDC_MINT = new PublicKey(process.env.CLASHY_USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC = 1_000_000;
export const base = new Connection(BASE_URL, 'confirmed');
export const er = new Connection(ER_URL, 'confirmed');
const wallet = new anchor.Wallet(authority);
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
  if (!IS_LOCAL) throw new Error(`Setup required: test USDC can only be minted on the local fork, not ${BASE_URL}`);
  const ata = await createAssociatedTokenAccountIdempotent(base, sponsor, USDC_MINT, owner, { commitment: 'confirmed' });
  await mintTo(base, sponsor, USDC_MINT, ata, authority, amount, [], { commitment: 'confirmed' });
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
  publicKey: sponsor.publicKey,
  payer: sponsor,
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
export const sponsorProgram = new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(base, sponsoredWallet() as unknown as anchor.Wallet, { commitment: 'confirmed' }));

/** Waits until a delegated account is back on Solana and owned by the program again. */
export async function waitHome(account: PublicKey, timeoutMs = 60_000) {
  return until(`${account.toBase58().slice(0, 8)} back on Solana`, timeoutMs, async () => {
    const info = await base.getAccountInfo(account, 'confirmed');
    return info?.owner.equals(programId) ? info : null;
  });
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
    await baseProgram.methods.initialize(300, !IS_LOCAL, authority.publicKey, treasury).accountsPartial({ authority: authority.publicKey, usdcMint: USDC_MINT }).rpc();
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
      await baseProgram.methods.pushPrice(new BN(startPx[i].toString())).accountsPartial({ crank: authority.publicKey, feed }).rpc();
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
  await Promise.all(prices.map((p, i) => sendEr(erProgram.methods.pushPrice(new BN(p.toString())).accountsPartial({ crank: authority.publicKey, feed: P.feed(i) }), authority, authority)));
  return prices;
}

/** Crank: writes live prices into the Solana-side base feeds, all coins in one transaction. */
export async function pushBasePrices(prices?: bigint[]): Promise<bigint[]> {
  const px = prices ?? (await livePrices());
  const ixs = await Promise.all(px.map((p, i) => baseProgram.methods.pushBasePrice(new BN(p.toString())).accountsPartial({ crank: authority.publicKey, feed: P.baseFeed(i) }).instruction()));
  const tx = new Transaction().add(...ixs);
  await sendAndConfirmTransaction(base, tx, [authority], { commitment: 'confirmed' });
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
export { BN, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction };
