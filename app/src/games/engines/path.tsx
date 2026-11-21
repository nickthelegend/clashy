// Path Pick (Nov 21): commit to the whole path before it starts. One rolled market, `legs` legs of def.secs / legs
// each. In setup you pick one of the 2^legs paths (up or down on every leg). Leg k ends on the first live price at or
// after entry + k·legSecs and starts where leg k−1 ended (leg 1 at the entry): up if it ends higher, down if lower,
// flat if equal. A wrong leg ends the round at once (lost). Every leg right pays 0.97 × 2^legs (3.88× for two, 7.76×
// for three); a flat leg and no wrong one is a push. No price within 15 s of a leg's end: stake back.
// p: { legs: 2 | 3 = 2 }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Polyline } from 'react-native-svg';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  Clock, GS, GT, Go, MarketHead, Note, Panel, PxChart, RolledPanel, Tag, bellPrice, fmtPx, fmtX, mktLine, mv, pNum, pick, rollable, tickerOf,
  useClock, useRolled, type Dot, type GameApi, type Line, type Tick,
} from '../kit';

type Dir = 'up' | 'down';
type Real = Dir | 'flat';
type Run = { entry: Tick; t0: number; endsAt: number };

const WORD: Record<Real, string> = { up: 'UP', down: 'DOWN', flat: 'FLAT' };
const GLYPH: Record<Real, string> = { up: '▲', down: '▼', flat: '▬' };
const COLOR: Record<Real, string> = { up: C.up, down: C.down, flat: GT.sub };
/** Every path of `n` legs, up-first: UU, UD, DU, DD. */
const allPaths = (n: number): Dir[][] => Array.from({ length: 2 ** n }, (_, i) => Array.from({ length: n }, (_, k) => ((i >> (n - 1 - k)) & 1 ? 'down' : 'up')));
const realOf = (from: number, to: number): Real => (to > from ? 'up' : to < from ? 'down' : 'flat');
const words = (p: Real[]) => p.map((d) => WORD[d]).join(' · ');

