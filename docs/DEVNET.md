# Clashy on Solana devnet + MagicBlock (deployed Nov 22, upgraded Nov 25, 2026)

## What is deployed

| Piece | Value |
|---|---|
| Program | [`FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS`](https://explorer.solana.com/address/FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS?cluster=devnet): program data account 1,605,285 bytes (1,605,240 bytes of program space after its 45-byte header), upgrade authority `6XdpT4…nYbe` (the deployer key, kept on the Mac; one key, no multisig) |
| Upgrades (Nov 25) | [`4VJAbxj2…`](https://explorer.solana.com/tx/4VJAbxj2mqY962jYCXSRhdrf86p3bGuyAkuGuhVFh8adfPC4XW32iNm7Tme8aWWdHyPXuJABskug16qnKQhGbwZw?cluster=devnet) cranks, keeper, Magic Actions, private picks, oracle, `admin_undelegate`; [`2bfRV8kM…`](https://explorer.solana.com/tx/2bfRV8kMn2X3PWXwz7fxRamt1Akd1MhSQjWTviTvc6B3ydiyXh5Z6mLbgsgXVdoNQU8CpgHCv1sYnHbXbheydEJZ?cluster=devnet) session keys (`lock_pick_session`, `call_round_session`); [`jKQqVjuN…`](https://explorer.solana.com/tx/jKQqVjuN48xpkFaKwkAwkwui86jg3nnKEx6L6CYYPLReu8zBEwQ4WVmfJMVVREFFz9vGfhaVNriYSHo6axhqSnt?cluster=devnet) VRF callback fix and the 0.5% Stash trading fee, then [`3LJSPdfk…`](https://explorer.solana.com/tx/3LJSPdfkpULiu9HnWVaJxHh3rhLTew6rpRPwvS1NVwDZvHsnKejPYj5Fv8dMDEycfNH6sVrXZV3SXyfymyU944k6?cluster=devnet) the finishing tick cancels its crank. A `solana program dump` after that upgrade matches `chain/target/deploy/clashy.so` built from this commit's source (1,583,160 bytes, sha256 `707e9cb8…2dc9b7`) plus zero padding. Logs: `chain/evidence/devnet-upgrade*.log` |
| Base RPC | `https://rpc.magicblock.app/devnet` (MagicBlock's devnet RPC; the public `api.devnet.solana.com` returned 429s during setup) |
| Ephemeral Rollup | `https://devnet-tee.magicblock.app`, MagicBlock's Private Ephemeral Rollup (TEE), validator `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`, validator 1.1.1. Transactions need an auth token (valid 30 days); public reads need none. Until Nov 25: `https://devnet-as.magicblock.app`, validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`. Feeds, boards and the squad channel were brought home from devnet-as with `admin_undelegate` and re-delegated to the TEE (`chain/evidence/devnet-migrate.log`; the first attempt timed out while pinning the validator, `devnet-migrate2.log` finished it) |
| Prices | SOL, BTC and ETH read MagicBlock's oracle accounts `ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu`, `71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr`, `5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG`. NVDA, TSLA, AAPL, SPY and GOOGL keep Clashy's crank-pushed feeds (crank `GGeCjD…`) |
| Keeper | PDA `TRpZrvYjB4nBqpq36kEzoghkG7RMipuMZirFbXBwyPK`, delegated to the TEE; escrow `FxRMULTCDTT4xXbiwdacGDPtn5J9cM9jK2hqq8Jj13nE`, the account MagicBlock can charge for Magic Actions; its balance has not changed on devnet (0.05065024 SOL before the Nov 25 runs and on Nov 27) |
| VRF | Required (`vrf_required = true`). Coin rolls use MagicBlock's base-layer queue `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh`; their devnet oracle answers in about 1 to 2 s (block-time granularity). |
| Stake currency | Clashy test USDC [`8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN`](https://explorer.solana.com/address/8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN?cluster=devnet) (6 decimals). The mint authority is the faucet key; it has no value. |
| Rake | 3% (300 bps) to treasury `6scuHR…HV3n`. The admin can change it (up to 10%) with `update_config` |
| Keys | `chain/.keys/devnet-{deployer,sponsor,crank,treasury,faucet}.json`, gitignored, never printed. Endpoints and key paths are in `chain/.devnet.env` (gitignored). |

## What was tested on devnet, Nov 25 (TEE rollup, upgraded program)

`tests/magicblock.test.ts`: after the last upgrade (`3LJSPdfk…`) all four tests passed in one run
(`chain/evidence/devnet-mb-cancel.log`: cranked BTC duel settled 31.6 s after the start; cranked Royale paid 5.82 USDC;
A sees side 1, B sees nothing; keeper abuse). Earlier that day they passed over two runs (`chain/evidence/devnet-mb-test.log`,
`chain/evidence/devnet-private.log`):

| Test | Result |
|---|---|
| Cranked duel: no transaction after the start | Passed. VRF rolled BTC; 31 crank ticks; settled by a Magic Action 31.8 s after the start |
| Cranked Royale: no resolve or settle by hand | Passed. Lives 1, 0, 0; the survivor was paid 5.82 USDC; the test makes player 1's round calls through a MagicBlock session key (the log does not print them) |
| Private duel: picks locked in the TEE, a cranked clash that settles itself | Failed in run 1 on a devnet mint timeout while funding a test player; passed in run 2. Player A's authenticated connection read A's pick (side 1); player B's read nothing |
| Keeper abuse: only the admin creates or delegates the keeper | Passed |

**Through the real app (web build, two device-wallet players, 0 SOL), Nov 25 11:33–11:35 UTC:** a private duel on
ETH (duel `3iqsLN25cTK2SMMHqLyvvQhDLKPDBfHPBEUWBjhx8PW4`). VRF rolled ETH, both picks locked in the TEE, the crank
ticked once a second for 60 s, and the result came home and was settled: ETH 1,639.80 → 1,638.63, B (down) won
+9.70 USDC, A lost 5 USDC. 100 transactions, 88 on the rollup, each with an explorer link in
`chain/evidence/devnet-proof.txt` (printed by `chain/scripts/devnet-proof.ts`). Two things show in the trail: four
failed VRF-oracle transactions before the callback landed, and 11 failed `TickDuel` retries by MagicBlock's scheduler
after the duel had gone home, after which the task was dropped. The second is fixed: since upgrade `3LJSPdfk…` (Nov 25
evening) the finishing tick cancels its crank (`chain/evidence/devnet-proof3.txt`: no failed tick after the last
`TickDuel`). In the Nov 26 film games a few runs already queued still landed within 3 s of the finish, each stopped by
the scheduler's own check before Clashy's program ran (`chain/evidence/devnet-proof-nov26.md`).

**Nov 27, through the app:** a private SOL duel (101 transactions, 89 on the rollup) and a 3-player Royale (112, 100 on
the rollup, 21 `CallRoundSession`), then, on iOS Simulators with device test wallets, a private BTC duel (94, 82 on the
rollup, 61 crank ticks) and a squad war (19 Solana transactions). The Nov 27 trails show the same pattern: 4 failed
VRF-oracle transactions before each callback and 7 or 8 scheduler runs queued before the cancel, each failed
(`chain/evidence/devnet-proof-nov27-*.txt`). The iOS duel also has one failed `StartPrivateDuel`, sent at 09:15:25,
before the second pick lock at 09:15:26; the retry at 09:15:27 started the duel.

## What was tested on devnet, Nov 22 (devnet-as rollup, first program)

Logs: `chain/evidence/devnet-test-all.log`, `devnet-test-2.log`, `devnet-test-3.log`, `devnet-test-4.log`,
`devnet-test-clashy.log`. No single run was all green; the results below are the best result per test, several after
reruns.

| Test | Result |
|---|---|
| Knockout duel: open, join, **VRF roll**, sealed picks, live on the rollup, settle with rake and Elo | Passed after reruns (VRF rolled ETH, then BTC) |
| VRF required: the commit-reveal roll and a forged callback are refused | Passed (failed once in `devnet-test-3.log`) |
| Royale: USDC entries, **VRF coin**, calls and rounds on the rollup, survivors split the pot | Passed after reruns (VRF picked AAPL) |
| Perps clash: 25× vs 25× settles at the bell | Passed after reruns |
| Perps: a 50× long is liquidated by a 2.5% drop (price staged with the crank key) | Passed after reruns |
| Leverage above 100× refused | Passed after a rerun |
| Void: a live duel nobody finishes is voided and refunds both stakes | Passed after a rerun |
| Clans: chest shares, votes, a trade closed at the Solana price, clan war | Passed |
| Squads, names, safety limits, calls feed and clan chat on the rollup | Passed |
| Rollup price feeds are live and moving | Passed (crank running) |
| Sponsor relay refusals and forged Privy token | Passed. The zero-SOL sponsored-player test failed (it needs a real Privy sign-in) |
| Stash: buy NVIDIA through Orca | Fails on devnet, which has no xStock/Orca pool; it passes on the local stack against a mainnet snapshot of the five xStock Whirlpool pools (Nov 26, `suite-brief-nov26.log`). Stash savings work. |

**Through the real app, Nov 22:** two players reported a crypto clash (VRF rolled ETH, +9.70 USDC from a $10 pot), a
perps clash (VRF rolled BTC, +9.70 USDC) and an on-chain Royale (VRF rolled SOL, 6 rounds, +3.88 USDC to the
survivor). No transaction signatures were kept for those runs; the Nov 25 duel above is the in-app proof.

**Practice games:** a Nov 22 run loaded the games on live prices and started a round in each of the 32 engines (a 33rd engine, `drawline`, came on Nov 27 and was not part of that run). The
runner and its output are not in the repo, so the per-game counts from that run are not claimed here.

## Fixed while deploying

- **Royale on a stock coin:** the app treated coins 3–7 as still rolling, so a Royale whose VRF coin was a stock could
  never start. Stock clashes also showed "…" instead of their coin.
- **The VRF test** switched VRF off when it finished. It now restores the deployment's setting.
- **VRF callbacks on SDK 0.18 (Nov 25):** `#[vrf_callback]` evaluated a const fn at run time (over 200k compute units),
  so callbacks failed. A compile-time `VRF_IDENTITY` fixed it (upgrade `jKQqVjuN…`).
- **TEE authentication (Nov 25):** the first TEE test run failed with `401 Missing token query param` because the
  crank sent without a token (recorded in docs/CLAIMS-AUDIT.md; the log was later overwritten by the passing run).
  The crank, relay and tests now use one authenticated rollup connection from `chain/tests/common.ts`; the app sends
  its rollup moves through the relay.
- **The open faucet:** an open devnet faucet could drain the sponsor. It now needs a signed-in user, allows one claim per
  wallet a day and five per IP an hour, and accepts wallets only.

## Running the backend against devnet (from `chain/`)

```bash
source .devnet.env
```

On the TEE rollup every sender needs an auth token. `chain/tests/common.ts` mints one from the process's own key
(`getAuthToken`, valid 30 days) when `CLASHY_ER` points at `devnet-tee`; the crank and relay use that connection.

```bash
CLASHY_ROLE=crank npx tsx scripts/crank.ts
```

```bash
CLASHY_ROLE=relay CLASHY_SPONSOR_PORT=8790 CLASHY_APP_ORIGIN=https://play.clashy.fun npx tsx scripts/sponsor.ts
```

`CLASHY_RELAY_DEV_OPEN=1` (no sign-in) is for loopback browser tests only. It refuses to start on mainnet or on a
public bind.

## Before the public beta

1. **A server and DNS** (docs/DEPLOY-RUNBOOK.md). The services ran on the Mac for these tests.
2. **More devnet SOL for the sponsor.** It had 0.452 SOL on Nov 25 after the TEE runs. The CLI airdrop is
   rate-limited, the proof-of-work faucets are empty, and faucet.solana.com asks AI agents not to use it. Nick can send
   up to 10 SOL a day to `AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz` from faucet.solana.com, signed in with GitHub.
3. **Crank and keeper SOL.** The crank has about 0.3 SOL; base price pushes cost about 0.09 SOL a day. The keeper's
   escrow is the account MagicBlock can charge for Magic Actions; it has not been debited on devnet so far, so check
   its balance before many games.
4. **Privy allowed origins** for clashy.fun and play.clashy.fun.
5. **A multisig** for the upgrade and admin keys before any real money.
