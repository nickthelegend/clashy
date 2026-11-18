// Practice: paper trading on real, live markets. Stocks (tokenized xStocks), crypto, pump.fun memecoins, and perps on
// three Solana venues: Jupiter Perps (pool, SOL/ETH/BTC up to 100x) and the order books of Phoenix and Pacifica (every
// market they list: crypto, stocks, commodities, FX). Every price, fee, funding and borrow rate is read live from the
// venues' public APIs, and order-book trades fill level by level against the real book (./venues.ts); the money is
// not real. The paper book ($10,000 to start) lives on this device in AsyncStorage, one per wallet (or one per device
// when signed out). No USDC moves and nothing is sent on chain: that is the point of this mode.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NET } from './client';
import { STOCKS } from './stocks';
import {
  VENUES, isBookVenue, loadPacifica, loadPhoenix, pacificaQuotes, phoenixQuotes, readBook, type BookVenue, type Venue, type VenueMarket,
} from './venues';
import { useWallet } from './walletCore';

// Jupiter's public market data, read through the Clashy relay's shared cache (chain/scripts/sponsor.ts /jup/…) so every
// player shares one request stream instead of each browser hitting Jupiter's anonymous rate limit.
const JUP = `${NET.sponsor}/jup/lite`;
const PERPS_API = `${NET.sponsor}/jup/perps/v1`;

/* ---------- markets ---------- */
export type Kind = 'stock' | 'crypto' | 'perp' | 'meme';
export type Market = {
  /** Route id: the token mint, or SOL-PERP / ETH-PERP / BTC-PERP. */
  id: string;
  kind: Kind;
  /** Display ticker (NVDA, SOL, SOL-PERP, the memecoin's own symbol). */
  symbol: string;
  name: string;
  /** The mint whose Jupiter price drives this market. */
  mint: string;
  /** Jupiter's own ticker for the token (NVDAx, cbBTC). */
  ticker?: string;
  /** Real logo from Jupiter's token list. */
  icon?: string;
  /** A bundled logo instead: one of the five stocks (STOCK_ART) or SOL / BTC / ETH. */
  stockSym?: string;
  art?: 'SOL' | 'BTC' | 'ETH';
  maxLev: number;
  mcap?: number;
  liquidity?: number;
  holders?: number;
  createdAt?: string;
  organic?: string;
  circSupply?: number;
  /** Jupiter's token-list price and 24h move when the catalog loaded (the live price comes from usePrices). */
  price?: number;
  change24h?: number;
  /** Where a perp trades (Jupiter for spot markets too: their price is Jupiter's). */
  venue?: Venue;
  /** The order-book venue's own symbol (SOL, NVDA, kBONK). */
  venueSym?: string;
  assetClass?: string;
  /** Order-book venues: percent of the notional. */
  takerPct?: number;
  makerPct?: number;
  minUsd?: number;
};

export const MINT = {
  SOL: 'So11111111111111111111111111111111111111112',
  CBBTC: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  /** Wrapped BTC (Portal): the BTC custody of Jupiter Perps. */
  WBTC: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
} as const;

