// Home's "Top calls right now": the best real positions behind recent calls, shown as ranked game cards.
// Rank 1 to 3 wear gold, silver and bronze; the rest wear Clashy's lavender. Every number is the player's on-chain
// position (shares and what they paid) marked to the live price.
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Profile } from '@/chain/social';
import { ProfileAvatar, STOCK_ART } from './feed';
import { ART, Txt } from './kit';
import { C, FONT } from './tokens';

export type TopCall = { key: string; owner: string; sym: string; pnl: number; cost: number };

/** Gold, silver, bronze, then lavender: the card's tint, its rim and its rank chip. */
const TIERS = [
  { tint: ['#4A3510', '#1A150C', '#111014'], rim: 'rgba(255,200,72,0.55)', chip: ['#FFE08A', '#F2A93B'], chipInk: '#3A2400', glow: 'rgba(255,196,60,0.30)' },
  { tint: ['#343846', '#16171C', '#111114'], rim: 'rgba(214,222,240,0.40)', chip: ['#F4F6FB', '#AAB2C5'], chipInk: '#22252E', glow: 'rgba(200,210,235,0.22)' },
  { tint: ['#45261A', '#1A120E', '#111013'], rim: 'rgba(232,146,96,0.45)', chip: ['#F6B48A', '#C86B3C'], chipInk: '#3A1606', glow: 'rgba(230,140,90,0.24)' },
  { tint: ['#2A2249', '#16131F', '#111014'], rim: 'rgba(171,159,242,0.32)', chip: ['#D9D2FF', '#9C8EF0'], chipInk: '#1B1240', glow: 'rgba(171,159,242,0.22)' },
] as const;

export function TopCallCard({ t, rank, profile }: { t: TopCall; rank: number; profile?: Profile }) {
  const tier = TIERS[Math.min(rank, 4) - 1];
  const up = t.pnl >= 0;
  const pct = t.cost > 0 ? (t.pnl / t.cost) * 100 : 0;
  const logo = STOCK_ART[t.sym];
  return (
    <Pressable
      onPress={() => router.push(`/u/${t.owner}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`Rank ${rank}: ${profile?.name ?? 'player'}, ${t.sym}, ${up ? 'up' : 'down'} ${Math.abs(t.pnl).toFixed(2)} dollars`}
      style={({ pressed }) => ({ width: 158, paddingTop: rank === 1 ? 14 : 0, transform: [{ scale: pressed ? 0.96 : 1 }] })}
    >
      <LinearGradient colors={tier.tint} start={{ x: 0.1, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ borderRadius: 24, borderWidth: 1.5, borderColor: tier.rim, padding: 12, paddingTop: 14, overflow: 'hidden' }}>
        {/* a soft shine across the top corner, like a foil card */}
        <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.55, y: 0.45 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none" />

        {/* rank chip, and the stock the call is on */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <LinearGradient colors={tier.chip} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ minWidth: 30, height: 24, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="label" color={tier.chipInk} style={{ ...FONT.bold, fontSize: 13 }}>#{rank}</Txt>
          </LinearGradient>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 11, letterSpacing: 0.4 }}>{t.sym}</Txt>
          </View>
        </View>

        {/* the stock's logo on a glow, with the caller's avatar pinned to it */}
        <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: tier.glow, alignItems: 'center', justifyContent: 'center' }}>
            {logo ? <Image source={logo} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="contain" /> : <Txt v="h2">{t.sym}</Txt>}
            <View style={{ position: 'absolute', right: -4, bottom: -2, borderRadius: 17, borderWidth: 2.5, borderColor: '#141217' }}>
              <ProfileAvatar p={profile} size={30} />
            </View>
          </View>
        </View>

        <Txt v="label" lines={1} style={{ textAlign: 'center', fontSize: 14 }}>@{profile?.name ?? 'player'}</Txt>
        <Txt v="title" color={up ? C.up : C.down} style={{ ...FONT.bold, fontSize: 24, letterSpacing: -0.5, textAlign: 'center', marginTop: 2 }}>
          {up ? '+' : '−'}${Math.abs(t.pnl).toFixed(2)}
        </Txt>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <View style={{ backgroundColor: up ? C.upBg : C.downBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Txt v="small" color={up ? C.up : C.down} style={{ ...FONT.semi, fontSize: 11 }}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%</Txt>
          </View>
          <Txt v="small" style={{ fontSize: 11 }}>on ${t.cost.toFixed(0)}</Txt>
        </View>
      </LinearGradient>

      {/* the leader wears the crown */}
      {rank === 1 ? <Image source={ART.crown} style={{ position: 'absolute', top: -4, left: 59, width: 40, height: 40, transform: [{ rotate: '-8deg' }] }} contentFit="contain" /> : null}
    </Pressable>
  );
}
