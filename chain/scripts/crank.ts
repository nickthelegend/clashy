// Clashy price crank: pushes live Coinbase prices into the delegated feeds on the rollup every second,
// and into the never-delegated Solana base feeds every 5 s (one transaction for all coins) for
// Solana-side reads (clan trades). Rollup feeds are not committed back: MagicBlock sponsors only a
// few commits per delegated account.
// It also does first-time setup (config, feeds, delegation) on a fresh stack.
//
//   npx tsx scripts/crank.ts          (Ctrl-C to stop)
import { BASE_URL, IS_LOCAL, PublicKey, authority, ensureSetup, fundedKeypair, pushBasePrices, pushPrices, sleep } from '../tests/common.ts';

// Off the local stack the rake goes to CLASHY_TREASURY; locally a fresh faucet-funded key is fine.
const treasury = process.env.CLASHY_TREASURY ? new PublicKey(process.env.CLASHY_TREASURY)
  : IS_LOCAL ? (await fundedKeypair(1)).publicKey
  : (() => { throw new Error(`Setup required: set CLASHY_TREASURY (rake wallet) to run against ${BASE_URL}`); })();
const cfg = await ensureSetup(treasury);
if (process.argv.includes('--setup-only')) {
  console.log(`setup done on ${BASE_URL} · vrf required ${cfg.vrfRequired} · queue ${cfg.vrfQueue.toBase58()} · ${cfg.coinCount} coins`);
  process.exit(0);
}
console.log(`crank up · treasury ${cfg.treasury.toBase58()} · crank ${authority.publicKey.toBase58()} · ${cfg.coinCount} coins`);
let n = 0;
let stop = false;
process.on('SIGINT', () => { stop = true; });
while (!stop) {
  const t0 = Date.now();
  try {
    const px = await pushPrices();
    if (n % 5 === 0) await pushBasePrices(px);
    if (n % 30 === 0) console.log(`${new Date().toISOString()} pushed ${px.map((p) => (Number(p) / 1e6).toFixed(2)).join(' / ')} · rollup every 1 s, Solana every 5 s`);
  } catch (e) {
    console.error(`${new Date().toISOString()} crank error: ${(e as Error).message.split('\n')[0]}`);
  }
  n++;
  await sleep(Math.max(0, 1000 - (Date.now() - t0)));
}
console.log('crank stopped');
