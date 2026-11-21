// Who's That Chart (Nov 21): an instant game on real candles (the kit's Phoenix mark candles, Pacifica's for the
// markets only Pacifica lists). The last `candles` closed candles of one market, with no name, no prices and no times,
// and `choices` markets to pick from (all of them loaded and moving, so a flat chart never gives one away). Right turns
// the tile green, names the chart, grows the pot by `step` and deals a new set of markets; wrong loses it. Cash out any
// time after a right answer. The same market isn't the answer twice in a row (its chart would be the same one).
// The stake is taken at the first answer.
// p: { tf: '1m' | '5m' = '1m', choices = 4, candles = 60, step = 2.5 }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { ErrorLine, Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  CandleChart, GS, GT, Logo, Panel, Pill, PotBar, Waiting, clampInt, fmtX, mktLine, nameOf, pNum, pStr, pick, poolList, sample, tickerOf,
  useGameCandles, type CandleTf, type GCandle, type GameApi, type Line,
} from '../kit';

type Q = { answer: string; lineup: string[]; cs: GCandle[] };
/** A right answer shows the name this long before the next chart. */
const NEXT_MS = 1600;
const TF_MIN: Record<CandleTf, number> = { '1m': 1, '5m': 5 };
const TF_WORD: Record<CandleTf, string> = { '1m': '1-minute candles', '5m': '5-minute candles' };
/** "last hour", "last 4 hours", "last 45 minutes" */
const spanWord = (mins: number) => (mins === 60 ? 'last hour' : mins % 60 === 0 ? `last ${mins / 60} hours` : `last ${mins} minutes`);
/** No move at all, or barely a few distinct closes: a chart like that can't be told apart. */
const flat = (cs: GCandle[]) => cs.length < 20 || Math.max(...cs.map((k) => k.h)) <= Math.min(...cs.map((k) => k.l)) || new Set(cs.map((k) => k.c)).size < 4;

