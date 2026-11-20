// Leader (Nov 20): `n` rolled markets and their moves over the last five minutes of the feed, which name the LEADER
// (best) and the LAGGARD (worst). Call CHASE (the leader beats the laggard again over the round) or FADE (the laggard
// beats the leader over the round); Clashy Bot takes the other side. At the bell the two moves since the entry decide
// it: 2× for the right call, level is a push. It waits until there are two minutes of history to look back on.
// p: { n?: number = 5 }
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, tickerOf, useLivePool, type Feed, type PoolKey, type Tick } from '../feed';
import { BotSays, Choice, Clock, Logo, MarketHead, Note, Panel, Pill, Tag, Waiting, captureAt, fmtSecs, readEntries, rollMarkets, useClock, type GameApi, type Line } from '../kit';
import { signedPct } from '../odds';

type Call = 'chase' | 'fade';
const WINDOW = 5 * 60_000;
const NEED = 2 * 60_000;

/** A market's move over the last five minutes (or as much of them as the feed has). */
function lookback(feed: Feed, sym: string, now: number) {
  const h = feed.since(sym, now - WINDOW);
  const m = feed.mark(sym);
  if (!h.length || !m) return null;
  return { span: Math.min(WINDOW, now - h[0]!.t), mv: m.p / h[0]!.p - 1 };
}
const minutes = (ms: number) => `${Math.max(1, Math.floor(ms / 60_000))} min`;

