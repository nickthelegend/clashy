# Clashy mini-games: high risk, real trades, real money

Status: design (Nov 15 2026), from Nick: high risk where you can lose everything ("go all in or don't go in"), the
player picks the pot, every trade is real with real profit math, and the games are crazy addictive and built on
what's trending (fresh launches). Venues and money layers: [REAL-TRADES.md](REAL-TRADES.md). Code starts Nov 20.

## Rules every game follows
1. **Real orders only.** Every position is a real fill: Phoenix perps for long/short, the pump.fun curve or Jupiter
   for memes. No virtual balances in money games. (The free Arena stays as practice and says so.)
2. **You pick the pot.** Any amount from the minimum ($1) up to your balance. Matchmaking pairs equal pots, or you
   post an open challenge ("$137, SOL, 5 min") that anyone can take at exactly that amount.
3. **All-in button.** One tap sets pot + margin to your whole balance and leverage to the market max. A hold-to-
   confirm ("Hold to go all in") makes it a ritual, not an accident. Lose and it's gone: a real liquidation on
   Phoenix, or the pot to your rival.
4. **The receipt is the truth.** Every game ends on a receipt built only from on-chain data. Example layout
   (illustrative numbers, not a real game):

   ```
   entry fill        $187.42   (Phoenix, tx …)
   exit fill         $188.10   (tx …)
   size              2.67 SOL  (25×, $20 margin = $500 notional)
   trading P&L       +$1.82
   fees              −$0.35    (0.035% taker × 2)
   funding           −$0.01
   pot               +$18.80   (won the $40 pot: $38.80 after 3% rake, minus your $20)
   net               +$20.26
   ```
   Rake, venue fees and funding are always shown, never folded into a nicer number.
5. **The ER runs the game.** Matchmaking, the VRF roll, sealed picks (Private ER), 10 Hz scoring, KO checks and
   settlement are MagicBlock ER/VRF transactions. The trades sit underneath. That's what Blitz judges.

## The games
| # | Game | One line | Venue | Length | How you lose everything |
|---|---|---|---|---|---|
| 1 | **All-In Knockout** (headline) | 1v1. VRF rolls a coin, both go max leverage, first one liquidated loses. | Phoenix | until a KO, max 5 min | real liquidation + the pot |
| 2 | **Launch Snipe** | VRF rolls a pump.fun coin launched in the last 10 minutes (safety-checked). Everyone in the room buys the same second. Best % at the bell. | pump curve | 5 min | the coin rugs |
| 3 | **Diamond Hands** | Everyone buys the same fresh meme. Hold as long as you dare; your score is the % when YOU sell. Anyone still holding when it drops 50% from its peak is knocked out. | pump curve / Jupiter | until the last one sells, max 15 min | holding through the dump |
| 4 | **Rug Roulette** | Six fresh launches on the wheel. Each player secretly picks one (sealed in the Private ER) and buys it. Reveal, then 10 minutes. Best % takes the pot. | pump curve | 10 min | picking the rug |
| 5 | **Double or Nothing** | After any win, one tap rolls the whole payout into the next duel at the next leverage step. A streak counter climbs; one loss ends it. | any | chained | the whole streak |
| 6 | **Coin Clash** | Each picks their own coin (perps or memes). Best leveraged % wins. | Phoenix / pump | 3–5 min | the pot + liquidation |
| 7 | **Fade the Whale** | A top-ranked player's live position is posted. Challengers take the other side for a pot. | Phoenix | until either closes, max 1 h | being on the wrong side of a whale |
| 8 | **The House** (event) | Every evening the #1 player becomes The House for an hour and must accept every challenger at their pot size, on the rolled coin. Beat The House, take their seat. | Phoenix | 1 h | The House can lose everything to the crowd |
| 9 | **Royale** | 10–50 players, same rolled coin, max leverage. Each round, whoever has the worst P&L is out. Last one standing takes the pot. | Phoenix | rounds of 60 s | elimination |
| 10 | **Clan War** | Clan chests trade together by vote; the clan with the best week takes the war pot. | Phoenix / Jupiter | 1 week | the clan chest |
| 11 | **Spectator stakes** | People watching a live duel back a side. Parimutuel pool among spectators, separate from the duel pot. | none (pool) | the duel | the side you backed |
| 12 | **Sprint** (the Bus game) | Everyone aboard the 2-minute Bus trades the same VRF-rolled coin for 3 minutes, any side, any leverage. Top 3 split the pot 60/30/10 (top 1 if fewer than 5). | Phoenix | 3 min | the pot + liquidation |
| 13 | **Tug of War** | The Bus splits riders into two random teams (VRF). Each team's score is its members' average %. The winning team splits the pot. Your clan badge shows; trash talk is team chat. | Phoenix | 3 min | the pot |
| 14 | **Daily Cup** | Async: one paid run any time today on a rolled coin; ranked against everyone's runs today; top 20% paid. | Phoenix | 3 min per run | the entry fee + liquidation |

