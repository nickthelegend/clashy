// Royale (Nov 20): you and `bots` bots, `hearts` lives each, one rolled market. Every `callSecs` there's a call: every
// player still in calls UP or DOWN (the bots at random). Calls close halfway through the window and the call is judged
// on the rest of it: the first live price at or after the close against the first at or after the window's end, so
// nobody calls on a move they've already seen. Your first call closes round 1 at once and takes the stake. A wrong
// call costs a heart; a flat window costs nobody one; missing your call costs you one. Out at zero hearts: if that's
// you, the round ends there. Last one standing wins (bots + 1) × 0.97 × the stake; if everyone left goes out in the
// same window, they share it.
// p: { hearts = 3, bots = 7, callSecs = 10 }
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { CallButtons } from '@/ui/clash';
import { ART, Row, Txt } from '@/ui/kit';
import { BotPic } from '@/ui/practice-kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, tickerOf, useLivePool } from '../feed';
import { Choice, Clock, Heart, Logo, MarketChart, MarketHead, Note, Panel, clampInt, fmtPx, rollable, useClock, useRoll, type GameApi, type Line } from '../kit';
import { fmtX, pick, signedPct } from '../odds';

type Call = 'up' | 'down';
type Seat = { id: string; name: string; tint: string; you?: boolean; hearts: number; out?: number; lostAt?: number };
type Win = { n: number; lockAt: number; endAt: number; bots: Record<string, Call>; readyAt: Record<string, number>; locked: boolean; start?: number };
type Last = { n: number; dir: Call | 'flat' | 'void'; from?: number; to?: number; lost: string[]; mine: Call | null };
type Finish = { kind: 'won' | 'shared' | 'out'; n: number; place: number; k: number };

