# Testing

Every on-chain test runs against real validators: the real Clashy program, MagicBlock's delegation program and a real
`ephemeral-validator` rollup, with live Coinbase prices. Nothing is mocked or stubbed.

| Suite | Command | Count | Last result |
|---|---|---|---|
| Program unit tests (math, chest shares, price scaling) | `cargo test -p clashy --lib` | 11 | 11 pass (Nov 16, 2026) |
| End-to-end on the local MagicBlock stack | `npx tsx --test --test-concurrency=1 tests/clashy.test.ts` | 5 | 5 pass in 137 s on a fresh stack (Nov 16, 2026); log `.localnet/e2e-last.log` |
| Mainnet-fork trade on Phoenix | `npx tsx scripts/fork-trade.ts 1` | 1 | sold 1 SOL for 54.660103 USDC, book expected 54.660103 |
| App on-chain duel, two browser tabs | Playwright: two contexts on `/onchain` | 5 duels | all settled, no errors; the latest coin rolled by MagicBlock VRF (Nov 16, 2026) |
| App on-chain clan, two browser tabs | Playwright: two contexts on `/onchain-clan` | 1 full flow | create, join, deposit, propose, vote, execute, close; no errors (Nov 16, 2026) |
| App clan war, two captains | Playwright: two contexts on `/onchain-clan` | 2 wars | declare, accept, a 20× trade inside the window, settle; one lost (-0.96%), one won (+0.16%); winner's shares worth 0.594 SOL from 0.5 |
| App on-chain Royale, three players | Playwright: three contexts on `/onchain-royale` | 2 tournaments | host + 2 joins, VRF-rolled coin (ETH), rollup start, 2 rounds, survivor paid 0.1455 SOL; no errors |

## Local stack

```bash
bash scripts/localnet.sh          # base :8999 (mb-test-validator + committor), ER :7799, deploys the program
npx tsx scripts/crank.ts          # only needed for the app; the tests run their own crank
```

## End-to-end tests (`tests/clashy.test.ts`)

1. **Knockout duel:** open → join → roll → sealed picks → live on the ER → settle with rake and Elo.
   Last run: ETH 1,819.91 → 1,819.73; creator long 50× -0.49%, joiner short +0.49%; joiner won; ratings 984 / 1016.
   (A run before the precision fix scored a 0.38 bp BTC move at 50× as 0/0; P&L now applies leverage before
   dividing.)
2. **Challenge board:** an unmatched challenge refunds in full with no rake, and joining your own challenge is refused.
3. **MagicBlock VRF:** with `vrf_required = true` the commit-reveal roll is refused (`VrfRequired`), a callback signed
   by anyone but MagicBlock's VRF identity is refused, and a real request to MagicBlock's VRF program is answered by
   their `vrf-oracle`. Last run: ETH rolled in 1,319 ms.
4. **Clans and wars:** chest deposits, deposit-weighted votes, the captain executes and closes at the oracle price, and
   the war settles to the better return. The rollup feed's stale Solana copy is refused (`FeedInvalid`); the trade
   reads the crank's base feed. After the war a member cashes out all their shares for exactly their pro-rata part,
   and a war stake over half the chest is refused (`WarStakeTooBig`). Last run: long SOL 5× at 71.85 → 71.84
   (P&L -0.000625 SOL), war -2 vs 0 bps so the other clan won; the member who put in 1 of 3 SOL cashed out
   0.8333 SOL of the 2.5 SOL chest left after the lost 0.5 SOL stake.
5. **Royale tournament:** entries escrowed, calls and rounds on the ER, survivors split the pot. Last run on BTC:
   lives 1 / 0 / 0, so one survivor took 0.1455 SOL (0.15 SOL pot minus 3% rake).

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

- **VRF on devnet/mainnet:** proven locally with MagicBlock's `vrf-oracle`; their hosted oracles are untested until the
  devnet deploy (BLOCKED on ~12.5 devnet SOL).
- **Devnet and mainnet:** not deployed.
- **Clan positions on a real venue:** clan trades are scored at the oracle price, not filled on Phoenix.
