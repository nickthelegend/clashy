// Royale (practice): every 10 s, call up or down on a live price. Wrong or no call costs a life. 3 lives.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { MAJORS } from '@/data/markets';
import { useTicks } from '@/data/ticks';
import { BackBtn, Btn, Card, PriceChart, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, R, S, fmtUsd } from '@/ui/tokens';

const ROUND = 10; // seconds per round
const LIVES = 3;
const PB_KEY = 'clashy:royale:best';
type Call = 'up' | 'down' | null;
type Phase = 'ready' | 'round' | 'over';

const Heart = ({ on }: { on: boolean }) => <Txt v="h2" color={on ? C.opp : '#2A2A30'} style={{ fontSize: 22 }}>♥</Txt>;

export default function Royale() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(900);
  const { desk } = useLayout();
  const { width } = useWindowDimensions();
  const [coin, setCoin] = useState('BTC');
  const { ticks, last, error } = useTicks(coin, 90);
  const [phase, setPhase] = useState<Phase>('ready');
  const [lives, setLives] = useState(LIVES);
  const [round, setRound] = useState(0);
  const [left, setLeft] = useState(ROUND);
  const [call, setCall] = useState<Call>(null);
  const [startP, setStartP] = useState<number | null>(null);
  const [log, setLog] = useState<{ r: number; call: Call; move: number; ok: boolean }[]>([]);
  const [best, setBest] = useState<number | null>(null);
  const lastRef = useRef<number | undefined>(undefined);
  lastRef.current = last;

  useEffect(() => { AsyncStorage.getItem(PB_KEY).then((v) => v && setBest(Number(v))).catch(() => {}); }, []);

  const begin = () => {
    if (!last) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setLives(LIVES); setRound(1); setLog([]); setCall(null); setStartP(last); setLeft(ROUND); setPhase('round');
  };

  useEffect(() => {
    if (phase !== 'round') return;
    const h = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(h);
  }, [phase]);

  // resolve a round at the bell
  useEffect(() => {
    if (phase !== 'round' || left > 0 || startP === null || lastRef.current === undefined) return;
    const end = lastRef.current;
    const move = (end - startP) / startP;
    const ok = call !== null && ((call === 'up' && move > 0) || (call === 'down' && move < 0));
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setLog((l) => [{ r: round, call, move, ok }, ...l].slice(0, 8));
    const nextLives = ok ? lives : lives - 1;
    setLives(nextLives);
    if (nextLives <= 0) {
      setPhase('over');
      const survived = ok ? round : round - 1;
      if (best === null || survived > best) { setBest(survived); AsyncStorage.setItem(PB_KEY, String(survived)).catch(() => {}); }
      return;
    }
    setRound((r) => r + 1); setCall(null); setStartP(end); setLeft(ROUND);
  }, [phase, left, startP, call, round, lives, best]);

  const chartW = Math.min(width, desk ? 900 : 520) - S.gutter * 2 - (desk ? 340 : 0);
  const ring = (1 - Math.max(0, left) / ROUND) * 2 * Math.PI * 34;
  const survived = log.filter((x) => x.ok).length;

  const controls = (
    <View style={{ gap: 10, width: desk ? 320 : undefined }}>
      <Card style={{ alignItems: 'center' }}>
        <Row style={{ gap: 6 }}>{Array.from({ length: LIVES }).map((_, k) => <Heart key={k} on={k < lives} />)}</Row>
        {phase === 'round' ? (
          <View style={{ marginTop: 10, alignItems: 'center' }}>
            <Svg width={84} height={84}>
              <Circle cx={42} cy={42} r={34} stroke={C.s2} strokeWidth={7} fill="none" />
              <Circle cx={42} cy={42} r={34} stroke={left <= 3 ? C.down : C.brand} strokeWidth={7} fill="none" strokeDasharray={`${ring} 999`} strokeLinecap="round" transform="rotate(-90 42 42)" />
            </Svg>
            <View style={{ position: 'absolute', top: 26 }}><Txt v="title">{Math.max(0, left)}</Txt></View>
            <Txt v="small" style={{ marginTop: 6 }}>Round {round} · from {startP ? fmtUsd(startP) : '–'}</Txt>
          </View>
        ) : phase === 'over' ? (
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Txt v="title">Out.</Txt>
            <Txt v="small" style={{ marginTop: 2 }}>You survived {Math.max(0, round - 1)} round{round - 1 === 1 ? '' : 's'}</Txt>
          </View>
        ) : (
          <Txt v="small" color="#B9B9C2" style={{ marginTop: 8, textAlign: 'center', lineHeight: 18 }}>Every {ROUND} s, call where {coin} goes. Wrong or no call costs a life. Last one standing wins.</Txt>
        )}
        {best !== null ? <Txt v="small" style={{ marginTop: 8 }}>Your best: {best} rounds</Txt> : null}
      </Card>
      {phase === 'round' ? (
        <Row style={{ gap: 10 }}>
          <Btn title={call === 'up' ? 'Up ✓' : 'Up'} kind={call === 'up' ? 'long' : 'ghost'} h={60} style={{ flex: 1 }} onPress={() => setCall('up')} />
          <Btn title={call === 'down' ? 'Down ✓' : 'Down'} kind={call === 'down' ? 'short' : 'ghost'} h={60} style={{ flex: 1 }} onPress={() => setCall('down')} />
        </Row>
      ) : (
        <Btn title={phase === 'over' ? 'Play again' : last ? 'Start' : 'Waiting for price…'} kind="white" h={56} disabled={!last} onPress={begin} />
      )}
      {log.map((x) => (
        <Animated.View key={x.r} entering={FadeInDown.duration(220)}>
          <Row style={{ justifyContent: 'space-between', backgroundColor: C.s1, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Txt v="small" color={C.ink}>Round {x.r} · {x.call ? `you said ${x.call}` : 'no call'}</Txt>
            <Txt v="small" color={x.ok ? C.up : C.down}>{x.move >= 0 ? '+' : ''}{(x.move * 100).toFixed(3)}% {x.ok ? '✓' : '✕'}</Txt>
          </Row>
        </Animated.View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 12 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Royale</Txt><Txt v="small">Practice · {ROUND} s rounds · {LIVES} lives{survived ? ` · ${survived} right` : ''}</Txt></View>
      </Row>
      <Row style={{ gap: 8, marginBottom: 12 }}>
        {MAJORS.map((m) => (
          <Btn key={m.id} title={m.id} h={36} kind={coin === m.id ? 'white' : 'ghost'} style={{ flex: 1 }} disabled={phase === 'round'} onPress={() => setCoin(m.id)}
            icon={<TokenArt symbol={m.id} uri={m.image} size={18} />} />
        ))}
      </Row>
      <View style={{ flexDirection: desk ? 'row' : 'column', gap: 14 }}>
        <View>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <PriceChart data={ticks.map((k) => k.p)} w={chartW} h={desk ? 380 : 240} koYou={phase === 'round' && startP ? startP : undefined} />
            <Row style={{ justifyContent: 'space-between', padding: 10, paddingTop: 2 }}>
              <Txt v="small" color={C.brandSoft}>{phase === 'round' ? 'Round start line' : `${coin} live`}</Txt>
              <Txt v="small" color={C.ink}>{last ? fmtUsd(last) : 'Loading…'}</Txt>
            </Row>
          </Card>
          {error ? <Txt v="small" color={C.down} style={{ marginTop: 6 }}>Price feed: {error}</Txt> : null}
        </View>
        {controls}
      </View>
    </View>
  );
}
