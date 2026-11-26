# Testing

Every suite below was re-run on **Nov 26, 2026 (04:38–05:05 UTC)** on a Mac, unless the row says otherwise. The
program, tests, server and website were unchanged since `9e0a58e` (later commits change only the app, the landing page,
the docs and the proof scripts; everything is pushed to GitHub), and the program
binary they ran, `chain/target/deploy/clashy.so`, has sha256 `707e9cb8…`, the same build that is deployed on devnet. Raw output is in [`chain/evidence/`](chain/evidence/) (files
ending `-nov26.log`). Per-test detail is in [chain/TESTING.md](chain/TESTING.md).

Nothing on chain is mocked. The on-chain suites run the real Clashy program against MagicBlock's own validator
(`@magicblock-labs/ephemeral-validator` 1.1.1) as the rollup, MagicBlock's delegation program and `vrf-oracle`, on an
Agave 4.5.0-beta.0 test validator that copies devnet's feature set (`chain/scripts/localnet.sh`, started fresh with
`CLASHY_RESET=1`). Prices are live: MagicBlock oracle accounts or Coinbase through the crank. The one staged value is
the 50x liquidation test's price drop, written on chain with the crank key. Every test player holds USDC and 0 SOL;
the sponsor pays all fees and rent.

## Totals

**56 tests in 10 suites, 56 pass, 0 fail** (Nov 26, 2026). The website also builds and lints cleanly.

| Suite | Command (from `chain/` unless noted) | Tests | Nov 26 result | Log |
|---|---|---|---|---|
| Program unit tests (math, chest shares, price scaling, a real MagicBlock oracle account) | `cargo test -p clashy --lib` | 13 | 13 pass | `unit-nov26.log` |
| MagicBlock: cranks, keeper, Magic Actions, private picks, keeper abuse | `npx tsx --test --test-concurrency=1 tests/magicblock.test.ts` | 4 | 4 pass | `suite-magicblock-nov26.log` |
| End to end: duel, challenge board, VRF, clans and wars, Royale | `npx tsx --test --test-concurrency=1 tests/clashy.test.ts` | 5 | 5 pass | `suite-clashy-nov26.log` |
| Perps: 25x vs 25x, 50x liquidation, leverage cap | `npx tsx --test --test-concurrency=1 tests/perps.test.ts` | 3 | 3 pass | `suite-perps-nov26.log` |
| Names, limits, Stash, calls and chat, squads | `npx tsx --test --test-concurrency=1 tests/brief.test.ts` | 9 | 9 pass | `suite-brief-nov26.log` |
| Void: a live duel nobody finishes refunds both stakes | `npx tsx --test tests/void.test.ts` | 1 | 1 pass | `suite-void-nov26.log` |
| Sponsor relay: refusals, withdrawals, forged Privy token, a real 0-SOL sponsored `init_player` | `npx tsx --test tests/sponsor.test.ts` | 5 | 5 pass | `suite-sponsor-nov26.log` |
| Practice clash vs Clashy Bot (rules + live rollup feeds) | `npx tsx scripts/crank.ts`, then `npx tsx --test tests/practice-clash.test.ts` | 5 | 5 pass | `suite-practice-nov26.log` |
| Practice order-book perps on live Phoenix and Pacifica books | `npx tsx scripts/sponsor.ts`, then `npx tsx --test tests/markets.test.ts` | 7 | 7 pass | `suite-markets-nov26.log` |
| Social server (DMs, follows, archive), SQLite | `cd server && npm test` | 4 | 4 pass | `social-nov26.log` |
| Website | `cd web && npm run build && npm run lint` | build + lint | both clean | not stored |

What the Nov 26 run printed (from the logs):
- **Cranked duel (local):** ETH, settled by the Magic Action 30.8 s after the start, keeper ticks 0 → 31, and the
  finishing tick cancelled its crank with no failed tick after it.
- **Cranked Royale:** SOL, 3 rounds, lives 1/0/0, the survivor was paid 5.82 USDC, nobody resolved or settled by hand.
- **Private duel:** ETH, 25x long vs 25x short; picks stayed private until the start. The local validator is not a
  TEE, so here only the permission account is checked; the A-reads-A, B-reads-nothing check needs the devnet TEE
  (passed Nov 25, `devnet-private.log`, `devnet-mb-cancel.log`).
- **VRF:** SOL rolled in 1,095 ms by MagicBlock's `vrf-oracle` on their local test queue.
- **Duel:** BTC, joiner won, USDC 95 / 104.7, ratings 984 / 1016. **Royale:** one survivor took 5.82 USDC.
- **Clan:** long SOL 5x closed at -0.0175 USDC; a member cashed out exactly 8.333333 USDC (10 of 30 shares of a
  25 USDC chest).
- **Liquidation:** BTC dropped 2.5% (staged), the 50x long was knocked out and the 10x short won +9.7 USDC. In the
  25x vs 25x clash SOL did not move (`pnl 0,0`, a dead heat), so its "P&L is 25x the move" check compared 0 to 0 and
  the multiplier was not exercised on Nov 26. In the Nov 25 run (`suite-perps.log`) BTC moved 1.79 bp and both sides
  scored ±44 bp, 25x the move.
- **Stash fee:** buy 0.05 USDC, sell 0.024865 USDC, both to the treasury.
- **Stash stock buy:** NVIDIA bought through Orca and half sold back, on the local stack against a mainnet snapshot of
  the five xStock Whirlpool pools (`chain/scripts/localnet.sh`); devnet has no xStock pool.
- **Relay:** a wallet with 100 USDC and 0 SOL created its player account through the relay.

**Through the web app on devnet (Nov 26, the film's games):** a private ETH duel (99 transactions, 89 on the rollup),
a 3-player Royale (93, 84 on the rollup) and a squad war (18 Solana transactions, none failed), each played by device
wallets with 0 SOL; trails and every failed transaction explained in `chain/evidence/devnet-proof-nov26.md`. The Nov 25
in-app duel (100 transactions, 88 on the rollup) is in `chain/evidence/devnet-proof.txt`.

## Not re-run on Nov 26

| Suite | Why | Last result |
|---|---|---|
| The same MagicBlock suite on the devnet TEE rollup | It spends devnet SOL and test USDC; this run was read-only on devnet | 4/4 pass in one run on Nov 25 after upgrade `3LJSPdfk…` (`chain/evidence/devnet-mb-cancel.log`) |
| The other suites on devnet | Same reason | Nov 22, on the first program and devnet-as: each passed in at least one run, several after reruns; the 0-SOL sponsored-player test failed there because it needs a real Privy sign-in (`devnet-test-*.log`) |
| Mainnet-fork Phoenix trade | Needs the mainnet fork (`scripts/forknet.sh`) | Sold 1 SOL for 54.660103 USDC, the book expected 54.660103 (Nov 18) |
| App lint and type check | Another session had uncommitted app changes in progress, so a run would not test the committed app | Not recorded |

## Devnet live check (read-only)

`npx tsx scripts/devnet-livecheck.ts` (from `chain/`) reads the deployed program, config, keeper, prices, VRF queue
and balances without loading any key. Its Nov 26 04:36 UTC result is in [docs/NICK.md](docs/NICK.md#devnet-live-check).
