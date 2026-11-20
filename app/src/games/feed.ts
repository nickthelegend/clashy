// Live prices for the games (Nov 20). One poll reads every market Phoenix lists (crypto, memecoins, US stocks, gold,
// oil, FX: about 110 perps) plus Pacifica's for the few Phoenix doesn't have, through the Clashy relay's 1.5 s cache.
// Every game screen shares that one stream, and each market keeps the last 20 minutes of ticks so a chart starts full.
//
// Prices are the venues' real mark prices. Nothing here fills in a price it didn't receive: a market that stops
// answering goes stale, and the games refuse to start or settle on a stale price.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { loadPacifica, loadPhoenix, pacificaQuotes, phoenixQuotes, type VenueMarket } from '@/chain/venues';

export type Tick = { t: number; p: number };
export type Mark = { p: number; t: number; ch24?: number };

/** Pacifica's names for what Phoenix calls something else. */
export const PAC_ALIAS: Record<string, string> = { XAU: 'GOLD', XAG: 'SILVER', CL: 'WTIOIL', SP500: 'SPY', SKHYNIX: 'SKHY' };
const POLL_MS = 1500;
/** A price older than this can't start or settle a round. */
export const STALE_MS = 8000;
const KEEP_MS = 20 * 60_000;

const marks = new Map<string, Mark>();
const hist = new Map<string, Tick[]>();
let error: string | undefined;
let version = 0;
const subs = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

const emit = () => { version += 1; subs.forEach((f) => f()); };
function push(sym: string, p: number, t: number, ch24?: number) {
  const prev = marks.get(sym);
  marks.set(sym, { p, t, ch24: ch24 ?? prev?.ch24 });
  const h = hist.get(sym) ?? [];
  if (!h.length || h[h.length - 1]!.p !== p || t - h[h.length - 1]!.t > 4000) h.push({ t, p });
  while (h.length && t - h[0]!.t > KEEP_MS) h.shift();
  hist.set(sym, h);
}

async function poll() {
  const t = Date.now();
  const [phx, pac] = await Promise.all([phoenixQuotes().catch((e: Error) => e), pacificaQuotes().catch((e: Error) => e)]);
  const errs: string[] = [];
  if (phx instanceof Error) errs.push(phx.message);
  else for (const [sym, q] of Object.entries(phx)) push(sym, q.mark, t);
  if (pac instanceof Error) errs.push(pac.message);
  else for (const [raw, q] of Object.entries(pac)) {
    const sym = PAC_ALIAS[raw] ?? raw;
    if (sym === 'SOL-USDC') continue;
    // Phoenix's mark leads where both list it; Pacifica adds its 24 h change, and the markets Phoenix doesn't have
    const onPhx = !(phx instanceof Error) && phx[sym];
    if (onPhx) { const m = marks.get(sym); if (m && q.change24h !== undefined) marks.set(sym, { ...m, ch24: q.change24h }); }
    else push(sym, q.mark, t, q.change24h);
  }
  error = errs.length === 2 ? errs[0] : undefined;
  emit();
}

