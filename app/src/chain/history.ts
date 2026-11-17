// A player's track record, built only from chain reads: settled duels (stake won or lost, net of the 3% pot fee the
// program keeps) as a cumulative P&L line, ending at today's open stock P&L marked to the crank's live prices.
import type { PublicKey } from '@solana/web3.js';
import type { DuelRow } from './reads';
import { readBoard, type Post } from './social';

/** The program keeps 300 bps of the pot (2 x stake) and pays the rest to the winner; a dead heat refunds both. */
export const FEE_BPS = 300;
/** What one settled duel did to this player's USDC: +winnings, -stake, or 0 for a dead heat. */
export function duelPnl(d: Pick<DuelRow, 'stake' | 'won'>): number {
  if (d.won === null) return 0;
  const stakeRaw = Math.round(d.stake * 1e6);
  if (!d.won) return -stakeRaw / 1e6;
  const fee = Math.floor((stakeRaw * 2 * FEE_BPS) / 10_000);
  return (stakeRaw - fee) / 1e6;
}

export type Range = '24h' | '7d' | '30d' | 'all';
export const RANGE_SECS: Record<Range, number> = { '24h': 86_400, '7d': 7 * 86_400, '30d': 30 * 86_400, all: Infinity };
export type PnlPoint = { ts: number; v: number };

/**
 * Cumulative P&L points for a range: the running total from settled duels (oldest first), a start point carrying the
 * total from before the window, and a last point "now" that adds the open stock P&L. Empty when there is nothing.
 */
export function pnlSeries(duels: DuelRow[], openStockPnl: number, range: Range, now = Date.now() / 1000): PnlPoint[] {
  const asc = [...duels].sort((a, b) => a.endTs - b.endTs);
  if (!asc.length && Math.abs(openStockPnl) < 0.005) return [];
  // 'All' starts a little before the first settlement (6% of the span, at least a minute) so the first move reads as a step
  const first = asc[0]?.endTs ?? now - 86_400;
  const from = range === 'all' ? first - Math.max(60, (now - first) * 0.06) : now - RANGE_SECS[range];
  let run = 0;
  const pts: PnlPoint[] = [];
  for (const d of asc) {
    if (d.endTs < from) { run += duelPnl(d); continue; }
    if (!pts.length) pts.push({ ts: from, v: run });
    run += duelPnl(d);
    pts.push({ ts: d.endTs, v: run });
  }
  if (!pts.length) pts.push({ ts: from, v: run });
  pts.push({ ts: now, v: run + openStockPnl });
  return pts;
}

/** Sum of duel P&L settled since `since` (unix seconds). */
export const duelPnlSince = (duels: DuelRow[], since: number) => duels.filter((d) => d.endTs >= since).reduce((a, d) => a + duelPnl(d), 0);

/** Everything a player has posted on the public calls feed (calls, shared duels, replies), newest first. */
export async function readPostsBy(owner: PublicKey): Promise<Post[]> {
  const all = await readBoard();
  return all.filter((p) => p.author.equals(owner));
}
