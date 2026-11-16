// Hot Streak (practice): every 5 seconds, call higher or lower on a live price. Each right call grows the streak and
// the combo multiplier; one wrong (or missed) call ends the run. Live Coinbase prices, no money.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAJORS } from '@/data/markets';
import { useTicks } from '@/data/ticks';
import { Countdown, CountUp, FX, Hit, Shake, WinBurst } from '@/ui/fx';
import { ErrorLine, ART, BackBtn, Btn, Card, LiveChart, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

const STEP = 5;
const PB_KEY = 'clashy:streak:best';
type Phase = 'ready' | 'count' | 'call' | 'over';
const comboFor = (n: number) => (n >= 12 ? 5 : n >= 8 ? 3 : n >= 4 ? 2 : 1);

export default function HotStreak() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(900);
  const { desk } = useLayout();
  const { width } = useWindowDimensions();
  const [coin, setCoin] = useState('BTC');
  const { ticks, last, error: feedError } = useTicks(coin, 120);
  const [phase, setPhase] = useState<Phase>('ready');
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(STEP);
  const [ref, setRef] = useState<number | null>(null);
  const [call, setCall] = useState<'up' | 'down' | null>(null);
  const [hit, setHit] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const lastRef = useRef<number | undefined>(undefined);
  lastRef.current = last;
  useEffect(() => { AsyncStorage.getItem(PB_KEY).then((v) => v && setBest(Number(v))).catch(() => {}); }, []);

  const start = () => { if (!last) return; setStreak(0); setScore(0); setPhase('count'); };
  const go = useCallback(() => { setRef(lastRef.current ?? null); setCall(null); setLeft(STEP); setPhase('call'); }, []);
  useEffect(() => {
    if (phase !== 'call') return;
    const h = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(h);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'call' || left > 0 || ref === null) return;
    const now = lastRef.current ?? ref;
    const ok = call !== null && now !== ref && (call === 'up' ? now > ref : now < ref);
    const flat = now === ref && call !== null;
    if (ok || flat) {
      const n = ok ? streak + 1 : streak;
      if (ok) { setStreak(n); setScore((s) => s + comboFor(n)); setHit((h) => h + 1); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      setRef(now); setCall(null); setLeft(STEP);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPhase('over');
      if (best === null || score > best) { setBest(score); AsyncStorage.setItem(PB_KEY, String(score)).catch(() => {}); }
    }
  }, [phase, left, ref, call, streak, score, best]);

  const chartW = Math.min(width, desk ? 900 : 560) - S.gutter * 2 - (desk ? 340 : 0);
  const combo = comboFor(streak);
  const tap = (d: 'up' | 'down') => { if (phase === 'call' && !call) { Haptics.selectionAsync(); setCall(d); } };
  const zone = (d: 'up' | 'down') => {
    const on = call === d, up = d === 'up';
    return (
      <Pressable onPress={() => tap(d)} disabled={phase !== 'call' || !!call} accessibilityRole="button" accessibilityLabel={up ? 'Higher' : 'Lower'}
        style={({ pressed }) => ({ flex: 1, height: 96, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (up ? C.up : C.down) : up ? '#0B3A1C' : '#3A0D0D', opacity: call && !on ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <Text style={{ fontFamily: F.bold, fontSize: 30, color: on ? (up ? '#03140A' : '#fff') : up ? C.up : C.down }}>{up ? 'HIGHER ▲' : 'LOWER ▼'}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
        <Row style={{ gap: 10, marginBottom: 12 }}>
          <BackBtn onPress={() => router.back()} />
          <View style={{ flex: 1 }}><Txt v="h2">Hot Streak</Txt><Txt v="small">Practice · a call every {STEP} s · one miss ends it</Txt></View>
          <Image source={FX.fire} style={{ width: 34, height: 34 }} contentFit="contain" />
        </Row>
        <Row style={{ gap: 8, marginBottom: 12 }}>
          {MAJORS.map((m) => <Btn key={m.id} title={m.id} h={36} kind={coin === m.id ? 'white' : 'ghost'} style={{ flex: 1 }} disabled={phase === 'call' || phase === 'count'} onPress={() => setCoin(m.id)} icon={<TokenArt symbol={m.id} uri={m.image} size={18} />} />)}
        </Row>
        <Shake trigger={phase === 'over' ? 1 : 0}>
          <Row style={{ gap: 10, marginBottom: 12 }}>
            <Card style={{ flex: 1, alignItems: 'center' }}><Txt v="small">Streak</Txt><Animated.View key={streak} entering={ZoomIn.springify().damping(8)}><Text style={{ fontFamily: F.bold, fontSize: 40, color: streak >= 4 ? '#FFC94A' : C.ink }}>{streak}</Text></Animated.View></Card>
            <Card style={{ flex: 1, alignItems: 'center' }}><Txt v="small">Combo</Txt><Text style={{ fontFamily: F.bold, fontSize: 40, color: combo > 1 ? C.opp : C.muted }}>×{combo}</Text></Card>
            <Card style={{ flex: 1, alignItems: 'center' }}><Txt v="small">Score</Txt><Text style={{ fontFamily: F.bold, fontSize: 40, color: C.ink }}>{score}</Text></Card>
          </Row>
        </Shake>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {feedError ? <ErrorLine msg={`Price feed: ${feedError}`} /> : null}
          <LiveChart data={ticks.map((k) => k.p)} w={chartW} h={desk ? 300 : 210} refLine={phase === 'call' && ref ? ref : undefined} refLabel={phase === 'call' ? 'Your line' : undefined} />
          <Row style={{ justifyContent: 'space-between', padding: 10, paddingTop: 2 }}>
            <Txt v="small" color={C.brandSoft}>{coin} live</Txt>
            <Txt v="small" color={C.ink}>{last ? fmtUsd(last) : 'Loading…'}</Txt>
          </Row>
        </Card>
        {phase === 'call' ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ textAlign: 'center', fontFamily: F.bold, fontSize: 18, color: left <= 2 ? C.down : C.ink, marginBottom: 10 }}>{call ? `Locked ${call === 'up' ? 'higher' : 'lower'} · ${Math.max(0, left)} s` : `Higher or lower than ${ref ? fmtUsd(ref) : '…'} in ${Math.max(0, left)} s?`}</Text>
            <Row style={{ gap: 10 }}>{zone('up')}{zone('down')}</Row>
            <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Combo grows at 4, 8 and 12 in a row. No call counts as a miss.</Txt>
          </View>
        ) : phase === 'over' ? (
          <Card style={{ alignItems: 'center', padding: 16, marginTop: 14 }}>
            <WinBurst src={score >= 10 ? ART.winTrophy : ART.koSkull} size={120} burst={score >= 10} />
            <Txt v="title">{score >= 10 ? 'On fire.' : 'Streak over.'}</Txt>
            <CountUp to={score} ms={800} format={(v) => `${Math.round(v)} points · ${streak} in a row`} style={{ fontFamily: F.semi, fontSize: 16, color: C.ink, marginTop: 4 }} />
            {best !== null ? <Txt v="small" style={{ marginTop: 4 }}>Your best: {best} points</Txt> : null}
            <Btn title="Go again" kind="white" style={{ marginTop: 12, alignSelf: 'stretch' }} onPress={start} />
          </Card>
        ) : (
          <View style={{ marginTop: 14 }}>
            <Btn title={last ? 'Start the streak' : 'Waiting for price…'} h={60} disabled={!last || phase === 'count'} style={{ borderRadius: 18 }} onPress={start} />
            <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Practice on the live {coin} price{best !== null ? ` · your best ${best} points` : ''}</Txt>
          </View>
        )}
      </ScrollView>
      <Hit k={hit} src={streak > 0 && streak % 4 === 0 ? FX.fire : FX.safe} />
      {phase === 'count' ? <Countdown onDone={go} /> : null}
    </View>
  );
}
