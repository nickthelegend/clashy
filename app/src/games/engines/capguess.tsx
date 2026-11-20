// Higher or Lower (Nov 20): an instant game on pump.fun coins (Jupiter's numbers, through the practice catalog). One
// coin and a line: its real market cap (or holders) times a random factor in 0.4–0.8 or 1.25–2.5, rounded to two
// figures. HIGHER or LOWER? The real number lands: right grows the pot by `step` and the next coin comes up, wrong
// loses it. Cash out any time after the first right answer. The real number is never on screen before you answer.
// The stake is taken at the first answer.
// p: { metric: 'mcap' | 'holders' = 'mcap', step = 1.9 }
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { Market } from '@/chain/practice';
import { ErrorLine, Row, Txt } from '@/ui/kit';
import { MarketLogo } from '@/ui/practice-kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { Choice, CountUp, Note, Panel, PotBar, Tag, fmtMetric, nice, useMemes, type GameApi, type Line } from '../kit';
import { fmtX, pick } from '../odds';

type Metric = 'mcap' | 'holders';
type Q = { m: Market; real: number; line: number };
type Call = 'higher' | 'lower';

/** A line on the chosen side of the real number: × 0.4–0.8 (it's higher) or × 1.25–2.5 (it's lower), two figures. */
function lineFor(real: number, metric: Metric) {
  for (let i = 0; i < 12; i++) {
    const low = Math.random() < 0.5;
    const f = low ? 0.4 + Math.random() * 0.4 : 1.25 + Math.random() * 1.25;
    const x = metric === 'holders' ? Math.max(1, Math.round(nice(real * f))) : nice(real * f);
    if (x > 0 && x !== real && (x < real) === low) return x;
  }
  return null;
}

