// The squad chest and squad war, as they look: trade-vote cards with a share-weighted vote bar, position cards, the
// squad-vs-squad face-off, the member row and the propose / rival pickers. Pure presentation: every number comes in
// as props from app/onchain-clan.tsx, which owns the chain calls. Wallet-app look (v14) everywhere except the live
// war face-off, which keeps the game colours.
import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { Profile } from '@/chain/social';
import { CoinToken, coinName } from '@/ui/clash';
import { ProfileAvatar } from '@/ui/feed';
import { Crown } from '@/ui/icons';
import { Row, Txt } from '@/ui/kit';
import { GOLD, crestSrc } from '@/ui/squads/parts';
import { C, FONT, fmtUsd } from '@/ui/tokens';

/** "42s", "3:05", "1h 20m", "2d 4h". */
export const fmtLeft = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  if (t >= 86_400) return `${Math.floor(t / 86_400)}d ${Math.floor((t % 86_400) / 3600)}h`;
  if (t >= 3600) return `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`;
  if (t >= 60) return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  return `${t}s`;
};
/** Dollars with a sign: "+$1.20", "−$0.40", "$0.00". */
export const fmtSigned = (usd: number) => `${usd > 0.004 ? '+' : usd < -0.004 ? '−' : ''}${fmtUsd(Math.abs(usd))}`;
const tone = (n: number) => (n > 0.004 ? C.up : n < -0.004 ? C.down : C.ink);

/** Section header, with an optional action on the right. */
export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <Row style={{ marginTop: 28, marginBottom: 10, gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="h2" lines={1}>{title}</Txt>
        {sub ? <Txt v="small" lines={1} style={{ marginTop: 1 }}>{sub}</Txt> : null}
      </View>
      {right}
    </Row>
  );
}

/** Small rounded action in a section header ("+ Propose"). 44 px touch target with its hit slop. */
export function HeadAction({ label, onPress, disabled, color = C.ink }: { label: string; onPress: () => void; disabled?: boolean; color?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: pressed ? C.s1 : C.s2, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: disabled ? 0.45 : 1 })}>
      <Txt v="label" color={color} style={{ marginTop: -1 }}>+</Txt>
      <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{label}</Txt>
    </Pressable>
  );
}

/** Profit and loss: a grey label and the signed amount in green or red. */
export function PnlPill({ label, usd }: { label: string; usd: number }) {
  const c = tone(usd);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 24 }}>
      <Txt v="small">{label}</Txt>
      <Txt v="num" color={c} style={{ fontSize: 14 }}>{fmtSigned(usd)}</Txt>
    </View>
  );
}

/** One small stat box inside the chest card. */
export function Stat({ k, v, color = C.ink }: { k: string; v: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: C.s2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9 }}>
      <Txt v="small" lines={1} style={{ fontSize: 12 }}>{k}</Txt>
      <Txt v="num" lines={1} color={color} style={{ marginTop: 1 }}>{v}</Txt>
    </View>
  );
}

/** Yes from the left, no from the right, each as a share of ALL chest shares; the tick marks the 50% early pass. */
export function VoteBar({ yes, no }: { yes: number; no: number }) {
  const y = Math.max(0, Math.min(1, yes)), n = Math.max(0, Math.min(1 - y, no));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.s2, overflow: 'hidden', flexDirection: 'row' }}>
      <View style={{ width: `${y * 100}%`, backgroundColor: C.up }} />
      <View style={{ flex: 1 }} />
      <View style={{ width: `${n * 100}%`, backgroundColor: C.down }} />
      <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: C.muted }} />
    </View>
  );
}

const Chip = ({ text, color = C.muted }: { text: string; color?: string }) => (
  <View style={{ borderRadius: 8, paddingHorizontal: 8, height: 24, justifyContent: 'center', backgroundColor: C.s2 }}>
    <Txt v="small" color={color} style={{ ...FONT.semi, fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{text}</Txt>
  </View>
);

/** A trade put to the squad's vote. */
export function TradeCard({ sym, side, sizePct, notional, proposer, proposerName, yes, no, left, children }: {
  sym: string; side: number; sizePct: number; notional: number; proposer?: Profile; proposerName: string;
  /** Fractions of all chest shares. */ yes: number; no: number; left: number; children?: ReactNode;
}) {
  const up = side === 1;
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={{ backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10 }}>
      <Row style={{ gap: 12 }}>
        <CoinToken sym={sym} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1} color={up ? C.up : C.down}>{up ? '▲ Up' : '▼ Down'} · {sym}</Txt>
          <Txt v="small" lines={1} style={{ marginTop: 1 }}>{coinName(sym)} · {sizePct}% of the chest · {fmtUsd(notional)}</Txt>
        </View>
        {left > 0 ? <Chip text={fmtLeft(left)} color={C.ink} /> : <Chip text="Closed" />}
      </Row>
      <Row style={{ gap: 8, marginTop: 12 }}>
        <ProfileAvatar p={proposer} size={22} />
        <Txt v="small" lines={1} style={{ flex: 1 }}>Proposed by <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{proposerName}</Txt></Txt>
      </Row>
      <View style={{ marginTop: 12 }}><VoteBar yes={yes} no={no} /></View>
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <Txt v="small" color={C.up} style={{ ...FONT.medium, fontVariant: ['tabular-nums'] }}>Yes {Math.round(yes * 100)}%</Txt>
        <Txt v="small" color={C.dim} style={{ fontSize: 12 }}>over 50% passes early</Txt>
        <Txt v="small" color={C.down} style={{ ...FONT.medium, fontVariant: ['tabular-nums'] }}>No {Math.round(no * 100)}%</Txt>
      </Row>
      {children ? <View style={{ marginTop: 12, gap: 8 }}>{children}</View> : null}
    </Animated.View>
  );
}

