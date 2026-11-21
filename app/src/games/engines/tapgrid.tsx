// Tap Grid (Nov 21): solo "tap trading", as on Euphoria (MegaETH), BC.GAME and Duelbits. A grid of time × price cells
// runs ahead of the live line: `cols` columns of `colSecs` seconds and `rows` rows of price. The grid is fixed when it
// opens: column i covers t0 + (i + 1)·colSecs to t0 + (i + 2)·colSecs, the row height is entry × σ × √colSecs × 0.9 and
// the rows are centred on the entry. The columns slide left past a fixed "now" line as the seconds pass.
// A cell's multiplier is the chance the price line passes through it: a Monte Carlo of 500 log-normal walks at the
// market's live volatility from the latest tick, one step per 1.5 s feed tick joined by straight lines (the same line
// the round is settled on), run again on every new tick with the same random draws (so the numbers move with the
// price, not with noise): 97% of fair, 1.1× to 50×; a cell above 88% is shut ("–").
// Tap up to `chips` cells, each 1/chips of the stake, at least 1.5 s before their seconds start: the tap locks the
// multiplier shown. A cell hits if a feed tick lands in it or the straight line between two ticks crosses it inside its
// seconds; a hit lights up the moment it happens, a miss is decided once its seconds are over and the first tick after
// them is in. After the last column: payout = (unused chips + the multipliers of the cells that hit) / chips.
// p: { cols = 5, colSecs = 5, rows = 7, chips = 5 }   (def.secs = (cols + 1) × colSecs)
import * as Haptics from 'expo-haptics';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  Clock, GS, GT, Go, MarketHead, Note, Panel, Pill, QUIET_MS, StatTile, Waiting, absPct, clampInt, fallbackSigma, fmtPx,
  mktLine, sigmaOf, tickerOf, usd, useClock, useRolled, type GameApi, type Line as RLine, type Tick,
} from '../kit';

/** Monte Carlo paths per pricing (the second half mirrors the first). */
const PATHS = 500;
/** The feed's tick (feed.ts polls every 1.5 s): the Monte Carlo steps on it, because the round is settled on it. */
const TICK_MS = 1500;
/** A cell can be tapped until this long before its seconds start. */
const TAP_LEAD = 1500;
/** A cell more likely than this is shut. */
const MAX_P = 0.88;
/** Row pitch (every cell's tap area is this tall), top pad, column-label foot, price gutter, gap between cells. */
const PITCH = 44, TOP = 6, FOOT = 20, GUT = 50, GAP = 2;

type Grid = { t0: number; P0: number; h: number; sigma: number };
type Chip = { i: number; r: number; mult: number };
type State = 'preview' | 'open' | 'closed' | 'past' | 'placed' | 'running' | 'hit' | 'miss';
type Cell = { i: number; r: number; st: State; label: string; mult: number | null };
type Mode = 'preview' | 'live' | 'done';

const keyOf = (i: number, r: number) => `${i}.${r}`;
const windowOf = (gr: Grid, colSecs: number, i: number) => ({ ws: gr.t0 + (i + 1) * colSecs * 1000, we: gr.t0 + (i + 2) * colSecs * 1000 });
function bandOf(gr: Grid, rows: number, r: number) {
  const mid = (rows - 1) / 2;
  return { lo: gr.P0 + (mid - r - 0.5) * gr.h, hi: gr.P0 + (mid - r + 0.5) * gr.h };
}
/** A multiplier at the precision it's shown with, so the payout is the number on the cell. */
const roundX = (m: number) => (m < 10 ? Math.round(m * 10) / 10 : Math.round(m));
const multOf = (p: number) => (p > MAX_P ? null : roundX(Math.min(50, Math.max(1.1, 0.97 / Math.max(p, 1e-9)))));
const fmtM = (m: number) => `${m < 10 ? m.toFixed(1) : m.toFixed(0)}×`;
/** Decimals that tell one row's price from the next. */
const dpOf = (h: number) => Math.max(0, Math.min(8, Math.ceil(-Math.log10(h))));
/** One more decimal when a row is under three units of the last digit, so a band's edges read true. */
const bandDp = (h: number) => { const d = dpOf(h); return Math.min(9, h * 10 ** d < 3 ? d + 1 : d); };
const num = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const secsLabel = (i: number, colSecs: number) => `+${(i + 1) * colSecs}–${(i + 2) * colSecs}s`;

