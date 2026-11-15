# Clashy game design

Status: design (Nov 15 2026), for Nick's ask: "the best game design possible, with cool matchmaking". Builds on
[REAL-TRADES.md](REAL-TRADES.md) (venues and money) and [MINI-GAMES.md](MINI-GAMES.md) (the game list).
Decided (Nick, Nov 15, clashy.md Q8): build and rehearse real trades on a mainnet fork, then deploy the program on
Solana mainnet and the MagicBlock mainnet ER before recording and submitting ("we gotta be mainnet"). Real funds only
in the recorded duels; public real-money play is a separate switch (geofence + player protection).
Still open: clashy.md question 5 (memes / XORR code).

## 1. Pillars
1. **People, not the house.** Every game has a human on the other side. Clashy only takes a rake.
2. **Real fills.** Money games trade on real venues; the receipt proves it.
3. **One thumb, five minutes.** From opening the app to a finished duel in under five minutes.
4. **There is always someone to fight.** Matchmaking is the product (section 3).
5. **Every outcome is a story.** Wins, KOs and near misses become cards people post.

## 2. The core loop
```
open app → big FIGHT button (remembers your last pot and game)
  → matched in < 10 s (queue heat shown live)
  → coin roll: a 2 s slot-reel on the VRF result
  → pick side + leverage: 10 s, sealed until both lock
  → live duel: both P&Ls at 10 Hz, both KO lines, danger zone
  → KO or bell → receipt + share card
  → Rematch (both tap within 10 s) / Double or Nothing / Revenge / next
```
**Outer loops:** daily quests (minutes), The House event (daily), Clan War (weekly), ranked season (monthly).

## 3. Matchmaking
### 3.1 What you choose
- **Game:** All-In Knockout, Launch Snipe, Coin Clash, and so on.
- **Pot range, not one number:** a two-thumb slider, e.g. "$10 to $50". You are matched at the **highest pot
  inside both ranges**. A wide range matches fast; a narrow range is precise. **All-in** sets the range to exactly
  your whole balance.
- **Mode:** Ranked (rating moves) or Casual (no rating, same money).

### 3.2 How a match is found (the widening search)
| Seconds waiting | Rating window | Pot | What you see |
|---|---|---|---|
| 0–3 | your division ±1 | inside both ranges | "Finding a rival…" with the live queue count at your pot |
| 3–8 | ±2 divisions | same | rival cards flip past (real players in the queue) |
| 8–15 | ±4 divisions | same | "Hot pots right now: $20 (14 waiting), $5 (31)", one tap to switch |
| 15+ | any | same | The **empty-queue menu** (section 3.6): the next Bus, the Challenge Board, a Stand-in, or today's Cup |

- Never fake a match. No bots in money games, ever. If no one is there, say so and offer an open challenge, a
  friend link or a hotter pot.
- **Ties between candidates:** the longest-waiting player wins; then a MagicBlock VRF draw. The VRF proof is
  stored on the `Duel` account, so anyone can check the pairing wasn't rigged.

### 3.3 Skill rating
- **Glicko-2 per game family** (perps duels, meme games, rooms). It tracks rating and uncertainty, so new players
  move fast and veterans stay stable. Trading duels are part luck, so uncertainty is shrunk slowly and the rating
  window above is wide.
- **Visible rank = the 10 degen tiers** (Exit Liquidity → The House), driven by rank points (RP), not the hidden
  rating. RP gain and loss depend on the rating gap, **never on pot size**, so whales can't buy rank.
- **Placement:** your first 5 ranked games set your starting tier.
- **Rookie pool:** your first 10 money games only match other players in their first 10. Sharks can't farm new
  players on day one.

### 3.4 Other ways to start a duel
- **Challenge link / Solana Blink:** "rexx challenges you: $20, rolled coin, 3 min". Paste it on X or Telegram,
  and the other person accepts from the post with their wallet. That's viral matchmaking without a queue.
- **Chat duel button:** in any channel, challenges show up as a card anyone can take.
- **Rematch:** both tap within 10 s, same pot, new roll.
- **Revenge:** after a loss, *you* can send the winner a revenge challenge valid for 24 h. It's the loser's
  choice. Clashy never pushes a rematch at someone who just lost.