const CRYPTO: { symbol: string; name: string; mint: string; art?: Market['art'] }[] = [
  { symbol: 'SOL', name: 'Solana', mint: MINT.SOL, art: 'SOL' },
  { symbol: 'BTC', name: 'Bitcoin', mint: MINT.CBBTC, art: 'BTC' },
  { symbol: 'ETH', name: 'Ethereum', mint: MINT.ETH, art: 'ETH' },
  { symbol: 'JUP', name: 'Jupiter', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  { symbol: 'JTO', name: 'Jito', mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL' },
  { symbol: 'PYTH', name: 'Pyth Network', mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3' },
  { symbol: 'RAY', name: 'Raydium', mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' },
  { symbol: 'BONK', name: 'Bonk', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { symbol: 'WIF', name: 'dogwifhat', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
];

/** Jupiter Perps markets. The price is Jupiter's price of the pool's custody token. */
export const PERPS: Market[] = [
  { id: 'SOL-PERP', kind: 'perp', symbol: 'SOL-PERP', name: 'Solana', mint: MINT.SOL, art: 'SOL', maxLev: 100, venue: 'jupiter' },
  { id: 'ETH-PERP', kind: 'perp', symbol: 'ETH-PERP', name: 'Ethereum', mint: MINT.ETH, art: 'ETH', maxLev: 100, venue: 'jupiter' },
  { id: 'BTC-PERP', kind: 'perp', symbol: 'BTC-PERP', name: 'Bitcoin', mint: MINT.WBTC, art: 'BTC', maxLev: 100, venue: 'jupiter' },
];
export const LEVERAGE = [2, 5, 10, 25, 50, 100] as const;
/** The leverage chips for a market: the usual steps up to its cap, and the cap itself. */
export function levSteps(max: number): number[] {
  const s: number[] = [2, 3, 5, 10, 20, 25, 50, 100].filter((x) => x < max);
  const out = [...s.slice(-5), max];
  return [...new Set(out)].filter((x) => x >= 1);
}

/* ---------- order-book venues ---------- */
const PREFIX: Record<BookVenue, string> = { phoenix: 'phx', pacifica: 'pac' };
/** The price key of an order-book market: "phx:SOL" / "pac:SOL" (Jupiter markets use their mint). */
export const venueKey = (v: BookVenue, sym: string) => `${PREFIX[v]}:${sym}`;
const keyVenue = (k: string): BookVenue | undefined => (k.startsWith('phx:') ? 'phoenix' : k.startsWith('pac:') ? 'pacifica' : undefined);
const ART_OF: Record<string, Market['art']> = { SOL: 'SOL', BTC: 'BTC', ETH: 'ETH' };
const STOCK_SYMS = new Set(STOCKS.map((s) => s.symbol));
/** Pacifica's names for markets Phoenix calls something else (for the name and logo only). */
const ALIAS: Record<string, string> = { XAU: 'GOLD', XAG: 'SILVER', CL: 'WTIOIL', SP500: 'SPY', SKHYNIX: 'SKHY' };
const PLAIN: Record<string, string> = { XAU: 'Gold', XAG: 'Silver', CL: 'Crude oil (WTI)', SP500: 'S&P 500', NATGAS: 'Natural gas', PAXG: 'PAX Gold', PLATINUM: 'Platinum', COPPER: 'Copper', URNM: 'Uranium miners ETF', EURUSD: 'Euro / US dollar', USDJPY: 'US dollar / yen' };
/** The most traded symbols first, then A to Z. */
const POPULAR = ['SOL', 'BTC', 'ETH', 'HYPE', 'PUMP', 'FARTCOIN', 'DOGE', 'XRP', 'NVDA', 'TSLA', 'SPY', 'GOLD', 'XAU', 'AAPL', 'kBONK', 'JUP', 'SUI', 'BNB'];
const rank = (sym: string) => { const i = POPULAR.indexOf(sym); return i < 0 ? 1000 : i; };
function venueMarket(v: VenueMarket, phxBySym: Map<string, VenueMarket>): Market {
  const twin = phxBySym.get(v.sym) ?? phxBySym.get(ALIAS[v.sym] ?? '');
  const name = PLAIN[v.sym] ?? (v.name !== v.sym ? v.name : twin?.name ?? v.sym);
  return {
    id: `${v.venue}-${v.sym}`, kind: 'perp', symbol: `${v.sym}-PERP`, name, mint: venueKey(v.venue, v.sym),
    icon: v.icon ?? twin?.icon, art: ART_OF[v.sym], stockSym: STOCK_SYMS.has(v.sym) ? v.sym : undefined, assetClass: v.assetClass ?? twin?.assetClass,
    maxLev: v.maxLev, venue: v.venue, venueSym: v.sym, takerPct: v.takerPct, makerPct: v.makerPct, minUsd: v.minUsd,
  };
}

type JupToken = {
  id: string; name: string; symbol: string; icon?: string; usdPrice?: number; mcap?: number; liquidity?: number;
  holderCount?: number; circSupply?: number; launchpad?: string; tags?: string[]; isVerified?: boolean;
  organicScoreLabel?: string; createdAt?: string; firstPool?: { createdAt?: string }; stats24h?: { priceChange?: number };
};

export class ApiError extends Error {
  status?: number;
  constructor(msg: string, status?: number) { super(msg); this.status = status; }
}
async function getJson<T>(url: string, what: string): Promise<T> {
  let r: Response;
  try { r = await fetch(url, { headers: { accept: 'application/json' } }); } catch { throw new ApiError(`Can't reach ${what}. Check your connection.`); }
  if (r.status === 429) throw new ApiError(`${what} is rate limiting reads.`, 429);
  if (!r.ok) throw new ApiError(`${what} answered ${r.status}.`, r.status);
  try { return (await r.json()) as T; } catch { throw new ApiError(`${what} sent an answer we couldn't read.`); }
}

const tokenFacts = (t?: JupToken): Partial<Market> => (t ? {
  icon: t.icon, mcap: t.mcap, liquidity: t.liquidity, holders: t.holderCount, circSupply: t.circSupply, ticker: t.symbol,
  createdAt: t.firstPool?.createdAt ?? t.createdAt, organic: t.organicScoreLabel, price: t.usdPrice, change24h: t.stats24h?.priceChange,
} : {});
const isXStock = (t: JupToken) => !!t.tags?.includes('xstocks') && (!!t.tags?.includes('verified') || !!t.isVerified) && /x$/.test(t.symbol);
const isPump = (t: JupToken) => t.launchpad === 'pump.fun';
/** pump.fun names are user-chosen: slurs and sexual names stay out of a product anyone can open. */
const BLOCKED = /n[i1!]gg|f[a@]gg?[o0]t|retard|k[i1]ke|ch[i1]nk|tr[a@]nn|whore|sl[u*]t|t[i1]tt|boob|cum\b|porn|nsfw|pussy|d[i1]ck|cock|anal\b|hitler|nazi|rape/i;
const clean = (t: JupToken) => !BLOCKED.test(`${t.name} ${t.symbol}`);
const stockFrom = (t: JupToken): Market => ({ ...tokenFacts(t), id: t.id, kind: 'stock', symbol: t.symbol.replace(/x$/, ''), name: t.name.replace(/\s*xStock$/i, ''), mint: t.id, maxLev: 1 });
const memeFrom = (t: JupToken): Market => ({ ...tokenFacts(t), id: t.id, kind: 'meme', symbol: t.symbol, name: t.name, mint: t.id, maxLev: 1 });
const spotFrom = (t: JupToken): Market => ({ ...tokenFacts(t), id: t.id, kind: 'crypto', symbol: t.symbol, name: t.name, mint: t.id, maxLev: 1 });

export type Catalog = {
  stocks: Market[]; crypto: Market[]; perps: Market[]; memes: Market[]; at: number;
  /** A venue whose market list couldn't load right now (its markets are missing from perps until it answers). */
  venueErrors: Partial<Record<Venue, string>>;
};
let catCache: { at: number; p: Promise<Catalog> } | null = null;

/** Every practice market: the five Clashy stocks plus every verified xStock trending on Jupiter, majors, the three
 *  perps, and the pump.fun launches trending in the last hour and day. Cached for a minute. */
export function loadCatalog(force = false): Promise<Catalog> {
  if (!force && catCache && Date.now() - catCache.at < 60_000) return catCache.p;
  const p = (async () => {
    const curated = [...STOCKS.map((s) => s.mint), ...CRYPTO.map((c) => c.mint), MINT.WBTC];
    const phxP = loadPhoenix(), pacP = loadPacifica();
    phxP.catch(() => {}); pacP.catch(() => {});
    const [known, t1, t24] = await Promise.all([
      getJson<JupToken[]>(`${JUP}/tokens/v2/search?query=${curated.join(',')}`, 'Jupiter tokens'),
      getJson<JupToken[]>(`${JUP}/tokens/v2/toptrending/1h?limit=100`, 'Jupiter trending'),
      getJson<JupToken[]>(`${JUP}/tokens/v2/toptrending/24h?limit=100`, 'Jupiter trending'),
    ]);
    const venueErrors: Catalog['venueErrors'] = {};
    const [phx, pac] = await Promise.all([
      phxP.catch((e) => { venueErrors.phoenix = (e as Error).message; return [] as VenueMarket[]; }),
      pacP.catch((e) => { venueErrors.pacifica = (e as Error).message; return [] as VenueMarket[]; }),
    ]);
    const phxBySym = new Map(phx.map((m) => [m.sym, m]));
    const books = [...phx, ...pac].map((v) => venueMarket(v, phxBySym))
      .sort((a, b) => rank(a.venueSym!) - rank(b.venueSym!) || a.venueSym!.localeCompare(b.venueSym!) || a.venue!.localeCompare(b.venue!));
    const byId = new Map(known.map((t) => [t.id, t]));
    const stocks: Market[] = STOCKS.map((s) => ({ ...tokenFacts(byId.get(s.mint)), id: s.mint, kind: 'stock', symbol: s.symbol, name: s.name, mint: s.mint, stockSym: s.symbol, maxLev: 1 }));
    const seen = new Set(stocks.map((m) => m.mint));
    const memes: Market[] = [];
    for (const t of [...t1, ...t24]) {
      if (seen.has(t.id)) continue;
      if (isXStock(t)) { stocks.push(stockFrom(t)); seen.add(t.id); } else if (isPump(t) && t.usdPrice && clean(t)) { memes.push(memeFrom(t)); seen.add(t.id); }
    }
    const crypto: Market[] = CRYPTO.map((c) => ({ ...tokenFacts(byId.get(c.mint)), id: c.mint, kind: 'crypto', symbol: c.symbol, name: c.name, mint: c.mint, art: c.art, maxLev: 1 }));
    const perps: Market[] = [...PERPS.map((m) => ({ ...tokenFacts(byId.get(m.mint)), ...m })), ...books];
    // the list's own prices (real, up to a minute old) fill a row until the live price arrives; they are stamped
    // older than FRESH_MS so no trade can open or close on them
    const listedAt = Date.now() - FRESH_MS - 1;
    for (const m of [...stocks, ...crypto, ...memes]) if (m.price && !PX.has(m.mint)) PX.set(m.mint, { usdPrice: m.price, change24h: m.change24h, t: listedAt });
    return { stocks, crypto, perps, memes, at: Date.now(), venueErrors };
  })();
  catCache = { at: Date.now(), p };
  p.catch(() => { if (catCache?.p === p) catCache = null; });
  return p;
}

export const findIn = (c: Catalog, id: string) => [...c.perps, ...c.stocks, ...c.crypto, ...c.memes].find((m) => m.id === id);

/** A market by route id: from the catalog, or any Solana token by mint (a pump.fun launch that left the trending list). */
export async function resolveMarket(id: string): Promise<Market | null> {
  const vm = /^(phoenix|pacifica)-(.+)$/.exec(id);
  if (vm) {
    const c = await loadCatalog();
    const hit = findIn(c, id);
    if (hit) return hit;
    const err = c.venueErrors[vm[1] as BookVenue];
    if (err) throw new Error(`${err} ${VENUES[vm[1] as BookVenue].name}'s markets couldn't load.`);
    return null;
  }
  const perp = PERPS.find((m) => m.id === id.toUpperCase());
  if (perp) {
    const c = await loadCatalog().catch(() => null);
    return (c && findIn(c, perp.id)) ?? perp;
  }
  const c = await loadCatalog();
  const hit = findIn(c, id);
  if (hit) return hit;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) return null;
  const found = await getJson<JupToken[]>(`${JUP}/tokens/v2/search?query=${id}`, 'Jupiter tokens');
  const t = found.find((x) => x.id === id);
  if (!t) return null;
  return isXStock(t) ? stockFrom(t) : isPump(t) ? memeFrom(t) : spotFrom(t);
}

export function useCatalog() {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [error, setError] = useState<string>();
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(undefined);
    loadCatalog(n > 0).then((c) => alive && setCat(c)).catch((e) => alive && setError(`${(e as Error).message} Markets couldn't load.`));
    const h = setInterval(() => { loadCatalog().then((c) => alive && setCat(c)).catch(() => {}); }, 90_000);
    return () => { alive = false; clearInterval(h); };
  }, [n]);
  return { cat, error, reload: () => setN((x) => x + 1) };
}

/* ---------- live prices ---------- */
/** usdPrice: Jupiter's price, or an order-book venue's mark price (what the venue itself uses for P&L and liquidation). */
export type Px = { usdPrice: number; change24h?: number; liquidity?: number; t: number; bid?: number; ask?: number; fundingPctHr?: number };
/** Last price seen for each mint, shared by every practice screen, so a page opens on the price the list just showed. */
const PX = new Map<string, Px>();
/** A trade only opens or closes on a price at most this old. */
export const FRESH_MS = 20_000;
export const isFresh = (p?: Px) => !!p && Date.now() - p.t < FRESH_MS;
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Polls Jupiter Price v3 for these mints every few seconds while the screen is open. On a 429 or a network error it
 *  backs off (doubling, up to a minute) and says so; it never fills in a price it didn't receive. */
export function usePrices(mints: string[], ms = 8000) {
  const key = useMemo(() => [...new Set(mints.filter(Boolean))].sort().join(','), [mints]);
  const snap = () => Object.fromEntries(key ? key.split(',').flatMap((m) => (PX.has(m) ? [[m, PX.get(m)!]] : [])) : []) as Record<string, Px>;
  const [prices, setPrices] = useState<Record<string, Px>>(snap);
  const [error, setError] = useState<string>();
  const [at, setAt] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!key) return;
    setPrices(snap());
    let alive = true;
    let delay = ms;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const all = key.split(',');
    const ids = all.filter((k) => !keyVenue(k));
    const wantPhx = all.some((k) => keyVenue(k) === 'phoenix'), wantPac = all.some((k) => keyVenue(k) === 'pacifica');
    const wantJup = ids.length > 0;
    const run = async () => {
      // each source settles on its own: one venue being down never blanks another's prices
      const fail = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));
      const [res, phx, pac] = await Promise.all([
        wantJup ? Promise.all(chunks(ids, 50).map((c) =>
          getJson<Record<string, { usdPrice?: number; priceChange24h?: number; liquidity?: number } | null>>(`${JUP}/price/v3?ids=${c.join(',')}`, 'Jupiter prices'))).catch(fail) : [],
        wantPhx ? phoenixQuotes().catch(fail) : null,
        wantPac ? pacificaQuotes().catch(fail) : null,
      ]);
      if (!alive) return;
      const t = Date.now();
      const next: Record<string, Px> = {};
      const errs: Error[] = [];
      for (const [v, q] of [['phoenix', phx], ['pacifica', pac]] as const) {
        if (q instanceof Error) { errs.push(q); continue; }
        for (const [sym, x] of Object.entries(q ?? {})) {
          const k = venueKey(v, sym);
          if (!all.includes(k)) continue;
          next[k] = { usdPrice: x.mark, change24h: x.change24h, bid: x.bid, ask: x.ask, fundingPctHr: x.fundingPctHr, t };
          PX.set(k, next[k]);
        }
      }
      if (res instanceof Error) errs.push(res);
      else for (const r of res) for (const [m, v] of Object.entries(r ?? {})) {
        if (v && typeof v.usdPrice === 'number' && Number.isFinite(v.usdPrice) && v.usdPrice > 0) {
          next[m] = { usdPrice: v.usdPrice, change24h: v.priceChange24h, liquidity: v.liquidity, t };
          PX.set(m, next[m]);
        }
      }
      if (Object.keys(next).length) { setPrices((p) => ({ ...p, ...next })); setAt(t); }
      if (!errs.length) { setError(undefined); delay = ms; } else {
        // back off only when nothing answered; a partial answer keeps the working sources on their normal pace
        delay = Object.keys(next).length ? ms : Math.min(60_000, Math.max(ms * 2, delay * 2));
        const s = Math.round(delay / 1000);
        const e = errs[0] as Error & { status?: number };
        setError(e.status === 429
          ? `${e.message.replace(/ is rate limiting reads\.$/, '')} is rate limiting price reads. Trying again in ${s}s.`
          : `${e.message} Trying again in ${s}s.`);
      }
      if (alive) timer = setTimeout(run, delay);
    };
    run();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [key, ms, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { prices, error, at, reload: () => setN((x) => x + 1) };
}

/* ---------- Jupiter Perps pool info ---------- */
export type PoolInfo = {
  longBorrowPctHr: number; shortBorrowPctHr: number; longUtilPct: number; shortUtilPct: number;
  longLiquidity: number; shortLiquidity: number; openFeePct: number; maxPriceImpactFeePct: number; t: number;
};
const POOL = new Map<string, PoolInfo>();
export async function readPoolInfo(mint: string): Promise<PoolInfo> {
  const r = await getJson<Record<string, string>>(`${PERPS_API}/pool-info?mint=${mint}`, 'Jupiter Perps');
  const num = (k: string) => {
    const v = Number(r?.[k]);
    if (!Number.isFinite(v)) throw new ApiError(`Jupiter Perps didn't send ${k}.`);
    return v;
  };
  const info: PoolInfo = {
    longBorrowPctHr: num('longBorrowRatePercent'), shortBorrowPctHr: num('shortBorrowRatePercent'),
    longUtilPct: num('longUtilizationPercent'), shortUtilPct: num('shortUtilizationPercent'),
    longLiquidity: num('longAvailableLiquidity'), shortLiquidity: num('shortAvailableLiquidity'),
    openFeePct: num('openFeePercent'), maxPriceImpactFeePct: Number(r?.maxPriceImpactFeePercent) || 0, t: Date.now(),
  };
  POOL.set(mint, info);
  return info;
}
/** Live pool numbers for one perp (borrow rates, utilization, open fee, liquidity), refreshed every 30 s. */
export function usePoolInfo(mint?: string, ms = 30_000) {
  const [info, setInfo] = useState<PoolInfo | undefined>(mint ? POOL.get(mint) : undefined);
  const [error, setError] = useState<string>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!mint) return;
    let alive = true;
    const run = () => readPoolInfo(mint).then((i) => { if (alive) { setInfo(i); setError(undefined); } })
      .catch((e) => alive && setError(`${(e as Error).message} Fees and borrow rates couldn't load.`));
    run();
    const h = setInterval(run, ms);
    return () => { alive = false; clearInterval(h); };
  }, [mint, ms, n]);
  return { info, error, reload: () => setN((x) => x + 1) };
}

