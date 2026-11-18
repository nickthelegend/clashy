// Practice clash against Clashy Bot: the app's own rules (app/src/chain/clash-rules.ts) and the live price it plays
// on. The price check reads the real rollup feed accounts the crank updates every second (the ones real clashes
// settle on), so it fails if the crank is down: a practice clash can't start on a stale price either.
// Run: bash scripts/localnet.sh, npx tsx scripts/crank.ts, then npx tsx --test tests/practice-clash.test.ts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as rulesNs from '../../app/src/chain/clash-rules.ts';
import { P, erProgram, sleep } from './common.ts';

// the app package is CommonJS to Node, so its exports arrive on the module object
const R = ((rulesNs as { default?: typeof rulesNs }).default ?? rulesNs) as typeof rulesNs;
const base = { entry: 100, stake: 10 };

describe('practice clash rules', () => {
  test('classic: the right call takes the stake; same calls or no move are a dead heat', () => {
    assert.deepEqual(R.settle({ ...base, lev: 1, call: 'up', botCall: 'down' }, 100.01), { pnl: 10, result: 'won' });
    assert.deepEqual(R.settle({ ...base, lev: 1, call: 'up', botCall: 'down' }, 99.99), { pnl: -10, result: 'lost' });
    assert.deepEqual(R.settle({ ...base, lev: 1, call: 'down', botCall: 'up' }, 99), { pnl: 10, result: 'won' });
    assert.deepEqual(R.settle({ ...base, lev: 1, call: 'up', botCall: 'up' }, 150), { pnl: 0, result: 'tie' });
    assert.deepEqual(R.settle({ ...base, lev: 1, call: 'up', botCall: 'down' }, 100), { pnl: 0, result: 'tie' });
  });
  test('perps: leverage × the move of the stake changes hands, capped at the stake', () => {
    // a 0.5% move at 10x is 5% of the stake
    assert.deepEqual(R.settle({ ...base, lev: 10, call: 'up', botCall: 'down' }, 100.5), { pnl: 0.5, result: 'won' });
    assert.deepEqual(R.settle({ ...base, lev: 10, call: 'up', botCall: 'down' }, 99.5), { pnl: -0.5, result: 'lost' });
    // a 30% move at 10x is capped at the whole stake
    assert.deepEqual(R.settle({ ...base, lev: 10, call: 'down', botCall: 'up' }, 70), { pnl: 10, result: 'won' });
  });
  test('perps knockout: a side is out when its loss reaches its stake', () => {
    const c = { entry: 100, lev: 25, call: 'up' as const, botCall: 'down' as const };
    assert.equal(R.knockout(c, 96.1), null, 'a 3.9% drop at 25x is a 97.5% loss: still in');
    assert.equal(R.knockout(c, 96), 'you', 'a 4% drop at 25x is the whole stake');
    assert.equal(R.knockout(c, 104), 'bot');
    assert.equal(R.knockout({ ...c, lev: 1 }, 50), null, 'classic has no knockout');
    assert.equal(R.koPrice(100, 'up', 25), 96);
    assert.equal(R.koPrice(100, 'down', 50), 102);
  });
  test('the bot takes the other side, so any move has a winner', () => {
    assert.equal(R.botCall('up').call, 'down');
    assert.equal(R.botCall('down').call, 'up');
    for (const call of ['up', 'down'] as const) {
      const c = { ...base, lev: 1, call, botCall: R.botCall(call).call };
      assert.notEqual(R.settle(c, 100.01).result, 'tie');
      assert.notEqual(R.settle(c, 99.99).result, 'tie');
    }
  });
});

describe('the live price a practice clash plays on', () => {
  test('the rollup feeds for SOL, BTC and ETH are live and moving with the clock', async () => {
    for (const [i, sym] of ['SOL', 'BTC', 'ETH'].entries()) {
      const a = await erProgram.account.priceFeed.fetch(P.feed(i));
      const age = Date.now() / 1000 - a.updatedAt.toNumber();
      assert.ok(Number(a.price) > 0, `${sym} has a price`);
      assert.ok(age <= 10, `${sym} feed is ${age.toFixed(1)} s old (a clash needs ≤ 10 s)`);
    }
    const t0 = (await erProgram.account.priceFeed.fetch(P.feed(0))).updatedAt.toNumber();
    await sleep(2500);
    const t1 = (await erProgram.account.priceFeed.fetch(P.feed(0))).updatedAt.toNumber();
    assert.ok(t1 > t0, 'the crank pushed a newer SOL price within 2.5 s');
  });
});
