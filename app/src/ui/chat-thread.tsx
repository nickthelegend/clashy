// The message list every chat shares (DMs and squad channels), WhatsApp-grade:
//   - bubbles with a tail on the first of a run, the time and read ticks tucked inside the bubble (DMs: one check sent,
//     two lavender-blue checks once they've read it), date pills, a faint Clashy doodle wallpaper behind it all
//   - stickers and 1-3 emoji big without a bubble, with a small time pill
//   - swipe a message right (or long-press → Reply) to reply; the reply quotes it, and tapping the quote jumps back
//   - long-press opens a menu over a blurred chat: six quick reactions (+ any emoji), Reply, Copy, the sticker's pack,
//     the author's profile. Reactions show as pills under the bubble; tap yours to take it back
//   - a scroll-to-bottom button with a count of new messages when you've scrolled up
// Replies and reactions are ordinary messages underneath (see src/stickers), so they work through the social server
// and in on-chain squad channels alike.
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, FadeInDown, FadeOut, ZoomIn, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { jumboCount, packOf, parseBody, previewText, stickerOf, type Sticker } from '@/stickers';
import { JumboEmoji, StickerMsg } from './chat-bits';
import { ArrowDown, Copy, ReplyArrow, StickerI, Ticks, User } from './icons';
import { StickerKeyboard } from './sticker-keyboard';
import { C, FONT } from './tokens';

export type CMsg = { id: number; author: string; at: number; body: string; kind?: number };
export type Who = { name: string; badge?: ReactNode; avatar?: ReactNode; onPress?: () => void };
export type ReplyTo = { id: number; name: string; text: string; sticker?: Sticker | null };
type Reaction = { emoji: string; n: number; mine: boolean };
type Row = CMsg & { text: string; sticker: Sticker | null; jumbo: number; replyTo?: number; reactions: Reaction[] };

