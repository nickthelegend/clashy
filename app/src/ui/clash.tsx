// Clash: the look of a real on-chain duel. Big faces, a slot-machine coin roll, giant UP / DOWN calls, a live
// tug-of-war, and the result. The chain plumbing stays in app/onchain.tsx; this file is only how it looks.
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { Profile } from '@/chain/social';
import { COIN_SYMBOLS } from '@/chain/client';
import { ProfileAvatar, STOCK_ART } from './feed';
import { ART, Txt } from './kit';
import { C, F, FONT, fmtUsd } from './tokens';

const COIN_NAME: Record<string, string> = { SOL: 'Solana', BTC: 'Bitcoin', ETH: 'Ethereum', NVDA: 'NVIDIA', TSLA: 'Tesla', AAPL: 'Apple', SPY: 'S&P 500', GOOGL: 'Alphabet' };
const COIN_COLOR: Record<string, string> = { SOL: '#9B6BFF', BTC: '#F7931A', ETH: '#7C8CFF', NVDA: '#5B6CFF', TSLA: '#F0468C', AAPL: '#E8E2D4', SPY: '#FFC94A', GOOGL: '#3DDC97' };
export const coinName = (sym: string) => COIN_NAME[sym] ?? sym;
export const symbolsIn = (mask: number) => COIN_SYMBOLS.filter((_, i) => mask & (1 << i));

/** Leverage chips for a perps clash (the program allows 1x to 100x). */
export const PERPS_LEVERAGE = [2, 5, 10, 25, 50] as const;
/** Nonces at or above this carry a perps clash's leverage (open-time ms x 1000 + leverage). Plain clashes use open-time ms. */
const PERPS_NONCE = 1e14;
/**
 * A perps clash advertises its leverage in the nonce it is opened with, so the board and the joiner know it before
 * anyone picks. Each player's leverage is still sealed in their own pick and recorded by the program at reveal.
 */
export const perpsNonce = (lev: number) => Date.now() * 1000 + Math.max(1, Math.min(100, Math.round(lev)));
/** The leverage a clash was opened at: 1 for a plain clash. */
export const clashLev = (nonce: number) => (nonce >= PERPS_NONCE ? Math.max(1, Math.min(100, nonce % 1000)) : 1);
/** Where a leveraged position is liquidated (a 100% loss): entry x (1 - 1/lev) long, entry x (1 + 1/lev) short. */
export const liqPrice = (entry: number, call: number, lev: number) => (call === 2 ? entry * (1 + 1 / lev) : entry * (1 - 1 / lev));

/** Real logos for the crypto coins (the stocks' logos are STOCK_ART). */
const COIN_LOGO: Record<string, number> = { SOL: ART.logoSOL, BTC: ART.logoBTC, ETH: ART.logoETH };
/** A coin or stock as a token: its real logo in a circle (a lettered disc only for an unknown symbol). */
export function CoinToken({ sym, size = 120 }: { sym: string; size?: number }) {
  const logo = STOCK_ART[sym] ?? COIN_LOGO[sym];
  if (logo) return <Image source={logo} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  const c = COIN_COLOR[sym] ?? C.brand;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: size * 0.06, borderColor: 'rgba(255,255,255,0.35)' }}>
      <Text style={{ ...FONT.display, fontSize: size * 0.3, color: '#0A0A0D' }}>{sym}</Text>
    </View>
  );
}

/** The opponents, face to face. */
export function FaceOff({ me, rival, meLabel = 'You', rivalLabel, size = 92 }: { me?: Profile; rival?: Profile | null; meLabel?: string; rivalLabel?: string; size?: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 600 }), withTiming(1, { duration: 600 })), -1); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const vs = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }, { rotate: '-8deg' }] }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', width: size + 30 }}>
        <View style={{ borderRadius: size, borderWidth: 3, borderColor: C.brand, padding: 3 }}><ProfileAvatar p={me} size={size} /></View>
        <Txt v="label" style={{ marginTop: 8 }} lines={1}>{meLabel}</Txt>
      </Animated.View>
      <Animated.View style={vs}>
        <Text style={{ ...FONT.bold, fontSize: 28, letterSpacing: -0.8, color: C.muted }}>vs</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).springify()} style={{ alignItems: 'center', width: size + 30 }}>
        <View style={{ borderRadius: size, borderWidth: 3, borderColor: rival ? C.opp : C.s2, padding: 3 }}>
          {rival === null ? (
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1C1C22', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...FONT.display, fontSize: size * 0.45, color: '#3A3A44' }}>?</Text>
            </View>
          ) : <ProfileAvatar p={rival} size={size} />}
        </View>
        <Txt v="label" style={{ marginTop: 8 }} lines={1} color={rival === null ? C.muted : C.ink}>{rivalLabel ?? 'Rival'}</Txt>
      </Animated.View>
    </View>
  );
}