- **Clan matchmaking:** each week clans are paired within a clan-rating band, with a VRF draw among equals.
- **The House queue:** during the daily House hour, everyone queues against the current #1 at their own pot.

### 3.5 Fairness and anti-abuse
- **Sealed picks:** sides and leverage stay in the Private ER until both lock, so nobody can copy or fade the
  other side.
- **Same start:** both orders are released in the same ER tick at GO. Each player is scored on their **own real
  fill**. Fill order is the chain's, and the rules say so.
- **Self-dueling (one person, two wallets):** taking both sides guarantees one win per pot, minus the 3% rake.
  Defences:
  - RP for a repeated pair drops sharply (full, then 50%, then 0 within 24 h).
  - Wallets funded from the same source are flagged and their games don't count for rank or leaderboards.
  - Rake makes it a losing trade.
- **Disconnects:** your position lives on the venue with its stop at the KO line, and a session signer limited to
  closing Clashy positions closes it at the bell. Nothing depends on your phone staying online.

### 3.6 When nobody joins
The worst thing a PvP game can do is leave you staring at a spinner. Clashy never fakes a rival in a money game, so
it needs real ways to always have a game. After 15 s with no match, one sheet offers four, best first:

| Option | What happens | Why it works with few players |
|---|---|---|
| **1. Catch the Bus** | Rooms leave on a timetable: a Royale or Sprint lobby departs every 2 minutes ("next bus in 0:47, 6 aboard"). Whoever is aboard plays; a bus with one passenger refunds them in full. | Batches thin traffic into one game instead of many empty queues. |
| **2. Post to the Challenge Board** | Your duel becomes a public card: "$20 · rolled coin · 3 min · Degen tier". Your pot sits in escrow. Anyone can take it from the board, a chat or a Blink on X. You can close the app. | It's an order book of duels: challenges wait for takers like limit orders wait for fills. |
| **3. Hit a Stand-in** | Players who opted in as **Stand-ins** take your duel automatically (details below). | Real people's money, available even when they're asleep. |
| **4. Play today's Cup** | Async: pay the entry, play one run at any time today, and your real-fill % is ranked against everyone else's today. | Needs no one online at the same moment. |

Plus, always: **ping people who asked for it.** Players can opt in to "ping me for $10–50 SOL duels". Pings go only
to opted-in players, never to someone who just lost, at most a few a day.

**Expiry:** an open challenge lasts 30 minutes by default (you can pick 5 min to 24 h). If nobody takes it, the pot
comes back in full: no rake, no fee except the Solana transaction cost.

#### Stand-ins (player market makers)
- **What it is:** you post a standing offer, e.g. "auto-accept up to $25 a duel, any rolled coin, 3-minute duels,
  max 5 a day, stop after a $50 loss".
- **How a match happens:** when a challenger finds no one, the oldest matching Stand-in is matched (ties: VRF).
- **The Stand-in's side:** a VRF coin flip, sealed until GO. The Stand-in doesn't get the challenger's pick, and the
  challenger can't see the Stand-in's side.
- **Who trades:** the Stand-in's session signer can only open and close Clashy duel positions, inside the limits they
  set. Their stop sits at the KO line, so nothing needs them online.
- **Why anyone would:** Stand-ins earn rank points like any player, a Stand-in badge, and lower rake (2% instead of
  3%) on their duels.
- **Clans:** a clan can run a Stand-in from its chest, voted by captains: the "clan bouncer".

#### Daily Cup (async tournaments)
- **Entry:** a fixed fee: $1, $5 or $25 tiers.
- **Play:** one run per entry, any time in the UTC day. Same rules for everyone: a VRF-rolled coin per run, 3
  minutes, leverage up to the market max.
- **Payout:** the prize pool is all entries minus the 3% rake. The top 20% are paid on a fixed curve.
- **Fewer than 5 entries by the close:** everyone is refunded in full.
- **Practice runs are free**, and are labelled as practice.

