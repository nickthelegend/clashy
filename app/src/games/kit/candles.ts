// Real past candles for the replay games (Nov 21): the last few hours of 1-minute or 5-minute candles of a market, so
// an instant game can show a stretch of real history and ask what came next. Phoenix's mark-price candles first (its
// trade candles sit flat on thin markets), Pacifica's for the markets only Pacifica lists. Nothing is made up: a
// market whose candles don't load is skipped, and the game says so.
import { useEffect, useState } from 'react';
import { mktGet } from '@/chain/venues';
import { PAC_ALIAS } from '../feed';
import { sample } from '../odds';

export type GCandle = { t: number; o: number; h: number; l: number; c: number };
export type CandleTf = '1m' | '5m';
const TF_MS: Record<CandleTf, number> = { '1m': 60_000, '5m': 300_000 };
const PAC_NAME: Record<string, string> = Object.fromEntries(Object.entries(PAC_ALIAS).map(([pac, ours]) => [ours, pac]));
const ok = (k: GCandle) => [k.o, k.h, k.l, k.c].every((v) => Number.isFinite(v) && v > 0);

type PhxCandle = { time: number; open: number; high: number; low: number; close: number; markOpen?: number; markHigh?: number; markLow?: number; markClose?: number };
type PacCandle = { t: number; o: string; h: string; l: string; c: string };

const cache = new Map<string, { at: number; p: Promise<GCandle[]> }>();
/** The last `n` closed candles of `sym`, oldest first. Throws a readable error when neither venue sends them. */
export function loadGameCandles(sym: string, tf: CandleTf, n = 120): Promise<GCandle[]> {
  const key = `${sym}:${tf}:${n}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    let out: GCandle[] = [];
    try {
      const r = await mktGet<PhxCandle[]>(`/phoenix/v1/candles/${encodeURIComponent(sym)}?timeframe=${tf}&limit=${n + 1}`, 'Phoenix candles');
      out = (Array.isArray(r) ? r : []).map((k) => ({ t: k.time, o: k.markOpen ?? k.open, h: k.markHigh ?? k.high, l: k.markLow ?? k.low, c: k.markClose ?? k.close })).filter(ok);
    } catch { /* Pacifica next */ }
    if (out.length < Math.min(n, 30)) {
      const start = Math.floor((Date.now() - (n + 1) * TF_MS[tf]) / 60_000) * 60_000;
      const r = await mktGet<{ data?: PacCandle[] }>(`/pacifica/api/v1/kline?symbol=${encodeURIComponent(PAC_NAME[sym] ?? sym)}&interval=${tf}&start_time=${start}`, 'Pacifica candles');
      out = (r.data ?? []).map((k) => ({ t: k.t, o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c) })).filter(ok);
    }
    out.sort((a, b) => a.t - b.t);
    // the last candle is still open: drop it, so every candle shown is final
    const closed = out.filter((k) => k.t + TF_MS[tf] <= Date.now());
    if (closed.length < 20) throw new Error(`Not enough ${tf} candles for ${sym} right now.`);
    return closed.slice(-n);
  })();
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}

/** A stretch of history: `show` candles you see, then `hide` candles that decide the answer. */
export type Window = { sym: string; tf: CandleTf; seen: GCandle[]; hidden: GCandle[] };
/** A random window of real history inside the last `n` candles. */
export function pickWindow(sym: string, tf: CandleTf, all: GCandle[], show: number, hide: number): Window | null {
  if (all.length < show + hide) return null;
  const start = Math.floor(Math.random() * (all.length - show - hide + 1));
  return { sym, tf, seen: all.slice(start, start + show), hidden: all.slice(start + show, start + show + hide) };
}

/** Candles for several markets at once (the ones that load); `need` is how many must load for the game to start. */
export function useGameCandles(syms: readonly string[] | null, tf: CandleTf, n = 120, need = 1) {
  const [state, set] = useState<{ data: Record<string, GCandle[]> | null; error?: string }>({ data: null });
  const [k, setK] = useState(0);
  const key = syms?.join(',') ?? '';
  useEffect(() => {
    if (!syms?.length) return;
    let alive = true;
    set({ data: null });
    Promise.allSettled(syms.map((s) => loadGameCandles(s, tf, n))).then((rs) => {
      if (!alive) return;
      const data: Record<string, GCandle[]> = {};
      rs.forEach((r, i) => { if (r.status === 'fulfilled') data[syms[i]!] = r.value; });
      const firstErr = rs.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (Object.keys(data).length >= need) set({ data });
      else set({ data: null, error: `${(firstErr?.reason as Error | undefined)?.message ?? 'No candles came back.'} The past prices couldn't load.` });
    });
    return () => { alive = false; };
  }, [key, tf, n, need, k]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, retry: () => setK((x) => x + 1) };
}

/** `k` random symbols from a pool, for a candle game that needs a few markets. */
export const candleSyms = (pool: readonly string[], k: number) => sample(pool, Math.min(k, pool.length));
/** A candle's time as "2:41 PM". */
export const candleTime = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
