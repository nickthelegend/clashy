// Royale: the look of the on-chain last-one-standing game. Hearts, seat dots, a draining round ring around the
// coin, the table of players as faces, and the open-Royale cards. The chain plumbing stays in app/onchain-royale.tsx.
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { Profile } from '@/chain/social';
import { CoinToken, coinName } from './clash';
import { ProfileAvatar } from './feed';
import { FX } from './fx';
import { Txt } from './kit';
import { C, F, fmtUsd } from './tokens';

/** The Royale's own accent: gold, the crown and the pot. */
export const GOLD = '#FFC94A';
export const SURFACE = '#15151B';
export const EDGE = '#23232B';

/** A row of hearts: full for the lives left, broken for the ones lost. */
export function Hearts({ lives, max, size = 16, gap = 2 }: { lives: number; max: number; size?: number; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap }} accessibilityLabel={`${lives} of ${max} hearts left`}>
      {Array.from({ length: max }, (_, i) => (
        <Image key={i} source={i < lives ? FX.heart : FX.heartBroken} style={{ width: size, height: size, opacity: i < lives ? 1 : 0.35 }} contentFit="contain" />
      ))}
    </View>
  );
}

/** Seats as dots: filled for taken, hollow for free. */
export function SeatDots({ taken, max }: { taken: number; max: number }) {
  const d = max > 8 ? 6 : 8;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, maxWidth: 8 * (d + 3) }} accessibilityLabel={`${taken} of ${max} seats taken`}>
      {Array.from({ length: max }, (_, i) => (
        <View key={i} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: i < taken ? GOLD : 'transparent', borderWidth: 1.5, borderColor: i < taken ? GOLD : '#3A3A44' }} />
      ))}
    </View>
  );
}

/** Pill segmented control (seats, hearts). Every segment is a 44 px tap target. */
export function Segmented<K extends string>({ label, items, value, onChange }: { label: string; items: { key: K; label: ReactNode }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Txt v="small" style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 1, marginBottom: 6 }} color={C.muted}>{label}</Txt>
      <View style={{ flexDirection: 'row', backgroundColor: SURFACE, borderRadius: 24, padding: 4, borderWidth: 1, borderColor: EDGE }}>
        {items.map((it) => {
          const on = it.key === value;
          return (
            <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 20, backgroundColor: on ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              {typeof it.label === 'string'
                ? <Text style={{ fontFamily: F.display, fontSize: 18, color: on ? '#000' : C.ink }}>{it.label}</Text>
                : it.label}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Three tiny steps: how a Royale plays. */
export function HowItWorks({ secs }: { secs: number }) {
  const step = (n: number, art: ReactNode, line: string) => (
    <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: EDGE }}>
      <View style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}>{art}</View>
      <Txt v="small" color={C.ink} style={{ textAlign: 'center', marginTop: 6, fontFamily: F.semi, fontSize: 12, lineHeight: 15 }}>{line}</Txt>
      <Text style={{ position: 'absolute', top: 6, left: 9, fontFamily: F.display, fontSize: 12, color: '#3A3A44' }}>{n}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
      {step(1, <CoinToken sym="BTC" size={38} />, 'One coin for the whole table')}
      {step(2, <Text style={{ fontFamily: F.display, fontSize: 24 }}><Text style={{ color: C.up }}>▲</Text><Text style={{ color: C.down }}>▼</Text></Text>, `Call up or down every ${secs} s`)}
      {step(3, <Image source={FX.heartBroken} style={{ width: 34, height: 34 }} contentFit="contain" />, 'Wrong call costs a heart')}
    </View>
  );
}

/** The round clock: a ring around the coin that drains as the call window closes. */
export function RoundRing({ sym, left, total, size = 190 }: { sym: string; left: number; total: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const color = left <= 0 ? '#3A3A44' : left < 3 ? C.opp : GOLD;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#1C1C22" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <CoinToken sym={sym} size={size - 62} />
    </View>
  );
}

/** Slot-machine roll for the table's coin: spins while it is being picked, then lands. */
export function TableRoll({ pool, landed, size = 120 }: { pool: string[]; landed?: string | null; size?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (landed) return;
    const h = setInterval(() => setI((x) => (x + 1) % Math.max(1, pool.length)), 110);
    return () => clearInterval(h);
  }, [landed, pool.length]);
  const sym = landed ?? pool[i] ?? '…';
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size + 36, height: size + 36, borderRadius: 34, backgroundColor: '#101015', borderWidth: 2, borderColor: landed ? GOLD : '#26262E', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Animated.View key={landed ? `l-${sym}` : `s-${i}`} entering={landed ? ZoomIn.springify().damping(9) : FadeIn.duration(80)}>
          <CoinToken sym={sym} size={size} />
        </Animated.View>
      </View>
      <Text style={{ fontFamily: F.display, fontSize: 30, color: C.ink, marginTop: 10, letterSpacing: -0.5 }}>{landed ? coinName(sym).toUpperCase() : 'ROLLING…'}</Text>
      <Txt v="small" color={landed ? GOLD : C.muted}>{landed ? 'The coin for this table' : 'Picking one coin for everyone'}</Txt>
    </View>
  );
}

