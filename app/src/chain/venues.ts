// Order-book perps venues on Solana: Phoenix (Ellipsis Labs; a fully on-chain central limit order book) and Pacifica
// (an order book matched off chain and settled on Solana). Practice reads their real, public market data: the market
// list, fees and leverage caps, mark prices, funding, candles, recent trades, and the live L2 order book over each
// venue's own WebSocket. Paper orders fill against that real book, level by level, so the price you get and the
// slippage you pay are what that size would really cost there right now. Nothing here signs or sends anything.
//
// REST reads go through the Clashy relay's shared cache (chain/scripts/sponsor.ts /mkt/…); the order-book streams
// connect straight to the venue. If a stream can't connect, the book falls back to a relay snapshot every 2 s and says
// so. A venue that can't be reached shows its error; it is never filled in.
import { useEffect, useRef, useState } from 'react';
import type { L2, Level } from './book-math';
import { NET } from './client';

export type { L2, Level } from './book-math';

export type Venue = 'jupiter' | 'phoenix' | 'pacifica';
export type BookVenue = Exclude<Venue, 'jupiter'>;
export const VENUES: Record<Venue, { name: string; how: string; site: string }> = {
  jupiter: { name: 'Jupiter Perps', how: 'Pool · oracle price', site: 'jup.ag/perps' },
  phoenix: { name: 'Phoenix', how: 'On-chain order book', site: 'phoenix.trade' },
  pacifica: { name: 'Pacifica', how: 'Order book · Solana settled', site: 'pacifica.fi' },
};
export const isBookVenue = (v?: Venue): v is BookVenue => v === 'phoenix' || v === 'pacifica';

const MKT = `${NET.sponsor}/mkt`;
const WS: Record<BookVenue, string> = { phoenix: 'wss://perp-api.phoenix.trade/v1/ws', pacifica: 'wss://ws.pacifica.fi/ws' };

export class VenueError extends Error {
  status?: number;
  constructor(msg: string, status?: number) { super(msg); this.status = status; }
}
async function get<T>(path: string, what: string): Promise<T> {
  let r: Response;
  try { r = await fetch(`${MKT}${path}`, { headers: { accept: 'application/json' } }); } catch { throw new VenueError(`Can't reach ${what}. Check your connection.`); }
  if (r.status === 429) throw new VenueError(`${what} is rate limiting reads.`, 429);
  if (!r.ok) throw new VenueError(`${what} answered ${r.status}.`, r.status);
  try { return (await r.json()) as T; } catch { throw new VenueError(`${what} sent an answer we couldn't read.`); }
}
const num = (v: unknown) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : undefined; };
/** A read through the relay's market cache, for modules that need an endpoint this file doesn't wrap (the games' mark candles). */
export const mktGet = <T,>(path: string, what: string) => get<T>(path, what);

/* ---------- markets ---------- */
export type VenueMarket = {
  venue: BookVenue;
  /** The venue's own symbol: SOL, NVDA, kBONK, EURUSD. */
  sym: string;
  name: string;
  icon?: string;
  /** Phoenix's asset class: crypto, equity, commodity, fx, etf… (Pacifica doesn't say; it borrows Phoenix's for the same symbol). */
  assetClass?: string;
  maxLev: number;
  /** Percent of the notional. */
  takerPct: number;
  makerPct: number;
  /** Pacifica's minimum order, in USD. */
  minUsd?: number;
};

type PhxMarket = {
  symbol: string; marketStatus?: string; takerFee?: number; makerFee?: number; leverageTiers?: { maxLeverage?: number }[];
  metadata?: { name?: string; logoUri?: string; assetClass?: string };
};
type PacMarket = { symbol: string; max_leverage?: number; min_order_size?: string; instrument_type?: string };
type PacFee = { level: number; maker_fee_rate: string; taker_fee_rate: string };

