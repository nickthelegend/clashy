// The pieces every game is drawn with (Nov 20, gathered into the kit Nov 21): market logos and heads, the live chart,
// the countdown, panels, the big choice buttons, the primary button, Clashy Bot's line, stake chips, market tiles,
// tags, big numbers, stat tiles and lines, YOU vs BOT cards, the rolled-market card, a count-up, hearts and the
// instant games' pot bar. Open /games/kit to see every one of them live.
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { STOCK_ART } from '@/ui/feed';
import { LiveChart, Row, Txt } from '@/ui/kit';
import { BotPic, MarketLogo } from '@/ui/practice-kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { POOLS, nameOf, tickerOf, type Info } from '../feed';
import { fmtX, signedPct } from '../odds';
import type { GameApi } from './api';
import { fmtPx, fmtSecs, usd } from './format';
import { GS, GT } from './tokens';

/* ---------- markets ---------- */
const STOCKISH = new Set<string>([...POOLS.stocks, ...POOLS.indexes]);
/** A market's real logo (Phoenix's), a stock wordmark tile, or its initial. */
export function Logo({ sym, info, size = 40 }: { sym: string; info: Map<string, Info> | null; size?: number }) {
  const i = info?.get(sym);
  const stock = STOCKISH.has(sym);
  return <MarketLogo m={{ kind: stock ? 'stock' : 'crypto', icon: i?.icon, symbol: tickerOf(sym), stockSym: STOCK_ART[sym] ? sym : undefined, art: (['SOL', 'BTC', 'ETH'] as const).find((x) => x === sym) }} size={size} />;
}

/** One market's live line: logo, name, price, and the move since `from` (a round's entry price). */
export function MarketHead({ g, sym, from, right }: { g: GameApi; sym: string; from?: number; right?: ReactNode }) {
  const m = g.feed.mark(sym);
  const mv = from && m ? m.p / from - 1 : undefined;
  return (
    <Row style={{ gap: 12 }}>
      <Logo sym={sym} info={g.info} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1} style={{ fontSize: 17 }}>{nameOf(g.info, sym)}</Txt>
        <Row style={{ gap: 8, marginTop: 2 }}>
          <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{tickerOf(sym)} · {fmtPx(m?.p)}</Txt>
          {mv !== undefined ? <Txt v="small" color={mv >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>{signedPct(mv, 3)}</Txt> : null}
        </Row>
      </View>
      {right}
    </Row>
  );
}

/** The live chart of one market: the round's ticks (or the last few minutes before it starts), with the entry line. */
export function MarketChart({ g, sym, from, entry, h = 200, label = 'Entry', color }: { g: GameApi; sym: string; from?: number; entry?: number; h?: number; label?: string; color?: string }) {
  const ticks = g.feed.since(sym, from ? from - 1500 : Date.now() - 4 * 60_000);
  const data = ticks.map((x) => x.p);
  if (data.length === 1) data.push(data[0]!);
  return <LiveChart data={data} w={g.width} h={h} refLine={entry} refLabel={entry ? label : undefined} times={ticks.map((x) => x.t)} color={color} fmt={(v) => fmtPx(v)} />;
}

