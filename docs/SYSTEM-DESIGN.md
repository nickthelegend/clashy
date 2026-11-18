# Clashy system design (v2, Nov 19 2026)

Goals:
- **Now:** a testnet deployment that holds about **100 players at once** for the hackathon and the Solana Incubator
  demo.
- **Later:** a mainnet launch a bootstrapped team can afford, then grow into without a rewrite.

Every number below was either measured on our stack (marked *measured*) or comes from the provider's own page (linked).
The rest is marked as an estimate.

## 1. The pieces

```
                         ┌──────────────────────────── one small VM (docker compose) ─────────────────────────────┐
  Players                │  Caddy (HTTPS)                                                                          │
  iOS / Android / web ───┼─► web       nginx, the Expo web build (or a free static host)                           │
  Privy wallet (web)     │   relay     sponsor relay: pays fees and rent, co-signs only Clashy player instructions, │
  device key (dev)       │             checks the Privy token, caches market data (Jupiter, Phoenix, Pacifica,     │
                         │             GeckoTerminal), serves price history                                        │
                         │   crank     pushes prices to the rollup every 1 s and to Solana every 5 s, records      │
                         │             history                                                                     │
                         │   social    DMs, follows, follow requests, notifications, bios (SQLite, WAL)            │
                         └───────┬────────────────────────────┬────────────────────────────────────────────────────┘
                                 │                            │
               ┌─────────────────▼───────────┐   ┌────────────▼─────────────────────────────────────┐
               │ Solana (devnet → mainnet)   │◄──┤ MagicBlock Ephemeral Rollup (regional endpoint)  │
               │ Clashy program: escrow,     │   │ duels scored live, Royale rounds, price feeds,   │
               │ settlement, squads, chest,  │──►│ the calls board, squad chat; commits back to     │
               │ profiles, Stash, wars       │   │ Solana; MagicBlock VRF rolls every coin          │
               └─────────────────────────────┘   └──────────────────────────────────────────────────┘
```

**What lives where, and why:**

| Data | Where | Why |
|---|---|---|
| Money: stakes, chests, pots, payouts | Solana, USDC token accounts owned by the program | Custody must be trustless and auditable |
| Live game state: duel scoring, Royale rounds, price feeds | MagicBlock Ephemeral Rollup | Millisecond updates, no per-transaction fee, committed back to Solana |
| Calls board, squad chat | MagicBlock Ephemeral Rollup | Public, fast and free to write |
| Names, avatars, Elo and ranks, streaks, play-safe limits | Solana | Part of the player's record, and other programs can read them |
| DMs, follows, notifications, bios | Social server (SQLite) | Private, high-volume and not money. On chain it would cost rent per message for no benefit |
| Market data, price history | Relay cache and crank files | Shared across players so upstream rate limits hold |

## 2. Flows

- **Sign in (web):**
  1. Privy signs the player in with email or Google and creates a Solana wallet.
  2. Game transactions are signed silently.
  3. The relay adds the fee payer and checks the Privy token.
- **Sign in to social:**
  1. The app asks the social server for a one-time nonce.
  2. The wallet signs a Memo transaction carrying it, with an all-zero blockhash, so it can never be sent.
  3. The server verifies the ed25519 signature and returns a 7-day HMAC session.
- **A duel:**
  1. `open_duel` escrows the stake on Solana; `join_duel` escrows the rival's.
  2. MagicBlock VRF rolls the coin.
  3. Sealed picks are committed, then revealed.
  4. `delegate_duel` moves the duel to the rollup.
  5. `check_duel` scores it live; on a knockout or at the bell it commits and undelegates.
  6. `settle_duel` pays out in USDC, closes the vault (its rent returns to the sponsor) and updates Elo.
- **A trade page:**
  1. The app reads the post from the rollup board.
  2. It reads candles through the relay: Phoenix or Pacifica for their own perps, GeckoTerminal for any other
     Solana token.
  3. Live prices come from the relay's Jupiter cache.

## 3. Capacity: 100 players at once

