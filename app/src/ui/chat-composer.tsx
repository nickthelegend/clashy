// The chat composer every chat uses (DMs, squad channels), WhatsApp style:
//   [ 😊  message field that grows with you          📎 ]  ( ➤ )
//   - the left key swaps the system keyboard for the emoji + sticker keyboard (and back); on desktop it pops over
//   - 📎 opens a sheet of round shortcuts: Clash, Stickers, Emoji, plus whatever the chat adds (profile, squad page)
//   - the round button sends; with nothing typed it's a quick 🔥 (Messenger's thumbs-up idea), and it morphs into the
//     paper plane as you type
//   - replying shows the quoted message inside the field, with ✕ to drop it
//   - typing one emoji or a word a sticker answers to ("gm", "long", 🚀) floats matching stickers above the field
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, ZoomIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backspace, rememberSticker, suggestStickers, type Sticker } from '@/stickers';
import type { ReplyTo } from './chat-thread';
import { Clip, KeyboardI, Plane, Smile, StickerI } from './icons';
import { useLayout } from './layout';
import { StickerKeyboard, type KbTab } from './sticker-keyboard';
import { C, F, FONT } from './tokens';

export type AttachItem = { key: string; label: string; color: string; icon: ReactNode; onPress: () => void };
const BAR = '#0D0D12';
const FIELD = '#1A1A21';
const EMOJI_FONT = Platform.select({ web: { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }, default: {} });

