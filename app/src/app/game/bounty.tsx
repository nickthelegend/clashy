// Bounty (style B5 price-tag board + B1 wanted poster).
// Board: open bounties sorted by size. They need the program, so the board shows its setup state.
// Poster: your own wanted poster, built from your real practice bests stored on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useEffect as useFx } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ART, Avatar, BackBtn, Btn, Pending, Row, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

/** The wanted poster swings gently from its pin. */
function Swing({ children }: { children: React.ReactNode }) {
  const r = useSharedValue(-6);
  useFx(() => { r.value = withRepeat(withSequence(withTiming(2.5, { duration: 1400, easing: Easing.inOut(Easing.sin) }), withTiming(-2.5, { duration: 1400, easing: Easing.inOut(Easing.sin) })), -1, true); }, [r]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: -180 }, { rotate: `${r.value}deg` }, { translateY: 180 }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}
const PAPER = '#EADBB8', INK = '#2B1D0E', RED = '#8A1C0E';

function Poster({ line, royale }: { line: number | null; royale: number | null }) {
  const claim = line !== null ? `${line}% Draw-the-line match` : royale !== null ? `${royale} Royale rounds survived` : 'No practice record yet';
  return (
    <View style={{ backgroundColor: PAPER, borderRadius: 10, padding: 18, alignItems: 'center', transform: [{ rotate: '-1.2deg' }], borderWidth: 6, borderColor: '#D7C296' }}>
      <Text style={{ fontFamily: F.bold, fontSize: 44, letterSpacing: 4, color: INK }}>WANTED</Text>
      <Text style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 4, color: INK, marginTop: -2 }}>BEAT MY WEEK</Text>
      <View style={{ marginTop: 14, borderWidth: 4, borderColor: INK, borderRadius: 8, overflow: 'hidden' }}><Avatar name="you" size={180} /></View>
      <Text style={{ fontFamily: F.bold, fontSize: 22, color: INK, marginTop: 12 }}>You</Text>
      <Text style={{ fontFamily: F.semi, fontSize: 13, color: INK, opacity: 0.75, marginTop: 2 }}>Practice best: {claim}</Text>
      <Text style={{ fontFamily: F.bold, fontSize: 40, color: RED, marginTop: 8 }}>$ —</Text>
      <Text style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 3, color: INK }}>PREVIEW</Text>
    </View>
  );
}

export default function Bounty() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(980);
  const { desk } = useLayout();
  const [line, setLine] = useState<number | null>(null);
  const [royale, setRoyale] = useState<number | null>(null);
  useEffect(() => {
    AsyncStorage.multiGet(['clashy:line:best', 'clashy:royale:best']).then(([[, a], [, b]]) => { if (a) setLine(Number(a)); if (b) setRoyale(Number(b)); }).catch(() => {});
  }, []);

  const poster = (
    <View style={{ gap: 12, width: desk ? 360 : undefined }}>
      <Swing><Poster line={line} royale={royale} /></Swing>
      <Txt v="small" style={{ textAlign: 'center' }}>Bounties are not built yet. This is what yours would look like from your practice records.</Txt>
      {line === null && royale === null ? <Btn title="Set a practice record" kind="ghost" onPress={() => router.push('/game/line')} /> : null}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Bounty</Txt><Txt v="small">Put a price on your head · beat theirs and take it</Txt></View>
      </Row>
      <Image source={ART.bannerBounty} style={{ width: '100%', aspectRatio: 16 / 9, maxHeight: 260, borderRadius: 20, marginBottom: 12 }} contentFit="cover" />
      <Pending art={ART.tileBounty} title="Preview: bounties are not built yet" body="A bounty would escrow a reward on your own week for hunters to try and beat. Below is what your poster would show, from your practice records." />
      <View style={{ marginTop: 12, alignItems: 'center' }}>{poster}</View>
    </ScrollView>
  );
}