export async function loadPhoenix(): Promise<VenueMarket[]> {
  const ms = await get<PhxMarket[]>('/phoenix/exchange/markets', 'Phoenix');
  if (!Array.isArray(ms)) throw new VenueError("Phoenix sent a market list we couldn't read.");
  return ms.flatMap((m): VenueMarket[] => {
    const maxLev = num(m.leverageTiers?.[0]?.maxLeverage);
    const taker = num(m.takerFee), maker = num(m.makerFee);
    if (m.marketStatus !== 'active' || !maxLev || taker === undefined || maker === undefined) return [];
    return [{ venue: 'phoenix', sym: m.symbol, name: m.metadata?.name ?? m.symbol, icon: m.metadata?.logoUri, assetClass: m.metadata?.assetClass ?? undefined, maxLev, takerPct: taker * 100, makerPct: maker * 100 }];
  });
}
/** Pacifica's markets at its base fee tier (level 0: what a new account pays). */
export async function loadPacifica(): Promise<VenueMarket[]> {
  const [info, fees] = await Promise.all([
    get<{ data?: PacMarket[] }>('/pacifica/api/v1/info', 'Pacifica'),
    get<{ data?: PacFee[] }>('/pacifica/api/v1/info/fees', 'Pacifica fees'),
  ]);
  const base = fees.data?.find((f) => f.level === 0);
  const taker = num(base?.taker_fee_rate), maker = num(base?.maker_fee_rate);
  if (taker === undefined || maker === undefined) throw new VenueError("Pacifica didn't send its fee schedule.");
  return (info.data ?? []).flatMap((m): VenueMarket[] => {
    const maxLev = num(m.max_leverage);
    if (m.instrument_type !== 'perpetual' || !maxLev) return [];
    return [{ venue: 'pacifica', sym: m.symbol, name: m.symbol, maxLev, takerPct: taker * 100, makerPct: maker * 100, minUsd: num(m.min_order_size) }];
  });
}

/* ---------- mark prices (for P&L and liquidation, like the venues themselves) ---------- */
export type VenueQuote = { mark: number; bid?: number; ask?: number; mid?: number; change24h?: number; fundingPctHr?: number; oi?: number; vol24h?: number };
export async function phoenixQuotes(): Promise<Record<string, VenueQuote>> {
  const r = await get<{ markets?: { symbol: string; best_bid?: number; best_ask?: number; mid?: number; mark_price?: number }[] }>('/phoenix/exchange/prices', 'Phoenix prices');
  const out: Record<string, VenueQuote> = {};
  for (const m of r.markets ?? []) {
    const mark = num(m.mark_price);
    if (mark && mark > 0) out[m.symbol] = { mark, bid: num(m.best_bid), ask: num(m.best_ask), mid: num(m.mid) };
  }
  return out;
}
export async function pacificaQuotes(): Promise<Record<string, VenueQuote>> {
  const r = await get<{ data?: { symbol: string; mark?: string; mid?: string; funding?: string; open_interest?: string; volume_24h?: string; yesterday_price?: string }[] }>('/pacifica/api/v1/info/prices', 'Pacifica prices');
  const out: Record<string, VenueQuote> = {};
  for (const m of r.data ?? []) {
    const mark = num(m.mark), y = num(m.yesterday_price), f = num(m.funding), oi = num(m.open_interest);
    if (!mark || mark <= 0) continue;
    out[m.symbol] = { mark, mid: num(m.mid), change24h: y ? (mark / y - 1) * 100 : undefined, fundingPctHr: f !== undefined ? f * 100 : undefined, oi: oi !== undefined ? oi * mark : undefined, vol24h: num(m.volume_24h) };
  }
  return out;
}

/** The hourly funding rate now, in percent (positive: longs pay shorts). Phoenix: its latest hourly rate. Pacifica: in its prices. */
export async function fundingNow(venue: BookVenue, sym: string): Promise<number> {
  if (venue === 'phoenix') {
    const r = await get<{ rates?: { timestamp: number; fundingRatePercentage: string }[] }>(`/phoenix/v1/funding/${encodeURIComponent(sym)}/rates?limit=1`, 'Phoenix funding');
    const last = r.rates?.at(-1);
    const v = num(last?.fundingRatePercentage);
    if (v === undefined) throw new VenueError("Phoenix didn't send a funding rate.");
    return v;
  }
  const q = (await pacificaQuotes())[sym];
  if (q?.fundingPctHr === undefined) throw new VenueError("Pacifica didn't send a funding rate.");
  return q.fundingPctHr;
}

