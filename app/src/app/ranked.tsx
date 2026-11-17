// Ranked roll: the ranked queue puts you in any game. On chain MagicBlock VRF picks the game; in practice the roll
// is crypto-random on this device (labelled), then it opens that game's practice.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bob } from '@/ui/fx';
import { ART, Art, BackBtn, Btn, Row, Txt } from '@/ui/kit';
import { RankStrip } from '@/ui/lobby';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

const GAMES = [
  { key: 'line', title: 'Draw the line', art: ART.tileLine, go: () => router.replace('/game/line') },
  { key: 'royale', title: 'Royale', art: ART.tileRoyale, go: () => router.replace('/game/royale') },
];
const ROW = 150;

function randomIndex(n: number) {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }
  return Math.floor(Math.random() * n);
}

export default function Ranked() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(620);
  const [pick, setPick] = useState<number | null>(null);
  const y = useSharedValue(0);
  const strip = Array.from({ length: 8 }).flatMap(() => GAMES);
  useEffect(() => {
    const k = randomIndex(GAMES.length);
    const target = GAMES.length * 6 + k;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    y.value = withTiming(-target * ROW, { duration: 2800, easing: Easing.out(Easing.cubic) }, (f) => { if (f) runOnJS(setPick)(k); });
  }, [y]);
  useEffect(() => { if (pick !== null) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }, [pick]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const g = pick !== null ? GAMES[pick] : null;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 12 }}>
      <Row style={{ gap: 10 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Surprise me</Txt><Txt v="small">A random practice game</Txt></View>
        <Bob amp={4} ms={900}><Art src={ART.crown} size={40} radius={0} /></Bob>
      </Row>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 26, fontFamily: F.semi, letterSpacing: 1, fontSize: 11 }}>{g ? 'YOUR GAME' : 'ROLLING THE GAME'}</Txt>
      <View style={{ height: ROW, marginTop: 10, overflow: 'hidden', borderRadius: 26, backgroundColor: C.s1, borderWidth: 2.5, borderColor: g ? C.up : '#FFC94A' }}>
        <Animated.View style={st}>
          {strip.map((m, i) => (
            <Row key={i} style={{ height: ROW, paddingHorizontal: 18, gap: 16 }}>
              <Art src={m.art} size={112} radius={0} />
              <Txt v="title" style={{ fontSize: 26, flex: 1 }}>{m.title}</Txt>
            </Row>
          ))}
        </Animated.View>
      </View>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Rolled on this device · practice, no money</Txt>
      {g ? (
        <Animated.View entering={FadeInDown.springify().damping(14)} style={{ marginTop: 18 }}>
          <Btn title={`Play ${g.title}`} h={60} style={{ borderRadius: 18 }} onPress={g.go} />
          <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Rank points come from on-chain duels: see the Leaderboard</Txt>
        </Animated.View>
      ) : null}
      <View style={{ flex: 1 }} />
      <Txt v="label" style={{ marginBottom: 8 }}>The ladder</Txt>
      <RankStrip />
    </View>
  );
}
