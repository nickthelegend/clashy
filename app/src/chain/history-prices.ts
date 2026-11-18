// Price history recorded by Clashy's own crank: one sample a minute of the prices it pushed on chain, kept 7 days in
// chain/.localnet/price-history.jsonl and served read-only by the sponsor relay at GET /history. Nothing is
// backfilled or interpolated: before the crank's first sample there is no history, and the app says so.
import { useEffect, useState } from 'react';
import { NET } from './client';

export type PriceRange = '1h' | '24h' | '7d';
/** t: unix seconds; p: USD price per symbol (SOL, BTC, ETH, NVDA, TSLA, AAPL, SPY, GOOGL). */
export type PricePoint = { t: number; p: Record<string, number> };
export type PriceHistory = {
  range: PriceRange;
  points: PricePoint[];
  /** The oldest sample the crank still keeps (unix seconds), across all ranges; null when there is none. */
  first: number | null;
  /** Seconds between samples. */
  every: number;
};

export async function readPriceHistory(range: PriceRange): Promise<PriceHistory> {
  const r = await fetch(`${NET.sponsor}/history?range=${range}`).catch((e: Error) => {
    throw new Error(`Price history: the relay at ${NET.sponsor} is unreachable (${e.message})`);
  });
  const j = (await r.json().catch(() => null)) as (Partial<PriceHistory> & { error?: string }) | null;
  if (r.status === 404) throw new Error('Price history: this relay has no /history yet. Restart chain/scripts/sponsor.ts.');
  if (!r.ok) throw new Error(j?.error ?? `Price history: the relay answered HTTP ${r.status}`);
  if (!j || !Array.isArray(j.points)) throw new Error('Price history: the relay sent an unreadable answer');
  const points = j.points.filter((x): x is PricePoint => typeof x?.t === 'number' && !!x.p && typeof x.p === 'object');
  return { range, points, first: typeof j.first === 'number' ? j.first : null, every: typeof j.every === 'number' ? j.every : 60 };
}

/** The symbols the crank records (its on-chain price feeds). */
export const HISTORY_SYMS = ['SOL', 'BTC', 'ETH', 'NVDA', 'TSLA', 'AAPL', 'SPY', 'GOOGL'] as const;
/** The crank's symbol for a market symbol: NVDAx → NVDA, SOL-PERP → SOL, SOL → SOL; null when the crank doesn't record it. */
export function historySym(sym: string): string | null {
  const s = sym.toUpperCase().replace(/-PERP$/, '');
  const base = (HISTORY_SYMS as readonly string[]).includes(s) ? s : s.endsWith('X') ? s.slice(0, -1) : s;
  return (HISTORY_SYMS as readonly string[]).includes(base) ? base : null;
}

/** The crank's history for one range; refetched every minute (one new sample a minute) and reset on a range change. */
export function usePriceHistory(range: PriceRange | null) {
  const [s, setS] = useState<{ range: PriceRange | null; data?: PriceHistory; error?: string }>({ range });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!range) return;
    let alive = true;
    setS((p) => (p.range === range ? p : { range }));
    const run = () => readPriceHistory(range)
      .then((data) => alive && setS({ range, data }))
      .catch((e: Error) => alive && setS((p) => ({ range, data: p.range === range ? p.data : undefined, error: e.message })));
    run();
    const h = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(h); };
  }, [range, n]);
  return { ...(s.range === range ? s : { range }), reload: () => setN((x) => x + 1) };
}
