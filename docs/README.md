# Clashy docs

**Clash 1v1. Squad up. Play 150+ games.**

Clashy is a PvP trading game on Solana. The live part of every on-chain game runs on MagicBlock's Private Ephemeral
Rollup. Everything here runs on **Solana devnet with test USDC**; no real money moves anywhere.

Clashy does three things:

1. **1v1 clashes.** Crypto clashes (one coin rolled by MagicBlock VRF for both players, a sealed up/down call, 60 s),
   perps clashes with leverage (up to 50x in the app, 100x in the program), and Royale for up to 16 players.
2. **Squads.** A shared USDC chest. Members vote every trade, weighted by their chest shares. Squad wars put chest
   against chest. Each squad has Discord-style `#general` and `#trades` channels on the MagicBlock rollup, with
   stickers.
3. **151 practice games** on live prices. These are off chain and use paper money.

Where each feature lives in the code, and how it is proven: **[FEATURES.md](FEATURES.md)**.

## Platforms

| Platform | Status |
|---|---|
| Web app | Runs in any browser. It is the same Expo app exported for web, with a desktop layout on wide screens. Sign-in with Privy (email or Google). Not hosted yet: `clashy.fun` is a parked page |
| iOS | Same Expo codebase. The native iOS project is generated locally with `npx expo run:ios` and is gitignored, so it is not in the repo. A native Release build ran once on an iOS Simulator (it needed the Web Crypto polyfill, `app/src/polyfill.ts`). The demo film uses the web app instead: the Clashy web app (devnet build) added to the iOS home screen in iOS Simulators, with device test wallets on devnet (no Privy there) |
| Android | Same Expo codebase; `app/app.json` names the package `fun.clashy.app`. No Android build has been made or run yet |
| App Store, Google Play, Solana dApp Store | Coming soon. Nothing has been submitted to any store |

There is no APK or IPA in the repo.

## Every doc

| Doc | What it is |
|---|---|
| [../README.md](../README.md) | The project: modes, MagicBlock proof table, devnet deployment, how to run |
| [FEATURES.md](FEATURES.md) | Every feature, the file it lives in and the test, log or devnet transaction that proves it |
| [MAGICBLOCK.md](MAGICBLOCK.md) | Each MagicBlock piece (delegation, VRF, TEE picks, cranks, oracle, Magic Actions, keeper, session keys), its code and its tests |
| [DEVNET.md](DEVNET.md) | What is deployed on devnet, the upgrades, what was tested there and how to run the backend against it |
| [../TESTING.md](../TESTING.md) | Test totals (56 tests in 10 suites, Nov 26), commands and logs |
| [../chain/TESTING.md](../chain/TESTING.md) | Per-test detail for every on-chain suite, attack tests, what is not covered |
| [../HACKATHON_SUBMISSION_FORM.md](../HACKATHON_SUBMISSION_FORM.md) | Paste-ready answers for the Solana Blitz v10 form, devnet transactions, the before/after kickoff disclosure |
| [AUDIT.md](AUDIT.md) | Internal security review (Nov 19). It does not cover the Nov 25 MagicBlock code |
| [CLAIMS-AUDIT.md](CLAIMS-AUDIT.md) | The Nov 25 audit of every claim in the repo. Historical: line numbers and counts are as of Nov 25 |
| [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md) | Capacity and cost plan for testnet and mainnet |
| [DEPLOY-RUNBOOK.md](DEPLOY-RUNBOOK.md) | Steps to host the landing and app on a server. Not run yet |
| [GAMES.md](GAMES.md) | The practice games: engines, settings and the engine contract |
| [GAME-KIT.md](GAME-KIT.md) | The shared kit the games are built from, and how to add a game |
| [ANIMATIONS.md](ANIMATIONS.md) | Audit of the app's animations (Nov 25) |
| [ART-3D.md](ART-3D.md) | The clay art style guide |
| [DESIGN-BRIEF-NOV18.md](DESIGN-BRIEF-NOV18.md) | UI brief from Nov 18 |
| [NICK.md](NICK.md) | The submitter's checklist for the deadline |
| [GAME-DESIGN.md](GAME-DESIGN.md) | Planning document, not a status report |
| [MINI-GAMES.md](MINI-GAMES.md) | Planning document, not a status report |
| [REAL-TRADES.md](REAL-TRADES.md) | Planning document, not a status report |
| [LAUNCH-PLAN.md](LAUNCH-PLAN.md) | Planning document, not a status report |
| [TEST_PLAN.md](TEST_PLAN.md) | Planning document: a browser test plan, not a record of runs |