export type Seat = { key: string; profile?: Profile; name: string; lives: number; you: boolean; host: boolean; called?: boolean; winner?: boolean };

/** The table: every player as a face with their hearts; knocked-out players greyed, empty seats as hollow rings. */
export function Table({ seats, startLives, empty = 0, showCalls }: { seats: Seat[]; startLives: number; empty?: number; showCalls?: boolean }) {
  const W = 62;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8, rowGap: 14 }}>
      {seats.map((s, i) => {
        const out = s.lives === 0;
        const ring = s.winner ? GOLD : s.you ? C.brand : out ? '#26262E' : '#2E2E38';
        return (
          <Animated.View key={s.key} entering={FadeInDown.delay(i * 40).springify()} style={{ width: W, alignItems: 'center', opacity: out ? 0.38 : 1 }}>
            <View>
              <View style={{ borderRadius: 40, borderWidth: 3, borderColor: ring, padding: 2 }}><ProfileAvatar p={s.profile} size={46} /></View>
              {s.host ? <View style={{ position: 'absolute', top: -6, right: -4, backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}><Text style={{ fontFamily: F.bold, fontSize: 8, color: '#000' }}>HOST</Text></View> : null}
              {showCalls && !out ? (
                <View style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: s.called ? C.up : '#2A2A33', borderWidth: 2, borderColor: '#07070A', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 9, color: s.called ? '#03140A' : C.muted }}>{s.called ? '✓' : '…'}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: 11.5, color: s.you ? C.brandSoft : C.ink, marginTop: 5, maxWidth: W }}>{s.name}</Text>
            <View style={{ marginTop: 3 }}>{out ? <Text style={{ fontFamily: F.bold, fontSize: 10, color: C.down, letterSpacing: 0.5 }}>OUT</Text> : <Hearts lives={s.lives} max={startLives} size={startLives > 2 ? 12 : 14} gap={1} />}</View>
          </Animated.View>
        );
      })}
      {Array.from({ length: empty }, (_, i) => (
        <View key={`e-${i}`} style={{ width: W, alignItems: 'center' }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed', borderColor: '#33333D', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.display, fontSize: 18, color: '#3A3A44' }}>+</Text>
          </View>
          <Text style={{ fontFamily: F.semi, fontSize: 11.5, color: C.dim, marginTop: 5 }}>Open</Text>
        </View>
      ))}
    </View>
  );
}

/** One open Royale in the lobby: host face and name, seats, hearts, the pot and a join button. */
export function OpenRoyale({ host, hostName, taken, max, lives, pot, age, mine, onJoin, onOpen, disabled, stale }: {
  host?: Profile; hostName: string; taken: number; max: number; lives: number; pot: number; age: string; mine: boolean;
  onJoin: () => void; onOpen: () => void; disabled?: boolean; stale?: boolean;
}) {
  const full = taken >= max;
  const label = mine ? 'OPEN' : full ? 'FULL' : 'JOIN';
  return (
    <Animated.View entering={FadeInDown.springify()} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 22, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: mine ? 'rgba(91,108,255,0.5)' : EDGE, opacity: stale ? 0.7 : 1 }}>
      <ProfileAvatar p={host} size={46} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{mine ? 'Your Royale' : `${hostName}'s Royale`}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
          <SeatDots taken={taken} max={max} />
          <Txt v="small" style={{ fontSize: 11.5 }}>{taken}/{max}</Txt>
          <Hearts lives={lives} max={lives} size={12} gap={1} />
        </View>
        <Txt v="small" style={{ fontSize: 11, marginTop: 3 }} color={C.dim}>{age}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontFamily: F.display, fontSize: 16, color: GOLD }}>{fmtUsd(pot)}</Text>
        <Pressable onPress={mine ? onOpen : onJoin} disabled={!mine && (disabled || full)} accessibilityRole="button"
          style={({ pressed }) => ({ backgroundColor: mine ? C.s2 : GOLD, borderRadius: 16, paddingHorizontal: 16, height: 44, minWidth: 76, alignItems: 'center', justifyContent: 'center', opacity: !mine && (disabled || full) ? 0.45 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Text style={{ fontFamily: F.display, fontSize: 16, color: mine ? C.ink : '#000' }}>{label}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** The one huge call to action. */
export function BigCta({ title, onPress, disabled, color = GOLD, ink = '#000' }: { title: string; onPress: () => void; disabled?: boolean; color?: string; ink?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({ marginTop: 18, height: 70, borderRadius: 24, backgroundColor: color, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }], shadowColor: color, shadowOpacity: disabled ? 0 : 0.55, shadowRadius: 20, shadowOffset: { width: 0, height: 6 } })}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: F.display, fontSize: 23, color: ink }}>{title}</Text>
    </Pressable>
  );
}

/** Small all-caps status pill (round counter, live dot). */
export function StatusPill({ text, color = C.opp, dot = true }: { text: string; color?: string; dot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: color + '26', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.ink, letterSpacing: 0.5 }}>{text}</Text>
    </View>
  );
}
