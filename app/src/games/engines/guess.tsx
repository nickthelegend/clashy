// Guess (Nov 20): slide to guess the move at the bell; Clashy Bot guesses at random in the same range; the closer guess
// wins 2×. peak: guess the highest the price gets during the round, closest without going over (both over: the smaller
// overshoot wins; one over: the other wins). price: guess the price at the bell. The range is ±3 even-odds moves from
// the market's live volatility (peak: 0 to 3).
// p: { mode: 'bell' | 'peak' | 'price' }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { tickerOf, type Tick } from '../feed';
import { BotSays, Clock, Go, MarketHead, Note, Panel, PxChart, RolledPanel, Sides, absPct, bellPrice, fmtPx, mktLine, mv, pStr, roundPath, useClock, useRolled, type GameApi, type Line } from '../kit';
import { evenMove, sigmaOf } from '../odds';

type Mode = 'bell' | 'peak' | 'price';
type Lock = { range: number; you: number; bot: number };
type Final = { at: Tick; actual: number; winner: 'you' | 'bot' | null; youOver?: boolean; botOver?: boolean };
/** The slider never spans less than ±0.06%. */
const MIN_RANGE = 0.0006;
const STEPS = 30;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** Bell-shaped random number in −1..1 (three uniforms). */
const tri = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
/** A price with enough digits to tell guesses apart. */
const px = (p: number) => (p >= 1000 ? `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${p.toPrecision(p >= 1 ? 6 : 5)}`);

const TITLE: Record<Mode, string> = { bell: 'Move at the bell', peak: 'Highest move in the round', price: 'Price at the bell' };

