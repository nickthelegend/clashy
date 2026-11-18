// The rules of a practice clash against Clashy Bot, with no dependencies (the chain tests run them): the bot's call,
// each side's return, the knockout, and what the clash pays. Mirrors the real clash: classic pays the stake to the right
// call; perps moves leverage × the move of the stake, capped at the stake, and a side whose loss reaches it is out.

export type Call = 'up' | 'down';
export type PaperClash = {
  id: string; coin: 'SOL' | 'BTC' | 'ETH'; stake: number; lev: number;
  call: Call; botCall: Call; botWhy: string;
  entry: number; startedAt: number; endsAt: number;
  exit?: number; endedAt?: number;
  /** won / lost / tie; ko: someone was knocked out before the bell; abandoned: the app was closed mid-clash (stake back). */
  result?: 'won' | 'lost' | 'tie' | 'abandoned';
  ko?: 'you' | 'bot';
  /** Practice money won (+) or lost (−); the stake itself is returned on top when positive or tie. */
  pnl?: number;
};

/* ---------- Clashy Bot ---------- */
/** Clashy Bot is the other side of every practice clash, like the counterparty of a trade: you call higher, it
 *  calls lower. So every practice clash has a winner unless the price doesn't move at all. */
export function botCall(call: Call): { call: Call; why: string } {
  return { call: call === 'up' ? 'down' : 'up', why: 'Clashy Bot always takes the other side of your call. Whoever the price moves for wins; if it ends exactly where it started, it is a dead heat.' };
}

/* ---------- the rules ---------- */
const dir = (c: Call) => (c === 'up' ? 1 : -1);
/** Each side's return on its stake at this price (perps: leverage × move, floored at −100%). Classic shows the plain move. */
export function sideReturns(c: Pick<PaperClash, 'entry' | 'lev' | 'call' | 'botCall'>, price: number) {
  const move = price / c.entry - 1;
  const r = (call: Call) => Math.max(-1, dir(call) * move * c.lev);
  return { move, you: r(c.call), bot: r(c.botCall) };
}
/** Knocked out: a perps side whose loss has reached its whole stake. */
export function knockout(c: Pick<PaperClash, 'entry' | 'lev' | 'call' | 'botCall'>, price: number): 'you' | 'bot' | null {
  if (c.lev <= 1 || c.call === c.botCall) return null;
  const s = sideReturns(c, price);
  return s.you <= -1 ? 'you' : s.bot <= -1 ? 'bot' : null;
}
/** What the clash pays you at this exit price. Same calls: a dead heat, stakes back. Classic: the right call takes the
 *  other stake. Perps: the move × leverage on the stake changes hands, capped at the stake. */
export function settle(c: Pick<PaperClash, 'entry' | 'lev' | 'call' | 'botCall' | 'stake'>, exit: number): { pnl: number; result: 'won' | 'lost' | 'tie' } {
  if (c.call === c.botCall || exit === c.entry) return { pnl: 0, result: 'tie' };
  if (c.lev <= 1) {
    const right = (exit > c.entry) === (c.call === 'up');
    return right ? { pnl: c.stake, result: 'won' } : { pnl: -c.stake, result: 'lost' };
  }
  const gain = Math.max(-c.stake, Math.min(c.stake, c.stake * sideReturns(c, exit).you));
  const pnl = Math.round(gain * 100) / 100;
  return { pnl, result: pnl > 0 ? 'won' : pnl < 0 ? 'lost' : 'tie' };
}
/** The price at which a perps side is knocked out. */
export const koPrice = (entry: number, call: Call, lev: number) => (call === 'up' ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev));