| Part | Load at 100 players | Result |
|---|---|---|
| Social server | Each player polls the inbox every 2 s, opens a thread every 4 s and sends a DM every 6 s. **Measured:** 100 real sign-ins in 0.20 s, then 2,750 requests in 32 s (86 req/s). | p50 2.9 ms, p95 8.1 ms, p99 17.9 ms, max 37.8 ms, **0 errors**, 34 MB RAM. Run it with `node server/test/load.ts`. |
| Relay | Prices: one batched Jupiter call per second at most (shared per mint, 10 s cache). Candles and books: 1.5–15 s caches per URL. GeckoTerminal: past windows cached 10 min (its free API allows about 30 calls/min). | Not load-tested. The work is cache lookups plus co-signing (about 10 tx/s at peak). |
| Crank | 1 rollup tx/s plus 1 Solana tx per 5 s, independent of player count | Fine |
| MagicBlock rollup | A duel is a few dozen rollup transactions | MagicBlock's public endpoints carry far more; per-transaction fee is 0 ([pricing](https://docs.magicblock.gg/pages/overview/additional-information/pricing.md)) |
| Solana reads | Each app polls its own accounts every 2.5–10 s straight from RPC | Devnet public RPC limits per IP, so 100 players on 100 IPs are fine. On mainnet use one paid RPC plan, and move hot reads (board, leaderboard, squads) into the relay cache first |

**Measured container footprint:**

| Container | RAM |
|---|---|
| relay | 242 MB |
| crank | 196 MB |
| social | 34–95 MB |
| nginx | 10 MB |
| **All four** | **under 600 MB** |

All four fit on the smallest 2 GB VM.

**What to change before 1,000+ players:**
1. Serve hot account reads from the relay cache (one read fans out to all players).
2. Move social to Postgres (Supabase, already planned) and add SSE push instead of polling.
3. Run two relay replicas behind Caddy (the relay is stateless apart from its cache).
4. Put the web build on a CDN.

## 4. Testnet deployment (hackathon, about 100 players)

