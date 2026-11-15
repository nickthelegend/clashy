// Live market data. No mocks: every number here comes from a public API at runtime.
// Majors: Coinbase Exchange public REST (no key). Solana memecoins: DexScreener public API.
import { useEffect, useRef, useState } from 'react';

export type Market = {
  id: string; // 'SOL' | 'BTC' | 'ETH' or a Solana mint
  symbol: string;
  name: string;
  kind: 'major' | 'meme';
  price: number;
  change24h: number; // percent
  marketCap?: number;
  volume24h?: number;
  image?: string;
  createdAt?: number;
};

const CB = 'https://api.exchange.coinbase.com';
const DS = 'https://api.dexscreener.com';

// Real logos (CoinGecko's public asset CDN).
export const MAJORS: { id: string; product: string; name: string; image: string }[] = [
  { id: 'SOL', product: 'SOL-USD', name: 'Solana', image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
  { id: 'BTC', product: 'BTC-USD', name: 'Bitcoin', image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
  { id: 'ETH', product: 'ETH-USD', name: 'Ethereum', image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
];

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${new URL(url).host} answered HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function fetchMajor(id: string): Promise<Market> {
  const m = MAJORS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown market ${id}`);
  const s = await json<{ open: string; last: string; volume: string }>(`${CB}/products/${m.product}/stats`);
  const last = Number(s.last), open = Number(s.open);
  return { id, symbol: id, name: m.name, kind: 'major', image: m.image, price: last, change24h: ((last - open) / open) * 100, volume24h: Number(s.volume) * last };
}

/** 1-minute closes, oldest first. Coinbase returns [time, low, high, open, close, volume], newest first. */
export async function fetchCandles(id: string, granularity = 60): Promise<number[]> {
  const m = MAJORS.find((x) => x.id === id);
  if (!m) return [];
  const rows = await json<number[][]>(`${CB}/products/${m.product}/candles?granularity=${granularity}`);
  return rows.slice(0, 120).reverse().map((r) => r[4]);
}

type DsPair = {
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string; marketCap?: number; fdv?: number; pairCreatedAt?: number;
  priceChange?: { h24?: number }; volume?: { h24?: number }; info?: { imageUrl?: string };
};

/** DexScreener's CDN takes size params; ask for a small icon instead of the 800 px default. */
export const smallIcon = (u?: string) => (u ? u.replace(/width=\d+&height=\d+&quality=\d+/, 'width=96&height=96&quality=80') : u);

const pairToMarket = (p: DsPair): Market => ({
  id: p.baseToken.address,
  symbol: p.baseToken.symbol,
  name: p.baseToken.name,
  kind: 'meme',
  price: Number(p.priceUsd ?? NaN),
  change24h: p.priceChange?.h24 ?? 0,
  marketCap: p.marketCap ?? p.fdv,
  volume24h: p.volume?.h24,
  image: smallIcon(p.info?.imageUrl),
  createdAt: p.pairCreatedAt,
});

/** Trending Solana tokens: DexScreener's top boosted list, priced via the tokens endpoint. */
export async function fetchTrendingSolana(limit = 20): Promise<Market[]> {
  const boosts = await json<{ chainId: string; tokenAddress: string }[]>(`${DS}/token-boosts/top/v1`);
  const mints = [...new Set(boosts.filter((b) => b.chainId === 'solana').map((b) => b.tokenAddress))].slice(0, Math.min(limit, 30));
  if (!mints.length) return [];
  const pairs = await json<DsPair[]>(`${DS}/tokens/v1/solana/${mints.join(',')}`);
  const best = new Map<string, DsPair>();
  for (const p of pairs) {
    const k = p.baseToken.address;
    const prev = best.get(k);
    if (!prev || (p.volume?.h24 ?? 0) > (prev.volume?.h24 ?? 0)) best.set(k, p);
  }
  return [...best.values()].map(pairToMarket).filter((m) => Number.isFinite(m.price));
}

export async function fetchSolanaToken(mint: string): Promise<Market> {
  const pairs = await json<DsPair[]>(`${DS}/tokens/v1/solana/${mint}`);
  if (!pairs.length) throw new Error('No market found for this mint');
  return pairToMarket(pairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0]);
}

/** Latest trade price: Coinbase ticker for majors, DexScreener for Solana tokens. */
export async function fetchLastPrice(id: string): Promise<number> {
  const m = MAJORS.find((x) => x.id === id);
  if (m) return Number((await json<{ price: string }>(`${CB}/products/${m.product}/ticker`)).price);
  return (await fetchSolanaToken(id)).price;
}
export const isMajor = (id: string) => MAJORS.some((m) => m.id === id);

export type Load<T> = { data?: T; error?: string; loading: boolean; refresh: () => void };

/** Poll an async source. Shows the last good value and the latest error, never invented data. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []): Load<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const tick = useRef(0);
  const run = () => {
    const t = ++tick.current;
    fn().then((d) => { if (t === tick.current) { setData(d); setError(undefined); } })
      .catch((e: Error) => { if (t === tick.current) setError(e.message); })
      .finally(() => { if (t === tick.current) setLoading(false); });
  };
  useEffect(() => {
    run();
    const h = setInterval(run, ms);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, refresh: run };
}

export const useMajors = () => usePoll(() => Promise.all(MAJORS.map((m) => fetchMajor(m.id))), 5000);
export const useTrending = () => usePoll(() => fetchTrendingSolana(20), 15000);
export const useMarket = (id: string) =>
  usePoll(() => (MAJORS.some((m) => m.id === id) ? fetchMajor(id) : fetchSolanaToken(id)), 3000, [id]);
export const useCandles = (id: string) => usePoll(() => fetchCandles(id), 10000, [id]);