export default function WhoChart({ g }: { g: GameApi }) {
  const { def } = g;
  const tf = pStr(g, 'tf', ['1m', '5m'] as const, '1m');
  const choices = clampInt(def.p?.choices, 2, 6, 4);
  const n = clampInt(def.p?.candles, 20, 120, 60);
  const step = pNum(g, 'step', 2.5) > 1 ? pNum(g, 'step', 2.5) : 2.5;
  const pool = poolList(def.pool);
  const load = Math.min(pool.length, choices + 2); // a couple spare, in case some don't load or sit flat
  const recent = useRef<string[]>([]);
  /** A new set of markets: ones not in the last set first, then the rest, recent answers last. */
  const nextSet = (prev: readonly string[]) => {
    const order = [
      ...sample(pool.filter((s) => !prev.includes(s)), pool.length),
      ...sample(pool.filter((s) => prev.includes(s) && !recent.current.includes(s)), pool.length),
      ...sample(pool.filter((s) => prev.includes(s) && recent.current.includes(s)), pool.length),
    ];
    return order.slice(0, load).sort();
  };
  const [syms, setSyms] = useState<string[]>(() => sample(pool, load).sort());
  // need 1: a set where fewer than `choices` load is dealt again below (a couple of times) before it says so
  const cands = useGameCandles(syms, tf, n, 1);
  // the hook still holds the previous set's candles for one render after the set changes
  const data = cands.data && Object.keys(cands.data).every((s) => syms.includes(s)) ? cands.data : null;
  const [q, setQ] = useState<Q | null>(null);
  const [picked, setPicked] = useState<{ sym: string; right: boolean } | null>(null);
  const [few, setFew] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [mult, setMult] = useState(1);
  const [log, setLog] = useState<Line[]>([]);
  const ended = useRef(false);
  const starting = useRef(false);
  const answered = useRef(false); // set on the tap itself, so a double tap can't answer twice
  const tries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // deal a question once this set's candles are in (no deps on purpose; the guards make it run once per question)
  useEffect(() => {
    if (q || few || ended.current || !data) return;
    const ok = syms.filter((s) => data[s] && !flat(data[s]!.slice(-n)));
    if (ok.length < choices) {
      if (tries.current < 2) { tries.current += 1; setSyms(nextSet(syms)); return; }
      setFew(`Only ${ok.length} of these markets have a moving chart for the ${spanWord(n * TF_MIN[tf])} right now. A question needs ${choices}.`);
      return;
    }
    tries.current = 0;
    const fresh = ok.filter((s) => !recent.current.includes(s));
    const it = pick(fresh.length ? fresh : ok);
    const lineup = sample([it, ...sample(ok.filter((s) => s !== it), choices - 1)], choices);
    recent.current = [...recent.current, it].slice(-3);
    setQ({ answer: it, lineup, cs: data[it]!.slice(-n) });
  });

  const retry = () => { g.fail(undefined); setFew(null); tries.current = 0; setSyms(nextSet(syms)); cands.retry(); };

  const answer = async (sym: string) => {
    if (!q || picked || answered.current || ended.current || starting.current || g.busy || g.phase === 'done') return;
    if (g.phase === 'setup') {
      starting.current = true;
      const ok = await g.begin();
      starting.current = false;
      if (!ok) return;
    }
    if (answered.current) return;
    answered.current = true;
    const right = sym === q.answer;
    setPicked({ sym, right });
    const row: Line = [`${log.length + 1}. Chart`, `${tickerOf(q.answer)} · you said ${tickerOf(sym)} · ${right ? 'right' : 'wrong'}`];
    const nextLog = [...log, row];
    setLog(nextLog);
    if (!right) {
      ended.current = true;
      g.end(0, `It was ${mktLine(g, q.answer)}.${streak ? ` The ${streak}-streak is gone.` : ''}`, [...nextLog.slice(-10), ['Streak', `${streak} right`]]);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStreak((s) => s + 1);
    setMult((m) => m * step);
    timer.current = setTimeout(next, NEXT_MS);
  };

  const next = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (ended.current) return;
    answered.current = false;
    setPicked(null); setQ(null); setSyms(nextSet(syms));
  };

  const cashOut = () => {
    if (ended.current || streak < 1 || g.phase !== 'live') return;
    ended.current = true;
    if (timer.current) clearTimeout(timer.current);
    g.end(mult, `Cashed out a ${streak}-streak at ${fmtX(mult)}.`, [...log.slice(-10), ['Streak', `${streak} right`], ['Multiplier', fmtX(mult)]]);
  };

  const potBar = <PotBar g={g} mult={mult} streak={streak} canCash={streak > 0 && g.phase === 'live'} onCash={cashOut} />;
  const ask = (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Txt v="h2" style={{ fontSize: 21, textAlign: 'center' }}>Which market drew this chart?</Txt>
      <Txt v="small">{TF_WORD[tf]}, {spanWord((q?.cs.length ?? n) * TF_MIN[tf])}</Txt>
    </View>
  );

  /* ---------- loading and errors ---------- */
  if (!q) {
    const err = few ?? cands.error;
    const box = err ? (
      <Panel style={{ gap: 10, alignItems: 'center' }}>
        <ErrorLine msg={err} />
        <Pill label="Try again" onPress={retry} />
      </Panel>
    ) : <Waiting text={g.phase === 'setup' ? 'Loading real charts…' : 'Loading the next chart…'} tint={def.tint} />;
    return <View style={{ gap: 14 }}>{ask}{box}{g.phase !== 'setup' ? potBar : null}</View>;
  }

  const cols = 2;
  const gap = 10;
  const tileW = Math.floor((g.width - gap * (cols - 1)) / cols);
  const locked = !!picked || g.busy || g.phase === 'done';
  return (
    <View style={{ gap: 14 }}>
      {ask}
      <Panel tint={def.tint} style={{ padding: 12, gap: 10 }}>
        <Row style={{ gap: 10, minHeight: 36 }}>
          {picked ? (
            <Animated.View key={`n${q.answer}`} entering={ZoomIn.springify()} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <Logo sym={q.answer} info={g.info} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1}>{nameOf(g.info, q.answer)} <Text style={{ color: C.muted }}>{tickerOf(q.answer)}</Text></Txt>
                <Txt v="small" lines={1} color={picked.right ? C.up : C.down} style={{ fontSize: 12.5, ...FONT.semi }}>{picked.right ? 'You named it.' : 'This was the chart.'}</Txt>
              </View>
            </Animated.View>
          ) : (
            <>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${def.tint}26`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...FONT.displayB, fontSize: 18, color: def.tint }}>?</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1}>Mystery market</Txt>
                <Txt v="small" lines={1} style={{ fontSize: 12.5 }}>No name, no prices, no times</Txt>
              </View>
            </>
          )}
        </Row>
        <Animated.View key={`c${q.answer}${q.cs[0]!.t}`} entering={FadeIn.duration(260)}>
          <CandleChart seen={q.cs} w={g.width - 24} h={200} labels={false} tint={def.tint} />
        </Animated.View>
      </Panel>
      {g.phase === 'setup' ? g.stakeRow : null}
      <TourTarget id="g-pick">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {q.lineup.map((s, i) => {
            const isAnswer = picked && s === q.answer;
            const isWrong = picked && !picked.right && s === picked.sym;
            const edge = isAnswer ? C.up : isWrong ? C.down : 'transparent';
            const bg = isAnswer ? C.upBg : isWrong ? C.downBg : GT.raised;
            return (
              <Animated.View key={`${q.answer}${s}`} entering={FadeInDown.delay(i * 50).duration(240)} style={{ width: tileW }}>
                <Pressable onPress={() => { Haptics.selectionAsync(); void answer(s); }} disabled={locked} accessibilityRole="button" accessibilityLabel={`${nameOf(g.info, s)} (${tickerOf(s)})`}
                  style={({ pressed }) => ({
                    minHeight: 92, borderRadius: GS.radius.tile, padding: 10, backgroundColor: bg, borderWidth: 2, borderColor: edge, flexDirection: 'row', alignItems: 'center', gap: 10,
                    opacity: picked && !isAnswer && !isWrong ? 0.45 : g.busy ? 0.6 : 1, transform: [{ scale: pressed && !locked ? 0.96 : 1 }],
                  })}>
                  <Logo sym={s} info={g.info} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label" lines={1} style={{ fontSize: 16 }}>{tickerOf(s)}</Txt>
                    <Txt v="small" lines={2} style={{ fontSize: 12.5, lineHeight: 16 }}>{nameOf(g.info, s)}</Txt>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </TourTarget>
      <View style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        {picked ? (
          picked.right ? (
            <Animated.View key={log.length} entering={ZoomIn.springify()}>
              <Row style={{ gap: 12 }}>
                <Txt v="label" color={C.up}>Right. Pot ×{step}</Txt>
                {g.phase === 'live' ? <Pill label="Next chart" onPress={next} /> : null}
              </Row>
            </Animated.View>
          ) : <Animated.View entering={ZoomIn.springify()}><Txt v="label" color={C.down}>Wrong. The pot is gone.</Txt></Animated.View>
        ) : <Txt v="small">{g.phase === 'setup' ? 'Tap one to start.' : 'Which one is it?'}</Txt>}
      </View>
      {potBar}
    </View>
  );
}