/** Slot-machine roll: spins through the pool while the VRF works, then lands on the rolled coin. */
export function CoinRoll({ pool, landed, size = 150 }: { pool: string[]; landed?: string | null; size?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (landed) return;
    const h = setInterval(() => setI((x) => (x + 1) % Math.max(1, pool.length)), 110);
    return () => clearInterval(h);
  }, [landed, pool.length]);
  const sym = landed ?? pool[i] ?? '…';
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size + 40, height: size + 40, borderRadius: 36, backgroundColor: '#101015', borderWidth: 2, borderColor: landed ? '#FFC94A' : 'transparent', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Animated.View key={landed ? `l-${sym}` : `s-${i}`} entering={landed ? ZoomIn.springify().damping(9) : FadeIn.duration(80)}>
          <CoinToken sym={sym} size={size} />
        </Animated.View>
      </View>
      <Text style={{ ...FONT.bold, fontSize: 28, color: C.ink, marginTop: 12, letterSpacing: -0.6 }}>{landed ? coinName(sym) : 'Rolling…'}</Text>
      <Txt v="small" color={landed ? '#FFC94A' : C.muted}>{landed ? 'Rolled by MagicBlock VRF' : 'MagicBlock VRF is picking one for both of you'}</Txt>
    </View>
  );
}

/** The two giant calls. */
export function CallButtons({ onUp, onDown, disabled, upLabel = 'UP', downLabel = 'DOWN' }: { onUp: () => void; onDown: () => void; disabled?: boolean; upLabel?: string; downLabel?: string }) {
  const big = (label: string, arrow: string, color: string, on: () => void) => (
    <Pressable onPress={on} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, height: 96, borderRadius: 24, backgroundColor: color, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }], opacity: disabled ? 0.5 : 1 })}>
      <Text style={{ ...FONT.bold, fontSize: 22, color: '#0A0A0D', lineHeight: 26 }}>{arrow}</Text>
      <Text style={{ ...FONT.bold, fontSize: 22, color: '#0A0A0D', letterSpacing: -0.4 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {big(upLabel, '▲', C.up, onUp)}
      {big(downLabel, '▼', C.down, onDown)}
    </View>
  );
}

/** Live tug-of-war: both scores, a bar that leans to whoever is ahead, the clock. */
export function LiveBoard({ me, rival, rivalPic, myPnl, theirPnl, myCall, theirCall, sym, price, entry, left, onRollup, perps }: {
  me?: Profile; rival?: Profile; /** A picture for the rival instead of a player avatar (Clashy Bot). */ rivalPic?: ReactNode; myPnl: number; theirPnl: number; myCall: number; theirCall: number; sym: string; price: number | null; entry: number; left: number | null; onRollup: boolean;
  /** A perps clash: each side's leverage and whether the chain knocked it out. */
  perps?: { myLev: number; theirLev: number; myKo: boolean; theirKo: boolean };
}) {
  const lead = Math.max(-1, Math.min(1, (myPnl - theirPnl) * 40));
  const pct = 50 + lead * 45;
  const fmt = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
  const move = price && entry ? ((price - entry) / entry) * 100 : 0;
  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.s2, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 5 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: onRollup ? C.up : C.muted }} />
          <Txt v="small" color={C.ink} style={{ ...FONT.medium, fontSize: 12 }}>{onRollup ? 'Live' : 'Final bell · settling'}</Txt>
        </View>
        <Text style={{ ...FONT.semi, fontSize: 56, color: C.ink, marginTop: 8, letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}>{left !== null ? (left >= 60 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : `${Math.ceil(left)}`) : '…'}</Text>
        <Txt v="small">{coinName(sym)} {price ? fmtUsd(price) : '…'} · {move >= 0 ? '+' : ''}{move.toFixed(3)}% since the start</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ProfileAvatar p={me} size={40} />
        <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: C.opp, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: 10, backgroundColor: C.brand }} />
          <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.7)' }} />
        </View>
        {rivalPic ?? <ProfileAvatar p={rival} size={40} />}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        {perps ? (
          <>
            <PerpsSide pnl={myPnl} call={myCall} lev={perps.myLev} ko={perps.myKo} entry={entry} who="You" />
            <PerpsSide pnl={theirPnl} call={theirCall} lev={perps.theirLev} ko={perps.theirKo} entry={entry} who={rival?.name ?? 'Rival'} right />
          </>
        ) : (
          <>
            <View>
              <Text style={{ ...FONT.semi, fontSize: 26, color: myPnl >= 0 ? C.up : C.down, fontVariant: ['tabular-nums'] }}>{fmt(myPnl)}</Text>
              <Txt v="small">You called {myCall === 1 ? 'UP ▲' : 'DOWN ▼'}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ ...FONT.semi, fontSize: 26, color: theirPnl >= 0 ? C.up : C.down, fontVariant: ['tabular-nums'] }}>{fmt(theirPnl)}</Text>
              <Txt v="small">{rival?.name ?? 'Rival'} called {theirCall === 1 ? 'UP ▲' : 'DOWN ▼'}</Txt>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/** One side of a perps clash: leveraged return, position, liquidation price, and "Liquidated" once knocked out. */
