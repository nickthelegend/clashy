// Clashy price crank: pushes live Coinbase prices into the delegated feeds on the rollup every second,
// and into the never-delegated Solana base feeds every 5 s (one transaction for all coins) for
// Solana-side reads (clan trades). Rollup feeds are not committed back: MagicBlock sponsors only a
// few commits per delegated account.
// It also does first-time setup (config, feeds, delegation) on a fresh stack, and records one sample a minute of the
// prices it pushed to chain/.localnet/price-history.jsonl (last 7 days; served by the sponsor relay at GET /history).
//
//   npx tsx scripts/crank.ts          (Ctrl-C to stop)
import { BASE_URL, COINS, IS_LOCAL, P, PRICE_SCALE, PublicKey, authority, baseProgram, crank, ensureSetup, pushBasePrices, pushPrices, sleep } from '../tests/common.ts';
import { HISTORY_FILE, SAMPLE_EVERY_SECS, appendSample, trimSamples } from './price-history.ts';

// The rake goes to the USDC account of CLASHY_TREASURY (a wallet address); locally, the admin key's.
const treasury = process.env.CLASHY_TREASURY ? new PublicKey(process.env.CLASHY_TREASURY)
  : IS_LOCAL ? authority.publicKey
  : !process.argv.includes('--setup-only') ? PublicKey.default
  : (() => { throw new Error(`Setup required: set CLASHY_TREASURY (rake wallet) to run against ${BASE_URL}`); })();
// Setup needs the admin key, so it runs only on the local stack or with --setup-only (a deploy step, run with
// CLASHY_ROLE=admin). The always-on crank holds only the crank key (audit C1) and just checks it is the config's crank.
const setup = IS_LOCAL || process.argv.includes('--setup-only');
const cfg = setup ? await ensureSetup(treasury) : await baseProgram.account.config.fetch(P.config);
if (!cfg.crank.equals(crank.publicKey)) throw new Error(`Setup required: this crank key (${crank.publicKey.toBase58()}) is not the program's crank; run the setup with the admin key`);
if (process.argv.includes('--setup-only')) {
  console.log(`setup done on ${BASE_URL} · vrf required ${cfg.vrfRequired} · queue ${cfg.vrfQueue.toBase58()} · ${cfg.coinCount} coins`);
  process.exit(0);
}
console.log(`crank up · treasury ${cfg.treasury.toBase58()} · crank ${crank.publicKey.toBase58()} · ${cfg.coinCount} coins`);
console.log(`price history: ${trimSamples()} samples kept (last 7 days) in ${HISTORY_FILE}`);
let n = 0;
let stop = false;
let lastSample = 0;
let lastTrim = Date.now();
process.on('SIGINT', () => { stop = true; });
while (!stop) {
  const t0 = Date.now();
  try {
    const px = await pushPrices();
    if (n % 5 === 0) await pushBasePrices(px);
    if (Date.now() - lastSample >= SAMPLE_EVERY_SECS * 1000) {
      lastSample = Date.now();
      appendSample({ t: Math.floor(lastSample / 1000), p: Object.fromEntries(COINS.map((c, i) => [c.symbol, Number(px[i]) / PRICE_SCALE])) });
    }
    if (Date.now() - lastTrim >= 3_600_000) { lastTrim = Date.now(); trimSamples(); }
    if (n % 30 === 0) console.log(`${new Date().toISOString()} pushed ${px.map((p) => (Number(p) / 1e6).toFixed(2)).join(' / ')} · rollup every 1 s, Solana every 5 s`);
  } catch (e) {
    console.error(`${new Date().toISOString()} crank error: ${(e as Error).message.split('\n')[0]}`);
  }
  n++;
  await sleep(Math.max(0, 1000 - (Date.now() - t0)));
}
console.log('crank stopped');