/* ---------- the paper book ---------- */
export const START = 10_000;
export type Side = 'long' | 'short';
export type Position = {
  id: string; marketId: string; kind: Kind; symbol: string; name: string; mint: string;
  icon?: string; stockSym?: string; art?: Market['art'];
  side: Side; lev: number; margin: number; entry: number; openedAt: number;
  /** Paid up front out of the paper balance (Jupiter: its open fee; order books: the taker or maker fee) on the notional. */
  openFee: number;
  /** Percent of the notional per hour while open, when the trade opened. Jupiter: its borrow rate (always paid).
   *  Order books: the funding rate for this side (negative: this side is paid funding). Perps only. */
  borrowPctHr: number;
  /** Order-book perps: where it trades, and the taker fee % that closing at the market will cost. */
  venue?: Venue;
  closeFeePct?: number;
};
export type Closed = Position & {
  exit: number; closedAt: number; borrow: number; closeFee?: number;
  /** Net of every fee, borrow and funding. */ pnl: number; reason: 'closed' | 'liquidated';
};
/** A resting paper limit order on an order-book perp (post-only: it waits on the book and fills as a maker). Its margin
 *  and maker fee are set aside from the paper balance until it fills or is cancelled. */
export type Order = {
  id: string; marketId: string; venue: BookVenue; symbol: string; name: string; mint: string;
  icon?: string; stockSym?: string; art?: Market['art'];
  side: Side; lev: number; margin: number; limit: number; fee: number; takerPct: number; fundingPctHr: number; createdAt: number;
};
export type Book = { v: 1; balance: number; open: Position[]; closed: Closed[]; startedAt: number; orders?: Order[] };