const NAMES = ['Bot Ape', 'Bot Degen', 'Bot Moon', 'Bot Wagmi', 'Bot Chad', 'Bot Jeet', 'Bot Whale', 'Bot Fomo', 'Bot Hodl', 'Bot Pump', 'Bot Rekt'];
const TINTS = ['#FFB547', '#5AC8FA', '#BF5AF2', '#FFD66B', '#64D2FF', '#FF9F0A', '#E5A3FF', '#AC8E68', '#7D7AFF', '#9BE1FF', '#F7C1A1'];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export default function Royale({ g }: { g: GameApi }) {
  const { def } = g;
  const hearts = clampInt(def.p?.hearts, 1, 9, 3);
  const nBots = clampInt(def.p?.bots, 1, 15, 7);
  const callSecs = clampInt(def.p?.callSecs, 6, 120, 10);
  const callWin = Math.max(3, Math.round(callSecs / 2));
  const measure = Math.max(3, callSecs - callWin);
  const pot = (nBots + 1) * 0.97;
  const live = useLivePool(def.pool);
  const [sym, setSym] = useState<string | null>(null);
  const [seats, setSeats] = useState<Seat[]>(() => [
    { id: 'you', name: 'You', tint: C.brand, you: true, hearts },
    ...Array.from({ length: nBots }, (_, i): Seat => ({ id: `b${i}`, name: NAMES[i] ?? `Bot ${i + 1}`, tint: TINTS[i % TINTS.length]!, hearts })),
  ]);
  const [win, setWin] = useState<Win | null>(null);
  const [myCall, setMyCall] = useState<Call | null>(null);
  const [last, setLast] = useState<Last | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finish, setFinish] = useState<Finish | null>(null);
  const done = useRef(false);
  const resolved = useRef(0);
  const stats = useRef({ right: 0, wrong: 0, missed: 0, flat: 0 });
  const left = useClock(g.phase === 'live' && win ? (win.locked ? win.endAt : win.lockAt) : null);

  useEffect(() => { if (!sym && live.length) setSym(pick(rollable(g, live, 1))); }, [sym, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(live, sym ? [sym] : null, 800);

  /** A new window: the bots still in draw their calls now (shown when calls close). */
  const open = (n: number, list: Seat[], at: number, closeNow = false): Win => {
    const lockAt = closeNow ? at : at + callWin * 1000;
    const bots: Record<string, Call> = {}, readyAt: Record<string, number> = {};
    for (const s of list) {
      if (s.you || s.hearts <= 0) continue;
      bots[s.id] = Math.random() < 0.5 ? 'up' : 'down';
      readyAt[s.id] = closeNow ? at : at + 400 + Math.random() * Math.max(0, callWin * 1000 - 1200);
    }
    return { n, lockAt, endAt: lockAt + measure * 1000, bots, readyAt, locked: false };
  };

  const call = async (c: Call) => {
    if (done.current || !sym) return;
    if (g.phase === 'setup') {
      if (!g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
      if (!(await g.begin())) return;
      const now = Date.now();
      setMyCall(c); setStartedAt(now); setWin(open(1, seats, now, true));
      return;
    }
    const me = seats.find((s) => s.you)!;
    if (!win || win.locked || Date.now() >= win.lockAt || me.hearts <= 0) return;
    setMyCall(c);
  };

  const receipt = (n: number, from: number | undefined, to: number | undefined, finishLine: string): Line[] => {
    const st = stats.current;
    return [
      ['Market', `${nameOf(g.info, sym!)} (${tickerOf(sym!)})`],
      ['Players', `You and ${nBots} bots, ${hearts} hearts each`],
      ['Rounds', String(n)],
      ['Your calls', `${st.right} right · ${st.wrong} wrong · ${st.missed} missed${st.flat ? ` · ${st.flat} flat` : ''}`],
      ['Last window', from !== undefined && to !== undefined ? `${fmtPx(from)} → ${fmtPx(to)} · ${signedPct(to / from - 1, 3)}` : '–'],
      ['Finish', finishLine],
    ];
  };

  /** Judges a window on its first price at or after the end. */
  const resolve = (w: Win, end: number) => {
    if (resolved.current >= w.n) return;
    resolved.current = w.n;
    const start = w.start!;
    const dir: Call | 'flat' = end > start ? 'up' : end < start ? 'down' : 'flat';
    const before = seats.filter((s) => s.hearts > 0);
    const lost: string[] = [];
    const next = seats.map((s) => {
      if (s.hearts <= 0) return s;
      const c = s.you ? myCall : w.bots[s.id];
      const hit = !c || (dir !== 'flat' && c !== dir);
      if (!hit) return s;
      lost.push(s.id);
      const h = s.hearts - 1;
      return { ...s, hearts: h, out: h <= 0 ? w.n : undefined, lostAt: w.n };
    });
    const st = stats.current;
    if (!myCall) st.missed += 1; else if (dir === 'flat') st.flat += 1; else if (myCall === dir) st.right += 1; else st.wrong += 1;
    setSeats(next);
    setLast({ n: w.n, dir, from: start, to: end, lost, mine: myCall });
    const me = next.find((s) => s.you)!;
    const alive = next.filter((s) => s.hearts > 0);
    if (me.hearts > 0 && alive.length === 1) {
      done.current = true;
      setFinish({ kind: 'won', n: w.n, place: 1, k: 1 });
      g.end(pot, `Last one standing after ${w.n} rounds. ${fmtX(pot)}.`, receipt(w.n, start, end, 'Last one standing'));
    } else if (me.hearts <= 0 && alive.length === 0) {
      done.current = true;
      const k = before.length;
      setFinish({ kind: 'shared', n: w.n, place: 1, k });
      g.end(pot / k, `Everyone left went out in round ${w.n}. Split ${k} ways: ${fmtX(pot / k)}.`, receipt(w.n, start, end, `Shared ${k} ways`));
    } else if (me.hearts <= 0) {
      done.current = true;
      const place = alive.length + 1;
      setFinish({ kind: 'out', n: w.n, place, k: 0 });
      g.end(0, `Knocked out in round ${w.n}. ${ordinal(place)} of ${seats.length}.`, receipt(w.n, start, end, `${ordinal(place)} of ${seats.length}, out in round ${w.n}`));
    } else {
      setMyCall(null);
      setWin(open(w.n + 1, next, Date.now()));
    }
  };

  // the round machine: close the calls, take the first price after the close, judge on the first price after the end
  useEffect(() => {
    if (!sym || !win || done.current || g.phase !== 'live') return;
    const now = Date.now();
    if (!win.locked) { if (now >= win.lockAt) setWin({ ...win, locked: true }); return; }
    const m = g.feed.mark(sym);
    if (win.start === undefined) {
      if (m && m.t >= win.lockAt) {
        if (m.t >= win.endAt) {
          // the feed was quiet for the whole window: nothing fair to judge, so nobody loses a heart
          resolved.current = win.n;
          setLast({ n: win.n, dir: 'void', lost: [], mine: myCall });
          setMyCall(null);
          setWin(open(win.n + 1, seats, now));
        } else setWin({ ...win, start: m.p });
      } else if (now > win.lockAt + 15_000) {
        done.current = true;
        g.abandon(`No live ${tickerOf(sym)} price came in for round ${win.n}, so your stake is back.`);
      }
      return;
    }
    if (now < win.endAt) return;
    if (m && m.t >= win.endAt) resolve(win, m.p);
    else if (now > win.endAt + 15_000) {
      done.current = true;
      g.abandon(`No live ${tickerOf(sym)} price came in at the end of round ${win.n}, so your stake is back.`);
    }
  });

  if (!sym) return <Panel><Note center>{live.length ? 'Finding a market with a live price…' : 'Loading live prices…'}</Note></Panel>;
  const m = g.feed.mark(sym);
  const me = seats.find((s) => s.you)!;
  const now = Date.now();
  const badge = (s: Seat): Call | 'ready' | null => {
    if (!win || s.hearts <= 0) return null;
    if (s.you) return myCall;
    if (win.locked) return win.bots[s.id] ?? null;
    return now >= (win.readyAt[s.id] ?? Infinity) ? 'ready' : null;
  };
  const grid = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {seats.map((s) => <SeatTile key={s.id} s={s} max={hearts} heart={def.tint} badge={badge(s)} lostNow={!!last && s.lostAt === last.n && g.phase === 'live'} />)}
    </View>
  );

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <Panel style={{ gap: 14 }}>
            <Row style={{ gap: 12 }}>
              <Logo sym={shown(0) || sym} info={g.info} size={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1} style={{ fontSize: 18 }}>{nameOf(g.info, shown(0) || sym)}</Txt>
                <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{tickerOf(sym)} · {fmtPx(m?.p)}</Txt>
              </View>
              <Pressable onPress={() => setSym(pick(live.filter((x) => x !== sym)) ?? sym)} accessibilityRole="button" accessibilityLabel="Roll a new market" hitSlop={6}
                style={({ pressed }) => ({ paddingHorizontal: 14, height: 44, borderRadius: 22, backgroundColor: pressed ? '#24242C' : '#1D1D24', justifyContent: 'center' })}>
                <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll again</Txt>
              </Pressable>
            </Row>
            {grid}
          </Panel>
        </TourTarget>
        <MarketChart g={g} sym={sym} h={130} />
        {g.stakeRow}
        <TourTarget id="g-go">
          <CallButtons onUp={() => void call('up')} onDown={() => void call('down')} disabled={g.busy} />
        </TourTarget>
        <Note center>Your first call starts round 1. Then {callWin} s to call each round. Last one standing: {fmtX(pot)}.</Note>
      </View>
    );
  }

  // live and done
  const calling = g.phase === 'live' && !!win && !win.locked;
  const status = finish ? (finish.kind === 'out' ? `Knocked out in round ${finish.n}` : finish.kind === 'won' ? 'Last one standing' : `Split ${finish.k} ways`)
    : !win ? '' : calling ? (me.hearts > 0 ? (myCall ? `You called ${myCall === 'up' ? 'UP' : 'DOWN'}. Change it?` : 'Call now') : '')
    : win.start === undefined ? 'Calls closed' : 'Calls closed. Judging…';
  const alive = seats.filter((s) => s.hearts > 0).length;
  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <MarketHead g={g} sym={sym} from={win?.start} right={<View style={{ alignItems: 'flex-end' }}><Txt v="small">Round</Txt><Txt v="label" style={{ fontSize: 20 }}>{win?.n ?? 1}</Txt></View>} />
        <Row style={{ justifyContent: 'space-between', gap: 8 }}>
          <Txt v="label" lines={1} color={calling && !myCall ? def.tint : C.ink} style={{ flex: 1 }}>{status}</Txt>
          <Txt v="small">{alive} of {seats.length} left</Txt>
        </Row>
        {g.phase === 'live' && win ? <Clock left={left} total={win.locked ? measure : win.n === 1 ? 1 : callWin} tint={def.tint} label={win.locked ? 'to the result' : 'to call'} /> : null}
      </Panel>
      {finish ? (
        <Animated.View entering={ZoomIn.springify().damping(12)} style={{ alignItems: 'center', gap: 4 }}>
          <Image source={finish.kind === 'out' ? ART.koSkull : ART.crown} style={{ width: 84, height: 84 }} contentFit="contain" />
          <Text style={{ ...FONT.displayB, fontSize: 28, letterSpacing: -0.8, color: finish.kind === 'out' ? C.ink : def.tint, textAlign: 'center' }}>{status}</Text>
          <Txt v="small">{finish.kind === 'out' ? `${ordinal(finish.place)} of ${seats.length}` : `${fmtX(finish.kind === 'won' ? pot : pot / finish.k)} your stake`}</Txt>
        </Animated.View>
      ) : null}
      {startedAt ? <MarketChart g={g} sym={sym} from={startedAt} entry={win?.start} label={`Round ${win?.n ?? 1}`} h={170} /> : null}
      {g.phase === 'live' && me.hearts > 0 ? (
        <TourTarget id="g-go">
          <Row style={{ gap: 12 }}>
            <Choice title="▲ UP" color={C.up} onPress={() => void call('up')} disabled={!calling} selected={myCall ? myCall === 'up' : undefined} h={76} />
            <Choice title="▼ DOWN" color={C.down} onPress={() => void call('down')} disabled={!calling} selected={myCall ? myCall === 'down' : undefined} h={76} />
          </Row>
        </TourTarget>
      ) : null}
      {last ? <LastWindow last={last} seats={seats} /> : null}
      {grid}
    </View>
  );
}

