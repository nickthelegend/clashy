# Clashy on-chain

The Clashy Anchor program (`programs/clashy`, Anchor 0.32.1, MagicBlock `ephemeral-rollups-sdk` `=0.18.0` with the
`anchor-compat`, `vrf`, `crank` and `access-control` features, and `session-keys` `=3.1.1`). It holds all the money
logic: escrow, coin roll, sealed picks (commit-reveal or private picks on MagicBlock's TEE rollup), live scoring on a
MagicBlock Ephemeral Rollup by a crank, settlement on Solana by a Magic Action, clans, clan wars and tournaments.

| | |
|---|---|
| Program id | `FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS` (keypair in `.keys/`, gitignored) |
| Rollup | MagicBlock Ephemeral Rollup: duels and tournaments are delegated, scored there every check, and committed back. On devnet: MagicBlock's Private Ephemeral Rollup (TEE) `https://devnet-tee.magicblock.app`, validator `MTEWGuqx…xzo` |
| Cranks and keeper | `start_duel_cranked`, `start_tournament_cranked` and `start_private_duel` schedule `tick_duel` / `tick_round` every 1,000 ms on the rollup. The delegated `keeper` PDA signs the commits; a Magic Action runs `settle_duel` / `settle_tournament` on Solana in the same intent |
| Randomness | MagicBlock VRF rolls the coin (queue in the config: base queue `Cuj97ggr…` on devnet and mainnet, MagicBlock's test queue `GKE6d7…` on the local stack, answered by their `vrf-oracle`). Callbacks need MagicBlock's VRF identity signature. With `vrf_required = true` the commit-reveal fallback is refused |
| Prices | A crank pushes live Coinbase prices into delegated `PriceFeed` accounts on the rollup every second (duels, tournaments), and into never-delegated base feeds on Solana every 5 s (clan trades; one transaction for all coins). The program also reads MagicBlock's pricing-oracle accounts (`PriCems5…`, PriceUpdateV2 layout). On devnet SOL, BTC and ETH read MagicBlock's oracle; the crank's rollup feeds are used only for the five stocks |
| Money | **USDC only.** Every stake, chest, war pot and entry is a USDC token account owned by the program's `auth` PDA. A player's wallet never needs SOL: the sponsor relay pays every fee and rent |
| Wallets | Privy (web): email or Google sign-in makes a Solana wallet that holds USDC. Phones and automated tests use a device test key on the local stack |
| Deployed | Solana devnet since Nov 22, 2026, upgraded three times on Nov 25 (see [docs/DEVNET.md](../docs/DEVNET.md)). Upgrade authority: one deployer key. Mainnet: **not deployed** |

## Money: USDC in, no SOL ever

- **Stakes are USDC.** `open_duel`, `join_duel`, `join_tournament` and `deposit_chest` move USDC from the player's own
  USDC account (checked: right mint, owned by the signer). Payouts go only to each player's own USDC account; Royale
  payouts check every account in the list. The vaults are token accounts at program PDAs owned by one `auth` PDA.
- **Fees and rent come from a sponsor.** Every instruction that creates an account takes a separate `payer` signer and
  records it as `rent_payer`; when a vault empties (settle, cancel, abort) it is closed and the rent goes back to that
  payer, and a member's account rent goes back to it on leave (never to the member).
- **The sponsor relay** (`scripts/sponsor.ts`, port 8790) is the fee payer of every app transaction. It co-signs only
  Clashy player instructions (never admin, feed or VRF-callback ones), Compute Budget, creating a USDC account, and a
  USDC `TransferChecked` out of the signer's own account (withdrawals). The sponsor key may sit only in `payer` /
  `rent_payer` slots. Every other signature must already be valid. With `CLASHY_PRIVY_APP_ID` and
  `CLASHY_PRIVY_APP_SECRET` in `chain/.env` (gitignored) it verifies the Privy access token and that every signing
  wallet belongs to that user; off the local stack that check is mandatory. Per-wallet rate limit 40 tx / 10 s.
- **Local fork USDC.** `scripts/usdc-mint.ts` loads mainnet USDC's mint address (`EPjF…Dt1v`, 6 decimals) into the
  local validator with the local admin key as mint authority, so the relay's `/faucet` can hand out 100 test USDC.
  On devnet a separate test-USDC mint (`8Jb66C…iXEN`, no value) has a faucet limited to signed-in users, one claim per
  wallet a day and five per IP an hour. Mainnet has no faucet: players bring USDC (or buy it through Privy's funding flow).

## What the program does

**Knockout duel (quick match).** Two players, one coin rolled for both.
1. `open_duel` escrows the creator's stake in a vault PDA; `join_duel` escrows the joiner's. An unmatched challenge
   can be cancelled for a full refund (no rake).
2. `request_coin_roll` asks MagicBlock VRF for randomness; `coin_roll_callback` (only the VRF program can call it)
   picks the coin from the duel's pool. Local fallback: `reveal_seed` from both players, coin = sha256(seed_a ‖ seed_b).
3. `commit_pick` / `reveal_pick`: long or short and leverage, sealed by commit-reveal so neither player sees the other's
   side first. Or the private path: `open_private_picks`, `delegate_private_duel`, then `lock_pick` on the TEE rollup
   writes each pick into an account only its player can read (`lock_pick_session` does the same with a MagicBlock
   session key).
4. `delegate_duel` hands the duel to the rollup; `start_duel` records the entry price there; `check_duel` scores both
   sides on every call and, on a knockout or at the bell, commits and undelegates back to Solana. The cranked starts
   (`start_duel_cranked`, `start_private_duel`) schedule `tick_duel` every second instead, so no player has to call.
5. `settle_duel` pays the winner in USDC minus the rake, closes the vault (its rent back to the sponsor) and updates Elo
   and RP. After a cranked game it runs as a Magic Action; if the action fails, anyone can call it by hand.

**Clans.** `create_clan` / `join_clan` / `leave_clan`. The chest is held as shares: `deposit_chest` mints shares at
the chest's current value and `withdraw_chest` redeems shares for their pro-rata part, so a war win or loss is shared
by every member whatever order they leave in. Group trades go by share-weighted vote: `propose` → `vote` → captain
`execute_proposal` opens a position at the Solana price (early once yes holds over half of all shares) →
`close_position` books its P&L to the clan score. Positions are scored at the price; they are **not** venue fills.

**Clan wars.** `declare_war` / `accept_war` / `cancel_war` / `settle_war`: both captains stake the same amount from their
chests (at most half a chest), and when the window ends the clan with the better return from closed trades takes the
pot minus rake into its chest. A tie refunds both.

**Tournaments (Royale).** Up to 16 players: `create` / `join` / `cancel_tournament`, a VRF coin
(`request_tournament_coin`), then on the rollup `start_tournament`, `call_round` (each player calls up or down;
`call_round_session` with a session key), `resolve_round` (wrong calls lose a life, commits each round).
`settle_tournament` splits the pot among survivors. `start_tournament_cranked` lets `tick_round` resolve each round at
its bell.

## Run it

```bash
npm install
bash scripts/localnet.sh            # base :8999 + MagicBlock ER :7799 + MagicBlock vrf-oracle, deploys the program (CLASHY_RESET=1 for genesis)
npx tsx scripts/crank.ts            # live prices: rollup every 1 s, Solana base feeds every 5 s
npx tsx scripts/sponsor.ts          # fee/rent sponsor relay + local test-USDC faucet (:8790)
npx tsx --test --test-concurrency=1 tests/clashy.test.ts
npx tsx --test tests/sponsor.test.ts
```

The app's on-chain screens (`/onchain`, `/onchain-royale`, `/onchain-clan`) talk to the same stack and relay by
default (`EXPO_PUBLIC_CLASHY_BASE`, `_ER`, `_NET`, `_ER_VALIDATOR`, `_SPONSOR` point them elsewhere). On web they sign
in with Privy (`EXPO_PUBLIC_PRIVY_APP_ID` in `app/.env.local`); `EXPO_PUBLIC_CLASHY_DEV_WALLET=1` swaps in a device
test key per browser tab for automated multi-player runs.

**Devnet / mainnet.** `scripts/deploy.sh devnet|mainnet` checks the admin balance against the program's rent, deploys,
then runs first-time setup with VRF required on MagicBlock's base queue. It needs `CLASHY_AUTHORITY` (keypair path),
`CLASHY_TREASURY`, `CLASHY_ER` and `CLASHY_ER_VALIDATOR`, prints "Setup required" when one is missing, and refuses
mainnet unless `CLASHY_MAINNET_GO=yes`. The crank then runs as a service with the same environment.

**Mainnet fork.** `bash scripts/forknet.sh` clones Phoenix and its SOL/USDC market from mainnet into a local validator
on :8911; `npx tsx scripts/fork-trade.ts 1` sells 1 SOL into the real resting bids of that fork.

## Security

A review of the fund paths (Nov 16) found three high, three medium and five low issues. Fixed, with attack tests where
a test can reach them (the Nov 25 crank, keeper, Magic Action, TEE and session-key code has not been reviewed yet):

- **Delegation lock (high).** Anyone could push any duel or tournament into the rollup, freezing its escrow. Now only a
  rolled duel with both picks revealed (by one of its players) or an open, coin-rolled tournament with 2+ players (by
  its creator) can be delegated, and only to the admin-pinned validator.
- **Buying into a war (high).** Deposits mid-war mispriced shares and let an outsider take the pot. Deposits now wait
  for the war to settle.
- **Parked losing trades (high).** Only closed trades counted in a war, so a captain could hedge and leave the losing
  leg open. Both clans must be flat at accept and at settle, positions open only inside the window, and anyone can
  close a clan's positions after it.
- **Stuck duels and lobbies (medium).** `abort_duel` refunds a matched duel that never reaches the rollup within
  10 minutes (or forfeits it to the only player who revealed). Anyone can cancel a tournament lobby after an hour.
- **1-lamport griefing (medium).** Final refunds and full cash-outs sweep the vault instead of paying fixed amounts.
- **Low:** pick hashes bind the duel and player (no copying a rival's hash), Solana-side trades read one price source,
  withdrawals wait for open votes (no voting twice with the same money), and unexecuted votes can be closed.

**Trust that remains:**
- The program is upgradeable by one deployer key (`6XdpT4…nYbe`), and `update_config` lets the admin change the rake
  (up to 10%), the treasury and `vrf_required`. A Squads multisig is the mainnet plan; it is not done.
- The crank key sets the stock prices (bounded only by freshness checks); SOL, BTC and ETH come from MagicBlock's oracle
  on devnet. The closing price of a duel is the feed at the first tick or check after the bell (up to 15 s old).
- The sponsor key pays fees and rent: the relay's filter, Privy check and rate limit bound what it pays for. Player,
  proposal, vote and position accounts are not closed; `close_duel` returns a duel's rent 14 days after it ends.
- Magic Actions are not atomic with the commit: a failed action leaves the game FINISHED on Solana until someone calls
  settle by hand (the app does after 8 s).

## Status

- **Devnet: deployed.** Program `FQKy8f…wdS` since Nov 22, 2026; four upgrades on Nov 25 (cranks, keeper, Magic
  Actions, private picks, oracle, `admin_undelegate`; session keys; the VRF callback fix and the 0.5% Stash trading
  fee; the finishing tick cancels its crank). Program data account 1,605,240 bytes; the last build is 1,583,160 bytes. Rollup: MagicBlock's TEE
  (`devnet-tee.magicblock.app`); its transactions need an auth token (30 days), public reads need none. On Nov 25 all
  four `tests/magicblock.test.ts` tests passed there in one run (after the crank-cancel upgrade), and two players played a private duel through the
  app (`../docs/DEVNET.md`, `evidence/devnet-proof.txt`).
- **Local MagicBlock stack: works end to end, in USDC.** MagicBlock validator 1.1.1 over Agave 4.5.0-beta.0 with
  devnet's feature set. Latest runs (Nov 25): magicblock 4/4, clashy 5/5 (the VRF test passed after its fix), perps
  3/3, brief 9/9, void 1/1, 13/13 Rust unit tests (see [TESTING.md](TESTING.md)); every test player holds USDC and
  exactly 0 SOL. Browser players ran full duels, a clan trade, a clan war and a three-player Royale through the app
  (Nov 16, manual multi-tab runs).
- **Privy:** the Clashy app exists in Privy's dashboard (owner's statement); the web app signs in with it and the relay
  verifies its tokens with the app secret. A real Privy sign-in needs a person (email code or Google), so automated runs
  use device keys.
- **VRF: proven locally and on devnet.** MagicBlock's validator CLI ships `vrf-oracle` and their test queue; the local
  stack runs it (last roll 1,083 ms). On devnet the hosted oracle answers through queue `Cuj97ggr…`. A forged callback
  is refused. The Nov 25 local VRF failure came from SDK 0.18's `#[vrf_callback]` evaluating a const fn at run time
  (over 200k compute units); a compile-time `VRF_IDENTITY` fixed it.
- **Session keys:** `lock_pick_session` and `call_round_session` are deployed on devnet; the cranked Royale test made its
  round calls with one. The app does not use them yet.
- **Practice clash against Clashy Bot (no testnet needed):** the real 60-second clash with Practice money, played on
  the same live rollup price feeds real clashes settle on (read only, nothing is sent). Clashy Bot takes the other side
  of every call.
- **Mainnet: not deployed.** The program data account is 1,605,240 bytes: 8.155 SOL rent-exempt; a deploy briefly
  holds about twice that (buffer plus program data) and returns the buffer. The sponsor also needs SOL for fees and
  rent. It needs real SOL and Nick's go-ahead. Real money stays off until then.
- **Why base feeds:** on the local stack (Nov 18), MagicBlock sponsored only 10 commits per delegated account
  ("sponsored commit limit exceeded … current commit nonce 10 reached the limit of 10"), so committing the rollup feeds
  back to Solana every 30 s stopped after 10 commits. Duels and tournaments commit once, when they finish. This limit
  has not been re-tested on the devnet TEE.
- **Clan trades are paper.** They are scored at the Solana base-feed price. The Phoenix swap on the fork is a
  standalone script, not called from the chest.
- **Phoenix spot is too thin for duels.** On the fork, best bid 60.03 against a ~71 market; selling 1 SOL filled at
  54.66 USDC. Duels therefore settle on price, not on venue fills.

MIT licence, see `../LICENSE`.
