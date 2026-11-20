// What a game is (Nov 20). Every game is one of a handful of engines (a way to play: a call, a race, a cash-out…) set
// up with its own markets, clock and rules. The catalog (./catalog.ts) lists them; the game screen (app/games/[id])
// runs the engine. Every game is played with practice money on live prices, against Clashy Bot or on your own.
import type { PoolKey } from './feed';

export type EngineId =
  | 'updown' // call up or down on one market; Clashy Bot takes the other side
  | 'race' // pick the market that moves most out of a lineup (or a pair)
  | 'range' // will the price stay inside a band or break out of it
  | 'touch' // pick a target; win if the price touches it before the bell (live odds)
  | 'cashout' // ride a leveraged multiplier and cash out before it busts
  | 'survive' // pick leverage; stay alive until the bell (live odds)
  | 'guess' // guess the move at the bell; closer than Clashy Bot wins
  | 'streak' // back-to-back quick calls; the pot grows, one miss loses it
  | 'podium' // put three markets in finishing order
  | 'draft' // draft a team of three; the better team wins
  | 'snipe' // tap once to buy the dip (or sell the top) inside a window
  | 'compare' // instant: which one moved more today; build a streak
  | 'capguess' // instant: pump.fun coins, higher or lower than a market cap
  | 'ko' // leveraged 1v1 against Clashy Bot; first liquidated loses
  | 'royale' // last one standing against seven bots, a call every few seconds
  | 'flip' // open a side, flip it once; the better P&L at the bell wins
  | 'addonce' // open a leveraged side, add once; ride it to the bell
  | 'bingo' // a card of price events; complete a line before the bell (live odds)
  | 'bracket' // call every match of an eight-market bracket
  | 'elim' // the worst market is knocked out every few seconds; your pick has to last
  | 'leader'; // the leader keeps leading, or the laggard catches up

export type Category = 'memes' | 'perps' | 'stocks' | 'crypto' | 'party';
export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'memes', label: 'Memes' }, { key: 'perps', label: 'Perps' }, { key: 'stocks', label: 'Stocks' }, { key: 'crypto', label: 'Crypto' }, { key: 'party', label: 'Party' },
];

export type GameDef = {
  id: string;
  name: string;
  /** One line that sells it. */
  hook: string;
  /** How to play: three short lines. */
  how: [string, string, string];
  engine: EngineId;
  cat: Category;
  /** The markets it rolls from (pools in ./feed.ts) or exact symbols. */
  pool: PoolKey | PoolKey[] | string[];
  /** Round length in seconds (instant games: 0). */
  secs: number;
  /** The game's colour. */
  tint: string;
  /** Who you play against. */
  vs: 'bot' | 'solo' | 'bots';
  /** Engine settings (see each engine). */
  p?: Record<string, number | string | boolean | number[] | string[][]>;
  /** Shown on the card: "New", "Hot"… */
  badge?: string;
};
