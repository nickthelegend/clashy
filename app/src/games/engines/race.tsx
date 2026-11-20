// Race (Nov 20): a lineup of markets (or one head-to-head pair). You back one, Clashy Bot backs another at random, and
// at the bell the better one by the game's measure wins: the biggest gain, the biggest drop, the biggest move either
// way, or the quietest. Right pick: 2× the stake. Equal: push.
// p: { n = 4, metric = 'up' | 'down' | 'abs' | 'quiet', pairs?: string[][] }
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, poolOf, tickerOf, useLivePool, type PoolKey } from '../feed';
import { BotSays, Clock, Go, MarketChart, MarketTile, Note, Panel, Tag, fmtPx, useClock, useRoll, type GameApi } from '../kit';
import { pick, sample, signedPct } from '../odds';

type Metric = 'up' | 'down' | 'abs' | 'quiet';
const ASK: Record<Metric, string> = { up: 'Pick the one that climbs most.', down: 'Pick the one that drops most.', abs: 'Pick the wildest mover, either way.', quiet: 'Pick the one that barely moves.' };
const score = (metric: Metric, mv: number) => (metric === 'up' ? mv : metric === 'down' ? -mv : metric === 'abs' ? Math.abs(mv) : -Math.abs(mv));

export default function Race({ g }: { g: GameApi }) {
  const { def } = g;
  const metric = (def.p?.metric as Metric) ?? 'up';
  const pairs = def.p?.pairs as string[][] | undefined;
  const n = pairs ? 2 : Math.max(2, Math.min(9, Number(def.p?.n ?? 4)));
  const live = useLivePool(def.pool as PoolKey[]);
  const allPool = useMemo(() => (pairs ? pairs.flat() : poolOf(def.pool as PoolKey[])), [def.pool, pairs]);
  const [lineup, setLineup] = useState<string[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [bot, setBot] = useState<string | null>(null);
  const [entry, setEntry] = useState<Record<string, number>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  const roll = () => {
    if (pairs) {
      const ok = pairs.filter((pr) => pr.every((s) => g.feed.fresh(s)));
      if (ok.length) setLineup(sample(pick(ok), 2));
    } else if (live.length >= n) setLineup(sample(live, n));
    setMine(null);
  };
  const ready = pairs ? pairs.some((pr) => pr.every((s) => g.feed.fresh(s))) : live.length >= n;
  useEffect(() => { if (!lineup && ready) roll(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(allPool, lineup, 850);

  const go = async () => {
    if (!lineup || !mine) return;
    const stale = lineup.find((s) => !g.feed.fresh(s));
    if (stale) { g.fail(`Waiting for a live ${tickerOf(stale)} price.`); return; }
    const e = Object.fromEntries(lineup.map((s) => [s, g.feed.price(s)!]));
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setEntry(e); setBot(pick(lineup.filter((s) => s !== mine))); setStartedAt(Date.now()); setEndsAt(end);
  };

  const moveOf = (s: string) => { const p = g.feed.price(s); return p && entry[s] ? p / entry[s]! - 1 : 0; };

  // the bell: both backed markets need a price at or after it
  useEffect(() => {
    if (!mine || !bot || !endsAt || settled.current || g.phase !== 'live' || Date.now() < endsAt) return;
    const a = g.feed.mark(mine), b = g.feed.mark(bot);
    if (a && b && a.t >= endsAt && b.t >= endsAt) {
      settled.current = true;
      const ma = a.p / entry[mine]! - 1, mb = b.p / entry[bot]! - 1;
      const sa = score(metric, ma), sb = score(metric, mb);
      const won = sa === sb ? null : sa > sb;
      g.end(won === null ? 1 : won ? 2 : 0,
        won === null ? 'Dead heat. Push.' : won ? `${tickerOf(mine)} beat ${tickerOf(bot)}.` : `${tickerOf(bot)} beat ${tickerOf(mine)}. Clashy Bot takes it.`,
        [
          ['Your pick', `${nameOf(g.info, mine)} ${signedPct(ma, 3)}`],
          ['Clashy Bot', `${nameOf(g.info, bot)} ${signedPct(mb, 3)}`],
          [`${tickerOf(mine)} entry → bell`, `${fmtPx(entry[mine])} → ${fmtPx(a.p)}`],
          [`${tickerOf(bot)} entry → bell`, `${fmtPx(entry[bot])} → ${fmtPx(b.p)}`],
          ['Winner is', metric === 'up' ? 'the bigger gain' : metric === 'down' ? 'the bigger drop' : metric === 'abs' ? 'the bigger move' : 'the smaller move'],
        ]);
    } else if (Date.now() > endsAt + 15_000) {
      settled.current = true;
      g.abandon('No live price came in at the bell, so your stake is back.');
    }
  });

  if (!lineup) return <Panel><Note center>Finding markets with a live price…</Note></Panel>;

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="label" style={{ fontSize: 17 }}>{ASK[metric]}</Txt>
          <Pressable onPress={roll} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: '#1D1D24', justifyContent: 'center' }}>
            <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll again</Txt>
          </Pressable>
        </Row>
        <TourTarget id="g-pick">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {lineup.map((s, i) => <MarketTile key={s} g={g} sym={shown(i) || s} selected={s === mine} onPress={() => setMine(s)} />)}
          </View>
        </TourTarget>
        {mine ? <MarketChart g={g} sym={mine} h={130} color={def.tint} /> : null}
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title={mine ? `Back ${tickerOf(mine)}` : 'Pick one first'} onPress={() => void go()} disabled={!mine || g.busy} color={def.tint} ink="#0A0A0D" />
        </TourTarget>
        <Note center>Clashy Bot backs another one. Beat it: 2× your stake.</Note>
      </View>
    );
  }

  const ranked = [...lineup].sort((a, b) => score(metric, moveOf(b)) - score(metric, moveOf(a)));
  const ahead = mine && bot ? score(metric, moveOf(mine)) - score(metric, moveOf(bot)) : 0;
  return (
    <View style={{ gap: 14 }}>
      <Panel><Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></Panel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ranked.map((s, i) => (
          <MarketTile key={s} g={g} sym={s} from={entry[s]} rank={i + 1} selected={s === mine}
            mark={s === mine ? <Tag text="YOU" color={C.brand} /> : s === bot ? <Tag text="BOT" color={C.opp} /> : undefined} />
        ))}
      </View>
      {mine ? <MarketChart g={g} sym={mine} from={startedAt ?? undefined} entry={entry[mine]} h={160} label={`${tickerOf(mine)} entry`} /> : null}
      {g.phase === 'live' && bot ? <BotSays text={ahead === 0 ? `Neck and neck with ${tickerOf(bot)}.` : ahead > 0 ? `${tickerOf(mine!)} is ahead of my ${tickerOf(bot)}.` : `My ${tickerOf(bot)} is ahead. For now.`} /> : null}
    </View>
  );
}
