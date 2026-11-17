// The squad chest and squad war, as they look: the chest hero, trade-vote cards with a share-weighted vote bar,
// position cards, the squad-vs-squad face-off, the member row and the propose / rival pickers. Pure presentation:
// every number comes in as props from app/onchain-clan.tsx, which owns the chain calls.
import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { Profile } from '@/chain/social';
import { CoinToken, coinName } from '@/ui/clash';
import { ProfileAvatar } from '@/ui/feed';
import { ART, Row, Txt } from '@/ui/kit';
import { CARD, GOLD, HAIR, crestSrc } from '@/ui/squads/parts';
import { C, F, fmtUsd } from '@/ui/tokens';

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

/** Section header in the display face, with an optional action on the right. */
export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <Row style={{ marginTop: 28, marginBottom: 12, gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, letterSpacing: -0.4 }} numberOfLines={1}>{title}</Text>
        {sub ? <Txt v="small" lines={1}>{sub}</Txt> : null}
      </View>
      {right}
    </Row>
  );
}

/** Small rounded action in a section header ("+ Propose"). 44 px tall touch target. */
export function HeadAction({ label, onPress, disabled, color = C.up }: { label: string; onPress: () => void; disabled?: boolean; color?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => ({ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: pressed ? '#2A2A33' : C.s2, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: disabled ? 0.45 : 1 })}>
      <Txt v="label" color={color} style={{ fontSize: 18, marginTop: -2 }}>+</Txt>
      <Txt v="label" style={{ fontSize: 13.5 }}>{label}</Txt>
    </Pressable>
  );
}

/** Green / red profit pill. */
export function PnlPill({ label, usd }: { label: string; usd: number }) {
  const c = tone(usd);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: usd > 0.004 ? C.upBg : usd < -0.004 ? C.downBg : C.s2, borderRadius: 10, paddingHorizontal: 9, height: 26 }}>
      <Txt v="small" color={c} style={{ fontFamily: F.semi, fontSize: 12 }}>{label}</Txt>
      <Txt v="label" color={c} style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>{fmtSigned(usd)}</Txt>
    </View>
  );
}

/** One small stat box in the chest hero. */
export function Stat({ k, v, color = C.ink }: { k: string; v: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: '#1C1C23', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: HAIR }}>
      <Txt v="small" lines={1} style={{ fontSize: 11 }}>{k}</Txt>
      <Txt v="label" lines={1} color={color} style={{ fontSize: 15, fontVariant: ['tabular-nums'], marginTop: 1 }}>{v}</Txt>
    </View>
  );
}

/** Yes from the left, no from the right, each as a share of ALL chest shares; the tick marks the 50% early pass. */
export function VoteBar({ yes, no }: { yes: number; no: number }) {
  const y = Math.max(0, Math.min(1, yes)), n = Math.max(0, Math.min(1 - y, no));
  return (
    <View style={{ height: 12, borderRadius: 6, backgroundColor: '#24242C', overflow: 'hidden', flexDirection: 'row' }}>
      <View style={{ width: `${y * 100}%`, backgroundColor: C.up }} />
      <View style={{ flex: 1 }} />
      <View style={{ width: `${n * 100}%`, backgroundColor: C.down }} />
      <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: 'rgba(255,255,255,0.55)' }} />
    </View>
  );
}

const Chip = ({ text, color = C.muted, bg = C.s2 }: { text: string; color?: string; bg?: string }) => (
  <View style={{ borderRadius: 9, paddingHorizontal: 8, height: 24, justifyContent: 'center', backgroundColor: bg }}>
    <Txt v="small" color={color} style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 0.3, fontVariant: ['tabular-nums'] }}>{text}</Txt>
  </View>
);

