// Which One (Nov 20): an instant game. Two markets side by side: which did better today (the 24 h change Pacifica
// sends), or, for pump.fun coins, which has the bigger market cap, more liquidity or more holders (Jupiter's numbers,
// through the practice catalog). Tap one and both numbers land: right grows the pot by `step` and a new pair comes
// up, wrong loses it, a dead heat replays. Cash out any time after the first right answer. The stake is taken at the
// first tap.
// p: { metric: 'ch24' | 'mcap' | 'liquidity' | 'holders' = 'ch24', step = 1.9 }
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { Market } from '@/chain/practice';
import { ErrorLine, Txt } from '@/ui/kit';
import { MarketLogo } from '@/ui/practice-kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, tickerOf, useLivePool } from '../feed';
import { CountUp, Logo, Note, Panel, PotBar, Tag, fmtMetric, fmtPctUnits, useMemes, type GameApi, type Line, type MemeMetric } from '../kit';
import { fmtX, sample } from '../odds';

type Metric = 'ch24' | MemeMetric;
type Item = { id: string; ticker: string; name: string; value: number; meme?: Market };
type Reveal = { pick: 0 | 1; a: number; b: number; outcome: 'right' | 'wrong' | 'tie' };

const ASK: Record<Metric, string> = {
  ch24: 'Which did better today?',
  mcap: 'Which has the bigger market cap?',
  liquidity: 'Which has more liquidity?',
  holders: 'Which has more holders?',
};
const SUB: Record<Metric, string> = { ch24: '24 h change on Pacifica', mcap: 'pump.fun coins · Jupiter', liquidity: 'pump.fun coins · Jupiter', holders: 'pump.fun coins · Jupiter' };

