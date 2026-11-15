// Clashy styled components. Every screen is built only from these.
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { C, F, R, fmtPct } from './tokens';
import { Back, Search as SearchIcon, Swords } from './icons';

/* ---------- type ---------- */
type TxtVariant = 'hero' | 'title' | 'h2' | 'body' | 'label' | 'small' | 'num';
const T: Record<TxtVariant, TextStyle> = {
  hero: { fontFamily: F.semi, fontSize: 56, letterSpacing: -2 },
  title: { fontFamily: F.semi, fontSize: 26, letterSpacing: -0.8 },
  h2: { fontFamily: F.semi, fontSize: 17, letterSpacing: -0.3 },
  body: { fontFamily: F.medium, fontSize: 14, letterSpacing: -0.1 },
  label: { fontFamily: F.semi, fontSize: 14 },
  small: { fontFamily: F.medium, fontSize: 12.5, color: C.muted },
  num: { fontFamily: F.semi, fontSize: 15, fontVariant: ['tabular-nums'] },
};
export const Txt = ({ v = 'body', color, style, children, lines }: { v?: TxtVariant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; lines?: number }) => (
  <Text numberOfLines={lines} style={[{ color: C.ink }, T[v], color ? { color } : null, style]}>{children}</Text>
);

/** "$248.60" with the cents dimmed, like fomo's balance. */
export const Money = ({ value, size = 26, color = C.ink }: { value: number; size?: number; color?: string }) => {
  const [w, c] = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  return (
    <Text style={{ fontFamily: F.semi, fontSize: size, letterSpacing: -size * 0.035, color, fontVariant: ['tabular-nums'] }}>
      ${w}<Text style={{ color: C.dim }}>.{c}</Text>
    </Text>
  );
};

/* ---------- press feedback ---------- */
export const Press = ({ onPress, style, children, haptic = true, disabled }: { onPress?: () => void; style?: StyleProp<ViewStyle>; children: ReactNode; haptic?: boolean; disabled?: boolean }) => {
  const sc = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  // Layout props (flex, width, margins, alignSelf) belong on the touch target, not the inner view,
  // otherwise side-by-side buttons collapse to their text width.
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const { flex, flexGrow, flexShrink, flexBasis, width, minWidth, maxWidth, alignSelf, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical, position, left, right, top, bottom, ...inner } = flat;
  const outer: ViewStyle = { flex, flexGrow, flexShrink, flexBasis, width, minWidth, maxWidth, alignSelf, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical, position, left, right, top, bottom };
  return (
    <Pressable
      style={outer}
      disabled={disabled}
      onPressIn={() => (sc.value = withSpring(0.97, { damping: 18, stiffness: 420 }))}
      onPressOut={() => (sc.value = withSpring(1, { damping: 14, stiffness: 300 }))}
      onPress={() => { if (haptic) Haptics.selectionAsync(); onPress?.(); }}
      hitSlop={6}>
      <Animated.View style={[a, inner, (width !== undefined || flex !== undefined) ? { width: '100%' } : null, disabled ? { opacity: 0.4 } : null]}>{children}</Animated.View>
    </Pressable>
  );
};

