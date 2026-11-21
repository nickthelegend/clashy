// Rewind (Nov 21): an instant game on real past candles (the kit's Phoenix mark candles, Pacifica's for the markets only
// Pacifica lists). A stretch of real history from the last few hours is shown with what came next behind a curtain.
// dir (solo): HIGHER or LOWER, `hide` candles later, than the last close you see? The hidden candles come in one by one;
//   right grows the pot by `step` and the next chart comes up (another market, or a stretch of time you haven't seen),
//   wrong loses it. Cash out any time after a right call. A window whose answer would be a dead heat is never dealt,
//   and a window's hidden candles are never ones you've already seen this round.
// target (vs Clashy Bot, 2×): drag a level to where the LAST hidden candle closed. Clashy Bot guesses the last seen
//   close × exp(z · σ · √hide), z a standard normal (Box–Muller), σ the stdev of the seen candles' log close-to-close
//   returns. Closer to the real close wins 2×; the exact same distance is a push.
// Flat stretches are never dealt. Nothing is made up: a market whose candles don't load is skipped, and the game says so.
// The stake is taken at the first answer (dir) or at Lock it in (target). A call that is already decided settles when
// its candles finish coming in, or at once if the screen closes first.
// p: { tf: '1m' | '5m' = '1m', show = 40, hide = 10, mode: 'dir' | 'target' = 'dir', step = 1.9 }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { ErrorLine, Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  BotSays, CandleChart, Choice, GT, Go, Logo, Note, Panel, Pill, PotBar, Sides, Slider, Waiting, candleSyms, candleTime, clampInt, fmtX, mktLine,
  nameOf, pNum, pStr, pick, poolList, tickerOf, useGameCandles, type CandleTf, type GCandle, type GameApi, type Line, type Window,
} from '../kit';

/** One hidden candle comes in every DRIP_MS. */
const DRIP_MS = 130;
/** A right call shows its answer this long before the next chart. */
const NEXT_MS = 1600;
/** Candles loaded per market (the last two hours of 1 m, ten of 5 m). */
const LOAD = 120;
const TF_WORD: Record<CandleTf, string> = { '1m': '1-minute candles', '5m': '5-minute candles' };

/** A price with enough digits to tell two guesses apart. */
const px = (p: number) => (p >= 1000 ? `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${p.toPrecision(p >= 1 ? 6 : 5)}`);
const pctMove = (from: number, to: number) => { const f = to / from - 1; return `${f >= 0 ? '+' : '−'}${Math.abs(f * 100).toFixed(Math.abs(f) < 0.01 ? 3 : 2)}%`; };
const flat = (cs: GCandle[]) => !cs.length || Math.max(...cs.map((k) => k.h)) <= Math.min(...cs.map((k) => k.l));
const lastOf = <T,>(a: readonly T[]) => a[a.length - 1]!;
const spanOf = (w: Window) => `${candleTime(w.seen[0]!.t)} to ${candleTime(lastOf(w.seen).t)}`;
/** Average true range of the seen candles. */
function atrOf(cs: GCandle[]) {
  let s = 0;
  cs.forEach((k, i) => { const pc = i ? cs[i - 1]!.c : k.o; s += Math.max(k.h - k.l, Math.abs(k.h - pc), Math.abs(k.l - pc)); });
  return cs.length ? s / cs.length : 0;
}
/** Stdev of the log close-to-close returns. */
function sigmaOfCloses(cs: GCandle[]) {
  const r: number[] = [];
  for (let i = 1; i < cs.length; i++) r.push(Math.log(cs[i]!.c / cs[i - 1]!.c));
  if (r.length < 2) return 0;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
}
/** A standard normal draw (Box–Muller). */
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

/** Every usable window of `data` (a random one is then picked): seen candles that moved, a non-tied answer in dir mode,
 *  and hidden candles that weren't on screen earlier in the round. */