/** `n` paths of `width` standard normal draws (Box–Muller). The second half mirrors the first, so up and down price alike. */
function draws(n: number, width: number): Float64Array {
  const z = new Float64Array(n * width);
  const half = Math.ceil(n / 2) * width;
  for (let k = 0; k < half; k += 2) {
    let u = 0;
    while (u === 0) u = Math.random();
    const v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u));
    z[k] = r * Math.cos(2 * Math.PI * v);
    if (k + 1 < half) z[k + 1] = r * Math.sin(2 * Math.PI * v);
  }
  for (let k = half; k < n * width; k++) z[k] = -z[k - half]!;
  return z;
}

/** Monte Carlo draws per path: enough ticks to cover the round from an entry up to 10 s old. */
const drawWidth = (spanSecs: number) => Math.ceil((spanSecs * 1000 + 10_000) / TICK_MS) + 1;

/**
 * The chance of each cell (index i × rows + r) that the price line passes through it in its seconds: PATHS log-normal
 * walks from the latest tick (price `S` at `tS`), one step per feed tick, each joined to the next by a straight line,
 * exactly as the round is settled. (Finer steps would find crossings a line drawn through 1.5 s ticks never shows and
 * overprice every cell: at 0.5 s steps a chip returned about 87% instead of 97%.) Path k's n-th step is always Z[k][n]
 * (common random numbers), so a new tick moves the numbers only as much as the price and the clock moved.
 */
function cellOdds(Z: Float64Array, width: number, cols: number, rows: number, colSecs: number, gr: Grid, S: number, tS: number): Float64Array {
  const C = colSecs * 1000;
  const tEnd = gr.t0 + (cols + 1) * C;
  const out = new Float64Array(cols * rows);
  if (tS >= tEnd) return out;
  const M = Math.min(width, Math.ceil((tEnd - tS) / TICK_MS));
  const sd = gr.sigma * Math.sqrt(TICK_MS / 1000);
  // row position: row r spans [r, r + 1], row 0 on top
  const a = S / gr.h, b = gr.P0 / gr.h, c = (rows - 1) / 2 + 0.5;
  const start = c - (a - b);
  const masks = new Int32Array(cols);
  for (let k = 0; k < PATHS; k++) {
    masks.fill(0);
    let x = 0, prev = start, ta = tS;
    for (let n = 0; n < M; n++) {
      x += sd * Z[k * width + n]!;
      const rp = c - (a * Math.exp(x) - b);
      const tb = ta + TICK_MS;
      // the columns this segment's seconds overlap, each clipped to its own seconds
      const i1 = Math.min(cols - 1, Math.floor((tb - gr.t0) / C) - 1);
      for (let i = Math.max(0, Math.floor((ta - gr.t0) / C) - 1); i <= i1; i++) {
        const ws = gr.t0 + (i + 1) * C;
        const ca = Math.max(ta, ws), cb = Math.min(tb, ws + C);
        if (cb < ca) continue;
        const ya = prev + ((rp - prev) * (ca - ta)) / TICK_MS, yb = prev + ((rp - prev) * (cb - ta)) / TICK_MS;
        const lo = ya < yb ? ya : yb, hi = ya < yb ? yb : ya;
        const r1 = Math.min(rows - 1, Math.floor(hi));
        for (let r = Math.max(0, Math.ceil(lo - 1)); r <= r1; r++) masks[i] |= 1 << r;
      }
      prev = rp;
      ta = tb;
    }
    for (let i = 0; i < cols; i++) {
      const m = masks[i]!;
      if (m) for (let r = 0; r < rows; r++) if (m & (1 << r)) out[i * rows + r] += 1;
    }
  }
  for (let q = 0; q < out.length; q++) out[q] /= PATHS;
  return out;
}

/** Does the price line (straight between ticks) pass through the box [ws, we] × [lo, hi]? */
function passes(path: Tick[], ws: number, we: number, lo: number, hi: number) {
  for (let k = 0; k < path.length; k++) {
    const q = path[k]!;
    if (q.t >= ws && q.t <= we && q.p >= lo && q.p <= hi) return true;
    if (k === 0) continue;
    const a = path[k - 1]!;
    if (q.t <= ws || a.t >= we) continue;
    const at = (t: number) => a.p + ((q.p - a.p) * (t - a.t)) / (q.t - a.t);
    const pa = at(Math.max(a.t, ws)), pb = at(Math.min(q.t, we));
    if (Math.max(pa, pb) >= lo && Math.min(pa, pb) <= hi) return true;
  }
  return false;
}

