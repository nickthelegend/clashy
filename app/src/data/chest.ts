// Clan Chest (practice): a shared clan pot that only trades by vote. Proposal → votes → captain executes → a live
// position on the real price → close. On chain this is the Clan account's vault with Proposal accounts voted on the
// ER. This practice chest is money-free, kept on this device, and you are the only voter and captain (the real one is /onchain-clan).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export type Side = 'long' | 'short';
export type Proposal = { id: string; coin: string; side: Side; pct: number; lev: number; by: string; at: number; yes: number; no: number; myVote?: 'yes' | 'no' };
export type Position = { id: string; coin: string; side: Side; lev: number; margin: number; entry: number; at: number };
export type Closed = Position & { exit: number; pnl: number; closedAt: number };
export type Chest = { cash: number; start: number; proposals: Proposal[]; open: Position[]; closed: Closed[] };

const KEY = 'clashy:chest:v1';
export const PRACTICE_START = 1000;
const fresh = (): Chest => ({ cash: PRACTICE_START, start: PRACTICE_START, proposals: [], open: [], closed: [] });
const uid = () => Math.random().toString(36).slice(2, 10);

/** Leveraged P&L in dollars for a position at `price` (losses capped at the margin, like a liquidation). */
export const pnlOf = (p: Position, price: number) => {
  const move = (price - p.entry) / p.entry;
  return Math.max(-p.margin, p.margin * move * p.lev * (p.side === 'long' ? 1 : -1));
};

export function useChest() {
  const [chest, setChest] = useState<Chest | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setChest(v ? (JSON.parse(v) as Chest) : fresh())).catch(() => setChest(fresh()));
  }, []);
  const save = useCallback((next: Chest) => { setChest(next); AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); }, []);

  const propose = (coin: string, side: Side, pct: number, lev: number) => {
    if (!chest) return;
    save({ ...chest, proposals: [{ id: uid(), coin, side, pct, lev, by: 'you', at: Date.now(), yes: 0, no: 0 }, ...chest.proposals] });
  };
  const vote = (id: string, v: 'yes' | 'no') => {
    if (!chest) return;
    save({ ...chest, proposals: chest.proposals.map((p) => (p.id !== id || p.myVote ? p : { ...p, myVote: v, yes: p.yes + (v === 'yes' ? 1 : 0), no: p.no + (v === 'no' ? 1 : 0) })) });
  };
  /** Captain executes a passed proposal at the live price. */
  const execute = (id: string, price: number) => {
    if (!chest) return;
    const p = chest.proposals.find((x) => x.id === id);
    if (!p || p.yes <= p.no) return;
    const margin = Math.min(chest.cash, Math.round((chest.cash * p.pct) / 100 * 100) / 100);
    if (margin <= 0) return;
    save({
      ...chest, cash: chest.cash - margin,
      proposals: chest.proposals.filter((x) => x.id !== id),
      open: [{ id: uid(), coin: p.coin, side: p.side, lev: p.lev, margin, entry: price, at: Date.now() }, ...chest.open],
    });
  };
  const drop = (id: string) => { if (chest) save({ ...chest, proposals: chest.proposals.filter((x) => x.id !== id) }); };
  const close = (id: string, price: number) => {
    if (!chest) return;
    const p = chest.open.find((x) => x.id === id);
    if (!p) return;
    const pnl = pnlOf(p, price);
    save({ ...chest, cash: chest.cash + p.margin + pnl, open: chest.open.filter((x) => x.id !== id), closed: [{ ...p, exit: price, pnl, closedAt: Date.now() }, ...chest.closed].slice(0, 30) });
  };
  const reset = () => save(fresh());
  return { chest, propose, vote, execute, drop, close, reset };
}
