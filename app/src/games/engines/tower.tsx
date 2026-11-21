// Tower (Nov 21): Stake's Dragon Tower on prices. One rolled market for the whole climb. Each floor is a `floorSecs`
// call with three lanes on the floor's move: DOWN (below −b), FLAT (within ±b), UP (above +b), where
// b = 0.4307 · σ · √floorSecs from the market's live volatility at the start of that floor (Φ(0.4307) = 2/3, so each
// lane is an even third). easy: pick two lanes (a 2/3 chance), a right floor grows the pot ×1.455 (0.97 × 1.5); hard:
// pick one (1/3), ×2.91 (0.97 × 3). A floor settles on the first live price at or after its end. Between floors there
// is no clock: cash out, or pick the next floor's lanes and climb. A miss loses the pot; the top floor pays the climb.
// No price within 15 s of a floor's end: that floor doesn't count (stake back on floor 1, otherwise the pot is paid).
// p: { floors: number = 8, floorSecs: number = 10, mode: 'easy' | 'hard' = 'easy' }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  Clock, GS, GT, Go, MarketHead, Note, Panel, PxChart, RolledPanel, Tag, absPct, bellPrice, fallbackSigma, fmtPx, mktLine, mv, pNum, pStr, pick,
  rollable, sigmaOf, tickerOf, usd, useClock, useRolled, type GameApi, type Level, type Line, type Tick,
} from '../kit';

type Lane = 'down' | 'flat' | 'up';
type Floor = { entry: Tick; endsAt: number; b: number; lanes: Lane[] };
type Cleared = Floor & { exit: Tick; real: Lane; right: boolean };

const LANES: readonly Lane[] = ['down', 'flat', 'up'];
const WORD: Record<Lane, string> = { down: 'DOWN', flat: 'FLAT', up: 'UP' };
const GLYPH: Record<Lane, string> = { down: '▼', flat: '▬', up: '▲' };
const COLOR: Record<Lane, string> = { down: C.down, flat: GT.sub, up: C.up };
/** Φ⁻¹(2/3): a move this many σ√t either way leaves each of the three lanes an even third. */
const Z = 0.4307;
const STEP_EASY = 0.97 * 1.5;
const STEP_HARD = 0.97 * 3;

/** A multiplier short enough for the tower's left column: 1.46, 13.8, 209, 5.14K. */
function fx(m: number) {
  const r = (d: number) => Math.round(m * 10 ** d + 1e-7) / 10 ** d;
  if (m < 10) return r(2).toFixed(2);
  if (m < 100) return r(1).toFixed(1);
  if (m < 1000) return String(Math.round(m));
  return `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)}K`;
}
const laneOf = (move: number, b: number): Lane => (move < -b ? 'down' : move > b ? 'up' : 'flat');
const edge = (l: Lane, b: number) => (l === 'down' ? `−${absPct(b)}` : l === 'up' ? `+${absPct(b)}` : `±${absPct(b)}`);
const lanesWord = (ls: Lane[], sep = ' + ') => [...ls].sort((a, b) => LANES.indexOf(a) - LANES.indexOf(b)).map((l) => WORD[l]).join(sep);