export default function PathPick({ g }: { g: GameApi }) {
  const { def } = g;
  const legs = Math.round(Math.max(2, Math.min(3, pNum(g, 'legs', 2))));
  const legMs = (def.secs * 1000) / legs;
  const legSecs = Math.round(def.secs / legs);
  const pays = 0.97 * 2 ** legs;
  const paths = allPaths(legs);
  const roll = useRolled(g);
  const sym = roll.sym;
  const [choice, setChoice] = useState<Dir[] | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [caps, setCaps] = useState<Tick[]>([]);
  const capsRef = useRef<Tick[]>([]);
  const settled = useRef(false);
  const fixed = useRef(false);
  const nextAt = run && caps.length < legs ? run.t0 + Math.round((caps.length + 1) * legMs) : null;
  const legLeft = useClock(g.phase === 'live' ? nextAt : null);
  const roundLeft = useClock(g.phase === 'live' ? run?.endsAt : null);

  // prefer a market that's really moving (US stocks sit still after hours)
  useEffect(() => {
    if (fixed.current || !sym) return;
    fixed.current = true;
    if (!g.feed.moving(sym)) { const o = roll.live.filter((s) => s !== sym && g.feed.moving(s)); if (o.length) roll.setSym(pick(o)); }
  }, [sym]); // eslint-disable-line react-hooks/exhaustive-deps
  const reroll = () => { const o = rollable(g, roll.live, 2).filter((s) => s !== sym); if (o.length) roll.setSym(pick(o)); };

  /** Leg i's start and end prices, and which way it went, for every leg decided so far. */
  const decided = (run: Run, got: Tick[]) => got.map((end, i) => {
    const start = i === 0 ? run.entry : got[i - 1]!;
    return { start, end, real: realOf(start.p, end.p) };
  });

  const go = async () => {
    if (!sym || !choice) return;
    const m = g.feed.mark(sym);
    // read the entry before taking the stake, and refuse a stale price
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const t0 = Date.now();
    const end = t0 + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setRun({ entry: { t: t0, p: m.p }, t0, endsAt: end });
  };

  // each leg's end: the first live price at or after its boundary; a wrong leg ends it there
  useEffect(() => {
    if (!run || !choice || !sym || settled.current || g.phase !== 'live') return;
    const got = [...capsRef.current];
    let quiet = false;
    while (got.length < legs) {
      const b = bellPrice(g, sym, got.length + 1 === legs ? run.endsAt : run.t0 + Math.round((got.length + 1) * legMs));
      if (b === 'wait') break;
      if (b === 'quiet') { quiet = true; break; }
      got.push(b);
    }
    if (got.length !== capsRef.current.length) { capsRef.current = got; setCaps(got); }
    const d = decided(run, got);
    const receipt = (): Line[] => [
      ['Market', mktLine(g, sym)],
      ...d.flatMap((x, i): Line[] => [
        [`Leg ${i + 1}`, `${fmtPx(x.start.p)} → ${fmtPx(x.end.p)}`],
        [`Leg ${i + 1} move`, `${mv(x.end.p / x.start.p - 1)} ${WORD[x.real]} ${x.real === 'flat' ? '·' : x.real === choice[i] ? '✓' : '✗'}`],
      ]),
      ['Your path', words(choice)],
      ['Real path', d.length < legs ? `${words(d.map((x) => x.real))} (ended)` : words(d.map((x) => x.real))],
      ['Every leg right', fmtX(pays)],
    ];
    const wrong = d.findIndex((x, i) => x.real !== 'flat' && x.real !== choice[i]);
    const tk = tickerOf(sym);
    if (wrong >= 0) {
      settled.current = true;
      const x = d[wrong]!;
      g.end(0, `Leg ${wrong + 1}: ${tk} went ${x.real} (${mv(x.end.p / x.start.p - 1)}). You called ${choice[wrong]}.`, receipt());
      return;
    }
    if (d.length === legs) {
      settled.current = true;
      const flat = d.findIndex((x) => x.real === 'flat');
      if (flat >= 0) g.end(1, `Leg ${flat + 1} was dead flat and no leg was wrong. Stake back.`, receipt());
      else g.end(pays, `Every leg right: ${words(choice)}. ${fmtX(pays)}.`, receipt());
      return;
    }
    if (quiet) { settled.current = true; g.abandon(`No live ${tk} price came at the end of leg ${got.length + 1}, so your stake is back.`); }
  });

  if (g.phase === 'setup' || !run || !choice || !sym) {
    const cols = legs === 2 ? 2 : 4;
    // each card's drawing grows with the card (a 375 px phone up to the 720 px column)
    const zigW = Math.max(48, Math.min(120, (g.width - 32 - 8 * (cols - 1)) / cols - 26));
    return (
      <View style={{ gap: 14 }}>
        <RolledPanel g={g} sym={sym} shown={roll.shown} onReroll={reroll} sub={`${legs} legs of ${legSecs} s`} />
        {sym ? <PxChart g={g} sym={sym} h={130} color={def.tint} /> : null}
        <TourTarget id="g-pick">
          <Panel style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label">Pick the path</Txt>
              <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{legs} legs · {legSecs} s each</Txt>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {paths.map((p) => {
                const key = p.join('');
                const on = choice?.join('') === key;
                return (
                  <PathCard key={key} path={p} on={on} cols={cols} zigW={zigW} disabled={!sym || g.busy}
                    onPress={() => setChoice(p)} />
                );
              })}
            </View>
          </Panel>
        </TourTarget>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title={choice ? `Lock path · ${fmtX(pays)}` : 'Pick a path first'} sub={choice ? words(choice) : undefined}
            color={def.tint} ink={GT.onTint} onPress={() => void go()} disabled={!sym || !choice || g.busy} />
        </TourTarget>
        <Note center>Up or down on every leg. A wrong leg ends it.</Note>
      </View>
    );
  }

  const d = decided(run, caps);
  const m = g.feed.mark(sym);
  const legStart = caps.length ? caps[caps.length - 1]! : run.entry;
  const live = g.phase === 'live' && caps.length < legs;
  const nowDir: Real | null = live && m ? realOf(legStart.p, m.p) : null;
  const legFrac = live && nextAt ? Math.max(0, Math.min(1, 1 - (legLeft ?? 0) / (legMs / 1000))) : 0;
  const dots: Dot[] = d.map((x, i) => ({
    t: x.end.t, p: x.end.p, color: COLOR[x.real],
    label: `Leg ${i + 1} ${x.real === 'flat' ? 'flat' : x.real === choice[i] ? '✓' : '✗'}`,
  }));
  const until = g.phase === 'done' && caps.length ? caps[caps.length - 1]!.t : undefined;

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <MarketHead g={g} sym={sym} from={run.entry.p} right={<Tag text={fmtX(pays)} color={def.tint} />} />
        {g.phase === 'live' ? (
          <Row style={{ gap: 18 }}>
            <View style={{ flex: 1 }}><Clock left={legLeft} total={legMs / 1000} tint={def.tint} label={`leg ${Math.min(legs, caps.length + 1)} of ${legs}`} /></View>
            <View style={{ flex: 1 }}><Clock left={roundLeft} total={def.secs} tint={C.brandSoft} label="round" /></View>
          </Row>
        ) : null}
      </Panel>
      <PxChart g={g} sym={sym} from={run.entry.t} until={until} entry={run.entry.p} h={200} dots={dots} />
      <Panel style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="label">Your path</Txt>
          <Row style={{ gap: 6 }}>
            <Tag text="YOU" color={C.brand} />
            <Tag text="REAL" color={C.ink} />
          </Row>
        </Row>
        <PathDiagram w={g.width - 32} choice={choice} real={d.map((x) => x.real)} nowDir={nowDir} frac={legFrac} />
        <Row style={{ gap: 8 }}>
          {choice.map((c, i) => {
            const x = d[i];
            const state = x ? (x.real === 'flat' ? 'flat' : x.real === c ? 'right' : 'wrong') : i === caps.length && live ? 'now' : 'next';
            return <LegChip key={i} n={i + 1} call={c} state={state} move={x ? x.end.p / x.start.p - 1 : undefined} />;
          })}
        </Row>
      </Panel>
    </View>
  );
}

