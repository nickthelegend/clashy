// Clashy styled components. Every screen is built only from these.
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { C, F, R, fmtPct } from './tokens';
import { Back, Swords } from './icons';

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
export const Avatar = ({ name, size = 38, uri, ring }: { name: string; size?: number; uri?: string; ring?: string }) => {
  const i = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length;
  const border = ring ? { borderWidth: 2.5, borderColor: ring } : null;
  if (uri) return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2 }, border]} contentFit="cover" />;
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
  crest: require('../../assets/art/crest-moon.webp'),
  wordmark: require('../../assets/art/wordmark.png'),
};
/** Art is rendered on pure black, so it sits on a black tile inside grey cards. */
export const Art = ({ src, size = 96, radius = 18 }: { src: number; size?: number; radius?: number }) => (
  <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#000', overflow: 'hidden' }}>
    <Image source={src} style={{ width: size, height: size }} contentFit="cover" />
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