/* ---------- buttons ---------- */
type BtnKind = 'brand' | 'white' | 'long' | 'short' | 'ghost';
const BK: Record<BtnKind, { bg: string; fg: string }> = {
  brand: { bg: C.brand, fg: '#fff' }, white: { bg: C.white, fg: '#000' }, long: { bg: C.up, fg: '#03140A' },
  short: { bg: C.down, fg: '#fff' }, ghost: { bg: C.s2, fg: C.ink },
};
export const Btn = ({ title, kind = 'brand', onPress, h = 48, style, disabled, icon }: { title: string; kind?: BtnKind; onPress?: () => void; h?: number; style?: StyleProp<ViewStyle>; disabled?: boolean; icon?: ReactNode }) => (
  <Press onPress={onPress} disabled={disabled} style={[{ height: h, borderRadius: h <= 38 ? 11 : 14, backgroundColor: BK[kind].bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: h <= 38 ? 14 : 18 }, style]}>
    {icon}
    <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: h <= 38 ? 13.5 : 15, letterSpacing: -0.1, color: BK[kind].fg }}>{title}</Text>
  </Press>
);
export const IconBtn = ({ children, onPress, size = 38, dot }: { children: ReactNode; onPress?: () => void; size?: number; dot?: boolean }) => (
  <Press onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
    {children}
    {dot ? <View style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: C.opp }} /> : null}
  </Press>
);
export const BackBtn = ({ onPress }: { onPress: () => void }) => <IconBtn onPress={onPress} size={34}><Back size={18} color={C.ink} /></IconBtn>;

/* ---------- pills, chips, tabs ---------- */
export const ChangePill = ({ pct }: { pct: number }) => {
  const up = pct >= 0;
  return (
    <View style={{ alignSelf: 'flex-end', backgroundColor: up ? C.upBg : C.downBg, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, marginTop: 3 }}>
      <Text style={{ fontFamily: F.semi, fontSize: 11.5, color: up ? C.up : C.down, fontVariant: ['tabular-nums'] }}>{fmtPct(pct)}</Text>
    </View>
  );
};
export const Tag = ({ text, color = C.down }: { text: string; color?: string }) => (
  <View style={{ borderWidth: 1, borderColor: color + '88', borderRadius: 5, paddingHorizontal: 4 }}>
    <Text style={{ fontFamily: F.semi, fontSize: 9.5, color }}>{text}</Text>
  </View>
);
/** Underlined text tabs (fomo: Watchlist / Tokens / Perps). */
export const UnderTabs = <K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) => (
  <View style={{ flexDirection: 'row', gap: 18, marginBottom: 10 }}>
    {items.map((it) => {
      const on = it.key === value;
      return (
        <Pressable key={it.key} onPress={() => onChange(it.key)} style={{ paddingBottom: 7, borderBottomWidth: 2, borderBottomColor: on ? C.ink : 'transparent' }}>
          <Text style={{ fontFamily: F.semi, fontSize: 14.5, color: on ? C.ink : C.dim }}>{it.label}</Text>
        </Pressable>
      );
    })}
  </View>
);
/** Small filter chips (pump: Trending / Movers). */
export const Chips = <K extends string>({ items, value, onChange, light }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; light?: boolean }) => (
  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
    {items.map((it) => {
      const on = it.key === value;
      return (
        <Pressable key={it.key} onPress={() => onChange(it.key)} style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, backgroundColor: on ? (light ? C.white : C.s2) : 'transparent' }}>
          <Text style={{ fontFamily: F.medium, fontSize: 12.5, color: on ? (light ? '#000' : C.ink) : C.muted }}>{it.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

/* ---------- avatars & token art ---------- */
const AV = [['#5B6CFF', '#C9D0FF'], ['#F0468C', '#FFC1DA'], ['#FFB547', '#FFE3B0'], ['#30D158', '#B9F2CC'], ['#8E7BFF', '#E6DCFF']];
export const Avatar = ({ name, size = 38, uri, ring, sticker = true }: { name: string; size?: number; uri?: string; ring?: string; sticker?: boolean }) => {
  const i = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length;
  const border = ring ? { borderWidth: 2.5, borderColor: ring } : null;
  if (uri) return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2 }, border]} contentFit="cover" />;
  if (sticker) return <Image source={stickerFor(name)} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#000' }, border]} contentFit="cover" />;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: AV[i][0], alignItems: 'center', justifyContent: 'center' }, border]}>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.36, color: '#07071A' }}>{name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase()}</Text>
    </View>
  );
};
const MAJOR_ART: Record<string, { bg: string; glyph: string }> = { SOL: { bg: '#9945FF', glyph: '◎' }, BTC: { bg: '#F7931A', glyph: '₿' }, ETH: { bg: '#627EEA', glyph: 'Ξ' } };
export const TokenArt = ({ symbol, uri, size = 44 }: { symbol: string; uri?: string; size?: number }) => {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: C.s1 }} contentFit="cover" transition={150} />;
  const m = MAJOR_ART[symbol];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: m?.bg ?? C.s2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.45, color: '#fff' }}>{m?.glyph ?? symbol.slice(0, 1)}</Text>
    </View>
  );
};

