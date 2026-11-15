// Arena (Nick's pick A6): swipe between game modes, one huge Battle button. Any coin is picked inside the game.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swords } from '@/ui/icons';
import { ART, Art, Btn, Row, Txt } from '@/ui/kit';
import { C, F, S } from '@/ui/tokens';

type Mode = { key: string; title: string; who: string; line: string; art: number; live: boolean };
const MODES: Mode[] = [
  { key: 'ko', title: 'Knockout duel', who: '1 v 1 · any coin · 60 s', line: 'You pick any coin, they pick theirs. Hit your knockout line and you are out.', art: ART.tileDuel, live: true },
  { key: 'line', title: 'Draw the line', who: '3–10 players · any coin', line: 'Draw the next 60 s with your finger. Closest line wins the room.', art: ART.tileLine, live: false },
  { key: 'war', title: 'Clan war', who: 'Clan vs clan · one week', line: 'Push the pot, trade any coins, best return wins the war.', art: ART.tileWar, live: false },
  { key: 'royale', title: 'Royale', who: '5–20 players · 10 s rounds', line: 'Call up or down on any coin. Wrong call loses a life.', art: ART.ko, live: false },
  { key: 'bounty', title: 'Bounty', who: 'Open · one week', line: 'Put a price on your head. Beat it and take it.', art: ART.crown, live: false },
];
const STAKES = [5, 10, 20, 50];

export default function Arena() {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const [stake, setStake] = useState(20);
  const m = MODES[i];
  const go = (d: number) => { Haptics.selectionAsync(); setI((x) => (x + d + MODES.length) % MODES.length); };
  const swipe = Gesture.Pan().activeOffsetX([-24, 24]).onEnd((e) => { runOnJS(go)(e.translationX < 0 ? 1 : -1); });
  const battle = () => {
    if (!m.live) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push({ pathname: '/duel/amount', params: { id: 'SOL', stake: String(stake) } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8, paddingHorizontal: S.gutter }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="title">Arena</Txt>
        <Row style={{ gap: 8 }}>
          <View style={{ backgroundColor: C.upBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}><Txt v="small" color={C.up} style={{ fontSize: 11.5 }}>Practice open</Txt></View>
          <Btn title="Ranks" kind="ghost" h={32} onPress={() => router.push('/leaderboard')} />
        </Row>
      </Row>

      <GestureDetector gesture={swipe}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <Txt v="small" style={{ fontFamily: F.semi, letterSpacing: 0.8, fontSize: 11 }}>MODE</Txt>
            <Row style={{ gap: 14, marginTop: 6 }}>
              <Pressable onPress={() => go(-1)} hitSlop={12}><Text style={{ color: C.dim, fontSize: 26, fontFamily: F.semi }}>‹</Text></Pressable>
              <Txt v="title" style={{ minWidth: 200, textAlign: 'center' }}>{m.title}</Txt>
              <Pressable onPress={() => go(1)} hitSlop={12}><Text style={{ color: C.dim, fontSize: 26, fontFamily: F.semi }}>›</Text></Pressable>
            </Row>
            <Txt v="small" style={{ marginTop: 4 }}>{m.who}</Txt>
          </View>
          <Animated.View key={m.key} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={{ alignItems: 'center', marginTop: 22 }}>
            <Art src={m.art} size={220} radius={44} />
            <Txt v="small" color="#B9B9C2" style={{ textAlign: 'center', marginTop: 16, lineHeight: 19, maxWidth: 300 }}>{m.line}</Txt>
          </Animated.View>
          <Row style={{ gap: 6, justifyContent: 'center', marginTop: 16 }}>
            {MODES.map((x, k) => <View key={x.key} style={{ width: k === i ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? C.ink : '#333' }} />)}
          </Row>
        </View>
      </GestureDetector>

      <Row style={{ gap: 8, justifyContent: 'center', marginBottom: 14 }}>
        {STAKES.map((v) => (
          <Btn key={v} title={`$${v}`} h={36} kind={stake === v ? 'white' : 'ghost'} style={{ flex: 1 }} onPress={() => setStake(v)} />
        ))}
      </Row>
      <Btn
        title={m.live ? 'Battle' : 'Coming soon'}
        h={60}
        disabled={!m.live}
        icon={<Swords size={20} color="#fff" />}
        style={{ borderRadius: 18, marginBottom: 14 }}
        onPress={battle}
      />
    </View>
  );
}
