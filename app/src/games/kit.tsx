// The pieces every game is built from (Nov 20): the round API the game screen hands each engine, the clock, market
// heads and charts on the live feed, the big choice buttons, the stake chips and Clashy Bot's line. Engines live in
// ./engines; each one is a component that gets a GameApi and draws its own setup and live round with these.
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { STOCK_ART } from '@/ui/feed';
import { ART, LiveChart, Row, Txt } from '@/ui/kit';
import { BotPic, MarketLogo } from '@/ui/practice-kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { POOLS, nameOf, tickerOf, type Feed, type Info } from './feed';
import { signedPct } from './odds';
import type { GameDef } from './types';

export type Line = [string, string];
export type Phase = 'setup' | 'live' | 'done';
export type GameApi = {
  def: GameDef;
  feed: Feed;
  info: Map<string, Info> | null;
  stake: number;
  balance: number;
  phase: Phase;
  busy: boolean;
  /** Takes the stake and starts the round. False (with the reason shown) when it can't. */
  begin: (endsAt?: number) => Promise<boolean>;
  /** Ends the round: pays stake × mult (0 lost, 1 push, 2 a win against Clashy Bot…) with a verdict and receipt. */
  end: (mult: number, verdict: string, lines: Line[]) => void;
  /** No fair way to settle (the feed went quiet): the stake comes back. */
  abandon: (why: string) => void;
  /** Shows a problem under the game (undefined clears it). */
  fail: (msg?: string) => void;
  /** Bumps on every new round: engines key their round state on it. */
  round: number;
  /** The stake chips, for the engine to place above its start buttons. */
  stakeRow: ReactNode;
  /** The column width (for charts). */
  width: number;
};

/* ---------- time ---------- */
/** Seconds left until `endsAt` (ticks five times a second while running). */
export function useClock(endsAt?: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const h = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(h);
  }, [endsAt]);
  return endsAt ? Math.max(0, (endsAt - now) / 1000) : null;
}
export const fmtSecs = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.ceil(s)}s`);
/** The clock on a game's card: its round, or each call's length for games of quick calls. */
export const lengthOf = (d: Pick<GameDef, 'secs' | 'engine' | 'p'>) => (d.engine === 'streak' ? `${d.p?.roundSecs ?? 10} s calls` : d.engine === 'royale' ? `${d.p?.callSecs ?? 10} s calls` : lengthLabel(d.secs));
export const lengthLabel = (secs: number) => (secs <= 0 ? 'Instant' : secs < 60 ? `${secs} s` : secs < 3600 ? `${Math.round(secs / 60)} min` : `${Math.round(secs / 3600)} h`);

/* ---------- prices ---------- */
export const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function fmtPx(p?: number) {
  if (p === undefined || !Number.isFinite(p)) return '–';
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(p >= 100 ? 2 : 4)}`;
  return `$${p.toPrecision(4)}`;
}
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
      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#1C1C22', overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, width: `${f * 100}%`, backgroundColor: hot ? C.down : tint }} />
      </View>
    </View>
  );
}

/** A dark rounded panel. */
export function Panel({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  return <View style={[{ backgroundColor: '#111116', borderRadius: 24, padding: 16, borderWidth: tint ? 1 : 0, borderColor: tint ? `${tint}55` : 'transparent' }, style]}>{children}</View>;
}

/** A big choice button (UP / DOWN, STAY / BREAK, a market in a lineup). */
export function Choice({ title, sub, color, onPress, disabled, selected, h = 96, art }: { title: string; sub?: string; color: string; onPress: () => void; disabled?: boolean; selected?: boolean; h?: number; art?: ReactNode }) {
  const solid = selected === undefined || selected;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={sub ? `${title}, ${sub}` : title} accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => ({ flex: 1, minHeight: h, borderRadius: 24, paddingHorizontal: 10, paddingVertical: 12, backgroundColor: solid ? color : '#15151B', borderWidth: 2, borderColor: selected ? '#fff' : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      {art}
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.display, fontSize: 26, letterSpacing: -0.6, color: solid ? '#0A0A0D' : C.ink }}>{title}</Text>
      {sub ? <Text numberOfLines={2} style={{ ...FONT.semi, fontSize: 12.5, textAlign: 'center', color: solid ? 'rgba(10,10,13,0.72)' : C.muted }}>{sub}</Text> : null}
    </Pressable>
  );
}