export default function Guess({ g }: { g: GameApi }) {
  const { def } = g;
  const mode = pStr(g, 'mode', ['bell', 'peak', 'price'] as const, 'bell');
  const min = mode === 'peak' ? 0 : -1;
  const { sym, shown, reroll } = useRolled(g);
  const [frac, setFrac] = useState(mode === 'peak' ? 0.33 : 0);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [lock, setLock] = useState<Lock | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  const rangeOf = (s: string) => Math.max(MIN_RANGE, 3 * evenMove(sigmaOf(g.feed, s), def.secs));
  const fmtGuess = (v: number, base: number) => (mode === 'price' ? px(base * (1 + v)) : mv(v));

  const go = async () => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const range = rangeOf(sym);
    const t0 = Date.now();
    const end = t0 + def.secs * 1000;
    if (!(await g.begin(end))) return;
    const bot = (mode === 'peak' ? Math.abs(tri()) : tri()) * range;
    setEntry({ t: t0, p: m.p }); setEndsAt(end); setLock({ range, you: frac * range, bot });
  };

  /** The number being guessed: the move at the bell, or the highest move so far (0 at the start). */
  const actualOf = (path: Tick[], e: number) => (mode === 'peak' ? Math.max(...path.map((x) => x.p / e - 1)) : path[path.length - 1]!.p / e - 1);
  /** Who's closer: bell/price by distance; peak is closest without going over. */
  const judge = (a: number, you: number, bot: number): Final['winner'] => {
    if (mode === 'peak') {
      const yo = you > a, bo = bot > a;
      if (yo !== bo) return yo ? 'bot' : 'you';
      const dy = Math.abs(a - you), db = Math.abs(a - bot); // both under: the higher guess; both over: the smaller overshoot
      return Math.abs(dy - db) < 1e-12 ? null : dy < db ? 'you' : 'bot';
    }
    const dy = Math.abs(you - a), db = Math.abs(bot - a);
    return Math.abs(dy - db) < 1e-12 ? null : dy < db ? 'you' : 'bot';
  };

  useEffect(() => {
    if (!sym || !entry || !endsAt || !lock || settled.current || g.phase !== 'live') return;
    const b = bellPrice(g, sym, endsAt);
    if (b === 'wait') return;
    settled.current = true;
    if (b === 'quiet') { g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`); return; }
    const path = roundPath(g, sym, entry, b);
    const a = actualOf(path, entry.p);
    const winner = judge(a, lock.you, lock.bot);
    const fin: Final = { at: b, actual: a, winner, youOver: mode === 'peak' ? lock.you > a : undefined, botOver: mode === 'peak' ? lock.bot > a : undefined };
    setFinal(fin);
    const tk = tickerOf(sym);
    const off = (v: number) => (mode === 'price' ? fmtPx(Math.abs(v - a) * entry.p) : absPct(v - a)) + (mode === 'peak' && v > a ? ' over' : '');
    const lines: Line[] = [
      ['Market', mktLine(g, sym)],
      ['Entry', fmtPx(entry.p)],
      ['Your guess', fmtGuess(lock.you, entry.p)],
      ["Clashy Bot's guess", fmtGuess(lock.bot, entry.p)],
      ['Price at the bell', fmtPx(b.p)],
      [mode === 'peak' ? 'Highest move' : 'Move at the bell', mv(a)],
      ['You were off by', off(lock.you)],
      ['Clashy Bot was off by', off(lock.bot)],
    ];
    const what = mode === 'peak' ? `${tk} peaked at ${mv(a)}.` : mode === 'price' ? `${tk} closed the round at ${px(b.p)}.` : `${tk} moved ${mv(a)}.`;
    const why = winner === null ? ' Dead heat. Push.'
      : mode === 'peak' && fin.youOver !== fin.botOver ? winner === 'you' ? ' Clashy Bot went over. You take it.' : ' You went over. Clashy Bot takes it.'
        : winner === 'you' ? ` Your ${fmtGuess(lock.you, entry.p)} was closer.` : ` Clashy Bot's ${fmtGuess(lock.bot, entry.p)} was closer.`;
    g.end(winner === null ? 1 : winner === 'you' ? 2 : 0, what + why, lines);
  });

  const m = sym ? g.feed.mark(sym) : undefined;

  if (g.phase === 'setup' || !entry || !lock || !sym) {
    const range = sym ? rangeOf(sym) : MIN_RANGE;
    const v = frac * range;
    const base = m?.p ?? 0;
    const step = (1 - min) / STEPS;
    return (
      <View style={{ gap: 14 }}>
        <RolledPanel g={g} sym={sym} shown={shown} onReroll={reroll} sub={`${def.secs} s round`} />
        {sym && base ? <PxChart g={g} sym={sym} h={140} color={def.tint} levels={[{ p: base * (1 + v), color: C.brand, label: 'Your guess' }]} /> : null}
        <TourTarget id="g-pick">
          <Panel tint={def.tint} style={{ gap: 12 }}>
            <Txt v="small" style={{ ...FONT.semi, textAlign: 'center' }}>Your guess · {TITLE[mode].toLowerCase()}</Txt>
            <View style={{ alignItems: 'center' }}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: 44, letterSpacing: -1.6, color: mode === 'price' ? C.ink : v > 0 ? C.up : v < 0 ? C.down : C.ink, fontVariant: ['tabular-nums'] }}>
                {base ? fmtGuess(v, base) : '–'}
              </Text>
              {mode === 'price' ? <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{mv(v)} from now</Txt> : null}
            </View>
            <Row style={{ gap: 10 }}>
              <StepBtn label="−" onPress={() => setFrac((f) => clamp(Math.round((f - step) / step) * step, min, 1))} disabled={!sym} />
              <View style={{ flex: 1 }}>
                <Slider frac={frac} min={min} onChange={setFrac} disabled={!sym} label={TITLE[mode]} text={base ? fmtGuess(v, base) : ''} />
              </View>
              <StepBtn label="+" onPress={() => setFrac((f) => clamp(Math.round((f + step) / step) * step, min, 1))} disabled={!sym} />
            </Row>
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 54 }}>
              <Txt v="small" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{mode === 'peak' ? '0%' : mv(-range)}</Txt>
              <Txt v="small" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{mv(range)}</Txt>
            </Row>
          </Panel>
        </TourTarget>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title="Lock in my guess" sub={sym ? `${tickerOf(sym)} · ${def.secs} s` : undefined} color={def.tint} ink="#0A0A0D" onPress={() => void go()} disabled={!sym || g.busy} />
        </TourTarget>
        <Note center>{mode === 'peak' ? 'Closest without going over beats Clashy Bot: 2×.' : 'Closer than Clashy Bot at the bell: 2× your stake.'}</Note>
      </View>
    );
  }

  const path = roundPath(g, sym, entry, final?.at);
  const now = final ? final.actual : actualOf(path, entry.p);
  const leadNow = final ? final.winner : judge(now, lock.you, lock.bot);
  const offNow = (v: number) => (mode === 'peak' && v > now ? `${absPct(v - now)} to go` : `off by ${absPct(v - now)}`);
  const shownLeft = final ? 0 : left;
  const guessColor = (v: number) => (mode === 'price' ? C.ink : v > 0 ? C.up : v < 0 ? C.down : C.ink);

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry.p} />
        <View style={{ marginTop: 12 }}><Clock left={shownLeft} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></View>
      </Panel>
      <PxChart g={g} sym={sym} from={entry.t} until={final?.at.t} entry={entry.p} h={200}
        levels={[
          { p: entry.p * (1 + lock.you), color: C.brand, label: 'You' },
          { p: entry.p * (1 + lock.bot), color: C.opp, label: 'Clashy Bot' },
        ]} />
      <Panel style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="small" style={{ ...FONT.semi }}>{final ? (mode === 'peak' ? 'Highest move' : 'Move at the bell') : mode === 'peak' ? 'Highest so far' : 'Move now'}</Txt>
          <Txt v="small" color={now > 0 ? C.up : now < 0 ? C.down : C.ink} style={{ ...FONT.bold, fontVariant: ['tabular-nums'] }}>{mv(now)}</Txt>
        </Row>
        <Ruler min={min * lock.range} max={lock.range} marks={[
          { v: lock.you, color: C.brand, label: 'You' },
          { v: lock.bot, color: C.opp, label: 'Bot' },
          { v: now, color: C.ink, label: final ? (mode === 'peak' ? 'Peak' : 'Bell') : 'Now', big: true },
        ]} />
      </Panel>
      <Sides lead={leadNow}
        you={{ title: fmtGuess(lock.you, entry.p), color: guessColor(lock.you), sub: final?.youOver ? 'went over' : offNow(lock.you) }}
        bot={{ title: fmtGuess(lock.bot, entry.p), color: guessColor(lock.bot), sub: final?.botOver ? 'went over' : offNow(lock.bot) }} />
      {g.phase === 'live' ? <BotSays text={`I guessed ${fmtGuess(lock.bot, entry.p)}. ${leadNow === 'bot' ? "I'm closer right now." : leadNow === 'you' ? "You're closer. For now." : 'Dead even.'}`} /> : null}
    </View>
  );
}

