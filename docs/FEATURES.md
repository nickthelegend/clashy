# Clashy features: where each one lives and how it is proven

Every feature below names the file it lives in and the test, log or devnet transaction that shows it working. Paths
are from the repo root. `lib.rs` is [`chain/programs/clashy/src/lib.rs`](../chain/programs/clashy/src/lib.rs); line
numbers are as of Nov 27, 2026. Evidence files are in [`chain/evidence/`](../chain/evidence/).

Ground rules, so nothing here reads bigger than it is:
- On-chain modes run on **Solana devnet with test USDC** (mint `8Jb66Cfu…`, no value). Nothing is on mainnet.
- The **practice games are off chain**: paper money on live prices. Nothing in them is sent on chain.
- **Privy sign-in runs on web only.** The native phone build uses a device test wallet (a key kept on the device).
- "Proven by the film only" means the demo film shows it and no test or stored trail covers it.

## 1v1 clashes

| Feature | Where (code) | How it is proven |
|---|---|---|
| Crypto clash: one coin for both players, a sealed up/down call, 60 s, the better call takes the pot minus a 3% rake | App: [`app/src/app/onchain.tsx`](../app/src/app/onchain.tsx). Program: `open_duel` (lib.rs:975), `join_duel` (:1000), `finish_duel` (:169), `settle_duel` (:1248) | Test: `chain/tests/clashy.test.ts` test 1 (`suite-clashy-nov26.log`). Devnet: Nov 25 in-app duel, 100 txs ([`devnet-proof.txt`](../chain/evidence/devnet-proof.txt)); Nov 27 duel in the demo film (the web app on iOS Simulators), SOL, 96 txs, 86 on the rollup, 61 crank ticks ([`devnet-proof-nov27-ios-duel2.txt`](../chain/evidence/devnet-proof-nov27-ios-duel2.txt)); an earlier iOS Simulator BTC duel, not in the current film, 94 txs, 82 on the rollup ([`devnet-proof-nov27-ios-duel.txt`](../chain/evidence/devnet-proof-nov27-ios-duel.txt)) |
| Stakes from $5 in the app; the program's minimum is 1 USDC | App: stake buttons 5 / 10 / 25 in `onchain.tsx`. Program: `MIN_STAKE` in [`constants.rs`](../chain/programs/clashy/src/constants.rs) | Code only |
| VRF rolls the coin | `request_coin_roll` (lib.rs:1067), `coin_roll_callback` (:1095) | Test: `clashy.test.ts` test 3 (`c-vrf.log`). Devnet: CoinRollCallback in every trail, signed by MagicBlock's VRF oracle |
| Calls sealed in MagicBlock's Private Ephemeral Rollup (TEE), signed by a session key | `lock_pick_inner` (lib.rs:314), `lock_pick_session` (:2099), `check_session` (:368). App: `ensureSession` in [`app/src/chain/client.ts`](../app/src/chain/client.ts) (6-hour key) | Test: `chain/tests/magicblock.test.ts` test 3; on the devnet TEE player A read A's pick and B read nothing ([`devnet-private.log`](../chain/evidence/devnet-private.log), [`devnet-mb-cancel.log`](../chain/evidence/devnet-mb-cancel.log)). Devnet: 2 `LockPickSession` txs in `devnet-proof-nov27-ios-duel2.txt` (and 2 in `devnet-proof-nov27-ios-duel.txt`) |
| A crank scores the clash every second on the rollup; a Magic Action pays out on Solana | `tick_duel` (lib.rs:1964), `schedule_ticks` (:2227), `cancel_ticks` (:2215), `settle_duel_action` (:215) | Test: `magicblock.test.ts` test 1. Devnet: 61 `TickDuel` and one `ProcessUndelegation + SettleDuel` in `devnet-proof-nov27-ios-duel2.txt` |
| **Nov 27:** the pick screen shows the rolled coin's price chart before the sealed call | `onchain.tsx` (renders `PriceChart`), [`app/src/ui/price-chart.tsx`](../app/src/ui/price-chart.tsx). The history is the prices Clashy's crank pushed on chain, one sample a minute, kept in a file and served read-only by the relay at `GET /history` ([`chain/scripts/price-history.ts`](../chain/scripts/price-history.ts)) | Proven by the film only (demo film). No app test |
| **Nov 27:** tie rule shown on the pick screen | Program: `finish_duel` (lib.rs:169) sets winner 3 when both P&Ls are equal; `settle_duel` (:1248) then pays each player half the pot with no rake. App: the line under the calls in `onchain.tsx` | Test: the Nov 26 25x vs 25x perps clash ended `pnl 0,0 ko 0 winner 3` and passed ([`suite-perps-nov26.log`](../chain/evidence/suite-perps-nov26.log)); an older local duel run shows `pnl 0,0 winner 3 · USDC 100/100`, both stakes back ([`e2e-last.log`](../chain/evidence/e2e-last.log); the Royale test in that run failed). Devnet: duel `3qa893zc…` ended `winner 3` ([`devnet-proof2.txt`](../chain/evidence/devnet-proof2.txt)). The pick-screen line is commit `bd8e4c2` |
| **Nov 27 bug fix:** "Clash again" starts the next clash with no call | `onchain.tsx` (the active duel is cleared and the last lock is not reused) | Code only (commit `6de00ba`) |
| Dead heat or no rival: your stake comes back | `void_duel` (lib.rs:1221), `cancel_duel`, `abort_duel` | Test: `chain/tests/void.test.ts` (`suite-void-nov26.log`); `clashy.test.ts` test 2 (unmatched challenge refunds in full) |
| Elo rating moves with every settled clash | `update_players` (lib.rs:379), `math.rs` | Unit test `elo_moves_symmetrically` (`unit-nov26.log`); ratings 984 / 1016 in `suite-clashy-nov26.log` |