/** A path card in setup: its zig-zag (each leg green up, red down) and the calls. */
function PathCard({ path, on, cols, zigW, onPress, disabled }: { path: Dir[]; on: boolean; cols: number; zigW: number; onPress: () => void; disabled?: boolean }) {
  const two = path.length === 2;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={path.map((d) => (d === 'up' ? 'up' : 'down')).join(', then ')} accessibilityState={{ selected: on, disabled: !!disabled }}
      style={({ pressed }) => ({
        flexBasis: cols === 2 ? '46%' : '21%', flexGrow: 1, minWidth: 0, minHeight: two ? 92 : 82, borderRadius: GS.radius.tile, paddingVertical: 10, paddingHorizontal: 6,
        alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: on ? GT.selected : GT.raised, borderWidth: 2, borderColor: on ? C.brand : 'transparent',
        opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.95 : 1 }],
      })}>
      <Zig path={path} w={two ? Math.min(zigW, 110) : zigW} h={two ? 38 : 32} />
      {two ? (
        <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 13 }}>
          {path.map((d, i) => <Text key={i} style={{ color: COLOR[d] }}>{i ? <Text style={{ color: C.dim }}> · </Text> : null}{WORD[d]}</Text>)}
        </Text>
      ) : (
        <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 14, letterSpacing: 1 }}>
          {path.map((d, i) => <Text key={i} style={{ color: COLOR[d] }}>{GLYPH[d]}</Text>)}
        </Text>
      )}
    </Pressable>
  );
}

