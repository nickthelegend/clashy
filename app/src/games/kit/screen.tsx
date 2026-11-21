// The game screens' building blocks (Nov 21, lifted out of the Games page and the game screen): the hot card and the
// grid card, badges, the practice balance pill, category chips, the "jump back in" chip, a game's hero, the
// market-closed banner, the How to play sheet and the result card with its receipt. A new games screen (a weekly cup,
// a squad games page) is put together from these.
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { GameRun } from '@/chain/practice';
import { Row, Txt } from '@/ui/kit';
import { Sheet } from '@/ui/sheet';
import { C, FONT } from '@/ui/tokens';
import { ENGINE_ART } from '../art';
import { POOLS, poolOf, type PoolKey } from '../feed';
import { CATEGORIES, type Category, type GameDef } from '../types';
import type { Line } from './api';
import { lengthOf, usd } from './format';
import { GS, GT } from './tokens';

/** Who you play against, as a card says it. */
export const vsLabel = (g: Pick<GameDef, 'vs'>, short = false) => (g.vs === 'bot' ? (short ? 'vs Bot' : 'vs Clashy Bot') : g.vs === 'bots' ? 'vs 7 bots' : 'Solo');
export const catLabel = (c: Category) => CATEGORIES.find((x) => x.key === c)?.label ?? '';
export const openGame = (g: Pick<GameDef, 'id'>) => router.push(`/games/${g.id}` as Href);

/* ---------- cards ---------- */
/** "HOT", "NEW", "TOP": a small solid badge. */
export function Badge({ text }: { text: string }) {
  const color = text === 'Hot' ? GT.hot : text === 'New' ? C.brand : '#FFD60A';
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: color, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ ...FONT.bold, fontSize: 10.5, letterSpacing: 0.5, color: GT.onTint }}>{text.toUpperCase()}</Text>
    </View>
  );
}

