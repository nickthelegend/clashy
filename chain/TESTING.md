# Testing

Every on-chain test runs against real validators: the real Clashy program, MagicBlock's delegation program and a real
`ephemeral-validator` rollup, with live Coinbase prices. Nothing is mocked or stubbed.

| Suite | Command | Count | Last result |
|---|---|---|---|
| Program unit tests (math, price scaling) | `cargo test -p clashy --lib` | 9 | 9 pass (Nov 16, 2026) |
| End-to-end on the local MagicBlock stack | `npx tsx --test --test-concurrency=1 tests/clashy.test.ts` | 5 | 5 pass in 135 s (Nov 16, 2026); log `.localnet/e2e-last.log` |
| Mainnet-fork trade on Phoenix | `npx tsx scripts/fork-trade.ts 1` | 1 | sold 1 SOL for 54.660103 USDC, book expected 54.660103 |
| App on-chain duel, two browser tabs | Playwright: two contexts on `/onchain` | 3 duels | 3 settled, no errors (Nov 16, 2026) |
| App on-chain clan, two browser tabs | Playwright: two contexts on `/onchain-clan` | 1 full flow | create, join, deposit, propose, vote, execute, close; no errors (Nov 16, 2026) |

## Local stack

```bash
bash scripts/localnet.sh          # base :8999 (mb-test-validator + committor), ER :7799, deploys the program
npx tsx scripts/crank.ts          # only needed for the app; the tests run their own crank
```

## End-to-end tests (`tests/clashy.test.ts`)

1. **Knockout duel:** open → join → roll → sealed picks → live on the ER → settle with rake and Elo.
   Last run: rolled SOL, entry 71.94 → exit 71.93; creator long 50× -0.5%, joiner short +0.5%; joiner won;
   ratings 984 / 1016.
2. **Challenge board:** an unmatched challenge refunds in full with no rake, and joining your own challenge is refused.
3. **VRF required:** with `vrf_required = true` the commit-reveal roll is refused (`VrfRequired`).
4. **Clans and wars:** chest deposits, deposit-weighted votes, the captain executes and closes at the oracle price, and
   the war settles to the better return. The rollup feed's stale Solana copy is refused (`FeedInvalid`); the trade
   reads the crank's base feed. Runs so far: long SOL 5× at 71.30 → 71.24 (P&L -0.005 SOL, war -16 vs 0 bps, the
   0 bps clan won); and 71.96 → 71.96 (flat, war tied, stakes refunded).
5. **Royale tournament:** entries escrowed, calls and rounds on the ER, survivors split the pot. Last run on BTC:
   lives 0 / 1 / 0, so one survivor took 0.1455 SOL (0.15 SOL pot minus 3% rake).

Running the crank for the app caught a real limit: the MagicBlock rollup sponsors only 10 commits per delegated account, which broke
the crank's 30-second feed commits after five minutes. Solana-side reads now use base feeds (see README).

## Mainnet fork

```bash
bash scripts/forknet.sh           # :8911, clones Phoenix + the SOL/USDC market, vaults and USDC mint from mainnet
npx tsx scripts/fork-trade.ts 1
```

Last run: tx `3Lt4EHkaHBH84DFHGQ8usoXrDN3DCK8JhnBhouCGvfCtEXCLnLpupgJmYDy3dV8ZdJw9eYeX8FkBcUGSwFDh5rEK` on the fork
(not on mainnet). The forked book's best bid was 60.03 against a ~71 market price, so the 1 SOL sell walked the book to
54.66. Report in `.forknet/last-trade.json`.

## App on-chain duel (two players in the browser)

With the local stack and `scripts/crank.ts` running and the app on `npx expo start --web`, two Playwright browser
contexts (two device wallets) open `/onchain`, fund and create players, open a 0.1 SOL duel, join it from the second
tab, pick Long 50× and Short 50×, and wait for the rollup start, the checks and the settlement. Three runs on Nov 16:

| Coin | Entry → exit | Result |
|---|---|---|
| ETH | 1,817.62 → 1,818.68 | long won, +2.5% / -2.5% |
| SOL | 71.45 → 71.40 | short won, +3.0% / -3.0% |
| ETH | 1,820.75 → 1,822.96 | long won, +6.0% / -6.0% |

Each run: about 30 rollup checks at an average of ~10 ms each; the Solana steps (reveal, delegate, settle) take
~0.4–0.5 s each on the local validator.

## Not covered

- **VRF fulfilment:** MagicBlock VRF oracles only run on devnet and mainnet. BLOCKED on ~6 devnet SOL for the deploy.
- **Devnet and mainnet:** not deployed.
- **Clan positions on a real venue:** clan trades are scored at the oracle price, not filled on Phoenix.
