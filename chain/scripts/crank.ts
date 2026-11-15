// Clashy price crank: pushes live Coinbase prices into the delegated feeds on the rollup every second,
// and commits them to Solana every 30 s so Solana-side reads (clans, wars) stay fresh.
// It also does first-time setup (config, feeds, delegation) on a fresh stack.
//
//   npx tsx scripts/crank.ts          (Ctrl-C to stop)
import { authority, commitFeeds, ensureSetup, fundedKeypair, pushPrices, sleep } from '../tests/common.ts';

const cfg = await ensureSetup((await fundedKeypair(1)).publicKey);
console.log(`crank up · treasury ${cfg.treasury.toBase58()} · crank ${authority.publicKey.toBase58()} · ${cfg.coinCount} coins`);
let n = 0;
let stop = false;
process.on('SIGINT', () => { stop = true; });
while (!stop) {
  const t0 = Date.now();
  try {
    const px = await pushPrices();
    if (n % 30 === 0) {
      await commitFeeds();
      console.log(`${new Date().toISOString()} pushed ${px.map((p) => (Number(p) / 1e6).toFixed(2)).join(' / ')} · committed to Solana`);
    }
  } catch (e) {
    console.error(`${new Date().toISOString()} crank error: ${(e as Error).message.split('\n')[0]}`);
  }
  n++;
  await sleep(Math.max(0, 1000 - (Date.now() - t0)));
}
console.log('crank stopped');
