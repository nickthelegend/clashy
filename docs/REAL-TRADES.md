# Clashy with real trades: where the liquidity comes from

> **Planning document, not a status report.** What is built and tested is listed in the README, `chain/TESTING.md` and
> `docs/MAGICBLOCK.md`; anything described here and not listed there is not built yet.

Status: design (Nov 15 2026). Program code starts at the Blitz kickoff (Nov 20). Nick asked for real trades on real
liquidity instead of only oracle-settled duels, so Clashy is a product and not just a game.

## The idea in one line
Each player's duel position is a **real order on a real Solana venue**: Phoenix perps for long/short, pump.fun's
bonding curve or Jupiter for memes. Clashy runs the duel around it: matchmaking, the VRF coin roll, the live
scoreboard and the pot.

## Two layers of money
| Layer | What it is | Where it lives | Who keeps it |
|---|---|---|---|
| **Your trade** | A real position you open with your own collateral | Your own Phoenix account (perps) or your own wallet (memes) | You. Profit and loss are yours, win or lose the duel. |
| **The pot** | Both players put in the same amount | Clashy escrow PDA on Solana | The duel winner, minus the 3% rake |

The winner is whoever has the better **real** P&L % at the bell. Trading fees are the same % for both players
(same coin, same notional per $ of margin), so they don't change who wins.

## Venues (live numbers, read from Phoenix's API on Nov 15)
| Mode | Venue | Liquidity | Leverage | Fees |
|---|---|---|---|---|
| Knockout duel (long/short) | **Phoenix perps (Rise)**, mainnet | Order book. 24 h volume: BTC $16.9M, SOL $7.5M, HYPE $3.1M, ETH $1.9M | SOL 25×, ETH 25×, BTC 40×, memes (PUMP, FARTCOIN, JUP) 10× | taker 0.035%, maker 0.005% of notional |
| Meme race (buy only) | **pump.fun bonding curve** via `@pump-fun/pump-sdk`; after migration **Jupiter Swap V2** (PumpSwap, Raydium, Meteora) | The curve or the pool | none (spot) | curve protocol + creator fees, quoted exactly by the SDK; Jupiter integrator fee is our revenue |
| Other launchpads | Meteora DBC, LetsBonk, etc. | Through Jupiter once routable | none | Jupiter integrator fee |

XORR already has working, tested adapters for all of these (`xorr-v2/server/src/venues/perps/phoenix.ts`,
`venues/memes/trade.ts`, `venues/jupiter.ts`). **Open (clashy.md question 5, waiting on Nick):** reusing them
clashes with the rule that Clashy doesn't overlap XORR (Nick's Dec 5 perps/memes entry), and Blitz says to build
during the event. No XORR code is copied into clashy/ until Nick decides; the alternative is fresh adapters
written after the Nov 20 kickoff against the venues' public SDKs.

## How a real Knockout duel runs
1. **Queue.** You pick the pot size ($5 / $20 / $50) and your margin. The pot goes into escrow.
2. **Match + roll.** MagicBlock VRF rolls one coin from Phoenix's liquid markets (SOL, BTC, ETH, HYPE, plus
   10× memes). Both players see the same coin.
3. **Pick.** Long or short, and leverage up to that market's max. 10 s, sealed in the Private ER until both lock.
4. **GO.** Both orders go to Phoenix at the same moment as market orders, each with a stop-loss attached (the
   knockout line). The fills set each player's real entry.
5. **Live.** The ER ticks both P&Ls from Phoenix's mark price at 10 Hz. If a stop triggers on Phoenix, that player is
   knocked out.
6. **Bell.** Both positions close. The ER scores the real fills, commits the result to Solana, and the escrow pays
   the pot.

## Honest problems to solve first
- **Leverage is far lower than the arcade.** Real venues stop at 25–40× on majors and 10× on memes, not 1000×. A KO
  line at 25× sits 4% away, which SOL rarely moves in 60 s.
- **60 s at 25× is mostly fees.** A typical 60 s SOL move is about 0.1%, so ±2.5% of margin. The round-trip taker
  fee is 0.07% of notional, so 1.75% of margin. Fees don't change the winner, but both players usually lose a little.
  **Recommendation:** real duels run 3 or 5 minutes; keep the 60 s 1000× duel as the arcade mode on the oracle.
- **Signing at the bell.** Closing on time needs a signature at 0:00. Options: an embedded wallet with a policy that
  may only close Clashy's own positions (Privy session signers, as XORR uses Privy); or a stop + take-profit pair
  placed at entry so the venue itself closes; or the player taps Close. Check on day 1 whether Phoenix supports a
  trading delegate.
- **Phoenix onboarding.** Each player needs a registered, funded Phoenix account. XORR's onboarding builds already
  simulate; it adds one step to first use.
- **Meme races are long only.** No shorting on a bonding curve. Slippage and curve fees are large on 60 s, so meme
  races run 5–15 minutes, with XORR's safety checks (authorities, holders, LP) before a coin can be rolled.
- **Jurisdictions.** Phoenix and MagicBlock's Private ER both screen at ingress; check from Nick's location on day 1.
- **Hackathon rule.** Blitz says ordinary transfers and swaps don't count. The real orders are not the entry; the ER
  duel engine around them is (VRF roll, sealed picks, 10 Hz scoring, settlement). Keep that front and centre.
- **Money rule (decided by Nick, Nov 15):** "real trades on fork, real funds only for recording" and "we gotta be
  mainnet before we do". So:
  1. build and rehearse every real trade on a mainnet fork (Surfpool or a validator with cloned accounts);
  2. deploy the program on Solana mainnet and the MagicBlock mainnet ER before recording and submitting;
  3. use real funds only in the recorded duels, with the smallest stakes the venues allow;
  4. public real-money play is a separate switch (geofence + player protection), off for Blitz.

## Revenue
- 3% rake on every pot (2% Clashy, 1% clan or server creator).
- Jupiter integrator fee (`platformFeeBps`) on every meme and spot route.
- Phoenix referral or builder fee: documented by Phoenix, not configured anywhere yet; verify before claiming it.

## Modes after this change
| Mode | Settles on | Length | Leverage |
|---|---|---|---|
| Arcade duel (today's quick match) | Oracle price, no venue order | 60 s | 250–1000× (score multiplier only) |
| **Real duel** | Phoenix fills | 3–5 min | up to the market max (25–40×) |
| **Meme race** | pump.fun curve / Jupiter fills | 5–15 min | spot |
| Coin clash | Either, per the room | same as its base mode | same |

## Recommended order
1. Day 1–2: arcade duel on the ER (unchanged plan), since it's what Blitz judges.
2. Day 3–4: real duel on Phoenix, on a mainnet fork, reusing XORR's adapter; one real recorded duel at the end.
3. Day 5: meme race through pump-sdk / Jupiter on the fork.
4. Landing and app copy: "Real trades on Phoenix. Your P&L is yours; the pot goes to the winner."
