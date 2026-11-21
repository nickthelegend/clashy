// In Sync (Nov 21): two markets at once. A pair is rolled from `pairs` (both with a fresh price, preferring pairs that
// are really moving). Call SAME (both finish up, or both finish down) or SPLIT (one up, one down); Clashy Bot takes
// the other call. At the bell each market settles on its first live price at or after it: either move exactly 0 is a
// push; same sign → SAME wins, opposite → SPLIT wins. The right call wins 2×. No price within 15 s: stake back.
// p: { pairs: string[][] } (def.pool is every symbol in the pairs)
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Path } from 'react-native-svg';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  BotSays, Choice, Clock, GT, MarketHead, Panel, Pill, Sides, TINTS, bellPrice, fmtPx, mv, nameOf, pathOf, pick, poolList, readEntries, rollMarkets,
  tickerOf, useClock, useLivePool, useRoll, type GameApi, type Line, type Tick,
} from '../kit';

type Call = 'same' | 'split';
type Run = { entry: Record<string, Tick>; t0: number; endsAt: number };
type Final = { bell: Record<string, Tick>; result: Call | null };
type Pt = { t: number; v: number };
type Series = { sym: string; color: string; pts: Pt[] };

const WORD: Record<Call, string> = { same: 'SAME', split: 'SPLIT' };
const SUB: Record<Call, string> = { same: 'Both up or both down', split: 'One up, one down' };
const other = (c: Call): Call => (c === 'same' ? 'split' : 'same');
/** SAME, SPLIT, or null when either one is dead flat (a push). */
const stateOf = (a: number, b: number): Call | null => (a === 0 || b === 0 ? null : (a > 0) === (b > 0) ? 'same' : 'split');

/* the two markets' line colours: never green, red, lavender (you) or pink (the bot), and never the game's own tint */
function hue(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255, gr = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, gr, b), d = mx - Math.min(r, gr, b);
  if (!d) return -1;
  const h = mx === r ? ((gr - b) / d) % 6 : mx === gr ? (b - r) / d + 2 : (r - gr) / d + 4;
  return (h * 60 + 360) % 360;
}
const near = (a: number, b: number) => a >= 0 && b >= 0 && Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) < 30;
function lineColors(tint: string): [string, string] {
  const out = [TINTS.sky as string, GT.gold as string].filter((c) => !near(hue(c), hue(tint)));
  while (out.length < 2) out.push(C.ink);
  return [out[0]!, out[1]!];
}

