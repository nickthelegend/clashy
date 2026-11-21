// Candle Call (Nov 21): one candle forms live on a rolled market and you call its shape; the call starts it. Clashy Bot
// takes the other side; the right call wins 2×, a tie is a push. The candle is the round, built from the live feed:
// O = the entry price (read fresh before the stake is taken), H / L = the highest and lowest of every tick from the
// entry to the bell inclusive, C = the first price at or after the bell (captureAt).
//  wick:  TOP WICK vs BOTTOM WICK. Upper = H − max(O, C), lower = min(O, C) − L; the longer wins.
//  close: TOP HALF vs BOTTOM HALF. Where C sits in its range, (C − L) / (H − L), above or below one half.
//  body:  BODY vs WICK. |C − O| against the wicks together, (H − L) − |C − O|; the bigger wins.
//  range: BIGGER vs SMALLER. H − L against the candle of the same-length window just before the start, from the feed's
//         own ticks (g.feed.since). That window must be watched without a gap for 80% of it, and must have moved at
//         all (a flat one would make BIGGER a sure thing); until then the start is locked with a Waiting box.
// Equal means equal to a billionth of the price (so float noise never picks a winner): a push. A candle that never
// moved is a push for wick, close and body. No price within QUIET_MS of the bell: abandoned (stake back).
// p: { q: 'wick' | 'close' | 'body' | 'range' | 'mix' = 'mix' (mix asks one of wick / close / body, new each round) }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { G, Line as SvgLine, Rect } from 'react-native-svg';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  BotSays, Clock, GS, GT, MarketHead, Note, Panel, PxChart, QUIET_MS, RolledPanel, Sides, Waiting, captureAt, fallbackSigma, fmtPx, lengthLabel,
  mktLine, pStr, pathOf, pick, rollable, sigmaOf, tickerOf, useClock, useRolled, type Feed, type GameApi, type Line, type Tick,
} from '../kit';

type Q = 'wick' | 'close' | 'body' | 'range';
/** 'a' is TOP WICK / TOP HALF / BODY / BIGGER, 'b' the other. */
type Call = 'a' | 'b';
type K = { o: number; h: number; l: number; c: number };

const EPS = 1e-9;
/** Ticks further apart than this are a hole in what the feed watched (it polls every 1.5 s; flat prices log every 4 s). */
const GAP_MS = 10_000;
/** How much of the window before the start must have been watched, for range. */
const COVER = 0.8;

/** −1, 0 or 1; equal means equal to a billionth of `ref` (a price). */
const cmp = (x: number, y: number, ref: number) => (Math.abs(x - y) <= Math.abs(ref) * EPS ? 0 : x > y ? 1 : -1);
const upperOf = (k: K) => k.h - Math.max(k.o, k.c);
const lowerOf = (k: K) => Math.min(k.o, k.c) - k.l;
const bodyOf = (k: K) => Math.abs(k.c - k.o);
const rangeOf = (k: K) => k.h - k.l;
const flatOf = (k: K) => cmp(k.h, k.l, k.o) === 0;

/** Which side the candle says wins right now (or at the close), or null for a tie. */
function winnerOf(q: Q, k: K, prev: K | null): Call | null {
  let s = 0;
  if (q === 'wick') s = cmp(upperOf(k), lowerOf(k), k.o);
  else if (q === 'close') s = flatOf(k) ? 0 : cmp(k.c - k.l, k.h - k.c, k.o);
  else if (q === 'body') s = cmp(bodyOf(k), rangeOf(k) - bodyOf(k), k.o);
  else s = prev ? cmp(rangeOf(k), rangeOf(prev), k.o) : 0;
  return s > 0 ? 'a' : s < 0 ? 'b' : null;
}

/** The round's candle from the feed: the entry, every tick after it up to the bell, and the bell's price. */
function candleOf(f: Feed, sym: string, entry: Tick, bell?: Tick, upto = Infinity): K {
  const ticks = pathOf(f, sym, entry.t, bell ? bell.t : upto);
  if (bell && (!ticks.length || ticks[ticks.length - 1]!.t < bell.t)) ticks.push(bell);
  let h = entry.p, l = entry.p;
  for (const x of ticks) { if (x.p > h) h = x.p; if (x.p < l) l = x.p; }
  return { o: entry.p, h, l, c: bell ? bell.p : ticks.length ? ticks[ticks.length - 1]!.p : entry.p };
}

