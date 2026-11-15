// Royale (practice, style R5 arcade tap zones): every 10 s, call up or down on a live price.
// During a round the whole screen is the button: top half = up, bottom half = down. Wrong or no call costs a life.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { MAJORS } from '@/data/markets';
import { useTicks } from '@/data/ticks';
import { BackBtn, Btn, Card, PriceChart, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, R, S, fmtUsd } from '@/ui/tokens';

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

  // the round itself: two giant tap zones and an arcade countdown in the middle
  if (phase === 'round') {
    const move = startP && last ? (last - startP) / startP : 0;
    const zone = (dir: 'up' | 'down') => {
      const on = call === dir, up = dir === 'up';
      const base = up ? ['#0B3A1C', '#082714'] : ['#3A0D0D', '#270909'];
      return (
        <Pressable onPress={() => { Haptics.selectionAsync(); setCall(dir); }} accessibilityRole="button" accessibilityLabel={`Call ${dir}`}
          style={{ flex: 1, backgroundColor: on ? (up ? '#145C2C' : '#5C1616') : base[0], alignItems: 'center', justifyContent: up ? 'flex-end' : 'flex-start', paddingBottom: up ? 110 : 0, paddingTop: up ? 0 : 110 }}>
          {!up ? <Text style={{ color: C.down, fontFamily: F.semi, fontSize: 14, opacity: 0.85 }}>{on ? 'Locked in ✓' : 'Tap anywhere here'}</Text> : null}
          <Text style={{ color: up ? C.up : C.down, fontFamily: F.bold, fontSize: on ? 76 : 64, letterSpacing: -2 }}>{up ? 'UP' : 'DOWN'}</Text>
          {up ? <Text style={{ color: C.up, fontFamily: F.semi, fontSize: 14, opacity: 0.85 }}>{on ? 'Locked in ✓' : 'Tap anywhere here'}</Text> : null}
        </Pressable>
      );
    };
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, ...col }}>
        {zone('up')}
        <View style={{ height: 4, backgroundColor: '#000' }} />
        {zone('down')}
        <Row style={{ position: 'absolute', top: insets.top + 8, left: S.gutter, right: S.gutter, justifyContent: 'space-between' }}>
          <BackBtn onPress={() => { setPhase('ready'); }} />
          <Row style={{ gap: 4 }}>{Array.from({ length: LIVES }).map((_, k) => <Heart key={k} on={k < lives} />)}</Row>
          <View style={{ backgroundColor: '#000', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}><Txt v="small" color={C.ink}>Round {round}</Txt></View>
        </Row>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 200, height: 200, borderRadius: 100, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: left <= 3 ? C.down : '#FFC94A' }}>
            <Svg width={200} height={200} style={{ position: 'absolute' }}>
              <Circle cx={100} cy={100} r={90} stroke={left <= 3 ? C.down : '#FFC94A'} strokeOpacity={0.9} strokeWidth={6} fill="none" strokeDasharray={`${(Math.max(0, left) / ROUND) * 2 * Math.PI * 90} 999`} strokeLinecap="round" transform="rotate(-90 100 100)" />
            </Svg>
            <Text style={{ color: left <= 3 ? C.down : '#FFC94A', fontFamily: F.bold, fontSize: 72, lineHeight: 78 }}>{Math.max(0, left)}</Text>
            <Row style={{ gap: 5 }}><TokenArt symbol={coin} uri={MAJORS.find((m) => m.id === coin)?.image} size={14} /><Txt v="small" color={C.ink}>{last ? fmtUsd(last) : '…'}</Txt></Row>
            <Txt v="small" color={move > 0 ? C.up : move < 0 ? C.down : C.muted}>{move >= 0 ? '+' : ''}{(move * 100).toFixed(3)}%</Txt>
          </View>
        </View>
        {log[0] ? (
          <View pointerEvents="none" style={{ position: 'absolute', bottom: insets.bottom + 18, left: 0, right: 0, alignItems: 'center' }}>
            <Txt v="small" color={log[0].ok ? C.up : C.down}>Last round: {log[0].call ? `you said ${log[0].call}` : 'no call'} · {log[0].ok ? 'safe' : 'lost a life'}</Txt>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 12 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Royale</Txt><Txt v="small">Practice · {ROUND} s rounds · {LIVES} lives{survived ? ` · ${survived} right` : ''}</Txt></View>
      </Row>
      <Row style={{ gap: 8, marginBottom: 12 }}>
        {MAJORS.map((m) => (
          <Btn key={m.id} title={m.id} h={36} kind={coin === m.id ? 'white' : 'ghost'} style={{ flex: 1 }} onPress={() => setCoin(m.id)}
            icon={<TokenArt symbol={m.id} uri={m.image} size={18} />} />
        ))}
      </Row>
      <View style={{ flexDirection: desk ? 'row' : 'column', gap: 14 }}>
        <View>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <PriceChart data={ticks.map((k) => k.p)} w={chartW} h={desk ? 380 : 240} />
            <Row style={{ justifyContent: 'space-between', padding: 10, paddingTop: 2 }}>
              <Txt v="small" color={C.brandSoft}>{`${coin} live`}</Txt>
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
