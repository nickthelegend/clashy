// The games' price chart (Nov 20): one market's live line with level lines (a band's edges, a liquidation, guesses,
// targets), an optional shaded band and tap dots, a pulsing live point, a price tag, and scrubbing. The kit's
// MarketChart (LiveChart) draws one reference line; this one draws as many as a game needs.
import { useEffect, useId } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Txt } from '@/ui/kit';
import { Scrub } from '@/ui/scrub';
import { C, FONT } from '@/ui/tokens';
import type { Tick } from '../feed';
import type { GameApi } from './api';
import { fmtPx, mv, secsIn } from './format';
import { GT } from './tokens';

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
        {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={0} x2={w - RG + 4} y1={h * f} y2={h * f} stroke={GT.grid} />)}
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
          <View key={i} pointerEvents="none" style={{ position: 'absolute', left: 8, ...(above ? { top: 4 + i * 22 } : { bottom: 4 + i * 22 }), backgroundColor: GT.raised, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: `${l.color}66` }}>
            <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10.5, color: l.color }}>{above ? '↑' : '↓'} {l.label ?? ''} {fmtPx(l.p)}</Text>
          </View>
        );
      })}
      {dots.map((x, i) => {
        const cx = X(x.t), cy = Y(x.p);
        return (
          <View key={`d${i}`} pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, Math.min(w - 64, cx - 32)), top: cy < 34 ? cy + 10 : cy - 30, width: 64, alignItems: 'center' }}>
            <View style={{ backgroundColor: x.color, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10.5, color: GT.onTint }}>{x.label}</Text>
            </View>
          </View>
        );
      })}
      <Scrub w={w} h={h} n={ticks.length} xAt={(i) => X(ticks[i]!.t)} yAt={(i) => Y(ticks[i]!.p)} color={lc}
        label={(i) => ({ value: fmtPx(ticks[i]!.p), sub: [entry ? `${mv(ticks[i]!.p / entry - 1)} from entry` : null, from ? secsIn(ticks[i]!.t, from) : clock(ticks[i]!.t)].filter(Boolean).join(' · ') })} />
    </View>
  );
}

/* ---------- candles ---------- */
type Candle = { t: number; o: number; h: number; l: number; c: number };
/** Real OHLC candles. `hidden` candles sit behind a curtain ("?") until `reveal`; then they fade in, so a replay game can
 *  show history and ask what came next. `levels` draws guesses and targets across it. No axis labels: `labels` false
 *  also hides the price tag (Who's That Chart).
 *  Nov 21 additions (all optional): `revealCount` brings the hidden candles in one by one while revealing (the scale
 *  already fits them all, so nothing jumps); `markLast` draws a line from the last seen close across the curtain
 *  ("higher or lower than here"); `domain` fixes the price range (a guess slider's range), so the chart doesn't rescale
 *  while a level moves. Level labels step out of each other's way. */
