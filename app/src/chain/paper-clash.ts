// Practice clash against Clashy Bot: the real clash, with practice money. Same live prices (the rollup price feeds the
// crank pushes every second, the ones real clashes settle on), same 60 seconds, same sealed calls, same perps rules
// (each side's P&L is its leverage × the move, capped at the stake; a side whose loss reaches its stake is knocked
// out). The stake comes from the Practice paper balance and nothing is sent on chain: the chain is only read.
//
// Clashy Bot is a bot and is always shown as one. It takes the other side of every call (./clash-rules.ts).
import { useEffect, useState } from 'react';
import { COIN_SYMBOLS, P, er, base } from './client';
import { reader } from './reads';

export const BOT_NAME = 'Clashy Bot';
export const PRACTICE_COINS = ['SOL', 'BTC', 'ETH'] as const;
export type PracticeCoin = (typeof PRACTICE_COINS)[number];
export const CLASH_SECS = 60;
/** 1 is a classic clash (right call takes the stake); more is a perps clash. */
export const PRACTICE_LEVERAGE = [1, 5, 10, 25, 50] as const;
export const PRACTICE_STAKES = [5, 10, 25, 100] as const;
/** A price older than this can't start or settle a practice clash. */
export const FEED_FRESH_S = 10;

import type { Call } from './clash-rules';
export type { Call, PaperClash } from './clash-rules';
export { botCall, knockout, koPrice, settle, sideReturns } from './clash-rules';

/* ---------- the live price: the rollup feed, as the real clash reads it ---------- */
export type FeedPrice = { price: number; at: number };
export async function readFeedPrice(coin: PracticeCoin): Promise<FeedPrice | null> {
  const i = COIN_SYMBOLS.indexOf(coin);
  const info = (await er.getAccountInfo(P.feed(i)).catch(() => null)) ?? (await base.getAccountInfo(P.feed(i)).catch(() => null));
  if (!info) return null;
  const f = reader.coder.accounts.decode('priceFeed', info.data) as { price: { toString(): string }; updatedAt: { toNumber(): number } };
  const price = Number(f.price.toString()) / 1e6;
  return price > 0 ? { price, at: f.updatedAt.toNumber() } : null;
}
export const feedFresh = (f?: FeedPrice | null) => !!f && Date.now() / 1000 - f.at <= FEED_FRESH_S;

/** Live feed price for a coin, read once a second, with the prices seen so far (for the bot and the chart). */
export function useFeedPrice(coin: PracticeCoin) {
  const [last, setLast] = useState<FeedPrice | null>(null);
  const [seen, setSeen] = useState<{ t: number; p: number }[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    setLast(null); setSeen([]);
    const run = async () => {
      try {
        const f = await readFeedPrice(coin);
        if (!alive) return;
        if (!f) { setError(`No ${coin} price feed on this network yet.`); return; }
        setLast(f); setError(undefined);
        setSeen((s) => (s.length && s[s.length - 1].t === f.at ? s : [...s, { t: f.at, p: f.price }].slice(-600)));
      } catch (e) { if (alive) setError(`Can't read the ${coin} price feed: ${(e as Error).message}`); }
    };
    run();
    const h = setInterval(run, 1000);
    return () => { alive = false; clearInterval(h); };
  }, [coin]);
  return { last, seen, error, fresh: feedFresh(last) };
}