/** Ticks from several lists, in time order, one per moment. */
function mergeTicks(...lists: Tick[][]): Tick[] {
  const all = lists.flat().sort((x, y) => x.t - y.t);
  const out: Tick[] = [];
  for (const x of all) {
    if (out.length && out[out.length - 1]!.t === x.t) out[out.length - 1] = { t: x.t, p: x.p };
    else out.push({ t: x.t, p: x.p });
  }
  return out;
}

export default function Tapgrid({ g }: { g: GameApi }) {
  const { def } = g;
  const cols = clampInt(def.p?.cols, 2, 8, 5);
  const colSecs = clampInt(def.p?.colSecs, 2, 20, 5);
  const rows = clampInt(def.p?.rows, 3, 9, 7);
  const chips = clampInt(def.p?.chips, 1, 10, 5);
  const span = (cols + 1) * colSecs; // the round, in seconds (def.secs)
  const { sym, shown, reroll } = useRolled(g);
  const [Z] = useState(() => draws(PATHS, drawWidth(span)));
  const [grid, setGrid] = useState<Grid | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [placed, setPlaced] = useState<Chip[]>([]);
  const [res, setRes] = useState<Record<string, boolean>>({});
  /** Every live mark seen during the round (the feed's history skips polls where the price didn't change). */
  const [log, setLog] = useState<Tick[]>([]);
  const [finalT, setFinalT] = useState<number | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  const mk = sym ? g.feed.mark(sym) : undefined;
  const fresh = !!sym && g.feed.fresh(sym);
  const liveSigma = sym ? sigmaOf(g.feed, sym, fallbackSigma(sym)) : 0;
  // before the round, the grid is previewed as if it opened on the latest tick
  const gr: Grid | null = grid ?? (mk ? { t0: mk.t, P0: mk.p, h: mk.p * liveSigma * Math.sqrt(colSecs) * 0.9, sigma: liveSigma } : null);
  const S = mk?.p ?? 0, tS = mk?.t ?? 0;
  const gt0 = gr?.t0 ?? 0, gP0 = gr?.P0 ?? 0, gh = gr?.h ?? 0, gs = gr?.sigma ?? 0;
  // priced again on every new tick (S, tS), not on every frame
  const odds = useMemo(() => (S > 0 && gh > 0 ? cellOdds(Z, drawWidth(span), cols, rows, colSecs, { t0: gt0, P0: gP0, h: gh, sigma: gs }, S, tS) : null), [Z, span, cols, rows, colSecs, gt0, gP0, gh, gs, S, tS]);

  const receiptHead = (gd: Grid, e: Tick, s: string): RLine[] => [
    ['Market', mktLine(g, s)],
    ['Entry', fmtPx(e.p)],
    ['Row size', `$${num(gd.h, Math.min(9, bandDp(gd.h) + 1))} · ${absPct(gd.h / gd.P0)}`],
    ['Hit rule', 'Line passes through the cell'],
  ];

  // each tick: keep the mark, light up hits, decide misses once a cell's seconds are over; settle after the last column
  useEffect(() => {
    if (g.phase !== 'live' || !sym || !grid || !entry || !endsAt || settled.current) return;
    const m = g.feed.mark(sym);
    const newer = !!m && m.t > entry.t && (!log.length || m.t > log[log.length - 1]!.t);
    const lg = newer ? [...log, { t: m.t, p: m.p }] : log;
    if (newer) setLog(lg);
    const path = mergeTicks([entry], g.feed.since(sym, entry.t + 1), lg);
    const lastT = path[path.length - 1]!.t;
    let all = res;
    let hitNow = false;
    for (const c of placed) {
      const k = keyOf(c.i, c.r);
      if (all[k] !== undefined) continue;
      const { ws, we } = windowOf(grid, colSecs, c.i);
      const { lo, hi } = bandOf(grid, rows, c.r);
      const v = passes(path, ws, we, lo, hi) ? true : lastT >= we ? false : undefined;
      if (v === undefined) continue;
      if (all === res) all = { ...res };
      all[k] = v;
      if (v) hitNow = true;
    }
    if (all !== res) {
      setRes(all);
      if (hitNow) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const now = Date.now();
    if (now < endsAt) return;
    const head = receiptHead(grid, entry, sym);
    if (!placed.length) {
      settled.current = true;
      setFinalT(lastT);
      g.end(1, 'No cells tapped. Stake back.', [...head, ['Chips unused', `${chips} of ${chips}, back`]]);
      return;
    }
    if (placed.every((c) => all[keyOf(c.i, c.r)] !== undefined)) {
      settled.current = true;
      setFinalT(lastT);
      const order = [...placed].sort((x, y) => x.i - y.i || x.r - y.r);
      const hits = order.filter((c) => all[keyOf(c.i, c.r)]);
      const unused = chips - placed.length;
      const mult = (unused + hits.reduce((s, c) => s + c.mult, 0)) / chips;
      const dp = bandDp(grid.h);
      const n = placed.length;
      const verdict = hits.length
        ? `${hits.length} of ${n} cell${n === 1 ? '' : 's'} hit: ${listOf(hits.map((c) => fmtM(c.mult)))}.`
        : `None of your ${n} cell${n === 1 ? '' : 's'} hit.`;
      g.end(mult, verdict, [
        ...head,
        ...order.map((c): RLine => {
          const { lo, hi } = bandOf(grid, rows, c.r);
          return [secsLabel(c.i, colSecs), `$${num(lo, dp)}–${num(hi, dp)} · ${fmtM(c.mult)} · ${all[keyOf(c.i, c.r)] ? 'hit' : 'miss'}`];
        }),
        ['Chips unused', unused ? `${unused} of ${chips}, back` : 'None'],
      ]);
    } else if (now > endsAt + QUIET_MS) {
      settled.current = true;
      g.abandon(`No live ${tickerOf(sym)} price came in after the last column, so your stake is back.`);
    }
  });

  const open = async () => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    // the entry and the volatility are read before the stake is taken; a stale price can't open the grid
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const sigma = sigmaOf(g.feed, sym, fallbackSigma(sym));
    const t0 = Date.now();
    const end = t0 + span * 1000;
    if (!(await g.begin(end))) return;
    setEntry({ t: m.t, p: m.p });
    setGrid({ t0, P0: m.p, h: m.p * sigma * Math.sqrt(colSecs) * 0.9, sigma });
    setEndsAt(end);
  };

  const tap = (i: number, r: number, mult: number) => {
    if (g.phase !== 'live' || !grid || !sym || g.busy || settled.current) return;
    if (!g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    if (windowOf(grid, colSecs, i).ws - Date.now() < TAP_LEAD) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPlaced((prev) => (prev.length >= chips || prev.some((c) => c.i === i && c.r === r) ? prev : [...prev, { i, r, mult }]));
  };

  if (!sym) return <Waiting text="Finding a market with a live price…" tint={def.tint} />;

  const mode: Mode = g.phase === 'setup' || !grid || !entry || !endsAt ? 'preview' : g.phase === 'done' ? 'done' : 'live';
  const now = endsAt && left !== null ? endsAt - left * 1000 : 0;
  const spare = chips - placed.length;
  const cells: Cell[] = [];
  if (gr) {
    for (let i = 0; i < cols; i++) {
      const { ws, we } = windowOf(gr, colSecs, i);
      for (let r = 0; r < rows; r++) {
        const k = keyOf(i, r);
        const c = placed.find((x) => x.i === i && x.r === r);
        const m = odds ? multOf(odds[i * rows + r]!) : null;
        let st: State;
        if (c) st = res[k] === true ? 'hit' : res[k] === false ? 'miss' : mode === 'live' && now >= ws && now < we ? 'running' : 'placed';
        else if (mode === 'preview') st = 'preview';
        else if (mode === 'done' || now >= we) st = 'past';
        else st = m !== null && spare > 0 && fresh && ws - now >= TAP_LEAD ? 'open' : 'closed';
        // an untapped cell whose seconds have started has no price left to show
        const label = c ? fmtM(c.mult) : st === 'past' || (mode === 'live' && now >= ws) ? '' : m === null ? '–' : fmtM(m);
        cells.push({ i, r, st, label, mult: c ? c.mult : m });
      }
    }
  }
  // the line: the round's ticks, plus enough before it to fill the left of the now line
  const drawn = gr
    ? mergeTicks(g.feed.since(sym, gr.t0 - span * 1000), entry ? [entry] : [], log, mk ? [{ t: mk.t, p: mk.p }] : []).filter((x) => finalT === null || x.t <= finalT)
    : [];

  if (mode === 'preview') {
    return (
      <View style={{ gap: 14 }}>
        <Panel>
          <MarketHead g={g} sym={shown(0) || sym} right={<Pill label="Roll again" onPress={reroll} disabled={g.busy || g.phase !== 'setup'} />} />
        </Panel>
        <TourTarget id="g-pick">
          {gr && odds ? (
            <GridView w={g.width} rows={rows} cols={cols} colSecs={colSecs} gr={gr} mode="preview" endsAt={null} now={0} path={drawn} cells={cells} tint={def.tint} onTap={() => {}} />
          ) : (
            <Waiting text={`Waiting for a live ${tickerOf(sym)} price…`} tint={def.tint} />
          )}
        </TourTarget>
        <Note center>Open the grid, then tap cells.</Note>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title="Open the grid" sub={`${chips} chips · ${usd(g.stake / chips)} each`} onPress={() => void open()} disabled={!mk || g.busy || g.phase !== 'setup'} color={def.tint} ink={GT.onTint} />
        </TourTarget>
      </View>
    );
  }

  const hits = placed.filter((c) => res[keyOf(c.i, c.r)] === true);
  const won = hits.reduce((s, c) => s + c.mult, 0) * (g.stake / chips);
  const tk = tickerOf(sym);
  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <MarketHead g={g} sym={sym} from={entry!.p} />
        <Clock left={left} total={span} tint={def.tint} label={mode === 'done' ? 'done' : 'left'} />
        <Row style={{ justifyContent: 'space-between', gap: 10 }}>
          <Row style={{ gap: 8 }}>
            <Txt v="label" style={{ fontVariant: ['tabular-nums'] }}>Chips {spare} of {chips}</Txt>
            <Row style={{ gap: 4 }}>
              {Array.from({ length: chips }, (_, k) => (
                <View key={k} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: k < spare ? def.tint : 'transparent', borderWidth: 1.5, borderColor: k < spare ? def.tint : C.dim }} />
              ))}
            </Row>
          </Row>
          <Txt v="small" lines={1} style={{ flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{usd(g.stake / chips)} a chip</Txt>
        </Row>
      </Panel>
      <GridView w={g.width} rows={rows} cols={cols} colSecs={colSecs} gr={grid!} mode={mode} endsAt={endsAt} now={now} path={drawn} cells={cells} tint={def.tint} onTap={tap} />
      <Row style={{ gap: 8 }}>
        <StatTile k="Hits" v={`${hits.length} of ${placed.length}`} color={hits.length ? C.up : undefined} />
        <StatTile k="Won so far" v={usd(won)} color={won > 0 ? C.up : undefined} />
      </Row>
      {mode === 'live' ? (
        <Note center>{!fresh ? `Waiting for a live ${tk} price…` : spare ? 'Tap cells ahead of the line.' : 'All chips down. Watch the line.'}</Note>
      ) : null}
    </View>
  );
}