export function ChatComposer({ value, onChange, onSend, onSticker, onQuick, quick = '🔥', placeholder, maxLength = 1000, busy, maxWidth, reply, onCancelReply, attach = [] }: {
  value: string; onChange: (v: string) => void; onSend: () => void; onSticker: (s: Sticker) => void;
  /** Sends the quick emoji when nothing is typed (the round button's empty state). */
  onQuick?: () => void; quick?: string;
  placeholder: string; maxLength?: number; busy?: boolean; maxWidth?: number;
  reply?: ReplyTo | null; onCancelReply?: () => void;
  /** Extra shortcuts in the 📎 sheet (Stickers and Emoji are always there). */
  attach?: AttachItem[];
}) {
  const insets = useSafeAreaInsets();
  const { desk } = useLayout();
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<KbTab>('stickers');
  const [sheet, setSheet] = useState(false);
  const [h, setH] = useState(44);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const sel = useRef({ start: 0, end: 0 });
  useEffect(() => { if (!value) { sel.current = { start: 0, end: 0 }; setH(44); } }, [value]);
  useEffect(() => { if (reply && !panel) input.current?.focus(); }, [reply]); // eslint-disable-line react-hooks/exhaustive-deps
  const tips = useMemo(() => (busy ? [] : suggestStickers(value)), [value, busy]);
  const has = !!value.trim();

  const morph = useSharedValue(0);
  useEffect(() => { morph.value = withSpring(has ? 1 : 0, { damping: 13, stiffness: 260 }); }, [has, morph]);
  const planeSt = useAnimatedStyle(() => ({ opacity: morph.value, transform: [{ scale: 0.4 + 0.6 * morph.value }, { rotate: `${(1 - morph.value) * -60}deg` }] }));
  const quickSt = useAnimatedStyle(() => ({ opacity: 1 - morph.value, transform: [{ scale: 1 - 0.6 * morph.value }] }));

  const open = (t: KbTab) => { setTab(t); Keyboard.dismiss(); setPanel(true); };
  const toggle = () => {
    Haptics.selectionAsync();
    if (panel) { setPanel(false); if (!desk) input.current?.focus(); }
    else open(tab);
  };
  const insert = (e: string) => {
    const { start, end } = sel.current;
    const s = Math.min(start, value.length), en = Math.min(end, value.length);
    const next = (value.slice(0, s) + e + value.slice(en)).slice(0, maxLength);
    sel.current = { start: s + e.length, end: s + e.length };
    onChange(next);
  };
  const del = () => { const at = sel.current.end || value.length; const next = backspace(value.slice(0, at)) + value.slice(at); sel.current = { start: next.length, end: next.length }; onChange(next); };
  const sticker = (s: Sticker) => { rememberSticker(s.id); onSticker(s); if (desk) setPanel(false); };
  const sendTip = (s: Sticker) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); rememberSticker(s.id); onChange(''); onSticker(s); };
  const press = () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (has) onSend(); else onQuick?.();
  };

  // Escape closes the desktop popover
  useEffect(() => {
    if (Platform.OS !== 'web' || !panel) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [panel]);

  const kb = <StickerKeyboard height={desk ? 430 : 300} tab={tab} onTab={setTab} onSticker={sticker} onEmoji={insert} onBackspace={del} />;
  const items: AttachItem[] = [
    ...attach,
    { key: 'stickers', label: 'Stickers', color: '#8E7CF0', icon: <StickerI size={24} color="#fff" />, onPress: () => open('stickers') },
    { key: 'emoji', label: 'Emoji', color: '#F2B320', icon: <Smile size={24} color="#fff" />, onPress: () => open('emoji') },
  ];
  const canQuick = !!onQuick;

  return (
    <View style={{ backgroundColor: panel && !desk ? BAR : 'transparent' }}>
      {tips.length ? (
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(140)} style={{ paddingHorizontal: 10, paddingBottom: 4, width: '100%', maxWidth, alignSelf: 'center' }}>
          <View style={{ backgroundColor: 'rgba(22,22,28,0.96)', borderRadius: 20, paddingVertical: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' } as object}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingHorizontal: 4 }}>
              {tips.map((s) => (
                <Pressable key={s.id} onPress={() => sendTip(s)} accessibilityRole="button" accessibilityLabel={`Send ${s.word} sticker`}
                  style={({ pressed }) => ({ width: 70, height: 70, padding: 3, transform: [{ scale: pressed ? 0.86 : 1 }] })}>
                  <Image source={s.src} style={{ flex: 1 }} contentFit="contain" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, paddingHorizontal: 8, paddingTop: 6, paddingBottom: panel && !desk ? 8 : insets.bottom + 8, width: '100%', maxWidth, alignSelf: 'center' }}>
        <View style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: FIELD, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.35)' } as object}>
          {reply ? (
            <Animated.View entering={FadeInDown.duration(160)} style={{ margin: 5, marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: '#24232D', borderLeftWidth: 4, borderLeftColor: C.brand, paddingVertical: 7, paddingLeft: 10, paddingRight: 6 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 12.5, color: C.brandSoft }}>Replying to {reply.name}</Text>
                <Text numberOfLines={1} style={{ ...FONT.regular, fontSize: 13, color: C.muted, marginTop: 1 }}>{reply.text}</Text>
              </View>
              {reply.sticker ? <Image source={reply.sticker.src} style={{ width: 34, height: 34 }} contentFit="contain" /> : null}
              <Pressable onPress={onCancelReply} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel reply"
                style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#33323E', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...FONT.bold, fontSize: 13, color: C.ink, marginTop: -1 }}>✕</Text>
              </Pressable>
            </Animated.View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={panel ? 'Show keyboard' : 'Stickers and emoji'} hitSlop={4}
              style={({ pressed }) => ({ width: 44, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              {panel && !desk ? <KeyboardI size={23} color={C.brandSoft} /> : <Smile size={23} color={panel ? C.brandSoft : '#9C9CA8'} />}
            </Pressable>
            <TextInput ref={input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#74747F" maxLength={maxLength} multiline numberOfLines={1}
              onFocus={() => { if (!desk) setPanel(false); }}
              onSelectionChange={(e) => { sel.current = e.nativeEvent.selection; }}
              onContentSizeChange={(e) => setH(Math.max(44, Math.min(132, Math.ceil(e.nativeEvent.contentSize.height + (Platform.OS === 'web' ? 0 : 24)))))}
              onKeyPress={(e) => {
                // web: Enter sends, Shift+Enter makes a new line
                const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean; isComposing?: boolean };
                if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey && !ne.isComposing) { (e as unknown as { preventDefault: () => void }).preventDefault(); if (has) onSend(); }
              }}
              accessibilityLabel={placeholder}
              style={{ flex: 1, minWidth: 0, height: Platform.OS === 'web' ? h : undefined, maxHeight: 132, color: C.ink, fontFamily: F.regular, fontSize: 16, lineHeight: 21, paddingTop: 12, paddingBottom: 11, paddingHorizontal: 0, outlineStyle: 'none' } as object} />
            <Pressable onPress={() => { Haptics.selectionAsync(); Keyboard.dismiss(); setSheet(true); }} accessibilityRole="button" accessibilityLabel="Attach" hitSlop={4}
              style={({ pressed }) => ({ width: 44, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Clip size={21} color="#9C9CA8" />
            </Pressable>
          </View>
        </View>
        <Pressable onPress={press} disabled={busy || (!has && !canQuick)} accessibilityRole="button" accessibilityLabel={has ? 'Send' : `Send ${quick}`}
          style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.88 : 1 }], boxShadow: '0 4px 14px rgba(171,159,242,0.35)' } as object)}>
          <Animated.View style={[{ position: 'absolute' }, quickSt]}><Text style={{ fontSize: 22, ...EMOJI_FONT }} allowFontScaling={false}>{quick}</Text></Animated.View>
          <Animated.View style={[{ position: 'absolute', marginLeft: 3 }, planeSt]}><Plane size={21} color={C.onBrand} /></Animated.View>
        </Pressable>
        {panel && desk ? (
          // desktop: a popover over the chat, its corner above the emoji key
          <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOutDown.duration(120)}
            style={{ position: 'absolute', bottom: '100%', left: 8, width: 412, maxWidth: '96%', marginBottom: 6, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#26252F', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' } as object}>
            {kb}
          </Animated.View>
        ) : null}
      </View>
      {panel && !desk ? <View style={{ paddingBottom: insets.bottom, backgroundColor: BAR }}>{kb}</View> : null}
      <AttachSheet open={sheet} items={items} onClose={() => setSheet(false)} bottom={insets.bottom + 70} maxWidth={maxWidth} />
    </View>
  );
}

/** WhatsApp's attach sheet: a card of round colour shortcuts above the field, over a blurred chat. */
function AttachSheet({ open, items, onClose, bottom, maxWidth }: { open: boolean; items: AttachItem[]; onClose: () => void; bottom: number; maxWidth?: number }) {
  if (!open) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} onPress={onClose} accessibilityLabel="Close" />
        <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: bottom, paddingHorizontal: 10, width: '100%', maxWidth: maxWidth ?? 560, alignSelf: 'center' }}>
          <Animated.View entering={FadeInDown.springify().damping(16).stiffness(200)}
            style={{ backgroundColor: '#17161E', borderRadius: 26, paddingVertical: 18, paddingHorizontal: 8, flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, boxShadow: '0 16px 40px rgba(0,0,0,0.55)' } as object}>
            {items.map((it, i) => (
              <Animated.View key={it.key} entering={ZoomIn.delay(30 + i * 35).springify().damping(12)} style={{ width: '25%', alignItems: 'center' }}>
                <Pressable onPress={() => { Haptics.selectionAsync(); onClose(); it.onPress(); }} accessibilityRole="button" accessibilityLabel={it.label}
                  style={({ pressed }) => ({ alignItems: 'center', gap: 7, transform: [{ scale: pressed ? 0.9 : 1 }] })}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: it.color, alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 16px ${it.color}55` } as object}>{it.icon}</View>
                  <Text numberOfLines={1} style={{ ...FONT.medium, fontSize: 12.5, color: '#D4D4DC' }}>{it.label}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}
