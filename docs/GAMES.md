# Clashy Games: 100 games on live prices

Status: built Nov 20, 2026. Every game is played with **practice money** (the Practice paper balance) on **live prices**
(Phoenix and Pacifica perps marks, about 110 markets: crypto, memecoins, US stocks, gold, oil, FX; plus Jupiter data
for pump.fun launches). Nothing is sent on chain. Games are against **Clashy Bot** (it picks at random, said plainly),
seven bots (party games), or solo with a fixed payout priced from live volatility.

Ideas: one Grok session (Expert mode, 5 rounds, 140 ideas, `grokbot/research/clashy-games/`), judged and merged into
21 engines. Games that need real crowds (spectator pots, crowd fades, live rooms) were dropped: there are no fake
players here.

## Code
| Path | What |
|---|---|
| `app/src/games/types.ts` | `GameDef`, `EngineId`, categories |
| `app/src/games/catalog.ts` | the 100 games |
| `app/src/games/feed.ts` | the shared live feed (`useFeed`, `feed.mark/fresh/since/moving`), pools, names and logos |
| `app/src/games/odds.ts` | volatility from ticks (`sigmaOf`), touch / stay odds, `payoutFor` (97% of fair), helpers |
| `app/src/games/kit.tsx` | `GameApi` and the shared pieces (Clock, MarketHead, MarketChart, Choice, Go, BotSays, MarketTile…) |
| `app/src/games/engines/*.tsx` | one file per engine, default export `({ g }: { g: GameApi }) => JSX` |
| `app/src/app/games/index.tsx` | the Games page (categories, search) |
| `app/src/app/games/[id].tsx` | one game: hero, engine, result card with receipt, How to play sheet, first-visit tour |

## The engine contract
The game screen renders `<Engine key={round} g={g} />`; a new round remounts the engine, so plain `useState` is the
round state.

- `g.phase`: `'setup'` → the engine shows its choices, `{g.stakeRow}` and its start control. `'live'` → the round.
  `'done'` → the final state stays on screen while the result card shows below.
- `await g.begin(endsAt?)` takes the stake. It returns false and shows the reason itself when it can't (no balance).
  Read the entry price(s) **before** calling it and refuse to start on a stale price
  (`g.feed.fresh(sym)` false → `g.fail('Waiting for a live … price.')`).
- `g.end(mult, verdict, lines)` settles: payout = stake × mult (0 lost, 1 push, 2 a win against Clashy Bot, any
  fixed multiplier for solo games). `verdict` is one short sentence. `lines` is the receipt: `[label, value][]` with
  real prices (entry, price at the bell, move…).
- `g.abandon(why)` refunds when there's no fair way to settle. Use it if no fresh price arrives within 15 s of the bell.
- Settle on the **first tick at or after the bell**: `const m = g.feed.mark(sym); if (Date.now() >= endsAt && m && m.t >= endsAt) …`.
  Run the bell check in a `useEffect` with no deps (the feed re-renders every 1.5 s and `useClock` every 200 ms), guarded
  by a `useRef(false)` so it settles once.
