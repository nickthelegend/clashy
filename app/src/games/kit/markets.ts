// Picking markets (Nov 20): a game's pool, rolling one or a lineup from the markets that have a live price (and are
// really moving), the slot-machine roll, long/short sides, and the pump.fun coins from Jupiter.
import { useEffect, useMemo, useState } from 'react';
import { loadCatalog, type Market } from '@/chain/practice';
import { C } from '@/ui/tokens';
import { POOLS, poolOf, useLivePool, type Feed, type PoolKey } from '../feed';
import { pick, sample } from '../odds';
import type { GameDef } from '../types';
import type { GameApi } from './api';

/** A game's pool as symbols (pool names, exact symbols, or a mix). */
export function poolList(keys: GameDef['pool']): string[] {
  if (typeof keys === 'string') return poolOf(keys);
  const list = keys as readonly string[];
  return list.every((k) => k in POOLS) ? poolOf(list as PoolKey[]) : [...list];
}

/** A rolled lineup's slot-machine moment: logos flick through, then land. */
export function useRoll(pool: readonly string[], landed: readonly string[] | null, ms = 900) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(false);
    if (!landed?.length) return;
    const h = setInterval(() => setI((x) => x + 1), 90);
    const t = setTimeout(() => { clearInterval(h); setDone(true); }, ms);
    return () => { clearInterval(h); clearTimeout(t); };
  }, [landed?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (k: number) => (done || !landed ? landed?.[k] : pool[(i + k * 3) % Math.max(1, pool.length)]) ?? '';
}

/** A market rolled from the game's pool as soon as one has a live price, with the slot-machine moment and a re-roll. */
export function useRolled(g: GameApi) {
  const live = useLivePool(g.def.pool);
  const [sym, setSym] = useState<string | null>(null);
  // prefer a market that is really moving (US stocks sit still out of hours); feed.moving is true until it has history
  useEffect(() => { if (!sym && live.length) { const mv = live.filter((s) => g.feed.moving(s)); setSym(pick(mv.length ? mv : live)); } }, [sym, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => poolList(g.def.pool), [g.def.pool]);
  const shown = useRoll(all, sym ? [sym] : null, 800);
  const reroll = () => { const o = live.filter((s) => s !== sym); const mv = o.filter((s) => g.feed.moving(s)); if (o.length) setSym(pick(mv.length ? mv : o)); };
  return { sym, setSym, live, shown, reroll };
}

/** Markets that have actually moved lately, when there are enough of them (US stocks sit still after hours). */
export function rollable(g: GameApi, live: string[], need: number) {
  const moving = live.filter((s) => g.feed.moving(s));
  return moving.length >= need ? moving : live;
}

/**
 * `n` markets from a live pool, preferring ones that are really moving (US stocks sit still out of hours).
 * Null while the pool has fewer than `n` live prices.
 */
export function rollMarkets(feed: Feed, live: readonly string[], n: number): string[] | null {
  if (live.length < n) return null;
  const moving = live.filter((s) => feed.moving(s));
  if (moving.length >= n) return sample(moving, n);
  return [...sample(moving, moving.length), ...sample(live.filter((s) => !moving.includes(s)), n - moving.length)];
}

/* ---------- long and short ---------- */
export type Side = 'long' | 'short';
export const dirOf = (s: Side) => (s === 'long' ? 1 : -1);
export const otherSide = (s: Side): Side => (s === 'long' ? 'short' : 'long');
export const sideWord = (s: Side) => (s === 'long' ? 'LONG' : 'SHORT');
export const sideColor = (s: Side) => (s === 'long' ? C.up : C.down);
export const sideGlyph = (s: Side) => (s === 'long' ? '▲' : '▼');

/* ---------- pump.fun coins (Jupiter, via the practice catalog) ---------- */
/** The pump.fun launches trending on Jupiter. `on` false skips the load (an engine that doesn't need them). */
export function useMemes(on = true) {
  const [state, set] = useState<{ memes: Market[] | null; error?: string }>({ memes: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    set({ memes: null });
    loadCatalog(n > 0)
      .then((c) => { if (alive) set({ memes: c.memes }); })
      .catch((e: Error) => { if (alive) set({ memes: null, error: `${e.message} The pump.fun coins couldn't load.` }); });
    return () => { alive = false; };
  }, [on, n]);
  return { ...state, retry: () => setN((x) => x + 1) };
}
