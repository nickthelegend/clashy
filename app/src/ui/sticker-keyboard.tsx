// The emoji + sticker keyboard, Telegram style. It replaces the system keyboard under the chat composer on phones and
// pops up above it on desktop. Two tabs share one frame:
//   Stickers: a strip of pack covers on top (recent, favourites, then every pack), one long grid below with a header
//             per pack; scrolling lights up the current pack, tapping a cover jumps to it. Tap sends, long-press opens
//             a big preview (send, favourite). A search box at the top of the grid finds stickers by word, tag or emoji.
//   Emoji:    the same frame with a category strip; tap inserts into the message, ⌫ deletes the last emoji.
// The bottom bar switches tabs. Every pick is remembered per device (recents) so the next chat starts with them.
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import {
  EMOJI_GROUPS, PACKS, packOf, rememberEmoji, rememberSticker, searchEmoji, searchStickers, toggleFav, useStickerMemory, type Sticker,
} from '@/stickers';
import { Clock, Del, Search, Star, StickerI, Smile } from './icons';
import { Txt } from './kit';
import { C, F, FONT } from './tokens';

export type KbTab = 'emoji' | 'stickers';
const PANEL_BG = '#0D0D11';
const CHIP = '#1B1A22';
const HEAD_H = 34;

type ViewToken<T> = { item: T; isViewable: boolean };
type Row<T> = { type: 'head'; key: string; title: string; group: string } | { type: 'row'; key: string; items: T[]; group: string };
function rowsOf<T>(groups: { key: string; title: string; items: T[] }[], cols: number): Row<T>[] {
  const out: Row<T>[] = [];
  for (const g of groups) {
    if (!g.items.length) continue;
    out.push({ type: 'head', key: `h:${g.key}`, title: g.title, group: g.key });
    for (let i = 0; i < g.items.length; i += cols) out.push({ type: 'row', key: `r:${g.key}:${i}`, items: g.items.slice(i, i + cols), group: g.key });
  }
  return out;
}
/** Offsets for getItemLayout: heads and rows have fixed heights, so jumping to a section is exact. */
function layoutOf<T>(rows: Row<T>[], rowH: number, top: number) {
  const off: number[] = []; let y = top;
  for (const r of rows) { off.push(y); y += r.type === 'head' ? HEAD_H : rowH; }
  return (_: unknown, i: number) => ({ length: rows[i]?.type === 'head' ? HEAD_H : rowH, offset: off[i] ?? 0, index: i });
}