## Perps clashes

| Feature | Where | How it is proven |
|---|---|---|
| Long or short with leverage; up to 50x in the app, 100x in the program; liquidated means out | App: `onchain.tsx` (Perps mode). Program: `MAX_LEVERAGE = 100` in `constants.rs`; checked in `lock_pick_inner` and `reveal_pick` (lib.rs:1140) | Test: `chain/tests/perps.test.ts`, 3 tests: 25x vs 25x, a 50x long liquidated by a 2.5% drop (price staged with the crank key), leverage above 100x refused (`suite-perps-nov26.log`, `suite-perps.log`) |

## Royale

| Feature | Where | How it is proven |
|---|---|---|
| Up to 16 players, $2 in, a call every round, a wrong call costs a heart, survivors split the pot | App: [`app/src/app/onchain-royale.tsx`](../app/src/app/onchain-royale.tsx) (`ENTRY_USDC = 2`). Program: `create_tournament` (lib.rs:1648), `MAX_TOUR_PLAYERS = 16` in `constants.rs`, `tick_round` (:2007), `settle_tournament` (:1850) | Test: `clashy.test.ts` test 5, `magicblock.test.ts` test 2. Devnet: Nov 27 3-player Royale, 112 txs, 100 on the rollup, 21 `CallRoundSession`, 70 `TickRound` ([`devnet-proof-nov27-royale.txt`](../chain/evidence/devnet-proof-nov27-royale.txt)) |
| Round calls signed by a session key on the rollup | `call_round_session` (lib.rs:2107) | Devnet: 21 `CallRoundSession` txs in `devnet-proof-nov27-royale.txt`, 12 in [`devnet-proof-nov26-royale.txt`](../chain/evidence/devnet-proof-nov26-royale.txt) |
| **Nov 27:** each round draws a round price line from the round's start price | `onchain-royale.tsx` (`roundLine`, drawn with `LiveChart` and a "round start" reference line) | Code only. The Nov 27 film does not show a Royale |

## Squads and squad wars

