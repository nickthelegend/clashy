// Order-book math for Practice, with no dependencies (so the chain tests run it against the real, live books):
// filling a size against an L2 book level by level, the mid and the spread.

/** [price, size in the base asset] */
export type Level = [number, number];
export type L2 = { bids: Level[]; asks: Level[]; t: number };

export type Fill = { qty: number; usd: number; vwap: number; worst: number; levels: number; complete: boolean };
/** Take liquidity for `usd` of notional, best level first. */
export function fillUsd(levels: Level[], usd: number): Fill {
  let left = usd, qty = 0, spent = 0, worst = 0, n = 0;
  for (const [p, a] of levels) {
    if (left <= 1e-9) break;
    const take = Math.min(a, left / p);
    qty += take; spent += take * p; left -= take * p; worst = p; n++;
  }
  return { qty, usd: spent, vwap: qty ? spent / qty : 0, worst, levels: n, complete: left <= 1e-6 };
}
/** Take liquidity for `qty` of the base asset (closing a position). */
export function fillQty(levels: Level[], qty: number): Fill {
  let left = qty, got = 0, usd = 0, worst = 0, n = 0;
  for (const [p, a] of levels) {
    if (left <= 1e-12) break;
    const take = Math.min(a, left);
    got += take; usd += take * p; left -= take; worst = p; n++;
  }
  return { qty: got, usd, vwap: got ? usd / got : 0, worst, levels: n, complete: left <= qty * 1e-9 };
}
export const mid = (b: L2) => (b.bids[0] && b.asks[0] ? (b.bids[0][0] + b.asks[0][0]) / 2 : undefined);
export const spreadBps = (b: L2) => {
  const m = mid(b);
  return m && b.bids[0] && b.asks[0] ? ((b.asks[0][0] - b.bids[0][0]) / m) * 10_000 : undefined;
};