const fresh = (): Book => ({ v: 1, balance: START, open: [], closed: [], startedAt: Date.now() });
export const notional = (p: Pick<Position, 'margin' | 'lev'>) => p.margin * p.lev;
/** The price move on the notional: size × leverage × move. */
export const movePnl = (p: Pick<Position, 'margin' | 'lev' | 'side' | 'entry'>, price: number) =>
  notional(p) * (p.side === 'long' ? price / p.entry - 1 : 1 - price / p.entry);
/** Borrow or funding so far: the hourly rate on the notional, by the hour (an approximation: the real rate moves). */
export const borrowCost = (p: Pick<Position, 'kind' | 'margin' | 'lev' | 'borrowPctHr' | 'openedAt'>, now = Date.now()) =>
  p.kind === 'perp' ? notional(p) * (p.borrowPctHr / 100) * (Math.max(0, now - p.openedAt) / 3_600_000) : 0;
/** Order books: the taker fee on the position's value at this price, paid when it closes at the market. */
export const closeFeeAt = (p: Pick<Position, 'margin' | 'lev' | 'entry' | 'closeFeePct'>, price: number) =>
  p.closeFeePct ? (notional(p) * (price / p.entry) * p.closeFeePct) / 100 : 0;
/** What closing now would hand back: margin + move − borrow or funding − the closing fee (never below zero). */
export const equityOf = (p: Position, price: number, now = Date.now()) => Math.max(0, p.margin + movePnl(p, price) - borrowCost(p, now) - closeFeeAt(p, price));
/** Live profit, net of the open fee and borrow: exactly what closing now would add to the record. */
export const pnlOf = (p: Position, price: number, now = Date.now()) => equityOf(p, price, now) - p.margin - p.openFee;
/** Where the loss eats the whole margin. Spot (1x long) can't be liquidated, so null. */
export function liqPrice(p: Pick<Position, 'kind' | 'side' | 'lev' | 'margin' | 'entry' | 'borrowPctHr' | 'openedAt'>, now = Date.now()) {
  if (p.kind !== 'perp' || p.lev <= 1) return null;
  const n = notional(p);
  const left = p.margin - borrowCost(p, now);
  return p.side === 'long' ? Math.max(0, p.entry * (1 - left / n)) : p.entry * (1 + left / n);
}
export const isLiquidated = (p: Position, price: number, now = Date.now()) => p.kind === 'perp' && p.margin + movePnl(p, price) - borrowCost(p, now) <= 0;

