// Shared pieces for the range, cashout, survive, guess, streak and snipe engines (Nov 20): settings readers, a rolled
// market, the bell check, a round's price path, and a price chart that carries several level lines, a shaded band and
// tap dots (the kit's LiveChart draws one reference line). Every price comes from the live feed.
import { useEffect, useId, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Row, Txt } from '@/ui/kit';
import { Scrub } from '@/ui/scrub';
import { C, FONT } from '@/ui/tokens';
import { POOLS, nameOf, poolOf, tickerOf, useLivePool, type PoolKey, type Tick } from '../feed';
import { Logo, Note, Panel, Tag, fmtPx, useRoll, type GameApi } from '../kit';
import { pick, signedPct } from '../odds';
import type { GameDef } from '../types';

/* ---------- settings (def.p) ---------- */
export const pNum = (g: GameApi, k: string, d: number) => { const v = g.def.p?.[k]; return typeof v === 'number' && Number.isFinite(v) ? v : d; };
export const pBool = (g: GameApi, k: string) => g.def.p?.[k] === true;
export function pStr<T extends string>(g: GameApi, k: string, allowed: readonly T[], d: T): T {
  const v = g.def.p?.[k];
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}
export function pNums(g: GameApi, k: string, d: number[]): number[] {
  const v = g.def.p?.[k];
  return Array.isArray(v) && v.length && (v as unknown[]).every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as number[]) : d;
}

/* ---------- formats ---------- */
/** A move with enough digits for a short round: 3 decimals under 1%, 2 above. */
export const mv = (f: number) => signedPct(f, Math.abs(f) < 0.01 ? 3 : 2);
export const absPct = (f: number) => `${(Math.abs(f) * 100).toFixed(Math.abs(f) < 0.01 ? 3 : 2)}%`;
export const secsIn = (t: number, start: number) => `${Math.max(0, Math.round((t - start) / 1000))} s in`;
export const mktLine = (g: GameApi, sym: string) => `${nameOf(g.info, sym)} (${tickerOf(sym)})`;

/* ---------- markets ---------- */
export function poolList(keys: GameDef['pool']): string[] {
  if (typeof keys === 'string') return poolOf(keys);
  const list = keys as readonly string[];
  return list.every((k) => k in POOLS) ? poolOf(list as PoolKey[]) : [...list];
}

/** A market rolled from the game's pool as soon as one has a live price, with the slot-machine moment and a re-roll. */
export function useRolled(g: GameApi) {
  const live = useLivePool(g.def.pool);
  const [sym, setSym] = useState<string | null>(null);
  useEffect(() => { if (!sym && live.length) setSym(pick(live)); }, [sym, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => poolList(g.def.pool), [g.def.pool]);
  const shown = useRoll(all, sym ? [sym] : null, 800);
  const reroll = () => { const o = live.filter((s) => s !== sym); if (o.length) setSym(pick(o)); };
  return { sym, setSym, live, shown, reroll };
}

/** The setup's market card: logo, name, live price, and Roll again. */
export function RolledPanel({ g, sym, shown, onReroll, sub }: { g: GameApi; sym: string | null; shown: (k: number) => string; onReroll?: () => void; sub?: string }) {
  const s = sym ? shown(0) || sym : null;
  const m = sym ? g.feed.mark(sym) : undefined;
  return (
    <Panel style={{ alignItems: 'center', gap: 8 }}>
      {s ? <Logo sym={s} info={g.info} size={76} /> : <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#1D1A28' }} />}
      <Txt v="title" lines={1} style={{ fontSize: 24 }}>{s ? nameOf(g.info, s) : 'Rolling…'}</Txt>
      <Note center>{sym ? `${tickerOf(sym)} · ${fmtPx(m?.p)}${sub ? ` · ${sub}` : ''}` : 'Finding a market with a live price…'}</Note>
      {sym && onReroll ? (
        <Pressable onPress={onReroll} accessibilityRole="button" accessibilityLabel="Roll another market"
          style={({ pressed }) => ({ paddingHorizontal: 18, height: 44, borderRadius: 22, backgroundColor: pressed ? '#26262E' : '#1D1D24', justifyContent: 'center' })}>
          <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll again</Txt>
        </Pressable>
      ) : null}
    </Panel>
  );
}

/* ---------- the bell ---------- */
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
/** A round's prices in order: the entry, every tick after it, and (once it has come) the bell's price, nothing later. */
export function roundPath(g: GameApi, sym: string, entry: Tick, bell?: Tick): Tick[] {
  const out = [entry, ...g.feed.since(sym, entry.t + 1).filter((x) => !bell || x.t <= bell.t)];
  if (bell && out[out.length - 1]!.t < bell.t) out.push(bell);
  return out;
}

/* ---------- pieces ---------- */
/** A small stat tile: label over value. */
export const Stat = ({ k, v, color }: { k: string; v: string; color?: string }) => (
  <View style={{ flex: 1, minWidth: 0, backgroundColor: '#15151B', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12 }}>
    <Txt v="small" lines={1} style={{ fontSize: 12 }}>{k}</Txt>
    <Txt v="label" lines={1} color={color} style={{ fontVariant: ['tabular-nums'], marginTop: 1 }}>{v}</Txt>
  </View>
);

type Side = { title: string; color: string; sub?: string };
/** YOU and CLASHY BOT side by side; the one ahead gets the outline. */
export function Sides({ you, bot, lead }: { you: Side; bot: Side; lead?: 'you' | 'bot' | null }) {
  const card = (who: 'you' | 'bot', s: Side) => (
    <Panel style={{ flex: 1, alignItems: 'center', gap: 6, minWidth: 0 }} tint={lead === who ? (who === 'you' ? C.up : C.opp) : undefined}>
      <Tag text={who === 'you' ? 'YOU' : 'CLASHY BOT'} color={who === 'you' ? C.brand : C.opp} />
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.bold, fontSize: s.title.length > 9 ? 17 : s.title.length > 7 ? 20 : 24, letterSpacing: -0.6, color: s.color, fontVariant: ['tabular-nums'] }}>{s.title}</Text>
      {s.sub ? <Txt v="small" lines={2} style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }}>{s.sub}</Txt> : null}
    </Panel>
  );
  return <Row style={{ gap: 10, alignItems: 'stretch' }}>{card('you', you)}{card('bot', bot)}</Row>;
}

