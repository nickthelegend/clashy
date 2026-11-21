# Clashy game kit

Every Clashy game is built from one kit: `app/src/games/kit/`. A new game needs one import:

```ts
import { Panel, Choice, Go, PxChart, Clock, useRolled, useClock, bellPrice, pTouch, payoutFor, type GameApi } from '../kit';
```

The kit re-exports the odds (`../odds`) and the live feed (`../feed`) too. To see every piece live, open **/games/kit**.
The engine contract (phases, `begin` / `end` / `abandon`, settling on the first tick after the bell) is in
[GAMES.md](GAMES.md).

## Add a game (2 minutes)

1. Pick an engine (the table in GAMES.md) and add one line to `SPECS` in `app/src/games/catalog.ts`:
   ```ts
   ['gold-grid', 'Gold Grid', 'Tap the gold tape.', 'tapgrid', 'perps', 'commodities', 30, T.gold, { cols: 5, colSecs: 5 }],
   ```
   The fields are, in order:
   - id
   - name
   - hook: one line that sells it
   - engine
   - category
   - pool: a pool name, pool names, or exact symbols
   - round length in seconds (0 for instant)
   - tint
   - engine settings
   - extras: `{ badge: 'New' }`
2. That's all. How to play comes from `rules()`, which builds it from the engine and its settings. The card, hero, tour,
   result card and stats come with it, and the Games page counts it.

## Add an engine (a new way to play)

1. Add its id to `EngineId` in `games/types.ts`, with a one-line comment.
2. Copy `engines/_template.tsx` to `engines/<id>.tsx` and register it in `engines/index.ts`.
3. Give it art in `games/art.ts`: a soft-clay icon, `assets/art/game-<id>.webp`, 512 px, transparent.
4. Add its How to play to `rules()` in `catalog.ts` and its two tour lines (`pick`, `go`) to `GUIDE` in `tour/games.ts`.
5. If it is solo, add it to `vsOf` in `catalog.ts`.
6. Wrap the decision in `<TourTarget id="g-pick">` and the start control in `<TourTarget id="g-go">`. The stake row
   already has `g-stake`.

## Tokens (`kit/tokens.ts`)

These sit on top of Clashy's `C` and `FONT` in `@/ui/tokens`.

### `GT` colours

| Token | Use |
|---|---|
| `GT.panel` `#111116` | panels, game cards, waiting boxes |
| `GT.hero` `#100F15` | hero and hot-card base, with the tint glow on top |
| `GT.result` `#0F0F14` | result card |
| `GT.raised` `#15151B` | tiles, unselected choices, stat tiles |
| `GT.selected` `#221D33` | selected market tile |
| `GT.chip` `#1C1A25` | info chips |
| `GT.pill`, `GT.pillPressed` | secondary pills |
| `GT.pressed` | pressed secondary buttons |
| `GT.stake` | stake chips |
| `GT.bot` | Clashy Bot's line |
| `GT.track` | clock and progress tracks |
| `GT.grid` | chart grid lines |
| `GT.hair` | hairlines |
| `GT.onTint` `#0A0A0D` | text on a solid tint |
| `GT.gold` | rank #1 and jackpots |
| `GT.hot` | the Hot badge |
| `GT.warn*` | the yellow banner |
| `GT.sub`, `GT.subCard` | secondary text on heroes and cards |
| `GT.you` (lavender), `GT.opp` (pink), `GT.up`, `GT.down` | who's who, and up/down or profit/loss |

### `GS` shapes and sizes

- **Radii:** hero 28, card 24, tile 20, stat 16, chip 10, tag 7.
- **Heights:** Go 58, pill 44, stake chip 44, choice 96, tile 104, result buttons 52.
- **Tint glow opacity:** hero 0.14, hot card 0.18, card 0.12.

### `TINTS`

The 14 game colours: gold, pink, green, sky, lav, orange, coral, cyan, purple, yellow, mint, rose, aqua, violet.

### Rules for the look

- Near-black clay arcade. Each game brings one colour (`def.tint`).
- Green and red only mean up/down or profit/loss.
- You are lavender, Clashy Bot is pink.
- Every control is at least 44 px tall.
- No new fonts.
- No maths on screen: one `Note` line at most. The rules live in How to play.

## Pieces

### The round (`kit/round.ts`)

| Piece | What |
|---|---|
| `useClock(endsAt)` | seconds left, ticking 5× a second |
| `bellPrice(g, sym, endsAt)` | the first price at or after the bell; `'wait'` until it comes, `'quiet'` after 15 s with none (then `g.abandon`) |
| `bellPrices(g, syms, at, ref)` | the same for several markets |
| `readEntries(feed, syms)` | every entry price, or the first stale one |
| `captureAt(store, feed, syms, t)` | first price at or after any moment (a leg, a cut) |
| `roundPath`, `pathOf` | a market's ticks since the entry |
| `QUIET_MS` | 15 000 |

### Markets (`kit/markets.ts`)

