// Roulette (Nov 21): solo. Chips on where the move lands. The rolled market's live volatility sets six slots for the
// move at the bell, split at −1.5, −0.6, 0, +0.6 and +1.5 times the move's typical size over the round
// (σ′ = σ × √secs, σ from the last ten minutes of ticks): BIG DROP, DROP, DIP, RISE, JUMP, BIG JUMP. Each slot's
// chance comes from the normal curve (about 6.7%, 20.7% and 22.6% each side) and it pays 97% of fair (about 14.5×,
// 4.7×, 4.3×), shown before the spin. The edges are rounded to what's shown (and the odds worked out from the rounded
// edges), and they lock at the spin. Place `chips` chips, each 1/chips of the stake; unused chips come back.
// The first price at or after the bell picks the slot (lower edge inclusive):
// payout = (unused chips + chips on that slot × its payout) / chips. A dead-flat finish is a push.
// p: { chips = 5 }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  Clock, GS, GT, Go, MarketHead, Note, Panel, Pill, PxChart, RolledPanel, StatTile, bellPrice, clampInt, fallbackSigma,
  fmtPx, fmtX, mktLine, phi, sigmaOf, tickerOf, usd, useClock, useRolled, type GameApi, type Level, type Line, type Tick,
} from '../kit';

const NAMES = ['BIG DROP', 'DROP', 'DIP', 'RISE', 'JUMP', 'BIG JUMP'] as const;
const Z_EDGES = [0.6, 1.5];
/** The six slots for one round: the five edges (move fractions, ascending), each slot's chance and payout. */
type Table = { sr: number; e: number[]; probs: number[]; pays: number[]; dp: number };
/** Gap between the strip's segments. */
const SEG_GAP = 4;

function tableOf(sigma: number, secs: number): Table {
  const sr = sigma * Math.sqrt(Math.max(secs, 1));
  const a = Z_EDGES[0]! * sr, b = Z_EDGES[1]! * sr;
  // decimals of the percent: at least 3, more when the slots are tiny, so the inner edge keeps two digits
  const dp = Math.max(3, Math.min(6, Math.ceil(-Math.log10(a * 100)) + 1));
  const u = 10 ** -(dp + 2);
  const round = (x: number) => Math.max(u, Math.round(x / u) * u);
  const e1 = round(a), e2 = Math.max(round(b), e1 + u);
  const p0 = phi(-e2 / sr), p1 = phi(-e1 / sr) - p0, p2 = 0.5 - phi(-e1 / sr);
  const probs = [p0, p1, p2, p2, p1, p0];
  const pays = probs.map((p) => Math.round(Math.min(50, 0.97 / Math.max(p, 1e-6)) * 10) / 10);
  return { sr, e: [-e2, -e1, 0, e1, e2], probs, pays, dp };
}
const pctOf = (x: number, dp: number) => (x === 0 ? '0%' : `${x > 0 ? '+' : '−'}${(Math.abs(x) * 100).toFixed(dp)}%`);
const payText = (m: number) => `${m.toFixed(1)}×`;
function rangeText(t: Table, s: number) {
  const p = (x: number) => pctOf(x, t.dp);
  const [a, b, , c, d] = t.e as [number, number, number, number, number];
  return [`below ${p(a)}`, `${p(a)} to ${p(b)}`, `${p(b)} to 0%`, `0% to ${p(c)}`, `${p(c)} to ${p(d)}`, `above ${p(d)}`][s]!;
}
/** The slot a move lands in: the number of edges at or below it (lower edge inclusive). */
const slotOf = (move: number, e: number[]) => e.filter((x) => move >= x).length;
/** Where the ball sits: its slot and how far across it (tails run one JUMP-width past the outer edges, then clamp). */
function ballAt(move: number, e: number[]) {
  const s = slotOf(move, e);
  const tail = e[4]! - e[3]!;
  const lo = s === 0 ? e[0]! - tail : e[s - 1]!, hi = s === 5 ? e[4]! + tail : e[s]!;
  return { s, f: Math.max(0, Math.min(1, (move - lo) / (hi - lo))) };
}
const upSlot = (s: number) => s >= 3;

