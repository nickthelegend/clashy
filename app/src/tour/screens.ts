// First-visit tours of the inner screens (Nov 20): 2–4 steps each, shown once per device the first time the screen
// opens (useScreenTour in the screen). Same step shape as the main tour, minus routes and chapters.
import type { TourStep } from './steps';

export const SCREEN_TOURS: Record<string, TourStep[]> = {
  clash: [
    { target: 'clash-modes', radius: 22, title: 'Pick your battlefield.', body: 'Crypto in 60 seconds, perps up to 50×, or stocks in an hour.' },
    { target: 'clash-stake', radius: 20, title: 'Put money on it.', body: 'Pick a stake. The winner takes the pot, minus 3%.' },
    { target: 'clash-go', radius: 32, title: 'Sealed calls. Fair fight.', body: 'Nobody sees your call until you both lock in.' },
    { target: 'clash-open', radius: 22, title: 'Or take on a challenger.', body: 'Join a clash someone already opened.' },
    { target: 'clash-wallet', radius: 18, title: 'Proof on every move.', body: 'Tap here for every transaction, with explorer links.' },
  ],
  cup: [
    { target: 'cup-clock', radius: 14, title: 'The clock is ticking.', body: 'The Cup resets Monday 00:00 UTC. Climb before it hits zero.' },
    { target: 'cup-podium', radius: 12, title: 'Top three take the podium.', body: 'Ranked by stock profit plus clash winnings this week.' },
    { target: 'cup-me', radius: 18, title: 'Your spot in the race.', body: 'Your rank and profit this week. Tap Play to climb.' },
  ],
  leaderboard: [
    { target: 'lb-podium', radius: 14, title: 'The best of all time.', body: '+25 a win, −15 a loss. Tap anyone for their profile.',
      alts: [{ target: 'lb-empty', title: 'The podium is empty.', body: 'The first clash that settles puts its winner up here.' }] },
    { target: 'lb-me', radius: 20, title: 'Where you stand.', body: 'Your rank and record. Tap Clash to climb.' },
    { target: 'lb-ladder', radius: 16, title: 'Rookie to Legend.', body: 'Ten ranks. Points come only from settled clashes.' },
  ],
  wallet: [
    { target: 'wallet-balance', radius: 18, title: 'Cash, ready to fight.', body: 'Your USDC on Solana. Clashy pays every network fee.' },
    { target: 'wallet-actions', radius: 30, title: 'Load up. Cash out.', body: 'Add USDC, send it to any Solana address, or receive it.' },
    { target: 'wallet-activity', radius: 18, title: 'Every dollar, on the record.', body: 'Your real USDC moves. Tap one to see it on the explorer.' },
  ],
  stash: [
    { target: 'stash-actions', radius: 26, title: 'Stack it up.', body: 'Add from your wallet, take it out, or buy real stocks.' },
    { target: 'stash-goal', radius: 24, title: 'Save for something real.', body: 'Set a goal and watch your Stash fill it up.' },
    { target: 'stash-autopilot', radius: 22, title: 'Saving on autopilot.', body: 'Round up payments and keep a slice of every win.' },
    { target: 'stash-limits', radius: 22, title: 'Your limits, on chain.', body: 'Cap your daily stakes or take a break. The program enforces it.' },
  ],
  portfolio: [
    { target: 'port-worth', radius: 18, title: 'Everything you own, one number.', body: 'Wallet, Stash, stocks and squad chests, read live from Solana.' },
    { target: 'port-chart', radius: 22, title: 'Rewind the tape.', body: 'Pick 1H, 24H or 7D. Drag across the chart to scrub.' },
    { target: 'port-alloc', radius: 22, title: 'See where it sits.', body: 'Cash, Stash, stocks and chests, each as a share of the total.' },
    { target: 'port-stocks', radius: 22, title: 'Real shares, real P&L.', body: 'Profit since you bought. Tap a stock for its page.',
      alts: [{ target: 'port-nostocks', title: 'Start from $1.', body: 'Buy real tokenized shares out of your Stash.' }] },
  ],
  practice: [
    { target: 'prac-balance', radius: 24, title: 'Ten grand. Zero risk.', body: 'A $10,000 paper balance on live prices. Reset it any time.' },
    { target: 'prac-bot', radius: 22, title: 'Spar with the bot.', body: '60-second rounds against Clashy Bot. Practice money, live prices.' },
    { target: 'prac-markets', radius: 14, title: 'Pick any market.', body: 'Stocks, crypto, perps up to 100× and memecoins. Search them all.' },
  ],
  trade: [
    { target: 'trade-result', radius: 26, title: 'Profit, front and center.', body: "Profit and ROI, live while it's open. Paper money only." },
    { target: 'trade-chart', radius: 24, title: 'Relive the whole fight.', body: 'Real candles since it opened, with the entry marked.' },
    { target: 'trade-details', radius: 24, title: 'No fine print.', body: 'Entry, size, margin, fees and timing, all spelled out.' },
    { target: 'trade-actions', radius: 27, title: 'Copy it or close it.', body: 'Copy any trade into Practice, or share and close your own.' },
  ],
  stock: [
    { target: 'stock-price', radius: 18, title: 'Live from the chain.', body: 'The on-chain price, charted from the moment you opened this.' },
    { target: 'stock-holders', radius: 24, title: "Who's holding the bag.", body: "Every player holding it, what they paid, and how it's doing." },
    { target: 'stock-bar', radius: 27, title: 'Buy it or fight over it.', body: 'Buy from $1 out of your Stash, or jump into a clash.' },
  ],
  squad: [
    { target: 'squad-card', radius: 24, title: 'Meet the squad.', body: 'Level, captain and members, straight from the chain.' },
    { target: 'squad-stats', radius: 18, title: "Numbers don't lie.", body: 'Squad P&L, the shared USDC chest, members and war record.' },
    { target: 'squad-wars', radius: 20, title: 'Every war, on the record.', body: 'Live wars and past results. Chest against chest.' },
    { target: 'squad-join', radius: 14, title: 'Join the crew.', body: 'Free to join. Be in as many squads as you like.',
      alts: [{ target: 'squad-open', title: 'Back to base.', body: 'Open your squad for its chest, chat and wars.' }] },
  ],
  royale: [
    { target: 'royale-intro', radius: 20, title: 'Last one standing wins.', body: 'One coin, a call every 10 seconds. Wrong calls cost a heart.' },
    { target: 'royale-host', radius: 24, title: 'Host your own table.', body: 'Pick seats and hearts, then host it for 2 USDC.' },
    { target: 'royale-open', radius: 22, title: 'Jump into a table.', body: 'Open Royales on chain right now. Join one with a tap.' },
    { target: 'royale-wallet', radius: 16, title: 'Receipts on tap.', body: 'Your balance and every Royale transaction, with explorer links.' },
  ],
  dm: [
    { target: 'dm-clash', radius: 19, title: 'Settle it in the arena.', body: 'Done talking? Start a clash right from the chat.' },
    { target: 'dm-thread', radius: 16, title: 'Swipe it. Hold it.', body: 'Swipe a message to reply. Hold one to react.' },
    { target: 'dm-composer', radius: 22, title: 'Bring the banter.', body: 'Stickers, emoji and 📎 shortcuts. Send it empty for a quick 🔥.' },
  ],
  squadchat: [
    { target: 'sc-channels', radius: 14, title: 'Two rooms, one squad.', body: 'Hang out in #general. Post your stock buys in #trades.' },
    { target: 'sc-clash', radius: 17, title: 'Challenge the whole squad.', body: 'Post a 5 USDC clash card anyone in the squad can accept.' },
    { target: 'sc-thread', radius: 16, title: 'On chain, every word.', body: 'Live on the rollup. Swipe to reply, hold to react.' },
    { target: 'sc-composer', radius: 22, title: 'Say it in 120 bytes.', body: 'Stickers and emoji, plus 📎 for a clash challenge.' },
  ],
};