Media: [`media/clashy-demo.mp4`](media/clashy-demo.mp4) (the demo film) and [`screens/`](screens/) (app screenshots,
Nov 17 to 21).

## Evidence

Every file in [`chain/evidence/`](../chain/evidence/), and what it proves. Logs are copied unedited apart from
stripped colour codes and home paths. Trails (`devnet-proof*.txt`) were printed by `chain/scripts/devnet-proof.ts`,
`royale-proof.ts` and `squad-proof.ts`; every line links to Solana Explorer.

### Devnet game trails

| File | What it proves |
|---|---|
| [`devnet-proof-nov27-ios-duel2.txt`](../chain/evidence/devnet-proof-nov27-ios-duel2.txt) | Nov 27, the demo film's clash, in the web app on iOS Simulators: private SOL duel, 96 txs (86 on the rollup), VRF roll, 2 `LockPickSession`, 61 crank ticks, the Magic Action settle; Ben was paid 9.70 USDC (net +4.70 on a 5 USDC stake) |
| [`devnet-proof-nov27-ios-squad-rematch.txt`](../chain/evidence/devnet-proof-nov27-ios-squad-rematch.txt) | Nov 27, the demo film's squad war and rematch: 27 Solana txs: the first war (13) and the rematch (14, 10:38:01–10:41:03 UTC), ending in the rematch's `SettleWar` |
| [`devnet-proof-nov27-ios-duel.txt`](../chain/evidence/devnet-proof-nov27-ios-duel.txt) | Nov 27, an earlier iOS Simulator BTC duel (not in the current film): 94 txs (82 on the rollup), VRF roll, 2 session-key pick locks, 61 crank ticks, the Magic Action settle |
| [`devnet-proof-nov27-ios-squad-war.txt`](../chain/evidence/devnet-proof-nov27-ios-squad-war.txt) | Nov 27, the demo film's first squad war with both squads' transactions (13 of its 19 are also in the rematch trail): two squads, chest deposits, proposals, share-weighted votes, two trades, `SettleWar`, `OpenChannel`; 19 Solana txs |
| [`devnet-proof-nov27-duel.txt`](../chain/evidence/devnet-proof-nov27-duel.txt) | Nov 27, an earlier private SOL duel in the web app: 101 txs (89 on the rollup), 61 crank ticks |
| [`devnet-proof-nov27-royale.txt`](../chain/evidence/devnet-proof-nov27-royale.txt) | Nov 27, a 3-player Royale: 112 txs (100 on the rollup), 21 `CallRoundSession`, 70 `TickRound`, settled by a Magic Action |
| [`devnet-proof-nov26.md`](../chain/evidence/devnet-proof-nov26.md) | Nov 26 summary of the duel, Royale and squad war below, with every failed transaction explained |
| [`devnet-proof-nov26-duel.txt`](../chain/evidence/devnet-proof-nov26-duel.txt) | Nov 26 private ETH duel: 99 txs (89 on the rollup) |
| [`devnet-proof-nov26-royale.txt`](../chain/evidence/devnet-proof-nov26-royale.txt) | Nov 26 3-player Royale: 93 txs (84 on the rollup), 12 session-key calls |
| [`devnet-proof-nov26-squad-war.txt`](../chain/evidence/devnet-proof-nov26-squad-war.txt) | Nov 26 squad war: 18 Solana txs |
| [`devnet-proof.txt`](../chain/evidence/devnet-proof.txt) | Nov 25 private ETH duel through the web app, two 0-SOL players: 100 txs (88 on the rollup), B was paid 9.70 USDC (net +4.70 on a 5 USDC stake) |
| [`devnet-proof2.txt`](../chain/evidence/devnet-proof2.txt) | Nov 25 private duel with both picks as `LockPickSession` (session keys in the app); a dead heat (`winner 3`) |
| [`devnet-proof3.txt`](../chain/evidence/devnet-proof3.txt) | Nov 25 duel after upgrade `3LJSPdfk…`: the finishing tick cancels its crank |