| Item | Choice | Monthly cost |
|---|---|---|
| VM | Hetzner Cloud, smallest shared plan, running `docker compose --profile prod up -d` | from €5.49 excl. VAT ([Hetzner](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)) |
| Web app | Same VM (nginx), or Cloudflare Pages / Vercel free tier | €0 |
| Solana RPC | Devnet public RPC, or Helius free (1M credits, 10 RPC/s) | $0 ([Helius](https://www.helius.dev/pricing)) |
| Rollup | MagicBlock devnet endpoints (`devnet-eu/us/as.magicblock.app`) | $0 |
| Domain | clashy.fun (already owned) | — |
| **Total** | | **about €6 a month** |

**Devnet SOL needed:** the program deploy costs 6.58 SOL (rent for the exact program size, *measured* with
`solana rent 1294573`), plus about 1 SOL for the sponsor and crank.
- The official faucet gives 2 requests per 8 hours, more if you sign in with GitHub
  ([faucet.solana.com](https://faucet.solana.com/)).
- `devnet-pow` (proof-of-work faucet) and the QuickNode faucet are the other routes.
- This is the open "~18.5 devnet SOL" blocker. With the exact-size deploy below it drops to **about 8 SOL**.

## 5. Mainnet: the bootstrapped plan

### 5.1 One-time cost: deploying the program

The rent-exempt minimum for the program is now **6.58 SOL**, *measured* on mainnet with `solana rent 1294573`. Rent
fell in September 2026 (SIMD-0437), so the old 12 SOL figure is out of date.

| Lever | Saves | Status |
|---|---|---|
| Deploy with `--max-len` = the exact program size, not the default 2× | About 6.6 SOL (13.2 → 6.58) | Do it. Upgrades then need `solana program extend` |
| Build with `opt-level = "z"` | 7%: 1,294,528 → 1,203,264 bytes, about 0.46 SOL | *Measured* build. Must pass the chain test suite first (compute units may rise) |
| Wait for the remaining SIMD-0437 rent steps (down to 696 lamports/byte) | Deploy would fall to **about 0.9 SOL** | Not confirmed for mainnet yet. Check `solana rent 1294573` before deploying |
| Drop instructions the launch doesn't need (fork-only helpers, unused game modes), or split into two programs | 10–30% (estimate) | Engineering work |
| Close a failed deploy buffer immediately (`solana program close --buffers`) | The whole buffer rent | Always |

Peak SOL during a deploy is about 2× the rent, because the write buffer is funded first and its lamports move to the
program at the end. Rehearse the exact deploy on devnet first.

### 5.2 Running costs on mainnet

All of these are paid by the sponsor in SOL; players only ever hold USDC.

| Cost | Size | Notes |
|---|---|---|
| Rent for a new player (Player, Profile, Handle, Stash, USDC account) | About 0.0086 SOL at the local validator's rate (*measured*: 0.00154 + 0.00187 + 0.00118 + 0.00194 + 0.00204). About 0.0062 SOL at today's mainnet rent (estimate) | Locked while the accounts exist. **Levers:** create the Stash only on first save; merge Handle into Profile; take a small one-time USDC onboarding fee that converts to cover rent |
| One duel | Rollup session fee 0.003 SOL, plus 0.001 SOL per commit after the first ([MagicBlock pricing](https://docs.magicblock.gg/pages/overview/additional-information/pricing.md)). About 8 Solana transactions at 5,000 lamports each = 0.00004 SOL. VRF on the rollup is free (0.0008 SOL on Solana). The vault's rent comes back at settlement | **About 0.003–0.004 SOL per duel**, before the Duel account's rent. Clashy's rake (`config.rake_bps`, 10% at most) on two $5 stakes must cover this, so check the margin at the live SOL price before setting the minimum stake |
| Price crank on Solana | 1 transaction every 5 s is 17,280 a day × 5,000 lamports = **0.086 SOL a day (about 2.6 SOL a month)** | **Biggest lever:** read MagicBlock's pricing oracle (Pyth Lazer, already accepted by the program) or Pyth pull accounts instead of pushing our own base feeds, or push only while a squad trade is open. Rollup pushes cost nothing per transaction |
| RPC | Helius Developer $49 a month (10M credits, 50 RPC/s), or stay on the free tier until reads move into the relay cache | |
| VM | €5.49+ a month | Same box as testnet |

**A realistic launch budget:**
- 6.58 SOL deploy, or about 0.9 SOL after the rent cut.
- About 1 SOL of sponsor float, which covers rent for roughly 150 new players plus fees.
- About €6 a month for the VM.
- $0–49 a month for RPC.
- **Not** the 2.6 SOL a month base crank, once it reads the oracle.

### 5.3 Funding we can apply to now

| Program | What it gives | Deadline | Source |
|---|---|---|---|
| **Solana Incubator** (Solana Labs) | 3 months in New York from March 2027, mentorship, go-to-market, fundraising and brand help, a relocation stipend | **December 4**, early applicants prioritised | [incubator.solanalabs.com](https://incubator.solanalabs.com/), checked Nov 19 |
| Superteam Instagrants | $1,000–$10,000, smaller asks are easier | Rolling | [earn.superteam.fun/grants](https://earn.superteam.fun/grants), [handbook](https://docs.superteam.fun/the-superteam-handbook/community/faqs) |
| Solana Foundation grants | Convertible grants for commercial projects; amounts not stated | Rolling | [solana.org/grants-funding](https://solana.org/grants-funding) |
| Colosseum | Hackathon winners have been offered pre-seed funding ($250k after Frontier, per Solana Compass) | Next date not published | [colosseum.com](https://www.colosseum.com/) |
| MagicBlock Solana Blitz | Weekend hackathon prizes | Per event | MagicBlock's Luma pages |

## 6. MagicBlock, end to end

| MagicBlock part | Clashy uses it for | Status |
|---|---|---|
| Ephemeral Rollups | Duel scoring, Royale rounds, price feeds, the calls board, squad chat (delegate, then commit and undelegate) | **Live** on the local MagicBlock stack |
| VRF | Coin roll for duels and Royale (`vrf_required = true` refuses the commit-reveal fallback) | **Live** (MagicBlock's `vrf-oracle` locally; base queue on devnet and mainnet) |
| Pricing oracle (Pyth Lazer on the rollup) | The program accepts `PriCems5…` PriceUpdateV2 accounts | Accepted. **Next:** make the oracle the default on devnet and mainnet and retire the base-feed crank (§5.2) |
| ER cranks (scheduled tasks on the rollup) | Fire `check_duel` at the bell and `resolve_round` for Royale, so games end even if every player closes the app | **Next** |
| Magic Actions | Run the payout on Solana straight after the final commit, so settlement is one step | **Next** |
| Magic Router | One RPC that routes each transaction to the rollup or to Solana | Devnet only (`devnet-router.magicblock.app`); no mainnet router URL is documented, so mainnet keeps the regional rollup endpoints |
| Session keys | No wallet pop-ups for every move | Privy already signs silently on web. **Add** session keys for native Phantom / Solflare wallets |
| SDK version | `ephemeral-rollups-sdk` 0.17 in the program; 0.20 is current | **Upgrade before mainnet** (re-run the 5 end-to-end tests) |

## 7. Run it

Commands are in [docker/README.md](../docker/README.md).
- On a Mac (Apple Silicon): the chain runs natively (`chain/scripts/localnet.sh`); relay, crank, social and web run
  in Docker.
- On an x86 Linux server: `docker compose --profile chain --profile prod up -d` runs everything, including the
  chain.