function windowsOf(data: Record<string, GCandle[]>, syms: string[], tf: CandleTf, show: number, hide: number, dir: boolean, used: Map<string, Set<number>>) {
  const out: Window[] = [];
  for (const sym of syms) {
    const all = data[sym];
    if (!all || all.length < show + hide) continue;
    const seenBefore = used.get(sym);
    for (let s = 0; s + show + hide <= all.length; s++) {
      const w: Window = { sym, tf, seen: all.slice(s, s + show), hidden: all.slice(s + show, s + show + hide) };
      if (flat(w.seen)) continue;
      if (dir && lastOf(w.hidden).c === lastOf(w.seen).c) continue;
      if (seenBefore && w.hidden.some((k) => seenBefore.has(k.t))) continue;
      out.push(w);
    }
  }
  return out;
}

/** The candidate markets and their candles; `more` loads markets the round hasn't tried yet. */
function useCandidates(g: GameApi, tf: CandleTf, k: number) {
  const pool = poolList(g.def.pool);
  const [syms, setSyms] = useState<string[]>(() => candleSyms(pool, k).sort());
  const tried = useRef<Set<string>>(new Set(syms));
  const c = useGameCandles(syms, tf, LOAD, 1);
  // the hook still holds the previous set's candles for one render after the set changes
  const data = c.data && Object.keys(c.data).every((s) => syms.includes(s)) ? c.data : null;
  /** Load untried markets; false when every market in the pool has been tried. */
  const more = () => {
    const rest = pool.filter((s) => !tried.current.has(s));
    if (!rest.length) return false;
    const next = candleSyms(rest, k).sort();
    next.forEach((s) => tried.current.add(s));
    setSyms(next);
    return true;
  };
  /** Start over with a fresh set (Retry). */
  const reset = () => { const next = candleSyms(pool, k).sort(); tried.current = new Set(next); setSyms(next); c.retry(); };
  return { syms, data, error: data ? undefined : c.error, more, reset };
}

export default function Rewind({ g }: { g: GameApi }) {
  return pStr(g, 'mode', ['dir', 'target'] as const, 'dir') === 'target' ? <Target g={g} /> : <Dir g={g} />;
}

/** The market and the window's real time. */
function ChartHead({ g, w, tf }: { g: GameApi; w: Window; tf: CandleTf }) {
  return (
    <Animated.View key={`${w.sym}${w.seen[0]!.t}`} entering={FadeInDown.duration(260)}>
      <Row style={{ gap: 10 }}>
        <Logo sym={w.sym} info={g.info} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1}>{nameOf(g.info, w.sym)} <Text style={{ color: C.muted }}>{tickerOf(w.sym)}</Text></Txt>
          <Txt v="small" lines={1} style={{ fontSize: 12.5 }}>{TF_WORD[tf]} · {spanOf(w)}</Txt>
        </View>
      </Row>
    </Animated.View>
  );
}

/** Settings shared by both modes. */
function useSettings(g: GameApi) {
  const tf = pStr(g, 'tf', ['1m', '5m'] as const, '1m');
  const show = clampInt(g.def.p?.show, 10, 90, 40);
  const hide = clampInt(g.def.p?.hide, 1, Math.max(1, LOAD - show), 10);
  return { tf, show, hide };
}

/** Timers for the reveal: the drip, the next chart, and a decided call that must settle even if the screen closes. */
function useReveal() {
  const dripRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(0);
  useEffect(() => () => {
    if (dripRef.current) clearInterval(dripRef.current);
    if (nextRef.current) clearTimeout(nextRef.current);
    pendingRef.current?.(); // a call already decided settles now
  }, []);
  /** Brings `n` hidden candles in one by one, then runs `fin`. */
  const run = (n: number, fin: () => void) => {
    let c = 0;
    setOpen(0);
    if (dripRef.current) clearInterval(dripRef.current);
    dripRef.current = setInterval(() => {
      c += 1;
      setOpen(c);
      if (c >= n) { clearInterval(dripRef.current!); dripRef.current = null; fin(); }
    }, DRIP_MS);
  };
  return { open, setOpen, run, nextRef, pendingRef };
}