/** A small zig-zag of a path: one segment per leg, green up and red down. */
function Zig({ path, w, h }: { path: Dir[]; w: number; h: number }) {
  const n = path.length;
  const dy = (h / 2 - 4) / n;
  let y = h / 2;
  const pts: [number, number][] = [[4, y]];
  path.forEach((d, i) => { y += d === 'up' ? -dy : dy; pts.push([4 + ((i + 1) / n) * (w - 8), y]); });
  return (
    <Svg width={w} height={h}>
      {path.map((d, i) => <SvgLine key={i} x1={pts[i]![0]} y1={pts[i]![1]} x2={pts[i + 1]![0]} y2={pts[i + 1]![1]} stroke={COLOR[d]} strokeWidth={3} strokeLinecap="round" />)}
      <Circle cx={pts[0]![0]} cy={pts[0]![1]} r={3} fill={C.ink} />
    </Svg>
  );
}

/** Your path (dashed lavender) with the real path drawn over it leg by leg, and the leg in play growing live. */
function PathDiagram({ w, choice, real, nowDir, frac }: { w: number; choice: Dir[]; real: Real[]; nowDir: Real | null; frac: number }) {
  const h = 96;
  const n = choice.length;
  const dy = (h / 2 - 10) / n;
  const x = (k: number) => 8 + (k / n) * (w - 16);
  const step = (d: Real) => (d === 'up' ? -dy : d === 'down' ? dy : 0);
  const mine: [number, number][] = [[x(0), h / 2]];
  choice.forEach((d, i) => mine.push([x(i + 1), mine[i]![1] + step(d)]));
  const got: [number, number][] = [[x(0), h / 2]];
  real.forEach((d, i) => got.push([x(i + 1), got[i]![1] + step(d)]));
  const tip = got[got.length - 1]!;
  return (
    <Svg width={w} height={h}>
      {Array.from({ length: n - 1 }, (_, k) => <SvgLine key={k} x1={x(k + 1)} x2={x(k + 1)} y1={4} y2={h - 4} stroke={GT.hair} strokeWidth={1.5} />)}
      <SvgLine x1={0} x2={w} y1={h / 2} y2={h / 2} stroke={GT.grid} strokeWidth={1} />
      <Polyline points={mine.map(([a, b]) => `${a},${b}`).join(' ')} fill="none" stroke={C.brand} strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />
      {real.map((d, i) => <SvgLine key={i} x1={got[i]![0]} y1={got[i]![1]} x2={got[i + 1]![0]} y2={got[i + 1]![1]} stroke={COLOR[d]} strokeWidth={4} strokeLinecap="round" />)}
      {nowDir && real.length < n ? (
        <SvgLine x1={tip[0]} y1={tip[1]} x2={tip[0] + frac * (x(1) - x(0))} y2={tip[1] + frac * step(nowDir)} stroke={COLOR[nowDir]} strokeOpacity={0.6} strokeWidth={4} strokeLinecap="round" />
      ) : null}
      <Circle cx={x(0)} cy={h / 2} r={4} fill={C.ink} />
      <Circle cx={tip[0]} cy={tip[1]} r={5} fill={real.length ? COLOR[real[real.length - 1]!] : C.ink} stroke="#000" strokeWidth={2} />
    </Svg>
  );
}

/** One leg under the diagram: your call, and ✓ / ✗ / flat once it's decided. */
function LegChip({ n, call, state, move }: { n: number; call: Dir; state: 'right' | 'wrong' | 'flat' | 'now' | 'next'; move?: number }) {
  const mark = state === 'right' ? '✓' : state === 'wrong' ? '✗' : state === 'flat' ? 'flat' : state === 'now' ? 'now' : '';
  const markColor = state === 'right' ? C.up : state === 'wrong' ? C.down : state === 'now' ? C.ink : C.muted;
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: GT.raised, borderRadius: GS.radius.stat, paddingVertical: 8, paddingHorizontal: 10, gap: 2, borderWidth: 2, borderColor: state === 'now' ? C.brand : 'transparent' }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="small" style={{ fontSize: 12 }}>Leg {n}</Txt>
        <Text style={{ ...FONT.bold, fontSize: 12.5, color: markColor }}>{mark}</Text>
      </Row>
      <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 15, color: COLOR[call] }}>{GLYPH[call]} {WORD[call]}</Text>
      <Txt v="small" lines={1} style={{ fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{move === undefined ? (state === 'now' ? 'in play' : 'to come') : mv(move)}</Txt>
    </View>
  );
}