/** A trade the squad is in (or was). */
export function PositionCard({ sym, side, notional, entry, now, open, pnl, action }: {
  sym: string; side: number; notional: number; entry: number; now: number | null; open: boolean; /** USD */ pnl: number; action?: ReactNode;
}) {
  const up = side === 1;
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 12, marginBottom: 10 }}>
      <Row style={{ gap: 12 }}>
        <CoinToken sym={sym} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ gap: 6 }}>
            <Txt v="label" lines={1} color={up ? C.up : C.down} style={{ flexShrink: 1 }}>{up ? '▲ Up' : '▼ Down'} {sym}</Txt>
            {open ? <Chip text="Live" color={C.up} /> : <Chip text="Closed" />}
          </Row>
          <Txt v="small" lines={1} style={{ marginTop: 1 }}>{fmtUsd(notional)} · {fmtUsd(entry)} → {now !== null ? fmtUsd(now) : '…'}</Txt>
        </View>
        <Txt v="num" color={tone(pnl)}>{fmtSigned(pnl)}</Txt>
      </Row>
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

/** A squad crest in a coloured ring (the war face-off: yours in the accent, the rival's in pink). */
export function CrestRing({ crest, size = 64, color }: { crest: number | null; size?: number; color: string }) {
  return (
    <View style={{ borderRadius: size * 0.34, borderWidth: 2, borderColor: color, padding: 3 }}>
      <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: C.s2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {crest === null ? <Text style={{ ...FONT.semi, fontSize: size * 0.4, color: C.dim }}>?</Text>
          : <Image source={crestSrc(crest)} style={{ width: size * 0.92, height: size * 0.92 }} contentFit="contain" />}
      </View>
    </View>
  );
}

/** Squad vs squad, face to face. A live game moment, so it keeps the rival's pink and the gold VS. */
export function SquadVersus({ us, them, usName, themName, usScore, themScore, usSub, themSub }: {
  us: number | null; them: number | null; usName: string; themName: string; usScore?: string; themScore?: string; usSub?: string; themSub?: string;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 600 }), withTiming(1, { duration: 600 })), -1); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const vs = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const side = (crest: number | null, name: string, color: string, score?: string, sub?: string, delay = 0) => (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
      <CrestRing crest={crest} color={color} size={60} />
      <Txt v="label" lines={1} style={{ marginTop: 8, maxWidth: '100%' }}>{name}</Txt>
      {score ? <Text style={{ ...FONT.semi, fontSize: 24, letterSpacing: -0.5, color: score.startsWith('−') ? C.down : score.startsWith('+') ? C.up : C.ink, marginTop: 2, fontVariant: ['tabular-nums'] }}>{score}</Text> : null}
      {sub ? <Txt v="small" lines={1} style={{ fontSize: 12 }}>{sub}</Txt> : null}
    </Animated.View>
  );
  return (
    <Row style={{ alignItems: 'flex-start', gap: 6 }}>
      {side(us, usName, C.brand, usScore, usSub)}
      <Animated.View style={[{ marginTop: 22, width: 40, alignItems: 'center' }, vs]}>
        <Text style={{ ...FONT.bold, fontSize: 22, color: GOLD }}>VS</Text>
      </Animated.View>
      {side(them, themName, them === null ? C.s2 : C.opp, themScore, themSub, 120)}
    </Row>
  );
}

