// Shared bits for the flip, add-once, bingo, bracket, elimination and leader engines (Nov 20): reading entry prices,
// catching the first price at or after a moment (the bell, a cut), walking a market's ticks since the entry, and the
// small pieces those six screens draw the same way.
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { sample } from '../odds';
import type { Feed, Tick } from '../feed';

export type Side = 'long' | 'short';
export const dirOf = (s: Side) => (s === 'long' ? 1 : -1);
export const otherSide = (s: Side): Side => (s === 'long' ? 'short' : 'long');
export const sideWord = (s: Side) => (s === 'long' ? 'LONG' : 'SHORT');
export const sideColor = (s: Side) => (s === 'long' ? C.up : C.down);
export const sideGlyph = (s: Side) => (s === 'long' ? '▲' : '▼');

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

/** A small secondary button (Roll again, New cards): 44 px tall. */
export function Pill({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: pressed ? '#26262E' : '#1D1D24', justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.45 : 1 })}>
      <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{label}</Txt>
    </Pressable>
  );
}

/** The line a game shows while it waits for live prices (with an optional progress bar). */
export function Waiting({ text, sub, progress, tint = C.brand }: { text: string; sub?: string; progress?: number; tint?: string }) {
  return (
    <View style={{ backgroundColor: '#111116', borderRadius: 24, padding: 18, gap: 10, alignItems: 'center' }}>
      <Txt v="label" style={{ textAlign: 'center' }}>{text}</Txt>
      {sub ? <Txt v="small" style={{ textAlign: 'center' }}>{sub}</Txt> : null}
      {progress !== undefined ? (
        <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: '#1C1C22', overflow: 'hidden' }}>
          <View style={{ height: 6, borderRadius: 3, width: `${Math.max(2, Math.min(100, progress * 100))}%`, backgroundColor: tint }} />
        </View>
      ) : null}
    </View>
  );
}

/** A label / value line inside a panel. */
export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', gap: 12 }}>
      <Txt v="small">{label}</Txt>
      <Txt v="small" color={color ?? C.ink} lines={1} style={{ ...FONT.semi, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </Row>
  );
}