- Pools: `useLivePool(def.pool)` returns the symbols with a fresh price. Roll with `pick` / `sample` from `odds.ts`.
- Tour targets (each game's first-visit tour lights these, in this order): wrap the decision area in
  `<TourTarget id="g-pick">` and the start control in `<TourTarget id="g-go">`. The stake row already has `g-stake`.
- Look: Clashy's dark game look. Use the kit pieces and `def.tint` for the game's colour. Green `C.up` / red `C.down` only
  for up/down and profit/loss; Clashy Bot is pink `C.opp`. No new fonts. Every control at least 44 px tall.
- Copy: short and plain. No explanations of maths on screen: one `Note` line at most. The How to play sheet has the rules.
- No fake data: every number comes from the feed, the catalog data or the bot's random pick.

## Engines and their settings (`def.p`)
| Engine | Play | `p` |
|---|---|---|
| updown | one market, Up or Down; bot takes the other side; 2× | `roll` (default true; false = choose from the pool), `blind` (market hidden until the bell), `lev` (show P&L at this leverage) |
| race | a lineup; pick one; bot picks another; best by the metric at the bell wins 2× | `n` lineup size (2–9), `metric`: `up` (best gain, default), `down` (biggest drop), `abs` (biggest move either way), `quiet` (smallest move); `pairs`: curated pairs (lineup = one random pair) |
| range | a band around the entry | `mode`: `stay` (STAY vs BREAK: two-sided band at even odds, ends early on a touch), `side` (which edge breaks first: UP vs DOWN; no break → push), `bell` (CALM vs WILD: is the move at the bell bigger than an even-odds size) |
| touch | solo: pick a target ring up or down; touch it before the bell; payout from live odds | `rings` (default 3), `dir`: `both` / `up` / `down` |
| cashout | solo: a leveraged position as a live multiplier (1 + lev × move); cash out any time; busts at 0 | `lev`, `side`: `long` / `short` / `choose`; `vsBot` (bot cashes out at a random moment; the higher cash-out wins 2×); `rungs` (cash-out only allowed at these multipliers, e.g. [1.2,1.5,2,3]) |
| survive | solo: pick leverage; no liquidation by the bell pays live odds | `levs` (choices), `side`: `choose` / `both` (liquidation either way) |
| guess | slider guess vs bot's guess; closer wins 2× | `mode`: `bell` (the move at the bell), `peak` (the highest move during the round, closest without going over), `price` (the price at the bell) |
| streak | solo: back-to-back quick calls; each right call grows the pot by `step`; cash out between calls; a miss loses it | `roundSecs`, `step` (e.g. 1.9), `mode`: `same` / `reroll` / `choose`; `rounds` (gauntlet: a fixed number of calls, pays only if all are right) |
| podium | order `n` markets by the move at the bell | `n` (3–5); payout table with expected value ≤ 1 (exact order pays most) |
| draft | draft `k` of `n`; bot gets `k` random (or alternating picks); better average move wins 2× | `n`, `k`, `snake` |
| snipe | tap once inside the window to buy the dip (or sell the top); bot taps at a random moment; closer to the window's low (high) wins 2× | `side`: `buy` / `sell` |
| compare | instant: two markets, which did better today (signed 24 h change; or bigger cap, deeper liquidity, more holders); right grows the pot by `step`; cash out any time | `metric`: `ch24` / `mcap` / `liquidity` / `holders`; `step` |
| capguess | instant: one pump.fun coin, is its market cap (holders, price) above or below a number; chain and cash out | `metric`: `mcap` / `holders`; `step` |
| ko | leveraged 1v1: you pick side and leverage, bot takes the other side at the same leverage; first liquidated loses; else P&L at the bell | `levs` |
| royale | you and 7 bots, 3 hearts each; a call every `callSecs`; a wrong call costs a heart; last one standing wins (bots + 1) × 0.97 = 7.76× (shared on a tie); calls close halfway through each window and the second half decides it, so nobody can watch the move and then call | `hearts`, `bots`, `callSecs` |
| flip | open a side; flip it once at any moment; bot flips at a random moment (or not); the better P&L at the bell wins 2× | `lev` |
| addonce | solo: open a leveraged side; one tap doubles it at the current price; payout = the position's value at the bell (0 if liquidated) | `lev` |
| bingo | a 3×3 card of price events on 3 markets; a line before the bell pays live odds (Monte Carlo from live volatility) | `markets` (default 3) |
| bracket | eight markets, quarter-finals to a final, decided by the move at the bell; call every match; more right calls than the bot's random bracket wins 2× | `n` (8) |
| elim | `n` markets; every `every` seconds the worst since the start is knocked out; you and the bot each back one; whose market lasts longer wins 2× | `n`, `every` |
| leader | from the last 5 minutes, the leader and laggard of `n` markets; CHASE (the leader stays ahead over the round) or FADE (the laggard gains on it); bot takes the other side | `n` |