## Why it's addictive (the loop)
- **Sessions in under 5 minutes:** quick match, play, rematch, all one thumb.
- **Near misses are shown:** "you lost by 0.4%". That's why people press Rematch.
- **Streaks and Double or Nothing:** the streak counter and payout ladder are always on screen.
- **The 10 degen ranks** (Exit Liquidity → The House), reset monthly; your rank badge sits next to your name in
  every chat.
- **Fresh content every minute:** Launch Snipe and Rug Roulette pull new pump.fun launches, so no two games are
  the same.
- **Social pressure:**
  - The duel button in every chat.
  - "rexx is back online, rematch?" push notifications.
  - Clan wars.
  - The House event at a fixed time every day.
- **Shareable moments:** an auto-made KO card (both avatars, the coin, the % and the receipt link) for X and
  Telegram.
- **Live everything:** opponent's P&L at 10 Hz, haptics on every tick against you, the KO burst on screen.

## Real revenue (per game, before venue costs)
| Source | Rate | Example |
|---|---|---|
| Pot rake | 3% (2% Clashy, 1% clan/server creator) | $20 + $20 pot → $1.20 rake |
| Jupiter integrator fee | 0.5% on meme buys/sells routed through Jupiter (Jupiter keeps 20% of it) | $40 of meme trades → $0.16 |
| Phoenix referral/builder fee | documented by Phoenix, not configured yet | counted as $0 until verified |
| Spectator pools | 3% of the pool | $100 pool → $3 |

## Honest problems (decide before building)
- **Real-money PvP betting is gambling in many places.** Apple and Google require gambling licences for real-money
  games, country by country. Plan: web app + Solana dApp Store first, geofenced; the iOS/Android store builds are
  practice-only until licensed.
- **"Lose everything" needs a floor of decency, or it will be called a scam.** Keep All-in opt-in per game with the
  hold-to-confirm, show the liquidation price before you confirm, and offer a daily loss limit in settings. These
  don't remove the risk; they make it a choice.
- **Fresh launches are mostly rugs.** Launch Snipe and Rug Roulette only roll coins that pass the safety checks
  (mint/freeze authority revoked, holder concentration, curve not near completion). Even then, losses will be
  frequent; that's the game, and the UI says so.
- **Slippage on fresh coins:** a room of 20 buying the same second moves the curve. Order of fills is set by the
  chain, not Clashy. Scores use each player's own fill, so whoever lands first gets the better price. Say so in the
  rules.
- **Signing at the bell:** see REAL-TRADES.md (session signer limited to closing Clashy positions, or stops at entry).
- **XORR overlap (clashy.md question 5):** Launch Snipe, Diamond Hands and Rug Roulette are memecoin trading, which
  is XORR's lane. Nick decides whether Clashy may do memes at all, and whether XORR code may be reused.
- **Blitz scope:** one week. Build 1 (All-In Knockout) and 2 (Launch Snipe) for the entry; the rest go on the
  roadmap screen, labelled "coming".
- **Money rule:** every game is rehearsed on a mainnet fork. Real funds only for the final recording.

## Build order for Blitz week
1. All-In Knockout on Phoenix (ER scoring, VRF roll, sealed picks, liquidation = KO).
2. Launch Snipe on the pump curve (VRF picks from the safety-checked fresh list).
3. The receipt screen and the KO share card.
4. Double or Nothing (a loop on top of 1, cheap to add).
5. Everything else: designs only, labelled "coming".