| Feature | Where | How it is proven |
|---|---|---|
| A shared USDC chest; a deposit buys chest shares; leaving pays your pro-rata part | Program: `create_clan` (lib.rs:1291), `join_clan` (:1326), `deposit_chest` (:1358), `withdraw_chest` (:1376), `leave_clan` (:1345). App: [`app/src/app/onchain-clan.tsx`](../app/src/app/onchain-clan.tsx), [`app/src/app/squad/[id].tsx`](../app/src/app/squad/%5Bid%5D.tsx) | Test: `clashy.test.ts` test 4: a member cashed out exactly 8.333333 USDC for 10 of 30 shares of a 25 USDC chest (`suite-clashy-nov26.log`) |
| Members vote every trade, weighted by chest shares; leverage 1x to 20x | `propose` (lib.rs:1399, `MAX_CLAN_LEV = 20`), `vote` (:1428, weight = the member's shares), `execute_proposal` (:1450, captain only), `close_position` (:1498) | Test: `clashy.test.ts` test 4. Devnet: 2 `Propose`, 3 `Vote`, 2 `ExecuteProposal` in [`devnet-proof-nov27-ios-squad-war.txt`](../chain/evidence/devnet-proof-nov27-ios-squad-war.txt) |
| Squad war: chest against chest; the better return takes both stakes | `declare_war` (lib.rs:1523), `accept_war` (:1553), `settle_war` (:1599); a stake over half the chest is refused (`WarStakeTooBig`) | Test: `clashy.test.ts` test 4. Devnet: `DeclareWar`, `AcceptWar`, `SettleWar` in `devnet-proof-nov27-ios-squad-war.txt` (Night Owls 1W, Moon Pack 1L), the rematch in [`devnet-proof-nov27-ios-squad-rematch.txt`](../chain/evidence/devnet-proof-nov27-ios-squad-rematch.txt) (`SettleWar` at 10:41:03 UTC) and [`devnet-proof-nov26-squad-war.txt`](../chain/evidence/devnet-proof-nov26-squad-war.txt) |
| Squad trades and wars are priced at Clashy's crank-pushed Solana feed, not MagicBlock's oracle | `close_position`, `settle_war`; feed reads in [`price.rs`](../chain/programs/clashy/src/price.rs) | Test: `clashy.test.ts` test 4 (the rollup feed's stale copy is refused, `FeedInvalid`) |
| **Nov 27:** a script closes a squad's open trades once its war window is over, so a war can settle when a captain is offline | [`chain/scripts/close-war-trades.ts`](../chain/scripts/close-war-trades.ts); the program allows any closer after the window (`close_position`, lib.rs:1502-1506) | Devnet: the second `ClosePosition` of the Nov 27 war ([`c2TwPEaU…`](https://explorer.solana.com/tx/c2TwPEaUqnk4ipXP2mn66Ynr7ikX48h97CajerTKxfZqWSQboKxwtqcZfrx43H3wSAELRWT81CGWxdzWXkaFbrA?cluster=devnet)) is signed by the sponsor key alone, as the script does. No run log is stored |
| Discord-style channels: `#general` and `#trades`, on the MagicBlock rollup, members only | Program: `open_channel` (lib.rs:930), `delegate_channel` (:941), `post_message` (:952). App: [`app/src/app/clan-chat.tsx`](../app/src/app/clan-chat.tsx) | Test: `chain/tests/brief.test.ts`, "members post in their clan channel; outsiders cannot" (`suite-brief-nov26.log`). Devnet: `OpenChannel` in `devnet-proof-nov27-ios-squad-war.txt` |
| Stickers in chat: 10 packs, including a MagicBlock pack | [`app/src/stickers/spec.json`](../app/src/stickers/spec.json), [`app/src/ui/sticker-keyboard.tsx`](../app/src/ui/sticker-keyboard.tsx); a sticker is sent as an ordinary `post_message` | Proven by the film only (squad `#general` with MagicBlock stickers). The rollup posts are not in a stored trail |

## Practice games (off chain)

| Feature | Where | How it is proven |
|---|---|---|
| 151 games on 33 engines, practice money, live prices | [`app/src/games/catalog.ts`](../app/src/games/catalog.ts) (151 rows in `SPECS`), [`app/src/games/engines/`](../app/src/games/engines/) (33 engines registered in `index.ts`), live feed in [`app/src/games/feed.ts`](../app/src/games/feed.ts) | Counted from the catalog on Nov 27. No automated test plays each game. `practice-clash.test.ts` tests the practice clash rules and the live feeds (`suite-practice-nov26.log`); `markets.test.ts` tests the live Phoenix and Pacifica books (`suite-markets-nov26.log`) |
| **Nov 27:** Tap Grid plays full screen | [`app/src/games/engines/tapgrid.tsx`](../app/src/games/engines/tapgrid.tsx) (the "Full screen" button and the full-screen grid) | Proven by the film only |
| **Nov 27:** new game Draw the Line: draw the next 30 s, Clashy Bot draws too, more touches of the live price wins 2x | [`app/src/games/engines/drawline.tsx`](../app/src/games/engines/drawline.tsx); catalog row `draw-line` | Proven by the film only |
| Game kit: every piece the games are built from | [`app/src/games/kit/`](../app/src/games/kit/), route `/games/kit` ([`app/src/app/games/kit.tsx`](../app/src/app/games/kit.tsx)) | See [GAME-KIT.md](GAME-KIT.md) |

## Money, wallets and platforms

| Feature | Where | How it is proven |
|---|---|---|
| Players hold 0 SOL; a sponsor relay pays every Solana fee and rent | [`chain/scripts/sponsor.ts`](../chain/scripts/sponsor.ts) | Test: `chain/tests/sponsor.test.ts`, 5 tests, including a 0-SOL sponsored `init_player` (`suite-sponsor-nov26.log`). Every test asserts the players end at 0 SOL |
| Privy sign-in (email or Google) on web | [`app/src/chain/wallet.web.tsx`](../app/src/chain/wallet.web.tsx) | `sponsor.test.ts` refuses a forged Privy token. A real Privy sign-in is not covered by a stored test |
| Device test wallet on phones (no Privy) | [`app/src/chain/wallet.tsx`](../app/src/chain/wallet.tsx), `walletCore.tsx` | The Nov 27 devnet trails were played by fresh device test wallets |
| **Nov 27:** Web Crypto polyfill for phones (Hermes has no `crypto.getRandomValues` or `crypto.subtle.digest`) | [`app/src/polyfill.ts`](../app/src/polyfill.ts), loaded first by [`app/index.js`](../app/index.js) | Code only (commit `acebcd8`); the iOS Simulator clash in `devnet-proof-nov27-ios-duel.txt` (an earlier BTC duel, not in the current film) ran after it. A native Release build on an iOS Simulator needed it; the film uses the web app |
| Live on MagicBlock screen: config, keeper and oracle accounts read from chain | [`app/src/app/magicblock.tsx`](../app/src/app/magicblock.tsx) | Code only |
| Stash: savings, spending limits, breaks, tokenized stocks | `stash_save` (lib.rs:748), `set_limits` (:701), `take_break` (:719), `stash_invest` (:775). App: [`app/src/app/stash.tsx`](../app/src/app/stash.tsx) | Test: `brief.test.ts` (`suite-brief-nov26.log`). The stock buy passes only on the local stack against a mainnet snapshot of the xStock pools; devnet has no xStock pool |
| Weekly Cup: duel winnings settled this week plus Stash stock profit | [`app/src/app/cup.tsx`](../app/src/app/cup.tsx) (reads program accounts; the stock part is not limited to the week, since holdings keep no buy dates) | Code only |
| Social server: DMs, follows, notifications | [`server/`](../server/) | Test: `server/test/api.test.ts`, 4 tests (`social-nov26.log`) |
| Guided tour: the main tour plus first-visit tours of 25 inner screens and every game | [`app/src/tour/`](../app/src/tour/) (`screens.ts` has 25 entries) | Code only |

## Not built or not live

- Nothing on mainnet. No real money.
- No store listing: the App Store, Google Play and the Solana dApp Store are coming soon; nothing has been submitted.
- No Android build has been made or run; the Expo project names an Android package (`app/app.json`), and the native iOS
  project is generated locally with `npx expo run:ios` and is gitignored, so it is not in the repo. The demo film uses
  the web app added to the iOS home screen, not a native build.
- The site is not hosted: `clashy.fun` was still a parked page on Nov 27.
