// Bingo (Nov 20): solo. A 3×3 card of price events on `markets` rolled markets ("SOL +0.08%", "BTC −0.05%",
// "ETH ±0.10%" either way), each a touch of a level measured from the entry. Each square's level is set from the
// market's live volatility so it has roughly a 35–55% chance. A square marks the moment a tick reaches it; a full line
// (row, column or diagonal) before the bell wins at once. The payout is priced before you play: a Monte Carlo of
// 3,000 random walks per market at the live volatilities (1.5 s steps) gives the chance of a line, and a line pays
// payoutFor(that chance). Three cards are dealt; picking one is the decision.
// p: { markets?: number = 3 }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { fallbackSigma, nameOf, tickerOf, useLivePool, type PoolKey, type Tick } from '../feed';
import { Clock, Go, Logo, Note, Panel, fmtPx, useClock, type GameApi, type Line } from '../kit';
import { fmtPct, fmtX, payoutFor, pStay, pTouch, sample, sigmaOf, signedPct } from '../odds';
import { Pill, Waiting, captureAt, pathOf, readEntries, rollMarkets } from './_group-c';

type Kind = 'up' | 'down' | 'either';
type Square = { sym: string; kind: Kind; d: number; p: number };
type Card = { squares: Square[]; chance: number; mult: number; at: number };

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const LINE_NAMES = ['Top row', 'Middle row', 'Bottom row', 'Left column', 'Middle column', 'Right column', 'Diagonal', 'Diagonal'];
const MASKS = LINES.map((l) => l.reduce((m, i) => m | (1 << i), 0));
const STEP_S = 1.5;
const PATHS = 3000;
/** The chance bands of the three cards: a long shot, the middle, the safer one. */
const BANDS: [number, number][] = [[0.35, 0.42], [0.42, 0.48], [0.48, 0.55]];

