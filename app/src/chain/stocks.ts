// Tokenized stocks (xStocks) the Stash can buy: real mainnet mints and their Orca Whirlpool USDC pools.
// On the local fork they are a mainnet snapshot (chain/scripts/fork-stocks.ts); on mainnet the same accounts are live.
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import data from './stocks.json';
import { base, USDC_MINT } from './client';

export type Stock = { symbol: string; name: string; mint: string; pool: string; vaultA: string; vaultB: string; tickSpacing: number; stockIsA: boolean; coin: number };
export const STOCKS = data.stocks as Stock[];
export const STOCK_SNAPSHOT = data.snapshotAt;
export const stockByMint = (mint: string) => STOCKS.find((s) => s.mint === mint);
export const stockBySymbol = (sym: string) => STOCKS.find((s) => s.symbol === sym);

export const WHIRLPOOL = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
export const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
/** xStocks have 8 decimals. */
export const SHARE = 100_000_000;

export const stockAta = (owner: PublicKey, s: Stock) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_2022.toBuffer(), new PublicKey(s.mint).toBuffer()], ATA_PROGRAM)[0];

/** Create-idempotent the player's Token-2022 account for a stock; the sponsor pays the rent. */
export const createStockAtaIx = (payer: PublicKey, owner: PublicKey, s: Stock) => new TransactionInstruction({
  programId: ATA_PROGRAM,
  keys: [
    { pubkey: payer, isSigner: true, isWritable: true }, { pubkey: stockAta(owner, s), isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false }, { pubkey: new PublicKey(s.mint), isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([1]),
});

/** Current tick and the pool price of one share in USDC. */
export async function poolState(s: Stock) {
  const info = await base.getAccountInfo(new PublicKey(s.pool), 'confirmed');
  if (!info) throw new Error(`${s.symbol}'s pool is not on this network`);
  const d = info.data;
  const sqrt = d.readBigUInt64LE(65) + (d.readBigUInt64LE(73) << 64n);
  const tick = d.readInt32LE(81);
  const p = Number(sqrt) / 2 ** 64;
  const bPerA = p * p; // raw B per raw A
  const usdcPerRawShare = s.stockIsA ? bPerA : 1 / bPerA;
  return { tick, usdcPerRawShare, price: (usdcPerRawShare * SHARE) / 1_000_000 };
}

const tickArray = (pool: PublicKey, start: number) =>
  PublicKey.findProgramAddressSync([Buffer.from('tick_array'), pool.toBuffer(), Buffer.from(String(start))], WHIRLPOOL)[0];

/** The accounts Clashy's stash_invest / stash_sell pass to Whirlpool's swap_v2. */
export async function swapAccounts(owner: PublicKey, s: Stock, buying: boolean) {
  const pool = new PublicKey(s.pool);
  const { tick } = await poolState(s);
  const span = 88 * s.tickSpacing;
  const start = Math.floor(tick / span) * span;
  const up = s.stockIsA ? buying : !buying;
  const step = up ? span : -span;
  return {
    whirlpool: pool, stockMint: new PublicKey(s.mint), usdcMint: USDC_MINT, ownerStock: stockAta(owner, s),
    vaultA: new PublicKey(s.vaultA), vaultB: new PublicKey(s.vaultB),
    tickArray0: tickArray(pool, start), tickArray1: tickArray(pool, start + step), tickArray2: tickArray(pool, start + 2 * step),
    oracle: PublicKey.findProgramAddressSync([Buffer.from('oracle'), pool.toBuffer()], WHIRLPOOL)[0],
    tokenProgram: TOKEN_PROGRAM, token2022Program: TOKEN_2022, memoProgram: MEMO, whirlpoolProgram: WHIRLPOOL,
  };
}

/** Least shares to accept for `usdcRaw`, allowing 3% for the pool fee and price impact. */
export async function minSharesFor(s: Stock, usdcRaw: number, slipBps = 300) {
  const { usdcPerRawShare } = await poolState(s);
  return Math.floor((usdcRaw / usdcPerRawShare) * (1 - slipBps / 10_000));
}
export async function minUsdcFor(s: Stock, sharesRaw: number, slipBps = 300) {
  const { usdcPerRawShare } = await poolState(s);
  return Math.floor(sharesRaw * usdcPerRawShare * (1 - slipBps / 10_000));
}