/** A market tile in a lineup: logo, ticker, and the live move since `from`. */
export function MarketTile({ g, sym, from, onPress, selected, mark, disabled, rank }: { g: GameApi; sym: string; from?: number; onPress?: () => void; selected?: boolean; mark?: ReactNode; disabled?: boolean; rank?: number }) {
  const m = g.feed.mark(sym);
  const mv = from && m ? m.p / from - 1 : undefined;
  const w = useWindowDimensions().width;
  return (
    <Pressable onPress={onPress} disabled={!onPress || disabled} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={nameOf(g.info, sym)} accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({ flexBasis: w > 500 ? '31%' : '30%', flexGrow: 1, minHeight: GS.h.tile, borderRadius: GS.radius.tile, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: selected ? GT.selected : GT.raised, borderWidth: 2, borderColor: selected ? C.brand : 'transparent', opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {rank !== undefined ? <Text style={{ position: 'absolute', left: 9, top: 6, ...FONT.bold, fontSize: 12, color: rank === 1 ? GT.gold : C.muted }}>#{rank}</Text> : null}
      {mark ? <View style={{ position: 'absolute', right: 6, top: 6 }}>{mark}</View> : null}
      <Logo sym={sym} info={g.info} size={38} />
      <Txt v="label" lines={1} style={{ fontSize: 14 }}>{tickerOf(sym)}</Txt>
      <Txt v="small" lines={1} color={mv === undefined ? C.muted : mv >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>
        {mv === undefined ? fmtPx(m?.p) : signedPct(mv, 2)}
      </Txt>
    </Pressable>
  );
}

/** The setup's market card: logo, name, live price, and Roll again. */
export function RolledPanel({ g, sym, shown, onReroll, sub }: { g: GameApi; sym: string | null; shown: (k: number) => string; onReroll?: () => void; sub?: string }) {
  const s = sym ? shown(0) || sym : null;
  const m = sym ? g.feed.mark(sym) : undefined;
  return (
    <Panel style={{ alignItems: 'center', gap: 8 }}>
      {s ? <Logo sym={s} info={g.info} size={76} /> : <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: GT.placeholder }} />}
      <Txt v="title" lines={1} style={{ fontSize: 24 }}>{s ? nameOf(g.info, s) : 'Rolling…'}</Txt>
      <Note center>{sym ? `${tickerOf(sym)} · ${fmtPx(m?.p)}${sub ? ` · ${sub}` : ''}` : 'Finding a market with a live price…'}</Note>
      {sym && onReroll ? (
        <Pressable onPress={onReroll} accessibilityRole="button" accessibilityLabel="Roll another market"
          style={({ pressed }) => ({ paddingHorizontal: 18, height: GS.h.pill, borderRadius: 22, backgroundColor: pressed ? GT.pillPressed : GT.pill, justifyContent: 'center' })}>
          <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll again</Txt>
        </Pressable>
      ) : null}
    </Panel>
  );
}

/* ---------- the round ---------- */
/** The countdown: big seconds and a bar that empties. */
export function Clock({ left, total, tint = C.brand, label = 'left' }: { left: number | null; total: number; tint?: string; label?: string }) {
  if (left === null) return null;
  const f = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const hot = left <= 5;
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ ...FONT.bold, fontSize: 30, letterSpacing: -0.8, color: hot ? C.down : C.ink, fontVariant: ['tabular-nums'] }}>{fmtSecs(left)}</Text>
        <Txt v="small">{label}</Txt>
      </Row>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: GT.track, overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, width: `${f * 100}%`, backgroundColor: hot ? C.down : tint }} />
      </View>
    </View>
  );
}

/** A dark rounded panel (outlined in a colour when `tint` is set). */
export function Panel({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  return <View style={[{ backgroundColor: GT.panel, borderRadius: GS.radius.card, padding: 16, borderWidth: tint ? 1 : 0, borderColor: tint ? `${tint}55` : 'transparent' }, style]}>{children}</View>;
}

/** A big choice button (UP / DOWN, STAY / BREAK, a market in a lineup). */
export function Choice({ title, sub, color, onPress, disabled, selected, h = GS.h.choice, art }: { title: string; sub?: string; color: string; onPress: () => void; disabled?: boolean; selected?: boolean; h?: number; art?: ReactNode }) {
  const solid = selected === undefined || selected;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={sub ? `${title}, ${sub}` : title} accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => ({ flex: 1, minHeight: h, borderRadius: GS.radius.card, paddingHorizontal: 10, paddingVertical: 12, backgroundColor: solid ? color : GT.raised, borderWidth: 2, borderColor: selected ? '#fff' : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      {art}
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.display, fontSize: 26, letterSpacing: -0.6, color: solid ? GT.onTint : C.ink }}>{title}</Text>
      {sub ? <Text numberOfLines={2} style={{ ...FONT.semi, fontSize: 12.5, textAlign: 'center', color: solid ? 'rgba(10,10,13,0.72)' : C.muted }}>{sub}</Text> : null}
    </Pressable>
  );
}

/** The one primary button (Start, Lock it in, Cash out). */
export function Go({ title, onPress, color = C.brand, ink = C.onBrand, disabled, sub }: { title: string; onPress: () => void; color?: string; ink?: string; disabled?: boolean; sub?: string }) {
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ height: GS.h.go, borderRadius: GS.h.go / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }], shadowColor: color, shadowOpacity: disabled ? 0 : 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } })}>
      <Text style={{ ...FONT.bold, fontSize: 18, color: ink }}>{title}</Text>
      {sub ? <Text style={{ ...FONT.semi, fontSize: 12, color: ink, opacity: 0.7 }}>{sub}</Text> : null}
    </Pressable>
  );
}