/* ---------- candles ---------- */
export type Candle = { t: number; o: number; h: number; l: number; c: number; v?: number };
export type Timeframe = '1m' | '5m' | '1h' | '1d';
export const TF_MS: Record<Timeframe, number> = { '1m': 60_000, '5m': 300_000, '1h': 3_600_000, '1d': 86_400_000 };
export async function loadCandles(venue: BookVenue, sym: string, tf: Timeframe, n = 72): Promise<Candle[]> {
  if (venue === 'phoenix') {
    const r = await get<{ time: number; open: number; high: number; low: number; close: number; volumeQuote?: number }[]>(`/phoenix/v1/candles/${encodeURIComponent(sym)}?timeframe=${tf}&limit=${n}`, 'Phoenix candles');
    return (Array.isArray(r) ? r : []).map((k) => ({ t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volumeQuote })).filter((k) => [k.o, k.h, k.l, k.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  }
  // start on the minute so the relay's cache key repeats between polls
  const start = Math.floor((Date.now() - n * TF_MS[tf]) / 60_000) * 60_000;
  const r = await get<{ data?: { t: number; o: string; h: string; l: string; c: string; v?: string }[] }>(`/pacifica/api/v1/kline?symbol=${encodeURIComponent(sym)}&interval=${tf}&start_time=${start}`, 'Pacifica candles');
  return (r.data ?? []).map((k) => ({ t: k.t, o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c), v: num(k.v) !== undefined ? Number(k.v) * Number(k.c) : undefined }))
    .filter((k) => [k.o, k.h, k.l, k.c].every(Number.isFinite)).sort((a, b) => a.t - b.t).slice(-n);
}
export function useCandles(venue: BookVenue | undefined, sym: string | undefined, tf: Timeframe) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [error, setError] = useState<string>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!venue || !sym) return;
    let alive = true;
    setCandles(null); setError(undefined);
    const run = () => loadCandles(venue, sym, tf).then((c) => { if (alive) { setCandles(c); setError(undefined); } })
      .catch((e) => alive && setError(`${(e as Error).message} The chart couldn't load.`));
    run();
    const h = setInterval(run, tf === '1m' ? 15_000 : 60_000);
    return () => { alive = false; clearInterval(h); };
  }, [venue, sym, tf, n]);
  return { candles, error, reload: () => setN((x) => x + 1) };
}

/* ---------- the live order book and trades ---------- */
export type Print = { id: string; t: number; side: 'buy' | 'sell'; price: number; size: number };
export type MarketStats = { mark?: number; prevDay?: number; vol24h?: number; oi?: number; fundingPctHr?: number };
export type BookFeed = {
  book: L2 | null; trades: Print[]; stats: MarketStats;
  /** stream: the venue's WebSocket; snapshot: relay snapshots every 2 s (the stream couldn't connect). */
  mode: 'connecting' | 'stream' | 'snapshot';
  error?: string;
};
/** How old a book may be and still price a paper fill. */
export const BOOK_FRESH_MS = 6_000;
export const bookFresh = (b: L2 | null | undefined) => !!b && Date.now() - b.t < BOOK_FRESH_MS && b.bids.length > 0 && b.asks.length > 0;

const lv = (rows: unknown): Level[] => (Array.isArray(rows) ? rows : []).flatMap((r): Level[] => {
  const p = num(Array.isArray(r) ? r[0] : (r as { p?: unknown })?.p), a = num(Array.isArray(r) ? r[1] : (r as { a?: unknown })?.a);
  return p && a && p > 0 && a > 0 ? [[p, a]] : [];
});
const sortBook = (bids: Level[], asks: Level[], t = Date.now()): L2 => ({ bids: bids.sort((a, b) => b[0] - a[0]), asks: asks.sort((a, b) => a[0] - b[0]), t });

async function bookSnapshot(venue: BookVenue, sym: string): Promise<L2> {
  if (venue === 'phoenix') {
    const r = await get<{ bids?: unknown; asks?: unknown }>(`/phoenix/v1/view/orderbook/${encodeURIComponent(sym)}`, 'Phoenix order book');
    return sortBook(lv(r.bids), lv(r.asks));
  }
  const r = await get<{ data?: { l?: [unknown, unknown] } }>(`/pacifica/api/v1/book?symbol=${encodeURIComponent(sym)}`, 'Pacifica order book');
  return sortBook(lv(r.data?.l?.[0]), lv(r.data?.l?.[1]));
}
/** One fresh book read (for closing a trade from a list, where no stream is open). */
export const readBook = bookSnapshot;

