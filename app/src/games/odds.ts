// Live odds (Nov 20). Games with a fixed payout (touch a target, survive at leverage) price it from how much the market
// has really been moving: the volatility of the last ten minutes of ticks, treated as a random walk. Payouts are 97% of
// the fair odds, so a round has the same small edge a real venue's fees would, and it's shown before you play.
import type { Feed } from './feed';

/** Per-√second volatility (as a fraction) from recent ticks; `fallback` when there isn't enough history yet. */
export function sigmaOf(f: Feed, sym: string, fallback = 1e-4, windowMs = 10 * 60_000) {
  const h = f.since(sym, Date.now() - windowMs);
  if (h.length < 12) return fallback;
  let ss = 0, secs = 0;
  for (let i = 1; i < h.length; i++) {
    const r = Math.log(h[i]!.p / h[i - 1]!.p);
    ss += r * r;
    secs += (h[i]!.t - h[i - 1]!.t) / 1000;
  }
  if (secs < 30) return fallback;
  const s = Math.sqrt(ss / secs);
  return Number.isFinite(s) && s > 0 ? Math.max(s, 2e-6) : fallback;
}

/** Standard normal CDF. */
export function phi(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Chance a random walk touches a level `d` (fraction) away, on one side, within `secs`. */
export const pTouch = (d: number, sigma: number, secs: number) => Math.min(1, 2 * (1 - phi(d / (sigma * Math.sqrt(Math.max(secs, 1))))));

/** Chance it stays inside ±d for the whole `secs` (two-sided barrier, exact series). */
export function pStay(d: number, sigma: number, secs: number) {
  const v = sigma * sigma * Math.max(secs, 1);
  let s = 0;
  for (let k = 0; k < 40; k++) {
    const n = 2 * k + 1;
    s += ((k % 2 ? -1 : 1) / n) * Math.exp((-n * n * Math.PI * Math.PI * v) / (8 * d * d));
  }
  return Math.max(0, Math.min(1, (4 / Math.PI) * s));
}

/** The half-width of a band the price has an even chance of breaking inside `secs`. */
export function evenBand(sigma: number, secs: number) {
  let lo = 1e-6, hi = 0.5;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (pStay(m, sigma, secs) < 0.5) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** A move size the price has an even chance of beating (up or down) at the bell. */
export const evenMove = (sigma: number, secs: number) => 0.6745 * sigma * Math.sqrt(Math.max(secs, 1));

export const EDGE = 0.97;
/** A fixed payout for something with chance `p`: 97% of fair, between 1.01× and 50×. */
export const payoutFor = (p: number) => Math.max(1.01, Math.min(50, (EDGE / Math.max(p, 0.001))));
export const fmtX = (m: number) => `${m >= 10 ? m.toFixed(0) : m.toFixed(2)}×`;
export const fmtPct = (f: number, dp = 2) => `${(f * 100).toFixed(dp)}%`;
export const signedPct = (f: number, dp = 2) => `${f >= 0 ? '+' : '−'}${Math.abs(f * 100).toFixed(dp)}%`;

export const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]!;
export function sample<T>(a: readonly T[], n: number): T[] {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j]!, c[i]!]; }
  return c.slice(0, n);
}