export default function Leader({ g }: { g: GameApi }) {
  const { def } = g;
  const n = Math.max(2, Math.min(8, Math.round(Number(def.p?.n ?? 5))));
  const live = useLivePool(def.pool as PoolKey[]);
  const [syms, setSyms] = useState<string[] | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [pair, setPair] = useState<{ lead: string; lag: string; leadPre: number; lagPre: number; span: number } | null>(null);
  const [entries, setEntries] = useState<Record<string, Tick> | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<{ a: number; b: number } | null>(null);
  const shownPair = useRef<string>('');
  const bell = useRef(new Map<string, Tick>());
  const settled = useRef(false);
  const left = useClock(endsAt);

  const now = Date.now();
  const spans = live.map((s) => ({ s, span: lookback(g.feed, s, now)?.span ?? 0 }));
  const ready = spans.filter((x) => x.span >= NEED).map((x) => x.s);
  useEffect(() => { if (!syms && ready.length >= n) setSyms(rollMarkets(g.feed, ready, n)); }, [syms, ready.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const reroll = () => setSyms(rollMarkets(g.feed, ready, n));

  /** The ranking over the window right now: leader first, laggard last. */
  const rank = (at: number) => {
    if (!syms) return null;
    const rows = syms.map((s) => ({ s, lb: lookback(g.feed, s, at) })).filter((x) => x.lb) as { s: string; lb: { span: number; mv: number } }[];
    if (rows.length < 2) return null;
    rows.sort((a, b) => b.lb.mv - a.lb.mv);
    return rows;
  };

  const go = async (c: Call) => {
    const rows = rank(Date.now());
    if (!rows) return;
    const lead = rows[0]!, lag = rows[rows.length - 1]!;
    if (lead.lb.mv === lag.lb.mv) { g.fail('Leader and laggard are dead level right now. Roll again.'); return; }
    if (`${lead.s}/${lag.s}` !== shownPair.current) { g.fail('The leader or laggard just changed. Take another look.'); return; }
    const e = readEntries(g.feed, [lead.s, lag.s]);
    if (!e.ok) { g.fail(`Waiting for a live ${tickerOf(e.stale)} price.`); return; }
    // the rest are context only: their entries are read now too, where they have a live price
    const all: Record<string, Tick> = { ...e.at };
    for (const s of syms!) { const m = g.feed.mark(s); if (!all[s] && m && g.feed.fresh(s)) all[s] = { t: m.t, p: m.p }; }
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setCall(c); setEntries(all); setEndsAt(end);
    setPair({ lead: lead.s, lag: lag.s, leadPre: lead.lb.mv, lagPre: lag.lb.mv, span: Math.min(lead.lb.span, lag.lb.span) });
  };

  // the bell: both moves since the entry, on the first live prices at or after it
  useEffect(() => {
    if (!pair || !call || !entries || !endsAt || settled.current || g.phase !== 'live') return;
    const t = Date.now();
    if (t < endsAt) return;
    const two = [pair.lead, pair.lag];
    if (captureAt(bell.current, g.feed, two, endsAt)) {
      settled.current = true;
      const a = bell.current.get(pair.lead)!.p / entries[pair.lead]!.p - 1;
      const b = bell.current.get(pair.lag)!.p / entries[pair.lag]!.p - 1;
      setFinal({ a, b });
      const L = tickerOf(pair.lead), G = tickerOf(pair.lag);
      const lines: Line[] = [
        [`Leader (last ${minutes(pair.span)})`, `${L} ${signedPct(pair.leadPre, 2)}`],
        [`Laggard (last ${minutes(pair.span)})`, `${G} ${signedPct(pair.lagPre, 2)}`],
        ['Your call', call === 'chase' ? 'Chase' : 'Fade'],
        ['Clashy Bot', call === 'chase' ? 'Fade' : 'Chase'],
        [`${L} since entry`, signedPct(a, 3)],
        [`${G} since entry`, signedPct(b, 3)],
      ];
      if (a === b) { g.end(1, `${L} and ${G} moved the same. Push.`, lines); return; }
      const chaseWon = a > b;
      const verdict = chaseWon ? `${L} kept leading ${G}.` : `${G} beat ${L} this time.`;
      g.end(chaseWon === (call === 'chase') ? 2 : 0, `${verdict} ${chaseWon === (call === 'chase') ? 'You called it.' : 'Clashy Bot takes it.'}`, lines);
    } else if (t > endsAt + 15_000) {
      settled.current = true;
      const miss = two.find((s) => !bell.current.has(s))!;
      g.abandon(`No live ${tickerOf(miss)} price came in at the bell, so your stake is back.`);
    }
  });

  if (g.phase === 'setup') {
    if (!syms) {
      const best = spans.map((x) => x.span).sort((a, b) => b - a)[n - 1] ?? 0;
      return (
        <Waiting text={live.length < n ? 'Finding markets with a live price…' : 'Gathering the last few minutes…'}
          sub={live.length < n ? `${live.length} of ${n} live so far` : `${fmtSecs(best / 1000)} of ${fmtSecs(NEED / 1000)} of history`} progress={best / NEED} tint={def.tint} />
      );
    }
    const rows = rank(now);
    if (!rows) return <Waiting text="Reading the last few minutes…" tint={def.tint} />;
    const lead = rows[0]!, lag = rows[rows.length - 1]!;
    const flat = lead.lb.mv === lag.lb.mv;
    shownPair.current = `${lead.s}/${lag.s}`;
    const span = Math.min(...rows.map((x) => x.lb.span));
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <Panel style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Txt v="label">Last {minutes(span)}</Txt>
              <Pill label="Roll again" onPress={reroll} />
            </Row>
            {rows.map((x, i) => {
              const top = i === 0, bottom = i === rows.length - 1;
              return (
                <Row key={x.s} style={{ gap: 10, minHeight: 52, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                  <Logo sym={x.s} info={g.info} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label" lines={1}>{nameOf(g.info, x.s)}</Txt>
                    {top || bottom ? <View style={{ flexDirection: 'row', marginTop: 3 }}><Tag text={top ? 'LEADER' : 'LAGGARD'} color={top ? def.tint : C.muted} /></View> : null}
                  </View>
                  <Txt v="label" color={x.lb.mv >= 0 ? C.up : C.down} style={{ fontVariant: ['tabular-nums'] }}>{signedPct(x.lb.mv, 2)}</Txt>
                </Row>
              );
            })}
          </Panel>
        </TourTarget>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Row style={{ gap: 12 }}>
            <Choice title="CHASE" sub={`${tickerOf(lead.s)} beats ${tickerOf(lag.s)} again`} color={def.tint} onPress={() => void go('chase')} disabled={flat || g.busy} />
            <Choice title="FADE" sub={`${tickerOf(lag.s)} beats ${tickerOf(lead.s)}`} color={C.ink} onPress={() => void go('fade')} disabled={flat || g.busy} />
          </Row>
        </TourTarget>
        <Note center>{flat ? 'All level right now. Roll again or give it a moment.' : `Clashy Bot takes the other side. Over the next ${def.secs} s, right call: 2×.`}</Note>
      </View>
    );
  }

  if (!pair || !call || !entries) return <Note center>Locking in your call…</Note>;

  const mvOf = (s: string) => { const p = g.feed.price(s); const e = entries[s]; return p && e ? p / e.p - 1 : 0; };
  const a = final?.a ?? mvOf(pair.lead), b = final?.b ?? mvOf(pair.lag);
  const gap = a - b;
  const youChase = call === 'chase';
  const youAhead = gap === 0 ? null : (gap > 0) === youChase;
  const others = (syms ?? []).filter((s) => s !== pair.lead && s !== pair.lag && entries[s]);

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} />
      </Panel>
      <Row style={{ gap: 10, alignItems: 'stretch' }}>
        <Side g={g} sym={pair.lead} role="LEADER" tint={def.tint} pre={pair.leadPre} span={pair.span} mv={a} ahead={gap > 0} who={youChase ? 'you' : 'bot'} />
        <Side g={g} sym={pair.lag} role="LAGGARD" tint={C.muted} pre={pair.lagPre} span={pair.span} mv={b} ahead={gap < 0} who={youChase ? 'bot' : 'you'} />
      </Row>
      <Panel style={{ alignItems: 'center', gap: 2 }} tint={youAhead === null ? undefined : youAhead ? C.up : C.opp}>
        <Txt v="label">{gap === 0 ? 'Dead level' : gap > 0 ? `${tickerOf(pair.lead)} ahead by ${signedPct(gap, 3).slice(1)}` : `${tickerOf(pair.lag)} ahead by ${signedPct(-gap, 3).slice(1)}`}</Txt>
        <Txt v="small">You {youChase ? 'chase' : 'fade'} · Clashy Bot {youChase ? 'fades' : 'chases'}</Txt>
      </Panel>
      {others.length ? (
        <Panel style={{ gap: 10 }}>
          <Txt v="small" style={{ ...FONT.semi }}>The rest, since the entry</Txt>
          {others.map((s) => <MarketHead key={s} g={g} sym={s} from={entries[s]!.p} />)}
        </Panel>
      ) : null}
      {g.phase === 'live' ? (
        <Animated.View entering={FadeIn}>
          <BotSays text={youAhead === null ? 'Dead level. Next tick decides the mood.' : youAhead ? "You're ahead. Bell's not here yet." : "I'm ahead. Hold on to something."} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Side({ g, sym, role, tint, pre, span, mv, ahead, who }: { g: GameApi; sym: string; role: string; tint: string; pre: number; span: number; mv: number; ahead: boolean; who: 'you' | 'bot' }) {
  return (
    <Panel style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6 }} tint={ahead ? tint : undefined}>
      <Tag text={role} color={tint} />
      <Logo sym={sym} info={g.info} size={44} />
      <Txt v="label" lines={1}>{tickerOf(sym)}</Txt>
      <Txt v="title" color={mv >= 0 ? C.up : C.down} style={{ fontSize: 24, fontVariant: ['tabular-nums'] }}>{signedPct(mv, 3)}</Txt>
      <Txt v="small" lines={1}>Last {minutes(span)} {signedPct(pre, 2)}</Txt>
      <Tag text={who === 'you' ? 'YOU' : 'CLASHY BOT'} color={who === 'you' ? C.brand : C.opp} />
    </Panel>
  );
}