/** The one primary button (Start, Lock it in, Cash out). */
export function Go({ title, onPress, color = C.brand, ink = C.onBrand, disabled, sub }: { title: string; onPress: () => void; color?: string; ink?: string; disabled?: boolean; sub?: string }) {
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ height: 58, borderRadius: 29, backgroundColor: color, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }], shadowColor: color, shadowOpacity: disabled ? 0 : 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } })}>
      <Text style={{ ...FONT.bold, fontSize: 18, color: ink }}>{title}</Text>
      {sub ? <Text style={{ ...FONT.semi, fontSize: 12, color: ink, opacity: 0.7 }}>{sub}</Text> : null}
    </Pressable>
  );
}

/** Clashy Bot's move, said plainly. */
export function BotSays({ text, right }: { text: string; right?: ReactNode }) {
  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <Row style={{ gap: 10, backgroundColor: '#15131D', borderRadius: 18, padding: 10, paddingRight: 14 }}>
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
              style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 22, backgroundColor: on ? C.ink : '#1A1A20', alignItems: 'center', justifyContent: 'center', opacity: short ? 0.35 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <Txt v="label" color={on ? '#000' : C.ink} style={{ fontSize: 15 }}>${s}</Txt>
            </Pressable>
          );
        })}
      </View>
    </TourTarget>
  );
}

/** A rolled lineup's slot-machine moment: logos flick through, then land. */
export function useRoll(pool: readonly string[], landed: readonly string[] | null, ms = 900) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(false);
    if (!landed?.length) return;
    const h = setInterval(() => setI((x) => x + 1), 90);
    const t = setTimeout(() => { clearInterval(h); setDone(true); }, ms);
    return () => { clearInterval(h); clearTimeout(t); };
  }, [landed?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (k: number) => (done || !landed ? landed?.[k] : pool[(i + k * 3) % Math.max(1, pool.length)]) ?? '';
}

/** A market tile in a lineup: logo, ticker, and the live move since `from`. */
export function MarketTile({ g, sym, from, onPress, selected, mark, disabled, rank }: { g: GameApi; sym: string; from?: number; onPress?: () => void; selected?: boolean; mark?: ReactNode; disabled?: boolean; rank?: number }) {
  const m = g.feed.mark(sym);
  const mv = from && m ? m.p / from - 1 : undefined;
  const w = useWindowDimensions().width;
  return (
    <Pressable onPress={onPress} disabled={!onPress || disabled} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={nameOf(g.info, sym)} accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({ flexBasis: w > 500 ? '31%' : '30%', flexGrow: 1, minHeight: 104, borderRadius: 20, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: selected ? '#221D33' : '#15151B', borderWidth: 2, borderColor: selected ? C.brand : 'transparent', opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {rank !== undefined ? <Text style={{ position: 'absolute', left: 9, top: 6, ...FONT.bold, fontSize: 12, color: rank === 1 ? '#FFD66B' : C.muted }}>#{rank}</Text> : null}
      {mark ? <View style={{ position: 'absolute', right: 6, top: 6 }}>{mark}</View> : null}
      <Logo sym={sym} info={g.info} size={38} />
      <Txt v="label" lines={1} style={{ fontSize: 14 }}>{tickerOf(sym)}</Txt>
      <Txt v="small" lines={1} color={mv === undefined ? C.muted : mv >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>
        {mv === undefined ? fmtPx(m?.p) : signedPct(mv, 2)}
      </Txt>
    </Pressable>
  );
}

/** A small tag (YOU, BOT, a side). */
export const Tag = ({ text, color }: { text: string; color: string }) => (
  <View style={{ backgroundColor: `${color}26`, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
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

export { ART };
