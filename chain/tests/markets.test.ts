// Practice's order-book perps: the relay's read-only market proxy (chain/scripts/sponsor.ts /mkt/…) and the app's own
// fill math (app/src/chain/book-math.ts), run against Phoenix's and Pacifica's real, live order books. No mocks: every
// number here is what the venue's public API answered just now.
// Run: npx tsx scripts/sponsor.ts (the relay), then npx tsx --test tests/markets.test.ts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { L2, Level } from '../../app/src/chain/book-math.ts';
// the app package is CommonJS to Node, so its exports arrive on the module object
import * as bookMath from '../../app/src/chain/book-math.ts';

const m_ = ((bookMath as { default?: typeof bookMath }).default ?? bookMath) as typeof bookMath;
const { fillQty, fillUsd, mid, spreadBps } = m_;

const RELAY = process.env.CLASHY_RELAY ?? 'http://127.0.0.1:8790';
const get = async (path: string) => {
  const r = await fetch(`${RELAY}/mkt${path}`, { signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const levels = (rows: unknown[]): Level[] => rows.map((r) => (Array.isArray(r) ? [Number(r[0]), Number(r[1])] : [Number((r as { p: string }).p), Number((r as { a: string }).a)]) as Level);
const book = (bids: Level[], asks: Level[]): L2 => ({ bids: [...bids].sort((a, b) => b[0] - a[0]), asks: [...asks].sort((a, b) => a[0] - b[0]), t: Date.now() });

function checkFills(b: L2, usd: number) {
  assert.ok(b.bids.length > 2 && b.asks.length > 2, 'the live book has depth on both sides');
  assert.ok(b.bids[0][0] < b.asks[0][0], `best bid ${b.bids[0][0]} is below best ask ${b.asks[0][0]}`);
  const m = mid(b)!;
  assert.ok(spreadBps(b)! > 0 && spreadBps(b)! < 100, `spread ${spreadBps(b)} bps is sane`);
  // a market buy walks the asks: it pays at least the best ask and at most the worst level it touched
  const buy = fillUsd(b.asks, usd);
  assert.ok(buy.complete, `the asks hold $${usd}`);
  assert.ok(Math.abs(buy.usd - usd) < 1e-6 * usd, 'spends exactly the size');
  assert.ok(buy.vwap >= b.asks[0][0] - 1e-9 && buy.vwap <= buy.worst + 1e-9 && buy.vwap > m, `buy fills at ${buy.vwap}, between the best ask and ${buy.worst}`);
  // closing that position sells the same quantity into the bids, below the mid
  const sell = fillQty(b.bids, buy.qty);
  assert.ok(sell.complete && Math.abs(sell.qty - buy.qty) < 1e-9 * buy.qty, 'sells the whole quantity');
  assert.ok(sell.vwap <= b.bids[0][0] + 1e-9 && sell.vwap >= sell.worst - 1e-9 && sell.vwap < m, `sell fills at ${sell.vwap}`);
  // a size bigger than every level shown is refused, never filled at an invented price
  const depth = b.asks.reduce((a, [p, s]) => a + p * s, 0);
  const huge = fillUsd(b.asks, depth * 2);
  assert.equal(huge.complete, false);
  assert.ok(Math.abs(huge.usd - depth) < 1e-6 * depth, 'takes only what the book shows');
  return { buy, sell, m };
}

describe('relay market proxy', () => {
  test('passes only the listed public reads', async () => {
    for (const p of ['/phoenix/v1/view/trader/11111111111111111111111111111111', '/phoenix/v1/auth/login', '/pacifica/api/v1/account?account=x', '/evil/x', '/phoenix/exchange/markets/../keys']) {
      assert.equal((await get(p)).status, 404, `${p} is refused`);
    }
  });
});

describe('Phoenix (on-chain order book)', () => {
  test('lists active markets with leverage caps and fees', async () => {
    const { status, body } = await get('/phoenix/exchange/markets');
    assert.equal(status, 200);
    const active = (body as { symbol: string; marketStatus: string; takerFee: number; makerFee: number; leverageTiers: { maxLeverage: number }[] }[]).filter((m) => m.marketStatus === 'active');
    assert.ok(active.length > 20, `${active.length} active markets`);
    const sol = active.find((m) => m.symbol === 'SOL')!;
    assert.ok(sol.takerFee > 0 && sol.takerFee < 0.01 && sol.makerFee >= 0 && sol.leverageTiers[0].maxLeverage >= 2);
  });
  test('a $5,000 SOL order fills level by level on the live book', async () => {
    const { status, body } = await get('/phoenix/v1/view/orderbook/SOL');
    assert.equal(status, 200);
    const b = book(levels(body.bids), levels(body.asks));
    const { buy, sell, m } = checkFills(b, 5000);
    const px = (await get('/phoenix/exchange/prices')).body.markets.find((x: { symbol: string }) => x.symbol === 'SOL');
    assert.ok(Math.abs(px.mark_price / m - 1) < 0.01, `mark ${px.mark_price} is within 1% of the book's mid ${m}`);
    console.log(`  Phoenix SOL: mid ${m}, $5,000 buys ${buy.qty.toFixed(3)} at ${buy.vwap.toFixed(4)} over ${buy.levels} levels, sells back at ${sell.vwap.toFixed(4)}`);
  });
  test('funding and candles are real numbers', async () => {
    const f = (await get('/phoenix/v1/funding/SOL/rates?limit=1')).body;
    assert.ok(Number.isFinite(Number(f.rates.at(-1).fundingRatePercentage)));
    const c = (await get('/phoenix/v1/candles/SOL?timeframe=1m&limit=5')).body;
    assert.ok(c.length > 0 && c.every((k: { low: number; high: number; open: number; close: number }) => k.low <= Math.min(k.open, k.close) && k.high >= Math.max(k.open, k.close)));
    // the trade tape: real fills, each with its Solana transaction signature
    const fills = (await get('/phoenix/v1/trades/SOL/fills?limit=5')).body.data as { baseQty: string; price: string; transactionSignature: string }[];
    assert.ok(fills.length > 0 && fills.every((f) => Number(f.price) > 0 && Number(f.baseQty) !== 0 && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(f.transactionSignature)));
  });
});

describe('Pacifica (order book, Solana settlement)', () => {
  test('lists perps and its fee schedule', async () => {
    const info = (await get('/pacifica/api/v1/info')).body.data as { symbol: string; instrument_type: string; max_leverage: number }[];
    assert.ok(info.filter((m) => m.instrument_type === 'perpetual').length > 20);
    const fees = (await get('/pacifica/api/v1/info/fees')).body.data as { level: number; taker_fee_rate: string; maker_fee_rate: string }[];
    const base = fees.find((x) => x.level === 0)!;
    assert.ok(Number(base.taker_fee_rate) > 0 && Number(base.taker_fee_rate) < 0.01);
  });
  test('a $20,000 BTC order fills level by level on the live book', async () => {
    const { status, body } = await get('/pacifica/api/v1/book?symbol=BTC');
    assert.equal(status, 200);
    const b = book(levels(body.data.l[0]), levels(body.data.l[1]));
    const { buy, sell, m } = checkFills(b, 20_000);
    console.log(`  Pacifica BTC: mid ${m}, $20,000 buys ${buy.qty.toFixed(5)} at ${buy.vwap.toFixed(2)} over ${buy.levels} levels, sells back at ${sell.vwap.toFixed(2)}`);
  });
});
