// Squad building blocks shared by the Squads tab, Discover and the squad drawers: the Discord-style rail icon, the
// level line, channel groups and rows, the member stack. Pure presentation: every value comes in as props.
// v14: flat rows on black, crests as identity (≤ 48 px), icons in C.s2 circles, no clay art or banners.
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { Profile } from '@/chain/social';
import { ProfileAvatar } from '@/ui/feed';
import { CRESTS, LiveDot, Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';

/** Gold is kept only for the captain marker (and the live squad-war board in ui/chest). */
export const GOLD = '#FFC94A';
export const CARD = C.card;
export const HAIR = C.line;
export const crestSrc = (n: number) => CRESTS[n % CRESTS.length];

/** A squad icon in the rail: squircle when selected, a pill on the left edge (tall = selected, short = unread). */
export function RailIcon({ crest, selected, unread, label, onPress }: { crest: number; selected: boolean; unread: number; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: '100%', alignItems: 'center', justifyContent: 'center', height: 56 }}>
      {selected || unread ? (
        <View style={{ position: 'absolute', left: 0, width: 4, height: selected ? 36 : 8, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: C.ink }} />
      ) : null}
      <View style={{ width: 48, height: 48, borderRadius: selected ? 16 : 24, overflow: 'hidden', backgroundColor: selected ? C.s2 : C.card, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={crestSrc(crest)} style={{ width: 40, height: 40 }} contentFit="contain" />
      </View>
      {unread > 0 ? (
        <View style={{ position: 'absolute', right: 6, bottom: 3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.brand, borderWidth: 2.5, borderColor: C.bg, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="small" color={C.onBrand} style={{ fontSize: 9.5, ...FONT.bold, lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A round rail button (Discover, Start a squad): an icon in a C.s2 circle. */
export function RailButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: pressed ? 16 : 24, backgroundColor: pressed ? C.s1 : C.s2, alignItems: 'center', justifyContent: 'center', marginVertical: 4 })}>
      {icon}
    </Pressable>
  );
}

/** Level and XP: "LV 3", a thin bar, "100/500 XP" (clanLevel: wars won, members, chest). */
export function LevelBar({ level, xp, floor, next }: { level: number; xp: number; floor: number; next: number }) {
  const pct = Math.max(3, Math.min(100, ((xp - floor) / Math.max(1, next - floor)) * 100));
  return (
    <Row style={{ gap: 10 }}>
      <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>LV {level}</Txt>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: C.s2, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 4, borderRadius: 2, backgroundColor: C.brand }} />
      </View>
      <Txt v="small" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{xp - floor}/{next - floor} XP</Txt>
    </Row>
  );
}

/** A section label in normal case ("Challenges"), with an optional note on the right. */
export const Group = ({ title, right }: { title: string; right?: ReactNode }) => (
  <Row style={{ marginTop: 22, marginBottom: 2, gap: 6 }}>
    <Txt v="small" color={C.muted} style={{ ...FONT.semi, flex: 1 }}>{title}</Txt>
    {right}
  </Row>
);

/** A small tag: lavender tint by default ("2 open", "You're in"). */
export const Badge = ({ text, color = 'rgba(171,159,242,0.14)', fg = C.brandSoft }: { text: string; color?: string; fg?: string }) => (
  <View style={{ backgroundColor: color, borderRadius: 6, paddingHorizontal: 6, height: 20, justifyContent: 'center' }}>
    <Txt v="small" color={fg} style={{ fontSize: 11, ...FONT.semi }}>{text}</Txt>
  </View>
);

/** A channel row: an icon in a C.s2 circle, the name over a one-line preview, tags on the right. Unread previews read bright. */
export function Channel({ name, glyph = '#', sub, badge, live, unread, count, onPress }: {
  name: string; glyph?: string | ((color: string) => ReactNode); sub?: string; badge?: string; live?: boolean; unread?: boolean; count?: number; onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
        {typeof glyph === 'string' ? <Txt v="label" color={C.ink} style={{ fontSize: 15 }}>{glyph}</Txt> : glyph(C.ink)}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{name}</Txt>
        {sub ? <Txt v="small" lines={1} color={unread ? C.ink : C.muted} style={{ marginTop: 1 }}>{sub}</Txt> : null}
      </View>
      {live ? <Row style={{ gap: 5 }}><LiveDot color={C.up} /><Txt v="small" color={C.up} style={{ ...FONT.medium }}>Live</Txt></Row> : null}
      {badge ? <Badge text={badge} /> : null}
      {count !== undefined && count > 0 ? <Txt v="small" color={C.dim} style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{count}</Txt> : null}
    </Pressable>
  );
}

/** Overlapping member avatars with a "+N". `ring` matches the surface behind it. */
export function MemberStack({ profiles, total, size = 30, max = 5, ring = C.bg }: { profiles: (Profile | undefined)[]; total: number; size?: number; max?: number; ring?: string }) {
  const shown = profiles.slice(0, max);
  return (
    <Row>
      {shown.map((p, i) => (
        <View key={i} style={{ marginLeft: i ? -size * 0.32 : 0, borderRadius: size, borderWidth: 2, borderColor: ring }}>
          <ProfileAvatar p={p} size={size} />
        </View>
      ))}
      {total > shown.length ? (
        <View style={{ marginLeft: -size * 0.32, width: size + 4, height: size + 4, borderRadius: size, backgroundColor: C.s2, borderWidth: 2, borderColor: ring, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="small" color={C.ink} style={{ fontSize: 11, ...FONT.semi }}>+{total - shown.length}</Txt>
        </View>
      ) : null}
    </Row>
  );
}