/* ---------- live dot ---------- */
export const LiveDot = ({ color = C.down }: { color?: string }) => {
  const o = useSharedValue(1);
  useEffect(() => { o.value = withRepeat(withTiming(0.25, { duration: 700 }), -1, true); }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, a]} />;
};

/* ---------- charts ---------- */
const toPath = (vals: number[], w: number, h: number, pad = 4, lo?: number, hi?: number) => {
  const min = lo ?? Math.min(...vals), max = hi ?? Math.max(...vals), span = max - min || 1;
  return vals.map((v, i) => `${i ? 'L' : 'M'}${(pad + (i * (w - 2 * pad)) / Math.max(1, vals.length - 1)).toFixed(1)},${(pad + (1 - (v - min) / span) * (h - 2 * pad)).toFixed(1)}`).join(' ');
};
export const Sparkline = ({ data, w = 120, h = 36, color }: { data: number[]; w?: number; h?: number; color?: string }) => {
  if (data.length < 2) return <View style={{ width: w, height: h }} />;
  const c = color ?? (data[data.length - 1] >= data[0] ? C.up : C.down);
  return <Svg width={w} height={h}><Path d={toPath(data, w, h, 2)} stroke={c} strokeWidth={1.8} fill="none" /></Svg>;
};
/** Area chart; optional knockout lines (yours in brand, opponent's in pink). */
export const PriceChart = ({ data, w, h = 220, koYou, koOpp }: { data: number[]; w: number; h?: number; koYou?: number; koOpp?: number }) => {
  if (data.length < 2) return <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">Loading price…</Txt></View>;
  const extra = [koYou, koOpp].filter((x): x is number => x !== undefined);
  const lo = Math.min(...data, ...extra), hi = Math.max(...data, ...extra), pad = (hi - lo) * 0.08;
  const L = lo - pad, H = hi + pad;
  const y = (v: number) => 6 + (1 - (v - L) / (H - L)) * (h - 12);
  const d = toPath(data, w, h, 6, L, H);
  return (
    <Svg width={w} height={h}>
      <Defs><LinearGradient id="g" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={C.brand} stopOpacity={0.22} /><Stop offset="1" stopColor={C.brand} stopOpacity={0} /></LinearGradient></Defs>
      <Path d={`${d} L${w - 6},${h} L6,${h}Z`} fill="url(#g)" />
      <Path d={d} stroke={C.ink} strokeWidth={2} fill="none" strokeLinejoin="round" />
      {koYou !== undefined ? <Line x1={0} x2={w} y1={y(koYou)} y2={y(koYou)} stroke={C.brand} strokeWidth={1.5} strokeDasharray="6 5" /> : null}
      {koOpp !== undefined ? <Line x1={0} x2={w} y1={y(koOpp)} y2={y(koOpp)} stroke={C.opp} strokeWidth={1.5} strokeDasharray="6 5" /> : null}
    </Svg>
  );
};

/* ---------- rows & layout ---------- */
export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ backgroundColor: C.s1, borderRadius: R.lg, padding: 12 }, style]}>{children}</View>;

