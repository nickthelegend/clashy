// How the games write numbers, times and moves (Nov 20). One place, so every game reads the same.
import { nameOf, tickerOf } from '../feed';
import { signedPct } from '../odds';
import type { GameDef } from '../types';
import type { GameApi } from './api';

/* ---------- money and prices ---------- */
export const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function fmtPx(p?: number) {
  if (p === undefined || !Number.isFinite(p)) return '–';
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(p >= 100 ? 2 : 4)}`;
  return `$${p.toPrecision(4)}`;
}

/* ---------- time ---------- */
export const fmtSecs = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.ceil(s)}s`);
export const lengthLabel = (secs: number) => (secs <= 0 ? 'Instant' : secs < 60 ? `${secs} s` : secs < 3600 ? `${Math.round(secs / 60)} min` : `${Math.round(secs / 3600)} h`);
/** The clock on a game's card: its round, or each call's length for games of quick calls. */
export const lengthOf = (d: Pick<GameDef, 'secs' | 'engine' | 'p'>) =>
  d.engine === 'streak' ? `${d.p?.roundSecs ?? 10} s calls`
    : d.engine === 'royale' ? `${d.p?.callSecs ?? 10} s calls`
      : d.engine === 'tower' ? `${d.p?.floorSecs ?? 10} s floors`
        : lengthLabel(d.secs);
export const secsIn = (t: number, start: number) => `${Math.max(0, Math.round((t - start) / 1000))} s in`;

/* ---------- moves ---------- */
/** A move with enough digits for a short round: 3 decimals under 1%, 2 above. */
export const mv = (f: number) => signedPct(f, Math.abs(f) < 0.01 ? 3 : 2);
export const absPct = (f: number) => `${(Math.abs(f) * 100).toFixed(Math.abs(f) < 0.01 ? 3 : 2)}%`;
/** A percent that is already in percent units (Pacifica's 24 h change: 2.5 = +2.5%). */
export const fmtPctUnits = (p: number, dp = 2) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(dp)}%`;
/** "Bitcoin (BTC)" */
export const mktLine = (g: GameApi, sym: string) => `${nameOf(g.info, sym)} (${tickerOf(sym)})`;

/* ---------- big numbers ---------- */
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
export type MemeMetric = 'mcap' | 'liquidity' | 'holders';
/** A meme metric as shown: dollars for cap and liquidity, a count for holders; `exact` drops the rounding. */
export const fmtMetric = (metric: MemeMetric, n: number, exact = false) =>
  metric === 'holders' ? fmtCount(n) : exact ? `$${Math.round(n).toLocaleString('en-US')}` : fmtCompactUsd(n);

export const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v ?? dflt));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