#### Cold start (the first weeks)
- **Prime time:** The House hour and a big Bus every evening concentrate players in one window.
- **Creator rooms:** streamers and KOLs host Bus rooms and Board challenges; their followers join through Blinks.
- **Seeded Stand-ins:** the team and early supporters run real Stand-ins with their own money, shown with a
  "Team" badge. Never disguised as normal players.
- **Visible activity:** queue counts, the Board, live duels you can spectate and a recent-KO feed are all real
  numbers. When it's quiet the app says "quiet right now", not a fake crowd.

## 4. Game families (by length)
| Length | Games | Settles on |
|---|---|---|
| **60 s Blitz** | Arcade duel, 250–1000× score multiplier, practice and money | Oracle price (no venue order) |
| **3–5 min Rapid** | All-In Knockout, Coin Clash, Launch Snipe, Royale rounds | Phoenix / pump curve fills |
| **10–60 min Long** | Diamond Hands, Rug Roulette, Fade the Whale, The House hour | fills |
| **1 week** | Clan War | fills (clan chest) |

## 5. Feel ("juice")
- **Coin roll:** a slot-reel of coin logos that slows down and lands on the VRF result. A sound plus a haptic thunk.
- **Danger zone:**
  - Within 20% of your KO line, the screen edge glows red.
  - The haptic heartbeat speeds up as the price nears your line.
  - The rival's line glows when *they* are close, so you can feel a KO coming.
- **The KO:** the clay KO burst, a short screen shake and a voice line ("KNOCKOUT!", local Chatterbox voice).
- **Near miss:** "Lost by 0.4%", with the moment it flipped marked on the chart.
- **Spectators:** a live viewer count, emoji reactions flying across the duel, and the spectator pool size.
- **Streak flame:** grows each win and sits on your avatar everywhere.

## 6. Progression and rewards
- **Leaderboards** (three, never mixed):
  - Rank: RP.
  - Profit: real net P&L, from receipts.
  - Streak: longest run of wins.
- **Seasons:** monthly; ranks soft-reset two tiers down; season badge and avatar frame by final tier.
- **Daily quests:** e.g. "Win on BTC", "Survive 3 minutes at max leverage", "Win a Launch Snipe". Rewards are
  **cosmetics and badges, never money or free bets** (bonus money makes it a gambling promotion).
- **Cosmetics** are also revenue: clay avatar outfits, KO card frames, chat stickers, entrance animations.

## 7. Onboarding
1. Install and play 3 free Arena duels on live prices: no wallet, no money.
2. Connect a wallet (or an embedded one), then a one-time Phoenix account setup in the same flow.
3. First money duel at the minimum pot, in the rookie pool.
4. After 5 ranked games, placement shows your tier with the badge reveal.

## 8. Social
- Servers and channels per coin, the duel button in every chat, clan rooms.
- Spectate any live duel from chat or the home feed.
- Share cards auto-made for KOs, big wins, streaks and rank-ups. Each card links to the on-chain receipt.

## 9. Revenue
- 3% rake on every pot (2% Clashy, 1% clan or server creator).
- 3% of spectator pools.
- Jupiter integrator fee on meme routes (0.5%, Jupiter keeps 20% of it).
- Cosmetics.
- Phoenix referral or builder fee: $0 until set up and verified.

## 10. Player protection (Nick decides the defaults)
These are required for the stores and payment rails, and decent:
- 18+ only.
- Geofenced.
- Store builds are practice-only until licensed.
- The liquidation price is shown before every All-in.

Optional, with a recommended default:
- Daily loss limit: off by default, one tap to set; raising it waits 24 h.
- Cool-down after a losing streak: offered, not forced.

## 11. Blitz week slice (from Nov 20)
1. Matchmaking v1:
   - pot ranges with the widening search;
   - the empty-queue menu: Challenge Board with escrow + expiry refund, and the Bus every 2 minutes
     (Stand-ins and the Daily Cup come after Blitz);
   - VRF tie-break;
   - rookie pool;
   - challenge links;
   - Rematch.

   Glicko-2 can start as Elo.
2. All-In Knockout end to end: sealed picks in the Private ER, 10 Hz scoring, KO = stop, receipt.
3. Launch Snipe (if question 5 allows memes).
4. Feel: coin reel, danger zone, KO burst, share card.
5. Everything else is designed and shown as "coming".
