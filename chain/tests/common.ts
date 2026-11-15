// Shared harness for the Clashy end-to-end tests against the local MagicBlock stack
// (scripts/localnet.sh): base layer :8999, Ephemeral Rollup :7799.
// Prices are real: the crank reads Coinbase Exchange's public ticker and pushes it on chain.
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Clashy } from '../target/types/clashy.ts';

const idl = JSON.parse(readFileSync(new URL('../target/idl/clashy.json', import.meta.url), 'utf8'));
export const BASE_URL = process.env.CLASHY_BASE ?? 'http://127.0.0.1:8999';
export const ER_URL = process.env.CLASHY_ER ?? 'http://127.0.0.1:7799';
export const LOCAL_ER_VALIDATOR = new PublicKey('mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev');
export const PRICE_SCALE = 1_000_000;
export const COINS = [
  { symbol: 'SOL', product: 'SOL-USD' },
  { symbol: 'BTC', product: 'BTC-USD' },
  { symbol: 'ETH', product: 'ETH-USD' },
];

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest();

export function loadKeypair(path: string) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))));
}

export const authority = loadKeypair('../.keys/local-authority.json');
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

export async function fundedKeypair(sol = 20) {
  const kp = Keypair.generate();
  const sig = await base.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await base.confirmTransaction(sig, 'confirmed');
  return kp;
}

export const programFor = (kp: Keypair, onEr = false) =>
  new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(onEr ? er : base, new anchor.Wallet(kp), { commitment: 'confirmed' }));

/** Waits until a delegated account is back on Solana and owned by the program again. */
export async function waitHome(account: PublicKey, timeoutMs = 60_000) {
  return until(`${account.toBase58().slice(0, 8)} back on Solana`, timeoutMs, async () => {
    const info = await base.getAccountInfo(account, 'confirmed');
    return info?.owner.equals(programId) ? info : null;
  });
}

/** Idempotent setup: config (no VRF on the local stack), three Clashy feeds with live prices, delegated to the ER. */
export async function ensureSetup(treasury: PublicKey) {
  const cfg = await base.getAccountInfo(P.config);
  if (!cfg) {
    await baseProgram.methods.initialize(300, false, authority.publicKey, treasury).accountsPartial({ authority: authority.publicKey }).rpc();
  }
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
      await baseProgram.methods.pushPrice(new BN((await coinbasePrice(COINS[i].product)).toString())).accountsPartial({ crank: authority.publicKey, feed }).rpc();
      await baseProgram.methods.delegateFeed(i).accountsPartial({ authority: authority.publicKey, feed }).remainingAccounts([{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }]).rpc();
    }
  }
  // the rollup clones delegated feeds on first use
  for (let i = 0; i < COINS.length; i++) await until(`feed ${i} on the rollup`, 30_000, () => er.getAccountInfo(P.feed(i)));
  return (await baseProgram.account.config.fetch(P.config));
}

/** Crank: pushes live Coinbase prices into the delegated feeds on the rollup. Returns the prices pushed. */
export async function pushPrices(): Promise<bigint[]> {
  const prices = await Promise.all(COINS.map((c) => coinbasePrice(c.product)));
  await Promise.all(prices.map((p, i) => erProgram.methods.pushPrice(new BN(p.toString())).accountsPartial({ crank: authority.publicKey, feed: P.feed(i) }).rpc()));
  return prices;
}

/** Crank: commits the feeds to Solana and waits until the base copies are fresh. */
export async function commitFeeds() {
  const before = await Promise.all(COINS.map((_, i) => baseProgram.account.priceFeed.fetch(P.feed(i)).catch(() => null)));
  await pushPrices();
  for (let i = 0; i < COINS.length; i++) await erProgram.methods.commitFeed().accountsPartial({ crank: authority.publicKey, feed: P.feed(i) }).rpc();
  for (let i = 0; i < COINS.length; i++) {
    await until(`feed ${i} committed to Solana`, 60_000, async () => {
      const info = await base.getAccountInfo(P.feed(i));
      if (!info) return null;
      const f = baseProgram.coder.accounts.decode('priceFeed', info.data);
      return f.updatedAt.toNumber() > (before[i]?.updatedAt.toNumber() ?? 0) ? f : null;
    });
  }
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