/** − / + buttons for fine steps. */
function StepBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label === '+' ? 'Guess higher' : 'Guess lower'}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? '#2A2A33' : '#1D1D24', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1 })}>
      <Text style={{ ...FONT.bold, fontSize: 22, color: C.ink, lineHeight: 26 }}>{label}</Text>
    </Pressable>
  );
}

/** A draggable slider: mouse (pointer events) on the web, touch (the responder) on a phone; tap anywhere to jump. */
function Slider({ frac, min, onChange, disabled, label, text }: { frac: number; min: number; onChange: (f: number) => void; disabled?: boolean; label: string; text: string }) {
  const [w, setW] = useState(0);
  const drag = useRef(false);
  const web = Platform.OS === 'web';
  const at = (x: number) => { if (!disabled && w > 0 && Number.isFinite(x)) onChange(clamp(min + (x / w) * (1 - min), min, 1)); };
  type PE = { nativeEvent: { offsetX: number; pointerId: number }; currentTarget: unknown };
  const handlers = web
    ? {
      onPointerDown: (e: PE) => { drag.current = true; try { (e.currentTarget as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.nativeEvent.pointerId); } catch { /* not every browser lets it */ } at(e.nativeEvent.offsetX); },
      onPointerMove: (e: PE) => { if (drag.current) at(e.nativeEvent.offsetX); },
      onPointerUp: () => { drag.current = false; },
      onPointerCancel: () => { drag.current = false; },
    }
    : {
      onStartShouldSetResponder: () => !disabled,
      onMoveShouldSetResponder: () => !disabled,
      onResponderGrant: (e: GestureResponderEvent) => { Haptics.selectionAsync().catch(() => {}); at(e.nativeEvent.locationX); },
      onResponderMove: (e: GestureResponderEvent) => at(e.nativeEvent.locationX),
      onResponderTerminationRequest: () => false,
    };
  const pos = ((frac - min) / (1 - min)) * w;
  const zero = ((0 - min) / (1 - min)) * w;
  const fill = frac > 0 ? C.up : frac < 0 ? C.down : C.ink;
  const step = (1 - min) / STEPS;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(clamp(frac + (e.nativeEvent.actionName === 'increment' ? step : -step), min, 1))}
      style={[{ height: 44, justifyContent: 'center', opacity: disabled ? 0.45 : 1 }, (web ? { touchAction: 'none', cursor: 'pointer', userSelect: 'none' } : null) as object]}
      {...(handlers as object)}>
      <View pointerEvents="none" style={{ height: 8, borderRadius: 4, backgroundColor: '#24242C' }} />
      {w > 0 ? (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', left: Math.min(zero, pos), width: Math.abs(pos - zero), height: 8, top: 18, borderRadius: 4, backgroundColor: fill }} />
          {min < 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: zero - 1, top: 12, width: 2, height: 20, borderRadius: 1, backgroundColor: '#5A5A66' }} /> : null}
          <View pointerEvents="none" style={{ position: 'absolute', left: pos - 14, top: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: C.ink, borderWidth: 4, borderColor: fill === C.ink ? '#3A3A44' : fill }} />
        </>
      ) : null}
    </View>
  );
}

