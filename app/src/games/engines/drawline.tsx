// Draw the Line (Nov 27): draw where the price goes next, then watch the real line draw over yours. One rolled market;
// the canvas shows its last minute up to a "now" line, and the next `secs` seconds are blank. Drag a finger across that
// blank part to draw your line (left to right). Clashy Bot draws one too. When you lock it, the round starts and every
// live price that comes in is plotted over both lines. A price that lands within the band of a line, or crosses it, is
// a touch (a dot lights up on that line). At the bell, more touches than Clashy Bot wins 2x, the same number is a push.
// The band is a tenth of the canvas height, which spans 2.5 expected moves either side of the entry (sigmaOf).
// p: { band?: number = 0.1 }
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, tickerOf } from '../feed';
import { BotSays, Clock, GT, Go, MarketHead, Note, Panel, Pill, StatTile, Tag, Waiting, fallbackSigma, fmtPx, sigmaOf, useClock, useRolled, type GameApi, type Tick } from '../kit';

const H = 300, PAST_MS = 60_000, NOW_X = 0.34, GUT = 6;
type Pt = { f: number; y: number }; // f: 0..1 across the future part; y: price

/** The line as a price at each fraction of the round (straight segments between the drawn points). */
function at(line: Pt[], f: number): number | null {
  if (line.length < 2 || f < line[0].f || f > line[line.length - 1].f) return null;
  for (let k = 1; k < line.length; k++) {
    if (f <= line[k].f) { const a = line[k - 1], b = line[k]; const u = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f); return a.y + (b.y - a.y) * u; }
  }
  return line[line.length - 1].y;
}

/** Clashy Bot's line: a smooth wander from the entry (a few random bends), never more than 1.6 expected moves away. */
function botLine(p0: number, move: number): Pt[] {
  const bends = 5; let y = p0; const pts: Pt[] = [{ f: 0, y: p0 }];
  for (let k = 1; k <= bends; k++) { y = Math.max(p0 - 1.6 * move, Math.min(p0 + 1.6 * move, y + (Math.random() - 0.5) * move * 1.1)); pts.push({ f: k / bends, y }); }
  return pts;
}

function touches(line: Pt[], ticks: Tick[], t0: number, span: number, band: number) {
  const hits: Tick[] = []; let prev: number | null = null;
  for (const x of ticks) {
    const f = (x.t - t0) / span; const y = at(line, Math.min(1, Math.max(0, f)));
    if (y === null) continue;
    const d = x.p - y;
    const crossed = prev !== null && Math.sign(prev) !== Math.sign(d) && d !== 0;
    if (Math.abs(d) <= band || crossed) hits.push(x);
    prev = d;
  }
  return hits;
}

