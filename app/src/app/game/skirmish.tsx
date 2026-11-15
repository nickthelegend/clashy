// Clan Skirmish (practice): clan vs clan, best of 5 rounds on live prices. Each round rolls a coin, you make the
// clan's call (long or short) and the practice rival clan takes the other side; 20 s later the real price decides it.
// Real skirmishes run 5 members' duels at once on a MagicBlock rollup with a VRF roll; they open at the Blitz kickoff.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAJORS } from '@/data/markets';
import { useTicks } from '@/data/ticks';
import { Countdown, CountUp, FX, Hit, RoundBanner, Shake, VsIntro, WinBurst } from '@/ui/fx';
import { ART, Art, BackBtn, Btn, CRESTS, Card, LiveChart, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

const ROUND_SECS = 20, PICK_SECS = 8, ROUNDS = 5, TO_WIN = 3;
const MINE = CRESTS[2], THEIRS = CRESTS[0];
type Phase = 'intro' | 'pick' | 'count' | 'round' | 'between' | 'over';
type Round = { coin: string; side: 'long' | 'short'; start: number; end: number; move: number; won: boolean | null };

function randomIndex(n: number) {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }
  return Math.floor(Math.random() * n);
}

export default function Skirmish() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(900);
  const { desk } = useLayout();
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('intro');
  const [coin, setCoin] = useState(() => MAJORS[randomIndex(MAJORS.length)].id);
  const { ticks, last } = useTicks(coin, 120);
  const [side, setSide] = useState<'long' | 'short' | null>(null);
  const [left, setLeft] = useState(PICK_SECS);
  const [start, setStart] = useState<number | null>(null);
  const [t0, setT0] = useState(0);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [hit, setHit] = useState({ k: 0, won: true as boolean | null });
  const lastRef = useRef<number | undefined>(undefined);
  lastRef.current = last;

  const mine = rounds.filter((r) => r.won === true).length;
  const theirs = rounds.filter((r) => r.won === false).length;
  const done = mine >= TO_WIN || theirs >= TO_WIN || rounds.length >= ROUNDS;
  const roundNo = rounds.length + 1;
  const m = MAJORS.find((x) => x.id === coin)!;

  const toPick = useCallback(() => { setSide(null); setLeft(PICK_SECS); setPhase('pick'); }, []);
  const lock = (s: 'long' | 'short') => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setSide(s); setPhase('count'); };
  const go = useCallback(() => { setStart(lastRef.current ?? null); setT0(Date.now()); setLeft(ROUND_SECS); setPhase('round'); }, []);

  // clocks
  useEffect(() => {
    if (phase !== 'pick' && phase !== 'round') return;
    const h = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(h);
  }, [phase]);
  useEffect(() => { if (phase === 'pick' && left <= 0) lock(side ?? 'long'); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'round' || left > 0 || start === null || !side) return;
    const end = lastRef.current ?? start;
    const move = (end - start) / start;
    const won = move === 0 ? null : side === 'long' ? move > 0 : move < 0;
    Haptics.notificationAsync(won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setRounds((r) => [...r, { coin, side, start, end, move, won }]);
    setHit((h) => ({ k: h.k + 1, won }));
    setPhase('between');
  }, [phase, left, start, side, coin]);
  // after a round: next roll, or the end
  useEffect(() => {
    if (phase !== 'between') return;
    const h = setTimeout(() => {
      if (done) { setPhase('over'); return; }
      setCoin(MAJORS[randomIndex(MAJORS.length)].id);
      toPick();
    }, 1800);
    return () => clearTimeout(h);
  }, [phase, done, toPick]);

  const again = () => { setRounds([]); setCoin(MAJORS[randomIndex(MAJORS.length)].id); setPhase('intro'); };
  const chartW = Math.min(width, desk ? 900 : 560) - S.gutter * 2 - (desk ? 340 : 0);
  const series = phase === 'round' ? ticks.filter((k) => k.t >= t0 - 1000).map((k) => k.p) : ticks.map((k) => k.p);
  const move = phase === 'round' && start && last ? ((last - start) / start) * 100 : 0;
  const winning = side ? (side === 'long' ? move > 0 : move < 0) : false;

  const crestBox = (src: number, label: string, score: number, mineSide: boolean) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Art src={src} size={70} radius={0} />
      <Txt v="label" style={{ marginTop: 4 }}>{label}</Txt>
      <Row style={{ gap: 5, marginTop: 6 }}>
        {Array.from({ length: TO_WIN }).map((_, k) => <View key={k} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: k < score ? (mineSide ? C.brand : C.opp) : C.s2 }} />)}
      </Row>
    </View>
  );

  const panel = (
    <View style={{ gap: 10, width: desk ? 320 : undefined }}>
      {phase === 'pick' ? (
        <Animated.View entering={FadeInDown.springify().damping(14)}>
          <Card style={{ alignItems: 'center', padding: 16 }}>
            <Txt v="small" style={{ fontFamily: F.semi, letterSpacing: 1, fontSize: 11 }}>ROUND {roundNo} · ROLLED COIN</Txt>
            <Row style={{ gap: 10, marginTop: 8 }}><TokenArt symbol={coin} uri={m.image} size={38} /><Txt v="title">{coin}</Txt><Txt v="body" color={C.muted}>{last ? fmtUsd(last) : '…'}</Txt></Row>
            <Text style={{ fontFamily: F.bold, color: left <= 3 ? C.down : C.ink, marginTop: 8 }}>Make the clan's call · {Math.max(0, left)} s</Text>
            <Row style={{ gap: 10, marginTop: 12, alignSelf: 'stretch' }}>
              <Btn title="Long ▲" kind="long" h={60} style={{ flex: 1 }} onPress={() => lock('long')} />
              <Btn title="Short ▼" kind="short" h={60} style={{ flex: 1 }} onPress={() => lock('short')} />
            </Row>
            <Txt v="small" style={{ marginTop: 8, textAlign: 'center' }}>Practice roll on this device · the practice clan takes the other side</Txt>
          </Card>
        </Animated.View>
      ) : phase === 'round' ? (
        <Card style={{ alignItems: 'center', padding: 16 }}>
          <Txt v="small">Your clan is {side} {coin} · {Math.max(0, left)} s</Txt>
          <Text style={{ fontFamily: F.bold, fontSize: 44, letterSpacing: -1.5, color: winning ? C.up : move === 0 ? C.ink : C.down }}>{move >= 0 ? '+' : ''}{move.toFixed(3)}%</Text>
          <Txt v="label" color={winning ? C.up : move === 0 ? C.muted : C.down}>{move === 0 ? 'Dead even' : winning ? 'Your clan is winning the round' : 'The practice clan is winning'}</Txt>
        </Card>
      ) : phase === 'over' ? (
        <Card style={{ alignItems: 'center', padding: 16 }}>
          {mine > theirs ? <WinBurst src={ART.winTrophy} size={130} /> : <Shake trigger={rounds.length}><WinBurst src={mine === theirs ? ART.draw : ART.koSkull} size={120} burst={false} /></Shake>}
          <Txt v="title">{mine > theirs ? 'Your clan wins the skirmish.' : mine === theirs ? 'Skirmish drawn.' : 'The practice clan wins.'}</Txt>
          <CountUp to={mine} ms={700} format={(v) => `${Math.round(v)} – ${theirs}`} style={{ fontFamily: F.bold, fontSize: 40, color: C.ink, marginTop: 4 }} />
          <Btn title="Skirmish again" kind="white" style={{ marginTop: 12, alignSelf: 'stretch' }} onPress={again} />
          <Btn title="Open the clan chest" kind="ghost" style={{ marginTop: 8, alignSelf: 'stretch' }} onPress={() => router.push('/clan/chest')} />
        </Card>
      ) : (
        <Card style={{ alignItems: 'center', padding: 16 }}><Txt v="label">Rolling the next coin…</Txt></Card>
      )}
      {rounds.length ? (
        <Card style={{ padding: 12 }}>
          {rounds.map((r, i) => (
            <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 5 }}>
              <Row style={{ gap: 8 }}><Txt v="small" color={C.ink}>R{i + 1}</Txt><TokenArt symbol={r.coin} uri={MAJORS.find((x) => x.id === r.coin)?.image} size={16} /><Txt v="small">{r.coin} · {r.side}</Txt></Row>
              <Txt v="small" color={r.won ? C.up : r.won === false ? C.down : C.muted}>{r.move >= 0 ? '+' : ''}{(r.move * 100).toFixed(3)}% · {r.won ? 'won' : r.won === false ? 'lost' : 'even'}</Txt>
            </Row>
          ))}
        </Card>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
        <Row style={{ gap: 10, marginBottom: 12 }}>
          <BackBtn onPress={() => router.back()} />
          <View style={{ flex: 1 }}><Txt v="h2">Clan Skirmish</Txt><Txt v="small">Practice · clan vs clan · first to {TO_WIN} rounds</Txt></View>
        </Row>
        <View style={{ borderRadius: 24, padding: 14, backgroundColor: C.s1, flexDirection: 'row', alignItems: 'center' }}>
          {crestBox(MINE, 'Your clan', mine, true)}
          <Animated.View entering={ZoomIn.springify()}><Art src={ART.vs} size={64} radius={0} /></Animated.View>
          {crestBox(THEIRS, 'Practice clan', theirs, false)}
        </View>
        <View style={{ height: 12, borderRadius: 6, backgroundColor: C.opp, overflow: 'hidden', marginTop: 10 }}>
          <View style={{ width: `${((mine + 0.5) / (mine + theirs + 1)) * 100}%`, height: '100%', backgroundColor: C.brand }} />
        </View>
        <View style={{ flexDirection: desk ? 'row' : 'column', gap: 14, marginTop: 14 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <LiveChart data={series} w={chartW} h={desk ? 340 : 220} refLine={phase === 'round' && start ? start : undefined} refLabel={phase === 'round' ? 'Round start' : undefined} />
            <Row style={{ justifyContent: 'space-between', padding: 10, paddingTop: 2 }}>
              <Row style={{ gap: 6 }}><TokenArt symbol={coin} uri={m.image} size={16} /><Txt v="small" color={C.brandSoft}>{coin} live</Txt></Row>
              <Txt v="small" color={C.ink}>{last ? fmtUsd(last) : 'Loading…'}</Txt>
            </Row>
          </Card>
          {panel}
        </View>
      </ScrollView>
      {phase === 'pick' ? <RoundBanner round={roundNo} /> : null}
      <Hit k={phase === 'between' ? hit.k : 0} src={hit.won ? FX.safe : hit.won === false ? FX.heartBroken : undefined} text={hit.won === null ? 'EVEN' : ''} color={C.muted} />
      {phase === 'count' ? <Countdown onDone={go} /> : null}
      {phase === 'intro' ? <VsIntro left={<Art src={MINE} size={130} radius={0} />} right={<Art src={THEIRS} size={130} radius={0} />} leftLabel="Your clan" rightLabel="Practice clan" onDone={toPick} /> : null}
    </View>
  );
}
