// Live market data for the landing. No mocks: Coinbase Exchange public REST for majors,
// DexScreener for trending Solana tokens. Errors surface as text, never as invented prices.
import { useEffect, useRef, useState } from 'react';

export type Coin = { id: string; symbol: string; image?: string; price: number; change24h: number };
const CB = 'https://api.exchange.coinbase.com';
const DS = 'https://api.dexscreener.com';

export const MAJORS = [
  { id: 'SOL', product: 'SOL-USD', image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
  { id: 'BTC', product: 'BTC-USD', image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
  { id: 'ETH', product: 'ETH-USD', image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
] as const;
export type MajorId = (typeof MAJORS)[number]['id'];

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${new URL(url).host} answered HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function fetchMajor(id: MajorId): Promise<Coin> {
  const m = MAJORS.find((x) => x.id === id)!;
  const s = await json<{ open: string; last: string }>(`${CB}/products/${m.product}/stats`);
  const last = Number(s.last), open = Number(s.open);
  return { id, symbol: id, image: m.image, price: last, change24h: ((last - open) / open) * 100 };
}
export async function fetchLast(id: MajorId): Promise<number> {
  const m = MAJORS.find((x) => x.id === id)!;
  return Number((await json<{ price: string }>(`${CB}/products/${m.product}/ticker`)).price);
}

type DsPair = { baseToken: { address: string; symbol: string }; priceUsd?: string; priceChange?: { h24?: number }; volume?: { h24?: number }; info?: { imageUrl?: string } };
/** DexScreener's CDN only accepts some sizes (64, 128, 256, 800); 128 is sharp on retina and about 3 KB. */
export const smallIcon = (u?: string) => (u ? u.replace(/width=\d+&height=\d+&quality=\d+/, 'width=128&height=128&quality=80') : u);

export async function fetchTrending(limit = 14): Promise<Coin[]> {
  const boosts = await json<{ chainId: string; tokenAddress: string }[]>(`${DS}/token-boosts/top/v1`);
  const mints = [...new Set(boosts.filter((b) => b.chainId === 'solana').map((b) => b.tokenAddress))].slice(0, limit);
  if (!mints.length) return [];
  const pairs = await json<DsPair[]>(`${DS}/tokens/v1/solana/${mints.join(',')}`);
  const best = new Map<string, DsPair>();
  for (const p of pairs) { const prev = best.get(p.baseToken.address); if (!prev || (p.volume?.h24 ?? 0) > (prev.volume?.h24 ?? 0)) best.set(p.baseToken.address, p); }
  return [...best.values()].map((p) => ({ id: p.baseToken.address, symbol: p.baseToken.symbol, image: smallIcon(p.info?.imageUrl), price: Number(p.priceUsd), change24h: p.priceChange?.h24 ?? 0 })).filter((c) => Number.isFinite(c.price));
}

/** Polls `fn` every `ms`. Keeps the last good data and reports the latest error. */
export function usePoll<T>(fn: () => Promise<T>, ms: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const f = useRef(fn); f.current = fn;
  useEffect(() => {
    let alive = true;
    const run = () => f.current().then((d) => { if (alive) { setData(d); setError(undefined); } }).catch((e: Error) => alive && setError(e.message));
    run();
    const h = setInterval(run, ms);
    return () => { alive = false; clearInterval(h); };
  }, [ms]);
  return { data, error };
}

export const fmtUsd = (n: number) =>
  n >= 1000 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(4)}` : `$${n.toPrecision(3)}`;
export const fmtPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