async function recentTrades(venue: BookVenue, sym: string): Promise<Print[]> {
  if (venue === 'phoenix') {
    const r = await get<{ data?: { baseQty: string; price: string; timestamp: string; transactionSignature: string }[] }>(`/phoenix/v1/trades/${encodeURIComponent(sym)}/fills?limit=40`, 'Phoenix trades');
    return (r.data ?? []).flatMap((f, i): Print[] => {
      const q = num(f.baseQty), p = num(f.price), t = Date.parse(f.timestamp);
      return q && p ? [{ id: `${f.transactionSignature}:${i}`, t, side: q > 0 ? 'buy' : 'sell', price: p, size: Math.abs(q) }] : [];
    });
  }
  const r = await get<{ data?: { event_type: string; price: string; amount: string; side: string; created_at: number }[] }>(`/pacifica/api/v1/trades?symbol=${encodeURIComponent(sym)}`, 'Pacifica trades');
  return (r.data ?? []).filter((x) => x.event_type === 'fulfill_taker').flatMap((x, i): Print[] => {
    const p = num(x.price), a = num(x.amount);
    return p && a ? [{ id: `${x.created_at}:${i}:${x.price}:${x.amount}`, t: x.created_at, side: /long/.test(x.side) === /open/.test(x.side) ? 'buy' : 'sell', price: p, size: a }] : [];
  });
}
const mergeTrades = (a: Print[], b: Print[]) => {
  const seen = new Set<string>();
  return [...a, ...b].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).sort((x, y) => y.t - x.t).slice(0, 50);
};

/** The live L2 book, the trade tape and the venue's own market stats for one market, while the screen is open.
 *  Book updates are batched to four renders a second. */