/** Members as a swipeable avatar row: a crown on the captain, "you" under your own. */
export function MemberRow({ members }: { members: { key: string; p?: Profile; name: string; captain: boolean; me: boolean }[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
      {members.map((m) => (
        <View key={m.key} style={{ width: 60, alignItems: 'center' }}>
          <View>
            <ProfileAvatar p={m.p} size={48} />
            {m.captain ? (
              <View accessibilityLabel="Captain" style={{ position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}>
                <Crown size={12} color={C.ink} />
              </View>
            ) : null}
          </View>
          <Txt v="small" lines={1} color={C.ink} style={{ ...FONT.medium, fontSize: 12, marginTop: 5, maxWidth: 60 }}>{m.name}</Txt>
          {m.me ? <Txt v="small" color={C.dim} style={{ fontSize: 11 }}>you</Txt> : null}
        </View>
      ))}
    </ScrollView>
  );
}

/** A coin to trade, in the propose drawer. */
export function CoinTile({ sym, price, on, onPress }: { sym: string; price: number | null; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={coinName(sym)}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 12, borderRadius: 18, backgroundColor: on ? C.s2 : pressed ? C.s1 : C.card, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <CoinToken sym={sym} size={40} />
      <Txt v="label" style={{ marginTop: 6 }}>{sym}</Txt>
      <Txt v="small" lines={1} style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{price ? fmtUsd(price) : '…'}</Txt>
    </Pressable>
  );
}

/** UP / DOWN choice in the propose drawer (a trade direction, so green and red). */
export function DirPick({ dir, onChange }: { dir: 1 | 2; onChange: (d: 1 | 2) => void }) {
  const b = (d: 1 | 2, arrow: string, label: string, color: string) => {
    const on = dir === d;
    return (
      <Pressable onPress={() => onChange(d)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}
        style={({ pressed }) => ({ flex: 1, height: 60, borderRadius: 18, backgroundColor: on ? color : C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Text style={{ ...FONT.semi, fontSize: 15, color: on ? '#03140A' : color, lineHeight: 19 }}>{arrow}</Text>
        <Text style={{ ...FONT.semi, fontSize: 16, color: on ? '#03140A' : C.ink }}>{label}</Text>
      </Pressable>
    );
  };
  return <Row style={{ gap: 10 }}>{b(1, '▲', 'UP', C.up)}{b(2, '▼', 'DOWN', C.down)}</Row>;
}

/** Pill choices (size of the chest, war length). */
export function Pills<K extends string>({ items, value, onChange }: { items: { key: K; label: string; sub?: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <Row style={{ gap: 8 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={it.label}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 6, borderRadius: 16, backgroundColor: on ? C.ink : C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Txt v="label" color={on ? '#000' : C.ink} lines={1}>{it.label}</Txt>
            {it.sub ? <Txt v="small" lines={1} color={on ? C.dim : C.muted} style={{ fontSize: 12 }}>{it.sub}</Txt> : null}
          </Pressable>
        );
      })}
    </Row>
  );
}

/** The primary button used in the drawers: lavender, pill-shaped. */
export function BigGo({ title, onPress, disabled, color = C.brand, fg = C.onBrand }: { title: string; onPress: () => void; disabled?: boolean; color?: string; fg?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ height: 52, borderRadius: 26, backgroundColor: color, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <Text style={{ ...FONT.semi, fontSize: 15.5, color: fg, paddingHorizontal: 16 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
    </Pressable>
  );
}

/** A rival squad in the challenge drawer. */
export function RivalRow({ crest, name, line, on, onPress }: { crest: number; name: string; line: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={name}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 18, marginBottom: 6, backgroundColor: on ? C.s2 : pressed ? C.s1 : C.card, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
      <Image source={crestSrc(crest)} style={{ width: 40, height: 40 }} contentFit="contain" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{name}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 1 }}>{line}</Txt>
      </View>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? C.brand : C.s2, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.onBrand }} /> : null}
      </View>
    </Pressable>
  );
}

/** A finished war, one line. */
export function PastWar({ result, rival, us, them }: { result: 'won' | 'lost' | 'tied'; rival: string; us: string; them: string }) {
  const c = result === 'won' ? C.up : result === 'lost' ? C.down : C.muted;
  return (
    <Row style={{ gap: 10, minHeight: 44 }}>
      <Chip text={result === 'won' ? 'Won' : result === 'lost' ? 'Lost' : 'Tied'} color={c} />
      <Txt v="small" lines={1} color={C.ink} style={{ flex: 1 }}>vs {rival}</Txt>
      <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{us} vs {them}</Txt>
    </Row>
  );
}

/** An empty or explain card. The art (if any) comes in from the caller; keep it to an empty state. */
export function ArtCard({ art, title, body, children }: { art: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 16 }}>
      {art}
      <Txt v="label" style={{ marginTop: 8, textAlign: 'center' }}>{title}</Txt>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 4, lineHeight: 18 }}>{body}</Txt>
      {children ? <View style={{ alignSelf: 'stretch', marginTop: 14, gap: 8 }}>{children}</View> : null}
    </View>
  );
}