/** How each kind of cell looks. */
function lookOf(st: State, tint: string): { bg: string; bc: string; bw: number; fg: string; op: number } {
  switch (st) {
    case 'preview': return { bg: GT.raised, bc: `${tint}2E`, bw: 1, fg: C.ink, op: 0.92 };
    case 'open': return { bg: GT.raised, bc: `${tint}55`, bw: 1, fg: C.ink, op: 1 };
    case 'closed': return { bg: GT.raised, bc: 'transparent', bw: 0, fg: C.muted, op: 0.5 };
    case 'past': return { bg: GT.raised, bc: 'transparent', bw: 0, fg: C.muted, op: 0.22 };
    case 'placed': return { bg: tint, bc: 'transparent', bw: 0, fg: GT.onTint, op: 1 };
    case 'running': return { bg: tint, bc: C.ink, bw: 2, fg: GT.onTint, op: 1 };
    case 'hit': return { bg: C.up, bc: 'transparent', bw: 0, fg: GT.onTint, op: 1 };
    case 'miss': return { bg: tint, bc: 'transparent', bw: 0, fg: GT.onTint, op: 0.28 };
  }
}

/**
 * The grid: a fixed "now" line at 30% of the width, the price line (with a soft glow) to its left, and the columns to
 * its right sliding left as the seconds pass (the whole world layer moves on the UI thread, so it glides). The grid
 * fits the width at the start; at the end it slides back so the whole round shows.
 */
