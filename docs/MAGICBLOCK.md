# Clashy on MagicBlock

Clashy is a PvP trading game. Two players stake USDC and call the same coin; the best call wins the pot. Each part of
a clash runs on a different piece of MagicBlock's stack. This page names each piece, where it is in the code and the
test that proves it.

**Where it is proven:** on the local MagicBlock stack (validator 1.1.1, `chain/evidence/suite-magicblock.log`) and on
Solana devnet with MagicBlock's Private Ephemeral Rollup `https://devnet-tee.magicblock.app`, validator
`MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo` (Nov 25: 4/4 in one run, `chain/evidence/devnet-mb-cancel.log`, after
`devnet-mb-test.log` and `devnet-private.log`; one private duel played through the app, `chain/evidence/devnet-proof.txt`;
Nov 26: a duel, a Royale and a squad war through the app, `chain/evidence/devnet-proof-nov26.md`).
All of this code was written after the Nov 20 kickoff and has not been security-audited yet.

## One clash, end to end

| Step | Where it runs | MagicBlock piece |
|---|---|---|
| 1. Both stakes go into a USDC escrow PDA | Solana | — |
| 2. The coin is rolled for both players | Solana, answered by MagicBlock's oracle | **VRF** |
| 3. The duel and both players' Pick accounts move to the rollup | Solana → rollup | **Delegation** |
| 4. Each player locks long or short, readable only by them | Rollup (TEE) | **Private Ephemeral Rollup** + permission program |
| 5. The start copies both picks into the duel, makes them public and schedules a crank | Rollup | **Cranks** (ScheduleTask) |
| 6. Every second the crank scores the duel against the live price | Rollup | **Cranks** + **real-time pricing oracle** |
| 7. At a knockout or the bell the keeper PDA commits and undelegates the duel | Rollup → Solana | **Commit and undelegate**, delegated fee payer + magic fee vault |
| 8. In the same intent, settle_duel pays the winner, takes the rake and moves Elo | Solana | **Magic Action** (post-undelegate action) |

After step 5 nobody sends another transaction: the rollup finishes the game and pays it out by itself. In the Nov 25
in-app devnet duel the crank sent one `TickDuel` per second for 60 s, then the result came home and was settled.
The tick that finishes a game also cancels its crank, so the scheduler stops there. Before that fix (devnet upgrade
`3LJSPdfk…`, Nov 25 evening) the scheduler tried the remaining ticks 11 more times after the duel had gone home; they
failed because the duel had left the rollup.

## The pieces

### Ephemeral Rollup (delegation, commit and undelegate)
- Duels, Royales, price feeds, the public calls board and squad chat channels are delegated to the pinned rollup
  validator (`set_er_validator`; a member can never pick a validator).
- Code: `delegate_duel`, `delegate_private_duel`, `delegate_tournament`, `delegate_feed`, `delegate_board`,
  `delegate_channel`, `delegate_keeper`; commits in `check_duel`, `tick_duel`, `tick_round`, `void_*`,
  `abandon_private_duel` (`chain/programs/clashy/src/lib.rs`).
- Moves on the rollup cost nothing. Players hold 0 SOL; a sponsor relay pays every Solana fee and rent. Magic Actions
  are sent by MagicBlock's TEE validator; the keeper's escrow is the account MagicBlock can charge for them, and
  its balance has not changed on devnet (0.05065024 SOL before the Nov 25 runs and on Nov 27).
- The TEE rollup accepts transactions only with an auth token (a signed challenge, valid 30 days;
  `chain/tests/common.ts`). Public reads need none.
- On Nov 25 the feeds, boards and squad channel were brought home from devnet-as with `admin_undelegate` and
  re-delegated to the TEE (`chain/evidence/devnet-migrate.log`, `devnet-migrate2.log`).

### VRF
- `request_coin_roll` / `request_tournament_coin` ask MagicBlock VRF for the coin; only the VRF program's
  `coin_roll_callback` / `tournament_coin_callback` can set it (`#[vrf_callback]` checks the scoped identity).
- `vrf_required = true` on devnet refuses the commit-reveal fallback and forged callbacks
  (`tests/clashy.test.ts`, "MagicBlock VRF rolls the coin").
- SDK 0.18's `#[vrf_callback]` evaluated a const fn at run time, which cost over 200k compute units and made the
  callback fail. A compile-time `VRF_IDENTITY` fixed it (devnet upgrade `jKQqVjuN…`, Nov 25). The local VRF test then
  rolled in 1,083 ms (`chain/evidence/c-vrf.log`).

### Private Ephemeral Rollup (TEE) for sealed picks
- `open_private_picks` creates one `Pick` account per player and pre-funds each with the rent of its permission.
- `lock_pick` (on the rollup, signed by the player) creates the Pick's ephemeral permission, private with that player
  as the only member, and writes side and leverage. The rival cannot read it (checked on the devnet TEE, see the
  test below); a second lock is refused. The pick is private from the rival until the start, not from Clashy: the
  app's lock is co-signed by the sponsor relay, so the relay sees the side and leverage in the transaction it pays
  for. The test checks account reads only, not whether the rival can fetch the lock transaction itself.
