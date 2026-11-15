// Records the real Clashy app (Expo web on :8099) for the landing page: gameplay clips (webm, trimmed later by
// optimize.py) and stills of every screen. Everything shown is the app running on live prices; nothing is staged.
// Run: node scripts/capture.cjs [clips|stills]   (needs the app dev server on :8099)
const { chromium } = require('/Volumes/Extreme SSD/Projects/grokbot/projects/magen/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, '..', '.capture');
const B = 'http://localhost:8099';
const VP = { width: 390, height: 844 };
fs.mkdirSync(RAW, { recursive: true });
const only = process.argv[2];
const marks = {};

async function ctx(b, video) {
  const c = await b.newContext({ viewport: VP, deviceScaleFactor: 2, ...(video ? { recordVideo: { dir: RAW, size: { width: 780, height: 1688 } } } : {}) });
  await c.addInitScript(() => localStorage.setItem('clashy:onboarded', '1'));
  return c;
}

/** One clip: runs `play`, records when the interesting part starts/ends relative to page creation. */
async function clip(b, name, play) {
  const c = await ctx(b, true);
  const p = await c.newPage();
  const t0 = Date.now();
  const mark = { start: 0, end: 0 };
  await play(p, () => { mark.start = (Date.now() - t0) / 1000; }, () => { mark.end = (Date.now() - t0) / 1000; });
  const v = p.video();
  await c.close();
  const file = await v.path();
  fs.renameSync(file, path.join(RAW, `${name}.webm`));
  marks[name] = mark;
  console.log('clip', name, mark);
}

async function clips(b) {
  await clip(b, 'duel', async (p, start, end) => {
    // re-roll until the coin is a major, so the clip shows real movement (quiet memes sit at 0.0%)
    for (let tries = 0; tries < 6; tries++) {
      await p.goto(B + '/duel/match?stake=20', { waitUntil: 'networkidle' });
      start();
      await p.waitForTimeout(5200);
      const sym = await p.evaluate(() => (document.body.innerText.match(/MagicBlock\s*VRF\s+(\S+)\s+\$/) || [])[1]);
      if (['SOL', 'BTC', 'ETH'].includes(sym)) break;
    }
    await p.getByText('Long ▲').click();
    await p.waitForTimeout(9000);
    await p.locator('[aria-label="Send gg emote"]').click(); await p.waitForTimeout(500);
    await p.locator('[aria-label="Send lfg emote"]').click();
    await p.waitForTimeout(4000);
    end();
  });
  await clip(b, 'royale', async (p, start, end) => {
    await p.goto(B + '/game/royale', { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    start();
    await p.getByText('Start', { exact: true }).click(); await p.waitForTimeout(3600);
    await p.getByText('UP', { exact: true }).click(); await p.waitForTimeout(9200);
    end();
  });
  await clip(b, 'diamond', async (p, start, end) => {
    await p.goto(B + '/game/diamond', { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
    start();
    await p.getByText('Buy and hold').click(); await p.waitForTimeout(13000);
    const sell = p.locator('[aria-label="Sell now"]'); if (await sell.count()) await sell.click({ force: true });
    await p.waitForTimeout(2500);
    end();
  });
  await clip(b, 'line', async (p, start, end) => {
    await p.goto(B + '/game/line', { waitUntil: 'networkidle' }); await p.waitForTimeout(11000);
    start();
    const box = await p.locator('svg').filter({ has: p.locator('rect') }).first().boundingBox();
    if (box) { const x0 = box.x + box.width * 0.36, y = box.y + box.height / 2; await p.mouse.move(x0, y); await p.mouse.down(); for (let i = 1; i <= 40; i++) await p.mouse.move(x0 + (box.width * 0.64 - 4) * i / 40, y + Math.sin(i / 6) * box.height * 0.2, { steps: 3 }); await p.mouse.up(); }
    await p.waitForTimeout(500);
    await p.getByText('Lock my line').click().catch(() => {});
    await p.waitForTimeout(12000);
    end();
  });
  await clip(b, 'ranked', async (p, start, end) => {
    await p.goto(B + '/ranked', { waitUntil: 'domcontentloaded' });
    start();
    await p.waitForTimeout(5000);
    end();
  });
  fs.writeFileSync(path.join(RAW, 'marks.json'), JSON.stringify(marks, null, 2));
}

async function stills(b) {
  const c = await ctx(b, false);
  const p = await c.newPage();
  const snap = async (name, wait = 2200) => { await p.waitForTimeout(wait); await p.screenshot({ path: path.join(RAW, `${name}.png`) }); console.log('still', name); };
  const go = (r) => p.goto(B + r, { waitUntil: 'networkidle' });
  await go('/'); await snap('home');
  await go('/arena'); await snap('arena');
  await go('/duel/match?stake=20'); await snap('match-roll', 1400); await snap('match-pick', 4000);
  await p.getByText('Long ▲').click(); await snap('duel-intro', 700); await snap('duel', 12000);
  await go('/duel/result?reason=bell&mode=quick&streak=1&stake=40&pnl=3&id=SOL&symbol=SOL&side=long&lev=50&secs=60&entry=71&exit=71.1&rival=practice+rival&rivalPct=-3&myPct=3'); await snap('result-win', 2200);
  await go('/duel/amount?id=SOL&stake=20'); await snap('clash', 3000);
  await go('/game/royale'); await snap('royale', 5000);
  await p.mouse.wheel(0, 600); await snap('royale-lobby', 900);
  await p.getByText('Ranked', { exact: true }).click(); await p.mouse.wheel(0, 600); await snap('royale-ranked', 900);
  await p.getByText('Custom', { exact: true }).click(); await p.mouse.wheel(0, 600); await snap('royale-custom', 900);
  await go('/game/royale'); await p.waitForTimeout(4000); await p.getByText('Start', { exact: true }).click(); await p.waitForTimeout(3600); await p.getByText('UP', { exact: true }).click(); await snap('royale-round', 1200);
  await go('/game/diamond'); await snap('diamond', 4000); await p.getByText('Buy and hold').click(); await snap('diamond-hold', 11000);
  await go('/game/cup'); await snap('cup');
  await go('/game/war'); await snap('war', 4000);
  await go('/game/bounty'); await p.getByText('My poster').click(); await snap('bounty', 1500);
  await go('/ranked'); await snap('ranked', 4200);
  await go('/leaderboard'); await p.mouse.wheel(0, 900); await snap('ranks', 1200);
  await go('/clans'); await snap('clans', 3000);
  await go('/chats'); await snap('chats', 3000);
  await go('/chat/general'); await snap('chat', 2000);
  await go('/profile'); await snap('profile');
  await go('/welcome'); await snap('welcome');
  await c.close();
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  if (!only || only === 'stills') await stills(b);
  if (!only || only === 'clips') await clips(b);
  await b.close();
})();
