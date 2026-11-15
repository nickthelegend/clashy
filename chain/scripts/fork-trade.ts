// Real trade on a mainnet fork: sells SOL for USDC on Phoenix's SOL/USDC order book, cloned from
// mainnet by scripts/forknet.sh. The fill is against real resting mainnet orders (as of the fork),
// with a throwaway wallet funded by the fork's faucet. No real funds are touched.
//
//   bash scripts/forknet.sh && npx tsx scripts/fork-trade.ts [solAmount]
import * as Phoenix from '@ellipsis-labs/phoenix-sdk';
import {
  NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { writeFileSync } from 'node:fs';

const FORK = process.env.FORK_RPC ?? 'http://127.0.0.1:8911';
const MARKET = new PublicKey('4DoNfFBfF7UokCC2FQzriy7yHK6DY6NVdYpuekQ5pRgg');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const sol = Number(process.argv[2] ?? '1');

const conn = new Connection(FORK, 'confirmed');
const info = await conn.getAccountInfo(MARKET);
if (!info) throw new Error(`Phoenix SOL/USDC market not on the fork at ${FORK}; run scripts/forknet.sh`);
const market = Phoenix.MarketState.load({ address: MARKET, buffer: info.data });
const ladder = market.getUiLadder(5);
const bestBid = ladder.bids[0]?.price;
const bestAsk = ladder.asks[0]?.price;
if (!bestBid) throw new Error('the forked book has no bids');
console.log(`forked Phoenix SOL/USDC book: best bid ${bestBid} / best ask ${bestAsk} (${ladder.bids.length} bid levels shown)`);

const trader = Keypair.generate();
await conn.confirmTransaction(await conn.requestAirdrop(trader.publicKey, (sol + 1) * LAMPORTS_PER_SOL), 'confirmed');

const slot = await conn.getSlot();
const expectedUsdc = market.getExpectedOutAmount({ side: Phoenix.Side.Ask, inAmount: sol, slot, unixTimestamp: Math.floor(Date.now() / 1000) });

// wrap SOL, then sell it into the bids with Phoenix's own swap instruction (IOC, no seat needed)
const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, trader.publicKey);
const usdcAta = getAssociatedTokenAddressSync(USDC, trader.publicKey);
const wrap = new Transaction().add(
  createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, wsolAta, trader.publicKey, NATIVE_MINT),
  createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, usdcAta, trader.publicKey, USDC),
  SystemProgram.transfer({ fromPubkey: trader.publicKey, toPubkey: wsolAta, lamports: Math.round(sol * LAMPORTS_PER_SOL) }),
  createSyncNativeInstruction(wsolAta),
);
await sendAndConfirmTransaction(conn, wrap, [trader]);

const swap = Phoenix.getMarketSwapTransaction({ market, trader: trader.publicKey, side: Phoenix.Side.Ask, inAmount: sol, slippage: 0.01 });
// the SDK's swap transaction already unwraps and closes the wSOL account
const sig = await sendAndConfirmTransaction(conn, swap, [trader]);
const got = Number((await conn.getTokenAccountBalance(usdcAta)).value.uiAmount ?? 0);

const report = {
  network: 'mainnet fork (solana-test-validator --clone from mainnet)',
  market: MARKET.toBase58(),
  soldSol: sol,
  receivedUsdc: got,
  expectedUsdc,
  effectivePrice: got / sol,
  bestBidAtFork: bestBid,
  signature: sig,
  at: new Date().toISOString(),
};
console.log(JSON.stringify(report, null, 2));
if (!(got > 0)) throw new Error('swap returned no USDC');
if (Math.abs(got - expectedUsdc) / expectedUsdc > 0.01) throw new Error(`fill ${got} is more than 1% off the book's expected ${expectedUsdc}`);
writeFileSync(new URL('../.forknet/last-trade.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`FORK TRADE OK: sold ${sol} SOL for ${got} USDC on the forked Phoenix book (tx ${sig.slice(0, 16)}…)`);