/* ---------- dir: higher or lower, chained ---------- */
function Dir({ g }: { g: GameApi }) {
  const { def } = g;
  const { tf, show, hide } = useSettings(g);
  const step = pNum(g, 'step', 1.9) > 1 ? pNum(g, 'step', 1.9) : 1.9;
  const cand = useCandidates(g, tf, 4);
  const { open, setOpen, run, nextRef, pendingRef } = useReveal();
  const [win, setWin] = useState<Window | null>(null);
  const [ans, setAns] = useState<{ call: 'higher' | 'lower'; right: boolean } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [out, setOut] = useState(false);
  const [streak, setStreak] = useState(0);
  const [mult, setMult] = useState(1);
  const [log, setLog] = useState<Line[]>([]);
  const ended = useRef(false);
  const starting = useRef(false);
  const answered = useRef(false); // set on the tap itself, so a double tap can't answer twice
  const used = useRef(new Map<string, Set<number>>());
  const lastSym = useRef<string | null>(null);

  // deal a window once candles are in (no deps on purpose; the guards make it run once per chart)
  useEffect(() => {
    if (win || ans || out || ended.current || !cand.data) return;
    const ws = windowsOf(cand.data, cand.syms, tf, show, hide, true, used.current);
    const other = ws.filter((w) => w.sym !== lastSym.current);
    const w = other.length ? pick(other) : ws.length ? pick(ws) : null;
    if (w) { setWin(w); lastSym.current = w.sym; return; }
    if (!cand.more()) setOut(true);
  });

  const answer = async (call: 'higher' | 'lower') => {
    if (!win || ans || answered.current || ended.current || starting.current || g.busy || g.phase === 'done') return;
    if (g.phase === 'setup') {
      starting.current = true;
      const ok = await g.begin();
      starting.current = false;
      if (!ok) return;
    }
    if (answered.current) return;
    answered.current = true;
    const a = lastOf(win.seen).c, b = lastOf(win.hidden).c;
    const right = (call === 'higher') === (b > a);
    setAns({ call, right });
    const seen = used.current.get(win.sym) ?? new Set<number>();
    [...win.seen, ...win.hidden].forEach((k) => seen.add(k.t));
    used.current.set(win.sym, seen);
    const row: Line = [`${log.length + 1}. ${tickerOf(win.sym)} · ${spanOf(win)}`, `${call} · ${px(a)} → ${px(b)} (${pctMove(a, b)}) · ${right ? 'right' : 'wrong'}`];
    const nextLog = [...log, row];
    setLog(nextLog);
    if (!right) {
      ended.current = true;
      pendingRef.current = () => {
        pendingRef.current = null;
        g.end(0, `${tickerOf(win.sym)} went ${b > a ? 'higher' : 'lower'}: ${pctMove(a, b)} ${hide} candles later.${streak ? ` The ${streak}-streak is gone.` : ''}`,
          [...nextLog.slice(-10), ['Streak', `${streak} right`]]);
      };
    }
    run(win.hidden.length, () => {
      setRevealed(true);
      if (!right) { pendingRef.current?.(); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStreak((s) => s + 1);
      setMult((m) => m * step);
      nextRef.current = setTimeout(nextChart, NEXT_MS);
    });
  };

  const nextChart = () => {
    if (nextRef.current) clearTimeout(nextRef.current);
    nextRef.current = null;
    if (ended.current) return;
    answered.current = false;
    setWin(null); setAns(null); setRevealed(false); setOpen(0);
  };

  const cashOut = () => {
    if (ended.current || streak < 1 || g.phase !== 'live' || (ans && !revealed)) return;
    ended.current = true;
    if (nextRef.current) clearTimeout(nextRef.current);
    g.end(mult, `Cashed out a ${streak}-streak at ${fmtX(mult)}.`, [...log.slice(-10), ['Streak', `${streak} right`], ['Multiplier', fmtX(mult)]]);
  };

  const potBar = <PotBar g={g} mult={mult} streak={streak} canCash={streak > 0 && g.phase === 'live' && (!ans || revealed)} onCash={cashOut} />;

  /* ---------- loading, errors, nothing left ---------- */
  if (!win) {
    const box = out
      ? g.phase === 'setup'
        ? <View style={{ gap: 12 }}><Waiting text="No moving stretch of history in these markets right now." sub="Flat charts can't be called. Try again in a bit." tint={def.tint} /><View style={{ alignItems: 'center' }}><Pill label="Try again" onPress={() => { setOut(false); cand.reset(); }} /></View></View>
        : <Waiting text="That's every fresh chart of these markets for now." sub="Cash out your pot." tint={def.tint} />
      : cand.error
        ? <RetryBox msg={cand.error} onRetry={cand.reset} />
        : <Waiting text={g.phase === 'setup' ? 'Loading real candles…' : 'Loading the next chart…'} tint={def.tint} />;
    return <View style={{ gap: 14 }}>{box}{g.phase !== 'setup' ? potBar : null}</View>;
  }

  const a = lastOf(win.seen).c, b = lastOf(win.hidden).c;
  const locked = !!ans || g.busy || g.phase === 'done';
  return (
    <View style={{ gap: 14 }}>
      <Panel tint={def.tint} style={{ padding: 12, gap: 10 }}>
        <ChartHead g={g} w={win} tf={tf} />
        <CandleChart seen={win.seen} hidden={win.hidden} reveal={!!ans} revealCount={open} w={g.width - 24} h={220} tint={def.tint} markLast />
        <View style={{ minHeight: 20, justifyContent: 'center' }}>
          {revealed ? (
            <Animated.View entering={FadeIn.duration(220)}>
              <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>
                {hide} candles later: {px(b)} <Text style={{ color: b > a ? C.up : C.down }}>{pctMove(a, b)}</Text>
              </Txt>
            </Animated.View>
          ) : <Txt v="small" style={{ fontSize: 12.5 }}>{ans ? 'Rolling the tape…' : `Last close ${px(a)}. What came next is hidden.`}</Txt>}
        </View>
      </Panel>
      <Txt v="h2" style={{ fontSize: 20, textAlign: 'center' }}>Higher or lower, {hide} candles later?</Txt>
      {g.phase === 'setup' ? g.stakeRow : null}
      <TourTarget id="g-pick">
        <Row style={{ gap: 12 }}>
          <Choice title="▲ HIGHER" color={C.up} onPress={() => void answer('higher')} disabled={locked} selected={ans ? ans.call === 'higher' : undefined} h={84} />
          <Choice title="▼ LOWER" color={C.down} onPress={() => void answer('lower')} disabled={locked} selected={ans ? ans.call === 'lower' : undefined} h={84} />
        </Row>
      </TourTarget>
      <View style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        {revealed && ans ? (
          ans.right ? (
            <Animated.View key={log.length} entering={ZoomIn.springify()}>
              <Row style={{ gap: 12 }}>
                <Txt v="label" color={C.up}>Right. Pot ×{step}</Txt>
                {g.phase === 'live' ? <Pill label="Next chart" onPress={nextChart} /> : null}
              </Row>
            </Animated.View>
          ) : <Animated.View entering={ZoomIn.springify()}><Txt v="label" color={C.down}>Wrong. The pot is gone.</Txt></Animated.View>
        ) : <Txt v="small">{ans ? ' ' : g.phase === 'setup' ? 'Answer to start.' : 'Higher or lower?'}</Txt>}
      </View>
      {potBar}
    </View>
  );
}

/* ---------- target: call the close, vs Clashy Bot ---------- */
const STEPS = 40;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
type Lock = { you: number; bot: number };

function Target({ g }: { g: GameApi }) {
  const { def } = g;
  const { tf, show, hide } = useSettings(g);
  const cand = useCandidates(g, tf, 4);
  const { open, run, pendingRef } = useReveal();
  const [win, setWin] = useState<Window | null>(null);
  const [out, setOut] = useState(false);
  const [frac, setFrac] = useState(0);
  const [lock, setLock] = useState<Lock | null>(null);
  const [revealed, setRevealed] = useState(false);
  const starting = useRef(false);

  useEffect(() => {
    if (win || out || !cand.data) return;
    const ws = windowsOf(cand.data, cand.syms, tf, show, hide, false, new Map());
    if (ws.length) { setWin(pick(ws)); return; }
    if (!cand.more()) setOut(true);
  });

  if (!win) {
    if (out) {
      return (
        <View style={{ gap: 12 }}>
          <Waiting text="No moving stretch of history in these markets right now." sub="Flat charts can't be called. Try again in a bit." tint={def.tint} />
          <View style={{ alignItems: 'center' }}><Pill label="Try again" onPress={() => { setOut(false); cand.reset(); }} /></View>
        </View>
      );
    }
    return cand.error ? <RetryBox msg={cand.error} onRetry={cand.reset} /> : <Waiting text="Loading real candles…" tint={def.tint} />;
  }

  const last = lastOf(win.seen).c;
  const real = lastOf(win.hidden).c;
  const atr = atrOf(win.seen);
  const range = Math.max(3 * atr * Math.sqrt(hide), last * 0.001);
  const guess = last + frac * range;
  const tk = tickerOf(win.sym);

  const lockIn = async () => {
    if (lock || starting.current || g.busy || g.phase !== 'setup') return;
    const you = guess;
    const bot = last * Math.exp(gauss() * sigmaOfCloses(win.seen) * Math.sqrt(hide));
    starting.current = true;
    const ok = await g.begin();
    starting.current = false;
    if (!ok) return;
    setLock({ you, bot });
    const dy = Math.abs(you - real), db = Math.abs(bot - real);
    const winner = Math.abs(dy - db) <= real * 1e-12 ? null : dy < db ? 'you' : 'bot';
    const off = (v: number) => `${px(Math.abs(v - real))} (${(Math.abs(v / real - 1) * 100).toFixed(2)}%)`;
    const lines: Line[] = [
      ['Market', mktLine(g, win.sym)],
      ['Window', `${TF_WORD[tf]} · ${spanOf(win)}`],
      ['Last close you saw', px(last)],
      [`Real close, ${hide} candles later`, `${px(real)} (${candleTime(lastOf(win.hidden).t)} candle)`],
      ['Your guess', px(you)],
      ["Clashy Bot's guess", px(bot)],
      ['You were off by', off(you)],
      ['Clashy Bot was off by', off(bot)],
    ];
    const verdict = `${tk} closed at ${px(real)}. ${winner === null ? 'Dead heat. Push.' : winner === 'you' ? `Your ${px(you)} was closer.` : `Clashy Bot's ${px(bot)} was closer.`}`;
    pendingRef.current = () => { pendingRef.current = null; g.end(winner === null ? 1 : winner === 'you' ? 2 : 0, verdict, lines); };
    run(win.hidden.length, () => { setRevealed(true); pendingRef.current?.(); });
  };

  const levels = [
    { p: lock?.you ?? guess, color: C.brand, label: `You ${px(lock?.you ?? guess)}` },
    ...(lock ? [{ p: lock.bot, color: C.opp, label: `Clashy Bot ${px(lock.bot)}` }] : []),
    ...(revealed ? [{ p: real, color: C.ink, solid: true, label: `Close ${px(real)}` }] : []),
  ];
  const lead = lock && revealed ? (Math.abs(lock.you - real) < Math.abs(lock.bot - real) ? 'you' : Math.abs(lock.you - real) > Math.abs(lock.bot - real) ? 'bot' : null) : null;
  const offText = (v: number) => (revealed ? `off by ${px(Math.abs(v - real))}` : pctMove(last, v));
  const stepBy = (d: number) => setFrac((f) => clamp(Math.round((f + d) * STEPS / 2) / (STEPS / 2), -1, 1));

  return (
    <View style={{ gap: 14 }}>
      <Panel tint={def.tint} style={{ padding: 12, gap: 10 }}>
        <ChartHead g={g} w={win} tf={tf} />
        <CandleChart seen={win.seen} hidden={win.hidden} reveal={!!lock} revealCount={open} w={g.width - 24} h={230} tint={def.tint} markLast
          levels={levels} domain={{ lo: last - range, hi: last + range }} />
      </Panel>
      {!lock ? (
        <>
          <TourTarget id="g-pick">
            <Panel style={{ gap: 10 }}>
              <Txt v="small" style={{ ...FONT.semi, textAlign: 'center' }}>Your guess · the close {hide} candles later</Txt>
              <View style={{ alignItems: 'center' }}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: 40, letterSpacing: -1.4, color: C.brand, fontVariant: ['tabular-nums'] }}>{px(guess)}</Text>
                <Txt v="small" color={guess > last ? C.up : guess < last ? C.down : C.muted} style={{ fontVariant: ['tabular-nums'] }}>{pctMove(last, guess)} from the last close</Txt>
              </View>
              <Row style={{ gap: 10 }}>
                <StepBtn label="−" onPress={() => stepBy(-2 / STEPS)} disabled={g.busy} />
                <View style={{ flex: 1 }}>
                  <Slider frac={frac} min={-1} onChange={setFrac} disabled={g.busy} label="Your guess for the close" text={px(guess)} steps={STEPS} />
                </View>
                <StepBtn label="+" onPress={() => stepBy(2 / STEPS)} disabled={g.busy} />
              </Row>
              <Row style={{ justifyContent: 'space-between', paddingHorizontal: 54 }}>
                <Txt v="small" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{px(last - range)}</Txt>
                <Txt v="small" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{px(last + range)}</Txt>
              </Row>
            </Panel>
          </TourTarget>
          {g.stakeRow}
          <TourTarget id="g-go">
            <Go title="Lock it in" sub={`${tk} · ${px(guess)}`} color={def.tint} ink={GT.onTint} onPress={() => void lockIn()} disabled={g.busy} />
          </TourTarget>
          <Note center>Closer to the real close than Clashy Bot wins 2×.</Note>
        </>
      ) : (
        <>
          <Sides lead={lead}
            you={{ title: px(lock.you), color: C.brand, sub: offText(lock.you) }}
            bot={{ title: px(lock.bot), color: C.opp, sub: offText(lock.bot) }} />
          {revealed ? (
            <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center' }}>
              <Txt v="label" color={lead === 'you' ? C.up : lead === 'bot' ? C.down : C.ink}>
                Closed at {px(real)}. {lead === 'you' ? 'You were closer.' : lead === 'bot' ? 'Clashy Bot was closer.' : 'Dead heat.'}
              </Txt>
            </Animated.View>
          ) : <BotSays text={`I guessed ${px(lock.bot)}. Rolling the tape…`} />}
        </>
      )}
    </View>
  );
}

/** A readable error with a Retry pill. */
function RetryBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <Panel style={{ gap: 10, alignItems: 'center' }}>
      <ErrorLine msg={msg} />
      <Pill label="Retry" onPress={onRetry} />
    </Panel>
  );
}

/** − / + buttons for fine steps. */
function StepBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label === '+' ? 'Guess higher' : 'Guess lower'}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? GT.pillPressed : GT.pill, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1 })}>
      <Text style={{ ...FONT.bold, fontSize: 22, color: C.ink, lineHeight: 26 }}>{label}</Text>
    </Pressable>
  );
}