function GridView({ w, rows, cols, colSecs, gr, mode, endsAt, now, path, cells, tint, onTap }: {
  w: number; rows: number; cols: number; colSecs: number; gr: Grid; mode: Mode; endsAt: number | null; now: number;
  path: Tick[]; cells: Cell[]; tint: string; onTap: (i: number, r: number, mult: number) => void;
}) {
  const span = (cols + 1) * colSecs * 1000;
  const nowX = Math.round(w * 0.3);
  const ppm = (w - GUT - nowX) / span;
  const colW = colSecs * 1000 * ppm;
  const gridH = rows * PITCH;
  const H = TOP + gridH + FOOT;
  const mid = (rows - 1) / 2;
  const X = (t: number) => nowX + (t - gr.t0) * ppm;
  const Y = (p: number) => Math.max(TOP + 1, Math.min(TOP + gridH - 1, TOP + (mid + 0.5 - (p - gr.P0) / gr.h) * PITCH));
  const worldW = Math.ceil(nowX + (span + QUIET_MS + 10_000) * ppm + GUT);
  const dp = dpOf(gr.h);
  const fs = colW >= 40 ? 12.5 : colW >= 34 ? 10.5 : 9.5;
  /** Narrow cells (short columns on a phone) drop the × so the multiplier never cuts off. */
  const narrow = colW < 34;
  const shown = (label: string) => (narrow ? label.replace('×', '') : label);
  const t0 = gr.t0;
  const gid = `tg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const off = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(off);
    if (mode === 'live' && endsAt) {
      const until = endsAt + QUIET_MS;
      off.value = -(Date.now() - t0) * ppm;
      off.value = withTiming(-(until - t0) * ppm, { duration: Math.max(1, until - Date.now()), easing: Easing.linear });
    } else if (mode === 'done') {
      const centre = nowX + ((colSecs * 1000 + span) / 2) * ppm;
      off.value = withTiming((w - GUT) / 2 - centre, { duration: 700, easing: Easing.out(Easing.cubic) });
    } else off.value = 0;
  }, [mode, endsAt, t0, ppm, w, nowX, colSecs, span, off]);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(2.4, { duration: 1100 }), -1, false);
    return () => { cancelAnimation(pulse); cancelAnimation(off); };
  }, [pulse, off]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: off.value }] }));
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 1.4 - pulse.value / 2 }));

  const pts = path.map((x) => `${X(x.t).toFixed(1)},${Y(x.p).toFixed(1)}`);
  const d = pts.length > 1 ? `M${pts.join(' L')}` : '';
  const head = path[path.length - 1];
  const hx = head ? X(head.t) : 0, hy = head ? Y(head.p) : 0;
  const rowPrice = (r: number) => num(gr.P0 + (mid - r) * gr.h, dp);

  return (
    <View style={{ width: w, height: H, borderRadius: GS.radius.tile, backgroundColor: GT.panel, overflow: 'hidden' }}>
      {/* the row lines, under everything */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
        <Svg width={w} height={H}>
          {Array.from({ length: rows + 1 }, (_, r) => <Line key={r} x1={0} x2={w} y1={TOP + r * PITCH} y2={TOP + r * PITCH} stroke={GT.grid} strokeWidth={1} />)}
        </Svg>
      </View>

      {/* the world: cells, column labels and the price line, all in the grid's own time; it slides left */}
      <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 0, top: 0, width: worldW, height: H }, slide]}>
        {cells.map((c) => {
          const { ws } = windowOf(gr, colSecs, c.i);
          const lk = lookOf(c.st, tint);
          const can = c.st === 'open' && c.mult !== null;
          return (
            <Pressable key={keyOf(c.i, c.r)} disabled={!can} onPress={() => { if (c.mult !== null) onTap(c.i, c.r, c.mult); }}
              accessibilityRole="button" accessibilityState={{ disabled: !can, selected: c.st === 'placed' || c.st === 'running' || c.st === 'hit' || c.st === 'miss' }}
              accessibilityLabel={`${secsLabel(c.i, colSecs)}, around ${rowPrice(c.r)}${c.label ? `, ${c.label}` : ''}${c.st === 'hit' ? ', hit' : c.st === 'miss' ? ', missed' : ''}`}
              style={({ pressed }) => ({ position: 'absolute', left: X(ws), top: TOP + c.r * PITCH, width: colW, height: PITCH, padding: GAP, transform: [{ scale: pressed ? 0.9 : 1 }] })}>
              <View style={{ flex: 1, borderRadius: 9, backgroundColor: lk.bg, borderWidth: lk.bw, borderColor: lk.bc, opacity: lk.op, alignItems: 'center', justifyContent: 'center' }}>
                {c.st === 'hit' ? (
                  <Animated.View entering={ZoomIn.duration(240)} style={{ alignItems: 'center' }}>
                    <Text style={{ ...FONT.bold, fontSize: 14, lineHeight: 16, color: GT.onTint }}>✓</Text>
                    <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 9, color: GT.onTint, fontVariant: ['tabular-nums'] }}>{shown(c.label)}</Text>
                  </Animated.View>
                ) : (
                  <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: fs, letterSpacing: narrow ? -0.3 : 0, color: lk.fg, fontVariant: ['tabular-nums'] }}>{shown(c.label)}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
        {Array.from({ length: cols }, (_, i) => {
          const { ws } = windowOf(gr, colSecs, i);
          if (mode === 'live' && now >= ws) return null;
          return (
            <Text key={`c${i}`} pointerEvents="none" numberOfLines={1} style={{ position: 'absolute', left: X(ws), width: colW, top: TOP + gridH + 3, textAlign: 'center', ...FONT.semi, fontSize: 9.5, color: C.muted }}>
              +{(i + 1) * colSecs}s
            </Text>
          );
        })}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
          <Svg width={worldW} height={H}>
            {d ? <Path d={d} stroke={tint} strokeOpacity={0.3} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {d ? <Path d={d} stroke={C.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          </Svg>
        </View>
        {head && mode !== 'done' ? (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: hx - 6, top: hy - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: tint }, ring]} />
        ) : null}
        {head ? <View pointerEvents="none" style={{ position: 'absolute', left: hx - 5, top: hy - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: C.ink, borderWidth: 2, borderColor: tint }} /> : null}
      </Animated.View>

      {/* fixed on top: the left fade, the now line and the price's row */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={GT.panel} stopOpacity={1} />
              <Stop offset="1" stopColor={GT.panel} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={26} height={H} fill={`url(#${gid})`} />
          {mode !== 'done' ? (
            <>
              <Line x1={nowX} x2={nowX} y1={TOP} y2={TOP + gridH} stroke={C.ink} strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="3 4" />
              {head ? <Line x1={0} x2={w - GUT} y1={hy} y2={hy} stroke={C.ink} strokeOpacity={0.16} strokeWidth={1} strokeDasharray="2 4" /> : null}
            </>
          ) : null}
        </Svg>
      </View>
      {mode !== 'done' ? (
        <Text pointerEvents="none" style={{ position: 'absolute', left: nowX - 40, width: 36, top: TOP + gridH + 3, textAlign: 'right', ...FONT.bold, fontSize: 9.5, color: C.ink }}>now</Text>
      ) : null}

      {/* the price gutter: each row's price and the live price tag */}
      <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, width: GUT, height: H, backgroundColor: GT.panel, borderLeftWidth: 1, borderLeftColor: GT.hair }}>
        {Array.from({ length: rows }, (_, r) => {
          const txt = rowPrice(r);
          return (
            <Text key={r} numberOfLines={1} style={{ position: 'absolute', left: 2, right: 4, top: TOP + r * PITCH + PITCH / 2 - 7, textAlign: 'right', ...FONT.semi, fontSize: txt.length > 7 ? 8.5 : 9.5, color: C.muted, fontVariant: ['tabular-nums'] }}>{txt}</Text>
          );
        })}
        {head && mode !== 'done' ? (
          <View style={{ position: 'absolute', left: 2, right: 2, top: Math.max(TOP, Math.min(TOP + gridH - 18, hy - 9)), height: 18, borderRadius: 6, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: num(head.p, dp).length > 7 ? 8.5 : 9.5, color: GT.onTint, fontVariant: ['tabular-nums'] }}>{num(head.p, dp)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
