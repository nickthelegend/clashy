// The games' look as tokens (Nov 21). Every game screen, card and engine is drawn from these on top of Clashy's own
// tokens (`C`, `FONT` in @/ui/tokens): a near-black clay arcade where each game brings one colour of its own (`def.tint`).
// Use these instead of new hex codes, so a new game looks like the other 150 without anyone matching colours by eye.
import { C } from '@/ui/tokens';

export const GT = {
  /** Text and icons on a solid tint (a game's colour, a choice button, a badge). */
  onTint: '#0A0A0D',
  /** Panels, game cards, waiting boxes. */
  panel: '#111116',
  /** A game card while pressed. */
  panelPressed: '#16161D',
  /** The hero and hot-card base (with the tint glow on top). */
  hero: '#100F15',
  /** The result card. */
  result: '#0F0F14',
  /** Tiles, unselected choices, stat tiles. */
  raised: '#15151B',
  /** The selected market tile. */
  selected: '#221D33',
  /** Small info chips on the hero and cards (length, vs, category). */
  chip: '#1C1A25',
  /** A placeholder logo while a market rolls. */
  placeholder: '#1D1A28',
  /** Secondary pills (Roll again, New cards) and their pressed state. */
  pill: '#1D1D24',
  pillPressed: '#26262E',
  /** Pressed secondary buttons (How to play, More games). */
  pressed: '#24242C',
  /** Stake chips. */
  stake: '#1A1A20',
  /** Bot line background. */
  bot: '#15131D',
  /** Clock and progress tracks. */
  track: '#1C1C22',
  /** Chart grid lines. */
  grid: '#18181C',
  /** Hairlines inside cards (the receipt). */
  hair: '#1F1F27',
  /** Rank #1, a jackpot. */
  gold: '#FFD66B',
  /** Hot badge, market-closed banner. */
  hot: '#FF6B3D',
  warn: '#FFC94A',
  warnBg: '#1A1606',
  warnInk: '#E9D9A6',
  /** Secondary text on the hero and cards. */
  sub: '#D2CDE0',
  subCard: '#C9C4D6',
  /** Who's who: you are lavender, Clashy Bot is pink; green and red only mean up/down or profit/loss. */
  you: C.brand,
  opp: C.opp,
  up: C.up,
  down: C.down,
} as const;

/** Shapes and sizes. Every control is at least 44 px tall. */
export const GS = {
  radius: { hero: 28, card: 24, tile: 20, stat: 16, chip: 10, tag: 7 },
  h: { go: 58, pill: 44, stake: 44, choice: 96, tile: 104, result: 52 },
  /** The tint glow behind heroes and cards: a big soft circle of `def.tint`. */
  glow: { hero: 0.14, hot: 0.18, card: 0.12 },
} as const;

/** The game colours the catalog picks from (`def.tint`). */
export const TINTS = {
  gold: '#FFC94A', pink: '#F0468C', green: '#30D158', sky: '#5AC8FA', lav: '#AB9FF2', orange: '#FF9F0A', coral: '#FF6B6B',
  cyan: '#64D2FF', purple: '#BF5AF2', yellow: '#FFD60A', mint: '#7CE38B', rose: '#FF8FB1', aqua: '#7FE7D6', violet: '#B79BFF',
} as const;