/** A coin row with the ⚔ duel action on the right. */
export const CoinRow = ({ symbol, name, image, price, change, sub, hot, onPress, onDuel }: { symbol: string; name?: string; image?: string; price: string; change: number; sub: string; hot?: boolean; onPress?: () => void; onDuel?: () => void }) => (
  <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8 }}>
    <TokenArt symbol={symbol} uri={image} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Row style={{ gap: 6 }}><Txt v="label" lines={1}>{symbol}</Txt>{hot ? <Tag text="HOT" /> : null}</Row>
      <Txt v="small" lines={1} style={{ marginTop: 2 }}>{name ? `${name} · ` : ''}{sub}</Txt>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Txt v="num">{price}</Txt>
      <ChangePill pct={change} />
    </View>
    <Press onPress={onDuel} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
      <Swords size={16} color={C.brandSoft} />
    </Press>
  </Pressable>
);

/** Honest state for anything that needs the Clashy program or a wallet. */
export const ART = {
  duels: require('../../assets/art/empty-duels.webp'),
  clan: require('../../assets/art/empty-clan.webp'),
  bell: require('../../assets/art/empty-notifications.webp'),
  offline: require('../../assets/art/empty-offline.webp'),
  crown: require('../../assets/art/crown.webp'),
  ko: require('../../assets/art/ko-burst.webp'),
  tileDuel: require('../../assets/art/tile-duel.webp'),
  tileWar: require('../../assets/art/tile-war.webp'),
  tileLine: require('../../assets/art/tile-line.webp'),
  tileRoyale: require('../../assets/art/tile-royale.webp'),
  tileBounty: require('../../assets/art/tile-bounty.webp'),
  crestCreate: require('../../assets/art/crest-create.webp'),
  banner: require('../../assets/art/profile-banner.webp'),
  bannerDuel: require('../../assets/art/banner-duel.webp'),
  bannerLine: require('../../assets/art/banner-line.webp'),
  bannerWar: require('../../assets/art/banner-war.webp'),
  bannerRoyale: require('../../assets/art/banner-royale.webp'),
  bannerBounty: require('../../assets/art/banner-bounty.webp'),
  onboard1: require('../../assets/art/onboard-1.webp'),
  onboard2: require('../../assets/art/onboard-2.webp'),
  onboard3: require('../../assets/art/onboard-3.webp'),
  radar: require('../../assets/art/radar.webp'),
  vs: require('../../assets/art/vs.webp'),
  winTrophy: require('../../assets/art/win-trophy.webp'),
  koSkull: require('../../assets/art/ko-skull.webp'),
  draw: require('../../assets/art/draw-handshake.webp'),
  confetti: require('../../assets/art/confetti.webp'),
  emptyChats: require('../../assets/art/empty-chats.webp'),
  emptyLeaderboard: require('../../assets/art/empty-leaderboard.webp'),
  emptyProfile: require('../../assets/art/empty-profile.webp'),
  emptySearch: require('../../assets/art/empty-search.webp'),
  heroHome: require('../../assets/art/hero-home.webp'),
  railLive: require('../../assets/art/rail-live.webp'),
  sidebarBattle: require('../../assets/art/sidebar-battle.webp'),
  crest: require('../../assets/art/crest-moon.webp'),
  wordmark: require('../../assets/art/wordmark.png'),
  onboarding: require('../../assets/art/onboarding.webp'),
  matchmaking: require('../../assets/art/matchmaking.webp'),
};
/** Sticker sets. Same filenames as assets/mobile, so a new art pass upgrades the whole app on re-copy. */
export const AVATARS = [
  require('../../assets/art/avatar-racer.webp'), require('../../assets/art/avatar-hood.webp'),
  require('../../assets/art/avatar-bot.webp'), require('../../assets/art/avatar-gladiator.webp'),
  require('../../assets/art/avatar-cat.webp'), require('../../assets/art/avatar-shark.webp'),
  require('../../assets/art/avatar-bull.webp'), require('../../assets/art/avatar-ghost.webp'),
  require('../../assets/art/avatar-nova.webp'),
  require('../../assets/art/avatar-beanie.webp'),
  require('../../assets/art/avatar-punk.webp'),
  require('../../assets/art/avatar-panda.webp'),
  require('../../assets/art/avatar-alien.webp'),
  require('../../assets/art/avatar-monkey.webp'),
  require('../../assets/art/avatar-wizard.webp'),
  require('../../assets/art/avatar-dog.webp'),
  require('../../assets/art/avatar-cyborg.webp'),
  require('../../assets/art/avatar-dragon.webp'),
  require('../../assets/art/avatar-skater.webp'),
  require('../../assets/art/avatar-tiger.webp'),
];
/** Rank tiers, lowest first. */
/** Ten ranked tiers with degen names. Points needed to reach each tier (season ladder). Art: rank-N clay emblems
 *  are on order; until they land, tiers borrow the six existing rank emblems. */