const validBook = (b: unknown): b is Book => {
  const x = b as Book;
  return !!x && x.v === 1 && typeof x.balance === 'number' && Array.isArray(x.open) && Array.isArray(x.closed);
};
const books = new Map<string, Book>();
const subs = new Set<() => void>();
let queue: Promise<unknown> = Promise.resolve();
const storeKey = (owner: string) => `clashy:practice:v1:${owner}`;

async function loadBook(k: string): Promise<Book> {
  const have = books.get(k);
  if (have) return have;
  let b = fresh();
  try {
    const raw = await AsyncStorage.getItem(k);
    if (raw) { const parsed = JSON.parse(raw); if (validBook(parsed)) b = parsed; }
  } catch { /* unreadable storage: start a fresh book */ }
  books.set(k, books.get(k) ?? b);
  return books.get(k)!;
}
/** Every change goes through one queue, so a liquidation and a tap on Close can't both settle the same trade. */
function mutate(k: string, fn: (b: Book) => Book): Promise<Book> {
  const run = queue.then(async () => {
    const next = fn(await loadBook(k));
    books.set(k, next);
    subs.forEach((f) => f());
    try { await AsyncStorage.setItem(k, JSON.stringify(next)); } catch { throw new Error("Saved for now, but this device wouldn't store it. It will be gone when the app closes."); }
    return next;
  });
  queue = run.catch(() => {});
  return run;
}
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type OpenArgs = {
  side: Side; lev: number; margin: number; price: Px; openFeePct: number; borrowPctHr: number;
  /** Order-book perps: the average price this size fills at, walking the live book. */
  fillPrice?: number;
};
export type PlaceArgs = { side: Side; lev: number; margin: number; limit: number; fundingPctHr: number; bestBid?: number; bestAsk?: number };