function LastWindow({ last, seats }: { last: Last; seats: Seat[] }) {
  const name = (id: string) => seats.find((s) => s.id === id)?.name ?? id;
  const youLost = last.lost.includes('you');
  const others = last.lost.filter((id) => id !== 'you').map(name);
  const who = last.dir === 'void' ? 'The feed went quiet. Round void, no hearts lost.'
    : !last.lost.length ? 'Nobody lost a heart.'
    : [youLost ? (last.mine ? 'You' : 'You (no call)') : null, others.length > 2 ? `${others.slice(0, 2).join(', ')} and ${others.length - 2} more` : others.join(' and ')].filter(Boolean).join(', ') + ' lost a heart.';
  const mv = last.from && last.to ? last.to / last.from - 1 : 0;
  return (
    <Animated.View key={last.n} entering={FadeIn.duration(220)}>
      <Panel style={{ gap: 4, paddingVertical: 12 }}>
        <Row style={{ justifyContent: 'space-between', gap: 8 }}>
          <Txt v="small" style={{ ...FONT.semi }}>Round {last.n}</Txt>
          {last.dir === 'void' ? <Txt v="small">Void</Txt> : (
            <Txt v="label" color={last.dir === 'up' ? C.up : last.dir === 'down' ? C.down : C.muted} style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {last.dir === 'up' ? '▲ UP' : last.dir === 'down' ? '▼ DOWN' : 'FLAT'} {signedPct(mv, 3)}
            </Txt>
          )}
        </Row>
        <Txt v="small" color={youLost ? C.ink : C.muted}>{who}</Txt>
      </Panel>
    </Animated.View>
  );
}

