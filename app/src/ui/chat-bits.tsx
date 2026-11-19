// What a chat message can be besides a text bubble:
//   - a sticker: no bubble, the clay art at full size; a new one pops in with a spring; tap it to open its pack
//   - 1 to 3 emoji alone: shown big without a bubble (Telegram style); a new one bounces in, tap it for a burst
// plus the pack sheet that opens from a sticker (every sticker in it is one tap to send).
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { packOf, rememberSticker, type Sticker } from '@/stickers';
import { Txt } from './kit';
import { Sheet } from './sheet';
import { C, FONT } from './tokens';

const EMOJI_FONT = Platform.select({ web: { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }, default: {} });

/** True for messages that arrived after this screen opened, so only those animate in. */
export function useFreshSince() {
  const t0 = useRef(Date.now() - 1500).current;
  return (atMs: number) => atMs >= t0;
}

export function StickerMsg({ s, fresh, mine, onPress, size }: { s: Sticker; fresh?: boolean; mine?: boolean; onPress?: () => void; size?: number }) {
  const { width } = useWindowDimensions();
  const px = size ?? (width >= 900 ? 176 : 152);
  const sc = useSharedValue(fresh ? 0.3 : 1), rot = useSharedValue(fresh ? (mine ? 14 : -14) : 0);
  useEffect(() => {
    if (!fresh) return;
    sc.value = withSpring(1, { damping: 9, stiffness: 190, mass: 0.8 });
    rot.value = withSpring(0, { damping: 7, stiffness: 140 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }, { rotate: `${rot.value}deg` }] }));
  const press = () => {
    sc.value = withSequence(withTiming(0.88, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 260 }));
    onPress?.();
  };
  return (
    <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={`${s.word} sticker`}>
      <Animated.View style={[{ width: px, height: px }, st]}>
        <Image source={s.src} style={{ width: px, height: px }} contentFit="contain" />
      </Animated.View>
    </Pressable>
  );
}

const SIZES = [0, 58, 46, 38];
/** 1–3 emoji shown big. A new one bounces in; a tap sends a little burst of it flying up. */
export function JumboEmoji({ text, n, fresh }: { text: string; n: number; fresh?: boolean }) {
  const sc = useSharedValue(fresh ? 0.2 : 1);
  const [bursts, setBursts] = useState<number[]>([]);
  const id = useRef(0);
  useEffect(() => {
    if (!fresh) return;
    sc.value = withSequence(withSpring(1.25, { damping: 6, stiffness: 240 }), withSpring(1, { damping: 9, stiffness: 200 }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  const fs = SIZES[n] ?? 38;
  const tap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sc.value = withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 220 }));
    const k = ++id.current;
    setBursts((b) => [...b.slice(-2), k]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== k)), 1400);
  };
  return (
    <Pressable onPress={tap} accessibilityRole="button" accessibilityLabel={text}>
      <Animated.View style={st}>
        <Text style={{ fontSize: fs, lineHeight: Math.round(fs * 1.22), ...EMOJI_FONT }} allowFontScaling={false}>{text}</Text>
      </Animated.View>
      {bursts.map((b) => <Burst key={b} text={text} size={Math.round(fs * 0.5)} />)}
    </Pressable>
  );
}
function Burst({ text, size }: { text: string; size: number }) {
  const bits = useRef(Array.from({ length: 7 }, (_, i) => ({ a: -Math.PI / 2 + (i - 3) * 0.32 + (Math.random() - 0.5) * 0.2, d: 70 + Math.random() * 60, r: (Math.random() - 0.5) * 70 }))).current;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      {bits.map((b, i) => <Bit key={i} text={text} size={size} {...b} delay={i * 25} />)}
    </View>
  );
}
function Bit({ text, size, a, d, r, delay }: { text: string; size: number; a: number; d: number; r: number; delay: number }) {
  const k = useSharedValue(0);
  useEffect(() => { k.value = withDelay(delay, withTiming(1, { duration: 1050, easing: Easing.out(Easing.cubic) })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({
    opacity: k.value < 0.7 ? 1 : 1 - (k.value - 0.7) / 0.3,
    transform: [{ translateX: Math.cos(a) * d * k.value }, { translateY: Math.sin(a) * d * k.value + 30 * k.value * k.value }, { scale: 0.5 + k.value * 0.7 }, { rotate: `${r * k.value}deg` }],
  }));
  return <Animated.Text style={[{ position: 'absolute', fontSize: size, ...EMOJI_FONT }, st]} allowFontScaling={false}>{text}</Animated.Text>;
}

/** A sticker pack in a drawer: every sticker one tap to send (when the chat allows sending). */
export function PackSheet({ packId, onClose, onSend }: { packId: string | null; onClose: () => void; onSend?: (s: Sticker) => void }) {
  const p = packId ? packOf(packId) : undefined;
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 560) - 36;
  const cols = inner >= 470 ? 5 : 4;
  const cell = Math.floor(inner / cols);
  return (
    <Sheet open={!!p} onClose={onClose} title={p?.name} sub={p ? `${p.stickers.length} stickers · ${p.blurb}` : undefined}>
      {p ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
            {p.stickers.map((s) => (
              <Pressable key={s.id} disabled={!onSend} onPress={() => { rememberSticker(s.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSend?.(s); onClose(); }}
                accessibilityRole="button" accessibilityLabel={`Send ${s.word} sticker`}
                style={({ pressed }) => ({ width: cell, height: cell, padding: 5, transform: [{ scale: pressed ? 0.88 : 1 }] })}>
                <Image source={s.src} style={{ flex: 1 }} contentFit="contain" />
              </Pressable>
            ))}
          </View>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 8, marginBottom: 4 }}>{onSend ? 'Tap a sticker to send it.' : 'Stickers live in the sticker keyboard of every chat.'}</Txt>
        </>
      ) : <Text style={{ ...FONT.regular, color: C.muted }}> </Text>}
    </Sheet>
  );
}
