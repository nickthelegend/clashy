// Clash: the look of a real on-chain duel. Big faces, a slot-machine coin roll, giant UP / DOWN calls, a live
// tug-of-war, and the result. The chain plumbing stays in app/onchain.tsx; this file is only how it looks.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { Profile } from '@/chain/social';
import { COIN_SYMBOLS } from '@/chain/client';
import { ProfileAvatar, STOCK_ART } from './feed';
import { ART, Txt } from './kit';
import { C, F, fmtUsd } from './tokens';

const COIN_NAME: Record<string, string> = { SOL: 'Solana', BTC: 'Bitcoin', ETH: 'Ethereum', NVDA: 'NVIDIA', TSLA: 'Tesla', AAPL: 'Apple', SPY: 'S&P 500', GOOGL: 'Alphabet' };
const COIN_COLOR: Record<string, string> = { SOL: '#9B6BFF', BTC: '#F7931A', ETH: '#7C8CFF', NVDA: '#5B6CFF', TSLA: '#F0468C', AAPL: '#E8E2D4', SPY: '#FFC94A', GOOGL: '#3DDC97' };
export const coinName = (sym: string) => COIN_NAME[sym] ?? sym;
export const symbolsIn = (mask: number) => COIN_SYMBOLS.filter((_, i) => mask & (1 << i));

/** Real logos for the crypto coins (the stocks' logos are STOCK_ART). */
const COIN_LOGO: Record<string, number> = { SOL: ART.logoSOL, BTC: ART.logoBTC, ETH: ART.logoETH };
/** A coin or stock as a token: its real logo in a circle (a lettered disc only for an unknown symbol). */
export function CoinToken({ sym, size = 120 }: { sym: string; size?: number }) {
  const logo = STOCK_ART[sym] ?? COIN_LOGO[sym];
  if (logo) return <Image source={logo} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  const c = COIN_COLOR[sym] ?? C.brand;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: size * 0.06, borderColor: 'rgba(255,255,255,0.35)' }}>
      <Text style={{ fontFamily: F.display, fontSize: size * 0.3, color: '#0A0A0D' }}>{sym}</Text>
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
        <View style={{ borderRadius: size, borderWidth: 4, borderColor: C.brand, padding: 3 }}><ProfileAvatar p={me} size={size} /></View>
        <Txt v="label" style={{ marginTop: 8, fontFamily: F.semi, fontSize: 16 }} lines={1}>{meLabel}</Txt>
      </Animated.View>
      <Animated.View style={vs}>
        <Text style={{ fontFamily: F.bold, fontSize: 38, letterSpacing: -1.2, color: '#FFC94A', textShadowColor: C.opp, textShadowRadius: 12 }}>VS</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).springify()} style={{ alignItems: 'center', width: size + 30 }}>
        <View style={{ borderRadius: size, borderWidth: 4, borderColor: rival ? C.opp : '#2A2A33', padding: 3 }}>
          {rival === null ? (
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1C1C22', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.display, fontSize: size * 0.45, color: '#3A3A44' }}>?</Text>
            </View>
          ) : <ProfileAvatar p={rival} size={size} />}
        </View>
        <Txt v="label" style={{ marginTop: 8, fontFamily: F.semi, fontSize: 16 }} lines={1} color={rival === null ? C.muted : C.ink}>{rivalLabel ?? 'Rival'}</Txt>
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
      <View style={{ width: size + 40, height: size + 40, borderRadius: 36, backgroundColor: '#101015', borderWidth: 2, borderColor: landed ? '#FFC94A' : '#26262E', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Animated.View key={landed ? `l-${sym}` : `s-${i}`} entering={landed ? ZoomIn.springify().damping(9) : FadeIn.duration(80)}>
          <CoinToken sym={sym} size={size} />
        </Animated.View>
      </View>
      <Text style={{ fontFamily: F.display, fontSize: 34, color: C.ink, marginTop: 12, letterSpacing: -0.5 }}>{landed ? coinName(sym).toUpperCase() : 'Rolling…'}</Text>
      <Txt v="small" color={landed ? '#FFC94A' : C.muted}>{landed ? 'Rolled by MagicBlock VRF' : 'MagicBlock VRF is picking one for both of you'}</Txt>
    </View>
  );
}

/** The two giant calls. */
export function CallButtons({ onUp, onDown, disabled }: { onUp: () => void; onDown: () => void; disabled?: boolean }) {
  const big = (label: string, arrow: string, color: string, on: () => void) => (
    <Pressable onPress={on} disabled={disabled} style={({ pressed }) => ({ flex: 1, height: 132, borderRadius: 28, backgroundColor: color, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }], opacity: disabled ? 0.5 : 1, shadowColor: color, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } })}>
      <Text style={{ fontFamily: F.bold, fontSize: 38, letterSpacing: -1.2, color: '#0A0A0D', lineHeight: 46 }}>{arrow}</Text>
      <Text style={{ fontFamily: F.display, fontSize: 34, color: '#0A0A0D' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {big('UP', '▲', C.up, onUp)}
      {big('DOWN', '▼', C.down, onDown)}
    </View>
  );
}

