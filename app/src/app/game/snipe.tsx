// Peak Snipe (practice): you hold a live coin for a 30 s window and get ONE tap to sell. Your score is how close your
// sell price is to the window's real high (100% = you sold the exact top). Wait too long and the bell sells for you.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAJORS } from '@/data/markets';
import { useTicks } from '@/data/ticks';
import { Countdown, CountUp, FX, Hit, WinBurst } from '@/ui/fx';
import { ART, BackBtn, Btn, Card, LiveChart, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

const WINDOW = 30;
const PB_KEY = 'clashy:snipe:best';
type Phase = 'ready' | 'count' | 'live' | 'done';

export default function PeakSnipe() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(900);
  const { desk } = useLayout();
  const { width } = useWindowDimensions();
  const [coin, setCoin] = useState('SOL');
  const { ticks, last } = useTicks(coin, 120);
  const [phase, setPhase] = useState<Phase>('ready');
  const [t0, setT0] = useState(0);
  const [left, setLeft] = useState(WINDOW);
  const [sold, setSold] = useState<{ price: number; at: number; auto: boolean } | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const lastRef = useRef<number | undefined>(undefined);
  lastRef.current = last;
  useEffect(() => { AsyncStorage.getItem(PB_KEY).then((v) => v && setBest(Number(v))).catch(() => {}); }, []);

  const win = ticks.filter((k) => k.t >= t0 && (phase === 'live' || phase === 'done'));
  const hi = win.length ? Math.max(...win.map((k) => k.p)) : undefined;
  const lo = win.length ? Math.min(...win.map((k) => k.p)) : undefined;
  // 100 = sold the exact high, 0 = sold the low of the window
  const score = sold && hi !== undefined && lo !== undefined ? (hi === lo ? 100 : Math.round(((sold.price - lo) / (hi - lo)) * 100)) : null;

  const begin = () => { if (!last) return; setSold(null); setPhase('count'); };
  const go = useCallback(() => { setT0(Date.now()); setLeft(WINDOW); setPhase('live'); }, []);
  const sell = (auto = false) => {
    if (phase !== 'live' || sold || !lastRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSold({ price: lastRef.current, at: Date.now(), auto });
  };
  useEffect(() => {
    if (phase !== 'live') return;
    const h = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(h);
  }, [phase]);
  useEffect(() => { if (phase === 'live' && left <= 0) { if (!sold) sell(true); setPhase('done'); } }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase === 'done' && score !== null && (best === null || score > best)) { setBest(score); AsyncStorage.setItem(PB_KEY, String(score)).catch(() => {}); }
  }, [phase, score, best]);

  // crosshair pulse on the SNIPE button
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = phase === 'live' && !sold ? withRepeat(withSequence(withTiming(1.05, { duration: 500 }), withTiming(1, { duration: 500 })), -1, true) : withTiming(1); }, [phase, sold, pulse]);
  const pulseSt = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const chartW = Math.min(width, desk ? 900 : 560) - S.gutter * 2 - (desk ? 340 : 0);
  const series = phase === 'live' || phase === 'done' ? win.map((k) => k.p) : ticks.map((k) => k.p);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
        <Row style={{ gap: 10, marginBottom: 12 }}>
          <BackBtn onPress={() => router.back()} />
          <View style={{ flex: 1 }}><Txt v="h2">Peak Snipe</Txt><Txt v="small">Practice · {WINDOW} s · one tap to sell the top</Txt></View>
          {phase === 'live' ? <Txt v="title" color={left <= 5 ? C.down : C.ink}>0:{String(Math.max(0, left)).padStart(2, '0')}</Txt> : null}
        </Row>
        <Row style={{ gap: 8, marginBottom: 12 }}>
          {MAJORS.map((m) => <Btn key={m.id} title={m.id} h={36} kind={coin === m.id ? 'white' : 'ghost'} style={{ flex: 1 }} disabled={phase === 'live' || phase === 'count'} onPress={() => setCoin(m.id)} icon={<TokenArt symbol={m.id} uri={m.image} size={18} />} />)}
        </Row>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <LiveChart data={series.length > 1 ? series : ticks.map((k) => k.p)} w={chartW} h={desk ? 320 : 230} refLine={sold?.price} refLabel={sold ? `You sold ${fmtUsd(sold.price)}` : undefined} color={C.opp} />
          <Row style={{ justifyContent: 'space-between', padding: 10, paddingTop: 2 }}>
            <Txt v="small" color={C.brandSoft}>{phase === 'live' || phase === 'done' ? `Window high ${hi ? fmtUsd(hi) : '…'}` : `${coin} live`}</Txt>
            <Txt v="small" color={C.ink}>{last ? fmtUsd(last) : 'Loading…'}</Txt>
          </Row>
        </Card>
        {phase === 'live' ? (
          <View style={{ marginTop: 14 }}>
            <Animated.View style={pulseSt}>
              <Pressable onPress={() => sell(false)} disabled={!!sold} accessibilityRole="button" accessibilityLabel="Snipe: sell now"
                style={({ pressed }) => ({ height: 110, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, backgroundColor: sold ? C.s1 : C.opp, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                <Image source={FX.bolt} style={{ width: 44, height: 44 }} contentFit="contain" />
                <Text style={{ fontFamily: F.bold, fontSize: 34, color: sold ? C.muted : '#fff' }}>{sold ? 'SOLD · wait for the bell' : 'SNIPE'}</Text>
              </Pressable>
            </Animated.View>
            <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>One tap. You score how close you sold to the highest price of the window.</Txt>
          </View>
        ) : phase === 'done' && score !== null ? (
          <Card style={{ alignItems: 'center', padding: 16, marginTop: 14 }}>
            <WinBurst src={score >= 90 ? FX.perfect : score >= 60 ? ART.draw : ART.koSkull} size={120} burst={score >= 90} />
            <CountUp to={score} ms={900} format={(v) => `${Math.round(v)}%`} style={{ fontFamily: F.bold, fontSize: 48, color: score >= 70 ? C.up : score >= 40 ? C.ink : C.down }} />
            <Txt v="label">{sold?.auto ? 'The bell sold for you.' : score >= 90 ? 'Sniped the top.' : score >= 60 ? 'Close to the top.' : 'Sold the dip.'}</Txt>
            <Txt v="small" style={{ marginTop: 4 }}>Sold {sold ? fmtUsd(sold.price) : '–'} · window high {hi ? fmtUsd(hi) : '–'} · low {lo ? fmtUsd(lo) : '–'}</Txt>
            {best !== null ? <Txt v="small" style={{ marginTop: 4 }}>Your best: {best}%</Txt> : null}
            <Btn title="Snipe again" kind="white" style={{ marginTop: 12, alignSelf: 'stretch' }} onPress={begin} />
          </Card>
        ) : (
          <View style={{ marginTop: 14 }}>
            <Btn title={last ? 'Start the window' : 'Waiting for price…'} h={60} disabled={!last || phase === 'count'} style={{ borderRadius: 18 }} onPress={begin} />
            <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Practice on the live {coin} price{best !== null ? ` · your best ${best}%` : ''}</Txt>
          </View>
        )}
      </ScrollView>
      <Hit k={phase === 'done' && score !== null && score >= 90 ? 1 : 0} src={FX.perfect} />
      {phase === 'count' ? <Countdown onDone={go} /> : null}
    </View>
  );
}