export default function Roulette({ g }: { g: GameApi }) {
  const { def } = g;
  const chips = clampInt(def.p?.chips, 1, 10, 5);
  const { sym, shown, reroll } = useRolled(g);
  const [bets, setBets] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [table, setTable] = useState<Table | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<{ bell: Tick; move: number } | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);
  const placed = bets.reduce((a, b) => a + b, 0);
  const spare = chips - placed;
  // the slots, from this market's live volatility (locked at the spin)
  const shownTable = table ?? (sym ? tableOf(sigmaOf(g.feed, sym, fallbackSigma(sym)), def.secs) : null);

  // the bell: the first price at or after it picks the slot
  useEffect(() => {
    if (!sym || !entry || !endsAt || !table || settled.current || g.phase !== 'live') return;
    const b = bellPrice(g, sym, endsAt);
    if (b === 'wait') return;
    settled.current = true;
    if (b === 'quiet') { g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`); return; }
    const move = b.p / entry.p - 1;
    setFinal({ bell: b, move });
    const lines: Line[] = [
      ['Market', mktLine(g, sym)],
      ['Entry', fmtPx(entry.p)],
      ['At the bell', fmtPx(b.p)],
      ['Move', pctOf(move, table.dp + 1)],
    ];
    const mine: Line[] = bets.flatMap((n, i): Line[] => (n ? [[`Chips on ${NAMES[i]}`, `${n} · ${payText(table.pays[i]!)}`]] : []));
    const back: Line[] = spare ? [['Chips unused', `${spare} of ${chips}, back`]] : [];
    if (move === 0) {
      g.end(1, 'Dead flat. Chips back.', [...lines, ['Landed on', 'Dead flat'], ...mine, ...back]);
      return;
    }
    const s = slotOf(move, table.e);
    const on = bets[s]!;
    const mult = (spare + on * table.pays[s]!) / chips;
    g.end(mult, on ? `Landed on ${NAMES[s]}. ${on} chip${on === 1 ? '' : 's'} paid ${payText(table.pays[s]!)}.` : `Landed on ${NAMES[s]}. No chips there.`, [
      ...lines,
      ['Landed on', `${NAMES[s]} · ${rangeText(table, s)}`],
      ['It pays', payText(table.pays[s]!)],
      ...mine,
      ...back,
    ]);
  });

  const add = (s: number) => {
    if (g.phase !== 'setup' || g.busy) return;
    if (spare <= 0) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); return; }
    Haptics.selectionAsync().catch(() => {});
    setBets((b) => (b.reduce((x, y) => x + y, 0) >= chips ? b : b.map((x, i) => (i === s ? x + 1 : x))));
  };

  const spin = async () => {
    if (!sym || !shownTable || !placed) return;
    const m = g.feed.mark(sym);
    // the entry is read before the stake is taken; a stale price can't spin
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const tb = shownTable; // the slots on screen are the slots played
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setTable(tb); setEntry({ t: m.t, p: m.p }); setEndsAt(end);
  };

  if (g.phase === 'setup' || !table || !entry || !endsAt || !sym) {
    const wide = g.width >= 600;
    const lines = wide ? [[0, 1, 2, 3, 4, 5]] : [[0, 1, 2], [3, 4, 5]];
    return (
      <View style={{ gap: 14 }}>
        <RolledPanel g={g} sym={sym} shown={shown} onReroll={g.phase === 'setup' && !g.busy ? reroll : undefined} sub={`${def.secs} s round`} />
        <TourTarget id="g-pick">
          <View style={{ gap: 8 }}>
            {shownTable ? lines.map((ln, k) => (
              <Row key={k} style={{ gap: 8, alignItems: 'stretch' }}>
                {ln.map((s) => (
                  <SlotCard key={s} name={NAMES[s]!} pay={shownTable.pays[s]!} range={rangeText(shownTable, s)} up={upSlot(s)} n={bets[s]!} tint={def.tint}
                    onPress={() => add(s)} disabled={g.busy || g.phase !== 'setup'} />
                ))}
              </Row>
            )) : null}
          </View>
        </TourTarget>
        <Row style={{ justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt v="label" lines={1} style={{ fontVariant: ['tabular-nums'] }}>{spare ? `${spare} of ${chips} chips left` : 'All chips placed'}</Txt>
            <Txt v="small" lines={1} style={{ fontVariant: ['tabular-nums'] }}>{usd(g.stake / chips)} a chip</Txt>
          </View>
          <Pill label="Clear chips" onPress={() => setBets([0, 0, 0, 0, 0, 0])} disabled={!placed || g.busy || g.phase !== 'setup'} />
        </Row>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title="Spin" sub={placed ? `${placed} chip${placed === 1 ? '' : 's'} on the table` : 'Place a chip first'} onPress={() => void spin()}
            disabled={!sym || !placed || g.busy || g.phase !== 'setup'} color={def.tint} ink={GT.onTint} />
        </TourTarget>
        <Note center>Unused chips come back.</Note>
      </View>
    );
  }

  const m = g.feed.mark(sym);
  const move = final ? final.move : m ? m.p / entry.p - 1 : 0;
  const ball = ballAt(move, table.e);
  const flat = move === 0;
  const multNow = flat ? 1 : (spare + bets[ball.s]! * table.pays[ball.s]!) / chips;
  const lv = (x: number): Level => ({ p: entry.p * (1 + x), color: x > 0 ? C.up : C.down, label: pctOf(x, table.dp), fit: true });
  const inner = ball.s > 0 && ball.s < 5 && !flat ? { lo: entry.p * (1 + table.e[ball.s - 1]!), hi: entry.p * (1 + table.e[ball.s]!), color: def.tint } : undefined;
  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <MarketHead g={g} sym={sym} from={entry.p} />
        <Clock left={final ? 0 : left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} />
      </Panel>
      <Panel style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between', gap: 10 }}>
          <Txt v="label">{final ? 'Where it landed' : 'The ball'}</Txt>
          <Txt v="small" lines={1} color={flat ? C.ink : upSlot(ball.s) ? C.up : C.down} style={{ ...FONT.semi }}>{flat ? 'Dead flat' : NAMES[ball.s]}</Txt>
        </Row>
        <BallStrip slot={ball.s} f={ball.f} flat={flat} bets={bets} pays={table.pays} tint={def.tint} landed={!!final} />
      </Panel>
      <PxChart g={g} sym={sym} from={entry.t} until={final?.bell.t} entry={entry.p} h={200} band={inner}
        levels={[lv(table.e[4]!), lv(table.e[3]!), lv(table.e[1]!), lv(table.e[0]!)]} />
      <Row style={{ gap: 8 }}>
        <StatTile k={final ? 'Move at the bell' : 'Move now'} v={pctOf(move, table.dp)} color={flat ? undefined : move > 0 ? C.up : C.down} />
        <StatTile k="Chips there" v={flat ? '–' : `${bets[ball.s]}`} />
        <StatTile k={final ? 'Paid' : 'Pays now'} v={fmtX(multNow)} color={multNow > 1 ? C.up : multNow < 1 ? C.down : undefined} />
      </Row>
    </View>
  );
}

/** One slot in the setup: its name, payout and range; a tap adds a chip (shown as dots). */
function SlotCard({ name, pay, range, up, n, tint, onPress, disabled }: { name: string; pay: number; range: string; up: boolean; n: number; tint: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled, selected: n > 0 }}
      accessibilityLabel={`${name}, pays ${payText(pay)}, ${range}, ${n} chip${n === 1 ? '' : 's'}`}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 128, borderRadius: GS.radius.tile, paddingVertical: 12, paddingHorizontal: 8, backgroundColor: n ? `${tint}14` : GT.raised, borderWidth: 2, borderColor: n ? tint : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: disabled ? 0.6 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.bold, fontSize: 12.5, letterSpacing: 0.3, color: up ? C.up : C.down }}>{name}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: 24, letterSpacing: -0.6, color: C.ink, fontVariant: ['tabular-nums'] }}>{payText(pay)}</Text>
      <Text numberOfLines={2} style={{ ...FONT.semi, fontSize: 11, lineHeight: 14, color: C.muted, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{range}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 3, minHeight: 8, marginTop: 2 }}>
        {Array.from({ length: n }, (_, k) => <View key={k} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tint }} />)}
      </View>
    </Pressable>
  );
}

/** The six slots as a strip with your chips on them and the ball (the live move) gliding along it. */
function BallStrip({ slot, f, flat, bets, pays, tint, landed }: { slot: number; f: number; flat: boolean; bets: number[]; pays: number[]; tint: string; landed: boolean }) {
  const [w, setW] = useState(0);
  const seg = w > 0 ? (w - 5 * SEG_GAP) / 6 : 0;
  const target = slot * (seg + SEG_GAP) + f * seg;
  const x = useSharedValue(0);
  const ready = useRef(false);
  useEffect(() => {
    if (!w) return;
    if (!ready.current) { ready.current = true; x.value = target; return; }
    x.value = withTiming(target, { duration: 650, easing: Easing.out(Easing.cubic) });
  }, [target, w, x]);
  const ballStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - 13 }] }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ gap: 6 }}>
      {/* your chips */}
      <Row style={{ gap: SEG_GAP, height: 22 }}>
        {bets.map((n, s) => (
          <View key={s} style={{ flex: 1, alignItems: 'center' }}>
            {n ? (
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: tint, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: GT.panel }}>
                <Text style={{ ...FONT.bold, fontSize: 11, color: GT.onTint, fontVariant: ['tabular-nums'] }}>{n}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </Row>
      {/* the slots and the ball */}
      <View style={{ height: 44, justifyContent: 'center' }}>
        <Row style={{ gap: SEG_GAP, height: 44 }}>
          {bets.map((_, s) => {
            const here = s === slot && !flat;
            const col = upSlot(s) ? C.up : C.down;
            const solid = here && landed;
            return <View key={s} style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: solid ? col : `${col}${here ? '4D' : '1A'}`, borderWidth: here ? 1.5 : 0, borderColor: col }} />;
          })}
        </Row>
        {w > 0 ? (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 9, width: 26, height: 26, borderRadius: 13, backgroundColor: C.ink, borderWidth: 4, borderColor: tint }, ballStyle]} />
        ) : null}
      </View>
      {/* names and payouts */}
      <Row style={{ gap: SEG_GAP, alignItems: 'flex-start' }}>
        {bets.map((_, s) => (
          <View key={s} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
            <Text numberOfLines={2} style={{ ...FONT.bold, fontSize: 9.5, lineHeight: 12, textAlign: 'center', color: upSlot(s) ? C.up : C.down }}>{NAMES[s]}</Text>
            <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 10.5, color: C.muted, fontVariant: ['tabular-nums'] }}>{payText(pays[s]!)}</Text>
          </View>
        ))}
      </Row>
    </View>
  );
}
