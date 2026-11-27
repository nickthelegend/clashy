// The 151 games (100 on Nov 20, 50 more on Nov 21, then Draw the Line). Ideas from two Grok sessions and research on what ships today
// (grokbot/research/clashy-games), judged and merged into the engines in ./engines; see docs/GAMES.md. Each game is an engine with its own markets, clock, colour and settings.
// "How to play" is written from those settings by `rules()`, so it always matches what the game really does.
// Leverage here is game leverage on practice money, sized to each market's volatility so a round can bust or pay in
// seconds (a real 100× position on BTC barely moves in a minute); the real-money Perps clash stays at real venue caps.
import type { PoolKey } from './feed';
import type { Category, EngineId, GameDef } from './types';

const T = {
  gold: '#FFC94A', pink: '#F0468C', green: '#30D158', sky: '#5AC8FA', lav: '#AB9FF2', orange: '#FF9F0A', coral: '#FF6B6B',
  cyan: '#64D2FF', purple: '#BF5AF2', yellow: '#FFD60A', mint: '#7CE38B', rose: '#FF8FB1', aqua: '#7FE7D6', violet: '#B79BFF',
} as const;

const PAIRS = {
  stocks: [['NVDA', 'AMD'], ['AAPL', 'MSFT'], ['META', 'GOOGL'], ['AMZN', 'MSFT'], ['COIN', 'MSTR'], ['HOOD', 'COIN'], ['TSLA', 'NVDA'], ['PLTR', 'ORCL'], ['NFLX', 'META']],
  chips: [['NVDA', 'AMD'], ['TSM', 'INTC'], ['MU', 'AVGO'], ['AMD', 'INTC'], ['NVDA', 'TSM'], ['AVGO', 'AMD']],
  index: [['SPY', 'NVDA'], ['QQQ', 'TSLA'], ['SPY', 'AAPL'], ['QQQ', 'META'], ['SPY', 'MSFT'], ['QQQ', 'AMZN']],
  crypto: [['SOL', 'ETH'], ['BTC', 'ETH'], ['SOL', 'SUI'], ['HYPE', 'SOL'], ['XRP', 'ADA'], ['LINK', 'AAVE'], ['BTC', 'SOL'], ['NEAR', 'SUI']],
  memes: [['kBONK', 'WIF'], ['kPEPE', 'kSHIB'], ['FARTCOIN', 'PUMP'], ['PENGU', 'PIPPIN'], ['TRUMP', 'DOGE'], ['WIF', 'PENGU'], ['USELESS', 'FARTCOIN'], ['DOGE', 'kSHIB']],
  macro: [['GOLD', 'SILVER'], ['SPY', 'QQQ'], ['GOLD', 'BTC'], ['WTIOIL', 'GOLD'], ['EURUSD', 'GBPUSD'], ['COPPER', 'SILVER']],
};
/** Every symbol in a set of pairs, once. */
const flat = (pp: string[][]) => [...new Set(pp.flat())];
const MAG7 = ['AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'NVDA', 'TSLA'];
const MACRO = ['GOLD', 'SILVER', 'WTIOIL', 'COPPER', 'EURUSD', 'GBPUSD', 'USDJPY', 'SPY', 'QQQ'];
const EVERYTHING: PoolKey[] = ['majors', 'alts', 'memes', 'stocks', 'commodities', 'fx'];

type P = NonNullable<GameDef['p']>;
const len = (s: number) => (s < 60 ? `${s} seconds` : s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${Math.round(s / 6) / 10} minutes`);
const num = (p: P, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);

/** How to play, written from the engine and its settings. */
function rules(e: EngineId, secs: number, p: P, vs: GameDef['vs']): [string, string, string] {
  const bot = 'Clashy Bot';
  switch (e) {
    case 'updown': return [p.blind ? 'A mystery market is rolled. You only see its line until the bell.' : p.roll === false ? 'Pick a market.' : 'A market is rolled for you.', `Call up or down. ${bot} takes the other side.`, `Right after ${len(secs)}: 2× your stake. Flat: stake back.`];
    case 'race': {
      const m = (p.metric as string) ?? 'up';
      const what = m === 'down' ? 'drops the most' : m === 'abs' ? 'moves the most, either way' : m === 'quiet' ? 'moves the least' : 'climbs the most';
      return [p.pairs ? 'Two markets go head to head.' : `${num(p, 'n', 4)} markets line up.`, `Back the one you think ${what}. ${bot} backs another.`, `After ${len(secs)}, the better one wins you 2×.`];
    }
    case 'range': {
      const m = p.mode as string;
      if (m === 'side') return ['A box is drawn around the price.', `Call which edge it breaks first. ${bot} takes the other.`, `First break wins 2×. No break in ${len(secs)}: stake back.`];
      if (m === 'bell') return ['A move size is set from how the market has been moving.', `Call CALM (smaller at the bell) or WILD (bigger). ${bot} takes the other.`, `Right after ${len(secs)}: 2× your stake.`];
      return ['A band is drawn around the price, sized for even odds.', `Call STAY (it never leaves) or BREAK (it touches an edge). ${bot} takes the other.`, `Right: 2× your stake. A touch ends it early.`];
    }
    case 'touch': return ['Targets sit above and below the price, each with a payout.', 'Pick one. Further away pays more.', `Touch it within ${len(secs)} and you're paid on the spot.`];
    case 'cashout':
      if (p.vsBot) return [`You and ${bot} open the same ${num(p, 'lev', 5)}× position.`, `Cash out whenever you like. ${bot} cashes out at a secret moment.`, 'The higher cash-out wins 2×. Liquidated: you lose.'];
      if (p.rungs) return [`Open a ${num(p, 'lev', 10)}× position. Your multiplier moves with the price.`, 'Cash out on any rung you have reached.', `Busts at 0. The bell after ${len(secs)} cashes you out.`];
      return [`Open a ${num(p, 'lev', 10)}× position. Your multiplier moves with the price.`, 'Cash out any time and take the multiplier.', `Liquidated at 0. The bell after ${len(secs)} cashes you out.`];
    case 'survive': return [p.side === 'both' ? 'Pick a leverage. Liquidation sits on both sides.' : 'Pick a side and a leverage.', 'Higher leverage pays more. The payout is set before you start.', `Not liquidated after ${len(secs)}? You're paid.`];
    case 'guess': {
      const m = p.mode as string;
      if (m === 'peak') return [`Guess the highest move the price makes in ${len(secs)}.`, `${bot} guesses too. Going over loses to a guess that didn't.`, 'Closest wins 2×.'];
      if (m === 'price') return [`Guess the price at the bell, ${len(secs)} from now.`, `${bot} guesses too.`, 'Closest wins 2×.'];
      return [`Guess how far it moves in ${len(secs)}, up or down.`, `${bot} guesses too.`, 'Closest wins 2×.'];
    }
    case 'streak': {
      const r = num(p, 'roundSecs', 10), st = num(p, 'step', 1.9);
      if (p.rounds) return [`${num(p, 'rounds', 5)} calls of ${len(r)} each, up or down.`, 'Every one has to be right.', `All right pays ${Math.round(Math.pow(st, num(p, 'rounds', 5)))}×. One miss: gone.`];
      return [`Calls of ${len(r)} each, up or down${p.mode === 'reroll' ? ', on a new market every time' : p.mode === 'choose' ? ', on a market you pick each time' : ''}.`, `Every right call grows the pot ${st}×.`, 'Cash out between calls. One miss loses the pot.'];
    }
    case 'podium': return [`${num(p, 'n', 3)} markets race for ${len(secs)}.`, 'Put them in finishing order.', 'The exact order pays most. The payouts show before you start.'];
    case 'draft': return [`${num(p, 'n', 8)} markets are on the board.`, p.snake ? `You and ${bot} take turns picking ${num(p, 'k', 3)} each.` : `Draft ${num(p, 'k', 3)}. ${bot} gets ${num(p, 'k', 3)} of the rest.`, `After ${len(secs)}, the better average move wins 2×.`];
    case 'snipe': return p.side === 'sell'
      ? [`A ${len(secs)} window opens.`, `Tap SELL once, as close to the top as you dare. ${bot} taps at a random moment.`, 'Closer to the high wins 2×. No tap loses.']
      : [`A ${len(secs)} window opens.`, `Tap BUY once, as close to the bottom as you dare. ${bot} taps at a random moment.`, 'Closer to the low wins 2×. No tap loses.'];
    case 'compare': {
      const m = p.metric as string;
      const q = m === 'mcap' ? 'is worth more' : m === 'liquidity' ? 'has the deeper pool' : m === 'holders' ? 'has more holders' : 'did better today (24 h change)';
      return ['Two markets, side by side.', `Tap the one that ${q}.`, `Right grows the pot ${num(p, 'step', 1.8)}×. Cash out any time. Wrong loses it.`];
    }
    case 'capguess': return ['A pump.fun coin and a number.', `Is its real ${p.metric === 'holders' ? 'holder count' : 'market cap'} higher or lower?`, `Right grows the pot ${num(p, 'step', 1.8)}×. Cash out any time. Wrong loses it.`];
    case 'ko': return ['Pick long or short and your leverage.', `${bot} takes the other side at the same leverage.`, `First one liquidated loses. Nobody? Profit at the bell after ${len(secs)} wins 2×.`];
    case 'royale': return [`You and ${num(p, 'bots', 7)} bots, ${num(p, 'hearts', 3)} hearts each, one market.`, `Every ${num(p, 'callSecs', 10)} seconds everyone calls up or down before the window closes. Wrong costs a heart.`, `Last one standing wins ${((num(p, 'bots', 7) + 1) * 0.97).toFixed(2)}×.`];
    case 'flip': return [`Open long or short at ${num(p, 'lev', 10)}×. ${bot} opens the other side.`, 'You can flip your side once, any time.', `Better P&L after ${len(secs)} wins 2×.`];
    case 'addonce': return [`Open a ${num(p, 'lev', 10)}× position with half your stake.`, 'One tap adds the other half at the live price.', `What it's worth after ${len(secs)} is what you get. Liquidated: 0.`];
    case 'bingo': return ['Pick a card of nine price events.', 'Squares light up as the prices touch them.', `A line within ${len(secs)} pays the card's multiplier.`];
    case 'bracket': return ['Eight markets, a knockout bracket.', `Call every match. ${bot} fills a random bracket.`, `Decided by the moves after ${len(secs)}. More right calls wins 2×.`];
    case 'elim': return [`${num(p, 'n', 8)} markets. Back one. ${bot} backs another.`, `Every ${num(p, 'every', 10)} seconds the worst one so far is knocked out.`, 'Whose market lasts longer wins 2×.'];
    case 'leader': return [`${num(p, 'n', 5)} markets, ranked by the last 5 minutes.`, `CHASE: the leader keeps beating the laggard. FADE: the laggard catches up. ${bot} takes the other side.`, `Right after ${len(secs)}: 2× your stake.`];
    /* Nov 21 */
    case 'drawline': return [`Draw where the price goes over the next ${secs} seconds: drag across the blank part of the chart.`, 'Clashy Bot draws its own line. Then the live price draws over both.', 'Every price that lands on your line or crosses it is a touch. More touches than the bot pays 2×; the same is a push.'];
    case 'tapgrid': return [`A grid runs ahead of the live price: ${num(p, 'cols', 5)} columns of ${num(p, 'colSecs', 5)} seconds, rows of price.`, `Tap up to ${num(p, 'chips', 5)} cells, at least 1.5 s before their moment. Each chip is 1/${num(p, 'chips', 5)} of your stake, and a cell's payout locks when you tap it.`, 'A cell pays if the price line passes through it in its moment. Unused chips come back.'];
    case 'picks': return [`${num(p, 'n', 5)} lines: a market and a number each.`, p.flex === false ? `Pick More or Less on at least ${num(p, 'min', 2)}. Every pick must hit.` : `Pick More or Less on at least ${num(p, 'min', 2)}. Power: every pick must hit. Flex (3 or more): one miss still pays.`, `Every line settles after ${len(secs)}. A pick that lands exactly on its number is dropped.`];
    case 'tower': {
      const hard = p.mode === 'hard';
      return [`${num(p, 'floors', 8)} floors. Each floor is a ${num(p, 'floorSecs', 10)}-second call on one market.`, hard ? 'Pick one of three lanes: UP, FLAT or DOWN. Each is an even third.' : 'Pick two of three lanes: UP, FLAT or DOWN. Each is an even third.', `Right climbs and grows the pot ${hard ? '2.91' : '1.46'}×. Cash out between floors. A miss and you fall.`];
    }
    case 'mines': {
      const green = p.mines === 'green', n = num(p, 'tiles', 16), m = num(p, 'count', n === 9 ? 2 : 4);
      return [`${n} real markets, ${p.faceUp === false ? 'face down' : 'face up'}. The ${m} ${green ? 'best' : 'worst'} on the day (24 h change) are mines.`, "Flip a safe one and the pot grows. Flip a mine and it's gone.", 'Cash out any time after a safe flip. The odds are exact, less 3%.'];
    }
    case 'roulette': return [`Six slots for where the move lands after ${len(secs)}, from a big drop to a big jump.`, `Place up to ${num(p, 'chips', 5)} chips. Rarer slots pay more, and the payouts show before you spin.`, 'The live move is the ball. Where it sits at the bell pays. Dead flat: chips back.'];
    case 'rewind': return p.mode === 'target'
      ? ['A real chart from the last few hours, with what came next hidden.', `Drag to where it closed ${num(p, 'hide', 10)} candles later. ${bot} guesses too.`, 'Closer wins 2×. Same distance: stake back.']
      : ['A real chart from the last few hours, with what came next hidden.', `Call it: higher or lower than the last close, ${num(p, 'hide', 10)} candles later?`, `Right grows the pot ${num(p, 'step', 1.9)}×. Cash out any time. Wrong loses it.`];
    case 'whochart': return [`A real chart of ${p.tf === '5m' ? '5-minute' : '1-minute'} candles, with no names and no prices.`, `Which of the ${num(p, 'choices', 4)} markets is it?`, `Right grows the pot ${num(p, 'step', 2.5)}×. Cash out any time. Wrong loses it.`];
    case 'candle': {
      const q = (p.q as string) ?? 'mix';
      const call = q === 'wick' ? 'Call its longer wick: the top one or the bottom one.' : q === 'close' ? 'Call where it closes: the top half of its range or the bottom half.' : q === 'body' ? 'Call it: more body than wick, or more wick than body.' : q === 'range' ? "Call it: a bigger range than the minute before, or a smaller one." : 'You get a question about its shape: wicks, close or body.';
      return [`One ${len(secs)} candle forms live from the price.`, `${call} ${bot} takes the other side.`, 'Right when it closes: 2×. A tie: stake back.'];
    }
    case 'path': {
      const legs = num(p, 'legs', 2);
      return [`${legs} legs of ${Math.round(secs / legs)} seconds on one market.`, 'Before it starts, call up or down for every leg.', `Every leg right pays ${(0.97 * 2 ** legs).toFixed(2)}×. A wrong leg loses. A flat leg and no wrong one: stake back.`];
    }
    case 'sync': return ['Two markets go at once.', `Call SAME (both finish up, or both down) or SPLIT. ${bot} takes the other.`, `Right after ${len(secs)}: 2×. Either one flat: stake back.`];
    case 'timer': return [`Pick long or short at ${num(p, 'lev', 100)}× and the second you exit, before it starts.`, `${bot} opens the same side and exits at a random second. Liquidated before your exit: −100%.`, 'The better P&L at the exit wins 2×. A tie: stake back.'];
  }
}