/** The candle of the `lenMs` just before `end`, from the feed's own ticks, and how much of that window the feed watched
 *  without a hole (0..1). Null when there's no recent tick at all. */
function lastWindow(f: Feed, sym: string, end: number, lenMs: number): { k: K; cover: number } | null {
  const ws = end - lenMs;
  const ticks = f.since(sym, ws - GAP_MS).filter((x) => x.t <= end);
  const m = f.mark(sym);
  if (m && m.t <= end && (!ticks.length || ticks[ticks.length - 1]!.t < m.t)) ticks.push({ t: m.t, p: m.p });
  if (!ticks.length || end - ticks[ticks.length - 1]!.t > GAP_MS) return null;
  // walk back from the newest tick while there's no hole, to the window's start at most
  let i = ticks.length - 1;
  while (i > 0 && ticks[i]!.t > ws && ticks[i]!.t - ticks[i - 1]!.t <= GAP_MS) i--;
  const run = ticks.slice(i);
  const cover = Math.max(0, Math.min(1, (end - Math.max(ws, run[0]!.t)) / lenMs));
  const before = run.filter((x) => x.t <= ws);
  const inside = run.filter((x) => x.t > ws);
  const open = before.length ? before[before.length - 1]! : inside[0]!;
  const ps = [open.p, ...inside.map((x) => x.p)];
  return { k: { o: open.p, h: Math.max(...ps), l: Math.min(...ps), c: ps[ps.length - 1]! }, cover };
}

/* ---------- numbers ---------- */
const pxDp = (p: number, dp: number) => p.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const baseDp = (p: number) => (p >= 100 ? 2 : p >= 1 ? 4 : Math.max(4, 3 - Math.floor(Math.log10(p))));
/** A price writer for a candle: fmtPx's decimals, and more when two different prices would read the same. */
function pxSet(ps: number[]) {
  const ok = ps.filter((p) => Number.isFinite(p) && p > 0);
  if (!ok.length) return { full: (p: number) => fmtPx(p), bare: (p: number) => fmtPx(p).replace('$', '') };
  const distinct = new Set(ok).size;
  const fit = (from: number) => { let dp = from; while (dp < 10 && new Set(ok.map((p) => pxDp(p, dp))).size < distinct) dp++; return dp; };
  const lowest = Math.min(...ok);
  const dp = fit(baseDp(lowest));
  // the chart's tags are short: whole dollars above $1,000 unless the cents are what tell two prices apart
  const tag = fit(lowest >= 1000 ? 0 : baseDp(lowest));
  return { full: (p: number) => `$${pxDp(p, dp)}`, bare: (p: number) => pxDp(p, tag) };
}
/** Sizes (in price) as percents of `ref`, with enough decimals (3 at least) to tell different ones apart. */
function pctSet(xs: number[], ref: number) {
  const fs = xs.map((x) => (Math.abs(x) / ref) * 100);
  const distinct = new Set(fs.map((v) => v.toFixed(9))).size;
  let dp = 3;
  while (dp < 6 && new Set(fs.map((v) => v.toFixed(dp))).size < distinct) dp++;
  return (x: number) => `${((Math.abs(x) / ref) * 100).toFixed(dp)}%`;
}
/** Where the close sits in its range: "64% up". */
function closeAt(k: K) {
  if (flatOf(k)) return 'No range yet';
  const pos = (k.c - k.l) / (k.h - k.l);
  return `${(pos * 100).toFixed(Math.abs(pos - 0.5) < 0.005 ? 1 : 0)}% up`;
}

/* ---------- copy ---------- */
function copyOf(q: Q, unit: string) {
  switch (q) {
    case 'wick': return { ask: 'Which wick ends up longer?', a: 'TOP WICK', b: 'BOTTOM WICK', aSub: 'Longer above the body', bSub: 'Longer below the body', won: { a: 'The top wick came out longer.', b: 'The bottom wick came out longer.' } };
    case 'close': return { ask: 'Where in its range does it close?', a: 'TOP HALF', b: 'BOTTOM HALF', aSub: 'Closes nearer its high', bSub: 'Closes nearer its low', won: { a: 'It closed in the top half.', b: 'It closed in the bottom half.' } };
    case 'body': return { ask: 'More body, or more wick?', a: 'BODY', b: 'WICK', aSub: 'Body longer than the wicks', bSub: 'Wicks longer than the body', won: { a: 'More body than wick.', b: 'More wick than body.' } };
    case 'range': return { ask: `Bigger or smaller than the last ${unit}?`, a: 'BIGGER', b: 'SMALLER', aSub: 'More from high to low', bSub: 'Less from high to low', won: { a: `Bigger than the ${unit} before.`, b: `Smaller than the ${unit} before.` } };
  }
}

