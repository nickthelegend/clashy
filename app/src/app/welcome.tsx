import { Image } from 'expo-image';
// First-open onboarding: three swipeable slides with the sticker art, then into the app. Shown once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ART, Art, Btn, Row, Txt, Wordmark } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, S } from '@/ui/tokens';

export const ONBOARDED_KEY = 'clashy:onboarded';

const SLIDES = [
  { art: ART.onboard1, title: 'Duel anyone.', body: 'Duel a rival for 5 USDC. One coin is rolled for both of you. Long or short, best % in 60 seconds takes the pot.' },
  { art: ART.onboard2, title: 'Play in USDC. No SOL.', body: 'Sign in with email: you get a wallet that holds USDC, and Clashy pays every network fee. Or practice free on live prices.' },
  { art: ART.onboard3, title: 'Fight with your clan.', body: 'Pool USDC in a clan chest, vote on trades, and take on other clans in wars for their stake.' },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(520);
  const { width } = useWindowDimensions();
  const w = Math.min(width, 520);
  const [i, setI] = useState(0);
  const list = useRef<FlatList>(null);
  const finish = async () => {
    try { await AsyncStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* storage unavailable: show again next time */ }
    router.replace('/');
  };
  const next = () => {
    Haptics.selectionAsync();
    if (i < SLIDES.length - 1) { list.current?.scrollToIndex({ index: i + 1 }); setI(i + 1); } else finish();
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 14 }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: S.gutter }}>
        <Wordmark height={22} />
        <Pressable onPress={finish} hitSlop={10}><Txt v="small" color={C.ink}>Skip</Txt></Pressable>
      </Row>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / w))}
        keyExtractor={(s) => s.title}
        getItemLayout={(_, k) => ({ length: w, offset: w * k, index: k })}
        renderItem={({ item }) => (
          <View style={{ width: w, paddingHorizontal: S.gutter, justifyContent: 'center', alignItems: 'center' }}>
            <Image source={item.art} style={{ width: Math.min(w - 60, 280), height: Math.min(w - 60, 280) * 1.5, borderRadius: 32 }} contentFit="cover" />
            <Txt v="title" style={{ marginTop: 28, fontSize: 32, textAlign: 'center' }}>{item.title}</Txt>
            <Txt v="body" color="#B9B9C2" style={{ marginTop: 10, textAlign: 'center', lineHeight: 21, maxWidth: 320 }}>{item.body}</Txt>
          </View>
        )}
      />
      <Row style={{ gap: 6, justifyContent: 'center', marginBottom: 18 }}>
        {SLIDES.map((s, k) => <View key={s.title} style={{ width: k === i ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? C.ink : '#333' }} />)}
      </Row>
      <View style={{ paddingHorizontal: S.gutter }}>
        <Btn title={i < SLIDES.length - 1 ? 'Next' : 'Get started'} kind="white" onPress={next} />
      </View>
    </View>
  );
}