function loop() {
  timer = setTimeout(async () => {
    try { await poll(); } catch (e) { error = (e as Error).message; emit(); }
    if (users > 0) loop();
  }, POLL_MS);
}
function start() {
  users += 1;
  if (users === 1) { void poll().catch((e: Error) => { error = e.message; emit(); }); loop(); }
  return () => { users -= 1; if (users <= 0 && timer) { clearTimeout(timer); timer = undefined; } };
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => version;
/** Subscribes to the live stream while the screen is open; re-renders on every tick. The object it returns is new on
 *  every tick (same methods), so anything derived from it, including what React Compiler memoizes, is worked out again
 *  on fresh prices instead of being cached against an object that never changed. */
export function useFeed(): Feed {
  useEffect(start, []);
  const v = useSyncExternalStore(subscribe, snap, snap);
  return useMemo(() => ({ ...feed, v }), [v]);
}

export const feed = {
  mark: (sym: string) => marks.get(sym),
  price: (sym: string) => marks.get(sym)?.p,
  fresh: (sym: string) => { const m = marks.get(sym); return !!m && Date.now() - m.t < STALE_MS; },
  /** Ticks since `from` (ms), oldest first. */
  since: (sym: string, from = 0) => (hist.get(sym) ?? []).filter((x) => x.t >= from),
  error: () => error,
  /** Has the market moved at all in the last few minutes? US stocks barely move outside market hours. */
  moving: (sym: string, ms = 180_000) => {
    const h = (hist.get(sym) ?? []).filter((x) => Date.now() - x.t < ms);
    if (h.length < 3) return true;
    const lo = Math.min(...h.map((x) => x.p)), hi = Math.max(...h.map((x) => x.p));
    return hi / lo - 1 > 0.00005;
  },
};
export type Feed = typeof feed & { v?: number };

/* ---------- names and logos ---------- */
export type Info = { sym: string; name: string; icon?: string; assetClass?: string; maxLev: number };
let infoP: Promise<Map<string, Info>> | null = null;
let infoAt = 0;
function loadInfo() {
  if (infoP && Date.now() - infoAt < 10 * 60_000) return infoP;
  infoAt = Date.now();
  infoP = Promise.all([loadPhoenix().catch(() => [] as VenueMarket[]), loadPacifica().catch(() => [] as VenueMarket[])]).then(([phx, pac]) => {
    const m = new Map<string, Info>();
    for (const v of phx) m.set(v.sym, { sym: v.sym, name: v.name, icon: v.icon, assetClass: v.assetClass, maxLev: v.maxLev });
    for (const v of pac) {
      const sym = PAC_ALIAS[v.sym] ?? v.sym;
      if (!m.has(sym)) m.set(sym, { sym, name: v.name, maxLev: v.maxLev });
    }
    if (!m.size) { infoP = null; throw new Error("Can't load the market list from Phoenix or Pacifica right now."); }
    return m;
  });
  return infoP;
}

const NICE: Record<string, string> = {
  kBONK: 'Bonk', kPEPE: 'Pepe', kSHIB: 'Shiba Inu', FARTCOIN: 'Fartcoin', PUMP: 'Pump', WIF: 'dogwifhat', PENGU: 'Pudgy Penguins',
  TRUMP: 'Official Trump', PIPPIN: 'Pippin', USELESS: 'Useless', ANSEM: 'Ansem', SOL: 'Solana', BTC: 'Bitcoin', ETH: 'Ethereum',
  GOLD: 'Gold', SILVER: 'Silver', WTIOIL: 'Crude oil', SPY: 'S&P 500', QQQ: 'Nasdaq 100', EURUSD: 'Euro / dollar', GBPUSD: 'Pound / dollar', USDJPY: 'Dollar / yen',
};
/** The display name and logo of each symbol (Phoenix's metadata), loaded once and shared. */
export function useInfo(): { info: Map<string, Info> | null; error?: string } {
  const [state, set] = useState<{ info: Map<string, Info> | null; error?: string }>({ info: null });
  useEffect(() => {
    let alive = true;
    loadInfo().then((info) => alive && set({ info })).catch((e: Error) => alive && set({ info: null, error: e.message }));
    return () => { alive = false; };
  }, []);
  return state;
}
export const nameOf = (info: Map<string, Info> | null, sym: string) => NICE[sym] ?? info?.get(sym)?.name ?? sym;
/** What a symbol is shown as: kBONK is 1,000 BONK on the venues, so it's shown as BONK. */
export const tickerOf = (sym: string) => (/^k[A-Z]/.test(sym) ? sym.slice(1) : sym);

/** The pools games roll from: every symbol here trades on Phoenix or Pacifica. */
export const POOLS = {
  majors: ['SOL', 'BTC', 'ETH'],
  alts: ['HYPE', 'SUI', 'XRP', 'DOGE', 'BNB', 'AVAX', 'LINK', 'NEAR', 'TAO', 'ZEC', 'JUP', 'ENA', 'LTC', 'ADA', 'AAVE', 'UNI', 'RENDER', 'ONDO'],
  memes: ['FARTCOIN', 'kBONK', 'kPEPE', 'kSHIB', 'PUMP', 'WIF', 'PENGU', 'TRUMP', 'PIPPIN', 'USELESS', 'DOGE'],
  stocks: ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'PLTR', 'HOOD', 'AVGO', 'TSM', 'ORCL', 'MU', 'INTC'],
  indexes: ['SPY', 'QQQ'],
  commodities: ['GOLD', 'SILVER', 'WTIOIL', 'COPPER'],
  fx: ['EURUSD', 'GBPUSD', 'USDJPY'],
} as const;
export type PoolKey = keyof typeof POOLS;
/** The symbols of a game's pool: pool names, exact symbols, or a mix. */
export const poolOf = (k: PoolKey | readonly string[]): string[] => (typeof k === 'string' ? [...POOLS[k]] : [...new Set(k.flatMap((x) => (x in POOLS ? [...POOLS[x as PoolKey]] : [x])))]);

/** Symbols in the pool that have a fresh price right now, so a game never rolls a market that isn't answering. */
export function useLivePool(keys: PoolKey | PoolKey[] | readonly string[]) {
  const f = useFeed();
  const list = useMemo(() => poolOf(keys as PoolKey | readonly string[]), [keys]);
  return list.filter((s) => f.fresh(s));
}

/** A sensible volatility (per √second) before a market has ten minutes of ticks: majors calmest, memecoins wildest. */
export function fallbackSigma(sym: string) {
  const inP = (k: PoolKey) => (POOLS[k] as readonly string[]).includes(sym);
  if (inP('memes')) return 3e-4;
  if (inP('alts')) return 1.6e-4;
  if (inP('stocks') || inP('indexes')) return 1e-4;
  if (inP('commodities')) return 6e-5;
  if (inP('fx')) return 3e-5;
  return 9e-5;
}