- `start_private_duel` refuses to start until both picks are locked. It then copies them into the duel, flips both
  permissions public, starts the clock, schedules the crank and sends the Picks home. `close_pick` returns their rent
  after settlement. `abandon_private_duel` refunds both stakes if a player never locks.
- This replaces four Solana commit-reveal transactions with one free, instant move per player.
- Test: `tests/magicblock.test.ts`, "private duel". It checks that a player cannot write the rival's pick (seeds
  constraint), there is no start before both locks, a locked pick cannot change, the picks are copied into the duel at
  the start, the clash settles itself, and the picks are closed for their rent. On the TEE it also reads each pick
  through each player's authenticated connection: on Nov 25 player A saw side 1 and player B saw nothing
  (`chain/evidence/devnet-private.log`). The local validator is not a TEE, so locally it only checks that the
  permission account exists.

### Cranks (scheduled tasks on the rollup)
- `start_duel_cranked` / `start_tournament_cranked` / `start_private_duel` schedule a task (`ScheduleCrankCpi`, signed
  by the keeper PDA) that runs `tick_duel` / `tick_round` every 1,000 ms until the bell plus the void grace.
- Ticks are idempotent: a tick on a game that is not due returns OK. A finished tick commits through the keeper.
- The finishing tick cancels the game's crank (`cancel_ticks`: MagicBlock's `CancelTask`, signed by the keeper, which
  is the task's authority). Validator 1.1.1 reads only the authority account. On devnet the finishing tick logs
  `Successfully added cancel request for task …` ([example](https://explorer.solana.com/tx/5XckXUfdGfgS3iNWzBR5oa9Uw6SKFLTJ4xwbykXPtA3dUxsPtx2ZCzKRbLoP7ZQaitVN45CY14ebCHwUaS411abN?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app)), and the tests check that no failed tick follows it in the next 8 s. On the Nov 26 film games a few runs the scheduler had already queued still landed within 3 s, each stopped by the scheduler's own check (`InvalidAccountOwner`, fee 0) before Clashy's program ran (`chain/evidence/devnet-proof-nov26.md`).
  A game finished another way (a player's backup `check_duel`) still leaves its crank to fail its remaining ticks
  quietly until the scheduler drops it.
- Validator 1.1.1 runs these with its built-in scheduler: mainnet and MagicBlock's devnet TEE run 1.1.1, and so does
  the local stack used for the tests. Task ids are derived from the game's address, so two games never collide.

### Real-time pricing oracle
- SOL, BTC and ETH read MagicBlock's Pyth Lazer feeds on the rollup (accounts owned by `PriCems5…`; on devnet SOL
  `ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu`, BTC `71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr`, ETH
  `5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG`; feed ids 6, 1 and 2 per `chain/scripts/devnet-magicblock.ts`).
  `read_price` (`price.rs`) checks owner, discriminator, positive price and freshness (15 s on the rollup).
- MagicBlock's account stores the exponent as a positive decimal count (+8); `oracle_exponent` reads it as decimals.
  The sign is inferred from the value, not read as a sign; this was checked against the live devnet account only.
  A unit test decodes a real devnet SOL account (`price::tests::reads_a_real_magicblock_oracle_account`).
- Tokenized stocks (no MagicBlock feed) keep Clashy's own crank-pushed feeds.

### Magic Actions (settlement on Solana in the same intent)
- `settle_duel_action` / `settle_tournament_action` build a post-undelegate `CallHandler` with every account
  settle_duel / settle_tournament needs (vault, auth, players' USDC accounts, Elo records, treasury, rent payer).
- On devnet the action lands as one version-1 Solana transaction signed by the TEE validator `MTEWGuqx…`:
  `ProcessUndelegation` then `SettleDuel` (duel `3TRqj5wU…`, Nov 25) or `SettleTournament` (Royale `KauWRCg6…`, Nov 26).
- Attached in `check_duel`, `void_duel`, `tick_duel`, `resolve_round`, `void_tournament`, `tick_round` and
  `abandon_private_duel`. Actions are not atomic. If one ever fails, the game still comes home FINISHED and anyone
  can call settle by hand (the app does so after 8 s), so money is never stuck.
- Tests: `tests/magicblock.test.ts` tests 1 to 3 assert that the Magic Action paid and no manual settle was sent. In
  `clashy.test.ts`, `perps.test.ts` and `void.test.ts`, `settledByAction` falls back to a manual settle after 30 s and
  still passes; their Nov 25 logs show "(settled magic action)" where the action paid.

### Keeper (a delegated fee payer PDA)
- A scheduled instruction carries no wallet signature, so the `keeper` PDA (seeds `["keeper"]`, delegated once by the
  admin) signs the commits and passes the validator's magic fee vault (`["magic-fee-vault", validator]`) with the
  Magic Actions. The commits are paid for, not sponsored; whether that avoids the
  10-sponsored-commits limit seen on the local stack (Nov 18) has not been tested on devnet.
- Its Solana escrow (`["balance", keeper, 255]`) is the account MagicBlock can charge for Magic Actions. On devnet:
  keeper `TRpZrvYjB4nBqpq36kEzoghkG7RMipuMZirFbXBwyPK`, escrow `FxRMULTCDTT4xXbiwdacGDPtn5J9cM9jK2hqq8Jj13nE`;
  its balance has not changed on devnet (0.05065024 SOL before the Nov 25 runs and on Nov 27), so no Magic Action has been charged to it so far.
- `keeper.ticks` and `keeper.finished` count crank ticks and finished games; the app's "Live on MagicBlock" screen
  shows them.

### Session keys
- `lock_pick_session` (TEE rollup) and `call_round_session` let a player's MagicBlock session key (`session-keys`
  `=3.1.1`, `gpl_session`) lock a pick or call a Royale round, so the wallet is not asked mid-game. The token must be
  the player's, for this program and this signer, and unexpired.
- Deployed on devnet (upgrade `2bfRV8kM…`, Nov 25). The devnet cranked-Royale test made its round calls with a session
  key. The app uses them too: one wallet signature creates a 6-hour session key kept on the device (`ensureSession` in
  `app/src/chain/client.ts`; the sponsor pays its rent and the relay only sponsors a Clashy session with no SOL top-up
  and at most a day), then the private-duel pick lock and every Royale call are signed by that key. Played on devnet
  through the app: duel `3qa893zcqdm9WpPAGJMdjfxZqUXFvhr1U2A2ZdHwuT8t`, both picks landed as `LockPickSession`.

## Versions

- `ephemeral-rollups-sdk = "=0.18.0"` (`anchor-compat`, `vrf`, `crank`, `access-control`): the last release that keeps
  Anchor 0.32 support and runs on validator 1.x and 2.0. TS SDK `@magicblock-labs/ephemeral-rollups-sdk 0.18.0`.
- The local stack is MagicBlock validator 1.1.1 over an Agave 4.5.0-beta.0 base, the same versions as devnet, with
  devnet's own feature set cloned into genesis (`scripts/localnet.sh`).

## Tests

```bash
bash scripts/localnet.sh
```

```bash
npx tsx --test --test-concurrency=1 tests/magicblock.test.ts
```

| Test | Proves |
|---|---|
| a cranked duel finishes and pays out on Solana with no transaction after the start | crank ticks score the duel, the keeper commits, the Magic Action pays, Elo moves (about 30 s after start for a 30 s duel) |
| a cranked Royale resolves every round and pays the survivors with no resolve or settle call | tick_round resolves each round at its bell; the payout is split by the Magic Action |
| private duel: picks locked inside the MagicBlock Private Ephemeral Rollup … | the PER flow above |
| the keeper cannot be abused | only the admin delegates or creates the keeper |
| (in tests 1 to 3) | the finishing tick cancelled the crank and no failed tick followed in the next 8 s |

Results (Nov 25):

| Where | Result | Log |
|---|---|---|
| Local stack | 4/4 pass; cranked duel settled 30.6 s after the start, keeper ticks 63 → 94; cranked Royale paid 5.82 USDC | `chain/evidence/suite-magicblock.log` |
| Devnet TEE, run 1 | 3/4 pass; cranked duel on BTC, 31 ticks, settled by the Magic Action 31.8 s after the start; cranked Royale paid 5.82 USDC (the log does not print the session-key calls); keeper abuse. The private duel failed on a devnet mint timeout while funding a test player | `chain/evidence/devnet-mb-test.log` |
| Devnet TEE, run 2 | private duel passed; A sees side 1, B sees nothing | `chain/evidence/devnet-private.log` |
| Local stack, after the crank-cancel fix | 4/4 pass, crank cancelled after each game | `chain/evidence/suite-magicblock-cancel.log` |
| Devnet TEE, after the crank-cancel fix (upgrade `3LJSPdfk…`) | 4/4 pass in one run: cranked BTC duel settled 31.6 s after the start; cranked Royale paid 5.82 USDC; private duel, A sees side 1, B sees nothing; no failed tick in the 8 s after any finish | `chain/evidence/devnet-mb-cancel.log`, trail `chain/evidence/devnet-proof3.txt` |
| Devnet, through the app | private ETH duel, two device wallets, B won +9.70 USDC; 100 transactions, 88 on the rollup | `chain/evidence/devnet-proof.txt` |
| Devnet, through the app (Nov 26) | private ETH duel (99 transactions, 89 on the rollup), 3-player Royale with 12 session-key calls (93, 84 on the rollup), squad war (18 Solana transactions) | `chain/evidence/devnet-proof-nov26.md` |
