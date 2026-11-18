// Home's "Top calls right now": the best real positions behind recent calls, shown as small ranked game cards.
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
  { tint: ['#3E2C0D', '#16130C'], rim: 'rgba(255,200,72,0.50)', chip: ['#FFE08A', '#F2A93B'], chipInk: '#3A2400' },
  { tint: ['#2E313C', '#141519'], rim: 'rgba(214,222,240,0.36)', chip: ['#F4F6FB', '#AAB2C5'], chipInk: '#22252E' },
  { tint: ['#3A2117', '#16110E'], rim: 'rgba(232,146,96,0.42)', chip: ['#F6B48A', '#C86B3C'], chipInk: '#3A1606' },
  { tint: ['#241E3D', '#14121B'], rim: 'rgba(171,159,242,0.28)', chip: ['#D9D2FF', '#9C8EF0'], chipInk: '#1B1240' },
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
      style={({ pressed }) => ({ paddingTop: 8, transform: [{ scale: pressed ? 0.96 : 1 }] })}
    >
      <LinearGradient colors={tier.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 172, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: tier.rim, paddingVertical: 10, paddingLeft: 10, paddingRight: 12, overflow: 'hidden' }}>
        {/* the stock's logo with the caller's avatar pinned to it */}
        <View style={{ width: 42, height: 42 }}>
          {logo ? <Image source={logo} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="contain" /> : <Txt v="label">{t.sym}</Txt>}
          <View style={{ position: 'absolute', right: -5, bottom: -4, borderRadius: 11, borderWidth: 2, borderColor: '#141217' }}>
            <ProfileAvatar p={profile} size={18} />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LinearGradient colors={tier.chip} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ height: 16, borderRadius: 8, paddingHorizontal: 5, justifyContent: 'center' }}>
              <Txt v="small" color={tier.chipInk} style={{ ...FONT.bold, fontSize: 10, lineHeight: 12 }}>#{rank}</Txt>
            </LinearGradient>
            <Txt v="small" color={C.ink} lines={1} style={{ ...FONT.semi, fontSize: 12, flexShrink: 1 }}>{profile?.name ?? 'player'}</Txt>
          </View>
          <Txt v="label" color={up ? C.up : C.down} style={{ ...FONT.bold, fontSize: 17, letterSpacing: -0.3, marginTop: 2 }}>{up ? '+' : '−'}${Math.abs(t.pnl).toFixed(2)}</Txt>
          <Txt v="small" lines={1} style={{ fontSize: 11 }}><Txt v="small" color={up ? C.up : C.down} style={{ ...FONT.semi, fontSize: 11 }}>{up ? '▲' : '▼'}{Math.abs(pct).toFixed(2)}%</Txt> · {t.sym}</Txt>
        </View>
      </LinearGradient>

      {/* the leader wears the crown */}
      {rank === 1 ? <Image source={ART.crown} style={{ position: 'absolute', top: -1, left: 1, width: 24, height: 24, transform: [{ rotate: '-20deg' }] }} contentFit="contain" /> : null}
    </Pressable>
  );
}
