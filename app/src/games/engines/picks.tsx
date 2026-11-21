// More or Less (Nov 21, PrizePicks style): solo. `n` lines on the board, each a market and a number, and every line
// settles at one bell after def.secs. Two kinds of line, mixed about half and half (at least one of each from 3 up):
//  - price: "BTC price at the bell". The number is the live price (locked at the entry when the round starts).
//    More = above it at the bell, Less = below.
//  - move: "ETH moves, either way". The number is evenMove(σ, secs) from the market's live volatility (sigmaOf, with
//    fallbackSigma), rounded to what the card shows and locked at the start. More = the move at the bell, either way,
//    is bigger; Less = smaller.
// Both are coin flips by construction. Move lines only go on markets that really moved in the last three minutes: on a
// flat market Less would be a sure thing.
// Pick More or Less on at least `min` lines. Power: every pick right pays 0.97 × 2^k (2 → 3.88×, 3 → 7.76×,
// 4 → 15.52×, 5 → 31.04×). Flex (3 or more picks): all right or one miss pays (3: 4× / 1.25×, 4: 8× / 1.88×,
// 5: 16× / 3×), 96.9–97% of the stake back on average at 50/50 (checked below in dev).
// Settling: every picked market's first price at or after the bell (bellPrices). A pick that lands exactly on its number
// is void and dropped; the table for the picks left applies (Flex needs 3 left, otherwise Power); fewer than 2 left is
// a push. No price for every picked market within QUIET_MS of the bell: abandoned (stake back).
// p: { n: 2..5 = 5 (lines on the board), min: 2..n = 2 (fewest picks), flex?: false (Power only) }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  Clock, GS, GT, Go, Logo, Note, Panel, Pill, QUIET_MS, Tag, Waiting, bellPrices, clampInt, evenMove, fallbackSigma, fmtPx, lengthLabel,
  readEntries, rollMarkets, sample, sigmaOf, signedPct, tickerOf, usd, useClock, useLivePool, type Feed, type GameApi, type Line,
} from '../kit';

type Kind = 'price' | 'move';
type Call = 'more' | 'less';
type Mode = 'power' | 'flex';
type Prop = { sym: string; kind: Kind };
/** A line as played: its number (a price, or a move as a fraction), the market's entry price, and the meter's scale
 *  (the even-odds move, so a price line's meter is as wide as a move line's). */
type Locked = Prop & { line: number; entry: number; scale: number };
type Outcome = Call | 'void';
type Final = Record<string, { p: number; out: Outcome }>;

/* ---------- the payout tables (97% of fair at 50/50) ---------- */
const POWER: Record<number, number> = { 2: 3.88, 3: 7.76, 4: 15.52, 5: 31.04 };
const FLEX: Record<number, { all: number; one: number }> = { 3: { all: 4, one: 1.25 }, 4: { all: 8, one: 1.88 }, 5: { all: 16, one: 3 } };
// Power k: 0.97 × 2^k / 2^k = 0.97 · Flex 3: (4 + 3 × 1.25) / 8 = 0.969 · Flex 4: (8 + 4 × 1.88) / 16 = 0.970 ·
// Flex 5: (16 + 5 × 3) / 32 = 0.969. Dev builds check no table pays over 1 on coin flips.
if (__DEV__) {
  for (const k of [2, 3, 4, 5]) if (POWER[k]! / 2 ** k > 1) console.error(`More or Less: Power ${k} pays over 1 on coin flips.`);
  for (const k of [3, 4, 5]) if ((FLEX[k]!.all + k * FLEX[k]!.one) / 2 ** k > 1) console.error(`More or Less: Flex ${k} pays over 1 on coin flips.`);
}
/** The mode a slip is really played in: Flex needs 3 counted picks. */
const playMode = (m: Mode, count: number): Mode => (m === 'flex' && count >= 3 ? 'flex' : 'power');
/** What `right` of `count` counted picks pay (void picks already dropped); fewer than 2 counted is a push. */
function payFor(mode: Mode, count: number, right: number) {
  if (count < 2) return 1;
  if (playMode(mode, count) === 'flex') { const f = FLEX[count]!; return right === count ? f.all : right === count - 1 ? f.one : 0; }
  return right === count ? POWER[count]! : 0;
}
/** 3.88×, 4×, 31.04× (the table's own numbers). */
const fx = (m: number) => `${Number(m.toFixed(2))}×`;