export default function Compare({ g }: { g: GameApi }) {
  const { def } = g;
  const metric: Metric = (['ch24', 'mcap', 'liquidity', 'holders'] as const).find((x) => x === def.p?.metric) ?? 'ch24';
  const meme = metric !== 'ch24';
  const step = Number(def.p?.step) > 1 ? Number(def.p?.step) : 1.9;
  const live = useLivePool(def.pool);
  const memes = useMemes(meme);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [streak, setStreak] = useState(0);
  const [mult, setMult] = useState(1);
  const [log, setLog] = useState<Line[]>([]);
  const ended = useRef(false);
  const recent = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const items: Item[] = meme
    ? (memes.memes ?? []).filter((m) => (m[metric as MemeMetric] ?? 0) > 0).map((m) => ({ id: m.id, ticker: m.symbol, name: m.name, value: m[metric as MemeMetric]!, meme: m }))
    : live.flatMap((s) => { const c = g.feed.mark(s)?.ch24; return c === undefined || !Number.isFinite(c) ? [] : [{ id: s, ticker: tickerOf(s), name: nameOf(g.info, s), value: c }]; });
  const byId = (id: string) => items.find((x) => x.id === id);

  const newPair = () => {
    const fresh = items.filter((x) => !recent.current.includes(x.id));
    const from = fresh.length >= 2 ? fresh : items;
    let p = sample(from, 2);
    for (let i = 0; i < 6 && p.length === 2 && p[0]!.value === p[1]!.value; i++) p = sample(from, 2);
    if (p.length < 2) return;
    recent.current = [...recent.current, p[0]!.id, p[1]!.id].slice(-6);
    setPair([p[0]!.id, p[1]!.id]);
  };
  useEffect(() => { if (!pair && !ended.current && items.length >= 2) newPair(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = async (i: 0 | 1) => {
    if (!pair || reveal || ended.current || g.busy) return;
    const A = byId(pair[0]), B = byId(pair[1]);
    if (!A || !B) { setPair(null); return; }
    if (!meme && (!g.feed.fresh(A.id) || !g.feed.fresh(B.id))) { g.fail('Waiting for live prices on both.'); return; }
    const a = A.value, b = B.value; // the numbers at the moment you tap
    if (g.phase === 'setup' && !(await g.begin())) return;
    const outcome: Reveal['outcome'] = a === b ? 'tie' : (i === 0 ? a > b : b > a) ? 'right' : 'wrong';
    setReveal({ pick: i, a, b, outcome });
    const [fa, fb] = shownPair(metric, a, b);
    const row: Line = [`${log.length + 1}. ${A.ticker} vs ${B.ticker}`, `${fa} · ${fb} · ${outcome === 'right' ? 'right' : outcome === 'tie' ? 'level' : 'wrong'}`];
    const nextLog = [...log, row];
    setLog(nextLog);
    if (outcome === 'wrong') {
      ended.current = true;
      const won = i === 0 ? B : A;
      g.end(0, streak ? `${won.ticker} had it. The ${streak}-streak is gone.` : `${won.ticker} had it.`, [...nextLog.slice(-10), ['Streak', `${streak} right`]]);
      return;
    }
    if (outcome === 'right') { setStreak((s) => s + 1); setMult((m) => Math.min(50, m * step)); }
    timer.current = setTimeout(() => { if (ended.current) return; setReveal(null); setPair(null); }, outcome === 'tie' ? 1400 : 1500);
  };

  const cashOut = () => {
    if (ended.current || streak < 1 || g.phase !== 'live') return;
    ended.current = true;
    if (timer.current) clearTimeout(timer.current);
    g.end(mult, `Cashed out a ${streak}-streak at ${fmtX(mult)}.`, [...log.slice(-10), ['Streak', `${streak} right`], ['Multiplier', fmtX(mult)]]);
  };

  // loading and errors
  if (meme && memes.error) return <Panel><ErrorLine msg={memes.error} onRetry={memes.retry} /></Panel>;
  if (meme && !memes.memes) return <Panel><Note center>Loading pump.fun coins from Jupiter…</Note></Panel>;
  if (meme && items.length < 2) return <Panel><ErrorLine msg={`Jupiter didn't send two pump.fun coins with a ${metric === 'mcap' ? 'market cap' : metric} right now.`} onRetry={memes.retry} /></Panel>;
  if (!pair) return <Panel><Note center>{!meme && live.length ? "Waiting for Pacifica's 24 h changes…" : 'Loading live prices…'}</Note></Panel>;

  const A = byId(pair[0]), B = byId(pair[1]);
  const shown = reveal ? shownPair(metric, reveal.a, reveal.b) : null;
  const locked = !!reveal || ended.current || g.busy || g.phase === 'done';
  const card = (it: Item | undefined, i: 0 | 1, logo: ReactNode) => {
    const v = reveal ? (i === 0 ? reveal.a : reveal.b) : undefined;
    const other = reveal ? (i === 0 ? reveal.b : reveal.a) : undefined;
    const top = v !== undefined && other !== undefined && v > other;
    const picked = reveal?.pick === i;
    const edge = picked ? (reveal!.outcome === 'right' ? C.up : reveal!.outcome === 'wrong' ? C.down : C.muted) : 'transparent';
    return (
      <Pressable key={it?.id ?? i} onPress={() => void tap(i)} disabled={locked || !it} accessibilityRole="button" accessibilityLabel={it ? `${it.name}` : 'Loading'}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 196, borderRadius: 24, padding: 12, backgroundColor: '#15151B', borderWidth: 2, borderColor: edge, alignItems: 'center', justifyContent: 'center', gap: 6, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <Animated.View entering={FadeInDown.duration(260)} style={{ alignItems: 'center', gap: 6, width: '100%' }}>
          {logo}
          <Txt v="label" lines={1} style={{ fontSize: 17 }}>{it?.ticker ?? '–'}</Txt>
          <Txt v="small" lines={1}>{it?.name ?? ''}</Txt>
          <View style={{ height: 40, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
            {v !== undefined && shown ? (
              <CountUp to={v} size={24} color={metric === 'ch24' ? (v >= 0 ? C.up : C.down) : top ? def.tint : C.ink}
                fmt={(x) => (x === v ? shown[i] : metric === 'ch24' ? fmtPctUnits(x, 2) : fmtMetric(metric, x))} />
            ) : <Text style={{ ...FONT.displayB, fontSize: 26, color: '#3A3A46' }}>?</Text>}
          </View>
          <View style={{ height: 20, flexDirection: 'row', gap: 6 }}>
            {picked ? <Tag text="YOU" color={C.brand} /> : null}
            {top ? <Animated.View entering={ZoomIn.delay(650).springify()}><Tag text={metric === 'ch24' ? 'BETTER' : metric === 'mcap' ? 'BIGGER' : 'MORE'} color={def.tint} /></Animated.View> : null}
          </View>
        </Animated.View>
      </Pressable>
    );
  };
  const logoOf = (it?: Item) => (!it ? <View style={{ width: 56, height: 56 }} />
    : it.meme ? <MarketLogo m={{ kind: 'meme', icon: it.meme.icon, symbol: it.meme.symbol }} size={56} />
    : <Logo sym={it.id} info={g.info} size={56} />);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Txt v="h2" style={{ fontSize: 21, textAlign: 'center' }}>{ASK[metric]}</Txt>
        <Txt v="small">{SUB[metric]}</Txt>
      </View>
      {g.phase === 'setup' ? g.stakeRow : null}
      <TourTarget id="g-pick">
        <View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {card(A, 0, logoOf(A))}
            {card(B, 1, logoOf(B))}
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#0A0A0D', borderWidth: 2, borderColor: def.tint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...FONT.bold, fontSize: 13, color: def.tint }}>VS</Text>
            </View>
          </View>
        </View>
      </TourTarget>
      <View style={{ minHeight: 22, alignItems: 'center' }}>
        {reveal ? (
          <Animated.View key={log.length} entering={FadeIn.delay(500).duration(220)}>
            <Txt v="label" color={reveal.outcome === 'right' ? C.up : reveal.outcome === 'wrong' ? C.down : C.muted}>
              {reveal.outcome === 'right' ? `Right. Pot ×${step}` : reveal.outcome === 'wrong' ? 'Wrong. The pot is gone.' : 'Dead level. New pair, same pot.'}
            </Txt>
          </Animated.View>
        ) : <Txt v="small">{g.phase === 'setup' ? 'Tap one to start.' : 'Tap one.'}</Txt>}
      </View>
      <PotBar g={g} mult={mult} streak={streak} canCash={streak > 0 && g.phase === 'live'} onCash={cashOut} />
    </View>
  );
}

/** Both numbers as shown, with enough digits that two different numbers never look the same. */
function shownPair(metric: Metric, a: number, b: number): [string, string] {
  if (metric === 'ch24') {
    for (let dp = 2; dp <= 6; dp++) { const x = fmtPctUnits(a, dp), y = fmtPctUnits(b, dp); if (x !== y || a === b) return [x, y]; }
    return [fmtPctUnits(a, 6), fmtPctUnits(b, 6)];
  }
  const x = fmtMetric(metric, a), y = fmtMetric(metric, b);
  return x !== y || a === b ? [x, y] : [fmtMetric(metric, a, true), fmtMetric(metric, b, true)];
}
