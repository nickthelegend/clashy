// What a call is about. A post on the calls board carries a kind and a 32-byte refkey (chain/programs/clashy Post):
//   0  a plain post                    refkey unused
//   1  a call on one of the five Stash stocks   refkey = the xStock mint (the author's real position shows on it)
//   2  a clash                          refkey = the duel account
//   3  a call on any Solana token       refkey = the token mint (crypto, pump.fun memecoins, any xStock)
//   4  a call on a perp                 refkey = the Practice market id in ASCII, zero-padded ("phoenix-SOL", "SOL-PERP")
// Kinds 3 and 4 need no program change: the program stores kind and refkey as they are.
import { PublicKey } from '@solana/web3.js';
import { stockByMint } from './stocks';

export const CALL_TOKEN = 3;
export const CALL_PERP = 4;

/** A perp's market id packed into a refkey (ids are at most 32 ASCII bytes). */
export function perpRefkey(id: string): PublicKey {
  const b = new TextEncoder().encode(id);
  if (b.length === 0 || b.length > 32 || /[^\x20-\x7e]/.test(id)) throw new Error(`Can't call ${id}: market ids are 1 to 32 plain characters`);
  const out = new Uint8Array(32);
  out.set(b);
  return new PublicKey(out);
}
export function perpIdOf(refkey: PublicKey): string | null {
  const b = refkey.toBytes();
  const end = b.indexOf(0) === -1 ? 32 : b.indexOf(0);
  const id = new TextDecoder().decode(b.slice(0, end));
  return /^[\x20-\x7e]{1,32}$/.test(id) ? id : null;
}

export type CallTarget =
  | { kind: 'stock'; mint: string }
  | { kind: 'market'; id: string }
  | null;
/** What a post calls: a Stash stock (shows the author's position), or any Practice market (token or perp). */
export function callTarget(post: { kind: number; refkey: PublicKey }): CallTarget {
  if (post.kind === 1) return stockByMint(post.refkey.toBase58()) ? { kind: 'stock', mint: post.refkey.toBase58() } : null;
  if (post.kind === CALL_TOKEN) return { kind: 'market', id: post.refkey.toBase58() };
  if (post.kind === CALL_PERP) { const id = perpIdOf(post.refkey); return id ? { kind: 'market', id } : null; }
  return null;
}

/* ---------- trade posts: a Practice trade attached to a call ----------
 * A call on a market (kind 3 or 4) can carry the author's Practice trade: side, leverage, entry, the exit once it is
 * closed, the margin, when it opened and closed, its profit net of fees once closed, and whether it was liquidated.
 * It rides at the end of the post text after an invisible separator (U+2063), so it needs no program change and costs
 * about 45 of the 140 bytes. Practice is paper money kept on the author's device, so the app always labels these
 * "Practice trade · paper money": they are what the author traded, not verified on chain. Real positions stay the
 * Stash-stock calls (kind 1), read from the author's Holding account.
 *
 *   L10x@73.25>74.88$500~t4n1ka-t4n3c0=+81.2!
 *   side and leverage, @entry, >exit, $margin, ~opened-closed (unix seconds in base 36), =net profit, ! liquidated
 * Everything after the margin is optional, so trades posted before the times were added still read. */
export type TradeTag = {
  side: 'long' | 'short'; lev: number; entry: number; exit?: number; margin: number;
  /** ms since 1970, to the second. */
  openedAt?: number; closedAt?: number;
  /** Closed trades: the profit net of every fee, borrow and funding, in paper USD. */
  pnl?: number;
  liquidated?: boolean;
};
const SEP = '⁣';
const n6 = (n: number) => String(Number(n.toPrecision(6)));
const NUM = '([0-9.e+-]+)';
const TAG = new RegExp(`\\u2063([LS])(\\d{1,3})x@${NUM}(?:>${NUM})?\\$${NUM}(?:~([0-9a-z]{1,8})(?:-([0-9a-z]{1,8}))?)?(?:=${NUM})?(!)?$`);
const b36 = (ms: number) => Math.floor(ms / 1000).toString(36);
/** Unix seconds in base 36 back to ms; anything outside 2017–2096 is not a time we wrote. */
const unb36 = (s?: string) => {
  if (!s) return undefined;
  const n = parseInt(s, 36);
  return Number.isFinite(n) && n > 1_500_000_000 && n < 4_000_000_000 ? n * 1000 : undefined;
};

export function tradeTag(t: TradeTag): string {
  const times = t.openedAt ? `~${b36(t.openedAt)}${t.exit && t.closedAt ? `-${b36(t.closedAt)}` : ''}` : '';
  const pnl = t.exit && t.pnl !== undefined && Number.isFinite(t.pnl) ? `=${t.pnl >= 0 ? '+' : ''}${n6(Math.round(t.pnl * 100) / 100)}` : '';
  return `${SEP}${t.side === 'long' ? 'L' : 'S'}${Math.round(t.lev)}x@${n6(t.entry)}${t.exit ? `>${n6(t.exit)}` : ''}$${n6(t.margin)}${times}${pnl}${t.exit && t.liquidated ? '!' : ''}`;
}
/** The words of a post and the trade it carries, if any (a malformed tag stays part of the text). */
export function splitTrade(text: string): { body: string; trade: TradeTag | null } {
  const m = TAG.exec(text);
  if (!m) return { body: text, trade: null };
  const lev = Number(m[2]), entry = Number(m[3]), exit = m[4] ? Number(m[4]) : undefined, margin = Number(m[5]);
  const openedAt = unb36(m[6]), closedAt = unb36(m[7]), pnl = m[8] !== undefined ? Number(m[8]) : undefined;
  const ok = lev >= 1 && lev <= 100 && entry > 0 && Number.isFinite(entry) && margin > 0 && Number.isFinite(margin)
    && (exit === undefined || (exit > 0 && Number.isFinite(exit))) && (pnl === undefined || Number.isFinite(pnl))
    && (!m[6] || !!openedAt) && (!m[7] || !!closedAt) && (!openedAt || !closedAt || closedAt >= openedAt);
  if (!ok) return { body: text, trade: null };
  const trade: TradeTag = { side: m[1] === 'L' ? 'long' : 'short', lev, entry, exit, margin };
  if (openedAt) trade.openedAt = openedAt;
  if (exit !== undefined) {
    if (closedAt) trade.closedAt = closedAt;
    if (pnl !== undefined) trade.pnl = pnl;
    if (m[9]) trade.liquidated = true;
  }
  return { body: text.slice(0, m.index).trimEnd(), trade };
}
/** The trade's move on its margin, before fees: at its exit once closed, else at `now`. */
export const tradeMovePct = (t: TradeTag, now?: number) => {
  const px = t.exit ?? now;
  return px === undefined ? undefined : (px / t.entry - 1) * (t.side === 'long' ? 1 : -1) * t.lev * 100;
};
/** What a trade card shows: the ROI after fees once a closed trade carries its profit, else the move before fees. */
export const tradeShownPct = (t: TradeTag, now?: number): { pct?: number; net: boolean } =>
  t.exit !== undefined && t.pnl !== undefined ? { pct: (t.pnl / t.margin) * 100, net: true } : { pct: tradeMovePct(t, now), net: false };