/** A trade put to the squad's vote. */
export function TradeCard({ sym, side, sizePct, notional, proposer, proposerName, yes, no, left, children }: {
  sym: string; side: number; sizePct: number; notional: number; proposer?: Profile; proposerName: string;
  /** Fractions of all chest shares. */ yes: number; no: number; left: number; children?: ReactNode;
}) {
  const up = side === 1;
  return (
    <Animated.View entering={FadeInDown.springify()} style={{ backgroundColor: CARD, borderRadius: 24, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: HAIR }}>
      <Row style={{ gap: 12 }}>
        <CoinToken sym={sym} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 19, letterSpacing: -0.3, color: up ? C.up : C.down }} numberOfLines={1}>{up ? '▲ UP' : '▼ DOWN'} · {sym}</Text>
          <Txt v="small" lines={1}>{coinName(sym)} · {sizePct}% of the chest · {fmtUsd(notional)}</Txt>
        </View>
        {left > 0 ? <Chip text={fmtLeft(left)} color={C.ink} bg="rgba(240,70,140,0.18)" /> : <Chip text="Closed" />}
      </Row>
      <Row style={{ gap: 8, marginTop: 12 }}>
        <ProfileAvatar p={proposer} size={22} />
        <Txt v="small" lines={1} style={{ flex: 1 }}>Proposed by <Txt v="small" color={C.ink} style={{ fontFamily: F.semi }}>{proposerName}</Txt></Txt>
      </Row>
      <View style={{ marginTop: 12 }}><VoteBar yes={yes} no={no} /></View>
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <Txt v="small" color={C.up} style={{ fontFamily: F.semi }}>Yes {Math.round(yes * 100)}%</Txt>
        <Txt v="small" style={{ fontSize: 11 }}>over 50% passes early</Txt>
        <Txt v="small" color={C.down} style={{ fontFamily: F.semi }}>No {Math.round(no * 100)}%</Txt>
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
    <View style={{ backgroundColor: CARD, borderRadius: 22, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: HAIR }}>
      <Row style={{ gap: 12 }}>
        <CoinToken sym={sym} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ gap: 6 }}>
            <Txt v="label" lines={1} color={up ? C.up : C.down} style={{ flexShrink: 1 }}>{up ? '▲ Up' : '▼ Down'} {sym}</Txt>
            {open ? <Chip text="LIVE" color={C.up} bg={C.upBg} /> : <Chip text="Closed" />}
          </Row>
          <Txt v="small" lines={1} style={{ marginTop: 2 }}>{fmtUsd(notional)} · {fmtUsd(entry)} → {now !== null ? fmtUsd(now) : '…'}</Txt>
        </View>
        <Text style={{ fontFamily: F.semi, fontSize: 20, color: tone(pnl), fontVariant: ['tabular-nums'] }}>{fmtSigned(pnl)}</Text>
      </Row>
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

/** A squad crest in a coloured squircle ring. */
export function CrestRing({ crest, size = 76, color }: { crest: number | null; size?: number; color: string }) {
  return (
    <View style={{ borderRadius: size * 0.34, borderWidth: 3, borderColor: color, padding: 3 }}>
      <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: '#1C1C22', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {crest === null ? <Text style={{ fontFamily: F.display, fontSize: size * 0.45, color: '#3A3A44' }}>?</Text>
          : <Image source={crestSrc(crest)} style={{ width: size * 0.92, height: size * 0.92 }} contentFit="contain" />}
      </View>
    </View>
  );
}

/** Squad vs squad, face to face (the FaceOff look with crests). */
export function SquadVersus({ us, them, usName, themName, usScore, themScore, usSub, themSub }: {
  us: number | null; them: number | null; usName: string; themName: string; usScore?: string; themScore?: string; usSub?: string; themSub?: string;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 600 }), withTiming(1, { duration: 600 })), -1); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const vs = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }, { rotate: '-8deg' }] }));
  const side = (crest: number | null, name: string, color: string, score?: string, sub?: string, delay = 0) => (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
      <CrestRing crest={crest} color={color} size={72} />
      <Txt v="label" lines={1} style={{ marginTop: 8, fontFamily: F.semi, fontSize: 15, maxWidth: '100%' }}>{name}</Txt>
      {score ? <Text style={{ fontFamily: F.display, fontSize: 26, color: score.startsWith('−') ? C.down : score.startsWith('+') ? C.up : C.ink, marginTop: 2, fontVariant: ['tabular-nums'] }}>{score}</Text> : null}
      {sub ? <Txt v="small" lines={1} style={{ fontSize: 11 }}>{sub}</Txt> : null}
    </Animated.View>
  );
  return (
    <Row style={{ alignItems: 'flex-start', gap: 6 }}>
      {side(us, usName, C.brand, usScore, usSub)}
      <Animated.View style={[{ marginTop: 26, width: 44, alignItems: 'center' }, vs]}>
        <Text style={{ fontFamily: F.display, fontSize: 32, color: GOLD, textShadowColor: C.opp, textShadowRadius: 12 }}>VS</Text>
      </Animated.View>
      {side(them, themName, them === null ? '#2A2A33' : C.opp, themScore, themSub, 120)}
    </Row>
  );
}

