// The chat composer every chat uses (DMs, squad channels). A pill with the message field and the sticker / keyboard
// toggle inside it, the send button beside it, and optional extras on the left (the squad Clash button).
//   - Tapping the toggle swaps the system keyboard for the emoji + sticker keyboard (and back), like Telegram.
//   - Typing one emoji or a word a sticker answers to ("gm", "long", 🚀) floats matching stickers above the field.
//   - On desktop the keyboard opens as a popover above the field instead of under it.
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backspace, rememberSticker, suggestStickers, type Sticker } from '@/stickers';
import { ArrowUp, KeyboardI, StickerI } from './icons';
import { useLayout } from './layout';
import { StickerKeyboard, type KbTab } from './sticker-keyboard';
import { C, F } from './tokens';

export function ChatComposer({ value, onChange, onSend, onSticker, placeholder, maxLength = 1000, busy, left, maxWidth }: {
  value: string; onChange: (v: string) => void; onSend: () => void; onSticker: (s: Sticker) => void;
  placeholder: string; maxLength?: number; busy?: boolean; left?: ReactNode; maxWidth?: number;
}) {
  const insets = useSafeAreaInsets();
  const { desk } = useLayout();
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<KbTab>('stickers');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const sel = useRef({ start: 0, end: 0 });
  useEffect(() => { if (!value) sel.current = { start: 0, end: 0 }; }, [value]);
  const tips = useMemo(() => (busy ? [] : suggestStickers(value)), [value, busy]);
  const has = !!value.trim();

  const toggle = () => {
    Haptics.selectionAsync();
    if (panel) { setPanel(false); if (!desk) input.current?.focus(); }
    else { Keyboard.dismiss(); setPanel(true); }
  };
  const insert = (e: string) => {
    const { start, end } = sel.current;
    const s = Math.min(start, value.length), en = Math.min(end, value.length);
    const next = (value.slice(0, s) + e + value.slice(en)).slice(0, maxLength);
    sel.current = { start: s + e.length, end: s + e.length };
    onChange(next);
  };
  const del = () => { const next = backspace(value.slice(0, sel.current.end || value.length)) + value.slice(sel.current.end || value.length); sel.current = { start: next.length, end: next.length }; onChange(next); };
  const sticker = (s: Sticker) => { rememberSticker(s.id); onSticker(s); if (desk) setPanel(false); };
  const sendTip = (s: Sticker) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); rememberSticker(s.id); onChange(''); onSticker(s); };

  // Escape closes the desktop popover
  useEffect(() => {
    if (Platform.OS !== 'web' || !panel) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [panel]);

  const kb = <StickerKeyboard height={desk ? 430 : 292} tab={tab} onTab={setTab} onSticker={sticker} onEmoji={insert} onBackspace={del} />;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: '#15151A', backgroundColor: C.bg }}>
      {tips.length ? (
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(140)} style={{ paddingHorizontal: 10, paddingTop: 8, width: '100%', maxWidth, alignSelf: 'center' }}>
          <View style={{ backgroundColor: '#121218', borderRadius: 18, paddingVertical: 4 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingHorizontal: 4 }}>
              {tips.map((s) => (
                <Pressable key={s.id} onPress={() => sendTip(s)} accessibilityRole="button" accessibilityLabel={`Send ${s.word} sticker`}
                  style={({ pressed }) => ({ width: 68, height: 68, padding: 3, transform: [{ scale: pressed ? 0.86 : 1 }] })}>
                  <Image source={s.src} style={{ flex: 1 }} contentFit="contain" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8, paddingBottom: panel && !desk ? 8 : insets.bottom + 10, width: '100%', maxWidth, alignSelf: 'center' }}>
        {left}
        <View style={{ flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: '#17171D', flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 16, paddingRight: 4 }}>
          <TextInput ref={input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.dim} maxLength={maxLength} multiline numberOfLines={1}
            onFocus={() => { if (!desk) setPanel(false); }}
            onSelectionChange={(e) => { sel.current = e.nativeEvent.selection; }}
            onKeyPress={(e) => {
              // web: Enter sends, Shift+Enter makes a new line
              const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean; preventDefault?: () => void };
              if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) { (e as unknown as { preventDefault: () => void }).preventDefault(); onSend(); }
            }}
            accessibilityLabel={placeholder}
            style={{ flex: 1, minWidth: 0, color: C.ink, fontFamily: F.regular, fontSize: 15.5, paddingTop: 12, paddingBottom: 12, maxHeight: 120, outlineStyle: 'none' } as object} />
          <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={panel ? 'Show keyboard' : 'Stickers and emoji'} hitSlop={6}
            style={({ pressed }) => ({ width: 38, height: 38, marginBottom: 4, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#24232C' : 'transparent' })}>
            {panel && !desk ? <KeyboardI size={22} color={C.brandSoft} /> : <StickerI size={22} color={panel ? C.brandSoft : C.muted} />}
          </Pressable>
        </View>
        <Pressable onPress={onSend} disabled={!has || busy} accessibilityRole="button" accessibilityLabel="Send"
          style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: has ? C.brand : '#1E1D25', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] })}>
          <ArrowUp size={20} color={has ? C.onBrand : C.dim} />
        </Pressable>
        {panel && desk ? (
          // desktop: a popover over the chat, its corner above the sticker key
          <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOutDown.duration(120)}
            style={{ position: 'absolute', bottom: '100%', right: 58, width: 412, maxWidth: '96%', marginBottom: 6, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#24232C', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' } as object}>
            {kb}
          </Animated.View>
        ) : null}
      </View>
      {panel && !desk ? <View style={{ paddingBottom: insets.bottom, backgroundColor: '#0D0D11' }}>{kb}</View> : null}
    </View>
  );
}
