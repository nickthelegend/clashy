# Clashy on-chain

The Clashy Anchor program (`programs/clashy`, Anchor 0.32.1, MagicBlock `ephemeral-rollups-sdk` 0.17 with the
`anchor-compat` and `vrf` features). It holds all the money logic: escrow, coin roll, sealed picks, live scoring on a
MagicBlock Ephemeral Rollup, settlement on Solana, clans, clan wars and tournaments.

| | |
|---|---|
| Program id | `FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS` (keypair in `.keys/`, gitignored) |
| Rollup | MagicBlock Ephemeral Rollup: duels and tournaments are delegated, scored there every check, and committed back |
| Randomness | MagicBlock VRF rolls the coin (queue in the config: base queue `Cuj97ggr…` on devnet and mainnet, MagicBlock's test queue `GKE6d7…` on the local stack, answered by their `vrf-oracle`). Callbacks need MagicBlock's VRF identity signature. With `vrf_required = true` the commit-reveal fallback is refused |
| Prices | A crank pushes live Coinbase prices into delegated `PriceFeed` accounts on the rollup every second (duels, tournaments), and into never-delegated base feeds on Solana every 5 s (clan trades; one transaction for all coins). The program also accepts MagicBlock's pricing-oracle accounts (`PriCems5…`, PriceUpdateV2 layout) |
| Deployed | Local MagicBlock stack only. Devnet and mainnet: **not deployed** (see Status) |

## What the program does

**Knockout duel (quick match).** Two players, one coin rolled for both.
1. `open_duel` escrows the creator's stake in a vault PDA; `join_duel` escrows the joiner's. An unmatched challenge
   can be cancelled for a full refund (no rake).
2. `request_coin_roll` asks MagicBlock VRF for randomness; `coin_roll_callback` (only the VRF program can call it)
   picks the coin from the duel's pool. Local fallback: `reveal_seed` from both players, coin = sha256(seed_a ‖ seed_b).
3. `commit_pick` / `reveal_pick`: long or short and leverage, sealed by commit-reveal so neither player sees the other's
   side first.
4. `delegate_duel` hands the duel to the rollup; `start_duel` records the entry price there; `check_duel` scores both
   sides on every call and, on a knockout or at the bell, commits and undelegates back to Solana.
5. `settle_duel` pays the winner (rake first, so the vault never drops below rent-exempt) and updates Elo and RP.

**Clans.** `create_clan` / `join_clan` / `leave_clan`. The chest is held as shares: `deposit_chest` mints shares at
the chest's current value and `withdraw_chest` redeems shares for their pro-rata part, so a war win or loss is shared
by every member whatever order they leave in. Group trades go by share-weighted vote: `propose` → `vote` → captain
`execute_proposal` opens a position at the Solana price (early once yes holds over half of all shares) →
`close_position` books its P&L to the clan score. Positions are scored at the price; they are **not** venue fills.

**Clan wars.** `declare_war` / `accept_war` / `cancel_war` / `settle_war`: both captains stake the same amount from their
chests (at most half a chest), and when the window ends the clan with the better return from closed trades takes the
pot minus rake into its chest. A tie refunds both.

**Tournaments (Royale).** Up to 16 players: `create` / `join` / `cancel_tournament`, a VRF coin
(`request_tournament_coin`), then on the rollup `start_tournament`, `call_round` (each player calls up or down),
`resolve_round` (wrong calls lose a life, commits each round). `settle_tournament` splits the pot among survivors.

## Run it

```bash
npm install
bash scripts/localnet.sh            # base :8999 + MagicBlock ER :7799 + MagicBlock vrf-oracle, deploys the program (CLASHY_RESET=1 for genesis)
npx tsx scripts/crank.ts            # live prices: rollup every 1 s, Solana base feeds every 5 s
npx tsx --test --test-concurrency=1 tests/clashy.test.ts
```

The app's **On-chain duel** screen (`app/src/app/onchain.tsx`) talks to the same stack by default
(`EXPO_PUBLIC_CLASHY_BASE`, `_ER`, `_NET`, `_ER_VALIDATOR` point it elsewhere). Open it in two browser tabs: each tab
gets its own device test wallet.

**Mainnet fork.** `bash scripts/forknet.sh` clones Phoenix and its SOL/USDC market from mainnet into a local validator
on :8911; `npx tsx scripts/fork-trade.ts 1` sells 1 SOL into the real resting bids of that fork.

## Status

- **Local MagicBlock stack: works end to end.** 5/5 end-to-end and 10/10 unit tests pass (see [TESTING.md](TESTING.md)).
  Browser players ran full duels, a clan trade, a clan war and a three-player Royale through the app.
- **VRF: proven locally with MagicBlock's own oracle.** MagicBlock's validator CLI ships `vrf-oracle` and their test
  queue; the local stack runs it, and duels and Royales get their coin from a real VRF callback (about 1.3 s). A forged
  callback is refused. **BLOCKED:** the devnet deploy (against MagicBlock's hosted oracles) needs about 6 devnet SOL;
  the devnet faucet rate-limited the airdrop twice, and the web faucet needs a sign-in and a CAPTCHA.
- **Mainnet: not deployed.** Needs real SOL: the 870 KB program is 4.42 SOL rent-exempt (`solana rent 870000`), more if deployed with upgrade headroom, plus an equal temporary buffer during the deploy that is refunded, and Nick's
  go-ahead. Real money stays off until then.
- **Why base feeds:** MagicBlock sponsors only 10 commits per delegated account ("sponsored commit limit exceeded …
  current commit nonce 10 reached the limit of 10"), so committing the rollup feeds back to Solana every 30 s stopped
  after 10 commits. Duels and tournaments commit once, when they finish, so they are not affected.
- **Clan trades are paper.** They are scored at the oracle price. The Phoenix swap on the fork is a standalone script,
  not called from the chest.
- **Phoenix spot is too thin for duels.** On the fork, best bid 60.03 against a ~71 market; selling 1 SOL filled at
  54.66 USDC. Duels therefore settle on price, not on venue fills.

MIT licence, see `../LICENSE`.
