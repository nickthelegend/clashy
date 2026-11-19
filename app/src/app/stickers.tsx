// Sticker packs: every pack that ships in the chat keyboard, with a peek at each. Tap a pack to see all of it.
// Route: /stickers (from Settings → Social). The packs themselves live in src/stickers (generated catalogue).
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PACKS, stickerById } from '@/stickers';
import { PackSheet } from '@/ui/chat-bits';
import { BackBtn, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, FONT, S } from '@/ui/tokens';

const HERO = ['clashy/01', 'bonk/01', 'solana/01'];

export default function StickerPacks() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const [open, setOpen] = useState<string | null>(null);
  const total = PACKS.reduce((n, p) => n + p.stickers.length, 0);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings' as Href));
  const hero = HERO.map((id) => stickerById(id)).filter((s) => !!s);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={[{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }, col]}>
        <Row style={{ gap: 10 }}>
          <BackBtn onPress={back} />
          <Txt v="label" style={{ fontSize: 17, ...FONT.bold }}>Stickers</Txt>
        </Row>
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <View style={{ flexDirection: 'row', height: 150, alignItems: 'center' }}>
            {hero.map((s, i) => (
              <Animated.View key={s!.id} entering={FadeInDown.delay(80 + i * 90).springify().damping(13)}
                style={{ marginHorizontal: -14, transform: [{ rotate: `${(i - 1) * 11}deg` }, { translateY: i === 1 ? -10 : 6 }], zIndex: i === 1 ? 2 : 1 }}>
                <Image source={s!.src} style={{ width: 132, height: 132 }} contentFit="contain" />
              </Animated.View>
            ))}
          </View>
          <Txt v="title" style={{ ...FONT.display, fontSize: 26, marginTop: 6, textAlign: 'center' }}>{PACKS.length} packs, {total} stickers</Txt>
          <Txt v="small" style={{ marginTop: 6, textAlign: 'center', lineHeight: 19, maxWidth: 340 }}>
            In every DM and squad chat, and as live taunts in a clash. Tap the sticker key next to the message field.
          </Txt>
        </View>
        <View style={{ marginTop: 22, gap: 10 }}>
          {PACKS.map((p, i) => (
            <Animated.View key={p.id} entering={FadeInDown.delay(120 + i * 40).duration(320)}>
              <Pressable onPress={() => setOpen(p.id)} accessibilityRole="button" accessibilityLabel={`${p.name} pack, ${p.stickers.length} stickers`}
                style={({ pressed }) => ({ backgroundColor: pressed ? '#16161C' : '#0F0F14', borderRadius: 22, padding: 12, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
                <Row style={{ gap: 12 }}>
                  <Image source={p.cover} style={{ width: 54, height: 54 }} contentFit="contain" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label" lines={1} style={{ fontSize: 16.5, ...FONT.semi }}>{p.name}</Txt>
                    <Txt v="small" lines={1} style={{ marginTop: 2 }}>{p.stickers.length} stickers · {p.blurb}</Txt>
                  </View>
                  <Txt v="label" color={C.dim} style={{ fontSize: 20 }}>›</Txt>
                </Row>
                <View style={{ flexDirection: 'row', marginTop: 8, justifyContent: 'space-between' }}>
                  {p.stickers.slice(1, 6).map((s) => <Image key={s.id} source={s.src} style={{ width: '19%', aspectRatio: 1 }} contentFit="contain" />)}
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </View>
        <Txt v="small" style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: C.dim }}>Art generated with ChatGPT in Clashy&apos;s clay style. Project and coin logos belong to their owners.</Txt>
      </ScrollView>
      <PackSheet packId={open} onClose={() => setOpen(null)} />
    </View>
  );
}
