// Tokenized stocks on the local mainnet fork: the xStocks and their Orca Whirlpool USDC pools that
// scripts/fork-stocks.ts snapshotted. Builds the accounts Clashy's `stash_invest` / `stash_sell` pass to
// Whirlpool's swap_v2, and reads the pool's live price for a slippage floor.
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';

export const WHIRLPOOL = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
export const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
type Stock = { symbol: string; name: string; mint: string; pool: string; vaultA: string; vaultB: string; tickSpacing: number; stockIsA: boolean };
const fork = JSON.parse(readFileSync(new URL('../.localnet/fork/stocks.json', import.meta.url), 'utf8')) as { stocks: Stock[]; snapshotAt: string };
export const STOCKS = fork.stocks;
export const stock = (symbol: string) => {
  const s = STOCKS.find((x) => x.symbol === symbol);
  if (!s) throw new Error(`unknown stock ${symbol}`);
  return s;
};

const tickArray = (pool: PublicKey, start: number) =>
  PublicKey.findProgramAddressSync([Buffer.from('tick_array'), pool.toBuffer(), Buffer.from(String(start))], WHIRLPOOL)[0];
const oracle = (pool: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('oracle'), pool.toBuffer()], WHIRLPOOL)[0];

/** Live pool state: current tick and the price of one raw stock unit in raw USDC units. */
export async function poolState(conn: Connection, s: Stock) {
  const info = await conn.getAccountInfo(new PublicKey(s.pool), 'confirmed');
  if (!info) throw new Error(`${s.symbol} pool ${s.pool} is not on this cluster`);
  const d = info.data;
  const sqrt = d.readBigUInt64LE(65) + (d.readBigUInt64LE(73) << 64n);
  const tick = d.readInt32LE(65 + 16);
  const p = Number(sqrt) / 2 ** 64;
  const bPerA = p * p; // raw B per raw A
  return { tick, usdcPerShareRaw: s.stockIsA ? bPerA : 1 / bPerA };
}

export const stockAta = (owner: PublicKey, s: Stock) => getAssociatedTokenAddressSync(new PublicKey(s.mint), owner, false, TOKEN_2022_PROGRAM_ID);
export const createStockAtaIx = (payer: PublicKey, owner: PublicKey, s: Stock) =>
  createAssociatedTokenAccountIdempotentInstruction(payer, stockAta(owner, s), owner, new PublicKey(s.mint), TOKEN_2022_PROGRAM_ID);

/** The `sw` accounts for one swap. Buying moves the price up (USDC in), selling moves it down. */
export async function swapAccounts(conn: Connection, owner: PublicKey, usdcMint: PublicKey, s: Stock, buying: boolean) {
  const pool = new PublicKey(s.pool);
  const { tick } = await poolState(conn, s);
  const span = 88 * s.tickSpacing;
  const start = Math.floor(tick / span) * span;
  // a_to_b lowers the price; buying the stock when it is token A is b_to_a (price up)
  const up = s.stockIsA ? buying : !buying;
  const step = up ? span : -span;
  return {
    whirlpool: pool, stockMint: new PublicKey(s.mint), usdcMint, ownerStock: stockAta(owner, s),
    vaultA: new PublicKey(s.vaultA), vaultB: new PublicKey(s.vaultB),
    tickArray0: tickArray(pool, start), tickArray1: tickArray(pool, start + step), tickArray2: tickArray(pool, start + 2 * step),
    oracle: oracle(pool), tokenProgram: TOKEN_PROGRAM_ID, token2022Program: TOKEN_2022_PROGRAM_ID, memoProgram: MEMO, whirlpoolProgram: WHIRLPOOL,
  };
}

/** Minimum shares for `usdcRaw` at the pool price, allowing `slipBps` for fees and price impact. */
export async function minShares(conn: Connection, s: Stock, usdcRaw: bigint, slipBps = 300) {
  const { usdcPerShareRaw } = await poolState(conn, s);
  return BigInt(Math.floor((Number(usdcRaw) / usdcPerShareRaw) * (1 - slipBps / 10_000)));
}
export async function minUsdc(conn: Connection, s: Stock, sharesRaw: bigint, slipBps = 300) {
  const { usdcPerShareRaw } = await poolState(conn, s);
  return BigInt(Math.floor(Number(sharesRaw) * usdcPerShareRaw * (1 - slipBps / 10_000)));
}