export function useBookFeed(venue: BookVenue | undefined, sym: string | undefined): BookFeed {
  const [feed, setFeed] = useState<BookFeed>({ book: null, trades: [], stats: {}, mode: 'connecting' });
  const latest = useRef<L2 | null>(null);
  useEffect(() => {
    if (!venue || !sym) return;
    let alive = true;
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let backoff = 1000;
    let lastMsg = 0;
    latest.current = null;
    setFeed({ book: null, trades: [], stats: {}, mode: 'connecting' });
    const set = (f: (p: BookFeed) => BookFeed) => alive && setFeed(f);

    recentTrades(venue, sym).then((t) => set((p) => ({ ...p, trades: mergeTrades(p.trades, t) }))).catch(() => {});
    if (venue === 'phoenix') fundingNow('phoenix', sym).then((f) => set((p) => ({ ...p, stats: { ...p.stats, fundingPctHr: f } }))).catch(() => {});
    if (venue === 'pacifica') pacificaQuotes().then((q) => { const x = q[sym]; if (x) set((p) => ({ ...p, stats: { ...p.stats, mark: x.mark, vol24h: x.vol24h, oi: x.oi, fundingPctHr: x.fundingPctHr, prevDay: x.change24h !== undefined ? x.mark / (1 + x.change24h / 100) : undefined } })); }).catch(() => {});

    const snapshots = () => {
      if (poll) return;
      const run = () => bookSnapshot(venue, sym).then((b) => { latest.current = b; set((p) => ({ ...p, error: undefined })); })
        .catch((e) => set((p) => ({ ...p, error: `${(e as Error).message} The order book couldn't refresh.` })));
      run();
      poll = setInterval(run, 2000);
      set((p) => ({ ...p, mode: 'snapshot' }));
    };
    const connect = () => {
      if (!alive) return;
      try { ws = new WebSocket(WS[venue]); } catch { snapshots(); return; }
      const sock = ws;
      const send = (m: unknown) => { try { sock.send(JSON.stringify(m)); } catch { /* closed */ } };
      sock.onopen = () => {
        backoff = 1000;
        if (venue === 'phoenix') {
          for (const channel of ['orderbook', 'trades', 'market']) send({ type: 'subscribe', subscription: { channel, symbol: sym } });
        } else {
          send({ method: 'subscribe', params: { source: 'book', symbol: sym, agg_level: 1 } });
          send({ method: 'subscribe', params: { source: 'trades', symbol: sym } });
          ping = setInterval(() => send({ method: 'ping' }), 30_000);
        }
      };
      sock.onmessage = (e) => {
        let m: Record<string, unknown>;
        try { m = JSON.parse(String(e.data)); } catch { return; }
        lastMsg = Date.now();
        if (venue === 'phoenix') {
          if (m.symbol !== sym) return;
          if (m.channel === 'orderbook' && m.orderbook) {
            const ob = m.orderbook as { bids?: unknown; asks?: unknown };
            latest.current = sortBook(lv(ob.bids), lv(ob.asks));
            if (poll) { clearInterval(poll); poll = undefined; }
            set((p) => (p.mode === 'stream' ? p : { ...p, mode: 'stream', error: undefined }));
          } else if (m.channel === 'trades' && Array.isArray(m.trades)) {
            const t = (m.trades as { tradeSequenceNumber?: string; timestamp?: string; side?: string; baseAmount?: number; quoteAmount?: number }[]).flatMap((x): Print[] => {
              const b = num(x.baseAmount), q = num(x.quoteAmount);
              return b && q ? [{ id: `seq:${x.tradeSequenceNumber}`, t: (num(x.timestamp) ?? Date.now() / 1000) * 1000, side: x.side === 'bid' ? 'buy' : 'sell', price: Math.abs(q / b), size: Math.abs(b) }] : [];
            });
            if (t.length) set((p) => ({ ...p, trades: mergeTrades(t, p.trades) }));
          } else if (m.channel === 'market') {
            set((p) => ({ ...p, stats: { mark: num(m.markPx), prevDay: num(m.prevDayPx), vol24h: num(m.dayNtlVlm), oi: num(m.openInterest) !== undefined && num(m.markPx) ? num(m.openInterest)! * num(m.markPx)! : p.stats.oi, fundingPctHr: p.stats.fundingPctHr } }));
          }
        } else {
          const d = m.data as Record<string, unknown> | unknown[] | undefined;
          if (m.channel === 'book' && d && !Array.isArray(d) && d.s === sym) {
            const l = d.l as [unknown, unknown] | undefined;
            latest.current = sortBook(lv(l?.[0]), lv(l?.[1]));
            if (poll) { clearInterval(poll); poll = undefined; }
            set((p) => (p.mode === 'stream' ? p : { ...p, mode: 'stream', error: undefined }));
          } else if (m.channel === 'trades' && Array.isArray(d)) {
            const t = (d as { s?: string; h?: number; p?: string; a?: string; d?: string; t?: number; tc?: string }[]).filter((x) => x.s === sym || x.s === undefined).flatMap((x, i): Print[] => {
              const p = num(x.p), a = num(x.a);
              return p && a ? [{ id: `ws:${x.h ?? `${x.t}:${i}`}`, t: x.t ?? Date.now(), side: /long/.test(x.d ?? '') === /open/.test(x.d ?? '') ? 'buy' : 'sell', price: p, size: a }] : [];
            });
            if (t.length) set((p) => ({ ...p, trades: mergeTrades(t, p.trades) }));
          }
        }
      };
      sock.onerror = () => { try { sock.close(); } catch { /* already closed */ } };
      sock.onclose = () => {
        if (ping) { clearInterval(ping); ping = undefined; }
        if (!alive) return;
        snapshots();
        retry = setTimeout(connect, (backoff = Math.min(backoff * 2, 30_000)));
      };
    };
    connect();
    // no stream inside 5 s: snapshots until it connects
    const guard = setTimeout(() => { if (!latest.current) snapshots(); }, 5000);
    // a stream that has gone quiet for 15 s is treated as down
    const watch = setInterval(() => { if (lastMsg && Date.now() - lastMsg > 15_000 && !poll) snapshots(); }, 5000);
    const flush = setInterval(() => {
      const b = latest.current;
      if (!b) return;
      // a stream sends a book only when it changes: a quiet one is still current while the socket is alive
      const t = poll ? b.t : Math.max(b.t, lastMsg);
      set((p) => (p.book === b && p.book.t === t ? p : { ...p, book: { ...b, t } }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(guard); clearInterval(watch); clearInterval(flush);
      if (poll) clearInterval(poll);
      if (ping) clearInterval(ping);
      if (retry) clearTimeout(retry);
      if (ws) { ws.onclose = null; try { ws.close(); } catch { /* closed */ } }
    };
  }, [venue, sym]);
  return feed;
}

/* ---------- filling against the book: ./book-math.ts ---------- */
export { fillQty, fillUsd, mid, spreadBps, type Fill } from './book-math';
