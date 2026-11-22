# Clashy on Solana devnet + MagicBlock (deployed Nov 22, 2026)

## What is deployed

| Piece | Value |
|---|---|
| Program | [`FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS`](https://explorer.solana.com/address/FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS?cluster=devnet): 1,324,136 bytes, upgrade authority `6XdpT4…nYbe` (the deployer key, kept on the Mac) |
| Base RPC | `https://rpc.magicblock.app/devnet` (MagicBlock's devnet RPC; the public `api.devnet.solana.com` returned 429s during setup) |
| Ephemeral Rollup | `https://devnet-as.magicblock.app` (Asia), validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` (checked with `getIdentity`) |
| VRF | Required (`vrf_required = true`). Coin rolls use MagicBlock's base-layer queue `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh`; their devnet oracle answers in about 1.8 s. |
| Stake currency | Clashy test USDC [`8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN`](https://explorer.solana.com/address/8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN?cluster=devnet) (6 decimals). The mint authority is the faucet key; it has no value. |
| Rake | 3% (300 bps) to treasury `6scuHR…HV3n` |
| Keys | `chain/.keys/devnet-{deployer,sponsor,crank,treasury,faucet}.json`, gitignored, never printed. Endpoints and key paths are in `chain/.devnet.env` (gitignored). |

## What was tested on devnet (real oracle, real rollup)

| Test | Result |
|---|---|
| Knockout duel: open, join, **VRF roll**, sealed picks, live on the rollup, settle with rake and Elo | Passed (VRF rolled ETH, then BTC, in about 1.8 s) |
| VRF required: the commit-reveal roll and a forged callback are refused | Passed |
| Royale: USDC entries, **VRF coin**, calls and rounds on the rollup, survivors split the pot | Passed (VRF picked AAPL) |
| Perps clash: 25× vs 25× settles at the bell | Passed |
| Perps: a 50× long is liquidated by a 2.5% drop (price forced with the crank key) | Passed |
| Leverage above 100× refused | Passed |
| Void: a live duel nobody finishes is voided and refunds both stakes | Passed |
| Clans: chest shares, votes, a trade closed at the oracle price, clan war | Passed |
| Squads, names, safety limits, calls feed and clan chat on the rollup | Passed |
| Rollup price feeds are live and moving | Passed (crank running) |
| Sponsor relay refusals and forged Privy token | Passed; the zero-SOL relay path is skipped by design (it needs a real Privy sign-in) |
| Stash: buy NVIDIA through Orca | **Mainnet only**: devnet has no xStock/Orca pool. Stash savings work. |

**Through the real app (web build, two device-wallet players):**
- **New players:** created with zero SOL, fees sponsored, with their name and Stash on chain. Each got test USDC.
- **Crypto clash:** VRF rolled ETH; sealed UP vs DOWN; live on the rollup; settled. The winner got +9.70 USDC from a $10 pot.
- **Perps clash:** VRF rolled BTC; Long vs Short at 10×; settled. The winner got +9.70 USDC.
- **On-chain Royale:** VRF rolled SOL; two players; 6 rounds on the rollup; the survivor was paid +3.88 USDC.
- **Practice games:** all 150 load on live prices with no errors. A round started in each of the 32 engines; 126 games
  passed the automated run, and the other 24 share engines that were driven through their own controls.

## Fixed while deploying

- **Royale on a stock coin:** the app treated coins 3–7 as still rolling, so a Royale whose VRF coin was a stock could
  never start. Stock clashes also showed "…" instead of their coin.
- **The VRF test** switched VRF off when it finished. It now restores the deployment's setting.
- **The open faucet:** an open devnet faucet could drain the sponsor. It now needs a signed-in user, allows one claim per
  wallet a day and five per IP an hour, and accepts wallets only.

## Running the backend against devnet (from `chain/`)

```bash
source .devnet.env
```

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
2. **More devnet SOL for the sponsor.** It has about 0.26 SOL, enough for about 50 new players. The CLI airdrop is
   rate-limited, the proof-of-work faucets are empty, and faucet.solana.com asks AI agents not to use it. Nick can send
   up to 10 SOL a day to `AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz` from faucet.solana.com, signed in with GitHub.
3. **Crank SOL.** It has about 0.3 SOL; base price pushes cost about 0.09 SOL a day.
4. **Privy allowed origins** for clashy.fun and play.clashy.fun.