/** The little candle drawn on each call button: [open, high, low, close] from 0 (bottom) to 1 (top). */
type Shape = { k: [number, number, number, number]; ghost?: [number, number, number, number]; mid?: boolean };
const SHAPES: Record<Q, Record<Call, Shape>> = {
  wick: { a: { k: [0.34, 1, 0, 0.08] }, b: { k: [0.66, 1, 0, 0.92] } },
  close: { a: { k: [0.2, 1, 0, 0.88], mid: true }, b: { k: [0.8, 1, 0, 0.12], mid: true } },
  body: { a: { k: [0.08, 1, 0, 0.92] }, b: { k: [0.44, 1, 0, 0.56] } },
  range: { a: { k: [0.1, 1, 0, 0.9], ghost: [0.4, 0.68, 0.32, 0.6] }, b: { k: [0.42, 0.66, 0.34, 0.58], ghost: [0.1, 1, 0, 0.9] } },
};

export default function Candle({ g }: { g: GameApi }) {
  const { def } = g;
  const qp = pStr(g, 'q', ['wick', 'close', 'body', 'range', 'mix'] as const, 'mix');
  const [q] = useState<Q>(() => (qp === 'mix' ? pick(['wick', 'close', 'body'] as const) : qp));
  const unit = def.secs === 60 ? 'minute' : lengthLabel(def.secs);
  const copy = copyOf(q, unit);
  const lenMs = def.secs * 1000;
  const roll = useRolled(g);
  const sym = roll.sym;
  const [call, setCall] = useState<Call | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [prev, setPrev] = useState<K | null>(null);
  const [floor, setFloor] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<{ k: K; bell: Tick } | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);
  const store = useRef(new Map<string, Tick>());
  const nudged = useRef(false);

  // if the roll landed on a market that isn't moving, take one that is (a flat candle makes every call a tie)
  useEffect(() => {
    if (!sym || nudged.current) return;
    nudged.current = true;
    if (g.feed.moving(sym)) return;
    const moving = roll.live.filter((s) => s !== sym && g.feed.moving(s));
    if (moving.length) roll.setSym(pick(moving));
  });
  const reroll = () => { const o = rollable(g, roll.live, 2).filter((s) => s !== sym); if (o.length) roll.setSym(pick(o)); else roll.reroll(); };
  /** The candle's smallest drawn height, from the market's live volatility, so a quiet start isn't drawn huge. */
  const floorOf = (s: string, p: number) => p * Math.max(0.00015, 0.9 * sigmaOf(g.feed, s, fallbackSigma(s)) * Math.sqrt(def.secs));

  const go = async (c: Call) => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    // the open is read before the stake is taken, and a stale price can't start it
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const t0 = Date.now();
    let pk: K | null = null;
    if (q === 'range') {
      const w = lastWindow(g.feed, sym, t0, lenMs);
      if (!w || w.cover < COVER) { g.fail(`Still watching ${tickerOf(sym)}'s last ${unit}.`); return; }
      if (flatOf(w.k)) { g.fail(`${tickerOf(sym)} didn't move in the last ${unit}. Roll another market.`); return; }
      pk = w.k;
    }
    const fl = floorOf(sym, m.p);
    const at = t0 + lenMs;
    if (!(await g.begin(at))) return;
    setCall(c); setEntry({ t: m.t, p: m.p }); setPrev(pk); setFloor(fl); setEndsAt(at);
  };

  // the bell: the first price at or after it closes the candle (no deps on purpose; the ref settles it once)
  useEffect(() => {
    if (g.phase !== 'live' || !sym || !entry || !endsAt || !call || settled.current || Date.now() < endsAt) return;
    if (!captureAt(store.current, g.feed, [sym], endsAt)) {
      if (Date.now() > endsAt + QUIET_MS) { settled.current = true; g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`); }
      return;
    }
    settled.current = true;
    const bell = store.current.get(sym)!;
    const k = candleOf(g.feed, sym, entry, bell);
    setFinal({ k, bell });
    const w = winnerOf(q, k, prev);
    const other: Call = call === 'a' ? 'b' : 'a';
    const px = pxSet([k.o, k.h, k.l, k.c]);
    const lines: Line[] = [
      ['Market', mktLine(g, sym)],
      ['Question', copy.ask],
      ['Your call', copy[call]],
      ['Clashy Bot', copy[other]],
      ['Open', px.full(k.o)], ['High', px.full(k.h)], ['Low', px.full(k.l)], ['Close at the bell', px.full(k.c)],
    ];
    if (q === 'wick') { const f = pctSet([upperOf(k), lowerOf(k)], k.o); lines.push(['Top wick', f(upperOf(k))], ['Bottom wick', f(lowerOf(k))]); }
    if (q === 'body') { const f = pctSet([bodyOf(k), rangeOf(k) - bodyOf(k)], k.o); lines.push(['Body', f(bodyOf(k))], ['Wicks', f(rangeOf(k) - bodyOf(k))]); }
    if (q === 'close') lines.push(['Half way', flatOf(k) ? '–' : pxSet([k.o, k.h, k.l, k.c, (k.h + k.l) / 2]).full((k.h + k.l) / 2)], ['Where it closed', flatOf(k) ? 'No range' : closeAt(k)]);
    if (q === 'range' && prev) { const f = pctSet([rangeOf(k), rangeOf(prev)], k.o); lines.push(['This candle, high to low', f(rangeOf(k))], [`The ${unit} before`, f(rangeOf(prev))]); }
    lines.push(['Result', w === null ? 'A tie' : `${copy[w]} wins`]);
    const tk = tickerOf(sym);
    const verdict = w === null
      ? q !== 'range' && flatOf(k) ? `${tk} never moved, so it's a tie. Stake back.` : "Dead level, so it's a tie. Stake back."
      : `${copy.won[w]} ${w === call ? 'You called it.' : 'Clashy Bot takes it.'}`;
    g.end(w === null ? 1 : w === call ? 2 : 0, verdict, lines);
  });

  const inRound = g.phase !== 'setup' && !!entry && !!call && !!sym;
  const win = !inRound && sym && q === 'range' ? lastWindow(g.feed, sym, Date.now(), lenMs) : null;
  // an abandoned round (no bell price) stays frozen at the bell instead of growing on
  const kLive: K | null = final ? final.k : inRound ? candleOf(g.feed, sym, entry, undefined, g.phase === 'done' && endsAt ? endsAt : Infinity) : win?.k ?? null;
  const eased = useEased(kLive, `${sym ?? ''}:${inRound ? 'round' : 'setup'}`);
  const fs = Math.min(26, Math.max(15, ((g.width - 12) / 2 - 26) / (Math.max(copy.a.length, copy.b.length) * 0.68)));

  /* ---------- setup ---------- */
  if (!inRound) {
    const ready = q !== 'range' || (!!win && win.cover >= COVER && !flatOf(win.k));
    const m = sym ? g.feed.mark(sym) : undefined;
    return (
      <View style={{ gap: 14 }}>
        <RolledPanel g={g} sym={sym} shown={roll.shown} onReroll={g.busy ? undefined : reroll} sub={`${lengthLabel(def.secs)} candle`} />
        <Panel tint={def.tint} style={{ gap: 12 }}>
          <View>
            <Txt v="small" style={{ ...FONT.semi, letterSpacing: 0.6 }}>THE CALL</Txt>
            <Txt v="h2" style={{ marginTop: 2 }}>{copy.ask}</Txt>
          </View>
          {q === 'range' && sym ? (
            <>
              {win && eased && m ? (
                <BigCandle w={g.width - 34} k={eased} q="preview" tint={def.tint} floor={floorOf(sym, m.p)} live px={pxSet([win.k.o, win.k.h, win.k.l, win.k.c]).bare}
                  captions={[{ title: `Last ${unit}`, value: pctSet([rangeOf(win.k)], win.k.o)(rangeOf(win.k)), color: C.ink }]} />
              ) : null}
              {!win || win.cover < COVER ? (
                <Waiting tint={def.tint} text={`Watching the last ${unit}… ${Math.floor(Math.min(1, (win?.cover ?? 0) / COVER) * 100)}%`} sub="It needs most of it to compare against." progress={Math.min(1, (win?.cover ?? 0) / COVER)} />
              ) : flatOf(win.k) ? (
                <Waiting tint={def.tint} text={`${tickerOf(sym)} hasn't moved in the last ${unit}.`} sub="Roll another market, or wait for it to move." />
              ) : null}
            </>
          ) : null}
        </Panel>
        {q !== 'range' && sym ? <PxChart g={g} sym={sym} h={140} /> : null}
        {g.stakeRow}
        <TourTarget id="g-pick">
          <TourTarget id="g-go">
            <Row style={{ gap: 12, alignItems: 'stretch' }}>
              <CallButton title={copy.a} sub={copy.aSub} color={def.tint} size={fs} art={<Glyph s={SHAPES[q].a} color={GT.onTint} />} onPress={() => void go('a')} disabled={!sym || !ready || g.busy} />
              <CallButton title={copy.b} sub={copy.bSub} color={C.ink} size={fs} art={<Glyph s={SHAPES[q].b} color={GT.onTint} />} onPress={() => void go('b')} disabled={!sym || !ready || g.busy} />
            </Row>
          </TourTarget>
        </TourTarget>
        <Note center>The candle starts when you call it. Clashy Bot takes the other side.</Note>
      </View>
    );
  }

  /* ---------- live and done ---------- */
  const k = kLive!;
  const done = g.phase === 'done';
  // abandoned (no price at the bell): no side is shown as the winner
  const void_ = done && !final;
  const lead = void_ ? null : winnerOf(q, k, prev);
  const other: Call = call === 'a' ? 'b' : 'a';
  const sideColor = (s: Call) => (s === call ? C.brand : C.opp);
  const who = lead === null ? null : lead === call ? 'you' : 'bot';
  const px = pxSet([k.o, k.h, k.l, k.c]);
  const captions = q === 'range' && prev ? (() => {
    const f = pctSet([rangeOf(k), rangeOf(prev)], k.o);
    return [{ title: `Last ${unit}`, value: f(rangeOf(prev)), color: C.muted }, { title: `This ${unit}`, value: f(rangeOf(k)), color: lead ? sideColor(lead) : C.ink }];
  })() : undefined;
  const botLine = who === null ? 'Dead even. Anything can happen.' : who === 'you' ? "You're ahead. The close decides it." : "I'm ahead right now.";
  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry.p} />
        <View style={{ marginTop: 12 }}><Clock left={final ? 0 : left} total={def.secs} tint={def.tint} label={done ? 'closed' : 'to the close'} /></View>
      </Panel>
      <Panel tint={def.tint} style={{ gap: 10 }}>
        <Txt v="label" lines={2}>{copy.ask}</Txt>
        <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 15, color: C.muted }}>
          {done ? 'Result: ' : 'Right now: '}
          <Text style={{ ...FONT.bold, color: lead === null ? C.ink : sideColor(lead) }}>{lead === null ? (void_ ? 'NO PRICE AT THE BELL' : done ? 'A TIE' : 'DEAD EVEN') : copy[lead]}</Text>
        </Text>
        <BigCandle w={g.width - 34} k={eased ?? k} ghost={prev} q={q} tint={def.tint} floor={floor} live={!done} px={px.bare} lead={lead} sideColor={sideColor} captions={captions} />
      </Panel>
      <Sides lead={who}
        you={{ title: copy[call], color: C.ink, sub: call === 'a' ? copy.aSub : copy.bSub }}
        bot={{ title: copy[other], color: C.ink, sub: other === 'a' ? copy.aSub : copy.bSub }} />
      <PxChart g={g} sym={sym} from={entry.t} until={final?.bell.t ?? (done && endsAt ? endsAt : undefined)} entry={entry.p} h={110} />
      {!done ? <BotSays text={`I took ${copy[other]}. ${botLine}`} /> : null}
    </View>
  );
}

