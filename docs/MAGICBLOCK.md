# Clashy on MagicBlock

Clashy is a PvP trading game. Two players stake USDC and call the same coin; the best call wins the pot. Each part of
a clash runs on a different piece of MagicBlock's stack. This page names each piece, where it is in the code and the
test that proves it.

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

After step 5 nobody sends another transaction: the rollup finishes the game and pays it out by itself.

## The pieces

### Ephemeral Rollup (delegation, commit and undelegate)
- Duels, Royales, price feeds, the public calls board and squad chat channels are delegated to the pinned rollup
  validator (`set_er_validator`; a member can never pick a validator).
- Code: `delegate_duel`, `delegate_private_duel`, `delegate_tournament`, `delegate_feed`, `delegate_board`,
  `delegate_channel`, `delegate_keeper`; commits in `check_duel`, `tick_duel`, `tick_round`, `void_*`,
  `abandon_private_duel` (`chain/programs/clashy/src/lib.rs`).
- Moves on the rollup cost nothing. Players hold 0 SOL; a sponsor relay pays every Solana fee and rent.

### VRF
- `request_coin_roll` / `request_tournament_coin` ask MagicBlock VRF for the coin; only the VRF program's
  `coin_roll_callback` / `tournament_coin_callback` can set it (`#[vrf_callback]` checks the scoped identity).
- `vrf_required = true` on devnet refuses the commit-reveal fallback and forged callbacks
  (`tests/clashy.test.ts`, "MagicBlock VRF rolls the coin").

### Private Ephemeral Rollup (TEE) for sealed picks
- `open_private_picks` creates one `Pick` account per player and pre-funds each with the rent of its permission.
- `lock_pick` (on the rollup, signed by the player) creates the Pick's ephemeral permission, private with that player
  as the only member, and writes side and leverage. The rival cannot read it; a second lock is refused.
- `start_private_duel` refuses to start until both picks are locked. It then copies them into the duel, flips both
  permissions public, starts the clock, schedules the crank and sends the Picks home. `close_pick` returns their rent
  after settlement. `abandon_private_duel` refunds both stakes if a player never locks.
- This replaces four Solana commit-reveal transactions with one free, instant move per player.
- Test: `tests/magicblock.test.ts`, "private duel". It checks that a player cannot write the rival's pick (seeds
  constraint), there is no start before both locks, a locked pick cannot change, the picks are copied into the duel at
  the start, the clash settles itself, and the picks are closed for their rent.

### Cranks (scheduled tasks on the rollup)
- `start_duel_cranked` / `start_tournament_cranked` / `start_private_duel` schedule a task (`ScheduleCrankCpi`, signed
  by the keeper PDA) that runs `tick_duel` / `tick_round` every 1,000 ms until the bell plus the void grace.
- Ticks are idempotent: a tick on a game that is not due returns OK. A finished tick commits through the keeper.
- Validator 1.1.1 runs these with its built-in scheduler: mainnet and MagicBlock's devnet TEE run 1.1.1, and so does
  the local stack used for the tests. Task ids are derived from the game's address, so two games never collide.

### Real-time pricing oracle
- SOL, BTC and ETH read MagicBlock's Pyth Lazer feeds on the rollup (`PriCems5…`, ids 6, 1 and 2).
  `read_price` (`price.rs`) checks owner, discriminator, positive price and freshness (15 s on the rollup).
- MagicBlock's account stores the exponent as a positive decimal count (+8); `oracle_exponent` reads it as decimals.
  A unit test decodes a real devnet SOL account (`price::tests::reads_a_real_magicblock_oracle_account`).
- Tokenized stocks (no MagicBlock feed) keep Clashy's own crank-pushed feeds.

### Magic Actions (settlement on Solana in the same intent)
- `settle_duel_action` / `settle_tournament_action` build a post-undelegate `CallHandler` with every account
  settle_duel / settle_tournament needs (vault, auth, players' USDC accounts, Elo records, treasury, rent payer).
- Attached in `check_duel`, `void_duel`, `tick_duel`, `resolve_round`, `void_tournament`, `tick_round` and
  `abandon_private_duel`. Actions are not atomic. If one ever fails, the game still comes home FINISHED and anyone
  can call settle by hand (the app does so after 8 s), so money is never stuck.
- Tests: every duel and Royale in `tests/clashy.test.ts`, `perps.test.ts`, `void.test.ts` and `magicblock.test.ts`
  now comes home already settled. `settledByAction` records whether the action or a manual settle paid it.

### Keeper (a delegated fee payer PDA)
- A scheduled instruction carries no wallet signature, so the `keeper` PDA (seeds `["keeper"]`, delegated once by the
  admin) signs the commits and pays for Magic Actions through the validator's magic fee vault
  (`["magic-fee-vault", validator]`). This also removes the 10-sponsored-commits limit.
- Its Solana escrow (`["balance", keeper, 255]`) holds SOL for the actions.
- `keeper.ticks` and `keeper.finished` count crank ticks and finished games; the app's "Live on MagicBlock" screen
  shows them.

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