const RA = {
  b: require('../../assets/art/rank-bronze.webp'), s: require('../../assets/art/rank-silver.webp'), g: require('../../assets/art/rank-gold.webp'),
  p: require('../../assets/art/rank-platinum.webp'), d: require('../../assets/art/rank-diamond.webp'), l: require('../../assets/art/rank-legend.webp'),
};
export const RANKS: { n: number; key: string; label: string; pts: number; color: string; src: number }[] = [
  { n: 1, key: 'exit-liquidity', label: 'Exit Liquidity', pts: 0, color: '#8A8A94', src: RA.b },
  { n: 2, key: 'paper-hands', label: 'Paper Hands', pts: 100, color: '#C9B79C', src: RA.b },
  { n: 3, key: 'bagholder', label: 'Bagholder', pts: 250, color: '#CD7F4A', src: RA.s },
  { n: 4, key: 'dip-buyer', label: 'Dip Buyer', pts: 450, color: '#B8C4D6', src: RA.s },
  { n: 5, key: 'ape', label: 'Ape', pts: 700, color: '#FFC94A', src: RA.g },
  { n: 6, key: 'degen', label: 'Degen', pts: 1000, color: '#8E9AFF', src: RA.g },
  { n: 7, key: 'diamond-hands', label: 'Diamond Hands', pts: 1400, color: '#5AC8FA', src: RA.p },
  { n: 8, key: 'chad', label: 'Chad', pts: 1900, color: '#FFB547', src: RA.d },
  { n: 9, key: 'whale', label: 'Whale', pts: 2500, color: '#F0468C', src: RA.d },
  { n: 10, key: 'the-house', label: 'The House', pts: 3300, color: '#FFD66B', src: RA.l },
];
export const rankFor = (pts: number) => [...RANKS].reverse().find((r) => pts >= r.pts) ?? RANKS[0];
export const CRESTS = [
  require('../../assets/art/crest-moon.webp'), require('../../assets/art/crest-bolt.webp'),
  require('../../assets/art/crest-flame.webp'), require('../../assets/art/crest-star.webp'),
  require('../../assets/art/crest-skull.webp'), require('../../assets/art/crest-wolf.webp'),
  require('../../assets/art/crest-crown.webp'), require('../../assets/art/crest-rocket.webp'),
];
/** Podium medals, index 0 = gold. */
export const MEDALS = [require('../../assets/art/medal-1.webp'), require('../../assets/art/medal-2.webp'), require('../../assets/art/medal-3.webp')];
/** Chat reaction stickers. */
export const STICKERS: { key: string; src: number }[] = (['ko', 'gg', 'rekt', 'lfg', 'fade-me', 'moon', 'crying', 'crown'] as const).map((key) => ({ key, src: ({
  ko: require('../../assets/art/sticker-ko.webp'), gg: require('../../assets/art/sticker-gg.webp'), rekt: require('../../assets/art/sticker-rekt.webp'), lfg: require('../../assets/art/sticker-lfg.webp'),
  'fade-me': require('../../assets/art/sticker-fade-me.webp'), moon: require('../../assets/art/sticker-moon.webp'), crying: require('../../assets/art/sticker-crying.webp'), crown: require('../../assets/art/sticker-crown.webp'),
} as Record<string, number>)[key] }));
export const BADGES: { key: string; label: string; src: number }[] = [
  { key: 'top10', label: 'Season top 10', src: require('../../assets/art/badge-top10.webp') },
  { key: 'streak', label: '9 win streak', src: require('../../assets/art/badge-streak.webp') },
  { key: '500', label: '500 duels', src: require('../../assets/art/badge-500.webp') },
  { key: 'captain', label: 'Clan captain', src: require('../../assets/art/badge-captain.webp') },
  { key: 'first-ko', label: 'First knockout', src: require('../../assets/art/badge-first-ko.webp') },
  { key: 'giant-slayer', label: 'Giant slayer', src: require('../../assets/art/badge-giant-slayer.webp') },
];
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
/** Every player gets a default sticker avatar picked from their name; a real profile picture overrides it. */
export const stickerFor = (name: string) => AVATARS[hash(name) % AVATARS.length];
export const crestFor = (name: string) => CRESTS[hash(name) % CRESTS.length];
/** Sticker art has real transparency, so it sits straight on any surface. */
export const Art = ({ src, size = 96, radius = 18 }: { src: number; size?: number; radius?: number }) => (
  <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}>
    <Image source={src} style={{ width: size, height: size }} contentFit="contain" />
  </View>
);
export const Wordmark = ({ height = 26 }: { height?: number }) => (
  <Image source={ART.wordmark} style={{ height, width: height * (1280 / 300) }} contentFit="contain" />
);