export default function Tower({ g }: { g: GameApi }) {
  const { def } = g;
  const floors = Math.round(Math.max(2, Math.min(12, pNum(g, 'floors', 8))));
  const floorSecs = Math.max(3, pNum(g, 'floorSecs', 10));
  const hard = pStr(g, 'mode', ['easy', 'hard'] as const, 'easy') === 'hard';
  const need = hard ? 1 : 2;
  const step = hard ? STEP_HARD : STEP_EASY;
  const roll = useRolled(g);
  const sym = roll.sym;
  const [picks, setPicks] = useState<Lane[]>([]);
  const [cur, setCur] = useState<Floor | null>(null);
  const [hist, setHist] = useState<Cleared[]>([]);
  const [out, setOut] = useState<'fell' | 'cashed' | 'top' | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const left = useClock(cur?.endsAt);
  const began = useRef(false);
  const starting = useRef(false);
  const handled = useRef<number | null>(null);
  const settled = useRef(false);
  const fixed = useRef(false);

  // the first roll lands on any live market; prefer one that's really moving (US stocks sit still after hours)
  useEffect(() => {
    if (fixed.current || !sym) return;
    fixed.current = true;
    if (!g.feed.moving(sym)) { const o = roll.live.filter((s) => s !== sym && g.feed.moving(s)); if (o.length) roll.setSym(pick(o)); }
  }, [sym]); // eslint-disable-line react-hooks/exhaustive-deps
  const reroll = () => { const o = rollable(g, roll.live, 2).filter((s) => s !== sym); if (o.length) roll.setSym(pick(o)); };

  const wins = hist.filter((f) => f.right).length;
  const mult = step ** wins;
  const pot = g.stake * mult;
  const multAt = (i: number) => step ** (i + 1);
  const bandOf = (s: string) => Z * sigmaOf(g.feed, s, fallbackSigma(s)) * Math.sqrt(floorSecs);

  const receipt = (h: Cleared[]): Line[] => [
    ['Market', mktLine(g, sym!)],
    ['Mode', hard ? 'Hard · one lane a floor' : 'Easy · two lanes a floor'],
    ...h.flatMap((f, i): Line[] => [
      [`Floor ${i + 1}`, `${fmtPx(f.entry.p)} → ${fmtPx(f.exit.p)}`],
      [`Floor ${i + 1} lane`, `${mv(f.exit.p / f.entry.p - 1)} ${WORD[f.real]} · you ${lanesWord(f.lanes, '+')} ${f.right ? '✓' : '✗'}`],
    ]),
    ['Each floor', `×${step}`],
    ['Floors cleared', `${h.filter((f) => f.right).length} of ${floors}`],
  ];

  const tap = (l: Lane) => {
    if (cur || settled.current || g.phase === 'done') return;
    setPicks((p) => (hard ? [l] : p.includes(l) ? p.filter((x) => x !== l) : [...p, l].slice(-2)));
  };

  const climb = async () => {
    if (!sym || cur || starting.current || settled.current || picks.length !== need) return;
    const m = g.feed.mark(sym);
    // read the floor's entry before taking the stake, and refuse a stale price
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const b = bandOf(sym);
    const t0 = Date.now();
    starting.current = true;
    try {
      if (!began.current) { if (!(await g.begin())) return; began.current = true; } else g.fail(undefined);
      setFlash(null);
      setCur({ entry: { t: t0, p: m.p }, endsAt: t0 + floorSecs * 1000, b, lanes: [...picks] });
    } finally { starting.current = false; }
  };

  // each floor's bell: the first live price at or after it
  useEffect(() => {
    if (!cur || !sym || settled.current || g.phase !== 'live' || handled.current === cur.endsAt) return;
    const bell = bellPrice(g, sym, cur.endsAt);
    if (bell === 'wait') return;
    handled.current = cur.endsAt;
    const tk = tickerOf(sym);
    if (bell === 'quiet') {
      settled.current = true;
      setCur(null);
      if (wins > 0) { setOut('cashed'); g.end(mult, `No live ${tk} price came at the floor's end, so it doesn't count. You keep the pot.`, receipt(hist)); }
      else g.abandon(`No live ${tk} price came at the floor's end, so your stake is back.`);
      return;
    }
    const move = bell.p / cur.entry.p - 1;
    const real = laneOf(move, cur.b);
    const right = cur.lanes.includes(real);
    const h = [...hist, { ...cur, exit: bell, real, right }];
    setHist(h); setCur(null);
    if (!right) {
      settled.current = true; setOut('fell');
      g.end(0, `${tk} landed ${WORD[real]} (${mv(move)}). You fell from floor ${h.length}.`, receipt(h));
      return;
    }
    if (wins + 1 >= floors) {
      settled.current = true; setOut('top');
      g.end(step ** floors, `Top of the tower. All ${floors} floors: ×${fx(step ** floors)}.`, receipt(h));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setFlash(`${WORD[real]} (${mv(move)}). Floor ${h.length} cleared: pot ×${fx(step ** (wins + 1))}.`);
  });

  const cashOut = () => {
    if (cur || starting.current || settled.current || wins < 1 || g.phase !== 'live') return;
    settled.current = true; setOut('cashed');
    g.end(mult, `Cashed out on floor ${wins}: ×${fx(mult)}.`, receipt(hist));
  };

  const m = sym ? g.feed.mark(sym) : undefined;
  const last = hist[hist.length - 1];
  // the floor in play (running, or being picked); none once the climb is over
  const idx = out ? -1 : hist.length;
  const previewB = sym ? bandOf(sym) : 0;
  const b = cur?.b ?? previewB;
  const nowLane = cur && m ? laneOf(m.p / cur.entry.p - 1, cur.b) : null;
  const edges = (base: number, bb: number): Level[] => [
    { p: base * (1 + bb), color: C.up, label: `UP past ${fmtPx(base * (1 + bb))}`, fit: true },
    { p: base * (1 - bb), color: C.down, label: `DOWN past ${fmtPx(base * (1 - bb))}`, fit: true },
  ];

  const laneRow = (
    <Row style={{ gap: 6, flex: 1 }}>
      {LANES.map((l) => (
        <LaneBtn key={l} lane={l} sub={sym ? edge(l, b) : undefined} on={cur ? cur.lanes.includes(l) : picks.includes(l)} now={nowLane === l}
          onPress={() => tap(l)} disabled={!!cur || !sym || g.busy || g.phase === 'done'} />
      ))}
    </Row>
  );

  const tower = (
    <Panel tint={def.tint} style={{ gap: 6, padding: 12 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <Txt v="label" style={{ fontSize: 15 }}>
          {out === 'top' ? 'Top of the tower' : out === 'fell' ? `Fell on floor ${hist.length}` : out === 'cashed' ? `Cashed out on floor ${wins}` : `Floor ${idx + 1} of ${floors}`}
        </Txt>
        <Txt v="small" color={wins > 0 && out !== 'fell' ? def.tint : C.muted} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>
          {g.phase === 'setup' ? `${hard ? 'Hard' : 'Easy'} · top ×${fx(step ** floors)}` : `Pot ${out === 'fell' ? usd(0) : usd(pot)}`}
        </Txt>
      </Row>
      {Array.from({ length: floors }, (_, k) => floors - 1 - k).map((i) => {
        const top = i === floors - 1;
        const done = hist[i];
        if (i === idx) {
          return (
            <Row key={i} style={{ gap: 6, alignItems: 'stretch' }}>
              <MultCell text={`×${fx(multAt(i))}`} color={top ? GT.gold : def.tint} big />
              <TourTarget id="g-pick" style={{ flex: 1 }}>{laneRow}</TourTarget>
            </Row>
          );
        }
        return (
          <Row key={i} style={{ gap: 6 }}>
            <MultCell text={`×${fx(multAt(i))}`} color={done ? (done.right ? C.up : C.down) : top ? GT.gold : C.dim} struck={!!done && !done.right} />
            {LANES.map((l) => <SmallCell key={l} lane={l} lit={done?.real === l} mine={!!done && done.lanes.includes(l)} past={!!done} />)}
          </Row>
        );
      })}
    </Panel>
  );

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <RolledPanel g={g} sym={sym} shown={roll.shown} onReroll={reroll} sub={`${floors} floors of ${floorSecs} s`} />
        {sym && m ? <PxChart g={g} sym={sym} h={140} color={def.tint} band={{ lo: m.p * (1 - previewB), hi: m.p * (1 + previewB), color: GT.sub }} levels={edges(m.p, previewB)} /> : null}
        {tower}
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title="Climb" sub={picks.length === need ? `${lanesWord(picks)} · floor 1 · ${floorSecs} s` : hard ? 'Pick one lane first' : 'Pick two lanes first'}
            color={def.tint} ink={GT.onTint} onPress={() => void climb()} disabled={!sym || g.busy || picks.length !== need} />
        </TourTarget>
        <Note center>{hard ? 'One lane a floor.' : 'Two lanes a floor.'} Cash out between floors. A miss and you fall.</Note>
      </View>
    );
  }

  const between = !cur && g.phase === 'live' && !out && hist.length > 0;
  const shownFloor = cur ?? last;
  return (
    <View style={{ gap: 14 }}>
      {sym ? (
        <Panel style={{ gap: 12 }}>
          <MarketHead g={g} sym={sym} from={cur?.entry.p ?? (g.phase === 'done' ? last?.entry.p : undefined)}
            right={cur ? <Text style={{ ...FONT.bold, fontSize: 15, color: C.ink }}>{lanesWord(cur.lanes)}</Text> : undefined} />
          {cur ? <Clock left={left} total={floorSecs} tint={def.tint} label={`floor ${hist.length + 1} of ${floors}`} /> : null}
        </Panel>
      ) : null}
      {sym && cur ? (
        <PxChart g={g} sym={sym} from={cur.entry.t} entry={cur.entry.p} h={200} band={{ lo: cur.entry.p * (1 - cur.b), hi: cur.entry.p * (1 + cur.b), color: GT.sub }} levels={edges(cur.entry.p, cur.b)} />
      ) : sym && g.phase === 'done' && shownFloor && last ? (
        <PxChart g={g} sym={sym} from={last.entry.t} until={last.exit.t} entry={last.entry.p} h={180} band={{ lo: last.entry.p * (1 - last.b), hi: last.entry.p * (1 + last.b), color: GT.sub }} levels={edges(last.entry.p, last.b)} />
      ) : sym && m ? (
        <PxChart g={g} sym={sym} h={150} color={def.tint} band={{ lo: m.p * (1 - previewB), hi: m.p * (1 + previewB), color: GT.sub }} levels={edges(m.p, previewB)} />
      ) : null}
      {flash && between ? (
        <Animated.View key={flash} entering={FadeIn.duration(200)}>
          <Txt v="label" color={C.up} style={{ textAlign: 'center' }}>{flash}</Txt>
        </Animated.View>
      ) : null}
      {tower}
      {between ? (
        <>
          <Go title="Next floor" sub={picks.length === need ? `${lanesWord(picks)} · ×${fx(multAt(hist.length))} if right` : hard ? 'Pick a lane' : 'Pick two lanes'}
            onPress={() => void climb()} disabled={g.busy || picks.length !== need} />
          <Go title={`Cash out ${usd(pot)}`} sub={`×${fx(mult)} your stake`} color={def.tint} ink={GT.onTint} onPress={cashOut} disabled={g.busy || wins < 1} />
          <Note center>No clock between floors. Take your time.</Note>
        </>
      ) : null}
    </View>
  );
}

/** A floor's pot multiplier, in the tower's left column. */
function MultCell({ text, color, big, struck }: { text: string; color: string; big?: boolean; struck?: boolean }) {
  return (
    <View style={{ width: 50, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 2 }}>
      <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: big ? 14 : 12, color, fontVariant: ['tabular-nums'], textDecorationLine: struck ? 'line-through' : 'none' }}>{text}</Text>
    </View>
  );
}

