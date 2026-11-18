// Round-trips the trade tag a call carries (src/chain/calls.ts): new tags with open/close times, net profit and the
// liquidated flag, older tags without them, and malformed ones that must stay plain text. Run: npx tsx scripts/check-trade-tag.ts
import assert from 'node:assert/strict';
import { splitTrade, tradeTag, type TradeTag } from '../src/chain/calls';

const opened = Date.UTC(2026, 10, 19, 9, 2, 7), closed = Date.UTC(2026, 10, 19, 13, 40, 59);
const cases: TradeTag[] = [
  { side: 'long', lev: 10, entry: 73.25, exit: 74.88, margin: 500, openedAt: opened, closedAt: closed, pnl: 81.2 },
  { side: 'short', lev: 25, entry: 0.000123456, exit: 0.0001301, margin: 12.5, openedAt: opened, closedAt: closed, pnl: -12.5, liquidated: true },
  { side: 'long', lev: 1, entry: 181.4, margin: 1000, openedAt: opened },
  { side: 'short', lev: 5, entry: 64384.48, margin: 250 },
];
for (const t of cases) {
  const tag = tradeTag(t);
  const { body, trade } = splitTrade(`Rode the bounce ${tag}`);
  assert.equal(body, 'Rode the bounce');
  assert.ok(trade, tag);
  assert.equal(trade.side, t.side); assert.equal(trade.lev, t.lev); assert.equal(trade.margin, t.margin);
  assert.ok(Math.abs(trade.entry / t.entry - 1) < 1e-5);
  if (t.exit) assert.ok(Math.abs(trade.exit! / t.exit - 1) < 1e-5); else assert.equal(trade.exit, undefined);
  assert.equal(trade.openedAt, t.openedAt ? Math.floor(t.openedAt / 1000) * 1000 : undefined);
  assert.equal(trade.closedAt, t.closedAt ? Math.floor(t.closedAt / 1000) * 1000 : undefined);
  assert.equal(trade.pnl, t.pnl);
  assert.equal(!!trade.liquidated, !!t.liquidated);
  console.log('ok', new TextEncoder().encode(tag).length, 'bytes', JSON.stringify(tag));
}
// an open trade never carries a close time, profit or liquidation
assert.equal(tradeTag({ side: 'long', lev: 2, entry: 10, margin: 5, openedAt: opened, closedAt: closed, pnl: 3, liquidated: true }).includes('='), false);
// a tag from before times were added
assert.deepEqual(splitTrade('old ⁣L10x@73.25>74.88$500').trade, { side: 'long', lev: 10, entry: 73.25, exit: 74.88, margin: 500 });
// malformed: stays text
for (const bad of ['x ⁣L0x@1$5', 'x ⁣L10x@-1$5', 'x ⁣L10x@1$5~zzzzzzzz', 'x ⁣L10x@1>2$5~t4n1ka-t4n0aa']) {
  assert.equal(splitTrade(bad).trade, null, bad);
}
console.log('all trade tag checks passed');
