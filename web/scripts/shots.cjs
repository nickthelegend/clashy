// Captures real screens of the Clashy app (Expo web on :8099) for the landing page.
// Two sizes: 390x844 phone frames (shots/<name>.png) and 390x687 for the clay hand's screen (shots/hand-<name>.png),
// which matches the hand's screen area below the notch, so nothing is cropped.
// Run: node scripts/shots.cjs   (needs the app dev server running)
const { chromium } = require('/Volumes/Extreme SSD/Projects/grokbot/projects/magen/node_modules/playwright-core');
const path = require('path');
const OUT = path.join(__dirname, '..', 'public', 'shots');
const B = 'http://localhost:8099';

async function run(b, vp, prefix, only) {
  const c = await b.newContext({ viewport: vp, deviceScaleFactor: 2 });
  await c.addInitScript(() => localStorage.setItem('clashy:onboarded', '1'));
  const p = await c.newPage();
  const want = (n) => !only || only.includes(n);
  const snap = async (name, wait = 2500) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/${prefix}${name}.png` }); console.log('shot', prefix + name); };
  if (want('arena')) { await p.goto(B + '/arena', { waitUntil: 'networkidle' }); await snap('arena'); }
  if (want('home')) { await p.goto(B + '/', { waitUntil: 'networkidle' }); await snap('home'); }
  if (want('amount')) { await p.goto(B + '/duel/amount?id=SOL&stake=20', { waitUntil: 'networkidle' }); await snap('amount', 3000); }
  if (want('match') || want('duel')) {
    // Knockout duel = quick match: the coin is rolled, then you pick a side
    await p.goto(B + '/duel/match?stake=20', { waitUntil: 'networkidle' });
    if (want('match')) await snap('match', 5500); else await p.waitForTimeout(5500);
    await p.getByText('Long ▲').click(); await snap('duel', 14000);
  }
  if (want('royale')) {
    await p.goto(B + '/game/royale', { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    await p.getByText('Start', { exact: true }).click(); await p.waitForTimeout(1200); await p.getByText('UP', { exact: true }).click(); await snap('royale', 1500);
  }
  if (want('line')) {
    await p.goto(B + '/game/line', { waitUntil: 'networkidle' }); await p.waitForTimeout(11000);
    const box = await p.locator('svg').filter({ has: p.locator('rect') }).first().boundingBox();
    if (box) { const x0 = box.x + box.width * 0.36, y = box.y + box.height / 2; await p.mouse.move(x0, y); await p.mouse.down(); for (let i = 1; i <= 30; i++) await p.mouse.move(x0 + (box.width * 0.64 - 4) * i / 30, y + Math.sin(i / 5) * box.height * 0.18, { steps: 2 }); await p.mouse.up(); }
    await p.getByText('Lock my line').click().catch(() => {}); await snap('line', 12000);
  }
  if (want('war')) { await p.goto(B + '/game/war', { waitUntil: 'networkidle' }); await snap('war', 5000); }
  if (want('bounty')) { await p.goto(B + '/game/bounty', { waitUntil: 'networkidle' }); await p.getByText('My poster').click(); await snap('bounty', 1500); }
  if (want('leaderboard')) { await p.goto(B + '/leaderboard', { waitUntil: 'networkidle' }); await snap('leaderboard'); }
  await c.close();
}
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const onlyHand = process.argv.includes('--hand');
  if (!onlyHand) await run(b, { width: 390, height: 844 }, '', ['arena', 'home', 'amount', 'match', 'duel', 'royale', 'line', 'war', 'bounty', 'leaderboard']);
  await run(b, { width: 390, height: 687 }, 'hand-', ['home', 'arena', 'duel', 'royale', 'line', 'war']);
  await b.close();
})();
