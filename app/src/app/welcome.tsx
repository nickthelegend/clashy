// Onboarding: three slides on the money journey (spend and round up, save into stocks, call it with your crew),
// then sign in, then pick your name and clay avatar. Joining creates the player, the profile and the Stash on chain
// (sponsored). Home sends anyone signed in without a name back here (?step=name).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useChain } from '@/chain/useChain';
import { ClayLoop, type ClayName } from '@/ui/clay';
import { AVATARS, Btn, ErrorLine, Row, Txt, Wordmark } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

export const ONBOARDED_KEY = 'clashy:onboarded';

const SLIDES: { loop: ClayName; title: string; body: string }[] = [
  { loop: 'onSpend', title: 'Spend. Save the change.', body: 'Pay anyone in USDC and round up: the change lands in your Stash, in the same transaction.' },
  { loop: 'onInvest', title: 'Savings into stocks.', body: 'Buy real tokenized stocks like NVIDIA, Apple and the S&P 500 from your Stash, from $5. The shares are yours.' },
  { loop: 'onSquad', title: 'Call it with your crew.', body: 'Post calls with your real position, duel friends for 5 USDC, and climb the Weekly Cup with your clan.' },
];

function NameStep({ onDone }: { onDone: () => void }) {
  const chain = useChain();
  const { wallet, me, hasProfile, busy, err, sponsor } = chain;
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(0);
  useEffect(() => { if (me && hasProfile) onDone(); }, [me?.toBase58(), hasProfile]); // eslint-disable-line react-hooks/exhaustive-deps
  if (wallet.status === 'out') {
    return (
      <View style={{ alignItems: 'center', paddingHorizontal: S.gutter }}>
        <ClayLoop name="stash" size={200} style={{ borderRadius: 32 }} />
        <Txt v="title" style={{ marginTop: 20, fontSize: 30, textAlign: 'center' }}>Sign in</Txt>
        <Txt v="body" color="#B9B9C2" style={{ marginTop: 8, textAlign: 'center', maxWidth: 320 }}>Email or Google. You get a wallet that holds USDC only: no seed phrase, no SOL. Every fee is on Clashy.</Txt>
        <Btn title="Sign in" kind="white" style={{ marginTop: 22, alignSelf: 'stretch' }} onPress={() => wallet.login?.()} />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: S.gutter, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center' }}>
        <Image source={AVATARS[avatar]} style={{ width: 120, height: 120, borderRadius: 60 }} contentFit="cover" />
        <Txt v="title" style={{ marginTop: 16, fontSize: 30 }}>Pick your name</Txt>
        <Txt v="body" color="#B9B9C2" style={{ marginTop: 6, textAlign: 'center' }}>It's on your calls, duels and clan. Yours alone, on chain.</Txt>
      </View>
      <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: C.s1, borderRadius: 14, paddingHorizontal: 14, height: 52 }}>
        <Txt v="label" color={C.muted} style={{ fontSize: 18 }}>@</Txt>
        <TextInput value={name} onChangeText={(t) => setName(t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16))} placeholder="your_name" placeholderTextColor={C.dim}
          autoCapitalize="none" autoCorrect={false} autoFocus style={{ flex: 1, color: C.ink, fontFamily: F.semi, fontSize: 18, marginLeft: 4 }} />
        <Txt v="small" style={{ fontSize: 12 }}>{name.length}/16</Txt>
      </View>
      <Txt v="small" style={{ marginTop: 14, marginBottom: 8 }}>Pick your clay</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {AVATARS.map((src, i) => (
          <Pressable key={i} onPress={() => { Haptics.selectionAsync(); setAvatar(i); }} style={{ borderRadius: 28, borderWidth: 3, borderColor: avatar === i ? C.brand : 'transparent' }}>
            <Image source={src} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" />
          </Pressable>
        ))}
      </View>
      {err ? <ErrorLine msg={err} /> : null}
      <Btn title={busy === 'join' ? 'Setting you up…' : !sponsor ? 'Connecting…' : name.length < 3 ? 'At least 3 characters' : `Join as @${name}`} kind="white" style={{ marginTop: 20 }}
        disabled={!!busy || name.length < 3 || !sponsor || !me} onPress={chain.join(name, avatar)} />
      <Txt v="small" style={{ marginTop: 10, textAlign: 'center' }}>Creates your player, your name and your Stash on Solana. Clashy pays the fees.</Txt>
    </ScrollView>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(520);
  const { width } = useWindowDimensions();
  const w = Math.min(width, 520);
  const params = useLocalSearchParams<{ step?: string }>();
  const [i, setI] = useState(0);
  const [naming, setNaming] = useState(params.step === 'name');
  const list = useRef<FlatList>(null);
  const finish = async () => {
    try { await AsyncStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* storage unavailable: show again next time */ }
    router.replace('/');
  };
  const next = () => {
    Haptics.selectionAsync();
    if (i < SLIDES.length - 1) { list.current?.scrollToIndex({ index: i + 1 }); setI(i + 1); } else setNaming(true);
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 14 }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: S.gutter, marginBottom: 10 }}>
        <Wordmark height={22} />
        {naming ? null : <Pressable onPress={() => setNaming(true)} hitSlop={10}><Txt v="small" color={C.ink}>Skip</Txt></Pressable>}
      </Row>
      {naming ? <View style={{ flex: 1, justifyContent: 'center' }}><NameStep onDone={finish} /></View> : (
        <>
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
                <ClayLoop name={item.loop} width={Math.min(w - 80, 270)} height={Math.min(w - 80, 270) * (16 / 9)} cover style={{ borderRadius: 32 }} />
                <Txt v="title" style={{ marginTop: 24, fontSize: 30, textAlign: 'center' }}>{item.title}</Txt>
                <Txt v="body" color="#B9B9C2" style={{ marginTop: 10, textAlign: 'center', lineHeight: 21, maxWidth: 330 }}>{item.body}</Txt>
              </View>
            )}
          />
          <Row style={{ gap: 6, justifyContent: 'center', marginBottom: 18 }}>
            {SLIDES.map((s, k) => <View key={s.title} style={{ width: k === i ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? C.ink : '#333' }} />)}
          </Row>
          <View style={{ paddingHorizontal: S.gutter }}>
            <Btn title={i < SLIDES.length - 1 ? 'Next' : 'Get started'} kind="white" onPress={next} />
          </View>
        </>
      )}
    </View>
  );
}
