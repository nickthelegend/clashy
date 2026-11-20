// Elimination (Nov 20): `n` rolled markets. You back one, Clashy Bot backs another at random. Every `every` seconds
// the market with the worst % move since the start (of those still in) is knocked out, on the first live prices at or
// after the cut. Whose market lasts longer wins 2×; when only your two are left, the next cut decides it. The round
// is at most every × (n − 1) seconds and ends the moment either backed market goes out.
// p: { n?: number = 8, every?: number (s, default: the game's length spread over the cuts) }
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, poolOf, tickerOf, useLivePool, type PoolKey, type Tick } from '../feed';
import { BotSays, Clock, Go, Logo, MarketTile, Note, Panel, Tag, useClock, useRoll, type GameApi, type Line } from '../kit';
import { pick, signedPct } from '../odds';
import { Pill, Waiting, captureAt, readEntries, rollMarkets } from './_group-c';

type Cut = { sym: string; mv: number; k: number };

export default function Elim({ g }: { g: GameApi }) {
  const { def } = g;
  const n = Math.max(3, Math.min(12, Math.round(Number(def.p?.n ?? 8))));
  const every = Math.max(3, Number(def.p?.every ?? Math.max(5, Math.round(def.secs / (n - 1)))));
  const live = useLivePool(def.pool as PoolKey[]);
  const [syms, setSyms] = useState<string[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [bot, setBot] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Tick> | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [over, setOver] = useState(false);
  const caps = useRef(new Map<number, Map<string, Tick>>());
  const settled = useRef(false);
  const nextAt = startedAt && !over ? startedAt + (cuts.length + 1) * every * 1000 : null;
  const left = useClock(nextAt);

  useEffect(() => { if (!syms) { const r = rollMarkets(g.feed, live, n); if (r) setSyms(r); } }, [syms, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(useMemo(() => poolOf(def.pool as PoolKey[]), [def.pool]), syms, 900);
  const reroll = () => { setMine(null); setSyms(rollMarkets(g.feed, live, n)); };

  const go = async () => {
    if (!syms || !mine) return;
    const e = readEntries(g.feed, syms);
    if (!e.ok) { g.fail(`Waiting for a live ${tickerOf(e.stale)} price.`); return; }
    const start = Date.now();
    if (!(await g.begin(start + every * (n - 1) * 1000))) return;
    setBot(pick(syms.filter((s) => s !== mine))); setEntries(e.at); setStartedAt(start);
  };

  // the cuts: on the first live prices at or after each one, the worst since the start goes out
  useEffect(() => {
    if (!syms || !mine || !bot || !entries || !startedAt || settled.current || g.phase !== 'live') return;
    const k = cuts.length + 1;
    const at = startedAt + k * every * 1000;
    const now = Date.now();
    if (now < at) return;
    const still = syms.filter((s) => !cuts.some((c) => c.sym === s));
    let cap = caps.current.get(k);
    if (!cap) { cap = new Map(); caps.current.set(k, cap); }
    if (captureAt(cap, g.feed, still, at)) {
      const mvs = still.map((s) => ({ s, mv: cap!.get(s)!.p / entries[s]!.p - 1 }));
      const worst = Math.min(...mvs.map((x) => x.mv));
      const out = pick(mvs.filter((x) => x.mv === worst)); // a dead-level worst is a coin flip
      const next = [...cuts, { sym: out.s, mv: out.mv, k }];
      setCuts(next);
      Haptics.impactAsync(out.s === mine ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
      if (out.s !== mine && out.s !== bot) return;
      settled.current = true;
      setOver(true);
      const won = out.s === bot;
      const rest = still.filter((s) => s !== out.s);
      const lines: Line[] = [
        ['You backed', `${nameOf(g.info, mine)} (${tickerOf(mine)})`],
        ['Clashy Bot backed', `${nameOf(g.info, bot)} (${tickerOf(bot)})`],
        ...next.map((c): Line => [`Out ${c.k}`, `${tickerOf(c.sym)} ${signedPct(c.mv, 3)}${c.sym === mine ? ' (yours)' : c.sym === bot ? " (Clashy Bot's)" : ''}`]),
        ['Still in', rest.map(tickerOf).join(', ')],
      ];
      if (won) g.end(2, `${tickerOf(bot)} went out at cut ${k}. ${tickerOf(mine)} lasted longer.`, lines);
      else g.end(0, `${tickerOf(mine)} went out at cut ${k}. ${tickerOf(bot)} lasted longer.`, lines);
    } else if (now > at + 15_000) {
      settled.current = true;
      setOver(true);
      const miss = still.find((s) => !cap!.has(s))!;
      g.abandon(`No live ${tickerOf(miss)} price came in at cut ${k}, so your stake is back.`);
    }
  });

  if (!syms) return <Waiting text={`Finding ${n} markets with a live price…`} sub={`${live.length} of ${n} live so far`} progress={live.length / n} tint={def.tint} />;

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between', gap: 10 }}>
          <Txt v="small" style={{ flex: 1 }}>Back one. The worst since the start is out every {every} s.</Txt>
          <Pill label="Roll again" onPress={reroll} />
        </Row>
        <TourTarget id="g-pick">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {syms.map((s, i) => <MarketTile key={s} g={g} sym={shown(i) || s} selected={s === mine} onPress={() => setMine(s)} />)}
          </View>
        </TourTarget>
        <Note center>Clashy Bot backs another one at random. Whose lasts longer: 2×.</Note>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title={mine ? `Back ${tickerOf(mine)}` : 'Pick a market'} sub={`Up to ${every * (n - 1)} s · a cut every ${every} s`} color={def.tint} ink="#0A0A0D" onPress={() => void go()} disabled={!mine || g.busy} />
        </TourTarget>
      </View>
    );
  }

  if (!mine || !bot || !entries || !startedAt) return <Note center>Lining them up…</Note>;

  const frozen = over ? caps.current.get(cuts.length) : undefined;
  const mvOf = (s: string) => {
    const c = cuts.find((x) => x.sym === s);
    if (c) return c.mv;
    const p = frozen?.get(s)?.p ?? g.feed.price(s);
    return p ? p / entries[s]!.p - 1 : 0;
  };
  const still = syms.filter((s) => !cuts.some((c) => c.sym === s));
  const bubble = still.length > 1 ? still.reduce((a, b) => (mvOf(b) < mvOf(a) ? b : a)) : null;
  const ranked = [...still].sort((a, b) => mvOf(b) - mvOf(a));
  const last = cuts[cuts.length - 1];
  const say = !last
    ? `I'm backing ${tickerOf(bot)}. First cut in ${every} s.`
    : last.sym === bot ? `${tickerOf(bot)} is out. Yours lasted longer.`
    : last.sym === mine ? `${tickerOf(mine)} is out. Mine lasted longer.`
    : `${tickerOf(last.sym)} is out at ${signedPct(last.mv, 3)}. ${still.length} left.`;

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="label">{over ? `${cuts.length} cut${cuts.length === 1 ? '' : 's'}` : `Cut ${cuts.length + 1} of ${n - 1}`}</Txt>
          <Row style={{ gap: 6 }}>
            <Tag text={`YOU ${tickerOf(mine)}`} color={C.brand} />
            <Tag text={`BOT ${tickerOf(bot)}`} color={C.opp} />
          </Row>
        </Row>
        {over ? null : <Clock left={left} total={every} tint={def.tint} label="to the next cut" />}
      </Panel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {syms.map((s) => (
          <ElimTile key={s} g={g} sym={s} mv={mvOf(s)} out={cuts.find((c) => c.sym === s)?.k} rank={ranked.indexOf(s) + 1 || undefined}
            who={s === mine ? 'you' : s === bot ? 'bot' : undefined} bubble={!over && s === bubble} />
        ))}
      </View>
      {g.phase === 'live' || last ? (
        <Animated.View key={cuts.length} entering={FadeIn}>
          <BotSays text={say} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A market in the field: its move since the start; knocked-out ones grey out under an OUT stamp. */
function ElimTile({ g, sym, mv, out, rank, who, bubble }: { g: GameApi; sym: string; mv: number; out?: number; rank?: number; who?: 'you' | 'bot'; bubble: boolean }) {
  const w = useWindowDimensions().width;
  const ring = who === 'you' ? C.brand : who === 'bot' ? C.opp : bubble ? `${C.down}AA` : 'transparent';
  return (
    <View accessibilityLabel={`${tickerOf(sym)} ${signedPct(mv, 3)}${out ? ', out' : ''}`}
      style={{ flexBasis: w > 500 ? '31%' : '30%', flexGrow: 1, minHeight: 112, borderRadius: 20, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: out ? '#0D0D11' : '#15151B', borderWidth: 2, borderColor: out ? '#1C1C22' : ring }}>
      <View style={{ alignItems: 'center', gap: 5, opacity: out ? 0.32 : 1 }}>
        <Logo sym={sym} info={g.info} size={36} />
        <Txt v="label" lines={1} style={{ fontSize: 14 }}>{tickerOf(sym)}</Txt>
        <Txt v="small" lines={1} color={out ? C.muted : mv >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>{signedPct(mv, 3)}</Txt>
      </View>
      {bubble && !out ? <View style={{ position: 'absolute', left: 6, top: 6 }}><Tag text="LAST" color={C.down} /></View>
        : rank && !out ? <Text style={{ position: 'absolute', left: 9, top: 6, ...FONT.bold, fontSize: 12, color: rank === 1 ? '#FFD66B' : C.muted }}>#{rank}</Text> : null}
      {who ? <View style={{ position: 'absolute', right: 6, top: 6 }}><Tag text={who === 'you' ? 'YOU' : 'BOT'} color={who === 'you' ? C.brand : C.opp} /></View> : null}
      {out ? (
        <Animated.View entering={ZoomIn.springify().damping(12)} pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', transform: [{ rotate: '-12deg' }] }}>
          <View style={{ borderWidth: 2.5, borderColor: C.down, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <Text style={{ ...FONT.displayB, fontSize: 22, letterSpacing: 1.5, color: C.down }}>OUT</Text>
          </View>
          <Text style={{ ...FONT.bold, fontSize: 10.5, color: C.muted, marginTop: 3 }}>CUT {out}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
