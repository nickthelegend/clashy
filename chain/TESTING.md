# Testing

Every on-chain test runs against real validators: the real Clashy program, MagicBlock's delegation program and a real
MagicBlock validator (1.1.1) as the rollup, with live Coinbase prices or MagicBlock oracle prices. Nothing is mocked or
stubbed, with one exception: the 50× liquidation test stages a price with the crank key (a real on-chain write, but not
a live price; it needs a Clashy-owned feed). Stakes are USDC (the local fork's USDC mint at mainnet's address, or
Clashy's test USDC on devnet), and every test player holds USDC and **0 SOL**: the sponsor pays all fees and rent, and
the tests assert the players' SOL balance is still exactly 0 at the end.

The test runs write their logs to `.localnet/` (gitignored). Every log cited in these docs is copied, unedited apart
from stripped colour codes and home paths, to [`evidence/`](evidence/): local `run-all.log` and `suite-*.log` (from
`run-all.sh`), devnet `devnet-*.log` and the on-chain trails `devnet-proof*.txt`.

All of the local suites below, plus the social server, were re-run on Nov 26, 2026 and passed (56 tests, 0 failures);
see [../TESTING.md](../TESTING.md) and the `evidence/*-nov26.log` files. The table keeps the earlier results.

| Suite | Command | Count | Last result |
|---|---|---|---|
| Program unit tests (math, chest shares, price scaling, a real MagicBlock oracle account) | `cargo test -p clashy --lib` | 13 (12 `#[test]` in `math.rs` and `price.rs`, plus the id check `declare_id!` generates) | 13 pass (Nov 25, 2026; `run-all.log`) |
| MagicBlock: cranks, keeper, Magic Actions, private picks | `npx tsx --test --test-concurrency=1 tests/magicblock.test.ts` | 4 | Local: 4 pass (Nov 25, `suite-magicblock-cancel.log`, with the crank-cancel checks). Devnet TEE: 4 pass in one run after upgrade `3LJSPdfk…` (Nov 25, `devnet-mb-cancel.log`); earlier the same day 4 pass over two runs (`devnet-mb-test.log`, `devnet-private.log`) |
| End-to-end on the local MagicBlock stack | `npx tsx --test --test-concurrency=1 tests/clashy.test.ts` | 5 | 5 pass in one run (Nov 25, `suite-clashy-cancel.log`, after the crank-cancel change). Earlier: four in `suite-clashy.log`, where the VRF test timed out before its fix, then the VRF test alone (`c-vrf.log`, VRF roll 1,083 ms) |
| Perps clash (leverage and liquidation) | `npx tsx --test --test-concurrency=1 tests/perps.test.ts` | 3 | 3 pass (Nov 25, `suite-perps.log`, again in `suite-perps-cancel.log`): a 25x long vs 25x short records leverage and pays 25x the move (BTC moved 1.79 bp, P&L ±44 bp; in the Nov 26 run SOL did not move, so that check compared 0 to 0); a 50x long is liquidated by a 2.5% drop mid-clash (staged price) and loses to a 10x short, which takes 9.7 USDC; leverage above 100x is refused at reveal |
| Names, limits, Stash, calls and chat, squads | `npx tsx --test --test-concurrency=1 tests/brief.test.ts` | 9 | 9 pass (Nov 25, `suite-brief.log`, again in `suite-brief-cancel.log`), including the 0.5% Stash fee: buy fee 0.05 USDC, sell fee 0.024865 USDC, both to the treasury. The Orca NVIDIA buy runs on the local stack against a mainnet snapshot of the five xStock Whirlpool pools (passed Nov 26, `suite-brief-nov26.log`); it fails on devnet, which has no xStock pool |
| Void | `npx tsx --test tests/void.test.ts` | 1 | 1 pass (Nov 25, `suite-void.log`, again in `suite-void-cancel.log`): a live duel nobody finishes is voided after the grace and both stakes are refunded, no rake |
| Sponsor relay | `npx tsx --test tests/sponsor.test.ts` | 5 | 5 pass (Nov 26, `suite-sponsor-nov26.log`), including the sponsored `init_player` for a wallet with 100 USDC and 0 SOL. Tests: refusals (other fee payer, admin/feed instructions, sponsor in a player slot, wrong layer, SOL transfer, non-USDC account), USDC withdrawals only from your own account, a forged Privy token refused by Privy's own check, and a real sponsored `init_player` for a 0-SOL wallet. Two need Privy or faucet keys. On devnet (Nov 22, `devnet-test-2.log`) 4 passed and the sponsored `init_player` test failed |
| Practice clash vs Clashy Bot | `npx tsx --test tests/practice-clash.test.ts` (localnet + crank running) | 5 | 5 pass (devnet, Nov 22, `devnet-test-2.log`): classic pays the right call the stake, same calls or no move are a dead heat; perps moves leverage × the move of the stake, capped at the stake; a 4% move at 25x knocks a side out, 3.9% does not; the bot always takes the other side; the SOL/BTC/ETH rollup feeds are live and the crank pushes a newer price within 2.5 s |
| Practice order-book perps (Phoenix, Pacifica) | `npx tsx --test tests/markets.test.ts` (relay running) | 7 | 7 pass against the live venues (Nov 25, `suite-markets.log`): the relay refuses off-list reads; overlapping Jupiter price reads all answer with live prices; Phoenix lists active markets with fees and leverage caps; a $5,000 SOL order walks Phoenix's live book; Phoenix funding and candles are real; Pacifica lists perps and its fee tiers; a $20,000 BTC order walks Pacifica's live book. Fill prices change with every run |
| Social server | `cd server && npm test` | 4 | 4 pass on SQLite (Nov 26, `social-nov26.log`); on Postgres 16 on Nov 19 per docs/AUDIT.md (no log stored) |
| Mainnet-fork trade on Phoenix | `npx tsx scripts/fork-trade.ts 1` | 1 | sold 1 SOL for 54.660103 USDC, book expected 54.660103 (`.forknet/last-trade.json`, gitignored: not stored in the repo) |
| App on-chain private duel on devnet, two device wallets | scripted browser run of the web app | 1 duel (Nov 25), then a duel, a Royale and a squad war (Nov 26) | Nov 25: ETH, B was paid 9.70 USDC (net +4.70 on a 5 USDC stake), A lost 5; 100 transactions, 88 on the rollup (`evidence/devnet-proof.txt`). Nov 26: `evidence/devnet-proof-nov26.md` |
| App on devnet, Nov 27 | the app (the build used for the SOL duel and Royale is not recorded), then iOS Simulators with device test wallets; the demo film's duel and squad rematch were played in the Clashy web app (devnet build) added to the iOS home screen, not a native build | 3 duels, 1 Royale, 2 squad wars and a rematch | Private SOL duel, 101 txs (`evidence/devnet-proof-nov27-duel.txt`); 3-player Royale, 112 txs, 21 `CallRoundSession` (`-royale.txt`); an earlier iOS Simulator BTC duel (not in the current film), 94 txs, 82 on the rollup (`-ios-duel.txt`); squad war, 19 txs (`-ios-squad-war.txt`); the film's private SOL duel, 96 txs, 86 on the rollup, 61 crank ticks, 2 `LockPickSession`, Ben paid 9.70 USDC (net +4.70 on a 5 USDC stake) (`-ios-duel2.txt`); the film's squad war and rematch, 27 Solana txs: the first war (13) and the rematch (14, 10:38:01–10:41:03 UTC) (`-ios-squad-rematch.txt`) |
| App on-chain duel, clan, clan war and Royale on the local stack | manual multi-tab browser runs (no spec file is committed) | 5 duels, 1 clan flow, 2 wars, 2 Royales | Nov 16: all settled with no errors. Kept as notes, not as logs |

## Local stack

```bash
bash scripts/localnet.sh          # base :8999 (mb-test-validator + committor), ER :7799, deploys the program
npx tsx scripts/crank.ts          # only needed for the app; the tests run their own crank
```

## End-to-end tests (`tests/clashy.test.ts`)

1. **Knockout duel:** open → join → roll → sealed picks → live on the ER (checks signed by the sponsor alone) → settle
   with rake and Elo; the vault closes and its rent returns to the sponsor. Last run (Nov 26, `suite-clashy-nov26.log`):
   BTC, joiner won, settled by the Magic Action, USDC 95 / 104.7, ratings 984 / 1016.
   (A run before the precision fix scored a 0.38 bp BTC move at 50× as 0/0; P&L now applies leverage before
   dividing.)
2. **Challenge board:** an unmatched challenge refunds the full 5 USDC (no fee, no rake), joining your own challenge is
   refused, a stake cannot be paid from someone else's USDC account and a refund cannot be redirected to another
   wallet's (`ConstraintTokenOwner`).
3. **MagicBlock VRF:** with `vrf_required = true` the commit-reveal roll is refused (`VrfRequired`), a callback signed
   by anyone but MagicBlock's VRF identity is refused, and a real request to MagicBlock's VRF program is answered by
   their `vrf-oracle`; only a player of the duel can request the roll (`NotPlayer`). Last run: SOL rolled in 1,083 ms
(`c-vrf.log`, Nov 25, after the `VRF_IDENTITY` fix).
4. **Clans and wars:** chest deposits, deposit-weighted votes, the captain executes and closes at the Solana base-feed
   price (Clashy's crank feed, not MagicBlock's oracle), and the war settles to the better return. The rollup feed's stale Solana copy is refused (`FeedInvalid`); the trade
   reads the crank's base feed. After the war a member cashes out all their shares for exactly their pro-rata part,
   and a war stake over half the chest is refused (`WarStakeTooBig`). Run of Nov 25 (`suite-clashy.log`): long SOL 5× at 67.67 → 67.57
   (P&L -0.09125 USDC), war -30 vs 0 bps so the other clan won; the member who put in 10 of 30 USDC cashed out exactly
   8.333333 USDC of the 25 USDC chest left after the lost 5 USDC stake. Leaving returns the member account's rent to
   the sponsor, never to the member (`PayoutMismatch`).
5. **Royale tournament:** entries escrowed, calls and rounds on the ER, survivors split the pot. Last run (Nov 25,
   settled by the Magic Action): lives 1 / 0 / 0, so one survivor took 5.82 USDC (6 USDC pot minus 3% rake). A payout list with a swapped token
   account is refused (`PayoutMismatch`).

## MagicBlock tests (`tests/magicblock.test.ts`)

1. **Cranked duel:** after the start nobody sends a transaction; crank ticks score the duel, the keeper commits it and
   the Magic Action pays it. Local: SOL, settled 30.7 s after the start, keeper ticks 0 → 31. Devnet TEE: BTC,
   settled 31.6 s after the start, keeper ticks 306 → 337. The finishing tick cancels the crank: tests 1 to 3 find the
   cancel in its logs and check that no failed tick follows it in the next 8 s.
2. **Cranked Royale:** `tick_round` resolves each round at its bell and the Magic Action splits the pot. Local and
   devnet: lives 1 / 0 / 0, the survivor paid 5.82 USDC, no resolve or settle by hand. The test asserts that player 1
   made every round call through a MagicBlock session key (`call_round_session`); the logs do not print the calls (the
   Nov 26 in-app Royale trail shows 12 `CallRoundSession` transactions). The earlier local run predates session keys.
3. **Private duel:** picks locked in the Private Ephemeral Rollup; a player cannot write the rival's pick; no start
   before both locks; picks are copied into the duel at the start; the clash settles itself. On the devnet TEE the
   test also reads each pick as each player: A's authenticated connection sees A's side, B's sees nothing
   (`devnet-private.log`, again in `devnet-mb-cancel.log`). The local validator is not a TEE, so locally only the permission account is checked.
4. **Keeper abuse:** an outsider cannot create or delegate the keeper.

The suite first checks that the local Solana clock is within 120 s of the wall clock. A local validator starved of CPU
falls behind (on Nov 25 it fell 942 s behind), and the rollup, which keeps wall time, then sees the pick deadlines as
passed and refuses the picks with `StepClosed`.

Tests 1 to 3 assert there was no manual settle. In `clashy.test.ts`, `perps.test.ts` and `void.test.ts`,
`settledByAction` falls back to a manual settle after 30 s and still passes; their logs show "(settled magic action)"
where the action paid.

Running the crank for the app on the local stack (Nov 18) caught a limit: the rollup sponsored only 10 commits per
delegated account, which broke the crank's 30-second feed commits after five minutes. Solana-side reads now use base
feeds (see README). This has not been re-tested on the devnet TEE.

## Attack tests

Inside the suites above: an outsider cannot delegate a rolled duel (`NotPlayer`); an open challenge cannot be
delegated (`WrongStatus`); a matched duel cannot be aborted inside its setup window (`NotExpired`); a forged VRF
callback is refused; nobody can deposit into a clan mid-war (`WarLocked`); a non-captain cannot close a position
before the war window ends (`NotCaptain`); a war stake over half the chest is refused (`WarStakeTooBig`); the rollup
feed's stale Solana copy is refused as a price. Not covered by a test: the 10-minute `abort_duel` payout and the
1-hour lobby cancel (both need the clock to pass).

## Mainnet fork

```bash
bash scripts/forknet.sh           # :8911, clones Phoenix + the SOL/USDC market, vaults and USDC mint from mainnet
npx tsx scripts/fork-trade.ts 1
```

Last run: tx `3Lt4EHkaHBH84DFHGQ8usoXrDN3DCK8JhnBhouCGvfCtEXCLnLpupgJmYDy3dV8ZdJw9eYeX8FkBcUGSwFDh5rEK` on the fork
(not on mainnet). The forked book's best bid was 60.03 against a ~71 market price, so the 1 SOL sell walked the book to
54.66. Report in `.forknet/last-trade.json` (gitignored, so the result is not stored in the repo).

## App on-chain duel (two players in the browser)

With the local stack and `scripts/crank.ts` running and the app on `npx expo start --web`, two browser contexts (two
device wallets) open `/onchain`, fund and create players, open a 0.1 SOL duel, join it from the second
tab, pick Long 50× and Short 50×, and wait for the rollup start, the checks and the settlement. Three runs on Nov 16:

| Coin | Entry → exit | Result |
|---|---|---|
| ETH | 1,817.62 → 1,818.68 | long won, +2.5% / -2.5% |
| SOL | 71.45 → 71.40 | short won, +3.0% / -3.0% |
| ETH | 1,820.75 → 1,822.96 | long won, +6.0% / -6.0% |

These are notes from the Nov 16 build (0.1 SOL stakes, before USDC and before the cranks); no log was kept. The
current in-app proof is the Nov 25 devnet duel in `evidence/devnet-proof.txt`.

## Not covered

- **The 10-minute `abort_duel` payout and the 1-hour lobby cancel:** both need the clock to pass.
- **A failed Magic Action:** the tests only wait for the happy path; the manual-settle fallback is in the app, untested.
- **Mainnet:** not deployed.
- **Clan positions on a real venue:** clan trades are scored at the Solana base-feed price, not filled on Phoenix.