function PerpsSide({ pnl, call, lev, ko, entry, who, right }: { pnl: number; call: number; lev: number; ko: boolean; entry: number; who: string; right?: boolean }) {
  const out = ko || pnl <= -100;
  return (
    <View style={{ flex: 1, alignItems: right ? 'flex-end' : 'flex-start' }}>
      <Txt v="title" color={out ? C.down : pnl >= 0 ? C.up : C.down} style={{ ...FONT.bold }}>{out ? 'Liquidated' : `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`}</Txt>
      <Txt v="small" color={C.ink} style={{ textAlign: right ? 'right' : 'left' }}>{who} · {call === 2 ? 'Short' : 'Long'} {lev}×</Txt>
      <Txt v="small" style={{ textAlign: right ? 'right' : 'left' }}>{out ? 'Lost the whole stake' : `Liquidated at ${entry ? fmtUsd(liqPrice(entry, call, lev)) : '…'}`}</Txt>
    </View>
  );
}

/** Lobby mode card. */
/** One game mode in the lobby's picker: art, name, the rules in one line, and a radio. */
export function ModeRow({ title, sub, art, on, onPress, tag, index = 0 }: {
  title: string; sub: string; art: ReactNode; on: boolean; onPress: () => void; tag?: string; index?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 50).duration(340)}>
      <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${title}: ${sub}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 18, backgroundColor: on ? C.s2 : pressed ? C.s1 : C.card, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: on ? '#2A2833' : C.s2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{art}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt v="label">{title}</Txt>
            {tag ? <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(171,159,242,0.14)' }}><Text style={{ ...FONT.semi, fontSize: 11, color: C.brandSoft }}>{tag}</Text></View> : null}
          </View>
          <Txt v="small" lines={2} style={{ marginTop: 1, lineHeight: 17 }}>{sub}</Txt>
        </View>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? C.brand : '#2A2833', alignItems: 'center', justifyContent: 'center' }}>
          {on ? <Animated.View entering={ZoomIn.duration(180)} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.onBrand }} /> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** One open clash on the board. */
export function OpenClash({ who, stake, secs, mask, lev = 1, onJoin, disabled }: { who?: Profile; stake: number; secs: number; mask: number; lev?: number; onJoin: () => void; disabled?: boolean }) {
  const stocks = (mask & 0b1111_1000) !== 0 && (mask & 0b111) === 0;
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <ProfileAvatar p={who} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{who?.name ?? 'Someone'} wants a clash</Txt>
        <Row2>
          {lev > 1
            ? <Badge text={`${lev}× perps`} color={C.brandSoft} />
            : <Badge text={stocks ? 'Stocks · 1h' : secs >= 3600 ? '1 hour' : `Crypto · ${secs}s`} color={C.brandSoft} />}
          <Txt v="small">{fmtUsd(stake)} each</Txt>
        </Row2>
      </View>
      <Pressable onPress={onJoin} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Clash ${who?.name ?? 'this player'}`} style={({ pressed }) => ({ backgroundColor: C.brand, borderRadius: 20, paddingHorizontal: 16, height: 40, justifyContent: 'center', opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Text style={{ ...FONT.semi, fontSize: 14.5, color: C.onBrand }}>Clash</Text>
      </Pressable>
    </Animated.View>
  );
}
const Row2 = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>{children}</View>;
export const Badge = ({ text, color }: { text: string; color: string }) => (
  <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: color + '22' }}><Txt v="small" color={color} style={{ ...FONT.semi, fontSize: 11 }}>{text}</Txt></View>
);

/** A soft pulsing halo for "waiting" moments. */
export function Searching({ children }: { children: React.ReactNode }) {
  const s = useSharedValue(1);
  useEffect(() => { s.value = withRepeat(withTiming(1.35, { duration: 1300, easing: Easing.out(Easing.quad) }), -1, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 1.35 - s.value }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 3, borderColor: C.brand }, ring]} />
      {children}
    </View>
  );
}