export const Pending = ({ title, body, action, onAction, art }: { title: string; body: string; action?: string; onAction?: () => void; art?: number }) => (
  <Card style={{ alignItems: 'center', paddingVertical: 22, gap: 6 }}>
    {art ? <Art src={art} size={92} /> : <Swords size={26} color={C.dim} />}
    <Txt v="h2" style={{ textAlign: 'center' }}>{title}</Txt>
    <Txt v="small" style={{ textAlign: 'center', lineHeight: 18 }}>{body}</Txt>
    {action ? <Btn title={action} kind="ghost" h={38} onPress={onAction} style={{ marginTop: 6 }} /> : null}
  </Card>
);
export const ErrorLine = ({ msg, onRetry }: { msg: string; onRetry?: () => void }) => (
  <Row style={{ gap: 8, paddingVertical: 8 }}>
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.down }} />
    <Txt v="small" style={{ flex: 1 }}>{msg}</Txt>
    {onRetry ? <Pressable onPress={onRetry}><Txt v="small" color={C.ink}>Retry</Txt></Pressable> : null}
  </Row>
);

/* ---------- skeleton loading ---------- */
const Pulse = ({ children }: { children: ReactNode }) => {
  const o = useSharedValue(0.45);
  useEffect(() => { o.value = withRepeat(withTiming(1, { duration: 750 }), -1, true); }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={a}>{children}</Animated.View>;
};
export const Bone = ({ w, h = 12, r = 6, style }: { w: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: C.s2 }, style]} />
);
/** List skeleton: avatar + two lines + meta, n rows. */
export const SkeletonRows = ({ n = 5, square }: { n?: number; square?: boolean }) => (
  <Pulse>
    {Array.from({ length: n }).map((_, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
        <Bone w={48} h={48} r={square ? 14 : 24} />
        <View style={{ flex: 1, gap: 8 }}>
          <Bone w={`${55 - (i % 3) * 10}%`} h={13} />
          <Bone w={`${80 - (i % 2) * 15}%`} h={11} />
        </View>
        <Bone w={34} h={11} />
      </View>
    ))}
  </Pulse>
);
/** Briefly true on mount, so screens show a skeleton before their first data. */
export const useFirstLoad = (ms = 700) => {
  const [l, setL] = useState(true);
  useEffect(() => { const t = setTimeout(() => setL(false), ms); return () => clearTimeout(t); }, [ms]);
  return l;
};

