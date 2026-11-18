// Squad building blocks shared by the Squads tab, Discover and the squad drawers: the Discord-style rail icon, the
// banner, the level bar, channel groups and rows, the member stack. Pure presentation: every value comes in as props.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { Profile } from '@/chain/social';
import { ProfileAvatar } from '@/ui/feed';
import { ART, Art, CRESTS, Row, Txt } from '@/ui/kit';
import { C, F, FONT } from '@/ui/tokens';

export const GOLD = '#FFC94A';
export const CARD = '#15151B';
export const HAIR = '#23232B';
export const crestSrc = (n: number) => CRESTS[n % CRESTS.length];

/** A squad icon in the rail: squircle when selected, white pill on the left edge (tall = selected, short = unread). */
export function RailIcon({ crest, selected, unread, label, onPress }: { crest: number; selected: boolean; unread: number; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={{ width: '100%', alignItems: 'center', justifyContent: 'center', height: 54 }}>
      {selected || unread ? (
        <View style={{ position: 'absolute', left: 0, width: 4, height: selected ? 38 : 9, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: C.ink }} />
      ) : null}
      <View style={{ width: 48, height: 48, borderRadius: selected ? 16 : 24, overflow: 'hidden', backgroundColor: selected ? '#221F33' : CARD, borderWidth: 2, borderColor: selected ? C.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={crestSrc(crest)} style={{ width: 42, height: 42 }} contentFit="contain" />
      </View>
      {unread > 0 ? (
        <View style={{ position: 'absolute', right: 6, bottom: 3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.opp, borderWidth: 2.5, borderColor: C.bg, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="small" color="#fff" style={{ fontSize: 9.5, ...FONT.bold, lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A round rail button (discover ✦, create +). */
export function RailButton({ glyph, label, onPress, color = C.up }: { glyph: string; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: pressed ? 16 : 24, backgroundColor: pressed ? color : CARD, alignItems: 'center', justifyContent: 'center', marginVertical: 3 })}>
      {({ pressed }) => <Txt v="label" color={pressed ? '#000' : color} style={{ fontSize: glyph === '+' ? 26 : 19, lineHeight: 28, marginTop: glyph === '+' ? -2 : 0 }}>{glyph}</Txt>}
    </Pressable>
  );
}

/** Level chip + XP bar (clanLevel: wars won, members, chest). */
export function LevelBar({ level, xp, floor, next }: { level: number; xp: number; floor: number; next: number }) {
  const pct = Math.max(3, Math.min(100, ((xp - floor) / Math.max(1, next - floor)) * 100));
  return (
    <Row style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,201,74,0.14)', borderRadius: 9, paddingLeft: 3, paddingRight: 8, height: 26 }}>
        <Image source={ART.levelStar} style={{ width: 22, height: 22 }} contentFit="contain" />
        <Txt v="label" color={GOLD} style={{ ...FONT.semi, fontSize: 13 }}>LV {level}</Txt>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: '#24242C', overflow: 'hidden' }}>
          <LinearGradient colors={[C.brand, '#9AA5FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${pct}%`, height: 8, borderRadius: 4 }} />
        </View>
      </View>
      <Txt v="small" style={{ fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{xp - floor}/{next - floor} XP</Txt>
    </Row>
  );
}

/** Banner art with a fade into the card and the crest overlapping its bottom edge. */
export function SquadBanner({ crest, height = 112, children }: { crest: number; height?: number; children?: ReactNode }) {
  return (
    <View>
      <View style={{ height, overflow: 'hidden', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        {children ?? <Image source={ART.clanCity} style={{ width: '100%', height }} contentFit="cover" />}
        <LinearGradient colors={['rgba(21,21,27,0)', 'rgba(21,21,27,0.35)', CARD]} locations={[0, 0.55, 1]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.7 }} />
      </View>
      <View style={{ position: 'absolute', left: 14, bottom: -26, width: 64, height: 64, borderRadius: 20, backgroundColor: CARD, borderWidth: 3, borderColor: CARD, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Art src={crestSrc(crest)} size={58} radius={17} />
      </View>
    </View>
  );
}

/** "CHALLENGES ⌄" group header. */
export const Group = ({ title, right }: { title: string; right?: ReactNode }) => (
  <Row style={{ marginTop: 18, marginBottom: 4, paddingHorizontal: 6, gap: 6 }}>
    <Txt v="small" color={C.dim} style={{ fontSize: 10 }}>⌄</Txt>
    <Txt v="small" color={C.muted} style={{ ...FONT.bold, fontSize: 11, letterSpacing: 1.1, flex: 1 }}>{title}</Txt>
    {right}
  </Row>
);

export const Badge = ({ text, color = C.brand, fg = '#fff' }: { text: string; color?: string; fg?: string }) => (
  <View style={{ backgroundColor: color, borderRadius: 7, paddingHorizontal: 7, height: 19, justifyContent: 'center' }}>
    <Txt v="small" color={fg} style={{ fontSize: 10, ...FONT.bold, letterSpacing: 0.3 }}>{text}</Txt>
  </View>
);

/** A channel: "#" + name, a one-line preview, badges on the right. Unread channels read bright with a pill on the edge. */
export function Channel({ name, glyph = '#', sub, badge, badgeColor, live, unread, count, onPress }: {
  name: string; glyph?: string | ((color: string) => ReactNode); sub?: string; badge?: string; badgeColor?: string; live?: boolean; unread?: boolean; count?: number; onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, backgroundColor: pressed ? '#1A1A21' : 'transparent' })}>
      {unread ? <View style={{ position: 'absolute', left: -12, width: 4, height: 8, borderRadius: 2, backgroundColor: C.ink }} /> : null}
      <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' }}>
        {typeof glyph === 'string' ? <Txt v="label" color={unread ? C.ink : C.muted} style={{ fontSize: 15, ...FONT.bold }}>{glyph}</Txt> : glyph(unread ? C.ink : C.muted)}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1} color={unread ? C.ink : '#C9C9D1'} style={{ ...(unread ? FONT.bold : FONT.semi), fontSize: 14.5 }}>{name}</Txt>
        {sub ? <Txt v="small" lines={1} color={unread ? '#A9A9B3' : C.muted} style={{ fontSize: 12 }}>{sub}</Txt> : null}
      </View>
      {live ? <Badge text="LIVE" color={C.opp} /> : null}
      {badge ? <Badge text={badge} color={badgeColor} /> : null}
      {count !== undefined && count > 0 ? <Txt v="small" color={C.dim} style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>{count}</Txt> : null}
    </Pressable>
  );
}

/** Overlapping member avatars with a "+N". */
export function MemberStack({ profiles, total, size = 30, max = 5 }: { profiles: (Profile | undefined)[]; total: number; size?: number; max?: number }) {
  const shown = profiles.slice(0, max);
  return (
    <Row>
      {shown.map((p, i) => (
        <View key={i} style={{ marginLeft: i ? -size * 0.32 : 0, borderRadius: size, borderWidth: 2.5, borderColor: CARD }}>
          <ProfileAvatar p={p} size={size} />
        </View>
      ))}
      {total > shown.length ? (
        <View style={{ marginLeft: -size * 0.32, width: size + 5, height: size + 5, borderRadius: size, backgroundColor: '#24242C', borderWidth: 2.5, borderColor: CARD, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="small" color={C.ink} style={{ fontSize: 11, ...FONT.bold }}>+{total - shown.length}</Txt>
        </View>
      ) : null}
    </Row>
  );
}

/** Quick action tile (Invite / Chest / Cup). */
export function Tile({ art, label, sub, onPress }: { art: number; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 78, backgroundColor: pressed ? '#22222A' : '#1C1C23', borderRadius: 16, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' })}>
      <Image source={art} style={{ width: 34, height: 34 }} contentFit="contain" />
      <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 12.5, marginTop: 3 }}>{label}</Txt>
      {sub ? <Txt v="small" lines={1} style={{ fontSize: 10.5 }}>{sub}</Txt> : null}
    </Pressable>
  );
}