function SeatTile({ s, max, heart, badge, lostNow }: { s: Seat; max: number; heart: string; badge: Call | 'ready' | null; lostNow: boolean }) {
  const out = s.hearts <= 0;
  return (
    <View accessibilityLabel={`${s.name}, ${s.hearts} of ${max} hearts${out ? ', out' : ''}`}
      style={{ flexBasis: '22%', flexGrow: 1, minWidth: 70, alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 18, backgroundColor: s.you ? '#1B1727' : '#131318', borderWidth: 1.5, borderColor: s.you ? `${C.brand}66` : 'transparent', opacity: out ? 0.38 : 1 }}>
      <View>
        {s.you ? (
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...FONT.bold, fontSize: 12, color: C.onBrand }}>YOU</Text>
          </View>
        ) : (
          <View style={{ borderRadius: 21, borderWidth: 2, borderColor: s.tint, padding: 1 }}><BotPic size={36} /></View>
        )}
        {badge === 'up' || badge === 'down' ? (
          <Animated.View entering={ZoomIn.duration(180)} style={{ position: 'absolute', right: -7, bottom: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: badge === 'up' ? C.up : C.down, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...FONT.bold, fontSize: 9, color: '#000' }}>{badge === 'up' ? '▲' : '▼'}</Text>
          </Animated.View>
        ) : badge === 'ready' ? (
          <View style={{ position: 'absolute', right: -3, bottom: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: C.muted, borderWidth: 2, borderColor: '#000' }} />
        ) : null}
      </View>
      <Txt v="small" lines={1} color={s.you ? C.brandSoft : C.ink} style={{ ...FONT.semi, fontSize: 11.5 }}>{s.name}</Txt>
      {out ? <Txt v="small" style={{ fontSize: 10.5 }}>Out · R{s.out}</Txt> : (
        <Row style={{ gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {Array.from({ length: max }, (_, i) => <Heart key={i} size={12} color={i < s.hearts ? heart : '#2C2C35'} />)}
        </Row>
      )}
      {lostNow ? (
        <Animated.View entering={ZoomIn.springify()} style={{ position: 'absolute', left: 6, top: 6 }}>
          <Text style={{ ...FONT.bold, fontSize: 11, color: heart }}>−1</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
