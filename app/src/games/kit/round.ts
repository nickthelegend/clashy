// A round's clock and prices (Nov 20): the countdown, entry prices, the first price at or after a moment (the bell, a
// cut), and a market's path since the entry. Every price comes from the live feed; nothing is filled in.
import { useEffect, useState } from 'react';
import type { Feed, Tick } from '../feed';
import type { GameApi } from './api';

/** Seconds left until `endsAt` (ticks five times a second while running). */
export function useClock(endsAt?: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const h = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(h);
  }, [endsAt]);
  return endsAt ? Math.max(0, (endsAt - now) / 1000) : null;
}

/** Abandon (refund) a round when no price came within this long of the bell. */
export const QUIET_MS = 15_000;
/** The first live price at or after `endsAt`: 'wait' until it comes, 'quiet' when none came within 15 s of the bell. */
export function bellPrice(g: GameApi, sym: string, endsAt: number): Tick | 'wait' | 'quiet' {
  const now = Date.now();
  if (now < endsAt) return 'wait';
  const first = g.feed.since(sym, endsAt)[0];
  if (first) return first;
  const m = g.feed.mark(sym);
  if (m && m.t >= endsAt) return { t: m.t, p: m.p };
  return now > endsAt + QUIET_MS ? 'quiet' : 'wait';
}

/** Keeps the first price at or after `at` for each symbol in `ref` as it arrives; returns them once every one is in. */
export function bellPrices(g: GameApi, syms: readonly string[], at: number, ref: { current: Record<string, number> }) {
  for (const s of syms) {
    if (ref.current[s] !== undefined) continue;
    const m = g.feed.mark(s);
    if (m && m.t >= at) ref.current[s] = m.p;
  }
  return syms.every((s) => ref.current[s] !== undefined) ? { ...ref.current } : null;
}

/** A round's prices in order: the entry, every tick after it, and (once it has come) the bell's price, nothing later. */
export function roundPath(g: GameApi, sym: string, entry: Tick, bell?: Tick): Tick[] {
  const out = [entry, ...g.feed.since(sym, entry.t + 1).filter((x) => !bell || x.t <= bell.t)];
  if (bell && out[out.length - 1]!.t < bell.t) out.push(bell);
  return out;
}

/** Every entry price as a tick, or the first symbol that has no fresh price. */
export function readEntries(feed: Feed, syms: readonly string[]): { ok: true; at: Record<string, Tick> } | { ok: false; stale: string } {
  const at: Record<string, Tick> = {};
  for (const s of syms) {
    const m = feed.mark(s);
    if (!m || !feed.fresh(s)) return { ok: false, stale: s };
    at[s] = { t: m.t, p: m.p };
  }
  return { ok: true, at };
}

/**
 * Keeps each symbol's first price at or after `t` (the feed re-renders on every poll, so calling this on every render
 * catches the first poll after the moment). True once every symbol has one.
 */
export function captureAt(store: Map<string, Tick>, feed: Feed, syms: readonly string[], t: number) {
  for (const s of syms) {
    if (store.has(s)) continue;
    const m = feed.mark(s);
    if (m && m.t >= t) store.set(s, { t: m.t, p: m.p });
  }
  return syms.every((s) => store.has(s));
}

/** A market's ticks after its entry tick, up to `upto` (inclusive), with the latest mark on the end when it's newer. */
export function pathOf(feed: Feed, sym: string, entryT: number, upto = Infinity): Tick[] {
  const ticks = feed.since(sym, entryT + 1).filter((x) => x.t <= upto);
  const m = feed.mark(sym);
  if (m && m.t > entryT && m.t <= upto && (!ticks.length || ticks[ticks.length - 1]!.t < m.t)) ticks.push({ t: m.t, p: m.p });
  return ticks;
}
