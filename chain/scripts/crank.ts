// Clashy price crank: pushes live Coinbase prices into the delegated feeds on the rollup every second,
// and into the never-delegated Solana base feeds every 5 s (one transaction for all coins) for
// Solana-side reads (clan trades). Rollup feeds are not committed back: MagicBlock sponsors only a
// few commits per delegated account.
// It also does first-time setup (config, feeds, delegation) on a fresh stack, and records one sample a minute of the
// prices it pushed to chain/.localnet/price-history.jsonl (last 7 days; served by the sponsor relay at GET /history).
//
//   npx tsx scripts/crank.ts          (Ctrl-C to stop)
import { BASE_URL, COINS, IS_LOCAL, P, PRICE_SCALE, PublicKey, Transaction, authority, base, baseProgram, crank, ensureSetup, erProgram, pushBasePrices, pushPrices, sendEr, sleep } from '../tests/common.ts';
import { sendAndConfirmTransaction } from '@solana/web3.js';
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
/** The keeper (audit M-H1/M-H2): every 2 s it checks every live duel and resolves every Royale round that is due, on the
 *  rollup with the crank's own key, so knockouts and bells land on time whoever is online and no player picks the
 *  closing moment. A game nobody could finish within VOID_GRACE_SECS of its bell is voided (refunds / current leaders). */
const VOID_GRACE_SECS = 120;
const LIVE_DUEL = 3, LIVE_TOUR = 1;
let keeperOff = '';
async function keep() {
  const now = Date.now() / 1000;
  const [duels, tours] = await Promise.all([erProgram.account.duel.all(), erProgram.account.tournament.all()]);
  let acted = 0;
  for (const { publicKey: duel, account: d } of duels) {
    if (d.status !== LIVE_DUEL) continue;
    const bell = Number(d.startTs) + d.lenSecs;
    const late = now > bell + VOID_GRACE_SECS;
    try {
      await sendEr(late ? erProgram.methods.voidDuel().accountsPartial({ payer: crank.publicKey, duel })
        : erProgram.methods.checkDuel().accountsPartial({ payer: crank.publicKey, duel, price: P.feed(d.coin) }), crank, crank);
      acted++;
    } catch (e) { if (now > bell) console.error(`keeper: duel ${duel.toBase58().slice(0, 6)}… ${(e as Error).message.split('\n')[0]}`); }
  }
  for (const { publicKey: tournament, account: t } of tours) {
    if (t.status !== LIVE_TOUR) continue;
    const bell = Number(t.roundStartedAt) + t.roundSecs;
    if (now < bell) continue;
    try {
      await sendEr(now > bell + VOID_GRACE_SECS ? erProgram.methods.voidTournament().accountsPartial({ payer: crank.publicKey, tournament })
        : erProgram.methods.resolveRound().accountsPartial({ payer: crank.publicKey, tournament, price: P.feed(t.coin) }), crank, crank);
      acted++;
    } catch (e) { console.error(`keeper: royale ${tournament.toBase58().slice(0, 6)}… ${(e as Error).message.split('\n')[0]}`); }
  }
  return acted;
}

/** Rent back for the sponsor: settled and cancelled duels older than DUEL_KEEP_SECS (14 days, kept for match pages,
 *  history and the weekly cup) are closed, up to 8 per transaction, once an hour. The crank pays the fee (5,000
 *  lamports a signature); each duel's rent (about 0.0028 SOL) goes to whoever paid it. */
const DUEL_KEEP_SECS = 14 * 86_400;
const SETTLED = 5, CANCELLED = 6;
async function sweepDuels() {
  const now = Date.now() / 1000;
  const old = (await baseProgram.account.duel.all()).filter(({ account: d }) => (d.status === SETTLED || d.status === CANCELLED) && !d.vrfPending
    && now > Math.max(Number(d.endTs), Number(d.expiresAt), Number(d.matchedAt)) + DUEL_KEEP_SECS + 60);
  let closed = 0;
  for (let i = 0; i < old.length; i += 8) {
    const batch = old.slice(i, i + 8);
    const ixs = await Promise.all(batch.map(({ publicKey: duel, account: d }) => baseProgram.methods.closeDuel().accountsPartial({ duel, rentPayer: d.rentPayer }).instruction()));
    try { await sendAndConfirmTransaction(base, new Transaction().add(...ixs), [crank], { commitment: 'confirmed' }); closed += batch.length; }
    catch (e) { console.error(`sweep: ${(e as Error).message.split('\n')[0]}`); }
  }
  if (closed) console.log(`${new Date().toISOString()} closed ${closed} old duels; their rent went back to the sponsor`);
}

let n = 0;
let stop = false;
let lastSweep = 0;
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
    if (n % 2 === 0) {
      // the keeper never stops the price pushes: its own failures are logged once and the loop goes on
      await keep().then(() => { keeperOff = ''; }).catch((e: Error) => {
        const msg = e.message.split('\n')[0];
        if (msg !== keeperOff) console.error(`${new Date().toISOString()} keeper: ${msg}`);
        keeperOff = msg;
      });
    }
    if (Date.now() - lastSweep >= 3_600_000) { lastSweep = Date.now(); void sweepDuels().catch((e: Error) => console.error(`sweep: ${e.message.split('\n')[0]}`)); }
    if (n % 30 === 0) console.log(`${new Date().toISOString()} pushed ${px.map((p) => (Number(p) / 1e6).toFixed(2)).join(' / ')} · rollup every 1 s, Solana every 5 s`);
  } catch (e) {
    console.error(`${new Date().toISOString()} crank error: ${(e as Error).message.split('\n')[0]}`);
  }
  n++;
  await sleep(Math.max(0, 1000 - (Date.now() - t0)));
}
console.log('crank stopped');