export default function Sync({ g }: { g: GameApi }) {
  const { def } = g;
  const pairs = useMemo(() => (Array.isArray(def.p?.pairs) ? (def.p!.pairs as unknown[]) : [])
    .filter((x): x is string[] => Array.isArray(x) && x.length === 2 && x.every((s) => typeof s === 'string') && x[0] !== x[1]), [def.p]);
  const live = useLivePool(def.pool);
  const all = useMemo(() => (pairs.length ? [...new Set(pairs.flat())] : poolList(def.pool)), [pairs, def.pool]);
  const [pair, setPair] = useState<string[] | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const bell = useRef(new Map<string, Tick>());
  const settled = useRef(false);
  const left = useClock(g.phase === 'live' ? run?.endsAt : null);
  const colors = lineColors(def.tint);

  const roll = () => {
    if (pairs.length) {
      const ok = pairs.filter((pr) => pr.every((s) => g.feed.fresh(s)));
      const fresh = ok.filter((pr) => pr.join() !== pair?.join());
      const pool = fresh.length ? fresh : ok;
      const moving = pool.filter((pr) => pr.every((s) => g.feed.moving(s)));
      const pr = (moving.length ? moving : pool);
      if (pr.length) setPair([...pick(pr)]);
    } else {
      const two = rollMarkets(g.feed, live, 2);
      if (two) setPair(two);
    }
  };
  const ready = pairs.length ? pairs.some((pr) => pr.every((s) => g.feed.fresh(s))) : live.length >= 2;
  useEffect(() => { if (!pair && ready) roll(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(all, pair, 850);

  const go = async (c: Call) => {
    if (!pair) return;
    // read both entries before taking the stake, and refuse a stale price
    const e = readEntries(g.feed, pair);
    if (!e.ok) { g.fail(`Waiting for a live ${tickerOf(e.stale)} price.`); return; }
    const t0 = Date.now();
    const end = t0 + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setCall(c); setRun({ entry: e.at, t0, endsAt: end });
  };

  // the bell: each market's first live price at or after it
  useEffect(() => {
    if (!run || !pair || !call || settled.current || g.phase !== 'live') return;
    for (const s of pair) {
      if (bell.current.has(s)) continue;
      const b = bellPrice(g, s, run.endsAt);
      if (b === 'quiet') { settled.current = true; g.abandon(`No live ${tickerOf(s)} price came in at the bell, so your stake is back.`); return; }
      if (b !== 'wait') bell.current.set(s, b);
    }
    if (!pair.every((s) => bell.current.has(s))) return;
    settled.current = true;
    const [A, B] = pair as [string, string];
    const bA = bell.current.get(A)!, bB = bell.current.get(B)!;
    const eA = run.entry[A]!, eB = run.entry[B]!;
    const a = bA.p / eA.p - 1, b = bB.p / eB.p - 1;
    const result = stateOf(a, b);
    setFinal({ bell: { [A]: bA, [B]: bB }, result });
    const tA = tickerOf(A), tB = tickerOf(B);
    const lines: Line[] = [
      ['Markets', `${nameOf(g.info, A)} & ${nameOf(g.info, B)}`],
      [`${tA} entry → bell`, `${fmtPx(eA.p)} → ${fmtPx(bA.p)}`],
      [`${tA} move`, mv(a)],
      [`${tB} entry → bell`, `${fmtPx(eB.p)} → ${fmtPx(bB.p)}`],
      [`${tB} move`, mv(b)],
      ['Your call', WORD[call]],
      ['Clashy Bot', WORD[other(call)]],
      ['Result', result ? WORD[result] : 'Flat: push'],
    ];
    if (result === null) {
      const flat = a === 0 && b === 0 ? `Neither ${tA} nor ${tB} moved` : `${a === 0 ? tA : tB} didn't move`;
      g.end(1, `${flat} at the bell. Stake back.`, lines);
      return;
    }
    const what = `${tA} ${mv(a)}, ${tB} ${mv(b)}: ${result === 'same' ? 'the same way' : 'split'}.`;
    g.end(result === call ? 2 : 0, `${what} ${result === call ? 'You called it.' : 'Clashy Bot takes it.'}`, lines);
  });

  if (!pair) {
    return (
      <Panel style={{ alignItems: 'center', gap: 8 }}>
        <Txt v="label">Finding two markets with live prices…</Txt>
        <Txt v="small" style={{ textAlign: 'center' }}>Both markets in a pair need a fresh price before the round can start.</Txt>
      </Panel>
    );
  }
  const [A, B] = pair as [string, string];
  const swatch = (c: string) => <View style={{ width: 22, height: 5, borderRadius: 3, backgroundColor: c }} />;

  if (g.phase === 'setup' || !run || !call) {
    const from = Date.now() - 3 * 60_000;
    const series = pair.map((s, i): Series => {
      const ticks = g.feed.since(s, from);
      const m = g.feed.mark(s);
      if (m && (!ticks.length || ticks[ticks.length - 1]!.t < m.t)) ticks.push({ t: m.t, p: m.p });
      const base = ticks[0]?.p;
      return { sym: s, color: colors[i]!, pts: base ? ticks.map((x) => ({ t: x.t, v: x.p / base - 1 })) : [] };
    });
    return (
      <View style={{ gap: 14 }}>
        <Panel style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="label">Two markets · {def.secs < 60 ? `${def.secs} s` : `${Math.round(def.secs / 60)} min`}</Txt>
            <Pill label="Roll again" onPress={roll} disabled={g.busy} />
          </Row>
          <MarketHead g={g} sym={shown(0) || A} right={swatch(colors[0])} />
          <MarketHead g={g} sym={shown(1) || B} right={swatch(colors[1])} />
        </Panel>
        <View style={{ gap: 6 }}>
          <DualChart w={g.width} series={series} />
          <Txt v="small" style={{ textAlign: 'center' }}>The last 3 minutes, side by side</Txt>
        </View>
        {g.stakeRow}
        <TourTarget id="g-pick">
          <TourTarget id="g-go">
            <Row style={{ gap: 12 }}>
              <Choice title={WORD.same} sub={SUB.same} color={def.tint} onPress={() => void go('same')} disabled={g.busy} h={104} />
              <Choice title={WORD.split} sub={SUB.split} color={C.ink} onPress={() => void go('split')} disabled={g.busy} h={104} />
            </Row>
          </TourTarget>
        </TourTarget>
        <BotSays text="Clashy Bot takes the other side." />
      </View>
    );
  }

  // the round: both markets' % move since their entries (frozen at the bell)
  const moveNow = (s: string) => {
    const e = run.entry[s]!;
    const p = final?.bell[s]?.p ?? g.feed.mark(s)?.p ?? e.p;
    return p / e.p - 1;
  };
  const series = pair.map((s, i): Series => {
    const e = run.entry[s]!;
    const b = final?.bell[s];
    const ticks = pathOf(g.feed, s, e.t, b?.t);
    if (b && (!ticks.length || ticks[ticks.length - 1]!.t < b.t)) ticks.push(b);
    return { sym: s, color: colors[i]!, pts: [{ t: run.t0, v: 0 }, ...ticks.map((x) => ({ t: Math.max(run.t0, x.t), v: x.p / e.p - 1 }))] };
  });
  const a = moveNow(A), b = moveNow(B);
  const now = final ? final.result : stateOf(a, b);
  const lead = now === null ? null : now === call ? 'you' : 'bot';
  const stateColor = (c: Call | null) => (c === 'same' ? def.tint : c === 'split' ? C.ink : C.muted);

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <MarketHead g={g} sym={A} from={run.entry[A]!.p} right={swatch(colors[0])} />
        <MarketHead g={g} sym={B} from={run.entry[B]!.p} right={swatch(colors[1])} />
        {g.phase === 'live' ? <Clock left={left} total={def.secs} tint={def.tint} label="to the bell" /> : null}
      </Panel>
      <DualChart w={g.width} series={series} />
      <Panel tint={now ? stateColor(now) : undefined} style={{ alignItems: 'center', gap: 4 }}>
        <Txt v="small" style={{ ...FONT.semi }}>{final ? 'At the bell' : 'Right now'}</Txt>
        <Text style={{ ...FONT.displayB, fontSize: 40, letterSpacing: -1.4, color: stateColor(now) }}>{now ? WORD[now] : 'FLAT'}</Text>
        <Txt v="small" style={{ fontVariant: ['tabular-nums'], textAlign: 'center' }}>
          {tickerOf(A)} <Text style={{ color: a > 0 ? C.up : a < 0 ? C.down : C.ink }}>{mv(a)}</Text> · {tickerOf(B)} <Text style={{ color: b > 0 ? C.up : b < 0 ? C.down : C.ink }}>{mv(b)}</Text>
        </Txt>
      </Panel>
      <Sides lead={lead}
        you={{ title: WORD[call], color: stateColor(call), sub: SUB[call] }}
        bot={{ title: WORD[other(call)], color: stateColor(other(call)), sub: SUB[other(call)] }} />
      {g.phase === 'live' ? (
        <BotSays text={now === null ? 'One of them is flat right now. Anything can happen.' : lead === 'bot' ? "Right now they're going my way." : "Right now they're going your way. For now."} />
      ) : null}
    </View>
  );
}

/** Both markets' % move on one chart: two lines, the 0% line, and a tag with each one's ticker and move. */
function DualChart({ w, series, h = 200 }: { w: number; series: Series[]; h?: number }) {
  const pts = series.flatMap((s) => s.pts);
  if (series.some((s) => !s.pts.length)) {
    return <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">Loading prices…</Txt></View>;
  }
  let lo = Math.min(0, ...pts.map((p) => p.v)), hi = Math.max(0, ...pts.map((p) => p.v));
  const need = 0.0008;
  if (hi - lo < need) { const mid = (hi + lo) / 2; lo = mid - need / 2; hi = mid + need / 2; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const RG = 86;
  const t0 = Math.min(...pts.map((p) => p.t)), t1 = Math.max(t0 + 1, ...pts.map((p) => p.t));
  const X = (t: number) => 4 + ((t - t0) / (t1 - t0)) * (w - RG - 8);
  const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (h - 16);
  const d = (s: Series) => {
    const p = s.pts.length === 1 ? [s.pts[0]!, { t: t1, v: s.pts[0]!.v }] : s.pts;
    return p.map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)},${Y(x.v).toFixed(1)}`).join(' ');
  };
  // tags at each line's end, pushed apart so they never sit on each other
  const tags = series.map((s) => { const e = s.pts[s.pts.length - 1]!; return { s, y: Y(e.v), v: e.v }; }).sort((a, b) => a.y - b.y);
  const TAG = 32;
  const ys = tags.map((t) => Math.max(0, Math.min(h - TAG, t.y - TAG / 2)));
  for (let i = 1; i < ys.length; i++) if (ys[i]! - ys[i - 1]! < TAG + 2) ys[i] = ys[i - 1]! + TAG + 2;
  for (let i = ys.length - 1; i >= 0; i--) { if (ys[i]! > h - TAG) ys[i] = h - TAG; if (i > 0 && ys[i]! - ys[i - 1]! < TAG + 2) ys[i - 1] = ys[i]! - TAG - 2; }
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {[0.25, 0.5, 0.75].map((f) => <SvgLine key={f} x1={0} x2={w - RG} y1={h * f} y2={h * f} stroke={GT.grid} />)}
        <SvgLine x1={0} x2={w - RG} y1={Y(0)} y2={Y(0)} stroke={C.brandSoft} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 4" />
        {series.map((s) => <Path key={`g${s.sym}`} d={d(s)} stroke={s.color} strokeOpacity={0.22} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        {series.map((s) => <Path key={s.sym} d={d(s)} stroke={s.color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        {series.map((s) => { const e = s.pts[s.pts.length - 1]!; return <Circle key={`e${s.sym}`} cx={X(s.pts.length === 1 ? t1 : e.t)} cy={Y(e.v)} r={4.5} fill={s.color} stroke="#000" strokeWidth={2} />; })}
      </Svg>
      <Text pointerEvents="none" style={{ position: 'absolute', left: 6, top: Math.max(2, Math.min(h - 16, Y(0) - 16)), ...FONT.semi, fontSize: 10.5, color: C.brandSoft }}>0%</Text>
      {tags.map((t, i) => (
        <View key={t.s.sym} pointerEvents="none" style={{ position: 'absolute', right: 2, top: ys[i], width: RG - 8, height: TAG, borderRadius: 8, backgroundColor: GT.raised, borderWidth: 1, borderColor: `${t.s.color}88`, paddingHorizontal: 6, justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10.5, color: t.s.color }}>{tickerOf(t.s.sym)}</Text>
          <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 10.5, color: t.v > 0 ? C.up : t.v < 0 ? C.down : C.ink, fontVariant: ['tabular-nums'] }}>{mv(t.v)}</Text>
        </View>
      ))}
    </View>
  );
}