export default function DrawLine({ g }: { g: GameApi }) {
  const { def } = g;
  const span = def.secs * 1000;
  const { sym, shown, reroll } = useRolled(g);
  const [mine, setMine] = useState<Pt[]>([]);
  const [bot, setBot] = useState<Pt[]>([]);
  const [t0, setT0] = useState<number | null>(null);
  const [p0, setP0] = useState<number | null>(null);
  const [frame, setFrame] = useState<{ p0: number; move: number } | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);
  const [w, setW] = useState(0);
  const m = sym ? g.feed.mark(sym) : undefined;

  // the canvas's price scale: fixed while you draw (from the price when the market landed), kept through the round
  useEffect(() => {
    if (!sym || frame || !m) return;
    const sg = sigmaOf(g.feed, sym, fallbackSigma(sym));
    setFrame({ p0: m.p, move: m.p * sg * Math.sqrt(def.secs) });
  }, [sym, m?.p, frame]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFrame(null); setMine([]); }, [sym]);

  const fx = w * NOW_X, fw = w - fx - GUT;
  const top = frame ? frame.p0 + 2.5 * frame.move : 0, bottom = frame ? frame.p0 - 2.5 * frame.move : 0;
  const Y = (p: number) => Math.max(2, Math.min(H - 2, ((top - p) / (top - bottom || 1)) * H));
  const P = (y: number) => top - (y / H) * (top - bottom);
  const band = frame ? (top - bottom) * Number(def.p?.band ?? 0.1) / 2 : 0;

  // drawing: drag across the blank part; x only moves forward, so the line is a function of time
  const drawing = useRef<Pt[]>([]);
  const canDraw = g.phase === 'setup' && !!frame && w > 0;
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => canDraw,
    onMoveShouldSetPanResponder: () => canDraw,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      const f = Math.max(0, (x - fx) / fw);
      drawing.current = [{ f: 0, y: frame!.p0 }, ...(f > 0.01 ? [{ f: Math.min(1, f), y: P(y) }] : [])];
      setMine(drawing.current);
      Haptics.selectionAsync().catch(() => {});
    },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      const f = Math.min(1, (x - fx) / fw);
      const last = drawing.current[drawing.current.length - 1];
      if (f <= last.f + 0.004) return;
      drawing.current = [...drawing.current, { f, y: P(Math.max(0, Math.min(H, y))) }];
      setMine(drawing.current);
    },
  }), [canDraw, fx, fw, frame?.p0, top, bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = mine.length > 2 && mine[mine.length - 1].f >= 0.9;
  const lock = async () => {
    if (!sym || !frame || !complete) return;
    const mk = g.feed.mark(sym);
    if (!mk || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const end = Date.now() + span;
    if (!(await g.begin(end))) return;
    // your line starts at the price you locked on, so the first touch is the round's own first price
    const shift = mk.p - frame.p0;
    setMine((l) => [...l.map((x) => ({ f: x.f, y: x.y + shift })), ...(l[l.length - 1].f < 1 ? [{ f: 1, y: l[l.length - 1].y + shift }] : [])]);
    setBot(botLine(mk.p, frame.move));
    setT0(Date.now()); setP0(mk.p); setEndsAt(end);
  };

  // the round's prices: from the lock to the bell (a tick after the bell neither scores nor draws)
  const live = sym && t0 ? g.feed.since(sym, t0).filter((x) => !endsAt || x.t <= endsAt) : [];
  const mineHits = t0 ? touches(mine, live, t0, span, band) : [];
  const botHits = t0 ? touches(bot, live, t0, span, band) : [];

  // the bell
  useEffect(() => {
    if (!sym || !t0 || !endsAt || !p0 || settled.current || g.phase !== 'live') return;
    const mk = g.feed.mark(sym);
    if (Date.now() < endsAt) return;
    if (mk && mk.t >= endsAt) {
      settled.current = true;
      const ticks = g.feed.since(sym, t0).filter((x) => x.t <= endsAt);
      const a = touches(mine, ticks, t0, span, band).length, b = touches(bot, ticks, t0, span, band).length;
      const lines: [string, string][] = [['Market', `${nameOf(g.info, sym)} (${tickerOf(sym)})`], ['Your touches', `${a} of ${ticks.length} prices`], ['Clashy Bot', `${b} of ${ticks.length} prices`], ['Entry', fmtPx(p0)], ['Price at the bell', fmtPx(mk.p)]];
      g.end(a === b ? 1 : a > b ? 2 : 0, a === b ? `${a} touches each. Push.` : a > b ? `Your line touched the price ${a} times to ${b}.` : `Clashy Bot's line touched it ${b} times to your ${a}.`, lines);
    } else if (Date.now() > endsAt + 15_000) {
      settled.current = true;
      g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`);
    }
  });

  if (!sym) return <Waiting text="Finding a market with a live price…" tint={def.tint} />;

  // what the canvas draws: the past minute, the drawn lines, the live line and the touches
  const T0 = t0 ?? Date.now();
  const X = (t: number) => (t <= T0 ? fx - ((T0 - t) / PAST_MS) * fx : fx + ((t - T0) / span) * fw);
  const past = g.feed.since(sym, T0 - PAST_MS).filter((x) => x.t <= T0);
  const pathOf = (pts: { x: number; y: number }[]) => (pts.length > 1 ? `M${pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' L')}` : '');
  const lineD = (l: Pt[]) => pathOf(l.map((q) => ({ x: fx + q.f * fw, y: Y(q.y) })));
  const pastD = pathOf(past.map((x) => ({ x: X(x.t), y: Y(x.p) })));
  const liveD = pathOf([...(p0 ? [{ x: fx, y: Y(p0) }] : []), ...live.map((x) => ({ x: X(x.t), y: Y(x.p) }))]);
  const lastLive = live[live.length - 1];

  const canvas = (
    <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} {...pan.panHandlers}
      style={{ height: H, borderRadius: 22, backgroundColor: GT.panel, overflow: 'hidden' }}>
      {w > 0 && frame ? (
        <Svg width={w} height={H}>
          <Rect x={fx} y={0} width={w - fx} height={H} fill="#FFFFFF" fillOpacity={g.phase === 'setup' ? 0.035 : 0.02} />
          {[0.25, 0.5, 0.75].map((k) => <Line key={k} x1={0} x2={w} y1={H * k} y2={H * k} stroke={GT.grid} strokeWidth={1} />)}
          <Line x1={fx} x2={fx} y1={0} y2={H} stroke={C.ink} strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="3 4" />
          {pastD ? <Path d={pastD} stroke={C.ink} strokeOpacity={0.75} strokeWidth={2} fill="none" strokeLinejoin="round" /> : null}
          {bot.length ? <Path d={lineD(bot)} stroke={C.opp} strokeWidth={3} strokeDasharray="7 6" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {mine.length > 1 ? <Path d={lineD(mine)} stroke={def.tint} strokeOpacity={0.28} strokeWidth={Math.max(6, (band / (top - bottom)) * H * 2)} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {mine.length > 1 ? <Path d={lineD(mine)} stroke={def.tint} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {liveD ? <Path d={liveD} stroke={C.ink} strokeWidth={2.6} fill="none" strokeLinejoin="round" /> : null}
          {botHits.map((x) => <Circle key={`b${x.t}`} cx={X(x.t)} cy={Y(x.p)} r={5} fill={C.opp} />)}
          {mineHits.map((x) => <Circle key={`m${x.t}`} cx={X(x.t)} cy={Y(x.p)} r={7} fill={C.up} stroke={C.bg} strokeWidth={2} />)}
          {lastLive ? <Circle cx={X(lastLive.t)} cy={Y(lastLive.p)} r={5} fill={C.ink} /> : null}
        </Svg>
      ) : null}
      {g.phase === 'setup' && frame && mine.length < 2 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: fx, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Text style={{ ...FONT.bold, fontSize: 17, color: C.ink, textAlign: 'center' }}>Draw the next {def.secs} seconds</Text>
          <Text style={{ ...FONT.medium, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 4 }}>Drag from the now line to the right edge</Text>
        </View>
      ) : null}
      <Text pointerEvents="none" style={{ position: 'absolute', left: fx - 44, width: 40, bottom: 6, textAlign: 'right', ...FONT.bold, fontSize: 10, color: C.ink }}>now</Text>
      <Text pointerEvents="none" style={{ position: 'absolute', right: 10, bottom: 6, ...FONT.semi, fontSize: 10, color: C.muted }}>+{def.secs}s</Text>
    </View>
  );

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <Panel><MarketHead g={g} sym={shown(0) || sym} right={<Pill label="Roll again" onPress={reroll} disabled={g.busy} />} /></Panel>
        <TourTarget id="g-pick">{canvas}</TourTarget>
        <Row style={{ justifyContent: 'space-between' }}>
          <Note>{complete ? 'Your line is drawn. Lock it in, or draw again.' : 'Draw where you think the price goes.'}</Note>
          {mine.length ? <Pressable onPress={() => setMine([])} accessibilityRole="button" hitSlop={8}><Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Clear</Txt></Pressable> : null}
        </Row>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title={complete ? 'Lock my line' : 'Draw your line first'} sub="Clashy Bot draws one too · more touches wins 2×" onPress={() => void lock()} disabled={!complete || g.busy} color={def.tint} ink={GT.onTint} />
        </TourTarget>
      </View>
    );
  }

  const ahead = mineHits.length - botHits.length;
  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <MarketHead g={g} sym={sym} from={p0 ?? undefined} />
        <Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} />
      </Panel>
      {canvas}
      <Row style={{ gap: 8 }}>
        <StatTile k="Your touches" v={String(mineHits.length)} color={mineHits.length ? C.up : undefined} />
        <StatTile k="Clashy Bot" v={String(botHits.length)} color={botHits.length ? C.opp : undefined} />
      </Row>
      <Row style={{ gap: 8, justifyContent: 'center' }}>
        <Tag text="YOUR LINE" color={def.tint} /><Tag text="CLASHY BOT" color={C.opp} /><Tag text="REAL PRICE" color={C.ink} />
      </Row>
      {g.phase === 'live' ? <BotSays text={ahead > 0 ? 'Your line keeps finding it. Lucky.' : ahead < 0 ? 'Mine is closer. Told you.' : 'Even so far. Watch the line.'} /> : null}
    </View>
  );
}
