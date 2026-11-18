// The candles behind one trade, over the time it was open (with a little before and after).
//   Phoenix and Pacifica perps: that venue's own candles, its real trade prices.
//   Everything else (Jupiter perps, coins, memecoins, xStocks): GeckoTerminal's USD candles for the token's busiest
//   Solana DEX pool. Jupiter Perps marks SOL, ETH and BTC with oracle prices, which the big DEX pools track closely;
//   the chart always names the source it drew.
// Reads go through the Clashy relay's shared cache (/mkt/…), so every player shares one stream of reads. A window with
// no candles says so; nothing is filled in or smoothed.
import { useEffect, useState } from 'react';
import { NET } from './client';
import { isBookVenue, VENUES, type Candle } from './venues';
import type { Market } from './practice';

export type ChartTf = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export const CHART_TF_MS: Record<ChartTf, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
const TFS = Object.keys(CHART_TF_MS) as ChartTf[];
const MINUTE = 60_000;

/** The span to draw: the trade takes about 60% of it, on candles small enough to see the moves (at most ~90). */
export function tradeWindow(openedAt: number, closedAt: number | undefined, now = Date.now()) {
  const end = Math.min(now, closedAt ?? now);
  const held = Math.max(MINUTE, end - openedAt);
  const tf = TFS.find((t) => (held * 1.7) / CHART_TF_MS[t] <= 90) ?? '1d';
  const step = CHART_TF_MS[tf];
  const pad = Math.max(held * 0.35, 6 * step);
  const from = Math.floor((openedAt - pad) / step) * step;
  // the end rounds to the minute so polls repeat the relay's cache key
  const to = Math.min(Math.ceil(now / MINUTE) * MINUTE, Math.ceil((end + pad) / MINUTE) * MINUTE);
  return { tf, from, to, n: Math.min(200, Math.ceil((to - from) / step) + 1) };
}

export type TradeCandles = { candles: Candle[]; tf: ChartTf; from: number; to: number; source: string };

class ChartError extends Error {}
async function get<T>(path: string, what: string): Promise<T> {
  let r: Response;
  try { r = await fetch(`${NET.sponsor}/mkt${path}`, { headers: { accept: 'application/json' } }); } catch { throw new ChartError(`Can't reach ${what}. Check your connection.`); }
  if (r.status === 429) throw new ChartError(`${what} is rate limiting reads. Try again in a minute.`);
  if (r.status === 404) throw new ChartError(`${what} has no chart for this market.`);
  if (!r.ok) throw new ChartError(`${what} answered ${r.status}.`);
  try { return (await r.json()) as T; } catch { throw new ChartError(`${what} sent an answer we couldn't read.`); }
}
const clean = (ks: Candle[], from: number, to: number) =>
  ks.filter((k) => [k.o, k.h, k.l, k.c].every((x) => Number.isFinite(x) && x > 0) && k.t >= from - 1 && k.t <= to).sort((a, b) => a.t - b.t);

/** A token's busiest pool on GeckoTerminal (its own ranking: volume and liquidity), kept for the session. */
const POOLS = new Map<string, Promise<{ pool: string; name: string; dex: string }>>();
function topPool(mint: string) {
  let p = POOLS.get(mint);
  if (!p) {
    p = get<{ data?: { id: string; attributes?: { name?: string }; relationships?: { dex?: { data?: { id?: string } } } }[] }>(
      `/gecko/networks/solana/tokens/${mint}/pools?page=1`, 'GeckoTerminal',
    ).then((r) => {
      const top = r.data?.[0];
      if (!top?.id?.startsWith('solana_')) throw new ChartError('GeckoTerminal lists no trading pool for this token yet.');
      const dex = (top.relationships?.dex?.data?.id ?? '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { pool: top.id.slice(7), name: top.attributes?.name ?? 'its top pool', dex };
    });
    p.catch(() => POOLS.delete(mint));
    POOLS.set(mint, p);
  }
  return p;
}
const GECKO_TF: Record<ChartTf, [string, number]> = { '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15], '1h': ['hour', 1], '4h': ['hour', 4], '1d': ['day', 1] };

export async function loadTradeCandles(m: Market, openedAt: number, closedAt?: number): Promise<TradeCandles> {
  const { tf, from, to, n } = tradeWindow(openedAt, closedAt);
  if (isBookVenue(m.venue) && m.venueSym) {
    const sym = encodeURIComponent(m.venueSym);
    const name = VENUES[m.venue].name;
    if (m.venue === 'phoenix') {
      const r = await get<{ time: number; open: number; high: number; low: number; close: number; volumeQuote?: number }[]>(
        `/phoenix/v1/candles/${sym}?timeframe=${tf}&startTime=${from}&endTime=${to}&limit=${n}`, `${name} candles`);
      const ks = (Array.isArray(r) ? r : []).map((k) => ({ t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volumeQuote }));
      return { candles: clean(ks, from, to), tf, from, to, source: `${name}'s own ${tf} candles` };
    }
    const r = await get<{ data?: { t: number; o: string; h: string; l: string; c: string }[] }>(
      `/pacifica/api/v1/kline?symbol=${sym}&interval=${tf}&start_time=${from}&end_time=${to}`, `${name} candles`);
    const ks = (r.data ?? []).map((k) => ({ t: k.t, o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c) }));
    return { candles: clean(ks, from, to), tf, from, to, source: `${name}'s own ${tf} candles` };
  }
  const pool = await topPool(m.mint);
  const [unit, agg] = GECKO_TF[tf];
  const r = await get<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
    `/gecko/networks/solana/pools/${pool.pool}/ohlcv/${unit}?aggregate=${agg}&before_timestamp=${Math.ceil(to / 1000)}&limit=${n}&currency=usd&token=${m.mint}`,
    'GeckoTerminal');
  const ks = (r.data?.attributes?.ohlcv_list ?? []).map(([t, o, h, l, c, v]) => ({ t: t * 1000, o, h, l, c, v }));
  return { candles: clean(ks, from, to), tf, from, to, source: `${tf} candles · ${pool.name}${pool.dex ? ` on ${pool.dex}` : ''} · GeckoTerminal` };
}

/** The trade's candles; an open trade's chart refreshes every 30 s so its last candle stays live. */
export function useTradeCandles(m: Market | null | undefined, openedAt: number | undefined, closedAt: number | undefined) {
  const [s, setS] = useState<{ data?: TradeCandles; error?: string }>({});
  const [n, setN] = useState(0);
  const key = m ? `${m.id}|${openedAt}|${closedAt}` : '';
  useEffect(() => {
    if (!m || !openedAt) return;
    let alive = true;
    setS({});
    const run = () => loadTradeCandles(m, openedAt, closedAt)
      .then((data) => alive && setS({ data }))
      .catch((e: Error) => alive && setS((p) => ({ data: p.data, error: `${e.message} The chart couldn't load.` })));
    run();
    const h = closedAt ? undefined : setInterval(run, 30_000);
    return () => { alive = false; if (h) clearInterval(h); };
  }, [key, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, reload: () => setN((x) => x + 1) };
}