export const QUICK_REACTIONS = ['❤️', '😂', '🔥', '😮', '😢', '👍'];
const NAME_COLORS = ['#BDB3F7', '#FF7AB0', '#FFD66B', '#5BE3A5', '#7CC8FF', '#FF9E6B', '#D59BFF', '#9BE36B'];
export const nameColor = (author: string) => NAME_COLORS[[...author].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % NAME_COLORS.length];
const EMOJI_FONT = Platform.select({ web: { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }, default: {} });
const BUBBLE_ME = C.brand;
const BUBBLE_THEM = '#1C1B24';
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dayKey = (ms: number) => new Date(ms).toDateString();
function dayLabel(ms: number) {
  const d = new Date(ms), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Folds reaction messages onto their targets and reads reply links; what's left is what the chat shows. */
export function threadRows(msgs: CMsg[], me?: string): Row[] {
  const rx = new Map<number, Map<string, string>>();
  const rows: Row[] = [];
  for (const m of msgs) {
    const p = parseBody(m.body);
    if (p.react) {
      const r = rx.get(p.react.to) ?? new Map<string, string>();
      if (p.react.emoji) r.set(m.author, p.react.emoji); else r.delete(m.author);
      rx.set(p.react.to, r);
      continue;
    }
    const sticker = stickerOf(p.text);
    rows.push({ ...m, text: p.text, sticker, jumbo: sticker ? 0 : jumboCount(p.text), replyTo: p.reply, reactions: [] });
  }
  for (const r of rows) {
    const got = rx.get(r.id);
    if (!got?.size) continue;
    const by = new Map<string, Reaction>();
    for (const [author, emoji] of got) {
      const x = by.get(emoji) ?? { emoji, n: 0, mine: false };
      x.n += 1; if (author === me) x.mine = true;
      by.set(emoji, x);
    }
    r.reactions = [...by.values()].sort((a, b) => b.n - a.n);
  }
  return rows;
}

export function ChatThread({ msgs, me, group, who, seenUpTo, special, top, footer, onReply, onReact, onPack, contentStyle }: {
  msgs: CMsg[]; me?: string; group?: boolean; who: (author: string) => Who;
  /** DMs: the newest of your messages they've read (two ticks up to here). */
  seenUpTo?: number;
  /** Rows a screen draws itself (squad clash challenges); return null for a normal message. */
  special?: (m: CMsg, mine: boolean) => ReactNode | null;
  top?: ReactNode; footer?: ReactNode;
  onReply?: (r: ReplyTo) => void; onReact?: (id: number, emoji: string) => void; onPack?: (packId: string) => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const rows = useMemo(() => threadRows(msgs, me), [msgs, me]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const sv = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const ys = useRef(new Map<number, number>());
  const atBottom = useRef(true);
  const first = useRef(true);
  const prevLast = useRef<number | null>(null);
  const [down, setDown] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const [menu, setMenu] = useState<Row | null>(null);
  const t0 = useRef(Date.now() - 1500).current;

  // new messages: follow them if you're at the bottom (always for your own), otherwise count them on the button
  useEffect(() => {
    const last = rows[rows.length - 1];
    if (!last) return;
    if (prevLast.current !== null && last.id !== prevLast.current) {
      if (last.author === me || atBottom.current) setTimeout(() => sv.current?.scrollToEnd({ animated: true }), 40);
      else setUnseen((u) => u + rows.filter((r) => r.id > (prevLast.current ?? 0)).length);
    }
    prevLast.current = last.id;
  }, [rows, me]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const dist = contentSize.height - contentOffset.y - layoutMeasurement.height;
    atBottom.current = dist < 140;
    setDown(dist > 320);
    if (atBottom.current) setUnseen(0);
  };
  const jump = (id: number) => {
    const y = ys.current.get(id);
    if (y === undefined) return;
    sv.current?.scrollTo({ y: Math.max(0, y - 90), animated: true });
    setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  };
  const reply = (r: Row) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReply?.({ id: r.id, name: r.author === me ? 'You' : who(r.author).name, text: r.sticker ? `${r.sticker.emoji} Sticker` : r.text, sticker: r.sticker });
  };

  return (
    <View style={{ flex: 1 }}>
      <Wallpaper />
      <ScrollView ref={sv} style={{ flex: 1 }} onScroll={onScroll} scrollEventThrottle={32} keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => { if (first.current && rows.length) { first.current = false; sv.current?.scrollToEnd({ animated: false }); } }}
        contentContainerStyle={[{ paddingHorizontal: 10, paddingTop: 12, paddingBottom: 16 }, contentStyle]}>
        {top}
        {rows.map((r, i) => {
          const prev = rows[i - 1], next = rows[i + 1];
          const newDay = !prev || dayKey(prev.at) !== dayKey(r.at);
          const plain = (x?: Row) => !!x && (x.kind ?? 0) === 0;
          const firstOfRun = newDay || !prev || prev.author !== r.author || r.at - prev.at >= 5 * 60_000 || !plain(prev) || !plain(r);
          const lastOfRun = !next || next.author !== r.author || next.at - r.at >= 5 * 60_000 || dayKey(next.at) !== dayKey(r.at) || !plain(next) || !plain(r);
          const mine = !!me && r.author === me;
          const sp = special?.(r, mine);
          const w = group && !mine ? who(r.author) : null;
          const ticks = !group && mine ? (seenUpTo !== undefined && seenUpTo >= r.id ? 'seen' : 'sent') : null;
          return (
            <View key={r.id} onLayout={(e) => ys.current.set(r.id, e.nativeEvent.layout.y)}>
              {newDay ? (
                <View style={{ alignItems: 'center', marginVertical: 12 }}>
                  <View style={{ backgroundColor: 'rgba(28,27,36,0.92)', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 5 }}>
                    <Text style={{ ...FONT.semi, fontSize: 11.5, color: C.muted }}>{dayLabel(r.at)}</Text>
                  </View>
                </View>
              ) : null}
              {sp ?? (
                <View style={{ marginTop: firstOfRun ? 8 : 2, borderRadius: 12, backgroundColor: flash === r.id ? 'rgba(171,159,242,0.16)' : 'transparent', marginHorizontal: -6, paddingHorizontal: 6 }}>
                  <SwipeToReply onReply={() => reply(r)} enabled={!!onReply}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
                      {group && !mine ? (
                        <View style={{ width: 32 }}>{lastOfRun && w ? <Pressable onPress={w.onPress} accessibilityLabel={`${w.name}'s profile`}>{w.avatar}</Pressable> : null}</View>
                      ) : null}
                      <Message r={r} mine={mine} tail={firstOfRun} name={firstOfRun && w ? w : null} ticks={ticks}
                        quote={r.replyTo !== undefined ? quoteOf(r.replyTo, byId, me, who) : null} onQuote={() => r.replyTo !== undefined && jump(r.replyTo)}
                        fresh={r.at >= t0} onLong={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMenu(r); }}
                        onPack={onPack} onReact={onReact} />
                    </View>
                  </SwipeToReply>
                </View>
              )}
            </View>
          );
        })}
        {footer}
      </ScrollView>
      {down || unseen ? (
        <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)} style={{ position: 'absolute', right: 14, bottom: 12 }}>
          <Pressable onPress={() => { sv.current?.scrollToEnd({ animated: true }); setUnseen(0); }} accessibilityRole="button" accessibilityLabel={unseen ? `${unseen} new messages` : 'Scroll to the newest message'}
            style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: '#1F1E28', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }], boxShadow: '0 6px 18px rgba(0,0,0,0.5)' } as object)}>
            <ArrowDown size={19} color={C.ink} />
          </Pressable>
          {unseen ? (
            <View style={{ position: 'absolute', top: -6, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ ...FONT.bold, fontSize: 11, color: C.onBrand }}>{unseen > 99 ? '99+' : unseen}</Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
      <MessageMenu row={menu} me={me} group={group} who={who} onClose={() => setMenu(null)}
        onReply={onReply ? (r) => { setMenu(null); reply(r); } : undefined}
        onReact={onReact ? (id, e) => { setMenu(null); onReact(id, e); } : undefined}
        onPack={onPack ? (p) => { setMenu(null); onPack(p); } : undefined} />
    </View>
  );
}