export function CandleChart({ seen, hidden = [], reveal = false, revealCount, w, h = 200, levels = [], labels = true, tint = C.brand, markLast = false, domain }: {
  seen: Candle[]; hidden?: Candle[]; reveal?: boolean; revealCount?: number; w: number; h?: number; levels?: Level[]; labels?: boolean; tint?: string;
  markLast?: boolean; domain?: { lo: number; hi: number };
}) {
  const all = [...seen, ...hidden];
  if (!all.length) return <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">Loading candles…</Txt></View>;
  const inView = reveal ? all : seen;
  // how many hidden candles are drawn: none before the reveal, then `revealCount` of them (all when it's not set)
  const open = !reveal ? 0 : revealCount === undefined ? hidden.length : Math.max(0, Math.min(hidden.length, Math.floor(revealCount)));
  let lo = Math.min(...inView.map((k) => k.l), ...levels.map((l) => l.p));
  let hi = Math.max(...inView.map((k) => k.h), ...levels.map((l) => l.p));
  if (domain && Number.isFinite(domain.lo) && Number.isFinite(domain.hi)) { lo = Math.min(lo, domain.lo); hi = Math.max(hi, domain.hi); }
  else if (!reveal && hidden.length) { const span = hi - lo || hi * 0.001; lo -= span * 0.35; hi += span * 0.35; }
  if (hi - lo < hi * 0.0005) { const m = (hi + lo) / 2; lo = m * 0.99975; hi = m * 1.00025; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const RG = labels ? 64 : 8;
  const n = all.length;
  const slot = (w - RG) / n;
  const bw = Math.max(2, Math.min(12, slot * 0.62));
  const X = (i: number) => slot * i + slot / 2;
  const Y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (h - 12);
  const curtainX = slot * seen.length;
  // the curtain covers what's still hidden: everything before the reveal, the rest while candles come in
  const coverX = slot * (seen.length + open);
  const covered = hidden.length > 0 && open < hidden.length;
  const visible = all.slice(0, seen.length + open);
  const last = visible[visible.length - 1] ?? all[0]!;
  const ref = seen[seen.length - 1];

  // level labels sit above their line, or below it when another label is in the way
  const tags: { y: number; text: string; color: string }[] = [];
  for (const l of [...levels].filter((x) => x.label).sort((a, b) => Y(a.p) - Y(b.p))) {
    let y = Y(l.p) - 17;
    const prev = tags[tags.length - 1];
    if (y < 2 || (prev && y - prev.y < 15)) y = Y(l.p) + 4;
    if (prev && y - prev.y < 15) y = prev.y + 15;
    tags.push({ y: Math.max(2, Math.min(h - 16, y)), text: l.label!, color: l.color });
  }

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={0} x2={w - RG + 4} y1={h * f} y2={h * f} stroke={GT.grid} />)}
        {covered ? <Rect x={coverX} y={0} width={Math.max(0, w - RG - coverX + 4)} height={h} rx={12} fill={tint} fillOpacity={0.08} /> : null}
        {levels.map((l, i) => <Line key={`l${i}`} x1={0} x2={w} y1={Y(l.p)} y2={Y(l.p)} stroke={l.color} strokeWidth={1.6} strokeDasharray={l.solid ? undefined : '6 5'} />)}
        {markLast && ref ? <Line x1={X(seen.length - 1)} x2={w - RG + 4} y1={Y(ref.c)} y2={Y(ref.c)} stroke={C.ink} strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="2 4" /> : null}
        {visible.map((k, i) => {
          const up = k.c >= k.o;
          const col = up ? C.up : C.down;
          const y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c));
          return (
            <G key={k.t} opacity={i >= seen.length ? 0.95 : 1}>
              <Line x1={X(i)} x2={X(i)} y1={Y(k.h)} y2={Y(k.l)} stroke={col} strokeWidth={1.4} />
              <Rect x={X(i) - bw / 2} y={y1} width={bw} height={Math.max(1.5, y2 - y1)} rx={1.5} fill={col} />
            </G>
          );
        })}
        {markLast && ref ? <Circle cx={X(seen.length - 1)} cy={Y(ref.c)} r={3.5} fill={C.ink} stroke="#000" strokeWidth={1.5} /> : null}
        {hidden.length ? <Line x1={curtainX} x2={curtainX} y1={0} y2={h} stroke={tint} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 4" /> : null}
      </Svg>
      {hidden.length && !reveal ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: curtainX, width: w - RG - curtainX + 4, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...FONT.displayB, fontSize: 34, color: tint, opacity: 0.85 }}>?</Text>
        </View>
      ) : null}
      {labels ? (
        <View pointerEvents="none" style={{ position: 'absolute', right: 2, top: Math.max(2, Math.min(h - 24, Y(last.c) - 11)), backgroundColor: last.c >= last.o ? C.up : C.down, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 }}>
          <Text style={{ ...FONT.bold, fontSize: 11, color: '#000' }}>{last.c >= 1000 ? last.c.toLocaleString('en-US', { maximumFractionDigits: 0 }) : last.c.toPrecision(5)}</Text>
        </View>
      ) : null}
      {tags.map((l, i) => (
        <Text key={`t${i}`} pointerEvents="none" numberOfLines={1} style={{ position: 'absolute', left: 6, top: l.y, maxWidth: w - RG - 10, ...FONT.bold, fontSize: 10.5, color: l.color }}>{l.text}</Text>
      ))}
    </View>
  );
}