/** The player's paper book: per wallet when signed in, per device otherwise. */
export function usePractice() {
  const w = useWallet();
  const owner = w.signer?.publicKey?.toBase58();
  const k = w.status === 'loading' ? null : storeKey(owner ?? 'device');
  const [book, setBook] = useState<Book | null>(k ? books.get(k) ?? null : null);
  useEffect(() => {
    if (!k) return;
    let alive = true;
    const sync = () => { const b = books.get(k); if (alive && b) setBook(b); };
    subs.add(sync);
    setBook(books.get(k) ?? null);
    loadBook(k).then((b) => alive && setBook(b));
    return () => { alive = false; subs.delete(sync); };
  }, [k]);

  const open = useCallback((m: Market, a: OpenArgs) => {
    if (!k) return Promise.reject(new Error('Still loading your paper balance'));
    return mutate(k, (b) => {
      if (!isFresh(a.price)) throw new Error('Waiting for a fresh live price. Try again in a few seconds.');
      if (a.side === 'short' && m.kind !== 'perp') throw new Error('Only perps can go short');
      const book = isBookVenue(m.venue);
      if (book && !(a.fillPrice && a.fillPrice > 0)) throw new Error(`Waiting for ${VENUES[m.venue!].name}'s live order book.`);
      const lev = m.kind === 'perp' ? Math.min(m.maxLev, Math.max(1, Math.round(a.lev))) : 1;
      const margin = round2(a.margin);
      if (!(margin >= 1)) throw new Error('At least $1');
      if (book && m.minUsd && margin * lev < m.minUsd) throw new Error(`${VENUES[m.venue!].name}'s smallest order is $${m.minUsd} of position size`);
      const openFee = m.kind === 'perp' ? round2(((margin * lev) * a.openFeePct) / 100) : 0;
      if (margin + openFee > b.balance + 1e-9) throw new Error(`You have $${b.balance.toFixed(2)} of paper cash`);
      const p: Position = {
        id: newId(), marketId: m.id, kind: m.kind, symbol: m.symbol, name: m.name, mint: m.mint, icon: m.icon, stockSym: m.stockSym, art: m.art,
        side: a.side, lev, margin, entry: book ? a.fillPrice! : a.price.usdPrice, openedAt: Date.now(), openFee, borrowPctHr: m.kind === 'perp' ? a.borrowPctHr : 0,
        ...(book ? { venue: m.venue, closeFeePct: m.takerPct } : {}),
      };
      return { ...b, balance: round2(b.balance - margin - openFee), open: [p, ...b.open] };
    }).then((b) => b.open[0]);
  }, [k]);

  /** Close at the live price (Jupiter), or at `fillPrice`: the average the size fills at on the order book. A
   *  liquidation settles at the mark price and hands nothing back. */
  const close = useCallback((id: string, price: Px, reason: Closed['reason'] = 'closed', fillPrice?: number) => {
    if (!k) return Promise.reject(new Error('Still loading your paper balance'));
    let done: Closed | undefined;
    return mutate(k, (b) => {
      const p = b.open.find((x) => x.id === id);
      if (!p) throw new Error('This trade was already closed');
      if (!isFresh(price)) throw new Error('Waiting for a fresh live price. Try again in a few seconds.');
      const book = isBookVenue(p.venue);
      if (book && reason === 'closed' && !(fillPrice && fillPrice > 0)) throw new Error(`Waiting for ${VENUES[p.venue!].name}'s live order book.`);
      const now = Date.now();
      const exit = book && reason === 'closed' ? fillPrice! : price.usdPrice;
      const back = reason === 'liquidated' ? 0 : equityOf(p, exit, now);
      const closeFee = book && reason === 'closed' ? closeFeeAt(p, exit) : 0;
      done = { ...p, exit, closedAt: now, borrow: borrowCost(p, now), closeFee, pnl: back - p.margin - p.openFee, reason };
      return { ...b, balance: round2(b.balance + back), open: b.open.filter((x) => x.id !== id), closed: [done, ...b.closed].slice(0, 200) };
    }).then(() => done!);
  }, [k]);

  /** Rest a post-only limit order on an order-book perp: margin and maker fee are set aside now. */
  const place = useCallback((m: Market, a: PlaceArgs) => {
    if (!k) return Promise.reject(new Error('Still loading your paper balance'));
    return mutate(k, (b) => {
      if (!isBookVenue(m.venue) || m.takerPct === undefined || m.makerPct === undefined) throw new Error('Limit orders are for order-book markets');
      const venue = VENUES[m.venue].name;
      if (!(a.limit > 0)) throw new Error('Set a limit price');
      if (a.side === 'long' && a.bestAsk !== undefined && a.limit >= a.bestAsk) throw new Error(`That would fill right away: the best ask is ${fmtPrice(a.bestAsk)}. Use Market, or set a price below it.`);
      if (a.side === 'short' && a.bestBid !== undefined && a.limit <= a.bestBid) throw new Error(`That would fill right away: the best bid is ${fmtPrice(a.bestBid)}. Use Market, or set a price above it.`);
      if (a.bestAsk === undefined || a.bestBid === undefined) throw new Error(`Waiting for ${venue}'s live order book.`);
      const lev = Math.min(m.maxLev, Math.max(1, Math.round(a.lev)));
      const margin = round2(a.margin);
      if (!(margin >= 1)) throw new Error('At least $1');
      if (m.minUsd && margin * lev < m.minUsd) throw new Error(`${venue}'s smallest order is $${m.minUsd} of position size`);
      const fee = round2((margin * lev * m.makerPct) / 100);
      if (margin + fee > b.balance + 1e-9) throw new Error(`You have $${b.balance.toFixed(2)} of paper cash`);
      const o: Order = {
        id: newId(), marketId: m.id, venue: m.venue, symbol: m.symbol, name: m.name, mint: m.mint, icon: m.icon, stockSym: m.stockSym, art: m.art,
        side: a.side, lev, margin, limit: a.limit, fee, takerPct: m.takerPct, fundingPctHr: a.side === 'long' ? a.fundingPctHr : -a.fundingPctHr, createdAt: Date.now(),
      };
      return { ...b, balance: round2(b.balance - margin - fee), orders: [o, ...(b.orders ?? [])] };
    }).then((b) => b.orders![0]);
  }, [k]);

  const cancel = useCallback((id: string) => {
    if (!k) return Promise.reject(new Error('Still loading your paper balance'));
    return mutate(k, (b) => {
      const o = (b.orders ?? []).find((x) => x.id === id);
      if (!o) throw new Error('This order already filled or was cancelled');
      return { ...b, balance: round2(b.balance + o.margin + o.fee), orders: (b.orders ?? []).filter((x) => x.id !== id) };
    });
  }, [k]);

  /** The book traded through a resting order: it becomes a position at its limit price (a maker fill). */
  const fillOrder = useCallback((id: string) => {
    if (!k) return Promise.reject(new Error('Still loading your paper balance'));
    let made: Position | undefined;
    return mutate(k, (b) => {
      const o = (b.orders ?? []).find((x) => x.id === id);
      if (!o) return b;
      made = {
        id: newId(), marketId: o.marketId, kind: 'perp', symbol: o.symbol, name: o.name, mint: o.mint, icon: o.icon, stockSym: o.stockSym, art: o.art,
        side: o.side, lev: o.lev, margin: o.margin, entry: o.limit, openedAt: Date.now(), openFee: o.fee, borrowPctHr: o.fundingPctHr,
        venue: o.venue, closeFeePct: o.takerPct,
      };
      return { ...b, open: [made, ...b.open], orders: (b.orders ?? []).filter((x) => x.id !== id) };
    }).then(() => made);
  }, [k]);

  const reset = useCallback(() => (k ? mutate(k, () => fresh()) : Promise.reject(new Error('Still loading your paper balance'))), [k]);

  return { book, ready: !!book, signedIn: !!owner, open, close, place, cancel, fillOrder, reset };
}
export type Practice = ReturnType<typeof usePractice>;