const chanceOf = (kind: Kind, d: number, sigma: number, secs: number) => (kind === 'either' ? 1 - pStay(d, sigma, secs) : pTouch(d, sigma, secs));
/** The level (a fraction from the entry) with chance `target` of being touched within `secs`. */
function levelFor(kind: Kind, sigma: number, secs: number, target: number) {
  let lo = 1e-7, hi = 0.5;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (chanceOf(kind, mid, sigma, secs) > target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const dpOf = (d: number) => (d < 0.001 ? 3 : 2);
/** Rounded to what the square shows, so the level played is the level on the card. */
function roundLevel(d: number) {
  const u = 10 ** (dpOf(d) + 2);
  return Math.max(1 / u, Math.round(d * u) / u);
}
const levelText = (s: Square) => `${s.kind === 'up' ? '+' : s.kind === 'down' ? '−' : '±'}${(s.d * 100).toFixed(dpOf(s.d))}%`;
const glyph = (k: Kind) => (k === 'up' ? '▲' : k === 'down' ? '▼' : '↕');
const kindColor = (k: Kind) => (k === 'up' ? C.up : k === 'down' ? C.down : C.ink);

let spare: number | null = null;
function gauss() {
  if (spare !== null) { const s = spare; spare = null; return s; }
  let u = 0;
  while (u === 0) u = Math.random();
  const v = Math.random();
  const r = Math.sqrt(-2 * Math.log(u));
  spare = r * Math.sin(2 * Math.PI * v);
  return r * Math.cos(2 * Math.PI * v);
}

/** Chance of at least one line by the bell: PATHS independent random walks per market, 1.5 s steps. */
function lineChance(squares: Square[], sigmas: Record<string, number>, secs: number) {
  const steps = Math.max(1, Math.round(secs / STEP_S));
  const dt = secs / steps;
  const groups = [...new Set(squares.map((s) => s.sym))].map((sym) => ({
    sd: sigmas[sym]! * Math.sqrt(dt),
    sq: squares.map((s, i) => ({ s, i })).filter((x) => x.s.sym === sym).map((x) => ({ bit: 1 << x.i, kind: x.s.kind, up: Math.log(1 + x.s.d), dn: Math.log(1 - x.s.d) })),
  }));
  let hits = 0;
  for (let k = 0; k < PATHS; k++) {
    let mask = 0;
    for (const gr of groups) {
      let x = 0, hi = 0, lo = 0;
      for (let j = 0; j < steps; j++) { x += gr.sd * gauss(); if (x > hi) hi = x; else if (x < lo) lo = x; }
      for (const q of gr.sq) {
        const up = hi >= q.up, dn = lo <= q.dn;
        if (q.kind === 'up' ? up : q.kind === 'down' ? dn : up || dn) mask |= q.bit;
      }
    }
    if (MASKS.some((m) => (mask & m) === m)) hits += 1;
  }
  return hits / PATHS;
}

/** Three cards on the same markets: each market gets an up, a down and an either-way square, in a fresh layout. */
function deal(syms: string[], sigmas: Record<string, number>, secs: number): Card[] {
  return BANDS.map(([a, b]): Card => {
    const cells = sample([0, 1, 2, 3, 4, 5, 6, 7, 8], 9);
    const kinds = syms.map(() => sample<Kind>(['up', 'down', 'either'], 3));
    const squares: Square[] = new Array(9);
    cells.forEach((cell, i) => {
      const j = i % syms.length;
      const sym = syms[j]!;
      const kind = kinds[j]![Math.floor(i / syms.length) % 3]!;
      const sigma = sigmas[sym]!;
      const d = roundLevel(levelFor(kind, sigma, secs, a + (b - a) * Math.random()));
      squares[cell] = { sym, kind, d, p: chanceOf(kind, d, sigma, secs) };
    });
    const chance = lineChance(squares, sigmas, secs);
    return { squares, chance, mult: payoutFor(chance), at: Date.now() };
  }).sort((x, y) => y.mult - x.mult);
}

/** Which squares a market's ticks since the entry have reached. */
function hitsOf(card: Card, entries: Record<string, Tick>, paths: Record<string, Tick[]>) {
  let mask = 0;
  card.squares.forEach((s, i) => {
    const e = entries[s.sym]!.p;
    const ticks = paths[s.sym] ?? [];
    const up = ticks.some((x) => x.p >= e * (1 + s.d)), dn = ticks.some((x) => x.p <= e * (1 - s.d));
    if (s.kind === 'up' ? up : s.kind === 'down' ? dn : up || dn) mask |= 1 << i;
  });
  return mask;
}
const lineOf = (mask: number) => MASKS.findIndex((m) => (mask & m) === m);
const bestLine = (mask: number) => Math.max(...LINES.map((l) => l.filter((i) => mask & (1 << i)).length));

export default function Bingo({ g }: { g: GameApi }) {
  const { def } = g;
  const k = Math.max(1, Math.min(3, Number(def.p?.markets ?? 3)));
  const live = useLivePool(def.pool as PoolKey[]);
  const [syms, setSyms] = useState<string[] | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [sel, setSel] = useState(0);
  const [entries, setEntries] = useState<Record<string, Tick> | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<{ mask: number; line: number } | null>(null);
  const bell = useRef(new Map<string, Tick>());
  const settled = useRef(false);
  const left = useClock(endsAt);

  // roll the markets, then deal three cards from their live volatility (off the render so "Dealing…" shows first)
  useEffect(() => { if (!syms) { const r = rollMarkets(g.feed, live, k); if (r) setSyms(r); } }, [syms, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!syms || cards) return;
    const t = setTimeout(() => {
      const sigmas = Object.fromEntries(syms.map((s) => [s, sigmaOf(g.feed, s, fallbackSigma(s))]));
      setCards(deal(syms, sigmas, def.secs));
      setSel(0);
    }, 30);
    return () => clearTimeout(t);
  }, [syms, cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const reroll = () => { setCards(null); setSyms(rollMarkets(g.feed, live, k)); };

  const go = async () => {
    const c = cards?.[sel];
    if (!syms || !c) return;
    // odds priced a while ago no longer match the market: deal again rather than play stale odds
    if (Date.now() - c.at > 5 * 60_000) { setCards(null); g.fail('Those odds were five minutes old, so the cards were dealt again.'); return; }
    const e = readEntries(g.feed, syms);
    if (!e.ok) { g.fail(`Waiting for a live ${tickerOf(e.stale)} price.`); return; }
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setEntries(e.at); setCard(c); setEndsAt(end);
  };

  // squares mark on every tick; a line wins at once; no line by the bell loses
  useEffect(() => {
    if (!syms || !entries || !card || !endsAt || settled.current || g.phase !== 'live') return;
    const now = Date.now();
    if (now >= endsAt) captureAt(bell.current, g.feed, syms, endsAt);
    const paths = Object.fromEntries(syms.map((s) => [s, pathOf(g.feed, s, entries[s]!.t, bell.current.get(s)?.t ?? endsAt - 1)]));
    const mask = hitsOf(card, entries, paths);
    const line = lineOf(mask);
    const lines = (): Line[] => [
      ['Chance of a line', fmtPct(card.chance, 0)],
      ['A line pays', fmtX(card.mult)],
      ['Squares hit', `${popcount(mask)} of 9`],
      ...syms.map((s): Line => {
        const ps = paths[s]!.map((x) => x.p / entries[s]!.p - 1);
        const hi = Math.max(0, ...ps), lo = Math.min(0, ...ps);
        return [`${tickerOf(s)} range`, `${signedPct(lo, 3)} to ${signedPct(hi, 3)}`];
      }),
    ];
    if (line >= 0) {
      settled.current = true;
      setFinal({ mask, line });
      g.end(card.mult, `Bingo! ${LINE_NAMES[line]} complete.`, [['Line', LINE_NAMES[line]!], ...lines()]);
      return;
    }
    if (now < endsAt) return;
    if (syms.every((s) => bell.current.has(s))) {
      settled.current = true;
      setFinal({ mask, line: -1 });
      g.end(0, `No line by the bell. Best was ${bestLine(mask)} of 3.`, lines());
    } else if (now > endsAt + 15_000) {
      settled.current = true;
      const miss = syms.find((s) => !bell.current.has(s))!;
      g.abandon(`No live ${tickerOf(miss)} price came in at the bell, so your stake is back.`);
    }
  });

  if (g.phase === 'setup') {
    if (!syms) return <Waiting text="Finding markets with a live price…" tint={def.tint} />;
    if (!cards) return <Waiting text="Dealing three cards…" sub="Pricing each from the live volatility." tint={def.tint} />;
    const c = cards[sel]!;
    return (
      <View style={{ gap: 14 }}>
        <Panel style={{ gap: 10 }}>
          {syms.map((s) => (
            <Row key={s} style={{ gap: 10 }}>
              <Logo sym={s} info={g.info} size={30} />
              <Txt v="label" lines={1} style={{ flex: 1 }}>{nameOf(g.info, s)}</Txt>
              <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{fmtPx(g.feed.price(s))}</Txt>
            </Row>
          ))}
          <View style={{ alignItems: 'center' }}><Pill label="New cards" onPress={reroll} /></View>
        </Panel>
        <TourTarget id="g-pick">
          <View style={{ gap: 10 }}>
            <Row style={{ gap: 8 }}>
              {cards.map((x, i) => {
                const on = i === sel;
                return (
                  <Pressable key={i} onPress={() => { Haptics.selectionAsync(); setSel(i); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Card ${i + 1}, a line pays ${fmtX(x.mult)}`}
                    style={({ pressed }) => ({ flex: 1, minHeight: 60, borderRadius: 20, backgroundColor: on ? def.tint : '#15151B', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                    <Text style={{ ...FONT.displayB, fontSize: 22, letterSpacing: -0.6, color: on ? '#0A0A0D' : C.ink, fontVariant: ['tabular-nums'] }}>{fmtX(x.mult)}</Text>
                    <Text style={{ ...FONT.semi, fontSize: 12, color: on ? 'rgba(10,10,13,0.7)' : C.muted }}>Card {i + 1}</Text>
                  </Pressable>
                );
              })}
            </Row>
            <Grid g={g} card={c} tint={def.tint} />
          </View>
        </TourTarget>
        <Note center>Any row, column or diagonal before the bell pays {fmtX(c.mult)} ({fmtPct(c.chance, 0)} chance).</Note>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title="Play this card" sub={`A line pays ${fmtX(c.mult)}`} color={def.tint} ink="#0A0A0D" onPress={() => void go()} disabled={g.busy} />
        </TourTarget>
      </View>
    );
  }

  if (!syms || !entries || !card) return <Note center>Dealing your card…</Note>;

  const paths = Object.fromEntries(syms.map((s) => [s, pathOf(g.feed, s, entries[s]!.t, bell.current.get(s)?.t ?? endsAt! - 1)]));
  const mask = final?.mask ?? hitsOf(card, entries, paths);
  const line = final?.line ?? lineOf(mask);

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <Row style={{ gap: 8 }}>
          {syms.map((s) => {
            const p = bell.current.get(s)?.p ?? g.feed.price(s);
            const mv = p ? p / entries[s]!.p - 1 : 0;
            return (
              <View key={s} style={{ flex: 1, alignItems: 'center', gap: 4, minWidth: 0 }}>
                <Logo sym={s} info={g.info} size={30} />
                <Txt v="small" color={C.ink} lines={1} style={{ ...FONT.semi }}>{tickerOf(s)}</Txt>
                <Txt v="small" lines={1} color={mv >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>{signedPct(mv, 3)}</Txt>
              </View>
            );
          })}
        </Row>
        <Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} />
      </Panel>
      <Grid g={g} card={card} tint={def.tint} mask={mask} line={line} />
      <Panel style={{ alignItems: 'center', gap: 2 }}>
        <Txt v="label" color={line >= 0 ? C.up : C.ink}>{line >= 0 ? `Bingo! ${LINE_NAMES[line]}` : `Best line: ${bestLine(mask)} of 3`}</Txt>
        <Txt v="small">{popcount(mask)} of 9 squares · a line pays {fmtX(card.mult)}</Txt>
      </Panel>
    </View>
  );
}

const popcount = (m: number) => { let n = 0; for (let i = 0; i < 9; i++) if (m & (1 << i)) n += 1; return n; };

/** The 3×3 card. Marked squares fill with the game colour; the winning line lights up. */
function Grid({ g, card, tint, mask = 0, line = -1 }: { g: GameApi; card: Card; tint: string; mask?: number; line?: number }) {
  const win = line >= 0 ? LINES[line]! : [];
  return (
    <View style={{ gap: 8 }}>
      {[0, 1, 2].map((r) => (
        <Row key={r} style={{ gap: 8, alignItems: 'stretch' }}>
          {[0, 1, 2].map((c) => {
            const i = r * 3 + c;
            const s = card.squares[i]!;
            const hit = !!(mask & (1 << i));
            const inWin = win.includes(i);
            return (
              <View key={c} accessibilityLabel={`${tickerOf(s.sym)} ${levelText(s)}${hit ? ', hit' : ''}`}
                style={{ flex: 1, minWidth: 0, minHeight: 88, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: hit ? `${tint}2E` : '#15151B', borderWidth: 2, borderColor: inWin ? '#fff' : hit ? tint : 'transparent' }}>
                <Logo sym={s.sym} info={g.info} size={24} />
                <Txt v="small" color={C.ink} lines={1} style={{ ...FONT.semi, fontSize: 12.5 }}>{tickerOf(s.sym)}</Txt>
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.bold, fontSize: 14, color: kindColor(s.kind), fontVariant: ['tabular-nums'] }}>{glyph(s.kind)} {levelText(s)}</Text>
                {hit ? (
                  <Animated.View entering={ZoomIn.duration(260)} style={{ position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ ...FONT.bold, fontSize: 12, color: '#0A0A0D' }}>✓</Text>
                  </Animated.View>
                ) : null}
                {inWin ? <Animated.View entering={FadeIn.duration(300)} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 16, backgroundColor: `${tint}22` }} /> : null}
              </View>
            );
          })}
        </Row>
      ))}
    </View>
  );
}