/* ---------- the chart ---------- */
export type Level = { p: number; color: string; label?: string; solid?: boolean; /** always fit it in view */ fit?: boolean };
export type Dot = { t: number; p: number; color: string; label: string };

const smooth = (pts: [number, number][]) => {
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};
const clock = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** A live price chart with level lines (a band's edges, a liquidation, guesses), an optional shaded band and tap dots.
 *  A level far outside the price's range is pinned to the chart's edge with its label instead of squashing the line.
 *  `until` freezes the chart at the bell. */
export function PxChart({ g, sym, from, until, h = 200, entry, levels = [], band, dots = [], color }: {
  g: GameApi; sym: string; from?: number; until?: number; h?: number; entry?: number; levels?: Level[];
  band?: { lo: number; hi: number; color: string }; dots?: Dot[]; color?: string;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withTiming(2.4, { duration: 1100 }), -1, false); }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 1.4 - pulse.value / 2 }));
  const gid = `pxg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const w = g.width;

  let ticks: Tick[] = g.feed.since(sym, from ? from - 1500 : Date.now() - 4 * 60_000);
  if (until !== undefined) ticks = ticks.filter((x) => x.t <= until);
  if (!ticks.length) { const m = g.feed.mark(sym); if (m) ticks = [{ t: m.t, p: m.p }]; }
  if (!ticks.length) return <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">Loading price…</Txt></View>;
  if (ticks.length === 1) ticks = [ticks[0]!, { t: ticks[0]!.t + 1000, p: ticks[0]!.p }];

  const last = ticks[ticks.length - 1]!.p;
  let lo = Math.min(...ticks.map((x) => x.p), ...dots.map((x) => x.p), entry ?? Infinity);
  let hi = Math.max(...ticks.map((x) => x.p), ...dots.map((x) => x.p), entry ?? -Infinity);
  const need = last * 0.0008;
  if (hi - lo < need) { const mid = (hi + lo) / 2; lo = mid - need / 2; hi = mid + need / 2; }
  const span = hi - lo;
  if (band) { lo = Math.min(lo, band.lo); hi = Math.max(hi, band.hi); }
  const shown = levels.filter((l) => l.fit || (l.p >= lo - 4 * span && l.p <= hi + 4 * span));
  for (const l of shown) { lo = Math.min(lo, l.p); hi = Math.max(hi, l.p); }
  const off = levels.filter((l) => !shown.includes(l));
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;

  const RG = 74; // the right gutter for the price tag
  const t0 = ticks[0]!.t, t1 = Math.max(ticks[ticks.length - 1]!.t, t0 + 1);
  const X = (t: number) => 4 + Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) * (w - RG);
  const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (h - 16);
  const pts = ticks.map((x) => [X(x.t), Y(x.p)] as [number, number]);
  const d = smooth(pts);
  const [ex, ey] = pts[pts.length - 1]!;
  const lc = color ?? (entry === undefined ? C.brand : last >= entry ? C.up : C.down);

  // level labels sit above their line, or below it when another label is in the way
  const labels: { y: number; text: string; color: string }[] = [];
  for (const l of [...shown].sort((a, b) => Y(a.p) - Y(b.p))) {
    if (!l.label) continue;
    let y = Y(l.p) - 17;
    const prev = labels[labels.length - 1];
    if (y < 2 || (prev && y - prev.y < 15)) y = Y(l.p) + 4;
    labels.push({ y: Math.max(2, Math.min(h - 16, y)), text: l.label, color: l.color });
  }

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        <Defs><LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={lc} stopOpacity={0.24} /><Stop offset="1" stopColor={lc} stopOpacity={0} /></LinearGradient></Defs>
        {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={0} x2={w - RG + 4} y1={h * f} y2={h * f} stroke="#18181C" />)}
        {band ? <Rect x={0} y={Y(band.hi)} width={w - RG + 4} height={Math.max(1, Y(band.lo) - Y(band.hi))} fill={band.color} fillOpacity={0.11} /> : null}
        <Path d={`${d} L${ex},${h} L${pts[0]![0]},${h}Z`} fill={`url(#${gid})`} />
        {entry !== undefined ? <Line x1={0} x2={w} y1={Y(entry)} y2={Y(entry)} stroke={C.brandSoft} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 4" /> : null}
        {shown.map((l, i) => <Line key={i} x1={0} x2={w} y1={Y(l.p)} y2={Y(l.p)} stroke={l.color} strokeWidth={1.6} strokeDasharray={l.solid ? undefined : '6 5'} />)}
        <Path d={d} stroke={lc} strokeOpacity={0.25} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={d} stroke={lc} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {until === undefined ? <Line x1={ex} x2={w} y1={ey} y2={ey} stroke={lc} strokeOpacity={0.5} strokeDasharray="2 3" /> : null}
        {dots.map((x, i) => <Circle key={i} cx={X(x.t)} cy={Y(x.p)} r={7} fill={x.color} stroke="#000" strokeWidth={2.5} />)}
      </Svg>
      {until === undefined ? (
        <>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: ex - 6, top: ey - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: lc }, ring]} />
          <View pointerEvents="none" style={{ position: 'absolute', left: ex - 5, top: ey - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: lc, borderWidth: 2, borderColor: '#000' }} />
        </>
      ) : null}
      <View pointerEvents="none" style={{ position: 'absolute', right: 4, top: Math.max(2, Math.min(h - 24, ey - 11)), backgroundColor: lc, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 }}>
        <Text style={{ ...FONT.bold, fontSize: 11, color: '#000' }}>{last >= 1000 ? last.toLocaleString('en-US', { maximumFractionDigits: 0 }) : last.toPrecision(5)}</Text>
      </View>
      {labels.map((l, i) => <Text key={i} pointerEvents="none" numberOfLines={1} style={{ position: 'absolute', left: 8, top: l.y, maxWidth: w - RG - 12, ...FONT.bold, fontSize: 10.5, color: l.color }}>{l.text}</Text>)}
      {off.map((l, i) => {
        const above = l.p > hi;
        return (
          <View key={i} pointerEvents="none" style={{ position: 'absolute', left: 8, ...(above ? { top: 4 + i * 22 } : { bottom: 4 + i * 22 }), backgroundColor: '#15151B', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: `${l.color}66` }}>
            <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10.5, color: l.color }}>{above ? '↑' : '↓'} {l.label ?? ''} {fmtPx(l.p)}</Text>
          </View>
        );
      })}
      {dots.map((x, i) => {
        const cx = X(x.t), cy = Y(x.p);
        return (
          <View key={`d${i}`} pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, Math.min(w - 64, cx - 32)), top: cy < 34 ? cy + 10 : cy - 30, width: 64, alignItems: 'center' }}>
            <View style={{ backgroundColor: x.color, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10.5, color: '#0A0A0D' }}>{x.label}</Text>
            </View>
          </View>
        );
      })}
      <Scrub w={w} h={h} n={ticks.length} xAt={(i) => X(ticks[i]!.t)} yAt={(i) => Y(ticks[i]!.p)} color={lc}
        label={(i) => ({ value: fmtPx(ticks[i]!.p), sub: [entry ? `${mv(ticks[i]!.p / entry - 1)} from entry` : null, from ? secsIn(ticks[i]!.t, from) : clock(ticks[i]!.t)].filter(Boolean).join(' · ') })} />
    </View>
  );
}