/** While a practice screen is open: settle any trade whose live price has eaten its whole margin as "Liquidated".
 *  Only fresh prices count; nothing runs while the app is closed. Returns the last liquidation, for a notice. */
export function useLiquidations(pr: Practice, prices: Record<string, Px>) {
  const busy = useRef(new Set<string>());
  const [last, setLast] = useState<Closed | null>(null);
  useEffect(() => {
    if (!pr.book) return;
    for (const p of pr.book.open) {
      const px = prices[p.mint];
      if (!px || !isFresh(px) || busy.current.has(p.id) || !isLiquidated(p, px.usdPrice)) continue;
      busy.current.add(p.id);
      pr.close(p.id, px, 'liquidated').then(setLast).catch(() => {}).finally(() => busy.current.delete(p.id));
    }
  }, [pr.book, prices]); // eslint-disable-line react-hooks/exhaustive-deps
  return { last, dismiss: () => setLast(null) };
}

export type Quote = { bid?: number; ask?: number; t: number };
/** While Practice is open: a resting limit order fills when the live book trades through its price (the best ask at or
 *  below a buy, the best bid at or above a sell). `live` passes the best bid and ask of a book already streaming on
 *  screen; any other market with a resting order is read from a fresh book snapshot every 3 s. Nothing runs while the
 *  app is closed. Returns the last fill, for a notice. */