/** One lane of a floor that isn't in play: the real lane lit on a played floor, your lanes outlined in lavender. */
function SmallCell({ lane, lit, mine, past }: { lane: Lane; lit: boolean; mine: boolean; past: boolean }) {
  const col = COLOR[lane];
  return (
    <View style={{ flex: 1, height: past ? 30 : 24, borderRadius: GS.radius.chip, backgroundColor: lit ? col : GT.raised, borderWidth: 2, borderColor: mine ? C.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10.5, letterSpacing: 0.3, color: lit ? GT.onTint : past ? C.muted : C.dim }}>
        {lit && mine ? `✓ ${WORD[lane]}` : WORD[lane]}
      </Text>
    </View>
  );
}

/** A lane on the floor in play: tap to pick it (two in easy mode); solid when picked; NOW marks where the price is. */
function LaneBtn({ lane, sub, on, now, onPress, disabled }: { lane: Lane; sub?: string; on: boolean; now: boolean; onPress: () => void; disabled?: boolean }) {
  const col = COLOR[lane];
  const ink: ReactNode = now ? <Tag text="NOW" color={on ? GT.onTint : col} /> : <Text style={{ ...FONT.bold, fontSize: 14, color: on ? GT.onTint : col, lineHeight: 17 }}>{GLYPH[lane]}</Text>;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={`${WORD[lane]}${sub ? `, ${sub}` : ''}`} accessibilityState={{ selected: on, disabled: !!disabled }}
      style={({ pressed }) => ({
        flex: 1, minWidth: 0, minHeight: 78, borderRadius: GS.radius.tile, paddingHorizontal: 4, paddingVertical: 8, gap: 3,
        backgroundColor: on ? col : GT.raised, borderWidth: 2, borderColor: on ? C.white : now ? col : 'transparent',
        alignItems: 'center', justifyContent: 'center', opacity: disabled && !on && !now ? 0.5 : 1, transform: [{ scale: pressed ? 0.96 : 1 }],
      })}>
      <View style={{ height: 17, justifyContent: 'center' }}>{ink}</View>
      <Text numberOfLines={1} style={{ ...FONT.display, fontSize: 19, letterSpacing: -0.4, color: on ? GT.onTint : C.ink }}>{WORD[lane]}</Text>
      {sub ? <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 11, color: on ? GT.onTint : C.muted, opacity: on ? 0.72 : 1, fontVariant: ['tabular-nums'] }}>{sub}</Text> : null}
    </Pressable>
  );
}