export default function CapGuess({ g }: { g: GameApi }) {
  const { def } = g;
  const metric: Metric = def.p?.metric === 'holders' ? 'holders' : 'mcap';
  const label = metric === 'holders' ? 'Holders' : 'Market cap';
  const step = Number(def.p?.step) > 1 ? Number(def.p?.step) : 1.9;
  const memes = useMemes(true);
  const [q, setQ] = useState<Q | null>(null);
  const [reveal, setReveal] = useState<{ call: Call; right: boolean } | null>(null);
  const [streak, setStreak] = useState(0);
  const [mult, setMult] = useState(1);
  const [log, setLog] = useState<Line[]>([]);
  const ended = useRef(false);
  const recent = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // coins with a real number big enough to make a line from
  const pool = (memes.memes ?? []).filter((m) => (metric === 'holders' ? (m.holders ?? 0) >= 20 : (m.mcap ?? 0) >= 1000));
  const next = () => {
    const fresh = pool.filter((m) => !recent.current.includes(m.id));
    const from = fresh.length ? fresh : pool;
    for (let i = 0; i < 8 && from.length; i++) {
      const m = pick(from);
      const real = metric === 'holders' ? m.holders! : m.mcap!;
      const line = lineFor(real, metric);
      if (line === null) continue;
      recent.current = [...recent.current, m.id].slice(-12);
      setQ({ m, real, line });
      return;
    }
  };
  useEffect(() => { if (!q && !ended.current && pool.length) next(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = async (call: Call) => {
    if (!q || reveal || ended.current || g.busy) return;
    if (g.phase === 'setup' && !(await g.begin())) return;
    const right = (call === 'higher') === (q.real > q.line);
    setReveal({ call, right });
    const row: Line = [`${log.length + 1}. ${q.m.symbol}`, `${fmtMetric(metric, q.real)} vs ${fmtMetric(metric, q.line)} · ${call} · ${right ? 'right' : 'wrong'}`];
    const nextLog = [...log, row];
    setLog(nextLog);
    if (!right) {
      ended.current = true;
      g.end(0, `${q.m.symbol} is at ${fmtMetric(metric, q.real)}, ${q.real > q.line ? 'higher' : 'lower'}.${streak ? ` The ${streak}-streak is gone.` : ''}`, [...nextLog.slice(-10), ['Streak', `${streak} right`]]);
      return;
    }
    setStreak((s) => s + 1); setMult((m) => Math.min(50, m * step));
    timer.current = setTimeout(() => { if (ended.current) return; setReveal(null); setQ(null); }, 1700);
  };

  const cashOut = () => {
    if (ended.current || streak < 1 || g.phase !== 'live') return;
    ended.current = true;
    if (timer.current) clearTimeout(timer.current);
    g.end(mult, `Cashed out a ${streak}-streak at ${fmtX(mult)}.`, [...log.slice(-10), ['Streak', `${streak} right`], ['Multiplier', fmtX(mult)]]);
  };

  if (memes.error) return <Panel><ErrorLine msg={memes.error} onRetry={memes.retry} /></Panel>;
  if (!memes.memes) return <Panel><Note center>Loading pump.fun coins from Jupiter…</Note></Panel>;
  if (!pool.length) return <Panel><ErrorLine msg={`Jupiter didn't send any pump.fun coins with ${metric === 'holders' ? 'a holder count' : 'a market cap'} right now.`} onRetry={memes.retry} /></Panel>;
  if (!q) return <Panel><Note center>Picking a coin…</Note></Panel>;

  const locked = !!reveal || ended.current || g.busy || g.phase === 'done';
  return (
    <View style={{ gap: 14 }}>
      <Panel tint={def.tint} style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
        <Animated.View key={q.m.id} entering={FadeInDown.duration(280)} style={{ alignItems: 'center', gap: 8, width: '100%' }}>
          <MarketLogo m={{ kind: 'meme', icon: q.m.icon, symbol: q.m.symbol }} size={84} />
          <Txt v="title" lines={1} style={{ fontSize: 24, textAlign: 'center' }}>{q.m.name}</Txt>
          <Row style={{ gap: 6 }}>
            <Txt v="small" style={{ ...FONT.semi }}>${q.m.symbol}</Txt>
            <Tag text="PUMP.FUN" color={C.brandSoft} />
          </Row>
          <View style={{ marginTop: 6, alignItems: 'center' }}>
            <Txt v="small">{label}: higher or lower than</Txt>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: 48, letterSpacing: -1.6, color: def.tint, fontVariant: ['tabular-nums'], lineHeight: 56 }}>{fmtMetric(metric, q.line)}</Text>
          </View>
          <View style={{ minHeight: 62, alignItems: 'center', justifyContent: 'center' }}>
            {reveal ? (
              <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center' }}>
                <Txt v="small">Real {label.toLowerCase()}</Txt>
                <CountUp to={q.real} size={32} color={reveal.right ? C.up : C.down} fmt={(x) => (x === q.real ? fmtMetric(metric, q.real) : fmtMetric(metric, x))} />
              </Animated.View>
            ) : <Txt v="small" color={C.dim}>Revealed when you answer</Txt>}
          </View>
        </Animated.View>
      </Panel>
      {g.phase === 'setup' ? g.stakeRow : null}
      <TourTarget id="g-pick">
        <Row style={{ gap: 12 }}>
          <Choice title="▲ HIGHER" color={C.up} onPress={() => void answer('higher')} disabled={locked} selected={reveal ? reveal.call === 'higher' : undefined} h={88} />
          <Choice title="▼ LOWER" color={C.down} onPress={() => void answer('lower')} disabled={locked} selected={reveal ? reveal.call === 'lower' : undefined} h={88} />
        </Row>
      </TourTarget>
      <View style={{ minHeight: 22, alignItems: 'center' }}>
        {reveal ? (
          <Animated.View key={log.length} entering={ZoomIn.delay(600).springify()}>
            <Txt v="label" color={reveal.right ? C.up : C.down}>{reveal.right ? `Right. Pot ×${step}` : 'Wrong. The pot is gone.'}</Txt>
          </Animated.View>
        ) : <Txt v="small">{g.phase === 'setup' ? 'Answer to start.' : 'Next coin. Higher or lower?'}</Txt>}
      </View>
      <PotBar g={g} mult={mult} streak={streak} canCash={streak > 0 && g.phase === 'live'} onCash={cashOut} />
    </View>
  );
}