/* ---------- search ---------- */
export const SearchBar = ({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: R.md, backgroundColor: C.s1, paddingHorizontal: 12 }}>
    <SearchIcon size={16} color={C.muted} />
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false}
      style={{ flex: 1, color: C.ink, fontFamily: F.medium, fontSize: 14 }} />
  </View>
);

/* ---------- live chart: smooth line, min range, glowing live dot, price tag ---------- */
const smooth = (pts: [number, number][]) => {
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};
/** Price chart for games: real history plus live ticks, a smoothed line, at least ±minSpan of range so quiet markets
 *  don't look like stairs, an optional reference line (e.g. a round's start price), and a pulsing live dot. */
export const LiveChart = ({ data, w, h = 240, refLine, refLabel, minSpan = 0.0008, color = C.brand }: { data: number[]; w: number; h?: number; refLine?: number; refLabel?: string; minSpan?: number; color?: string }) => {
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withTiming(2.4, { duration: 1100 }), -1, false); }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 1.4 - pulse.value / 2 }));
  if (data.length < 2) return <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">Loading price…</Txt></View>;
  const last = data[data.length - 1];
  let lo = Math.min(...data, refLine ?? Infinity), hi = Math.max(...data, refLine ?? -Infinity);
  const need = last * minSpan;
  if (hi - lo < need) { const mid = (hi + lo) / 2; lo = mid - need / 2; hi = mid + need / 2; }
  const pad = (hi - lo) * 0.14; lo -= pad; hi += pad;
  const R_ = 74; // right gutter for the price tag
  const X = (i: number) => 4 + (i / (data.length - 1)) * (w - R_);
  const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (h - 16);
  const pts = data.map((v, i) => [X(i), Y(v)] as [number, number]);
  const d = smooth(pts);
  const ex = pts[pts.length - 1][0], ey = pts[pts.length - 1][1];
  const up = refLine === undefined ? last >= data[0] : last >= refLine;
  const lc = refLine === undefined ? color : up ? C.up : C.down;
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        <Defs><LinearGradient id="lcg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={lc} stopOpacity={0.28} /><Stop offset="1" stopColor={lc} stopOpacity={0} /></LinearGradient></Defs>
        {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={0} x2={w - R_ + 4} y1={h * f} y2={h * f} stroke="#18181C" />)}
        <Path d={`${d} L${ex},${h} L${pts[0][0]},${h}Z`} fill="url(#lcg)" />
        {refLine !== undefined ? <Line x1={0} x2={w} y1={Y(refLine)} y2={Y(refLine)} stroke={C.brandSoft} strokeWidth={1.2} strokeDasharray="5 5" /> : null}
        <Path d={d} stroke={lc} strokeOpacity={0.25} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={d} stroke={lc} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Line x1={ex} x2={w} y1={ey} y2={ey} stroke={lc} strokeOpacity={0.5} strokeDasharray="2 3" />
      </Svg>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: ex - 6, top: ey - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: lc }, ring]} />
      <View pointerEvents="none" style={{ position: 'absolute', left: ex - 5, top: ey - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: lc, borderWidth: 2, borderColor: '#000' }} />
      <View pointerEvents="none" style={{ position: 'absolute', right: 4, top: Math.max(2, Math.min(h - 24, ey - 11)), backgroundColor: lc, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 11, color: '#000' }}>{last >= 1000 ? last.toLocaleString('en-US', { maximumFractionDigits: 0 }) : last.toPrecision(5)}</Text>
      </View>
      {refLine !== undefined && refLabel ? <Text style={{ position: 'absolute', left: 8, top: Math.max(2, Y(refLine) - 18), fontFamily: F.semi, fontSize: 10.5, color: C.brandSoft }}>{refLabel}</Text> : null}
    </View>
  );
};