/* ---------- lines ---------- */
/** A move rounded to what the card shows (3 decimals of a percent under 1%), so the line played is the line shown. */
function roundMove(f: number) {
  const u = 10 ** ((f < 0.01 ? 3 : 2) + 2);
  return Math.max(1 / u, Math.round(f * u) / u);
}
const movePct = (f: number) => `${(f * 100).toFixed(f < 0.01 ? 3 : 2)}%`;
/** Has it really moved in the last three minutes? (Three ticks at least, so a cold feed doesn't count as moving.) */
function stirring(f: Feed, s: string) {
  const h = f.since(s, Date.now() - 180_000);
  if (h.length < 3) return false;
  let lo = Infinity, hi = -Infinity;
  for (const x of h) { lo = Math.min(lo, x.p); hi = Math.max(hi, x.p); }
  return hi / lo - 1 > 0.00005;
}
/** A fresh board: n markets (moving ones first), about half of them move lines, on markets that are really moving. */
function deal(f: Feed, live: string[], n: number): Prop[] | null {
  const syms = rollMarkets(f, live, n);
  if (!syms) return null;
  const movers = syms.filter((s) => stirring(f, s));
  const half = Math.random() < 0.5 ? Math.floor(n / 2) : Math.ceil(n / 2);
  const want = Math.max(1, Math.min(n - 1, half));
  const moves = new Set(sample(movers, Math.min(want, movers.length)));
  return sample(syms, n).map((sym) => ({ sym, kind: moves.has(sym) ? 'move' : 'price' }));
}
/** Where a price lands against a line. */
function outcomeOf(l: Locked, p: number): Outcome {
  if (l.kind === 'price') return p > l.line ? 'more' : p < l.line ? 'less' : 'void';
  const a = Math.abs(p / l.entry - 1);
  return a > l.line ? 'more' : a < l.line ? 'less' : 'void';
}