/** A small info chip (length, vs, category, your record). */
export function InfoChip({ text, color = C.ink, size = 12 }: { text: string; color?: string; size?: number }) {
  return (
    <View style={{ backgroundColor: GT.chip, borderRadius: GS.radius.chip, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Txt v="small" color={color} style={{ ...FONT.semi, fontSize: size, fontVariant: ['tabular-nums'] }}>{text}</Txt>
    </View>
  );
}

/** The big card of the Hot carousel: tint glow, art, badge, name, hook, length and opponent. */
export function HotCard({ g, i = 0, w, onPress = () => openGame(g) }: { g: GameDef; i?: number; w: number; onPress?: () => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(i * 50).duration(320)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${g.name}. ${g.hook}`}
        style={({ pressed }) => ({ width: w, height: 168, borderRadius: GS.radius.hero, overflow: 'hidden', backgroundColor: GT.hero, borderWidth: 1.5, borderColor: `${g.tint}55`, padding: 16, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <View style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: g.tint, opacity: GS.glow.hot }} />
        <Image source={ENGINE_ART[g.engine]} style={{ position: 'absolute', right: 8, top: 10, width: 92, height: 92 }} contentFit="contain" />
        <Badge text={g.badge ?? 'Hot'} />
        <View style={{ flex: 1 }} />
        <Text numberOfLines={1} style={{ ...FONT.displayB, fontSize: 26, letterSpacing: -0.8, color: g.tint }}>{g.name}</Text>
        <Txt v="small" color={GT.sub} lines={1} style={{ ...FONT.semi }}>{g.hook}</Txt>
        <Txt v="small" style={{ marginTop: 3 }}>{lengthOf(g)} · {vsLabel(g)}</Txt>
      </Pressable>
    </Animated.View>
  );
}

/** A game in the grid: art, badge, name in its colour, two lines of hook, length and opponent. */
export function GameCard({ g, w, onPress = () => openGame(g) }: { g: GameDef; w: number; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${g.name}. ${g.hook}`}
      style={({ pressed }) => ({ width: w, minHeight: 196, borderRadius: GS.radius.card, overflow: 'hidden', backgroundColor: pressed ? GT.panelPressed : GT.panel, padding: 12, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <View style={{ position: 'absolute', left: -30, top: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: g.tint, opacity: GS.glow.card }} />
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Image source={ENGINE_ART[g.engine]} style={{ width: 64, height: 64 }} contentFit="contain" />
        {g.badge ? <Badge text={g.badge} /> : null}
      </Row>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.bold, fontSize: 18, letterSpacing: -0.4, color: g.tint, marginTop: 8 }}>{g.name}</Text>
      <Txt v="small" color={GT.subCard} lines={2} style={{ marginTop: 2, lineHeight: 17, minHeight: 34 }}>{g.hook}</Txt>
      <View style={{ flex: 1 }} />
      <Row style={{ gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
        <View style={{ backgroundColor: GT.chip, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" color={C.ink} style={{ fontSize: 11, ...FONT.semi }}>{lengthOf(g)}</Txt></View>
        <View style={{ backgroundColor: GT.chip, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" color={C.muted} style={{ fontSize: 11, ...FONT.semi }}>{vsLabel(g, true)}</Txt></View>
      </Row>
    </Pressable>
  );
}

/** A round chip with the art and the name ("Jump back in"). */
export function GameChip({ g, onPress = () => openGame(g) }: { g: GameDef; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={g.name}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingLeft: 6, paddingRight: 14, borderRadius: 24, backgroundColor: pressed ? '#1C1C24' : '#14141A' })}>
      <Image source={ENGINE_ART[g.engine]} style={{ width: 36, height: 36 }} contentFit="contain" />
      <Txt v="label" color={g.tint} style={{ fontSize: 14 }}>{g.name}</Txt>
    </Pressable>
  );
}

/** The practice balance pill (opens the Practice screen). */
export function BalancePill({ balance, onPress = () => router.push('/practice' as Href) }: { balance: number | null; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Practice balance"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.s2, borderRadius: 20, paddingHorizontal: 14, height: 38, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand }} />
      <Txt v="label" style={{ fontVariant: ['tabular-nums'] }}>{balance === null ? '…' : usd(balance)}</Txt>
      <Txt v="small">practice</Txt>
    </Pressable>
  );
}

/** Category chips with counts; the selected one is white. */
export function CategoryChips<K extends string>({ items, value, onChange }: { items: { key: K; label: string; n?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {items.map((c) => {
        const on = c.key === value;
        return (
          <Pressable key={c.key} onPress={() => onChange(c.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? C.ink : pressed ? '#1C1C24' : '#15151B' })}>
            <Txt v="label" color={on ? '#000' : C.ink} style={{ fontSize: 14 }}>{c.label}</Txt>
            {c.n !== undefined ? <Txt v="small" color={on ? '#444' : C.dim} style={{ fontSize: 12, ...FONT.semi }}>{c.n}</Txt> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ---------- one game ---------- */
/** A game's hero: tint glow, art, name, hook, then chips (length, opponent, category and your record). */
export function GameHero({ def, record }: { def: GameDef; record?: { wins: number; played: number; net: number } }) {
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={{ borderRadius: GS.radius.hero, overflow: 'hidden', backgroundColor: GT.hero, borderWidth: 1.5, borderColor: `${def.tint}44`, padding: 16 }}>
      <View style={{ position: 'absolute', right: -50, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: def.tint, opacity: GS.glow.hero }} />
      <Row style={{ gap: 14, alignItems: 'center' }}>
        <Image source={ENGINE_ART[def.engine]} style={{ width: 84, height: 84 }} contentFit="contain" />
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* web ignores adjustsFontSizeToFit, so long names step down a size instead of being cut off */}
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: def.name.length > 14 ? 26 : 32, letterSpacing: -1, color: def.tint, lineHeight: 38 }}>{def.name}</Text>
          <Txt v="small" color={GT.sub} style={{ ...FONT.semi, fontSize: 14, lineHeight: 19, marginTop: 2 }}>{def.hook}</Txt>
        </View>
      </Row>
      <Row style={{ gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {[lengthOf(def), vsLabel(def), catLabel(def.cat)].map((t) => <InfoChip key={t} text={t} />)}
        {record?.played ? <InfoChip text={`${record.wins}/${record.played} won · ${record.net >= 0 ? '+' : '−'}${usd(Math.abs(record.net))}`} color={record.net >= 0 ? C.up : C.down} /> : null}
      </Row>
    </Animated.View>
  );
}

/** Whether the US stock market is open now (9:30–16:00 New York time, Monday to Friday; holidays not counted). */
export function usMarketOpen(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
    const day = get('weekday'), mins = Number(get('hour')) % 24 * 60 + Number(get('minute'));
    return !['Sat', 'Sun'].includes(day) && mins >= 570 && mins < 960;
  } catch { return true; }
}
const STOCKY = new Set<string>([...POOLS.stocks, ...POOLS.indexes]);
/** Mostly US stocks: they barely move outside market hours. */
export const isStocky = (def: Pick<GameDef, 'pool'>) => {
  const pool = poolOf(def.pool as PoolKey | readonly string[]);
  return pool.filter((x) => STOCKY.has(x)).length > pool.length / 2;
};

/** A yellow banner line (the US market is closed…). */
export function WarnBanner({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: GT.warnBg, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GT.warn }} />
      <Txt v="small" color={GT.warnInk} style={{ flex: 1, lineHeight: 18 }}>{text}</Txt>
    </View>
  );
}
/** Shown on stock games while the US market is closed. */
export function MarketClosedBanner({ def, style }: { def: Pick<GameDef, 'pool'>; style?: StyleProp<ViewStyle> }) {
  if (!isStocky(def) || usMarketOpen()) return null;
  return <View style={style}><WarnBanner text="The US market is closed. Stocks barely move until it opens at 9:30 New York time." /></View>;
}

/** How to play: the three numbered lines from the catalog and who you're up against. */
export function RulesSheet({ def, open, onClose }: { def: GameDef; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={def.name} sub={def.hook}>
      <View style={{ gap: 12, paddingBottom: 8 }}>
        {def.how.map((line, i) => (
          <Row key={i} style={{ gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${def.tint}2E`, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...FONT.bold, fontSize: 13, color: def.tint }}>{i + 1}</Text>
            </View>
            <Txt v="body" style={{ flex: 1, lineHeight: 22 }}>{line}</Txt>
          </Row>
        ))}
        <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>Practice money on live prices from Phoenix and Pacifica. {def.vs === 'bot' ? 'Clashy Bot picks at random.' : def.vs === 'bots' ? 'The bots call at random.' : ''}</Txt>
      </View>
    </Sheet>
  );
}

/** The end of a round: YOU WON / LOST / PUSH, the P&L, the verdict, the receipt of real prices, and what's next. */
export function ResultCard({ run, verdict, tint, onAgain, onMore = () => router.push('/games' as Href) }: { run: GameRun; verdict: string; tint: string; onAgain: () => void; onMore?: () => void }) {
  const won = run.result === 'won', lost = run.result === 'lost';
  const color = won ? C.up : lost ? C.down : C.muted;
  const big = won ? `+${usd(run.pnl ?? 0)}` : lost ? `−${usd(Math.abs(run.pnl ?? 0))}` : 'Stake back';
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} style={{ marginTop: 18, borderRadius: GS.radius.hero, backgroundColor: GT.result, borderWidth: 1.5, borderColor: `${color}66`, padding: 18 }}>
      <Txt v="small" color={color} style={{ ...FONT.bold, letterSpacing: 1.2 }}>{won ? 'YOU WON' : lost ? 'YOU LOST' : run.result === 'push' ? 'PUSH' : 'NO RESULT'}</Txt>
      <Text style={{ ...FONT.displayB, fontSize: 46, letterSpacing: -1.6, color, marginTop: 2, fontVariant: ['tabular-nums'] }}>{big}</Text>
      <Txt v="body" color={C.ink} style={{ marginTop: 2 }}>{verdict}</Txt>
      {run.lines?.length ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: GT.hair, paddingTop: 10, gap: 7 }}>
          {[...run.lines, ['Stake', usd(run.stake)] as Line, ['Paid out', usd(run.payout ?? 0)] as Line].map(([k, v]) => (
            <Row key={k} style={{ justifyContent: 'space-between', gap: 12 }}>
              <Txt v="small">{k}</Txt>
              <Txt v="small" color={C.ink} lines={1} style={{ ...FONT.semi, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v}</Txt>
            </Row>
          ))}
        </View>
      ) : null}
      <Row style={{ gap: 10, marginTop: 16 }}>
        <Pressable onPress={onMore} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, height: GS.h.result, borderRadius: 26, backgroundColor: pressed ? GT.pressed : C.s2, alignItems: 'center', justifyContent: 'center' })}>
          <Txt v="label" color={C.ink}>More games</Txt>
        </Pressable>
        <Pressable onPress={onAgain} accessibilityRole="button" style={({ pressed }) => ({ flex: 1.3, height: GS.h.result, borderRadius: 26, backgroundColor: tint, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
          <Txt v="label" color={GT.onTint} style={{ ...FONT.bold }}>Play again</Txt>
        </Pressable>
      </Row>
    </Animated.View>
  );
}