type Spec = [id: string, name: string, hook: string, engine: EngineId, cat: Category, pool: GameDef['pool'], secs: number, tint: string, p?: P, extra?: Partial<GameDef>];
const vsOf = (e: EngineId): GameDef['vs'] => (['touch', 'cashout', 'survive', 'streak', 'podium', 'compare', 'capguess', 'addonce', 'bingo', 'tapgrid', 'picks', 'tower', 'mines', 'roulette', 'rewind', 'whochart', 'path'].includes(e) ? 'solo' : e === 'royale' ? 'bots' : 'bot');
const make = ([id, name, hook, engine, cat, pool, secs, tint, p = {}, extra = {}]: Spec): GameDef => {
  const vs = (engine === 'cashout' && p.vsBot) || (engine === 'rewind' && p.mode === 'target') ? 'bot' : vsOf(engine);
  return { id, name, hook, engine, cat, pool, secs, tint, vs, p, how: rules(engine, secs, p, vs), ...extra };
};

const SPECS: Spec[] = [
  /* ---------- memes (22) ---------- */
  ['meme-sprint', 'Meme Sprint', 'Four memes. Thirty seconds. One winner.', 'race', 'memes', 'memes', 30, T.pink, { n: 4 }, { badge: 'Hot' }],
  ['cap-king', 'Cap King', 'Back the meme that runs hardest.', 'race', 'memes', 'memes', 180, T.gold, { n: 6 }],
  ['meme-beef', 'Meme Beef', 'Two memes. One beef. Pick a side.', 'race', 'memes', 'memes', 60, T.coral, { pairs: PAIRS.memes }],
  ['rug-radar', 'Rug Radar', 'Ride it up. Bail before the rug.', 'cashout', 'memes', 'memes', 90, T.coral, { lev: 100, side: 'long' }, { badge: 'Hot' }],
  ['diamond-duel', 'Diamond Duel', 'Hold longer than the bot. Sell higher.', 'cashout', 'memes', 'memes', 120, T.cyan, { lev: 100, side: 'long', vsBot: true }],
  ['peak-tap', 'Peak Tap', 'Sell the exact top.', 'snipe', 'memes', 'memes', 45, T.yellow, { side: 'sell' }],
  ['dip-sniper', 'Dip Sniper', 'Buy the exact bottom.', 'snipe', 'memes', 'memes', 45, T.mint, { side: 'buy' }],
  ['meme-mix', 'Meme Mix', 'Build the best three-coin bag.', 'draft', 'memes', 'memes', 180, T.purple, { n: 8, k: 3 }],
  ['meme-podium', 'Meme Podium', 'Gold, silver, bronze. Call all three.', 'podium', 'memes', 'memes', 120, T.gold, { n: 3 }],
  ['vol-volley', 'Vol Volley', 'Calm or wild? Call the chaos.', 'range', 'memes', 'memes', 60, T.orange, { mode: 'bell' }],
  ['cap-clash', 'Cap Clash', 'Which meme is worth more?', 'compare', 'memes', 'memes', 0, T.pink, { metric: 'mcap', step: 1.8 }],
  ['liquidity-lock', 'Liquidity Lock', 'Which pool runs deeper?', 'compare', 'memes', 'memes', 0, T.aqua, { metric: 'liquidity', step: 1.8 }],
  ['holder-high', 'Holder High', 'Which coin has the bigger crowd?', 'compare', 'memes', 'memes', 0, T.violet, { metric: 'holders', step: 1.8 }],
  ['cap-or-no-cap', 'Cap or No Cap', 'Higher or lower than that market cap?', 'capguess', 'memes', 'memes', 0, T.yellow, { metric: 'mcap', step: 1.8 }],
  ['holder-hunch', 'Holder Hunch', 'Guess the crowd behind the coin.', 'capguess', 'memes', 'memes', 0, T.rose, { metric: 'holders', step: 1.8 }],
  ['pump-or-dump', 'Pump or Dump', 'Thirty seconds. Which way?', 'updown', 'memes', 'memes', 30, T.green],
  ['mystery-meme', 'Mystery Meme', "You don't know the coin. Call it anyway.", 'updown', 'memes', 'memes', 60, T.purple, { blind: true }],
  ['moon-touch', 'Moon Touch', 'Pick a moon. Touch it, get paid.', 'touch', 'memes', 'memes', 60, T.yellow, { dir: 'up', rings: 4 }],
  ['dump-dodge', 'Dump Dodge', 'Pick your leverage. Dodge the red candle.', 'survive', 'memes', 'memes', 90, T.coral, { levs: [250, 400, 700], side: 'choose' }],
  ['meme-madness', 'Meme Madness', 'Eight memes. One champion.', 'bracket', 'memes', 'memes', 120, T.pink, { n: 8 }],
  ['last-meme', 'Last Meme Standing', 'The worst meme dies every 15 seconds.', 'elim', 'memes', 'memes', 105, T.coral, { n: 8, every: 15 }],
  ['curve-kiss', 'Curve Kiss', "Guess the high. Don't go over.", 'guess', 'memes', 'memes', 60, T.rose, { mode: 'peak' }],

  /* ---------- perps (21) ---------- */
  ['liq-line', 'Liq Line', 'Ride the leverage until the line breaks.', 'cashout', 'perps', 'majors', 90, T.lav, { lev: 250, side: 'choose' }, { badge: 'Hot' }],
  ['knockout', 'Knockout', 'First one liquidated loses.', 'ko', 'perps', 'majors', 120, T.pink, { levs: [500, 1000, 2000] }],
  ['pyramid', 'Pyramid', 'Add once. Make it count.', 'addonce', 'perps', 'majors', 120, T.gold, { lev: 200 }],
  ['flip', 'Flip', 'One flip. Use it well.', 'flip', 'perps', 'majors', 90, T.cyan, { lev: 100 }],
  ['leverage-ladder', 'Leverage Ladder', 'Climb the rungs. Don’t fall.', 'cashout', 'perps', 'majors', 240, T.orange, { lev: 200, side: 'choose', rungs: [1.2, 1.5, 2, 3, 5] }],
  ['safe-zone', 'Safe Zone', 'Pick the leverage that survives.', 'survive', 'perps', 'majors', 45, T.green, { levs: [1000, 1600, 2500], side: 'both' }],
  ['target-tap', 'Target Tap', 'Name your target. Touch it first.', 'touch', 'perps', 'majors', 60, T.lav, { dir: 'both', rings: 3 }],
  ['range-break', 'Range Break', 'Which way does the box break?', 'range', 'perps', 'majors', 90, T.sky, { mode: 'side' }],
  ['double-down', 'Double Down', 'One chance to double up.', 'addonce', 'perps', 'alts', 75, T.purple, { lev: 200 }],
  ['wick-dodger', 'Wick Dodger', 'Dodge the wick. Get paid.', 'survive', 'perps', 'alts', 60, T.mint, { levs: [500, 1000, 1500], side: 'choose' }],
  ['micro-scalp', 'Micro Scalp', 'Fifteen seconds at 500×.', 'updown', 'perps', 'majors', 15, T.yellow, { lev: 500 }, { badge: 'Fast' }],
  ['liq-hunt', 'Liq Hunt', "Hunt the bot's liquidation line.", 'ko', 'perps', 'alts', 180, T.coral, { levs: [200, 400, 800] }],
  ['side-switch', 'Side Switch', 'Switch sides before it hurts.', 'flip', 'perps', 'alts', 120, T.rose, { lev: 50 }],
  ['max-pain', 'Max Pain', 'Live right next to liquidation.', 'survive', 'perps', 'majors', 90, T.pink, { levs: [500, 1000, 2000], side: 'choose' }],
  ['rocket', 'Rocket', '500× rocket. Jump before it pops.', 'cashout', 'perps', 'majors', 60, T.orange, { lev: 500, side: 'choose' }, { badge: 'Hot' }],
  ['gold-rush', 'Gold Rush', 'Gold and silver at 400×. Cash out shiny.', 'cashout', 'perps', 'commodities', 120, T.gold, { lev: 400, side: 'choose' }],
  ['tightrope', 'Tightrope', 'Stay inside the lines.', 'range', 'perps', 'majors', 60, T.aqua, { mode: 'stay' }],
  ['breakout', 'Breakout', 'Will the alt break the box?', 'range', 'perps', 'alts', 120, T.orange, { mode: 'stay' }],
  ['alt-season', 'Alt Season', 'Six alts. Pick the runner.', 'race', 'perps', 'alts', 120, T.green, { n: 6 }],
  ['fx-duel', 'FX Duel', 'Currencies at 100×. Your call.', 'updown', 'perps', 'fx', 120, T.sky, { lev: 100 }],
  ['oil-knockout', 'Oil Knockout', 'Oil, gold and copper. Last one liquidated wins.', 'ko', 'perps', 'commodities', 180, T.orange, { levs: [500, 1000, 2000] }],

  /* ---------- stocks (20) ---------- */
  ['pair-pick', 'Pair Pick', 'NVDA or AMD? Pick your side.', 'race', 'stocks', 'stocks', 300, T.green, { pairs: PAIRS.stocks }, { badge: 'Hot' }],
  ['mag7-mix', 'Mag 7 Mix', 'Draft the Magnificent Seven.', 'draft', 'stocks', MAG7, 600, T.gold, { n: 7, k: 3, snake: true }],
  ['sector-draft', 'Sector Draft', 'Draft your three-stock basket.', 'draft', 'stocks', 'stocks', 900, T.purple, { n: 9, k: 3 }],
  ['index-edge', 'Index Edge', 'Beat the index, or ride it.', 'race', 'stocks', ['stocks', 'indexes'], 600, T.sky, { pairs: PAIRS.index }],
  ['slow-grind', 'Slow Grind', 'Which name grinds higher?', 'race', 'stocks', 'stocks', 600, T.mint, { n: 4 }],
  ['relative-rank', 'Relative Rank', 'Rank three names, best to worst.', 'podium', 'stocks', 'stocks', 600, T.violet, { n: 3 }],
  ['range-ride', 'Range Ride', 'Stay inside, or break the range.', 'range', 'stocks', 'stocks', 600, T.aqua, { mode: 'stay' }],
  ['beta-bet', 'Beta Bet', 'Big move or small? Call the size.', 'range', 'stocks', 'stocks', 300, T.orange, { mode: 'bell' }],
  ['low-vol', 'Low Vol', 'Pick the quietest name.', 'race', 'stocks', 'stocks', 600, T.lav, { n: 4, metric: 'quiet' }],
  ['leader-lag', 'Leader Lag', 'Chase the leader or fade it.', 'leader', 'stocks', 'stocks', 600, T.gold, { n: 5 }],
  ['close-auction', 'Close Auction', 'Name the price at the bell.', 'guess', 'stocks', 'stocks', 600, T.cyan, { mode: 'price' }],
  ['stock-call', 'Stock Call', 'Five minutes. One stock. Your call.', 'updown', 'stocks', 'stocks', 300, T.green],
  ['strike-price', 'Strike Price', 'Pick a strike. Touch it, get paid.', 'touch', 'stocks', 'stocks', 300, T.yellow, { dir: 'both', rings: 3 }],
  ['stock-bracket', 'Stock Bracket', 'Eight tickers. One champion.', 'bracket', 'stocks', 'stocks', 600, T.pink, { n: 8 }],
  ['chip-war', 'Chip War', 'Semis, head to head.', 'race', 'stocks', 'stocks', 300, T.purple, { pairs: PAIRS.chips }],
  ['red-day', 'Red Day', 'Pick the one that drops most.', 'race', 'stocks', 'stocks', 300, T.coral, { n: 4, metric: 'down' }],
  ['ticker-tape', 'Ticker Tape', 'Thirty-second calls on one stock.', 'streak', 'stocks', 'stocks', 0, T.mint, { roundSecs: 30, step: 1.9, mode: 'same' }],
  ['blind-ticker', 'Blind Ticker', 'A secret stock. Call it anyway.', 'updown', 'stocks', 'stocks', 300, T.violet, { blind: true }],
  ['wall-street-cut', 'Wall Street Cut', 'The worst stock is cut every minute.', 'elim', 'stocks', 'stocks', 420, T.coral, { n: 8, every: 60 }],
  ['big-tech-royale', 'Big Tech Royale', 'Eight players. One stock. Last one standing.', 'royale', 'stocks', 'stocks', 0, T.gold, { hearts: 3, bots: 7, callSecs: 20 }],

  /* ---------- crypto (19) ---------- */
  ['coin-call', 'Coin Call', 'One coin, one call, sixty seconds.', 'updown', 'crypto', ['majors', 'alts'], 60, T.lav],
  ['coin-derby', 'Coin Derby', 'Six coins. One winner.', 'race', 'crypto', ['majors', 'alts'], 60, T.gold, { n: 6 }],
  ['coin-clash', 'Coin Clash', 'Two coins. Head to head.', 'race', 'crypto', ['majors', 'alts'], 60, T.pink, { pairs: PAIRS.crypto }],
  ['hot-streak', 'Hot Streak', 'Ten-second calls. Keep it going.', 'streak', 'crypto', 'majors', 0, T.orange, { roundSecs: 10, step: 1.9, mode: 'same' }, { badge: 'Hot' }],
  ['chain-gang', 'Chain Gang', 'Pick the next coin every call.', 'streak', 'crypto', 'alts', 0, T.purple, { roundSecs: 15, step: 1.9, mode: 'choose' }],
  ['daily-gauntlet', 'Gauntlet', 'Five calls. All right, or nothing.', 'streak', 'crypto', 'majors', 0, T.coral, { roundSecs: 10, step: 1.95, rounds: 5 }],
  ['relay-race', 'Relay Race', 'A new coin every call.', 'streak', 'crypto', 'alts', 0, T.sky, { roundSecs: 12, step: 1.9, mode: 'reroll' }],
  ['price-is-close', 'Close Enough', 'Guess the move. Closer wins.', 'guess', 'crypto', 'majors', 60, T.cyan, { mode: 'bell' }],
  ['peak-predict', 'Peak Predict', "Guess the high before it prints.", 'guess', 'crypto', 'alts', 60, T.yellow, { mode: 'peak' }],
  ['sniper', 'Sniper', 'Buy the bottom of the next 30 seconds.', 'snipe', 'crypto', 'majors', 30, T.mint, { side: 'buy' }],
  ['top-shot', 'Top Shot', 'Sell the top of the next 30 seconds.', 'snipe', 'crypto', 'alts', 30, T.rose, { side: 'sell' }],
  ['better-day', 'Better Day', 'Which one did better today?', 'compare', 'crypto', ['majors', 'alts', 'memes', 'stocks'], 0, T.green, { metric: 'ch24', step: 1.8 }],
  ['podium', 'Podium', 'Call first, second and third.', 'podium', 'crypto', ['majors', 'alts'], 60, T.gold, { n: 3 }],
  ['puzzle-path', 'Puzzle Path', 'Put four coins in order.', 'podium', 'crypto', 'alts', 120, T.violet, { n: 4 }],
  ['grand-slam', 'Grand Slam', 'Five coins, exact order, huge payout.', 'podium', 'crypto', 'alts', 180, T.pink, { n: 5 }],
  ['team-draft', 'Team Draft', 'Snake draft against the bot.', 'draft', 'crypto', ['majors', 'alts'], 120, T.sky, { n: 8, k: 3, snake: true }],
  ['coin-cut', 'Coin Cut', 'The worst coin is out every 10 seconds.', 'elim', 'crypto', ['majors', 'alts'], 70, T.coral, { n: 8, every: 10 }],
  ['chase-or-fade', 'Chase or Fade', 'Ride the leader or bet on the comeback.', 'leader', 'crypto', 'alts', 120, T.orange, { n: 5 }],
  ['moonshot', 'Moonshot', 'Pick a height. Touch it.', 'touch', 'crypto', 'alts', 120, T.purple, { dir: 'up', rings: 4 }],

  /* ---------- party (18) ---------- */
  ['royale', 'Bot Royale', 'You and seven bots. Last one standing.', 'royale', 'party', 'majors', 0, T.gold, { hearts: 3, bots: 7, callSecs: 10 }, { badge: 'Hot' }],
  ['speed-royale', 'Speed Royale', 'Six-second calls. Two hearts.', 'royale', 'party', 'alts', 0, T.orange, { hearts: 2, bots: 7, callSecs: 6 }],
  ['meme-royale', 'Meme Royale', 'Eight degens. One meme.', 'royale', 'party', 'memes', 0, T.pink, { hearts: 3, bots: 7, callSecs: 8 }],
  ['price-bingo', 'Price Bingo', 'Fill a line before the bell.', 'bingo', 'party', 'majors', 180, T.yellow, { markets: 3 }],
  ['bingo-blitz', 'Bingo Blitz', 'Ninety seconds. One line.', 'bingo', 'party', 'alts', 90, T.mint, { markets: 3 }],
  ['meme-bingo', 'Meme Bingo', 'Meme moves on a bingo card.', 'bingo', 'party', 'memes', 120, T.rose, { markets: 3 }],
  ['card-clash', 'Card Clash', 'Coins, memes and stocks on one card.', 'bingo', 'party', ['majors', 'memes', 'stocks'], 240, T.violet, { markets: 3 }],
  ['bracket-run', 'Bracket Run', 'Call the whole bracket.', 'bracket', 'party', ['majors', 'alts'], 120, T.sky, { n: 8 }],
  ['macro-madness', 'Macro Madness', 'Gold, oil, FX and the indexes in one bracket.', 'bracket', 'party', MACRO, 300, T.gold, { n: 8 }],
  ['survivor', 'Survivor', 'Back a coin. Outlast the cuts.', 'elim', 'party', ['majors', 'alts', 'memes'], 84, T.coral, { n: 8, every: 12 }],
  ['draft-duel', 'Draft Duel', 'Four picks each. Snake order.', 'draft', 'party', ['majors', 'alts', 'memes'], 180, T.purple, { n: 9, k: 4, snake: true }],
  ['pair-party', 'Pair Party', 'Gold or silver? Pound or euro?', 'race', 'party', MACRO, 120, T.aqua, { pairs: PAIRS.macro }],
  ['fast-fingers', 'Fast Fingers', 'Twenty seconds to snipe the dip.', 'snipe', 'party', 'memes', 20, T.yellow, { side: 'buy' }, { badge: 'Fast' }],
  ['hot-potato', 'Hot Potato', 'Flip it before it burns.', 'flip', 'party', 'memes', 60, T.orange, { lev: 100 }],
  ['streak-ladder', 'Streak Ladder', 'Ten-second meme calls. Climb or bank.', 'streak', 'party', 'memes', 0, T.green, { roundSecs: 10, step: 1.8, mode: 'reroll' }],
  ['double-or-nothing', 'Double or Nothing', 'Fifteen-second calls at nearly 2×.', 'streak', 'party', 'majors', 0, T.pink, { roundSecs: 15, step: 1.95, mode: 'same' }],
  ['wildcard', 'Wildcard', 'Anything could come up. Call it.', 'updown', 'party', EVERYTHING, 45, T.lav],
  ['mystery-box', 'Mystery Box', 'A hidden market. Sixty seconds.', 'updown', 'party', EVERYTHING, 60, T.violet, { blind: true }],

  /* ---------- Nov 21: 50 more, on 11 new engines ---------- */
  // tap trading (Euphoria, BC.GAME): round = one lead column + the grid
  ['draw-line', 'Draw the Line', 'Draw the next 30 seconds. Touch the real price.', 'drawline', 'crypto', 'majors', 30, T.violet, {}, { badge: 'New' }],
  ['tap-grid', 'Tap Grid', 'Tap where the price goes next.', 'tapgrid', 'crypto', 'majors', 30, T.cyan, { cols: 5, colSecs: 5, rows: 7, chips: 5 }, { badge: 'Hot' }],
  ['meme-grid', 'Meme Grid', 'Tap the chaos before it happens.', 'tapgrid', 'memes', 'memes', 28, T.pink, { cols: 6, colSecs: 4, rows: 7, chips: 5 }, { badge: 'New' }],
  ['grid-rush', 'Grid Rush', 'Three-second cells. Tap fast.', 'tapgrid', 'party', 'alts', 21, T.yellow, { cols: 6, colSecs: 3, rows: 7, chips: 5 }],
  ['stock-grid', 'Stock Grid', 'Tap the tape on the big stocks.', 'tapgrid', 'stocks', 'stocks', 36, T.mint, { cols: 5, colSecs: 6, rows: 7, chips: 5 }],
  ['perp-grid', 'Perp Grid', 'Wide cells on the big perps.', 'tapgrid', 'perps', ['majors', 'alts'], 48, T.violet, { cols: 5, colSecs: 8, rows: 7, chips: 5 }],
  // More or Less (PrizePicks)
  ['more-or-less', 'More or Less', 'Five lines. More or Less. Hit them all.', 'picks', 'crypto', ['majors', 'alts'], 60, T.green, { n: 5, min: 2 }, { badge: 'New' }],
  ['meme-picks', 'Meme Picks', 'More or Less on the memes.', 'picks', 'memes', 'memes', 60, T.rose, { n: 5, min: 2 }],
  ['stock-picks', 'Stock Picks', 'Five stocks. More or Less.', 'picks', 'stocks', 'stocks', 90, T.sky, { n: 5, min: 2 }],
  ['macro-picks', 'Macro Picks', 'Gold, oil, FX and the indexes.', 'picks', 'perps', MACRO, 120, T.gold, { n: 5, min: 2 }],
  ['power-play', 'Power Play', 'Three picks. All or nothing.', 'picks', 'party', EVERYTHING, 45, T.orange, { n: 4, min: 3, flex: false }],
  // tower (Dragon Tower)
  ['price-tower', 'Price Tower', 'Climb eight floors. Fall on a miss.', 'tower', 'crypto', 'majors', 80, T.lav, { floors: 8, floorSecs: 10, mode: 'easy' }, { badge: 'Hot' }],
  ['meme-tower', 'Meme Tower', 'One lane per floor. Huge climbs.', 'tower', 'memes', 'memes', 64, T.coral, { floors: 8, floorSecs: 8, mode: 'hard' }],
  ['stock-tower', 'Stock Tower', 'Climb the tape, six floors.', 'tower', 'stocks', 'stocks', 90, T.aqua, { floors: 6, floorSecs: 15, mode: 'easy' }],
  ['perp-tower', 'Perp Tower', 'Twelve-second floors on the alts.', 'tower', 'perps', 'alts', 96, T.purple, { floors: 8, floorSecs: 12, mode: 'easy' }],
  ['sky-tower', 'Sky Tower', 'Hard mode. One lane, ten floors.', 'tower', 'party', ['majors', 'alts'], 60, T.yellow, { floors: 10, floorSecs: 6, mode: 'hard' }],
  // mines on the day's 24 h change
  ['red-mines', 'Red Mines', "Sixteen coins. Today's four worst blow up.", 'mines', 'crypto', ['majors', 'alts'], 0, T.coral, { tiles: 16, mines: 'red', faceUp: true }, { badge: 'New' }],
  ['meme-mines', 'Meme Mines', "Dodge the day's two worst memes.", 'mines', 'memes', 'memes', 0, T.mint, { tiles: 9, mines: 'red', faceUp: true }],
  ['stock-mines', 'Stock Mines', "Nine stocks. Dodge the day's two worst.", 'mines', 'stocks', ['stocks', 'indexes'], 0, T.gold, { tiles: 9, mines: 'red', faceUp: true }],
  ['blind-mines', 'Blind Mines', "Face down. The day's worst are mines.", 'mines', 'party', EVERYTHING, 0, T.violet, { tiles: 16, mines: 'red', faceUp: false }],
  // roulette on the move
  ['move-roulette', 'Move Roulette', 'Chips on where the move lands.', 'roulette', 'crypto', 'majors', 30, T.gold, { chips: 5 }, { badge: 'New' }],
  ['meme-roulette', 'Meme Roulette', 'Spin the memes.', 'roulette', 'memes', 'memes', 30, T.pink, { chips: 5 }],
  ['stock-roulette', 'Stock Roulette', 'One stock, six slots.', 'roulette', 'stocks', 'stocks', 60, T.green, { chips: 5 }],
  ['gold-wheel', 'Gold Wheel', 'Gold, silver and oil on the wheel.', 'roulette', 'perps', 'commodities', 60, T.yellow, { chips: 5 }],
  ['quick-spin', 'Quick Spin', 'Fifteen seconds. Place your chips.', 'roulette', 'party', 'alts', 15, T.orange, { chips: 5 }, { badge: 'Fast' }],
  // replays of real candles
  ['rewind', 'Rewind', 'A real chart. What happened next?', 'rewind', 'crypto', 'majors', 0, T.sky, { tf: '1m', show: 40, hide: 10, mode: 'dir', step: 1.9 }, { badge: 'New' }],
  ['meme-rewind', 'Meme Rewind', 'Real meme charts. Call what came next.', 'rewind', 'memes', 'memes', 0, T.rose, { tf: '1m', show: 40, hide: 10, mode: 'dir', step: 1.9 }],
  ['tape-rewind', 'Tape Rewind', 'Five-minute stock candles. Higher or lower?', 'rewind', 'stocks', 'stocks', 0, T.mint, { tf: '5m', show: 36, hide: 6, mode: 'dir', step: 1.9 }],
  ['perp-rewind', 'Perp Rewind', 'Five-minute alt candles. Higher or lower?', 'rewind', 'perps', 'alts', 0, T.violet, { tf: '5m', show: 36, hide: 6, mode: 'dir', step: 1.9 }],
  ['call-the-close', 'Call the Close', 'Drag to where it really closed.', 'rewind', 'party', ['majors', 'alts'], 0, T.aqua, { tf: '1m', show: 40, hide: 10, mode: 'target' }],
  // who's that chart
  ['whos-that-chart', "Who's That Chart", 'Name the coin from its chart.', 'whochart', 'crypto', ['majors', 'alts'], 0, T.purple, { tf: '1m', choices: 4, candles: 60, step: 2.5 }, { badge: 'New' }],
  ['meme-lineup', 'Meme Lineup', 'Which meme drew this chart?', 'whochart', 'memes', 'memes', 0, T.yellow, { tf: '1m', choices: 4, candles: 60, step: 2.5 }],
  ['ticker-detective', 'Ticker Detective', 'Spot the stock from its chart.', 'whochart', 'stocks', 'stocks', 0, T.sky, { tf: '5m', choices: 4, candles: 48, step: 2.5 }],
  ['chart-detective', 'Chart Detective', 'Coin, meme, stock or gold?', 'whochart', 'party', EVERYTHING, 0, T.lav, { tf: '5m', choices: 4, candles: 48, step: 2.5 }],
  // one live candle
  ['candle-call', 'Candle Call', 'Watch one candle form. Call its shape.', 'candle', 'crypto', 'majors', 60, T.green, { q: 'mix' }, { badge: 'New' }],
  ['wick-duel', 'Wick Duel', 'Top wick or bottom wick?', 'candle', 'memes', 'memes', 60, T.pink, { q: 'wick' }],
  ['strong-close', 'Strong Close', 'Top half or bottom half?', 'candle', 'perps', 'alts', 60, T.cyan, { q: 'close' }],
  ['body-or-wick', 'Body or Wick', 'All body, or all wick?', 'candle', 'stocks', 'stocks', 60, T.gold, { q: 'body' }],
  ['bigger-candle', 'Bigger Candle', 'Bigger than the last minute, or smaller?', 'candle', 'party', ['majors', 'alts', 'memes'], 60, T.orange, { q: 'range' }],
  // the whole path
  ['path-pick', 'Path Pick', 'Up then down? Call the whole path.', 'path', 'crypto', 'majors', 60, T.violet, { legs: 2 }, { badge: 'New' }],
  ['triple-path', 'Triple Path', 'Three legs. Every one right.', 'path', 'perps', 'alts', 60, T.coral, { legs: 3 }],
  ['meme-path', 'Meme Path', 'Three meme legs, fifteen seconds each.', 'path', 'memes', 'memes', 45, T.mint, { legs: 3 }],
  ['stock-path', 'Stock Path', 'Two legs of a minute each.', 'path', 'stocks', 'stocks', 120, T.sky, { legs: 2 }],
  // same way or split
  ['in-sync', 'In Sync', 'Same way or split?', 'sync', 'crypto', flat(PAIRS.crypto), 60, T.cyan, { pairs: PAIRS.crypto }, { badge: 'New' }],
  ['meme-twins', 'Meme Twins', 'Two memes. Do they move together?', 'sync', 'memes', flat(PAIRS.memes), 60, T.pink, { pairs: PAIRS.memes }],
  ['chip-sync', 'Chip Sync', 'Two chip stocks. Same way or split?', 'sync', 'stocks', flat(PAIRS.chips), 120, T.green, { pairs: PAIRS.chips }],
  ['macro-sync', 'Macro Sync', 'Gold and silver, euro and pound.', 'sync', 'party', flat(PAIRS.macro), 120, T.gold, { pairs: PAIRS.macro }],
  // set your exit
  ['exit-plan', 'Exit Plan', "Set your exit second. Beat the bot's.", 'timer', 'perps', 'majors', 60, T.lav, { lev: 100 }, { badge: 'New' }],
  ['meme-timer', 'Meme Timer', 'Pick the second to bail.', 'timer', 'memes', 'memes', 45, T.yellow, { lev: 50 }],
  ['stock-timer', 'Stock Timer', 'Ninety seconds. One exit.', 'timer', 'stocks', 'stocks', 90, T.aqua, { lev: 100 }],
  ['time-bomb', 'Time Bomb', 'Thirty seconds at 200×. When do you get out?', 'timer', 'party', 'alts', 30, T.orange, { lev: 200 }],
];

export const GAMES: GameDef[] = SPECS.map(make);
export const gameById = (id: string) => GAMES.find((x) => x.id === id);