/* ---------- the big candle ---------- */
type Caption = { title: string; value: string; color: string };
/** The round's candle, big: wicks and body growing as ticks arrive (green or red by close against open), a dashed line
 *  at the open, the live measures beside it, O / H / L / C tags on the right; for range, the candle before it faded on
 *  the left with both ranges bracketed. */
function BigCandle({ w, h = 220, k, ghost, q, tint, floor, live, px, lead = null, sideColor, captions }: {
  w: number; h?: number; k: K; ghost?: K | null; q: Q | 'preview'; tint: string; floor: number; live: boolean; px: (p: number) => string;
  lead?: Call | null; sideColor?: (s: Call) => string; captions?: Caption[];
}) {
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withTiming(2.4, { duration: 1100 }), -1, false); }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 1.4 - pulse.value / 2 }));

  const RG = 80; // the right gutter for the price tags
  const pw = w - RG;
  const PADY = 14;
  let lo = Math.min(k.l, ghost?.l ?? Infinity), hi = Math.max(k.h, ghost?.h ?? -Infinity);
  if (hi - lo < floor) { const mid = (hi + lo) / 2; lo = mid - floor / 2; hi = mid + floor / 2; }
  if (!(hi > lo)) { hi = k.o * 1.0001; lo = k.o * 0.9999; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const Y = (v: number) => PADY + (1 - (v - lo) / (hi - lo)) * (h - 2 * PADY);
  const two = !!ghost;
  const bw = Math.min(two ? 50 : 60, pw * (two ? 0.17 : 0.2));
  const cx = two ? pw * 0.68 : q === 'preview' ? pw * 0.5 : pw * 0.4;
  const gx = pw * 0.28;
  const colOf = (c: K) => { const s = cmp(c.c, c.o, c.o); return s > 0 ? C.up : s < 0 ? C.down : C.muted; };
  const col = colOf(k);
  const body = (c: K) => {
    const a = Y(Math.max(c.o, c.c)), b = Y(Math.min(c.o, c.c));
    const bh = Math.max(3, b - a);
    return { y: bh === 3 ? (a + b) / 2 - 1.5 : a, h: bh, top: a, bot: b };
  };
  const kb = body(k);
  const yo = Y(k.o), yc = Y(k.c), yh = Y(k.h), yl = Y(k.l);
  const flat = flatOf(k);
  const midY = Y((k.h + k.l) / 2);
  const bracket = (x: number, a: number, b: number, color: string, key: string) => (
    <G key={key}>
      <SvgLine x1={x} x2={x} y1={a} y2={b} stroke={color} strokeWidth={1.5} />
      <SvgLine x1={x - 4} x2={x + 4} y1={a} y2={a} stroke={color} strokeWidth={1.5} />
      <SvgLine x1={x - 4} x2={x + 4} y1={b} y2={b} stroke={color} strokeWidth={1.5} />
    </G>
  );

  // the measures beside the candle (wick, body, close); the leading one in its side's colour
  type Lab = { y: number; title: string; value: string; color: string };
  const labs: Lab[] = [];
  const on = (s: Call) => (lead === s ? sideColor?.(s) ?? C.ink : C.muted);
  if (q === 'wick') {
    const f = pctSet([upperOf(k), lowerOf(k)], k.o);
    labs.push({ y: (yh + kb.top) / 2, title: 'Top wick', value: f(upperOf(k)), color: on('a') }, { y: (kb.bot + yl) / 2, title: 'Bottom wick', value: f(lowerOf(k)), color: on('b') });
  } else if (q === 'body') {
    const wk = rangeOf(k) - bodyOf(k);
    const f = pctSet([bodyOf(k), wk], k.o);
    labs.push({ y: (kb.top + kb.bot) / 2, title: 'Body', value: f(bodyOf(k)), color: on('a') }, { y: upperOf(k) >= lowerOf(k) ? (yh + kb.top) / 2 : (kb.bot + yl) / 2, title: 'Wicks', value: f(wk), color: on('b') });
  } else if (q === 'close') {
    labs.push({ y: yc, title: 'Close', value: closeAt(k), color: lead ? on(lead) : C.ink });
  }
  spread(labs, 32, 16, h - 16);

  // the tags on the right: C (coloured), and H / L / O unless they're the same price as one already tagged
  const extra: { v: number; letters: string }[] = [];
  for (const [letter, v] of [['H', k.h], ['L', k.l], ['O', k.o]] as const) {
    if (v === k.c) continue;
    const same = extra.find((e) => e.v === v);
    if (same) same.letters += `·${letter}`; else extra.push({ v, letters: letter });
  }
  const tags = [{ y: yc, text: px(k.c), c: true }, ...extra.map((e) => ({ y: Y(e.v), text: `${e.letters} ${px(e.v)}`, c: false }))];
  spread(tags, 21, 11, h - 11);

  const lx = cx + bw / 2 + 12;
  const openAbove = yo > 20 && !(q === 'close' && !flat && Math.abs(yo - midY) < 16 && yo > midY);
  return (
    <View>
      <View style={{ width: w, height: h }}>
        <Svg width={w} height={h}>
          {[0.25, 0.5, 0.75].map((f) => <SvgLine key={f} x1={0} x2={pw} y1={h * f} y2={h * f} stroke={GT.grid} />)}
          {q === 'close' && !flat ? (
            <>
              <Rect x={0} y={k.c >= (k.h + k.l) / 2 ? yh : midY} width={pw} height={Math.max(0, k.c >= (k.h + k.l) / 2 ? midY - yh : yl - midY)} fill={tint} fillOpacity={0.08} />
              <SvgLine x1={0} x2={pw} y1={midY} y2={midY} stroke={tint} strokeOpacity={0.7} strokeWidth={1.2} strokeDasharray="5 4" />
            </>
          ) : null}
          <SvgLine x1={0} x2={pw} y1={yo} y2={yo} stroke={C.brandSoft} strokeOpacity={0.55} strokeDasharray="3 4" />
          {ghost ? (() => {
            const gb = body(ghost);
            const gc = colOf(ghost);
            return (
              <G opacity={0.38}>
                <SvgLine x1={gx} x2={gx} y1={Y(ghost.h)} y2={Y(ghost.l)} stroke={gc} strokeWidth={3} strokeLinecap="round" />
                <Rect x={gx - bw / 2} y={gb.y} width={bw} height={gb.h} rx={Math.min(6, gb.h / 2)} fill={gc} />
                {bracket(gx + bw / 2 + 10, Y(ghost.h), Y(ghost.l), C.ink, 'gb')}
              </G>
            );
          })() : null}
          <Rect x={cx - bw / 2 - 6} y={kb.y - 6} width={bw + 12} height={kb.h + 12} rx={12} fill={col} fillOpacity={0.14} />
          <SvgLine x1={cx} x2={cx} y1={yh} y2={yl} stroke={col} strokeWidth={3} strokeLinecap="round" />
          <Rect x={cx - bw / 2} y={kb.y} width={bw} height={kb.h} rx={Math.min(7, kb.h / 2)} fill={col} />
          {q === 'range' || q === 'preview' ? bracket(cx + bw / 2 + 10, yh, yl, tint, 'kb') : null}
          {live ? <SvgLine x1={cx + bw / 2 + 2} x2={pw} y1={yc} y2={yc} stroke={col} strokeOpacity={0.5} strokeDasharray="2 3" /> : null}
        </Svg>
        {live ? (
          <>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: cx - 6, top: yc - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: col }, ring]} />
            <View pointerEvents="none" style={{ position: 'absolute', left: cx - 5, top: yc - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: col, borderWidth: 2, borderColor: C.bg }} />
          </>
        ) : null}
        <Text pointerEvents="none" style={{ position: 'absolute', left: 6, top: openAbove ? yo - 16 : yo + 3, ...FONT.bold, fontSize: 10.5, color: C.brandSoft }}>Open</Text>
        {q === 'close' && !flat ? (
          <Text pointerEvents="none" style={{ position: 'absolute', left: 6, top: midY < yo || !openAbove ? midY - 16 : midY + 3, ...FONT.bold, fontSize: 10.5, color: tint }}>Half way</Text>
        ) : null}
        {labs.map((l) => (
          <View key={l.title} pointerEvents="none" style={{ position: 'absolute', left: lx, top: l.y - 15, maxWidth: Math.max(40, pw - lx - 2) }}>
            <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 10.5, color: C.muted }}>{l.title}</Text>
            <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 13.5, color: l.color, fontVariant: ['tabular-nums'] }}>{l.value}</Text>
          </View>
        ))}
        {tags.map((t, i) => (
          <View key={i} pointerEvents="none" style={{ position: 'absolute', right: 2, top: t.y - 10, height: 20, maxWidth: RG - 4, paddingHorizontal: 6, borderRadius: 7, justifyContent: 'center', backgroundColor: t.c ? col : GT.raised }}>
            <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10.5, color: t.c ? GT.onTint : C.muted, fontVariant: ['tabular-nums'] }}>{t.text}</Text>
          </View>
        ))}
      </View>
      {captions?.length ? (
        <View style={{ height: 38 }}>
          {captions.map((c, i) => {
            const x = captions.length === 2 ? (i === 0 ? gx : cx) : cx;
            const cw = 92;
            return (
              <View key={c.title} style={{ position: 'absolute', left: Math.max(0, Math.min(w - cw, x - cw / 2)), width: cw, alignItems: 'center' }}>
                <Txt v="small" lines={1} style={{ fontSize: 12 }}>{c.title}</Txt>
                <Txt v="label" lines={1} color={c.color} style={{ fontVariant: ['tabular-nums'] }}>{c.value}</Txt>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Pushes labels apart (at least `gap` px between centres), keeping them between `top` and `bottom`. */
function spread<T extends { y: number }>(items: T[], gap: number, top: number, bottom: number) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 0; i < items.length; i++) items[i]!.y = Math.max(top, i ? Math.max(items[i]!.y, items[i - 1]!.y + gap) : items[i]!.y);
  for (let i = items.length - 1; i >= 0; i--) items[i]!.y = Math.min(i === items.length - 1 ? bottom : items[i + 1]!.y - gap, items[i]!.y);
}

/** A candle that glides to its new shape (about 0.3 s) on each tick instead of jumping; a new `reset` jumps straight to it. */
function useEased(k: K | null, reset: string, ms = 320): K | null {
  const [v, setV] = useState<K | null>(k);
  const cur = useRef<K | null>(k);
  const base = useRef(reset);
  const key = k ? `${k.o}|${k.h}|${k.l}|${k.c}` : '';
  useEffect(() => {
    if (!k || !cur.current || base.current !== reset) { base.current = reset; cur.current = k; setV(k); return; }
    const from = cur.current;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const f = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - f) ** 3;
      const nx: K = f >= 1 ? k : { o: from.o + (k.o - from.o) * e, h: from.h + (k.h - from.h) * e, l: from.l + (k.l - from.l) * e, c: from.c + (k.c - from.c) * e };
      cur.current = nx;
      setV(nx);
      if (f < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, reset]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/* ---------- the call buttons ---------- */
/** A big call button with its little candle; the title is sized to fit on one line at any width. */
function CallButton({ title, sub, color, art, size, onPress, disabled }: { title: string; sub: string; color: string; art: ReactNode; size: number; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${title}, ${sub}`} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 132, borderRadius: GS.radius.card, paddingHorizontal: 10, paddingVertical: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      {art}
      <Text numberOfLines={1} style={{ ...FONT.display, fontSize: size, letterSpacing: -0.5, color: GT.onTint }}>{title}</Text>
      <Text numberOfLines={2} style={{ ...FONT.semi, fontSize: 12.5, textAlign: 'center', color: `${GT.onTint}B8` }}>{sub}</Text>
    </Pressable>
  );
}

/** The call's shape as a little candle (a faded one beside it for range). */
function Glyph({ s, color }: { s: Shape; color: string }) {
  const W = 48, H = 44, P = 3;
  const Y = (v: number) => P + (1 - v) * (H - 2 * P);
  const one = (k: readonly number[], x: number, op: number, key: string, tick = false) => {
    const [o, hi, lo, c] = k as [number, number, number, number];
    const a = Y(Math.max(o, c)), b = Y(Math.min(o, c));
    return (
      <G key={key} opacity={op}>
        <SvgLine x1={x} x2={x} y1={Y(hi)} y2={Y(lo)} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        <Rect x={x - 6} y={a} width={12} height={Math.max(2, b - a)} rx={2.5} fill={color} />
        {tick ? <SvgLine x1={x + 6} x2={x + 13} y1={Y(c)} y2={Y(c)} stroke={color} strokeWidth={2.5} strokeLinecap="round" /> : null}
      </G>
    );
  };
  return (
    <Svg width={W} height={H}>
      {s.mid ? <SvgLine x1={4} x2={W - 4} y1={Y(0.5)} y2={Y(0.5)} stroke={color} strokeWidth={1.5} strokeDasharray="3 3" strokeOpacity={0.6} /> : null}
      {s.ghost ? one(s.ghost, 14, 0.35, 'g') : null}
      {one(s.k, s.ghost ? 34 : W / 2, 1, 'k', !!s.mid)}
    </Svg>
  );
}
