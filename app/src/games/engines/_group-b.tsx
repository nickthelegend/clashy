// Shared pieces for six engines (Nov 20): podium, draft, compare, capguess, ko and royale. Rolling from markets that
// are moving, reading every market's first price at the bell, the pump.fun coins from Jupiter (through the practice
// catalog), big-number formatting, a count-up reveal and the streak / pot / cash-out bar of the instant games.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { loadCatalog, type Market } from '@/chain/practice';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { Go, Panel, usd, type GameApi } from '../kit';
import { fmtX } from '../odds';

/** Markets that have actually moved lately, when there are enough of them (US stocks sit still after hours). */
export function rollable(g: GameApi, live: string[], need: number) {
  const moving = live.filter((s) => g.feed.moving(s));
  return moving.length >= need ? moving : live;
}

/** Keeps the first price at or after `at` for each symbol in `ref` as it arrives; returns them once every one is in. */
export function bellPrices(g: GameApi, syms: readonly string[], at: number, ref: { current: Record<string, number> }) {
  for (const s of syms) {
    if (ref.current[s] !== undefined) continue;
    const m = g.feed.mark(s);
    if (m && m.t >= at) ref.current[s] = m.p;
  }
  return syms.every((s) => ref.current[s] !== undefined) ? { ...ref.current } : null;
}

export const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v ?? dflt));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/* ---------- pump.fun coins (Jupiter, via the practice catalog) ---------- */
export type MemeMetric = 'mcap' | 'liquidity' | 'holders';
/** The pump.fun launches trending on Jupiter. `on` false skips the load (an engine that doesn't need them). */
export function useMemes(on = true) {
  const [state, set] = useState<{ memes: Market[] | null; error?: string }>({ memes: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    set({ memes: null });
    loadCatalog(n > 0)
      .then((c) => { if (alive) set({ memes: c.memes }); })
      .catch((e: Error) => { if (alive) set({ memes: null, error: `${e.message} The pump.fun coins couldn't load.` }); });
    return () => { alive = false; };
  }, [on, n]);
  return { ...state, retry: () => setN((x) => x + 1) };
}

/* ---------- numbers ---------- */
/** Rounded to two significant figures: 1,237,400 → 1,200,000. */
export function nice(n: number) {
  if (!(n > 0)) return n;
  const f = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / f) * f;
}
const sig3 = (v: number) => String(Number(v.toPrecision(3)));
/** $1.2M, $340K, $56.1K, $820 */
export function fmtCompactUsd(n: number) {
  const a = Number(Math.abs(n).toPrecision(3)); // round first, so 999,600 shows as $1M, not $1000K
  if (a >= 1e9) return `$${sig3(a / 1e9)}B`;
  if (a >= 1e6) return `$${sig3(a / 1e6)}M`;
  if (a >= 1e3) return `$${sig3(a / 1e3)}K`;
  return `$${Math.round(a).toLocaleString('en-US')}`;
}
export const fmtCount = (n: number) => Math.round(n).toLocaleString('en-US');
/** A meme metric as shown: dollars for cap and liquidity, a count for holders; `exact` drops the rounding. */
export const fmtMetric = (metric: MemeMetric, n: number, exact = false) =>
  metric === 'holders' ? fmtCount(n) : exact ? `$${Math.round(n).toLocaleString('en-US')}` : fmtCompactUsd(n);
/** A percent that is already in percent units (Pacifica's 24 h change: 2.5 = +2.5%). */
export const fmtPctUnits = (p: number, dp = 2) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(dp)}%`;

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
export function PotBar({ g, mult, streak, canCash, onCash }: { g: GameApi; mult: number; streak: number; canCash: boolean; onCash: () => void }) {
  const { def } = g;
  return (
    <View style={{ gap: 12 }}>
      <Row style={{ gap: 10 }}>
        <Panel style={{ flex: 1, gap: 2 }}>
          <Txt v="small">Streak</Txt>
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
        <Go title={canCash ? `Cash out ${usd(g.stake * mult)}` : 'Cash out'} sub={canCash ? undefined : 'After your first right answer'} onPress={onCash} disabled={!canCash} color={def.tint} ink="#0A0A0D" />
      </TourTarget>
    </View>
  );
}