/* ---------- numbers ---------- */
const pxDp = (p: number, dp: number) => `$${p.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const baseDp = (p: number) => (p >= 100 ? 2 : p >= 1 ? 4 : Math.max(4, 3 - Math.floor(Math.log10(p))));
/** A price writer for a set of prices: fmtPx's decimals, and more when two different prices would read the same. */
function pxSet(ps: number[]) {
  const ok = ps.filter((p) => Number.isFinite(p) && p > 0);
  if (!ok.length) return (p?: number) => fmtPx(p);
  let dp = baseDp(Math.min(...ok));
  const distinct = new Set(ok).size;
  while (dp < 10 && new Set(ok.map((p) => pxDp(p, dp))).size < distinct) dp++;
  return (p?: number) => (p === undefined || !Number.isFinite(p) ? '–' : pxDp(p, dp));
}
/** A signed move with enough decimals to show it isn't zero. */
function mvFine(f: number) {
  let dp = Math.abs(f) >= 0.01 ? 2 : 3;
  while (dp < 6 && f !== 0 && Number((Math.abs(f) * 100).toFixed(dp)) === 0) dp++;
  return signedPct(f, dp);
}
const callWord = (c: Call) => (c === 'more' ? 'More' : 'Less');

export default function Picks({ g }: { g: GameApi }) {
  const { def } = g;
  const n = clampInt(def.p?.n, 2, 5, 5);
  const min = clampInt(def.p?.min, 2, n, 2);
  const flexOK = def.p?.flex !== false && n >= 3;
  const live = useLivePool(def.pool);
  // markets the feed has watched long enough to tell whether they're moving (about 9 s from a cold start)
  const watched = live.filter((s) => g.feed.since(s, Date.now() - 180_000).length >= 3);
  const [board, setBoard] = useState<Prop[] | null>(null);
  const [calls, setCalls] = useState<Record<string, Call>>({});
  const [mode, setMode] = useState<Mode>('power');
  /** The mode the slip was locked in (what the toggle showed at the lock). */
  const [slip, setSlip] = useState<Mode>('power');
  const [locked, setLocked] = useState<Locked[] | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);
  const bell = useRef<Record<string, number>>({});

  // deal once enough markets have been watched (no deps: it waits on the feed)
  useEffect(() => { if (!board && watched.length >= n) setBoard(deal(g.feed, watched, n)); });

  const moveLine = (s: string) => roundMove(evenMove(sigmaOf(g.feed, s, fallbackSigma(s)), def.secs));
  const count = Object.keys(calls).length;
  const play = playMode(flexOK ? mode : 'power', count);
  const top = count >= 2 ? payFor(play, count, count) : 0;

  const toggle = (s: string, c: Call) => setCalls((x) => {
    const y = { ...x };
    if (y[s] === c) delete y[s]; else y[s] = c;
    return y;
  });
  const reroll = () => { setCalls({}); setBoard(deal(g.feed, watched.length >= n ? watched : live, n)); };

  const go = async () => {
    if (!board || count < min) return;
    const mine = board.filter((b) => calls[b.sym]);
    // every picked line's entry, fresh, before the stake is taken
    const r = readEntries(g.feed, mine.map((b) => b.sym));
    if (!r.ok) { g.fail(`Waiting for a live ${tickerOf(r.stale)} price.`); return; }
    const lk: Locked[] = board.map((b) => {
      const e = r.at[b.sym]?.p ?? g.feed.mark(b.sym)?.p ?? NaN;
      const sc = moveLine(b.sym);
      return { ...b, entry: e, line: b.kind === 'price' ? e : sc, scale: sc };
    });
    const at = Date.now() + def.secs * 1000;
    if (!(await g.begin(at))) return;
    setSlip(play); setLocked(lk); setEndsAt(at);
  };

  // the bell: every picked market's first price at or after it
  useEffect(() => {
    if (g.phase !== 'live' || !locked || !endsAt || settled.current || Date.now() < endsAt) return;
    const mine = locked.filter((l) => calls[l.sym]);
    const px = bellPrices(g, mine.map((l) => l.sym), endsAt, bell);
    if (!px) {
      if (Date.now() > endsAt + QUIET_MS) { settled.current = true; g.abandon('Not every line sent a live price at the bell, so your stake is back.'); }
      return;
    }
    settled.current = true;
    const res: Final = {};
    for (const l of mine) res[l.sym] = { p: px[l.sym]!, out: outcomeOf(l, px[l.sym]!) };
    setFinal(res);
    const chosen = slip;
    const counted = mine.filter((l) => res[l.sym]!.out !== 'void');
    const right = counted.filter((l) => res[l.sym]!.out === calls[l.sym]).length;
    const voids = mine.length - counted.length;
    const used = playMode(chosen, counted.length);
    const mult = payFor(chosen, counted.length, right);
    const lines: Line[] = mine.map((l): Line => {
      const { p, out } = res[l.sym]!;
      const c = calls[l.sym]!;
      const mark = out === 'void' ? 'void' : out === c ? '✓' : '✗';
      if (l.kind === 'price') {
        const f = pxSet([l.line, p]);
        return [`${tickerOf(l.sym)} · ${callWord(c)} than ${f(l.line)}`, `${f(p)} ${mark}`];
      }
      return [`${tickerOf(l.sym)} · ${callWord(c)} than a ${movePct(l.line)} move`, `${mvFine(p / l.entry - 1)} ${mark}`];
    });
    lines.push(['Mode', counted.length < 2 ? 'Push (fewer than 2 counted)' : used === chosen ? (used === 'flex' ? 'Flex' : 'Power') : 'Power (a void left fewer than 3)']);
    if (voids) lines.push(['Void', `${voids} (landed on the number)`]);
    lines.push(['Right', `${right} of ${counted.length}`], ['Multiplier', counted.length < 2 ? '1× (stake back)' : fx(mult)]);
    const verdict = counted.length < 2
      ? counted.length === 0 ? 'Every pick landed right on its number. Stake back.' : 'Only one pick counted after the voids. Stake back.'
      : right === counted.length ? `All ${counted.length} right. ${fx(mult)}.`
      : mult > 0 ? `${right} of ${counted.length} right. Flex pays ${fx(mult)}.`
      : `${right} of ${counted.length} right. ${used === 'power' ? 'Power needs every one.' : 'Flex allows one miss.'}`;
    g.end(mult, verdict, lines);
  });

  if (!board) {
    const short = live.length < n;
    return (
      <Waiting tint={def.tint}
        text={short ? `Waiting for ${n} live prices…` : 'Reading the markets…'}
        sub={short ? `${live.length} of ${n} so far.` : 'Seeing which ones are moving.'}
        progress={short ? live.length / n : watched.length / n} />
    );
  }

  /* ---------- setup ---------- */
  if (g.phase === 'setup' || !locked) {
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <View style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="h2">The board</Txt>
                <Txt v="small" lines={1}>{count ? `${count} picked` : `Pick More or Less on ${min} or more`}</Txt>
              </View>
              <Pill label="New board" onPress={reroll} disabled={g.busy} />
            </Row>
            {board.map((b) => {
              const m = g.feed.mark(b.sym);
              const num = b.kind === 'price' ? fmtPx(m?.p) : movePct(moveLine(b.sym));
              return (
                <LineCard key={b.sym} g={g} prop={b} num={num} sub={b.kind === 'price' ? 'price at the bell' : 'moves, either way'} picked={calls[b.sym]}
                  right={
                    <Row style={{ gap: 6 }}>
                      <Toggle label="MORE" glyph="▲" on={calls[b.sym] === 'more'} tint={def.tint} wide={g.width > 500} disabled={g.busy || !m} onPress={() => toggle(b.sym, 'more')} />
                      <Toggle label="LESS" glyph="▼" on={calls[b.sym] === 'less'} tint={def.tint} wide={g.width > 500} disabled={g.busy || !m} onPress={() => toggle(b.sym, 'less')} />
                    </Row>
                  } />
              );
            })}
          </View>
        </TourTarget>
        {g.stakeRow}
        <TourTarget id="g-go">
          <View style={{ gap: 12 }}>
            {flexOK ? <ModeToggle mode={play} canFlex={count >= 3} onChange={setMode} tint={def.tint} disabled={g.busy} /> : null}
            <PayPanel mode={play} count={count} n={n} min={min} tint={def.tint} />
            <Go title={count >= min ? `Lock ${count} picks · ${fx(top)}` : `Pick ${min - count} more`}
              sub={count >= min ? `${usd(g.stake)} pays ${play === 'flex' ? 'up to ' : ''}${usd(g.stake * top)} · ${lengthLabel(def.secs)}` : `${lengthLabel(def.secs)} round`}
              onPress={() => void go()} disabled={count < min || g.busy} color={def.tint} ink={GT.onTint} />
          </View>
        </TourTarget>
        <Note center>A pick that lands exactly on its number is dropped.</Note>
      </View>
    );
  }

  /* ---------- live and done ---------- */
  const chosen = slip;
  const mine = locked.filter((l) => calls[l.sym]);
  const stateOf = (l: Locked): { p?: number; out: Outcome | null } => {
    const f = final?.[l.sym];
    if (f) return f;
    const m = g.feed.mark(l.sym);
    return m ? { p: m.p, out: outcomeOf(l, m.p) } : { out: null };
  };
  const states = mine.map(stateOf);
  const counted = states.filter((s) => s.out && s.out !== 'void').length;
  const right = mine.filter((l, i) => states[i]!.out === calls[l.sym]).length;
  const nowPays = payFor(chosen, counted, right);
  const done = g.phase === 'done';
  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <Clock left={final ? 0 : left} total={def.secs} tint={def.tint} label={done ? 'done' : 'to the bell'} />
        <Row style={{ justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="small" lines={1}>{`${playMode(chosen, mine.length) === 'flex' ? 'Flex' : 'Power'} · ${mine.length} picks`}</Txt>
            <Txt v="label" lines={1}>{`${right} of ${mine.length} ${done ? 'right' : 'winning'}`}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt v="small">{done ? 'Paid' : 'If it ended now'}</Txt>
            <Txt v="label" color={nowPays > 1 ? def.tint : C.muted} style={{ fontVariant: ['tabular-nums'] }}>{fx(nowPays)}</Txt>
          </View>
        </Row>
      </Panel>
      <View style={{ gap: 10 }}>
        {locked.map((l) => {
          const c = calls[l.sym];
          if (!c) {
            const num = l.kind === 'price' ? fmtPx(Number.isFinite(l.line) ? l.line : undefined) : movePct(l.line);
            return <LineCard key={l.sym} g={g} prop={l} num={num} sub={l.kind === 'price' ? 'price at the bell' : 'moves, either way'} dim />;
          }
          const s = stateOf(l);
          const f = pxSet([l.line, s.p ?? l.line]);
          const num = l.kind === 'price' ? f(l.line) : movePct(l.line);
          const word = final ? 'Bell' : 'Now';
          const sub = l.kind === 'price' ? (s.p !== undefined ? `${word} ${f(s.p)}` : 'price at the bell') : 'moves, either way';
          const delta = s.p === undefined ? undefined : l.kind === 'price' ? s.p / l.line - 1 : s.p / l.entry - 1;
          const win = s.out === c, flat = s.out === 'void';
          const color = s.out === null ? C.muted : flat ? C.muted : win ? C.up : C.down;
          const status = s.out === null ? '–' : `${flat ? '=' : win ? '✓' : '✗'} ${delta === undefined ? '' : flat ? (final ? 'void' : 'on the line') : mvFine(delta)}`;
          return (
            <LineCard key={l.sym} g={g} prop={l} num={num} sub={sub} picked={c} outline={s.out === null || flat ? undefined : color}
              right={
                <View style={{ alignItems: 'flex-end', gap: 5, maxWidth: 124 }}>
                  <Tag text={`${c === 'more' ? '▲' : '▼'} ${c.toUpperCase()}`} color={def.tint} />
                  <Txt v="label" lines={1} color={color} style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>{status}</Txt>
                </View>
              }
              meter={s.p !== undefined ? <Meter l={l} p={s.p} color={color} /> : undefined} />
          );
        })}
      </View>
    </View>
  );
}

/* ---------- pieces ---------- */
/** One line on the board: logo, ticker, the number, what it is, and the controls (or the live state) on the right. */
function LineCard({ g, prop, num, sub, picked, right, meter, dim, outline }: {
  g: GameApi; prop: Prop; num: string; sub: string; picked?: Call; right?: ReactNode; meter?: ReactNode; dim?: boolean; outline?: string;
}) {
  return (
    <Animated.View entering={FadeIn.duration(200)}
      style={{ backgroundColor: picked ? GT.selected : GT.raised, borderRadius: GS.radius.tile, paddingVertical: 12, paddingHorizontal: 12, gap: 10, borderWidth: 1.5, borderColor: outline ? `${outline}88` : picked ? `${C.brand}55` : 'transparent', opacity: dim ? 0.4 : 1 }}>
      <Row style={{ gap: 10 }}>
        <Logo sym={prop.sym} info={g.info} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1} style={{ fontSize: 14 }}>{tickerOf(prop.sym)}</Txt>
          <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 19, letterSpacing: -0.5, color: C.ink, fontVariant: ['tabular-nums'] }}>{num}</Text>
          <Txt v="small" lines={1} style={{ fontSize: 12 }}>{sub}</Txt>
        </View>
        {right}
      </Row>
      {meter}
    </Animated.View>
  );
}

/** MORE / LESS: tap to pick, tap again to clear. */
function Toggle({ label, glyph, on, tint, wide, disabled, onPress }: { label: string; glyph: string; on: boolean; tint: string; wide: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on, disabled: !!disabled }}
      style={({ pressed }) => ({ width: wide ? 86 : 60, height: 52, borderRadius: 16, backgroundColor: on ? tint : pressed ? GT.pillPressed : GT.pill, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Text style={{ ...FONT.bold, fontSize: 11, color: on ? GT.onTint : C.muted }}>{glyph}</Text>
      <Text style={{ ...FONT.bold, fontSize: 12.5, letterSpacing: 0.3, color: on ? GT.onTint : C.ink }}>{label}</Text>
    </Pressable>
  );
}

/** Power / Flex (Flex from 3 picks). */
function ModeToggle({ mode, canFlex, onChange, tint, disabled }: { mode: Mode; canFlex: boolean; onChange: (m: Mode) => void; tint: string; disabled?: boolean }) {
  const seg = (m: Mode, label: string, sub: string) => {
    const on = mode === m;
    const off = disabled || (m === 'flex' && !canFlex);
    return (
      <Pressable key={m} onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(m); }} disabled={off} accessibilityRole="button" accessibilityLabel={`${label}: ${sub}`} accessibilityState={{ selected: on, disabled: off }}
        style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 18, backgroundColor: on ? tint : pressed ? GT.pillPressed : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: off && !on ? 0.4 : 1 })}>
        <Text style={{ ...FONT.bold, fontSize: 15, color: on ? GT.onTint : C.ink }}>{label}</Text>
        <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 11.5, color: on ? `${GT.onTint}B8` : C.muted }}>{sub}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: GT.raised, borderRadius: 22 }}>
      {seg('power', 'Power', 'Every pick hits')}
      {seg('flex', 'Flex', canFlex ? 'One miss still pays' : 'From 3 picks')}
    </View>
  );
}

/** The payout table for the slip as it stands: Power's ladder (your count lit), or Flex for your count. */
function PayPanel({ mode, count, n, min, tint }: { mode: Mode; count: number; n: number; min: number; tint: string }) {
  const rows: { label: string; x: number; on: boolean }[] = [];
  if (mode === 'flex') {
    const f = FLEX[count]!;
    rows.push({ label: `${count} of ${count} right`, x: f.all, on: true }, { label: `${count - 1} of ${count} right`, x: f.one, on: true });
  } else {
    for (let k = Math.max(2, min); k <= n; k++) rows.push({ label: `${k} picks, all right`, x: POWER[k]!, on: k === count });
  }
  return (
    <Panel style={{ gap: 4, paddingVertical: 12 }}>
      <Txt v="small" style={{ ...FONT.semi, letterSpacing: 0.6, marginBottom: 4 }}>PAYS</Txt>
      {rows.map((r) => (
        <Row key={r.label} style={{ justifyContent: 'space-between', gap: 10, minHeight: 34, paddingHorizontal: 10, borderRadius: 12, backgroundColor: r.on && mode === 'power' ? GT.selected : 'transparent' }}>
          <Txt v="body" lines={1} color={r.on ? C.ink : C.muted} style={{ flex: 1 }}>{r.label}</Txt>
          <Txt v="label" color={r.on ? tint : C.muted} style={{ fontVariant: ['tabular-nums'] }}>{fx(r.x)}</Txt>
        </Row>
      ))}
      <Row style={{ justifyContent: 'space-between', gap: 10, minHeight: 30, paddingHorizontal: 10 }}>
        <Txt v="body" color={C.muted} style={{ flex: 1 }}>Anything else</Txt>
        <Txt v="label" color={C.muted}>0×</Txt>
      </Row>
    </Panel>
  );
}

/** Less ← the line → More: where the live price (or move) sits against the line. */
function Meter({ l, p, color }: { l: Locked; p: number; color: string }) {
  const x = l.kind === 'price'
    ? 0.5 + 0.5 * Math.max(-1, Math.min(1, (p / l.line - 1) / (2 * l.scale)))
    : Math.max(0, Math.min(1, Math.abs(p / l.entry - 1) / (2 * l.line)));
  return (
    <Row style={{ gap: 8 }}>
      <Text style={{ ...FONT.bold, fontSize: 10, letterSpacing: 0.4, color: C.muted }}>LESS</Text>
      <View style={{ flex: 1, height: 14, justifyContent: 'center' }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: GT.track }} />
        <View style={{ position: 'absolute', left: '50%', marginLeft: -1, top: 1, width: 2, height: 12, borderRadius: 1, backgroundColor: C.dim }} />
        <View style={{ position: 'absolute', left: `${x * 100}%`, marginLeft: -6, top: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 2, borderColor: C.bg }} />
      </View>
      <Text style={{ ...FONT.bold, fontSize: 10, letterSpacing: 0.4, color: C.muted }}>MORE</Text>
    </Row>
  );
}