### Devnet test runs, deploys and migration

| File | What it proves |
|---|---|
| [`devnet-mb-cancel.log`](../chain/evidence/devnet-mb-cancel.log) | Nov 25, MagicBlock suite on the devnet TEE after the last upgrade: 4/4 in one run (cranked duel, cranked Royale, private duel with A-reads-A / B-reads-nothing, keeper abuse) |
| [`devnet-mb-test.log`](../chain/evidence/devnet-mb-test.log) | Nov 25, first devnet TEE run: 3/4 (the private duel failed on a devnet mint timeout) |
| [`devnet-private.log`](../chain/evidence/devnet-private.log) | Nov 25, the private duel re-run on the devnet TEE: A sees side 1, B sees nothing |
| [`devnet-test-all.log`](../chain/evidence/devnet-test-all.log), [`devnet-test-2.log`](../chain/evidence/devnet-test-2.log), [`devnet-test-3.log`](../chain/evidence/devnet-test-3.log), [`devnet-test-4.log`](../chain/evidence/devnet-test-4.log), [`devnet-test-clashy.log`](../chain/evidence/devnet-test-clashy.log) | Nov 22, the other suites on the first program and devnet-as. No run was all green; each test passed in at least one run, several after reruns |
| [`devnet-upgrade.log`](../chain/evidence/devnet-upgrade.log) … [`devnet-upgrade4.log`](../chain/evidence/devnet-upgrade4.log) | The four Nov 25 program upgrades (signatures `4VJAbxj2…`, `2bfRV8kM…`, `jKQqVjuN…`, `3LJSPdfk…`) |
| [`devnet-migrate.log`](../chain/evidence/devnet-migrate.log), [`devnet-migrate2.log`](../chain/evidence/devnet-migrate2.log) | Nov 25, feeds, boards and the squad channel moved from devnet-as to the TEE rollup; SOL/BTC/ETH switched to MagicBlock's oracle |

### Local test runs (MagicBlock validator 1.1.1 on an Agave 4.5 base)

| File | What it proves |
|---|---|
| `unit-nov26.log`, `suite-magicblock-nov26.log`, `suite-clashy-nov26.log`, `suite-perps-nov26.log`, `suite-brief-nov26.log`, `suite-void-nov26.log`, `suite-sponsor-nov26.log`, `suite-practice-nov26.log`, `suite-markets-nov26.log`, `social-nov26.log` | The Nov 26 re-run of every suite: 56 of 56 pass ([TESTING.md](../TESTING.md)) |
| `suite-*-cancel.log` | Nov 25 runs after the crank-cancel change |
| `suite-magicblock.log`, `suite-clashy.log`, `suite-perps.log`, `suite-brief.log`, `suite-void.log`, `suite-markets.log` | Nov 25 runs before the crank-cancel change (`suite-clashy.log` has the VRF test timing out before its fix) |
| `c-vrf.log` | Nov 25, the VRF test alone after the callback fix: SOL rolled in 1,083 ms |
| `run-all.log`, `run-all.sh` | Nov 25 TAP summary of the local suites, and the script that ran them |
| `e2e-last.log` | An older local end-to-end run: 4 pass, 1 fail (the Royale test). Kept for its dead-heat duel (`winner 3`, both stakes back) |

## Not live

- Nothing is on mainnet. The program is upgradeable by one deployer key.
- The site and app are not hosted. The relay, crank and app ran on a Mac for every devnet run.
- Tokenized stock buys need an Orca xStock pool, which devnet does not have.
- The Nov 25 MagicBlock code has not been security-audited.
