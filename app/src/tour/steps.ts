// The tours' steps (Nov 20). Each step lights one thing on the real screen with a one-line slogan and one line on what
// to do with it; Clashy Bot says them. The first-run tour ("main") walks Home item by item, then every tab; inner
// screens get a short tour the first time they open (screens.ts).
//
// A step's `target` is a TourTarget id; `alts` are other things to light (with their own words) when it isn't on
// screen, e.g. the Sign in button for someone signed out. A step whose thing is nowhere on screen is passed over. A step
// with no target is a full-screen card (the welcome and the finale).
import { SCREEN_TOURS } from './screens';

export type TourAlt = { target: string; title: string; body: string };
export type TourStep = {
  target?: string;
  alts?: TourAlt[];
  /** Main tour only: the tab the step runs on; the tour moves there first. */
  route?: string;
  /** Main tour only: the chapter shown on the card. */
  chapter?: string;
  title: string;
  body: string;
  /** The corner radius of the lit area, to match the thing. */
  radius?: number;
  /** A full-screen card's buttons. */
  cta?: string;
  skip?: string;
  /** The finale's button goes here. */
  ctaTo?: string;
};

export const CHAPTERS = ['Home', 'Chats', 'Play', 'Squads', 'You'] as const;

const MAIN: TourStep[] = [
  { title: 'Welcome to the arena.', body: "I'm Clashy Bot. Trading is better with a rival, so let me show you around. 30 seconds.", cta: 'Show me around', skip: 'Skip the tour' },

  { route: '/', chapter: 'Home', target: 'home-search', radius: 20, title: 'Hunt anyone down.', body: 'Players, squads and stocks. Or pull Home down to search.' },
  { route: '/', chapter: 'Home', target: 'home-bell', radius: 20, title: 'Never miss a hit.', body: 'Likes, replies and challenges land here.' },
  { route: '/', chapter: 'Home', target: 'home-add', radius: 20, title: 'Load your war chest.', body: 'Add USDC and play for real.',
    alts: [{ target: 'home-signin', title: "One tap and you're in.", body: 'Sign in to play for real money.' }] },
  { route: '/', chapter: 'Home', target: 'home-worth', radius: 18, title: 'Your war chest.', body: 'Wallet, Stash and stocks, live from Solana. Tap for the breakdown.',
    alts: [{ target: 'home-pitch', title: 'Proof, not hype.', body: 'Every call shows the real shares behind it.' }] },
  { route: '/', chapter: 'Home', target: 'home-topcalls', radius: 22, title: 'Follow the money.', body: "The best real positions behind today's calls. Tap one to see it." },
  { route: '/', chapter: 'Home', target: 'home-live', radius: 32, title: 'Fights happening now.', body: 'Each bubble is a clash live on chain. Tap in to watch.' },
  { route: '/', chapter: 'Home', target: 'home-tabs', radius: 14, title: 'Calls and receipts.', body: 'Read the calls, or flip to see who won which clash.' },
  { route: '/', chapter: 'Home', target: 'home-call', radius: 18, title: 'Make your call.', body: 'Pick a stock, say why, back it with real shares.' },
  { route: '/', chapter: 'Home', target: 'home-feed', radius: 20, title: 'Talk is cheap here.', body: 'Every call wears its P&L. Like it, reply, or call it out.' },

  { route: '/', chapter: 'Chats', target: 'tab-chats', radius: 18, title: 'Your crew, your DMs.', body: 'Messages, squad rooms and follow requests.' },
  { route: '/chats', chapter: 'Chats', target: 'chats-squads', radius: 22, title: 'Squad rooms up top.', body: "Jump into your squads' chats, or find a new crew." },
  { route: '/chats', chapter: 'Chats', target: 'chats-tabs', radius: 14, title: 'Inbox, sorted.', body: 'Messages, notifications and requests, each in its own tab.',
    alts: [{ target: 'chats-signin', title: 'Sign in to chat.', body: 'Message any player, with stickers.' }] },
  { route: '/chats', chapter: 'Chats', target: 'chats-new', radius: 20, title: 'Slide into their DMs.', body: 'Message any player. Stickers and 🔥 included.' },

  { route: '/chats', chapter: 'Play', target: 'tab-play', radius: 18, title: 'The big button.', body: 'Tap it from anywhere to pick a game.' },
  { route: '/arena', chapter: 'Play', target: 'arena-clash', radius: 30, title: '1v1. Best call takes the pot.', body: 'Same coin, two sealed calls. From $5.' },
  { route: '/arena', chapter: 'Play', target: 'arena-games', radius: 26, title: 'More ways to fight.', body: 'Royale, squad wars, 50× perps, or free practice against me.' },
  { route: '/arena', chapter: 'Play', target: 'arena-cup', radius: 24, title: 'Glory resets Monday.', body: 'Best profit this week takes the Weekly Cup.' },
  { route: '/arena', chapter: 'Play', target: 'arena-live', radius: 20, title: 'Watch the arena.', body: 'Clashes live on chain right now. Tap one to watch.' },
  { route: '/arena', chapter: 'Play', target: 'arena-top', radius: 22, title: 'Climb the board.', body: 'The top players by wins. Beat them, take their spot.' },

  { route: '/arena', chapter: 'Squads', target: 'tab-squads', radius: 18, title: 'Stronger together.', body: 'Join a squad, pool a chest, go to war.' },
  { route: '/clans', chapter: 'Squads', target: 'squads-main', radius: 24, title: 'Chest vs chest.', body: "Your squad's P&L, its chat and its wars.",
    alts: [{ target: 'squads-empty', title: 'Find your crew.', body: 'Join a squad, or start your own.' }] },
  { route: '/clans', chapter: 'Squads', target: 'squads-rail', radius: 20, title: 'All your squads.', body: 'Switch between them here, or find new ones.' },

  { route: '/clans', chapter: 'You', target: 'tab-you', radius: 18, title: 'This is you.', body: 'Your record, your profile, your wallet.' },
  { route: '/profile', chapter: 'You', target: 'you-record', radius: 22, title: 'Receipts, not vibes.', body: 'P&L, wins and streak, all read from chain.',
    alts: [{ target: 'you-signin', title: 'Your track record.', body: 'Sign in and every clash you play lands here.' }] },
  { route: '/profile', chapter: 'You', target: 'you-settings', radius: 22, title: 'Make it yours.', body: 'Wallet and settings. Replay this tour from Settings.' },

  { title: "You're ready.", body: 'Your first rival is one tap away. Go get them.', cta: "Let's clash", ctaTo: '/clash', skip: 'Look around first' },
];

export const TOURS: Record<string, TourStep[]> = { main: MAIN, ...SCREEN_TOURS };
