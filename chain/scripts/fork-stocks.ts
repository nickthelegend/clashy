// Snapshots what Clashy's Stash needs to buy real tokenized stocks (xStocks) on the local mainnet fork:
// the xStock mints, their USDC pools on Orca Whirlpool (pool, vaults, tick arrays around the live price, config,
// token badges), the Whirlpool program and the Token-2022 program, all read from Solana mainnet as they are now.
// scripts/localnet.sh loads them into the base validator at genesis, so a swap on the fork runs the real programs
// against real pool state (frozen at the snapshot; nobody else trades on the fork).
//
//   npx tsx scripts/fork-stocks.ts            # writes .localnet/fork/{accounts/*.json,programs/*.so,stocks.json}
//
// Reads only public mainnet data. Fails loudly if anything is missing; never invents an account.
import { Connection, PublicKey } from '@solana/web3.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAINNET = process.env.CLASHY_MAINNET_RPC ?? 'https://api.mainnet-beta.solana.com';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '.localnet', 'fork');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const WHIRLPOOL = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
export const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/** The five xStocks with the deepest USDC pools on Orca Whirlpool (checked against Jupiter's router on Nov 17 2026). */
export const STOCKS = [
  { symbol: 'NVDA', name: 'NVIDIA', mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', pool: '6R4r93V5fcMzc13CL2enEepDSYcr4Qx3ptZBDwudTXCo' },
  { symbol: 'TSLA', name: 'Tesla', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', pool: '9p7abUFv31ycgu9kckvnoqMMvBy67dqTDM2m6HP9xokN' },
  { symbol: 'AAPL', name: 'Apple', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', pool: 'Djdm88bGU5NLHvMEWCZqsbLGd28vL8KeS2mxejTnPzoW' },
  { symbol: 'SPY', name: 'S&P 500', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', pool: 'gef4pD5g6GJSjX7hfXKUfhCVpE89BzX9TXnXJNW6kSt' },
  { symbol: 'GOOGL', name: 'Alphabet', mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', pool: 'GxgCVoHKS4yWz2DqYML2vgXDLVHCwGSy76MMjbKejnZk' },
];

/** Whirlpool account layout (orca-so/whirlpools, programs/whirlpool/src/state/whirlpool.rs). */
export function decodeWhirlpool(d: Buffer) {
  let o = 8;
  const config = new PublicKey(d.subarray(o, o + 32)); o += 32;
  o += 1; // bump
  const tickSpacing = d.readUInt16LE(o); o += 2;
  o += 2 + 2 + 2; // fee tier seed, fee rate, protocol fee rate
  o += 16; // liquidity
  o += 16; // sqrt price
  const tick = d.readInt32LE(o); o += 4;
  o += 8 + 8; // protocol fees owed
  const mintA = new PublicKey(d.subarray(o, o + 32)); o += 32;
  const vaultA = new PublicKey(d.subarray(o, o + 32)); o += 32;
  o += 16;
  const mintB = new PublicKey(d.subarray(o, o + 32)); o += 32;
  const vaultB = new PublicKey(d.subarray(o, o + 32)); o += 32;
  return { config, tickSpacing, tick, mintA, vaultA, mintB, vaultB };
}

export const TICK_ARRAY_SIZE = 88;
export function tickArrayStart(tick: number, spacing: number, offset = 0) {
  const span = TICK_ARRAY_SIZE * spacing;
  return (Math.floor(tick / span) + offset) * span;
}
export const tickArrayPda = (pool: PublicKey, start: number) =>
  PublicKey.findProgramAddressSync([Buffer.from('tick_array'), pool.toBuffer(), Buffer.from(String(start))], WHIRLPOOL)[0];
export const oraclePda = (pool: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('oracle'), pool.toBuffer()], WHIRLPOOL)[0];
export const tokenBadgePda = (config: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('token_badge'), config.toBuffer(), mint.toBuffer()], WHIRLPOOL)[0];

async function main() {
  const conn = new Connection(MAINNET, 'confirmed');
  mkdirSync(join(OUT, 'accounts'), { recursive: true });
  mkdirSync(join(OUT, 'programs'), { recursive: true });
  const want = new Map<string, string>(); // address -> why
  const pools: Record<string, unknown>[] = [];

  const poolInfos = await conn.getMultipleAccountsInfo(STOCKS.map((s) => new PublicKey(s.pool)));
  for (const [i, s] of STOCKS.entries()) {
    const info = poolInfos[i];
    if (!info || !info.owner.equals(WHIRLPOOL)) throw new Error(`${s.symbol}: pool ${s.pool} is not a Whirlpool on mainnet`);
    const w = decodeWhirlpool(info.data);
    const stockIsA = w.mintA.toBase58() === s.mint;
    if (!(stockIsA ? w.mintB.equals(USDC) : w.mintA.equals(USDC) && w.mintB.toBase58() === s.mint)) {
      throw new Error(`${s.symbol}: pool ${s.pool} is not ${s.symbol}/USDC`);
    }
    const pool = new PublicKey(s.pool);
    want.set(s.pool, `${s.symbol} pool`);
    want.set(s.mint, `${s.symbol} mint`);
    want.set(w.vaultA.toBase58(), `${s.symbol} vault A`);
    want.set(w.vaultB.toBase58(), `${s.symbol} vault B`);
    want.set(w.config.toBase58(), 'whirlpools config');
    want.set(oraclePda(pool).toBase58(), `${s.symbol} oracle`);
    want.set(tokenBadgePda(w.config, new PublicKey(s.mint)).toBase58(), `${s.symbol} token badge`);
    const arrays: number[] = [];
    for (let k = -4; k <= 4; k++) {
      const start = tickArrayStart(w.tick, w.tickSpacing, k);
      arrays.push(start);
      want.set(tickArrayPda(pool, start).toBase58(), `${s.symbol} tick array ${start}`);
    }
    pools.push({ ...s, tickSpacing: w.tickSpacing, tick: w.tick, mintA: w.mintA.toBase58(), mintB: w.mintB.toBase58(), vaultA: w.vaultA.toBase58(), vaultB: w.vaultB.toBase58(), config: w.config.toBase58(), stockIsA, arrays });
  }

  const keys = [...want.keys()];
  const kept: string[] = [];
  for (let i = 0; i < keys.length; i += 90) {
    const batch = keys.slice(i, i + 90);
    const infos = await conn.getMultipleAccountsInfo(batch.map((k) => new PublicKey(k)));
    infos.forEach((info, j) => {
      const k = batch[j];
      if (!info) return; // tick arrays outside the live range, oracles of non-adaptive pools: not on chain, not needed
      writeFileSync(join(OUT, 'accounts', `${k}.json`), JSON.stringify({
        pubkey: k,
        account: { lamports: info.lamports, data: [info.data.toString('base64'), 'base64'], owner: info.owner.toBase58(), executable: info.executable, rentEpoch: 0, space: info.data.length },
      }));
      kept.push(k);
    });
  }
  for (const p of pools as { symbol: string; pool: string; arrays: number[]; liveArrays?: number[] }[]) {
    p.liveArrays = p.arrays.filter((start) => kept.includes(tickArrayPda(new PublicKey(p.pool), start).toBase58()));
    if (p.liveArrays.length < 3) throw new Error(`${p.symbol}: only ${p.liveArrays.length} tick arrays exist around the price`);
  }

  for (const prog of [WHIRLPOOL, TOKEN_2022]) {
    const so = join(OUT, 'programs', `${prog.toBase58()}.so`);
    if (!existsSync(so)) execFileSync('solana', ['program', 'dump', prog.toBase58(), so, '--url', MAINNET], { stdio: 'ignore' });
  }
  writeFileSync(join(OUT, 'stocks.json'), JSON.stringify({ snapshotAt: new Date().toISOString(), rpc: MAINNET, whirlpool: WHIRLPOOL.toBase58(), token2022: TOKEN_2022.toBase58(), usdc: USDC.toBase58(), stocks: pools, accounts: kept }, null, 2));
  console.log(`fork snapshot: ${kept.length} accounts for ${pools.length} stocks, programs Whirlpool + Token-2022 → ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(`fork-stocks failed: ${(e as Error).message}`); process.exit(1); });
}
