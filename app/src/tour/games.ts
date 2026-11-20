// Tours for the Games page and every game (Nov 20). Each game's first visit gets its own short tour: what the game is,
// the decision, the stake, the start, and where the rules live. The decision and start lines come from the game's
// engine, so all 100 games get one without 500 hand-written lines.
import { GAMES } from '@/games/catalog';
import type { EngineId, GameDef } from '@/games/types';
import type { TourStep } from './steps';

type Two = { title: string; body: string };
const GUIDE: Record<EngineId, { pick: Two; go: Two }> = {
  updown: { pick: { title: 'Your market.', body: 'Rolled for you. Roll again if you want another.' }, go: { title: 'Up or down?', body: 'Tap your call. Clashy Bot takes the other side.' } },
  race: { pick: { title: 'Pick your runner.', body: 'Tap the market you think wins.' }, go: { title: 'Back it.', body: 'Clashy Bot backs another one. Best at the bell wins.' } },
  range: { pick: { title: 'Read the band.', body: 'It’s sized so both sides have an even chance.' }, go: { title: 'Make your call.', body: 'Clashy Bot takes the other side.' } },
  touch: { pick: { title: 'Pick a target.', body: 'Further away pays more. Odds come from live moves.' }, go: { title: 'Go for it.', body: 'Touch it before the bell and you’re paid on the spot.' } },
  cashout: { pick: { title: 'Choose your side.', body: 'Your multiplier rides the live price.' }, go: { title: 'Jump in. Get out.', body: 'Cash out before it busts.' } },
  survive: { pick: { title: 'Pick your leverage.', body: 'More leverage pays more. The payout shows up front.' }, go: { title: 'Stay alive.', body: 'Not liquidated at the bell? You’re paid.' } },
  guess: { pick: { title: 'Make your guess.', body: 'Slide to where you think it lands.' }, go: { title: 'Lock it in.', body: 'Closer than Clashy Bot wins.' } },
  streak: { pick: { title: 'Call after call.', body: 'Each right call grows the pot.' }, go: { title: 'Start the streak.', body: 'Cash out between calls. One miss loses it.' } },
  podium: { pick: { title: 'Set the order.', body: 'Tap them in the order you think they finish.' }, go: { title: 'Lock the podium.', body: 'The exact order pays most.' } },
  draft: { pick: { title: 'Draft your team.', body: 'Tap to pick. Clashy Bot drafts too.' }, go: { title: 'Team vs team.', body: 'The better average move wins.' } },
  snipe: { pick: { title: 'Watch the line.', body: 'Find the moment. You only get one tap.' }, go: { title: 'Take the shot.', body: 'Closer to the extreme than Clashy Bot wins.' } },
  compare: { pick: { title: 'Pick the bigger one.', body: 'Tap the one you think wins.' }, go: { title: 'Bank it.', body: 'Cash out any time after a right answer.' } },
  capguess: { pick: { title: 'Higher or lower?', body: 'Is the real number above or below this one?' }, go: { title: 'Bank it.', body: 'Cash out any time after a right answer.' } },
  ko: { pick: { title: 'Side and leverage.', body: 'Clashy Bot takes the other side at the same leverage.' }, go: { title: 'Knock it out.', body: 'First one liquidated loses.' } },
  royale: { pick: { title: 'Eight in the ring.', body: 'You and seven bots, a few hearts each.' }, go: { title: 'Call fast.', body: 'Wrong calls cost a heart. Last one standing wins.' } },
  flip: { pick: { title: 'Pick a side.', body: 'Clashy Bot opens the other one.' }, go: { title: 'One flip.', body: 'Switch sides once, when it counts.' } },
  addonce: { pick: { title: 'Pick a side.', body: 'Half your stake opens the position.' }, go: { title: 'Add once.', body: 'One tap puts the other half in at the live price.' } },
  bingo: { pick: { title: 'Pick a card.', body: 'Each card shows what a line pays.' }, go: { title: 'Fill a line.', body: 'Squares light up as prices hit them.' } },
  bracket: { pick: { title: 'Call the bracket.', body: 'Pick a winner for every match.' }, go: { title: 'Lock it in.', body: 'More right calls than Clashy Bot wins.' } },
  elim: { pick: { title: 'Back one.', body: 'The worst market so far is cut on every beat.' }, go: { title: 'Outlast the bot.', body: 'Whose pick lasts longer wins.' } },
  leader: { pick: { title: 'Leader and laggard.', body: 'Ranked by the last five minutes.' }, go: { title: 'Chase or fade?', body: 'Clashy Bot takes the other side.' } },
};

function gameTour(g: GameDef): TourStep[] {
  const e = GUIDE[g.engine];
  return [
    { target: 'g-hero', radius: 28, title: `${g.name}.`, body: g.hook },
    { target: 'g-pick', radius: 22, ...e.pick },
    { target: 'g-stake', radius: 18, title: 'Pick your stake.', body: 'Practice money, on live prices.' },
    { target: 'g-go', radius: 26, ...e.go },
    { target: 'g-rules', radius: 19, title: 'Rules, any time.', body: 'How to play has the full rules.' },
  ];
}

export const GAME_TOURS: Record<string, TourStep[]> = {
  games: [
    { target: 'games-hot', radius: 28, title: 'Hot right now.', body: 'The most played games. Swipe for more.' },
    { target: 'games-cats', radius: 20, title: 'A hundred games.', body: 'Memes, perps, stocks, crypto and party games.' },
    { target: 'games-search', radius: 14, title: 'Know what you want?', body: 'Search any game by name.' },
    { target: 'games-card', radius: 24, title: 'Tap to play.', body: 'Each game shows you around the first time.' },
    { target: 'games-balance', radius: 20, title: 'Practice money.', body: 'Shared with Practice. Tap to see your trades.' },
  ],
  ...Object.fromEntries(GAMES.map((g) => [`game:${g.id}`, gameTour(g)])),
};