export function StickerKeyboard({ height, tab, onTab, onSticker, onEmoji, onBackspace, only }: {
  height: number; tab: KbTab; onTab: (t: KbTab) => void;
  onSticker: (s: Sticker) => void; onEmoji?: (e: string) => void; onBackspace?: () => void;
  /** Lock to one tab (the clash taunt picker shows stickers only). */
  only?: KbTab;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const t = only ?? tab;
  return (
    <View onLayout={onLayout} style={{ height, backgroundColor: PANEL_BG, borderTopWidth: 1, borderTopColor: '#1A1A20' }}>
      <View style={{ flex: 1 }}>
        {w > 0 ? (t === 'stickers' ? <StickerTab width={w} onSticker={onSticker} /> : <EmojiTab width={w} onEmoji={(e) => onEmoji?.(e)} />) : null}
      </View>
      {only ? null : (
        <View style={{ height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#18181E' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#17161D', borderRadius: 14, padding: 3, gap: 2 }}>
            {(['emoji', 'stickers'] as const).map((k) => (
              <Pressable key={k} onPress={() => { onTab(k); Haptics.selectionAsync(); }} accessibilityRole="tab" accessibilityState={{ selected: t === k }} accessibilityLabel={k === 'emoji' ? 'Emoji' : 'Stickers'}
                style={{ height: 32, paddingHorizontal: 16, borderRadius: 11, backgroundColor: t === k ? '#2A2836' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {k === 'emoji' ? <Smile size={16} color={t === k ? C.ink : C.muted} /> : <StickerI size={16} color={t === k ? C.ink : C.muted} />}
                <Txt v="small" color={t === k ? C.ink : C.muted} style={{ ...FONT.semi, fontSize: 13 }}>{k === 'emoji' ? 'Emoji' : 'Stickers'}</Txt>
              </Pressable>
            ))}
          </View>
          {t === 'emoji' && onBackspace ? (
            <Pressable onPress={() => { onBackspace(); Haptics.selectionAsync(); }} accessibilityRole="button" accessibilityLabel="Delete"
              style={({ pressed }) => ({ position: 'absolute', right: 10, width: 44, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#24232C' : 'transparent' })}>
              <Del size={21} color={C.muted} />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ height: 38, marginHorizontal: 8, marginTop: 8, marginBottom: 4, borderRadius: 12, backgroundColor: CHIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 8 }}>
      <Search size={16} color={C.dim} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.dim} autoCorrect={false} autoCapitalize="none" accessibilityLabel={placeholder}
        style={{ flex: 1, minWidth: 0, color: C.ink, fontFamily: F.regular, fontSize: 14.5, height: 36, outlineStyle: 'none' } as object} />
      {value ? <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search" hitSlop={8}><Txt v="small" color={C.muted} style={{ fontSize: 13 }}>Clear</Txt></Pressable> : null}
    </View>
  );
}

function Strip({ children }: { children: ReactNode }) {
  return (
    <View style={{ height: 50, borderBottomWidth: 1, borderBottomColor: '#18181E' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 6, alignItems: 'center', gap: 2 }}>{children}</ScrollView>
    </View>
  );
}
function StripBtn({ on, onPress, label, children }: { on: boolean; onPress: () => void; label: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ width: 44, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#262431' : pressed ? '#1C1B23' : 'transparent' })}>
      {children}
    </Pressable>
  );
}

// ---------- stickers ----------
const StickerCell = memo(function StickerCell({ s, size, onPress, onLong }: { s: Sticker; size: number; onPress: (s: Sticker) => void; onLong: (s: Sticker) => void }) {
  return (
    <Pressable onPress={() => onPress(s)} onLongPress={() => onLong(s)} delayLongPress={320} accessibilityRole="button" accessibilityLabel={`${s.word} sticker`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ width: size, height: size, padding: 4, borderRadius: 14, backgroundColor: hovered ? '#1A1922' : 'transparent', transform: [{ scale: pressed ? 0.86 : 1 }] })}>
      <Image source={s.src} style={{ flex: 1 }} contentFit="contain" recyclingKey={s.id} transition={120} />
    </Pressable>
  );
});

function StickerTab({ width, onSticker }: { width: number; onSticker: (s: Sticker) => void }) {
  const mem = useStickerMemory();
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string>('recent');
  const [peek, setPeek] = useState<Sticker | null>(null);
  const list = useRef<FlatList<Row<Sticker>>>(null);
  const cols = width >= 560 ? 7 : width >= 420 ? 6 : 5;
  const cell = Math.floor((width - 8) / cols);
  const groups = useMemo(() => {
    if (q.trim()) return [{ key: 'search', title: 'Results', items: searchStickers(q) }];
    return [
      { key: 'favs', title: 'Favourites', items: mem.favs },
      { key: 'recent', title: 'Recently used', items: mem.recent },
      ...PACKS.map((p) => ({ key: p.id, title: p.name, items: p.stickers })),
    ];
  }, [q, mem.favs, mem.recent]);
  const rows = useMemo(() => rowsOf(groups, cols), [groups, cols]);
  const SEARCH_H = 50;
  const getItemLayout = useMemo(() => layoutOf(rows, cell, SEARCH_H), [rows, cell]);
  const send = useCallback((s: Sticker) => { rememberSticker(s.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSticker(s); }, [onSticker]);
  const long = useCallback((s: Sticker) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setPeek(s); }, []);
  const jump = (key: string) => {
    const i = rows.findIndex((r) => r.type === 'head' && r.group === key);
    if (i >= 0) list.current?.scrollToIndex({ index: i, animated: true });
    setActive(key); Haptics.selectionAsync();
  };
  const onView = useRef(({ viewableItems }: { viewableItems: ViewToken<Row<Sticker>>[] }) => {
    const first = viewableItems.find((v) => v.item);
    if (first?.item) setActive(first.item.group);
  }).current;
  const empty = !q.trim() && !mem.recent.length && !mem.favs.length;

  return (
    <>
      <Strip>
        {mem.favs.length ? <StripBtn on={active === 'favs'} onPress={() => jump('favs')} label="Favourites"><Star size={21} color={active === 'favs' ? '#FFC94A' : C.muted} fill={active === 'favs' ? '#FFC94A' : 'none'} /></StripBtn> : null}
        <StripBtn on={active === 'recent'} onPress={() => (mem.recent.length ? jump('recent') : jump(PACKS[0]?.id ?? ''))} label="Recently used"><Clock size={21} color={active === 'recent' ? C.ink : C.muted} /></StripBtn>
        {PACKS.map((p) => (
          <StripBtn key={p.id} on={active === p.id} onPress={() => jump(p.id)} label={`${p.name} pack`}>
            <Image source={p.cover} style={{ width: 32, height: 32 }} contentFit="contain" />
          </StripBtn>
        ))}
      </Strip>
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onView}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        initialNumToRender={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={{ height: SEARCH_H }}><SearchBox value={q} onChange={setQ} placeholder="Search stickers" /></View>}
        ListEmptyComponent={q.trim() ? <Txt v="small" style={{ textAlign: 'center', marginTop: 26 }}>No stickers for “{q.trim()}”. Try gm, long, rekt or 🚀</Txt> : undefined}
        contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 8 }}
        renderItem={({ item }) => item.type === 'head' ? (
          <View style={{ height: HEAD_H, justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 6 }}>
            <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 12, letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' }}>
              {item.title}{empty || item.group === 'search' ? '' : ''}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', height: cell }}>
            {item.items.map((s) => <StickerCell key={s.id} s={s} size={cell} onPress={send} onLong={long} />)}
          </View>
        )}
      />
      <StickerPeek s={peek} onClose={() => setPeek(null)} onSend={(s) => { setPeek(null); send(s); }} fav={!!peek && mem.favIds.has(peek.id)} />
    </>
  );
}

/** Long-press preview: the sticker big, its pack, send and favourite. */
export function StickerPeek({ s, onClose, onSend, fav }: { s: Sticker | null; onClose: () => void; onSend?: (s: Sticker) => void; fav: boolean }) {
  const p = s ? packOf(s.pack) : undefined;
  return (
    <Modal visible={!!s} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {s ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={{ flex: 1, backgroundColor: 'rgba(4,4,8,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Pressable style={{ position: 'absolute', inset: 0 }} onPress={onClose} accessibilityLabel="Close preview" />
          <Text style={{ fontSize: 30, marginBottom: 6 }}>{s.emoji}</Text>
          <Animated.View entering={ZoomIn.springify().damping(13).stiffness(220)}>
            <Image source={s.src} style={{ width: 260, height: 260 }} contentFit="contain" accessibilityLabel={`${s.word} sticker`} />
          </Animated.View>
          <Txt v="small" style={{ marginTop: 10 }}>{p?.name ?? ''} pack</Txt>
          <View style={{ marginTop: 18, width: '100%', maxWidth: 320, gap: 8 }}>
            {onSend ? (
              <Pressable onPress={() => onSend(s)} accessibilityRole="button" style={({ pressed }) => ({ height: 50, borderRadius: 16, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <Text style={{ ...FONT.bold, fontSize: 16, color: C.onBrand }}>Send sticker</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => { toggleFav(s.id); Haptics.selectionAsync(); }} accessibilityRole="button"
              style={({ pressed }) => ({ height: 48, borderRadius: 16, backgroundColor: pressed ? '#24232C' : '#1A1922', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' })}>
              <Star size={18} color="#FFC94A" fill={fav ? '#FFC94A' : 'none'} />
              <Text style={{ ...FONT.semi, fontSize: 15, color: C.ink }}>{fav ? 'Remove from favourites' : 'Add to favourites'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

// ---------- emoji ----------
const CAT_ICON: Record<string, string> = { recent: '🕘', smileys: '😀', people: '👋', nature: '🐻', food: '🍔', activity: '⚽', travel: '🚗', objects: '💡', symbols: '💯', flags: '🏁' };
const EMOJI_FONT = Platform.select({ web: { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }, default: {} });

const EmojiCell = memo(function EmojiCell({ e, size, onPress }: { e: string; size: number; onPress: (e: string) => void }) {
  return (
    <Pressable onPress={() => onPress(e)} accessibilityRole="button" accessibilityLabel={e}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ width: size, height: size, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: hovered ? '#1C1B24' : 'transparent', transform: [{ scale: pressed ? 0.8 : 1 }] })}>
      <Text style={{ fontSize: Math.round(size * 0.66), lineHeight: Math.round(size * 0.86), ...EMOJI_FONT }} allowFontScaling={false}>{e}</Text>
    </Pressable>
  );
});

function EmojiTab({ width, onEmoji }: { width: number; onEmoji: (e: string) => void }) {
  const mem = useStickerMemory();
  const [q, setQ] = useState('');
  const [active, setActive] = useState('recent');
  const list = useRef<FlatList<Row<string>>>(null);
  const cols = Math.max(7, Math.floor((width - 8) / 44));
  const cell = Math.floor((width - 8) / cols);
  const groups = useMemo(() => q.trim()
    ? [{ key: 'search', title: 'Results', items: searchEmoji(q) }]
    : [{ key: 'recent', title: 'Recently used', items: mem.recentEmoji }, ...EMOJI_GROUPS.map((g) => ({ key: g.key, title: g.name, items: g.list.map((x) => x[0]) }))], [q, mem.recentEmoji]);
  const rows = useMemo(() => rowsOf(groups, cols), [groups, cols]);
  const SEARCH_H = 50;
  const getItemLayout = useMemo(() => layoutOf(rows, cell, SEARCH_H), [rows, cell]);
  const pick = useCallback((e: string) => { rememberEmoji(e); Haptics.selectionAsync(); onEmoji(e); }, [onEmoji]);
  const jump = (key: string) => {
    const i = rows.findIndex((r) => r.type === 'head' && r.group === key);
    if (i >= 0) list.current?.scrollToIndex({ index: i, animated: true });
    setActive(key); Haptics.selectionAsync();
  };
  const onView = useRef(({ viewableItems }: { viewableItems: ViewToken<Row<string>>[] }) => {
    const first = viewableItems.find((v) => v.item);
    if (first?.item) setActive(first.item.group);
  }).current;
  return (
    <>
      <Strip>
        {(['recent', ...EMOJI_GROUPS.map((g) => g.key)]).map((k) => (
          <StripBtn key={k} on={active === k} onPress={() => (k === 'recent' && !mem.recentEmoji.length ? jump('smileys') : jump(k))} label={k === 'recent' ? 'Recently used' : EMOJI_GROUPS.find((g) => g.key === k)?.name ?? k}>
            <Text style={{ fontSize: 21, opacity: active === k ? 1 : 0.5, ...EMOJI_FONT }} allowFontScaling={false}>{CAT_ICON[k]}</Text>
          </StripBtn>
        ))}
      </Strip>
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onView}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        initialNumToRender={14}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={{ height: SEARCH_H }}><SearchBox value={q} onChange={setQ} placeholder="Search emoji" /></View>}
        ListEmptyComponent={q.trim() ? <Txt v="small" style={{ textAlign: 'center', marginTop: 26 }}>No emoji for “{q.trim()}”.</Txt> : undefined}
        contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 8 }}
        renderItem={({ item }) => item.type === 'head' ? (
          <View style={{ height: HEAD_H, justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 6 }}>
            <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 12, letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' }}>{item.title}</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', height: cell }}>
            {item.items.map((e, i) => <EmojiCell key={`${e}${i}`} e={e} size={cell} onPress={pick} />)}
          </View>
        )}
      />
    </>
  );
}