/** Members as a swipeable avatar row: crown on the captain, "you" under your own. */
export function MemberRow({ members }: { members: { key: string; p?: Profile; name: string; captain: boolean; me: boolean }[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
      {members.map((m) => (
        <View key={m.key} style={{ width: 64, alignItems: 'center' }}>
          <View style={{ borderRadius: 30, borderWidth: 2.5, borderColor: m.captain ? GOLD : m.me ? C.brand : HAIR, padding: 2 }}>
            <ProfileAvatar p={m.p} size={50} />
          </View>
          {m.captain ? <Image source={ART.crown} style={{ position: 'absolute', top: -8, right: 2, width: 20, height: 20 }} contentFit="contain" /> : null}
          <Txt v="small" lines={1} color={m.captain ? GOLD : C.ink} style={{ fontFamily: F.semi, fontSize: 11.5, marginTop: 5, maxWidth: 64 }}>{m.name}</Txt>
          {m.me ? <Txt v="small" color={C.dim} style={{ fontSize: 10 }}>you</Txt> : null}
        </View>
      ))}
    </ScrollView>
  );
}

/** A coin to trade, in the propose drawer. */
export function CoinTile({ sym, price, on, onPress }: { sym: string; price: number | null; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={coinName(sym)} style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 12, borderRadius: 20, backgroundColor: on ? '#1E2040' : '#1B1B21', borderWidth: 2, borderColor: on ? C.brand : '#26262E', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <CoinToken sym={sym} size={46} />
      <Txt v="label" style={{ marginTop: 6, fontFamily: F.semi, fontSize: 15 }}>{sym}</Txt>
      <Txt v="small" lines={1} style={{ fontSize: 11 }}>{price ? fmtUsd(price) : '…'}</Txt>
    </Pressable>
  );
}

/** UP / DOWN choice in the propose drawer. */
export function DirPick({ dir, onChange }: { dir: 1 | 2; onChange: (d: 1 | 2) => void }) {
  const b = (d: 1 | 2, arrow: string, label: string, color: string) => {
    const on = dir === d;
    return (
      <Pressable onPress={() => onChange(d)} style={({ pressed }) => ({ flex: 1, height: 76, borderRadius: 22, backgroundColor: on ? color : '#1B1B21', borderWidth: 2, borderColor: on ? color : '#26262E', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <Text style={{ fontFamily: F.semi, fontSize: 19, letterSpacing: -0.3, color: on ? '#0A0A0D' : color, lineHeight: 24 }}>{arrow}</Text>
        <Text style={{ fontFamily: F.semi, fontSize: 19, letterSpacing: -0.3, color: on ? '#0A0A0D' : C.ink }}>{label}</Text>
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
          <Pressable key={it.key} onPress={() => onChange(it.key)} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 6, borderRadius: 16, backgroundColor: on ? C.ink : '#1B1B21', borderWidth: 1, borderColor: on ? C.ink : '#26262E', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
            <Txt v="label" color={on ? '#000' : C.ink} lines={1}>{it.label}</Txt>
            {it.sub ? <Txt v="small" lines={1} color={on ? '#3A3A44' : C.muted} style={{ fontSize: 11 }}>{it.sub}</Txt> : null}
          </Pressable>
        );
      })}
    </Row>
  );
}

/** The big call-to-action used in the drawers. */
export function BigGo({ title, onPress, disabled, color = C.opp, fg = '#fff' }: { title: string; onPress: () => void; disabled?: boolean; color?: string; fg?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => ({ height: 60, borderRadius: 22, backgroundColor: color, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }], shadowColor: color, shadowOpacity: disabled ? 0 : 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } })}>
      <Text style={{ fontFamily: F.semi, fontSize: 21, color: fg, paddingHorizontal: 16 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Text>
    </Pressable>
  );
}

/** A rival squad in the challenge drawer. */
export function RivalRow({ crest, name, line, on, onPress }: { crest: number; name: string; line: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 8, borderRadius: 18, marginBottom: 6, backgroundColor: on ? 'rgba(240,70,140,0.14)' : pressed ? '#22222A' : '#1B1B21', borderWidth: 1.5, borderColor: on ? C.opp : '#26262E' })}>
      <Image source={crestSrc(crest)} style={{ width: 44, height: 44 }} contentFit="contain" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{name}</Txt>
        <Txt v="small" lines={1}>{line}</Txt>
      </View>
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? C.opp : '#3A3A44', backgroundColor: on ? C.opp : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Txt v="small" color="#fff" style={{ fontFamily: F.bold, fontSize: 12 }}>✓</Txt> : null}
      </View>
    </Pressable>
  );
}

/** A finished war, one line. */
export function PastWar({ result, rival, us, them }: { result: 'won' | 'lost' | 'tied'; rival: string; us: string; them: string }) {
  const c = result === 'won' ? C.up : result === 'lost' ? C.down : C.muted;
  return (
    <Row style={{ gap: 10, minHeight: 44, paddingHorizontal: 4 }}>
      <Chip text={result.toUpperCase()} color={c} bg={result === 'won' ? C.upBg : result === 'lost' ? C.downBg : C.s2} />
      <Txt v="small" lines={1} color={C.ink} style={{ flex: 1 }}>vs {rival}</Txt>
      <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{us} vs {them}</Txt>
    </Row>
  );
}

/** An empty or explain card with clay art. */
export function ArtCard({ art, title, body, children }: { art: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', backgroundColor: CARD, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: HAIR }}>
      {art}
      <Text style={{ fontFamily: F.semi, fontSize: 20, color: C.ink, marginTop: 8, textAlign: 'center' }}>{title}</Text>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 4, lineHeight: 18 }}>{body}</Txt>
      {children ? <View style={{ alignSelf: 'stretch', marginTop: 14, gap: 8 }}>{children}</View> : null}
    </View>
  );
}
