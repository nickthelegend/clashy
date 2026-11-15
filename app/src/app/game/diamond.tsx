// Diamond Hands (practice): buy a live coin with leverage and hold as long as you dare. Your score is your P&L when
// YOU sell. A knockout line trails your peak: give back too much from the top and you are out. Max 3 minutes.
// Live Coinbase prices, no money. Rooms where everyone holds the same coin open with the program at the Blitz kickoff.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAJORS, useCandles } from '@/data/markets';
import { useTicks } from '@/data/ticks';
import { Countdown, CountUp, DangerPulse, FX, Fill, Hit, Shake, WinBurst } from '@/ui/fx';
import { ART, Art, BackBtn, Btn, Card, LiveChart, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

const MAX_SECS = 180;
const GIVEBACK = 25; // points of leveraged P&L you may give back from your peak
const LEVS = [25, 50, 100];
const PB_KEY = 'clashy:diamond:best';
type Phase = 'ready' | 'count' | 'hold' | 'done';

export default function DiamondHands() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(900);
  const { desk } = useLayout();
  const { width } = useWindowDimensions();
  const [coin, setCoin] = useState<string>('SOL');
  const [lev, setLev] = useState(100);
  const { ticks, last, error } = useTicks(coin, 240);
  const candles = useCandles(coin);
  const [phase, setPhase] = useState<Phase>('ready');
  const [entry, setEntry] = useState<number | null>(null);
  const [t0, setT0] = useState(0);
  const [peak, setPeak] = useState(0);
  const [left, setLeft] = useState(MAX_SECS);
  const [out, setOut] = useState<{ pnl: number; reason: 'sold' | 'ko' | 'time' } | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const lastRef = useRef<number | undefined>(undefined);
  lastRef.current = last;
  useEffect(() => { AsyncStorage.getItem(PB_KEY).then((v) => v && setBest(Number(v))).catch(() => {}); }, []);

  const pnl = entry && last ? ((last - entry) / entry) * lev * 100 : 0;
  const koAt = Math.max(-100, peak - GIVEBACK);
  const room = pnl - koAt; // points left before the knockout
  const koPrice = entry ? entry * (1 + koAt / (lev * 100)) : undefined;

  const begin = () => { if (!last) return; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setOut(null); setPeak(0); setPhase('count'); };
  const buy = useCallback(() => { setEntry(lastRef.current ?? null); setT0(Date.now()); setLeft(MAX_SECS); setPhase('hold'); }, []);
  const end = useCallback((reason: 'sold' | 'ko' | 'time', value: number) => {
    setPhase('done');
    setOut({ pnl: value, reason });
    Haptics.notificationAsync(reason === 'ko' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
    if (reason !== 'ko' && (best === null || value > best)) { setBest(value); AsyncStorage.setItem(PB_KEY, String(value)).catch(() => {}); }
  }, [best]);

  useEffect(() => { if (phase === 'hold' && pnl > peak) setPeak(pnl); }, [phase, pnl, peak]);
  useEffect(() => { if (phase === 'hold' && entry && pnl <= koAt) end('ko', -100); }, [phase, entry, pnl, koAt, end]);
  useEffect(() => {
    if (phase !== 'hold') return;
    const h = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(h);
  }, [phase]);
  useEffect(() => { if (phase === 'hold' && left <= 0) end('time', pnl); }, [phase, left, pnl, end]);

  // the SELL button breathes; harder the closer you are to the knockout
  const breathe = useSharedValue(1);
  useEffect(() => {
    breathe.value = phase === 'hold' ? withRepeat(withSequence(withTiming(1.04, { duration: room < 8 ? 260 : 700 }), withTiming(1, { duration: room < 8 ? 260 : 700 })), -1, true) : withSpring(1);
  }, [phase, room < 8, breathe]); // eslint-disable-line react-hooks/exhaustive-deps
  const breatheSt = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));

  const chartW = Math.min(width, desk ? 900 : 560) - S.gutter * 2 - (desk ? 340 : 0);
  const history = phase === 'hold' || phase === 'done' ? ticks.filter((k) => k.t >= t0 - 1000).map((k) => k.p) : [...(candles.data ?? []).slice(-45), ...ticks.map((k) => k.p)];
  const held = phase === 'hold' ? MAX_SECS - left : 0;

  const panel = (
    <View style={{ gap: 10, width: desk ? 320 : undefined }}>
      {phase === 'hold' ? (
        <>
          <Card style={{ alignItems: 'center', padding: 16 }}>
            <Row style={{ gap: 6 }}>{pnl > 5 ? <Image source={FX.fire} style={{ width: 30, height: 30 }} contentFit="contain" /> : null}<Txt v="small">Your P&L if you sell now</Txt></Row>
            <Text style={{ fontFamily: F.bold, fontSize: 52, letterSpacing: -2, color: pnl >= 0 ? C.up : C.down }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%</Text>
            <Txt v="small">Peak +{peak.toFixed(1)}% · held {Math.floor(held / 60)}:{String(held % 60).padStart(2, '0')} · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left</Txt>
          </Card>
          <Card style={{ padding: 14 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <Row style={{ gap: 6 }}>{room < 8 ? <Image source={FX.bolt} style={{ width: 18, height: 18 }} contentFit="contain" /> : null}<Txt v="small" color={room < 8 ? C.down : C.ink}>Room before knockout</Txt></Row>
              <Txt v="small" color={room < 8 ? C.down : C.ink}>{room.toFixed(1)} pts</Txt>
            </Row>
            <Fill v={Math.min(1, room / GIVEBACK)} color={C.brand} />
            <Txt v="small" style={{ marginTop: 8 }}>The knockout trails {GIVEBACK} pts under your peak. Hold for more, or sell before it catches you.</Txt>
          </Card>
          <Animated.View style={breatheSt}>
            <Pressable onPress={() => end('sold', pnl)} accessibilityRole="button" accessibilityLabel="Sell now"
              style={({ pressed }) => ({ height: 76, borderRadius: 22, backgroundColor: pnl >= 0 ? C.up : C.down, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <Text style={{ fontFamily: F.bold, fontSize: 24, color: pnl >= 0 ? '#03140A' : '#fff' }}>SELL · {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%</Text>
            </Pressable>
          </Animated.View>
        </>
      ) : phase === 'done' && out ? (
        <Card style={{ alignItems: 'center', padding: 16 }}>
          {out.reason === 'ko' ? <Shake trigger={out}><WinBurst src={ART.koSkull} size={120} burst={false} /></Shake> : <WinBurst src={out.pnl > 0 ? FX.perfect : ART.draw} size={130} burst={out.pnl > 0} />}
          <Txt v="title">{out.reason === 'ko' ? 'Paper hands got you.' : out.reason === 'time' ? 'Time. Auto-sold.' : out.pnl > 0 ? 'Diamond hands.' : 'Sold red.'}</Txt>
          {out.reason === 'ko' ? <Txt v="small" style={{ marginTop: 4 }}>You gave back {GIVEBACK} pts from your +{peak.toFixed(1)}% peak.</Txt> : (
            <CountUp to={Math.abs(out.pnl)} ms={900} format={(v) => `${out.pnl >= 0 ? '+' : '−'}${v.toFixed(1)}%`} style={{ fontFamily: F.bold, fontSize: 44, letterSpacing: -1.5, color: out.pnl >= 0 ? C.up : C.down }} />
          )}
          {best !== null ? <Txt v="small" style={{ marginTop: 6 }}>Your best: +{best.toFixed(1)}%</Txt> : null}
          <Btn title="Hold again" kind="white" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={begin} />
        </Card>
      ) : (
        <Card style={{ padding: 16 }}>
          <Row style={{ gap: 12 }}>
            <Art src={ART.crown} size={64} radius={0} />
            <View style={{ flex: 1 }}><Txt v="h2">Hold as long as you dare</Txt><Txt v="small" style={{ marginTop: 2, lineHeight: 18 }}>You buy {coin} at {lev}× at GO. Your score is your P&L when you sell. Give back {GIVEBACK} pts from your peak and you are knocked out. Max 3 minutes.</Txt></View>
          </Row>
          <Row style={{ gap: 8, marginTop: 14 }}>{LEVS.map((v) => <Btn key={v} title={`${v}×`} h={38} kind={lev === v ? 'white' : 'ghost'} style={{ flex: 1 }} onPress={() => setLev(v)} />)}</Row>
          <Btn title={last ? 'Buy and hold' : 'Waiting for price…'} h={56} disabled={!last} style={{ marginTop: 12 }} onPress={begin} />
          {best !== null ? <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Your best: +{best.toFixed(1)}%</Txt> : null}
        </Card>
      )}
      <Txt v="small" style={{ textAlign: 'center' }}>Practice · live {coin} price · rooms where everyone holds the same coin open at the Blitz kickoff</Txt>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
        <Row style={{ gap: 10, marginBottom: 12 }}>
          <BackBtn onPress={() => router.back()} />
          <View style={{ flex: 1 }}><Txt v="h2">Diamond Hands</Txt><Txt v="small">Practice · {lev}× · trailing knockout</Txt></View>
          <Image source={FX.sparkle} style={{ width: 34, height: 34 }} contentFit="contain" />
        </Row>
        <Row style={{ gap: 8, marginBottom: 12 }}>
          {MAJORS.map((m) => (
            <Btn key={m.id} title={m.id} h={36} kind={coin === m.id ? 'white' : 'ghost'} style={{ flex: 1 }} disabled={phase === 'hold' || phase === 'count'} onPress={() => setCoin(m.id)} icon={<TokenArt symbol={m.id} uri={m.image} size={18} />} />
          ))}
        </Row>
        <View style={{ flexDirection: desk ? 'row' : 'column', gap: 14 }}>
          <View>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <LiveChart data={history} w={chartW} h={desk ? 380 : 250} refLine={phase === 'hold' ? koPrice : undefined} refLabel={phase === 'hold' ? 'Knockout line (trails your peak)' : undefined} color={C.brand} />
              <Row style={{ justifyContent: 'space-between', padding: 10, paddingTop: 2 }}>
                <Txt v="small" color={C.brandSoft}>{phase === 'hold' && entry ? `Bought at ${fmtUsd(entry)}` : `${coin} · last 45 min + live`}</Txt>
                <Txt v="small" color={C.ink}>{last ? fmtUsd(last) : 'Loading…'}</Txt>
              </Row>
            </Card>
            {error ? <Txt v="small" color={C.down} style={{ marginTop: 6 }}>Price feed: {error}</Txt> : null}
          </View>
          {panel}
        </View>
      </ScrollView>
      <DangerPulse on={phase === 'hold' && room < 8} />
      {phase === 'count' ? <Countdown onDone={buy} /> : null}
      <Hit k={phase === 'done' && out?.reason === 'ko' ? 1 : 0} src={FX.ko} />
    </View>
  );
}