/** A number line from `min` to `max` with the guesses and the live (or final) value on it. */
function Ruler({ min, max, marks }: { min: number; max: number; marks: { v: number; color: string; label: string; big?: boolean }[] }) {
  const [w, setW] = useState(0);
  const x = (v: number) => clamp((v - min) / (max - min || 1), 0, 1) * w;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 58, justifyContent: 'center', marginHorizontal: 6 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: '#24242C' }} />
      {min < 0 && w > 0 ? <View style={{ position: 'absolute', left: x(0) - 1, top: 21, width: 2, height: 16, backgroundColor: '#4A4A55' }} /> : null}
      {w > 0 ? marks.map((k, i) => {
        const cx = x(k.v);
        const out = k.v < min ? '‹ ' : k.v > max ? ' ›' : '';
        const below = i === 1; // the bot's tag sits under the line so the tags don't collide
        return (
          <View key={k.label} pointerEvents="none" style={{ position: 'absolute', left: Math.max(-6, Math.min(w - 44, cx - 22)), width: 44, alignItems: 'center', top: below ? 17 : 4 }}>
            {!below ? <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10, color: k.color, marginBottom: 2 }}>{k.v < min ? out + k.label : k.label + out}</Text> : null}
            <View style={{ width: k.big ? 4 : 12, height: k.big ? 24 : 12, borderRadius: k.big ? 2 : 6, backgroundColor: k.color, borderWidth: k.big ? 0 : 2, borderColor: '#000', marginTop: k.big ? 0 : 6 }} />
            {below ? <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10, color: k.color, marginTop: 2 }}>{k.v < min ? out + k.label : k.label + out}</Text> : null}
          </View>
        );
      }) : null}
    </View>
  );
}