/** A small secondary button (Roll again, New cards): 44 px tall. */
export function Pill({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ height: GS.h.pill, paddingHorizontal: 18, borderRadius: 22, backgroundColor: pressed ? GT.pillPressed : GT.pill, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.45 : 1 })}>
      <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{label}</Txt>
    </Pressable>
  );
}

/** Clashy Bot's move, said plainly. */
export function BotSays({ text, right }: { text: string; right?: ReactNode }) {
  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <Row style={{ gap: 10, backgroundColor: GT.bot, borderRadius: 18, padding: 10, paddingRight: 14 }}>
        <BotPic size={34} />
        <Txt v="small" color={C.ink} style={{ flex: 1, ...FONT.semi }}>{text}</Txt>
        {right}
      </Row>
    </Animated.View>
  );
}

/** Small grey line. */
export const Note = ({ children, center }: { children: ReactNode; center?: boolean }) => <Txt v="small" style={{ textAlign: center ? 'center' : 'left', lineHeight: 18 }}>{children}</Txt>;

/** The stake chips (practice money). */
export const STAKES = [5, 10, 25, 100] as const;
export function StakeRow({ value, onChange, balance, disabled }: { value: number; onChange: (n: number) => void; balance: number; disabled?: boolean }) {
  return (
    <TourTarget id="g-stake">
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Txt v="small" style={{ ...FONT.semi }}>Stake</Txt>
        <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{usd(balance)} practice money</Txt>
      </Row>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {STAKES.map((s) => {
          const on = s === value;
          const short = s > balance;
          return (
            <Pressable key={s} onPress={() => { Haptics.selectionAsync(); onChange(s); }} disabled={disabled || short} accessibilityRole="button" accessibilityState={{ selected: on, disabled: disabled || short }} accessibilityLabel={`Stake $${s}`}
              style={({ pressed }) => ({ flex: 1, height: GS.h.stake, borderRadius: 22, backgroundColor: on ? C.ink : GT.stake, alignItems: 'center', justifyContent: 'center', opacity: short ? 0.35 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <Txt v="label" color={on ? '#000' : C.ink} style={{ fontSize: 15 }}>${s}</Txt>
            </Pressable>
          );
        })}
      </View>
    </TourTarget>
  );
}

/** The line a game shows while it waits for live prices (with an optional progress bar). */
export function Waiting({ text, sub, progress, tint = C.brand }: { text: string; sub?: string; progress?: number; tint?: string }) {
  return (
    <View style={{ backgroundColor: GT.panel, borderRadius: GS.radius.card, padding: 18, gap: 10, alignItems: 'center' }}>
      <Txt v="label" style={{ textAlign: 'center' }}>{text}</Txt>
      {sub ? <Txt v="small" style={{ textAlign: 'center' }}>{sub}</Txt> : null}
      {progress !== undefined ? (
        <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: GT.track, overflow: 'hidden' }}>
          <View style={{ height: 6, borderRadius: 3, width: `${Math.max(2, Math.min(100, progress * 100))}%`, backgroundColor: tint }} />
        </View>
      ) : null}
    </View>
  );
}

/* ---------- labels and numbers ---------- */
/** A small tag (YOU, BOT, a side). */
export const Tag = ({ text, color }: { text: string; color: string }) => (
  <View style={{ backgroundColor: `${color}26`, borderRadius: GS.radius.tag, paddingHorizontal: 6, paddingVertical: 2 }}>
    <Text style={{ ...FONT.bold, fontSize: 10.5, letterSpacing: 0.4, color }}>{text}</Text>
  </View>
);

/** The big number in the middle of a round (a multiplier, a P&L). */
export function BigNumber({ value, color = C.ink, sub }: { value: string; color?: string; sub?: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={{ alignItems: 'center', paddingVertical: 6 }}>
      <Text style={{ ...FONT.displayB, fontSize: 56, letterSpacing: -2, color, fontVariant: ['tabular-nums'], lineHeight: 64 }}>{value}</Text>
      {sub ? <Txt v="small">{sub}</Txt> : null}
    </Animated.View>
  );
}

/** A small stat tile: label over value (use several in a Row). */
export const StatTile = ({ k, v, color }: { k: string; v: string; color?: string }) => (
  <View style={{ flex: 1, minWidth: 0, backgroundColor: GT.raised, borderRadius: GS.radius.stat, paddingVertical: 9, paddingHorizontal: 12 }}>
    <Txt v="small" lines={1} style={{ fontSize: 12 }}>{k}</Txt>
    <Txt v="label" lines={1} color={color} style={{ fontVariant: ['tabular-nums'], marginTop: 1 }}>{v}</Txt>
  </View>
);

/** A label / value line inside a panel. */
export function StatLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', gap: 12 }}>
      <Txt v="small">{label}</Txt>
      <Txt v="small" color={color ?? C.ink} lines={1} style={{ ...FONT.semi, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </Row>
  );
}

type SideCard = { title: string; color: string; sub?: string };
/** YOU and CLASHY BOT side by side; the one ahead gets the outline. */
export function Sides({ you, bot, lead }: { you: SideCard; bot: SideCard; lead?: 'you' | 'bot' | null }) {
  const card = (who: 'you' | 'bot', s: SideCard) => (
    <Panel style={{ flex: 1, alignItems: 'center', gap: 6, minWidth: 0 }} tint={lead === who ? (who === 'you' ? C.up : C.opp) : undefined}>
      <Tag text={who === 'you' ? 'YOU' : 'CLASHY BOT'} color={who === 'you' ? C.brand : C.opp} />
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.bold, fontSize: s.title.length > 9 ? 17 : s.title.length > 7 ? 20 : 24, letterSpacing: -0.6, color: s.color, fontVariant: ['tabular-nums'] }}>{s.title}</Text>
      {s.sub ? <Txt v="small" lines={2} style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }}>{s.sub}</Txt> : null}
    </Panel>
  );
  return <Row style={{ gap: 10, alignItems: 'stretch' }}>{card('you', you)}{card('bot', bot)}</Row>;
}