function quoteOf(id: number, byId: Map<number, Row>, me: string | undefined, who: (a: string) => Who) {
  const t = byId.get(id);
  if (!t) return { name: 'Earlier message', text: 'Not loaded here', sticker: null as Sticker | null, color: C.muted };
  return { name: t.author === me ? 'You' : who(t.author).name, text: t.sticker ? `${t.sticker.emoji} Sticker` : previewText(t.text), sticker: t.sticker, color: t.author === me ? C.brandSoft : nameColor(t.author) };
}

function Message({ r, mine, tail, name, ticks, quote, onQuote, fresh, onLong, onPack, onReact }: {
  r: Row; mine: boolean; tail: boolean; name: Who | null; ticks: 'sent' | 'seen' | null;
  quote: { name: string; text: string; sticker: Sticker | null; color: string } | null; onQuote: () => void;
  fresh: boolean; onLong: () => void; onPack?: (p: string) => void; onReact?: (id: number, emoji: string) => void;
}) {
  const time = clock(r.at);
  const reacts = r.reactions.length ? (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: -8, alignSelf: 'flex-start', marginLeft: 10, zIndex: 2 }}>
      {r.reactions.map((x) => (
        <Pressable key={x.emoji} onPress={() => { Haptics.selectionAsync(); onReact?.(r.id, x.mine ? '' : x.emoji); }} accessibilityRole="button" accessibilityLabel={`${x.emoji} ${x.n}${x.mine ? ', yours' : ''}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 28, borderRadius: 14, backgroundColor: x.mine ? '#2E2750' : '#1F1E28', borderWidth: 2, borderColor: C.bg, transform: [{ scale: pressed ? 0.9 : 1 }] })}>
          <Text style={{ fontSize: 15, ...EMOJI_FONT }} allowFontScaling={false}>{x.emoji}</Text>
          {x.n > 1 ? <Text style={{ ...FONT.semi, fontSize: 11.5, color: C.ink }}>{x.n}</Text> : null}
        </Pressable>
      ))}
    </View>
  ) : null;

  if (r.sticker || r.jumbo) {
    return (
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
        {quote ? <View style={{ backgroundColor: mine ? BUBBLE_ME : BUBBLE_THEM, borderRadius: 14, padding: 4, marginBottom: 4, maxWidth: 260 }}><Quote q={quote} mine={mine} onPress={onQuote} /></View> : null}
        {name ? <Text style={{ ...FONT.semi, fontSize: 12.5, color: nameColor(r.author), marginBottom: 2, marginHorizontal: 4 }}>{name.name}</Text> : null}
        <Pressable onLongPress={onLong} delayLongPress={300}>
          {r.sticker ? <StickerMsg s={r.sticker} mine={mine} fresh={fresh} onPress={() => onPack?.(r.sticker!.pack)} /> : <JumboEmoji text={r.text.trim()} n={r.jumbo} fresh={fresh} />}
          <View style={{ position: 'absolute', right: 2, bottom: 2, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(10,10,14,0.72)', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ ...FONT.medium, fontSize: 10.5, color: '#D8D8DE' }}>{time}</Text>
            {ticks ? <Ticks size={12} double={ticks === 'seen'} color={ticks === 'seen' ? '#7CC8FF' : '#D8D8DE'} /> : null}
          </View>
        </Pressable>
        {reacts}
      </View>
    );
  }

  const ink = mine ? C.onBrand : '#ECECF1';
  const meta = mine ? 'rgba(22,15,51,0.62)' : '#8E8E99';
  return (
    <View style={{ maxWidth: '80%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <Pressable onLongPress={onLong} delayLongPress={300} accessibilityHint="Long-press for reactions and reply">
        <View style={{ backgroundColor: mine ? BUBBLE_ME : BUBBLE_THEM, borderRadius: 18, borderTopRightRadius: mine && tail ? 5 : 18, borderTopLeftRadius: !mine && tail ? 5 : 18, paddingHorizontal: 11, paddingTop: name ? 6 : 7, paddingBottom: 7, minWidth: 64 }}>
          {tail ? <Tail mine={mine} /> : null}
          {name ? (
            <Pressable onPress={name.onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <Text style={{ ...FONT.semi, fontSize: 13, color: nameColor(r.author) }} numberOfLines={1}>{name.name}</Text>{name.badge}
            </Pressable>
          ) : null}
          {quote ? <Quote q={quote} mine={mine} onPress={onQuote} /> : null}
          <Text style={{ ...FONT.regular, fontSize: 15.5, lineHeight: 21, color: ink }}>
            {r.text}
            <Text style={{ fontSize: 11, color: 'transparent' }}>{`   ${time}${ticks ? '  ✓✓' : ''}`}</Text>
          </Text>
          <View style={{ position: 'absolute', right: 9, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ ...FONT.medium, fontSize: 11, color: meta }}>{time}</Text>
            {ticks ? <Ticks size={13} double={ticks === 'seen'} color={ticks === 'seen' ? '#2F5BFF' : meta} /> : null}
          </View>
        </View>
      </Pressable>
      {reacts}
    </View>
  );
}

/** The little curl on the first bubble of a run, pointing at its sender's side. */
function Tail({ mine }: { mine: boolean }) {
  return (
    <Svg width={9} height={13} viewBox="0 0 9 13" style={{ position: 'absolute', top: 0, [mine ? 'right' : 'left']: -7 } as object}>
      <Path d={mine ? 'M0 0h9L1.6 9.4C1 10.2 0 9.8 0 8.8z' : 'M9 0H0l7.4 9.4c.6.8 1.6.4 1.6-.6z'} fill={mine ? BUBBLE_ME : BUBBLE_THEM} />
    </Svg>
  );
}

function Quote({ q, mine, onPress }: { q: { name: string; text: string; sticker: Sticker | null; color: string }; mine: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Reply to ${q.name}: ${q.text}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: mine ? 'rgba(22,15,51,0.13)' : 'rgba(255,255,255,0.06)', borderLeftWidth: 3, borderLeftColor: mine ? C.onBrand : q.color, paddingVertical: 5, paddingLeft: 8, paddingRight: 6, marginBottom: 5, overflow: 'hidden' }}>
      <View style={{ flexShrink: 1, minWidth: 40 }}>
        <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 12.5, color: mine ? C.onBrand : q.color }}>{q.name}</Text>
        <Text numberOfLines={2} style={{ ...FONT.regular, fontSize: 13, lineHeight: 17, color: mine ? 'rgba(22,15,51,0.75)' : C.muted }}>{q.text}</Text>
      </View>
      {q.sticker ? <Image source={q.sticker.src} style={{ width: 36, height: 36 }} contentFit="contain" /> : null}
    </Pressable>
  );
}

/** Drag a message right to reply: a reply arrow grows in behind it, with a tick of haptics at the threshold. */
function SwipeToReply({ children, onReply, enabled }: { children: ReactNode; onReply: () => void; enabled: boolean }) {
  const x = useSharedValue(0);
  const armed = useSharedValue(0);
  const buzz = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const pan = Gesture.Pan().enabled(enabled).activeOffsetX(16).failOffsetX(-16).failOffsetY([-12, 12])
    .onChange((e) => {
      x.value = Math.max(0, Math.min(84, x.value + e.changeX * 0.8));
      if (x.value > 58 && !armed.value) { armed.value = 1; runOnJS(buzz)(); }
      if (x.value < 58) armed.value = 0;
    })
    .onEnd(() => {
      if (x.value > 58) runOnJS(onReply)();
      x.value = withSpring(0, { damping: 18, stiffness: 240 });
      armed.value = 0;
    });
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [12, 58], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(x.value, [12, 58], [0.4, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <GestureDetector gesture={pan}>
      <View>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 2, top: 0, bottom: 0, justifyContent: 'center' }, icon]}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#24232D', alignItems: 'center', justifyContent: 'center' }}><ReplyArrow size={15} color={C.ink} /></View>
        </Animated.View>
        <Animated.View style={move}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Long-press: the chat blurs, the message floats with a reaction bar above it and its actions below. */
function MessageMenu({ row, me, group, who, onClose, onReply, onReact, onPack }: {
  row: Row | null; me?: string; group?: boolean; who: (a: string) => Who; onClose: () => void;
  onReply?: (r: Row) => void; onReact?: (id: number, emoji: string) => void; onPack?: (p: string) => void;
}) {
  const [more, setMore] = useState(false);
  useEffect(() => { if (!row) setMore(false); }, [row]);
  if (!row) return null;
  const mine = row.author === me;
  const myReaction = row.reactions.find((x) => x.mine)?.emoji;
  const w = who(row.author);
  const copy = Platform.OS === 'web' && !row.sticker ? () => { globalThis.navigator?.clipboard?.writeText(row.text).catch(() => {}); onClose(); } : null;
  const actions: { label: string; icon: ReactNode; on: () => void }[] = [];
  if (onReply) actions.push({ label: 'Reply', icon: <ReplyArrow size={18} color={C.ink} />, on: () => onReply(row) });
  if (copy) actions.push({ label: 'Copy text', icon: <Copy size={18} color={C.ink} />, on: copy });
  if (row.sticker && onPack) actions.push({ label: `${packOf(row.sticker.pack)?.name ?? 'Sticker'} pack`, icon: <StickerI size={18} color={C.ink} />, on: () => onPack(row.sticker!.pack) });
  if (group && !mine && w.onPress) actions.push({ label: `${w.name}'s profile`, icon: <User size={18} color={C.ink} />, on: () => { onClose(); w.onPress?.(); } });
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={{ flex: 1 }}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', padding: 18, width: '100%', maxWidth: 520, alignSelf: 'center', alignItems: mine ? 'flex-end' : 'flex-start' }}>
          {onReact ? (
            <Animated.View entering={ZoomIn.springify().damping(14).stiffness(220)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1D1C26', borderRadius: 30, padding: 6, gap: 2, marginBottom: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' } as object}>
              {QUICK_REACTIONS.map((e, i) => (
                <Animated.View key={e} entering={ZoomIn.delay(40 + i * 30).springify().damping(10)}>
                  <Pressable onPress={() => { Haptics.selectionAsync(); onReact(row.id, myReaction === e ? '' : e); }} accessibilityRole="button" accessibilityLabel={`React ${e}`}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: myReaction === e ? '#3A3360' : 'transparent', transform: [{ scale: pressed ? 1.25 : 1 }] })}>
                    <Text style={{ fontSize: 28, ...EMOJI_FONT }} allowFontScaling={false}>{e}</Text>
                  </Pressable>
                </Animated.View>
              ))}
              <Pressable onPress={() => setMore((m) => !m)} accessibilityRole="button" accessibilityLabel="More reactions"
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#2A2935', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
                <Text style={{ ...FONT.bold, fontSize: 20, color: C.ink, marginTop: -2 }}>{more ? '–' : '+'}</Text>
              </Pressable>
            </Animated.View>
          ) : null}
          {more && onReact ? (
            <Animated.View entering={FadeInDown.duration(160)} style={{ width: '100%', maxWidth: 380, borderRadius: 20, overflow: 'hidden', marginBottom: 10 }}>
              <StickerKeyboard height={290} tab="emoji" onTab={() => {}} only="emoji" onSticker={() => {}} onEmoji={(e) => onReact(row.id, e)} />
            </Animated.View>
          ) : (
            <Animated.View entering={ZoomIn.springify().damping(15)} style={{ maxWidth: '86%', marginBottom: 10 }}>
              {row.sticker ? <Image source={row.sticker.src} style={{ width: 170, height: 170 }} contentFit="contain" />
                : row.jumbo ? <Text style={{ fontSize: 56, ...EMOJI_FONT }}>{row.text.trim()}</Text>
                  : (
                    <View style={{ backgroundColor: mine ? BUBBLE_ME : BUBBLE_THEM, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 }}>
                      <Text numberOfLines={8} style={{ ...FONT.regular, fontSize: 15.5, lineHeight: 21, color: mine ? C.onBrand : '#ECECF1' }}>{row.text}</Text>
                    </View>
                  )}
            </Animated.View>
          )}
          {actions.length ? (
            <Animated.View entering={FadeInDown.delay(60).duration(200)} style={{ backgroundColor: '#1D1C26', borderRadius: 18, minWidth: 220, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' } as object}>
              {actions.map((a, i) => (
                <Pressable key={a.label} onPress={a.on} accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, paddingHorizontal: 16, height: 48, backgroundColor: pressed ? '#272632' : 'transparent', borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: '#33323E' })}>
                  <Text style={{ ...FONT.medium, fontSize: 15, color: C.ink }}>{a.label}</Text>
                  {a.icon}
                </Pressable>
              ))}
            </Animated.View>
          ) : null}
          <Text style={{ ...FONT.regular, fontSize: 11.5, color: '#9A9AA6', marginTop: 10 }}>{clock(row.at)} · {dayLabel(row.at)}</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