/** Live tug-of-war: both scores, a bar that leans to whoever is ahead, the clock. */
export function LiveBoard({ me, rival, myPnl, theirPnl, myCall, theirCall, sym, price, entry, left, onRollup }: {
  me?: Profile; rival?: Profile; myPnl: number; theirPnl: number; myCall: number; theirCall: number; sym: string; price: number | null; entry: number; left: number | null; onRollup: boolean;
}) {
  const lead = Math.max(-1, Math.min(1, (myPnl - theirPnl) * 40));
  const pct = 50 + lead * 45;
  const fmt = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
  const move = price && entry ? ((price - entry) / entry) * 100 : 0;
  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: onRollup ? 'rgba(240,70,140,0.16)' : '#1A1A20', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.opp }} />
          <Txt v="small" color={C.ink} style={{ fontFamily: F.semi, fontSize: 12 }}>{onRollup ? 'LIVE' : 'Final bell · settling'}</Txt>
        </View>
        <Text style={{ fontFamily: F.display, fontSize: 64, color: C.ink, marginTop: 10, letterSpacing: -1 }}>{left !== null ? (left >= 60 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : `${Math.ceil(left)}`) : '…'}</Text>
        <Txt v="small">{coinName(sym)} {price ? fmtUsd(price) : '…'} · {move >= 0 ? '+' : ''}{move.toFixed(3)}% since the start</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ProfileAvatar p={me} size={46} />
        <View style={{ flex: 1, height: 22, borderRadius: 11, backgroundColor: C.opp, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: 22, backgroundColor: C.brand }} />
          <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.7)' }} />
        </View>
        <ProfileAvatar p={rival} size={46} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <View>
          <Text style={{ fontFamily: F.display, fontSize: 30, color: myPnl >= 0 ? C.up : C.down }}>{fmt(myPnl)}</Text>
          <Txt v="small">You called {myCall === 1 ? 'UP ▲' : 'DOWN ▼'}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: F.display, fontSize: 30, color: theirPnl >= 0 ? C.up : C.down }}>{fmt(theirPnl)}</Text>
          <Txt v="small">{rival?.name ?? 'Rival'} called {theirCall === 1 ? 'UP ▲' : 'DOWN ▼'}</Txt>
        </View>
      </View>
    </View>
  );
}

/** Lobby mode card. */
export function ModeCard({ title, sub, art, on, onPress }: { title: string; sub: string; art: React.ReactNode; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, borderRadius: 24, padding: 14, backgroundColor: on ? C.brand : '#15151B', borderWidth: 2, borderColor: on ? '#8C98FF' : '#23232B', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <View style={{ height: 78, alignItems: 'center', justifyContent: 'center' }}>{art}</View>
      <Text style={{ fontFamily: F.display, fontSize: 24, color: on ? '#fff' : C.ink, marginTop: 6 }}>{title}</Text>
      <Txt v="small" color={on ? '#DDE1FF' : C.muted}>{sub}</Txt>
    </Pressable>
  );
}

/** One open clash on the board. */
export function OpenClash({ who, stake, secs, mask, onJoin, disabled }: { who?: Profile; stake: number; secs: number; mask: number; onJoin: () => void; disabled?: boolean }) {
  const stocks = (mask & 0b1111_1000) !== 0 && (mask & 0b111) === 0;
  return (
    <Animated.View entering={FadeInDown.springify()} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#15151B', borderRadius: 22, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#23232B' }}>
      <ProfileAvatar p={who} size={46} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{who?.name ?? 'Someone'} wants a clash</Txt>
        <Row2>
          <Badge text={stocks ? 'Stocks · 1h' : secs >= 3600 ? '1 hour' : `Crypto · ${secs}s`} color={stocks ? '#FFC94A' : C.brandSoft} />
          <Txt v="small">{fmtUsd(stake)} each</Txt>
        </Row2>
      </View>
      <Pressable onPress={onJoin} disabled={disabled} style={({ pressed }) => ({ backgroundColor: C.opp, borderRadius: 16, paddingHorizontal: 16, height: 42, justifyContent: 'center', opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Text style={{ fontFamily: F.semi, fontSize: 17, color: '#fff' }}>Clash</Text>
      </Pressable>
    </Animated.View>
  );
}
const Row2 = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>{children}</View>;
export const Badge = ({ text, color }: { text: string; color: string }) => (
  <View style={{ borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: color + '26' }}><Txt v="small" color={color} style={{ fontFamily: F.bold, fontSize: 10 }}>{text}</Txt></View>
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