| Piece | What |
|---|---|
| `useRolled(g)` | a market rolled from the game's pool once it has a live price, with the slot-machine moment and `reroll` |
| `rollMarkets(feed, live, n)` | `n` markets, preferring ones that are really moving |
| `rollable(g, live, need)` | the moving ones when there are enough |
| `poolList(def.pool)` | the pool as symbols |
| `useRoll(pool, landed)` | the slot-machine flicker |
| `useMemes()` | pump.fun coins from Jupiter |
| `Side`, `dirOf`, `otherSide`, `sideWord`, `sideColor`, `sideGlyph` | long and short |

### Real past candles (`kit/candles.ts`)

| Piece | What |
|---|---|
| `loadGameCandles(sym, '1m' \| '5m', n)` | the last `n` closed candles: Phoenix mark candles, Pacifica for the markets only Pacifica lists |
| `useGameCandles(syms, tf, n, need)` | several at once, with an error once fewer than `need` load |
| `pickWindow(sym, tf, all, show, hide)` | a random stretch of history with what came next hidden |
| `candleSyms`, `candleTime` | helpers |

### Settings (`kit/settings.ts`)

`pNum`, `pBool`, `pStr`, `pNums`: read `def.p` with a default.

### Formats (`kit/format.ts`)

- **Money and prices:** `usd`, `fmtPx`.
- **Time:** `fmtSecs`, `lengthOf` (the card's clock), `lengthLabel`, `secsIn`.
- **Moves:** `mv` (a move with enough digits), `absPct`, `fmtPctUnits`.
- **Names:** `mktLine` ("Bitcoin (BTC)").
- **Big numbers:** `nice`, `fmtCompactUsd`, `fmtCount`, `fmtMetric`.
- **Numbers:** `clampInt`.

### Odds (`games/odds.ts`, re-exported)

| Piece | What |
|---|---|
| `sigmaOf(feed, sym, fallback)` | volatility from the last 10 minutes of ticks |
| `fallbackSigma(sym)` | a fallback before there are enough ticks |
| `pTouch(d, σ, secs)` | the chance of touching a level `d` away |
| `pStay(d, σ, secs)` | the chance of staying inside ±`d` |
| `evenBand`, `evenMove` | sizes with even odds |
| `payoutFor(p)` | 97% of fair, from 1.01× to 50× |
| `fmtX`, `fmtPct`, `signedPct`, `pick`, `sample`, `phi` | helpers |

### UI (`kit/ui.tsx`)

**Markets**

| Piece | What |
|---|---|
| `Logo` | a market's real logo, a stock wordmark, or its initial |
| `MarketHead` | logo, name, price and the move since the entry |
| `MarketTile` | a lineup tile: logo, ticker, live move; rank, a mark, selected |
| `RolledPanel` | the setup's market card with Roll again |
| `MarketChart` | the live line with the entry (`LiveChart`) |

**The round**

| Piece | What |
|---|---|
| `Clock` | big seconds and a bar that empties; red in the last 5 s |
| `Panel` | the dark rounded panel; `tint` outlines it |
| `Choice` | a big choice button (UP / DOWN, a lane, a side) |
| `Go` | the one primary button, with a glow |
| `Pill` | a small secondary button |
| `BotSays` | Clashy Bot's line, with its avatar |
| `StakeRow` | the stake chips (already in `g.stakeRow`) |
| `Waiting` | the waiting box, with optional progress |
| `PotBar` | streak, pot and Cash out, for instant games |

**Labels and numbers**

| Piece | What |
|---|---|
| `Note` | the one grey line |
| `Tag` | YOU, BOT, a side |
| `BigNumber` | the big number in the middle of a round |
| `StatTile` | label over value; put several in a row |
| `StatLine` | label / value on one line |
| `Sides` | the YOU and CLASHY BOT cards; the leader is outlined |
| `CountUp` | a number counting up for a reveal |
| `Heart` | a life |

**Inputs**

| Piece | What |
|---|---|
| `Slider` | a draggable value from `min` to 1; pointer and touch, accessible |
| `Ruler` | a number line with marks on it |

### Charts (`kit/chart.tsx`)

- **`PxChart`:** the live line with any number of level lines (`Level`), a shaded band, tap dots (`Dot`), a pulsing
  live point and a price tag. It scrubs. `until` freezes it at the bell. A level far off is pinned to the edge.
- **`CandleChart`:** real OHLC candles. `hidden` candles sit behind a curtain until `reveal`, and `levels` can be drawn
  across. `labels={false}` hides prices (for Who's That Chart).

### Screen pieces (`kit/screen.tsx`)

| Piece | What |
|---|---|
| `HotCard` | the big card in the Hot carousel |
| `GameCard` | a game in the grid |
| `GameChip` | the art-and-name chip in "Jump back in" |
| `Badge` | HOT, NEW, FAST |
| `InfoChip` | length, opponent, category, your record |
| `BalancePill` | the practice balance; opens Practice |
| `CategoryChips` | the chips with counts; the selected one is white |
| `GameHero` | a game's hero, with your record |
| `MarketClosedBanner`, `WarnBanner`, `usMarketOpen`, `isStocky` | the US-market-closed banner |
| `RulesSheet` | How to play |
| `ResultCard` | YOU WON / LOST / PUSH, the P&L, the verdict, the receipt, More games and Play again |
| `vsLabel`, `catLabel`, `openGame` | helpers |