/** A faint doodle of Clashy things (swords, coins, candles, bolts, stars) tiled behind the chat. */
function Wallpaper() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="clashy-doodle" patternUnits="userSpaceOnUse" width={168} height={168}>
            <G stroke="#FFFFFF" strokeOpacity={0.045} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M14 30 34 10M30 10h4v4M18 26l-4 4M10 22l8 8" />
              <Path d="M34 30 14 10M18 10h-4v4M30 26l4 4M38 22l-8 8" />
              <Circle cx={100} cy={26} r={11} /><Path d="M100 20v12M96.5 23.5h5a2.2 2.2 0 0 1 0 4.4h-3a2.2 2.2 0 0 0 0 4.4h5" />
              <Path d="M146 12v8M146 34v6M141 20h10v14h-10z" /><Path d="M158 26v6M158 46v4M153 32h10v14h-10z" />
              <Path d="M60 70 52 84h10l-8 14" />
              <Path d="m128 70 3.2 6.6 7.2 1-5.2 5 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5 7.2-1z" />
              <Path d="M16 118c0-6 8-8 10 0 2-8 10-6 10 0 0 7-10 12-10 12s-10-5-10-12z" />
              <Path d="M84 112h26M84 112l8-8M84 112l8 8" />
              <Path d="M140 116a12 12 0 1 1 0 .1zM135 116h10M140 111v10" />
              <Path d="M50 150 60 140l10 6 14-14" /><Path d="M78 132h6v6" />
              <Circle cx={124} cy={152} r={3} /><Circle cx={30} cy={74} r={2.5} /><Circle cx={160} cy={96} r={2} />
            </G>
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#clashy-doodle)" />
      </Svg>
    </View>
  );
}