export function useOrderFills(pr: Practice, live?: Record<string, Quote>) {
  const busy = useRef(new Set<string>());
  const [last, setLast] = useState<Position | null>(null);
  const [snap, setSnap] = useState<Record<string, Quote>>({});
  const orders = pr.book?.orders ?? [];
  const need = [...new Set(orders.filter((o) => !live?.[o.mint]).map((o) => `${o.venue}|${o.mint}`))].sort().join(',');
  useEffect(() => {
    if (!need) return;
    let alive = true;
    const run = () => {
      for (const x of need.split(',')) {
        const [venue, mint] = x.split('|') as [BookVenue, string];
        readBook(venue, mint.slice(4)).then((b) => {
          if (alive && b.bids[0] && b.asks[0]) setSnap((s) => ({ ...s, [mint]: { bid: b.bids[0][0], ask: b.asks[0][0], t: b.t } }));
        }).catch(() => {});
      }
    };
    run();
    const h = setInterval(run, 3000);
    return () => { alive = false; clearInterval(h); };
  }, [need]);
  useEffect(() => {
    for (const o of orders) {
      const q = live?.[o.mint] ?? snap[o.mint];
      if (!q || Date.now() - q.t > 6000 || busy.current.has(o.id)) continue;
      const hit = o.side === 'long' ? q.ask !== undefined && q.ask <= o.limit : q.bid !== undefined && q.bid >= o.limit;
      if (!hit) continue;
      busy.current.add(o.id);
      pr.fillOrder(o.id).then((p) => p && setLast(p)).catch(() => {}).finally(() => busy.current.delete(o.id));
    }
  }, [pr.book, live, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  return { last, dismiss: () => setLast(null) };
}

/** Account value (cash + what every open trade would hand back now), all-time and closed-today P&L, win rate. */
export function summary(b: Book, prices: Record<string, Px>, now = Date.now()) {
  let inTrades = 0;
  let priced = true;
  let openPnl = 0;
  for (const p of b.open) {
    const px = prices[p.mint];
    if (!px) { priced = false; inTrades += p.margin; continue; }
    inTrades += equityOf(p, px.usdPrice, now);
    openPnl += pnlOf(p, px.usdPrice, now);
  }
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const today = b.closed.filter((c) => c.closedAt >= midnight.getTime()).reduce((a, c) => a + c.pnl, 0);
  const realized = b.closed.reduce((a, c) => a + c.pnl, 0);
  const wins = b.closed.filter((c) => c.pnl > 0).length;
  const reserved = (b.orders ?? []).reduce((a, o) => a + o.margin + o.fee, 0);
  inTrades += reserved;
  const value = b.balance + inTrades;
  return { value, inTrades, priced, openPnl, allTime: value - START, today, realized, wins, trades: b.closed.length, winRate: b.closed.length ? (wins / b.closed.length) * 100 : null };
}

/* ---------- formatting ---------- */
/** "$73.27", "$64,384.48", "$0.006073": enough digits that a memecoin's price isn't "$0.00". */
export function fmtPrice(n?: number) {
  if (n === undefined || !Number.isFinite(n)) return '–';
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n <= 0) return '$0';
  const d = Math.min(12, Math.max(2, Math.ceil(-Math.log10(n)) + 3));
  return `$${n.toFixed(d)}`;
}
export const signedUsd = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 2)}%`;
export function ago(t?: string | number) {
  if (t === undefined) return '–';
  const ms = Date.now() - (typeof t === 'number' ? t : Date.parse(t));
  if (!Number.isFinite(ms)) return '–';
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`;
}
export const kindLabel: Record<Kind, string> = { stock: 'Tokenized stock', crypto: 'Crypto', perp: 'Perpetual', meme: 'pump.fun' };
export { VENUES, isBookVenue, type BookVenue, type Venue } from './venues';