/** A number that counts up from zero to its value, for a reveal. */
export function CountUp({ to, fmt, ms = 700, color = C.ink, size = 26 }: { to: number; fmt: (v: number) => string; ms?: number; color?: string; size?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const h = setInterval(() => {
      const f = Math.min(1, (Date.now() - t0) / ms);
      setV(f >= 1 ? to : to * (1 - (1 - f) ** 3));
      if (f >= 1) clearInterval(h);
    }, 30);
    return () => clearInterval(h);
  }, [to, ms]);
  return <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: size, letterSpacing: -0.8, color, fontVariant: ['tabular-nums'] }}>{fmt(v)}</Text>;
}

/** A small heart (a life in Royale). */
export function Heart({ size = 12, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21.3s-7.6-4.7-10-9.4C.4 8.6 2.4 4.5 6.3 4.5c2.4 0 4 1.3 5.7 3.2 1.7-1.9 3.3-3.2 5.7-3.2 3.9 0 5.9 4.1 4.3 7.4-2.4 4.7-10 9.4-10 9.4z" fill={color} />
    </Svg>
  );
}

/** The instant games' bar: the streak, the pot, and Cash out (allowed once there's a right answer). */
export function PotBar({ g, mult, streak, canCash, onCash, streakLabel = 'Streak' }: { g: GameApi; mult: number; streak: number; canCash: boolean; onCash: () => void; streakLabel?: string }) {
  const { def } = g;
  return (
    <View style={{ gap: 12 }}>
      <Row style={{ gap: 10 }}>
        <Panel style={{ flex: 1, gap: 2 }}>
          <Txt v="small">{streakLabel}</Txt>
          <Text style={{ ...FONT.displayB, fontSize: 30, letterSpacing: -1, color: C.ink, fontVariant: ['tabular-nums'] }}>{streak}</Text>
        </Panel>
        <Panel style={{ flex: 1.5, gap: 2 }} tint={streak > 0 ? def.tint : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="small">Pot</Txt>
            <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{fmtX(mult)}</Txt>
          </Row>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: 30, letterSpacing: -1, color: streak > 0 ? def.tint : C.ink, fontVariant: ['tabular-nums'] }}>{usd(g.stake * mult)}</Text>
        </Panel>
      </Row>
      <TourTarget id="g-go">
        <Go title={canCash ? `Cash out ${usd(g.stake * mult)}` : 'Cash out'} sub={canCash ? undefined : 'After your first right answer'} onPress={onCash} disabled={!canCash} color={def.tint} ink={GT.onTint} />
      </TourTarget>
    </View>
  );
}

/* ---------- inputs ---------- */
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** A draggable slider over `min`…1 (`frac`; below zero fills red, above green): mouse (pointer events) on the web, touch
 *  (the responder) on a phone; tap anywhere to jump; screen readers step it by 1/`steps`. Map `frac` to your own value. */
