// Royale: the look of the on-chain last-one-standing game. Hearts, a draining round ring around the coin, the table
// of players as faces (in play, the game's gold and pink markers), and the lobby's segmented pickers and open-table
// rows (wallet-app plain). The chain plumbing stays in app/onchain-royale.tsx.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { Profile } from '@/chain/social';
import { CoinToken, coinName } from './clash';
import { ProfileAvatar } from './feed';
import { FX } from './fx';
import { Txt } from './kit';
import { C, FONT, fmtUsd } from './tokens';

/** The Royale's in-game accent: gold, the crown and the pot (only on a table in play). */
export const GOLD = '#FFC94A';
/** The one card surface. */
export const SURFACE = C.card;

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

/** A segmented control on a card track, like the Clash lobby's stake picker. Every segment is a 42 px pill with a
 *  44 px touch area; the selected one is white with black text. */
export function Segmented<K extends string>({ label, note, items, value, onChange }: { label: string; note?: string; items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20, marginBottom: 8 }}>
        <Txt v="small" style={{ ...FONT.semi, color: C.dim }}>{label}</Txt>
        {note ? <Txt v="small" lines={1} style={{ flexShrink: 1 }}>{note}</Txt> : null}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 18, padding: 4, gap: 4 }}>
        {items.map((it) => {
          const on = it.key === value;
          return (
            <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="button" accessibilityState={{ selected: on }} hitSlop={2}
              style={({ pressed }) => ({ flex: 1, height: 42, borderRadius: 14, backgroundColor: on ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <Text style={{ ...FONT.semi, fontSize: 15.5, color: on ? '#000' : C.ink }}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The round clock: a ring around the coin that drains as the call window closes. */
export function RoundRing({ sym, left, total, size = 190 }: { sym: string; left: number; total: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const color = left <= 0 ? C.s2 : left < 3 ? C.opp : GOLD;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.s2} strokeWidth={stroke} fill="none" />
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
      <View style={{ width: size + 36, height: size + 36, borderRadius: 34, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Animated.View key={landed ? `l-${sym}` : `s-${i}`} entering={landed ? ZoomIn.springify().damping(9) : FadeIn.duration(80)}>
          <CoinToken sym={sym} size={size} />
        </Animated.View>
      </View>
      <Text style={{ ...FONT.semi, fontSize: 28, color: C.ink, marginTop: 10, letterSpacing: -0.6 }}>{landed ? coinName(sym) : 'Rolling…'}</Text>
      <Txt v="small" color={landed ? GOLD : C.muted}>{landed ? 'The coin for this table' : 'Picking one coin for everyone'}</Txt>
    </View>
  );
}

export type Seat = { key: string; profile?: Profile; name: string; lives: number; you: boolean; host: boolean; called?: boolean; winner?: boolean };

/** The table: every player as a face with their hearts; knocked-out players greyed, empty seats as open circles. */
export function Table({ seats, startLives, empty = 0, showCalls }: { seats: Seat[]; startLives: number; empty?: number; showCalls?: boolean }) {
  const W = 62;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8, rowGap: 14 }}>
      {seats.map((s, i) => {
        const out = s.lives === 0;
        const ring = s.winner ? GOLD : s.you ? C.brand : 'transparent';
        return (
          <Animated.View key={s.key} entering={FadeInDown.delay(i * 40).duration(300)} style={{ width: W, alignItems: 'center', opacity: out ? 0.38 : 1 }}>
            <View>
              <View style={{ borderRadius: 40, borderWidth: 2.5, borderColor: ring, padding: 2 }}><ProfileAvatar p={s.profile} size={46} /></View>
              {s.host ? <View style={{ position: 'absolute', top: -6, right: -4, backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}><Text style={{ ...FONT.bold, fontSize: 8, color: '#000' }}>Host</Text></View> : null}
              {showCalls && !out ? (
                <View style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: s.called ? C.up : C.s2, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ ...FONT.bold, fontSize: 9, color: s.called ? '#03140A' : C.muted }}>{s.called ? '✓' : '…'}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 11.5, color: s.you ? C.brandSoft : C.ink, marginTop: 5, maxWidth: W }}>{s.name}</Text>
            <View style={{ marginTop: 3 }}>{out ? <Text style={{ ...FONT.semi, fontSize: 10.5, color: C.down }}>Out</Text> : <Hearts lives={s.lives} max={startLives} size={startLives > 2 ? 12 : 14} gap={1} />}</View>
          </Animated.View>
        );
      })}
      {Array.from({ length: empty }, (_, i) => (
        <View key={`e-${i}`} style={{ width: W, alignItems: 'center' }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...FONT.semi, fontSize: 18, color: C.dim }}>+</Text>
          </View>
          <Text style={{ ...FONT.semi, fontSize: 11.5, color: C.dim, marginTop: 5 }}>Open</Text>
        </View>
      ))}
    </View>
  );
}

/** One open Royale in the lobby, as a list row: host face, the table in one line, the pot and a Join pill. */
export function OpenRoyale({ host, hostName, taken, max, lives, pot, age, mine, onJoin, onOpen, disabled, stale, index = 0 }: {
  host?: Profile; hostName: string; taken: number; max: number; lives: number; pot: number; age: string; mine: boolean;
  onJoin: () => void; onOpen: () => void; disabled?: boolean; stale?: boolean; index?: number;
}) {
  const full = taken >= max;
  const label = mine ? 'Open' : full ? 'Full' : 'Join';
  const off = !mine && (disabled || full);
  return (
    <Animated.View entering={FadeInDown.delay(index * 35).duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: stale ? 0.6 : 1 }}>
      <ProfileAvatar p={host} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{mine ? 'Your Royale' : `${hostName}'s Royale`}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 1 }}>{taken}/{max} seats · {lives} heart{lives === 1 ? '' : 's'} · {age}</Txt>
      </View>
      <Txt v="num" lines={1}>{fmtUsd(pot)}</Txt>
      <Pressable onPress={mine ? onOpen : onJoin} disabled={off} accessibilityRole="button" accessibilityLabel={`${label} ${mine ? 'your' : `${hostName}'s`} Royale`} hitSlop={6}
        style={({ pressed }) => ({ backgroundColor: C.s2, borderRadius: 18, paddingHorizontal: 14, height: 36, minWidth: 64, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.4 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Text style={{ ...FONT.semi, fontSize: 13.5, color: C.ink }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Small status pill on a table in play (round counter, players left). */
export function StatusPill({ text, color = C.opp, dot = true }: { text: string; color?: string; dot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: color + '26', borderRadius: 13, paddingHorizontal: 11, paddingVertical: 5 }}>
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} /> : null}
      <Text style={{ ...FONT.semi, fontSize: 12, color: C.ink }}>{text}</Text>
    </View>
  );
}