export function Slider({ frac, min, onChange, disabled, label, text, steps = 30 }: { frac: number; min: number; onChange: (f: number) => void; disabled?: boolean; label: string; text: string; steps?: number }) {
  const [w, setW] = useState(0);
  const drag = useRef(false);
  const web = Platform.OS === 'web';
  const at = (x: number) => { if (!disabled && w > 0 && Number.isFinite(x)) onChange(clamp(min + (x / w) * (1 - min), min, 1)); };
  type PE = { nativeEvent: { offsetX: number; pointerId: number }; currentTarget: unknown };
  const handlers = web
    ? {
      onPointerDown: (e: PE) => { drag.current = true; try { (e.currentTarget as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.nativeEvent.pointerId); } catch { /* not every browser lets it */ } at(e.nativeEvent.offsetX); },
      onPointerMove: (e: PE) => { if (drag.current) at(e.nativeEvent.offsetX); },
      onPointerUp: () => { drag.current = false; },
      onPointerCancel: () => { drag.current = false; },
    }
    : {
      onStartShouldSetResponder: () => !disabled,
      onMoveShouldSetResponder: () => !disabled,
      onResponderGrant: (e: GestureResponderEvent) => { Haptics.selectionAsync().catch(() => {}); at(e.nativeEvent.locationX); },
      onResponderMove: (e: GestureResponderEvent) => at(e.nativeEvent.locationX),
      onResponderTerminationRequest: () => false,
    };
  const pos = ((frac - min) / (1 - min)) * w;
  const zero = ((0 - min) / (1 - min)) * w;
  const fill = frac > 0 ? C.up : frac < 0 ? C.down : C.ink;
  const step = (1 - min) / steps;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(clamp(frac + (e.nativeEvent.actionName === 'increment' ? step : -step), min, 1))}
      style={[{ height: 44, justifyContent: 'center', opacity: disabled ? 0.45 : 1 }, (web ? { touchAction: 'none', cursor: 'pointer', userSelect: 'none' } : null) as object]}
      {...(handlers as object)}>
      <View pointerEvents="none" style={{ height: 8, borderRadius: 4, backgroundColor: GT.pressed }} />
      {w > 0 ? (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', left: Math.min(zero, pos), width: Math.abs(pos - zero), height: 8, top: 18, borderRadius: 4, backgroundColor: fill }} />
          {min < 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: zero - 1, top: 12, width: 2, height: 20, borderRadius: 1, backgroundColor: '#5A5A66' }} /> : null}
          <View pointerEvents="none" style={{ position: 'absolute', left: pos - 14, top: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: C.ink, borderWidth: 4, borderColor: fill === C.ink ? '#3A3A44' : fill }} />
        </>
      ) : null}
    </View>
  );
}

/** A number line from `min` to `max` with marks on it (guesses, the live or final value); the second mark's tag sits
 *  under the line so two tags don't collide. */
export function Ruler({ min, max, marks }: { min: number; max: number; marks: { v: number; color: string; label: string; big?: boolean }[] }) {
  const [w, setW] = useState(0);
  const x = (v: number) => clamp((v - min) / (max - min || 1), 0, 1) * w;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 58, justifyContent: 'center', marginHorizontal: 6 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: GT.pressed }} />
      {min < 0 && w > 0 ? <View style={{ position: 'absolute', left: x(0) - 1, top: 21, width: 2, height: 16, backgroundColor: '#4A4A55' }} /> : null}
      {w > 0 ? marks.map((k, i) => {
        const cx = x(k.v);
        const out = k.v < min ? '‹ ' : k.v > max ? ' ›' : '';
        const below = i === 1; // the bot's tag sits under the line so the tags don't collide
        return (
          <View key={k.label} pointerEvents="none" style={{ position: 'absolute', left: Math.max(-6, Math.min(w - 44, cx - 22)), width: 44, alignItems: 'center', top: below ? 17 : 4 }}>
            {!below ? <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10, color: k.color, marginBottom: 2 }}>{k.v < min ? out + k.label : k.label + out}</Text> : null}
            <View style={{ width: k.big ? 4 : 12, height: k.big ? 24 : 12, borderRadius: k.big ? 2 : 6, backgroundColor: k.color, borderWidth: k.big ? 0 : 2, borderColor: '#000', marginTop: k.big ? 0 : 6 }} />
            {below ? <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 10, color: k.color, marginTop: 2 }}>{k.v < min ? out + k.label : k.label + out}</Text> : null}
          </View>
        );
      }) : null}
    </View>
  );
}
