# Clashy claims audit (Nov 25, 2026)

Line numbers are as of Nov 25 11:20 UTC. `lib.rs`, `tests/common.ts` and `tests/magicblock.test.ts` were being edited by another process while this audit ran (`magicblock.test.ts` gained a devnet-tee branch at 16:55 IST), so re-check a line number if a cell looks off by a few lines.

Read-only audit of every factual claim in the repo, written for a hackathon screening where AI and human judges will check
that what the repo says is real. Statuses:

- **PROVEN**: there is code, a test, a log or an on-chain fact that supports the claim as worded.
- **STALE**: was true when written; the code, the deployment or the numbers have moved.
- **UNPROVEN**: nothing in the repo or on chain supports it yet (it may be true; the evidence is missing).
- **FALSE**: contradicted by the code, a log or on-chain state.

`LIB` = `chain/programs/clashy/src/lib.rs`. Times are UTC. Nothing was edited except this file; no chain tests were run;
git was not touched (so commit ranges and "pushed/private repo" claims are marked as not checked from git).

## What was checked live on Nov 25, 2026 (11:13 to 11:20 UTC)

| Fact | How it was read | Result |
|---|---|---|
| Program `FQKy8f…wdS` on devnet | `solana program show` / `dump` against `https://rpc.magicblock.app/devnet` | Upgradeable loader, authority `6XdpT4…nYbe` (single key). ProgramData was 1,577,936 bytes at slot 526130793, then an upgrade landed at **slot 526130812 (Nov 25 11:13:35 UTC)** while this audit ran. Now **1,605,240 bytes**, sha256 `2f77b872…ecd20e`, **identical to `chain/target/deploy/clashy.so`** (built Nov 25 13:47 IST). |
| On-chain `Config` PDA | decoded with the repo IDL | `rake_bps` 300, `vrf_required` true, `vrf_queue` `Cuj97g…AxGh`, `usdc_mint` `8Jb66C…iXEN`, **`er_validator` `MTEWGu…xzo` (devnet-tee)**, 8 coins. Coins 0 to 2 (SOL, BTC, ETH) point at MagicBlock oracle accounts `ENYweb…`, `71wtTR…`, `5vaYr1…`; coins 3 to 7 (NVDA, TSLA, AAPL, SPY, GOOGL) are Clashy-owned feeds. Treasury token account `Csrpa8…` is owned by `6scuHR…HV3n`. |
| devnet-tee state | `getAuthToken` with a throwaway key, read-only `getAccountInfo` | Keeper PDA `TRpZrv…` is delegated and exists on the TEE, oracle accounts are owned by `PriCems5…`, **keeper `ticks` = 0 and `finished` = 0: no crank-driven game has ever run on devnet-tee.** `getVersion`: `magicblock-core 1.1.1`. devnet-as/eu/us run `core 2.0.5`. Mainnet `eu/us/as` and `mainnet-tee` run 1.1.1. |
| Base-layer activity | `getSignaturesForAddress` plus `getTransaction` for all 1,591 signatures | 1,520 txs up to Nov 22 04:48 (72 failed) matches the form. **71 more on Nov 25** (setup, migration, 2 OpenDuel, 2 JoinDuel, 2 RequestCoinRoll, 1 OpenPrivatePicks, 1 CreateTournament, 3 JoinTournament). **No DelegateDuel, StartDuel or SettleDuel exists after the upgrade: no clash has completed on the upgraded program.** |
| All 18 tx signatures linked in README, form and docs | `getTransaction` (base RPC, or devnet-as for rollup links) | All 18 exist, no errors except `2q9axbog…` (the intended 6011 `WrongStatus` double-settle), instruction names and times match the tables. 47 `CheckDuel` and 1 `StartDuel` on duel `H6GpASV8…DG8t` (devnet-as). Rollup txs have fee 0. VRF callbacks are signed by `vrfkfM4u…d5AS` through `Vrf1RNUj…QUwGz`. |
| Instruction counts in the form's table (OpenDuel 35, JoinDuel 26, RequestCoinRoll 21, CommitPick 28, RevealPick 24, DelegateDuel 12, SettleDuel 9, CreateClan 12, DeclareWar 4, SettleWar 4, tournaments 4/3/4/4, InitPlayer 112) | counted over all 1,520 pre-Nov-23 txs | All match exactly. |
| Mainnet | `getAccountInfo` on `api.mainnet-beta.solana.com` | Program does not exist there. "Nothing on mainnet" is true. |
| Sponsor `AjdLmw…EP4Hz` balance | `getBalance` | 0.646 SOL (docs say about 0.26). Crank `GGeCjD…` 0.296 SOL. Deployer 8.54 SOL. |
| Latest devnet attempt | `chain/.localnet/devnet-mb-test.log` (Nov 25 16:45 IST) | `crank: rollup rejected the transaction: 401 {"error":"Missing token query param"}` repeated, and "a cranked duel finishes and pays out" **failed** on devnet-tee. |
| Latest local runs | `.localnet/run-all.log` (13:46 IST), `suite-*.log` | magicblock 4/4, perps 3/3, brief 9 pass, void 1/1, **clashy 4 of 5 (the VRF test failed)**; a clashy rerun was in progress at 16:44 IST (tests 1 and 2 ok). `c-vrf.log`: `RequestCoinRoll` "account data too small for instruction". |
| clashy.fun / play.clashy.fun / repo | `dig`, `curl`, GitHub API | `clashy.fun` still the Hostinger parked page (`2.57.91.91`); `play.clashy.fun` has no record; `api.github.com/repos/nickthelegend/clashy` returns 404 (private or missing). |
| Event | `build.magicblock.app/api/events` id 17, `luma.com/hedv5sgh` | Kickoff `2026-11-20T14:00Z`, `submitEndDate 2026-11-27T14:00Z`, theme Entertainment Finance, prizes $500 / $250 / $150 / $100 USDC all as written. |

## Summary: FALSE and STALE first

### FALSE (contradicted by code, logs or chain; fix before screening)

| # | Where | Claim | Why it is false |
|---|---|---|---|
| F1 | `chain/TESTING.md:11` | "5 pass on a fresh stack ... log `.localnet/e2e-last.log`" | That log shows `tests 5, pass 4, fail 1`: the Royale test failed. The latest completed full run (`run-all.log`) is also 4 of 5 (VRF test failed). |
| F2 | `README.md:81` | "Locally, 5/5 end-to-end, 5/5 relay and 11/11 unit tests pass" | Latest completed local run is 4/5 end-to-end; source has 12 `#[test]` fns and the last run printed 13 passed. |
| F3 | `README.md:152` | `app/` = "duels, 9 practice games" | The app has 150 games on 32 engines (`app/src/games/catalog.ts`). |
| F4 | `README.md:161-182` (Website section) | "Arena ... `web/src/components/arena/`", six feature cards, "honest comparison with house-pool apps such as REKT", component list (ArenaWidget, LeaderboardStrip, CompareStrip ...) | `web/` is one file, `web/src/App.tsx` (633 lines), with no `components/` folder, no Arena widget, no REKT comparison. The described files live in `landing/src/`, and `CompareStrip` and the REKT strip do not exist anywhere. |
| F5 | `README.md:123`, `docs/GAMES.md:5` | Clashy Bot "picks at random" | In `updown` (and the practice clash test) the bot always takes the opposite side (`app/src/games/engines/updown.tsx:1,56`; `chain/tests/practice-clash.test.ts:38`). Random only in some engines (race, guess, snipe, royale ...). |
| F6 | `README.md:73`, `HACKATHON_SUBMISSION_FORM.md:208,211` | "The program on devnet is the pre-kickoff program plus `close_duel`" / "`close_duel` (the only program change, 45 lines)" / "bytes on devnet match ... which includes `close_duel`" | The program on devnet now includes keeper, cranks, Magic Actions, private picks, session-key instructions and oracle reads, all written after kickoff (Nov 25). `lib.rs` is 3,430 lines (docs/AUDIT.md audited 3,498 lines for the whole program on Nov 19; it is 4,507 now). 83 `pub fn` instructions. The honest-timeline section is wrong in the unfavourable direction for eligibility: it must be rewritten. |
| F7 | `web/src/App.tsx:263` | Royale "5–20 players" | Program cap is 16 (`MAX_TOUR_PLAYERS`, `constants.rs`); the app says 2 to 16 (`app/src/app/help.tsx:227`, `tour/steps.ts:58`). `landing/src/sections/Bottom.tsx:40` says "Up to 50 players". |
| F8 | `web/src/App.tsx:309-310` and rail at `:259-272` | "Every card is the real app ... Ten are playable today as practice": Draw the line, Daily Cup, Clan Skirmish, Ranked "Playable now" | No route or screen named Draw the line, Daily Cup, Skirmish or a Ranked queue exists in `app/src/app` (routes list: arena, clash, cup (Weekly Cup), onchain*, practice, games ...). The screenshots in `web/public/shots/` (skirmish, line, ranked, bounty, diamond) come from an older build. Ranked "queue rolls Knockout, Draw the line or Royale" has no code. |
| F9 | `web/src/App.tsx:553` | "Who you play: A person, never the house" and the Statement section | False for the 150 practice games (Clashy Bot or solo payouts at 97% of fair, `docs/GAMES.md`) and for the practice clash. True only for on-chain duels, Royales and clan wars, where the program still keeps a 3% rake. |
| F10 | `web/src/App.tsx:502` | "In the app, the other coin is picked by a real opponent." | In practice clashes and games the other side is Clashy Bot (`docs/GAMES.md:5`). Only on-chain clashes have a human opponent. |
| F11 | `app/src/data/legal.ts:160` | Privacy page: the site's "free demo Arena reads prices straight from Binance" | `web/` (the page `docs/DEPLOY-RUNBOOK` and the form tell people to deploy as "web/") reads Coinbase and DexScreener (`web/src/lib/markets.ts:5-6`). Only `landing/` reads Binance. `docs/DEPLOY-RUNBOOK.md:44` builds `landing/`, while the form (`:77`) says "Deploy the landing (`web/`)": the repo does not say which site is the product. |
| F12 | `docker/README.md` (Checks) | "3 end-to-end tests" for the social server | `server/test/api.test.ts` has 4 tests. |
| F13 | `chain/tests/magicblock.test.ts:270` | Test title "ticking a duel that is not live does nothing" | The body only asserts that an outsider cannot `delegateKeeper` / `initKeeper`; it never ticks a non-live duel. The assertions also accept almost any failure (regex includes `0x1`, `insufficient`, `Signature`). |
| F14 | `chain/TESTING.md:3-4` | "Nothing is mocked or stubbed ... live Coinbase prices" | The 50× liquidation test stages a price with the crank key (`chain/tests/perps.test.ts:141-150`). It is a real on-chain write, but the price is not live. Also: it relies on a Clashy-owned feed; with SOL/BTC/ETH now on MagicBlock oracle accounts the staging cannot work for those coins. |
| F15 | `docs/MAGICBLOCK.md:70-71` | "every duel and Royale in clashy.test.ts, perps.test.ts, void.test.ts and magicblock.test.ts now comes home already settled" | `settledByAction` (`chain/tests/common.ts:294-306`) falls back to a manual settle after 30 s and still passes. Only `magicblock.test.ts` tests 1 to 3 assert there was no manual settle. The clashy log shows "(settled magic action)" for one duel only. |

### STALE (was true; the deployment moved on Nov 25)

| # | Where | Stale claim | Current fact |
|---|---|---|---|
| S1 | `README.md:20,31`, form `:58,135,138,153,175,187,196`, `docs/DEVNET.md:9` | Rollup is `devnet-as.magicblock.app`, validator `MAS1Dt9…` | Config `er_validator` is `MTEWGuqx…xzo`, `https://devnet-tee.magicblock.app`. devnet-as links still resolve (history is served) but the live rollup is the TEE. |
| S2 | `README.md:18`, `docs/DEVNET.md:7` | Program is 1,324,136 bytes; "bytes on chain match `clashy.so`" | 1,605,240 bytes; sha256 matches the current local build; rent-exempt minimum 8.155 SOL (programdata balance 8.017 SOL). |
| S3 | form `:122`, `docs/DEVNET.md` | "last base-layer transaction was Nov 22 04:48", "1,520 transactions" | 1,591 transactions; last on Nov 25. |
| S4 | form `:60` | "We don't use MagicBlock session keys" | `lock_pick_session` / `call_round_session` exist (`LIB:2094,2102`, `check_session` `LIB:359`), `session-keys = "=3.1.1"` in `chain/programs/clashy/Cargo.toml:30`, and `magicblock.test.ts:232-236` plays one through. They are **not deployed** on devnet and the app never calls them (no `lockPickSession` in `app/src`). Say: "session-key instructions are in the source and tested locally, not deployed". Private payments: still not used (true). |
| S5 | form `:58-60`, README, DEVNET | Describes only plain delegation, VRF, relay | Source now also uses cranks, keeper PDA, Magic Actions, Private Ephemeral Rollup picks, MagicBlock oracle. None of those has run on devnet yet (see U1). Do not add them to the pitch until it has. |
| S6 | `docs/DEVNET.md:67-71`, form `:230` | Sponsor "about 0.26 SOL ... about 50 new players" | 0.646 SOL. Crank 0.296 SOL ("about 0.3" ok). |
| S7 | `chain/README.md:3,9-15,111-128` | "ephemeral-rollups-sdk 0.17"; "Deployed: Local MagicBlock stack only. Devnet and mainnet: not deployed"; "**BLOCKED:** the devnet deploy ... about 18.5 devnet SOL"; "the 1.05 MB program needs 5.33 SOL"; "VRF proven locally ... hosted oracles untested" | SDK is `=0.18.0` (`chain/programs/clashy/Cargo.toml:28`); deployed on devnet since Nov 22; program is 1.6 MB; hosted VRF proven by the Nov 22 txs. The whole Status section predates the deploy. |
| S8 | `chain/TESTING.md:91-96` | "Not covered: VRF on devnet/mainnet ... BLOCKED"; "Devnet and mainnet: not deployed" | Deployed to devnet Nov 22. |
| S9 | `chain/TESTING.md:8-21` | Suite table lists 5 suites | Suites also exist for `magicblock.test.ts` (4 tests), `void.test.ts` (1), `brief.test.ts` (8) and `server/test/api.test.ts` (4). Rust unit count is 12 `#[test]` (math 10, price 2), not 11. |
| S10 | `docs/SYSTEM-DESIGN.md:15,123,187-192` | devnet rollup `devnet-eu`; ER cranks "**Next**"; Magic Actions "**Next**"; pricing oracle "Accepted. Next ..."; session keys "Add"; "SDK 0.17 in the program; 0.20 is current"; "Live on the local MagicBlock stack" | Cranks, Magic Actions, oracle reads are implemented (`LIB:206,233,1961,2003`, `price.rs`); SDK is 0.18.0 and 0.20 is blocked by Anchor 1.2 (`chain/programs/clashy/Cargo.toml:26-27`); rollup is devnet-tee. Rent math uses 1,294,573 bytes (6.58 SOL, `solana rent` confirms for that size); the program is now 1,605,240 bytes (8.155 SOL). |
| S11 | `docs/AUDIT.md:9` and table `:30-36` | "all 3,498 lines"; results 11/11, 5/5 | 4,507 lines in `src/`; 12 unit tests. Audit predates cranks, keeper, Magic Actions, private picks, session keys, oracle; none of them is covered by an audit finding. |
| S12 | `docs/AUDIT.md` P7 | "Must be fixed before switching coins to oracle accounts" | Coins 0 to 2 were switched to oracle accounts on devnet on Nov 25. Mitigation visible on chain: those oracle accounts are delegated on base (owner `DELeGG…`), so `read_price` on Solana returns `FeedInvalid`. Record that and re-open P7 as "mitigated by delegation, not by code". |
| S13 | `docs/AUDIT.md` M-H1 | "The crank runs a keeper that checks every live duel ... every 2 s" | Primary path is now the MagicBlock crank every 1,000 ms (`TICK_MILLIS`); `crank.ts` is a backup after 10 s (`crank.ts BACKUP_SECS`). |
| S14 | `docs/LAUNCH-PLAN.md:11` | "has only ever run on a **local** chain"; deployer has 0 SOL; needs about 14 devnet SOL | Deployed Nov 22; deployer holds 8.54 SOL. Plan dates (Nov 24 public beta) did not happen: site and DNS are not up. |
| S15 | `docs/DEPLOY-RUNBOOK.md:23-25,76,95` | "program is 1.3 MB, rent 6.7 SOL, about 14 SOL"; `CLASHY_BASE=https://api.devnet.solana.com`; `CLASHY_ER` "our region" | 1.6 MB / 8.155 SOL; devnet RPC rate-limits (DEVNET.md); rollup must be devnet-tee, which needs an auth token (`chain/tests/common.ts:97-107`). |
| S16 | `docker/README.md` | `CLASHY_ER=https://devnet-eu.magicblock.app` | `deploy/testnet.env.example:12` already says devnet-tee. Also `chain/scripts/preflight.ts:25` suggests `devnet-eu` as the example. |
| S17 | `chain/programs/clashy/src/lib.rs:1-19` (module doc) | "long/short picks are sealed by commit-reveal"; "Prices come from Clashy PriceFeed accounts ... or MagicBlock pricing-oracle accounts" | Picks can now be locked privately in a TEE (`lock_pick`, `LIB:2086`) as well as by commit-reveal; SOL/BTC/ETH read oracle accounts on devnet. |
| S18 | `chain/scripts/crank.ts:1` header | "pushes live Coinbase prices into the delegated feeds ... every second" | On devnet, SOL/BTC/ETH no longer read Clashy feeds; the crank only needs to feed stocks (and base feeds). |
| S19 | `chain/scripts/deploy.sh:2` header | "three price feeds delegated" | 8 coins in config. |

### UNPROVEN (highest risk first)

| # | Claim | What is missing |
|---|---|---|
| U1 | Cranks, keeper, Magic Actions, Private Ephemeral Rollup picks, oracle scoring "live on devnet" (web `:566-568,578`; `docs/MAGICBLOCK.md`; app screen `app/src/app/magicblock.tsx`) | No game has run on devnet-tee: keeper `ticks`=0, `finished`=0; no `DelegateDuel`/`SettleDuel` since the upgrade; `devnet-mb-test.log` failed with 401 (the crank process in the test sends to the TEE without a token). All proof for these features is on the **local** stack (`suite-magicblock.log`: 4/4). Run one cranked duel and one private duel on devnet-tee, keep the tx links and the log, then claim it. |
| U2 | "The rival cannot read it" (private picks; `docs/MAGICBLOCK.md:41`, web `:566`, `magicblock.tsx`) | As audited (11:20 UTC) no test read a pick as the rival; `magicblock.test.ts:222` only checks a rival cannot **write**, and the local validator is not a TEE. At 16:55 IST (after the audit read) a TEE-only branch was added (`magicblock.test.ts:237-246`, `IS_TEE`, `rollupAs`): player A reads their locked pick, player B must see nothing or a blank pick. It is the right test, but it has not yet been run and passed on devnet-tee, and on the local stack it falls back to only checking that a permission account exists. Keep the claim off until that run is green and logged. |
| U3 | "Every on-chain test passed against MagicBlock's devnet rollup" (README `:38`, DEVNET.md `:15`) | Logs show a patchwork of five runs on Nov 22 (`devnet-test-all/2/3/4/clashy.log`). First runs failed duel, Royale, 50× liquidation, void and sponsor tests; each later passed in a rerun. No single green run exists. Publish the per-test best run with its log, say "after reruns", and note the Stash NVIDIA test fails on devnet by design. |
| U4 | Through-the-app devnet runs (+9.70 USDC from a $10 pot, +9.70 perps, +3.88 Royale, 6 rounds; README `:50-52`, DEVNET.md `:32-36`) | Arithmetic is right (2 × 5 USDC × 97% = 9.70; 4 USDC × 97% = 3.88) but no tx signature or recording is linked. Add the settle tx signatures. |
| U5 | "Practice games ... 126 games passed the automated run, the other 24 share engines" (DEVNET.md `:37-38`) | No script or log in the repo. Add the runner and its output. |
| U6 | Playwright runs in TESTING.md `:17-21,76-89` (duels, clan, war, Royale in browsers) | Playwright is referenced but there is no spec file in the repo. Only `web/scripts/capture.cjs` / `shots.cjs`. Commit the scripts and logs or reword to "manual runs". |
| U7 | System-design numbers: 100 players, p95 8.1 ms, 86 req/s, 34 MB, container RAM, "6.58 SOL measured", "opt-level z saves 7%", Postgres 16 4/4 | `server/test/load.ts` exists but no result file; no Postgres test run or script output; build-size numbers have no artifact. The 6.58 SOL figure re-checks (`solana rent 1294573` = 6.577 SOL) but for a size the program no longer has. |
| U8 | "Nobody can take it out early, Clashy included" / "Clashy can't move your money; only the game rules can" (`app/src/app/help.tsx` money section), "so nobody can rig a room" (web `:567`) | The program is upgradeable by one key (`6XdpT4…nYbe`, kept on the Mac), and `update_config` (`LIB:575`) lets the admin change rake (up to 10%, `MAX_RAKE_BPS`), treasury and **`vrf_required`** (turning VRF off re-enables the commit-reveal roll). AUDIT.md lists a Squads multisig only as a plan. Disclose the trust model or move the authority to a multisig. |
| U9 | The app talks to devnet-tee | `app/src/chain/client.ts:56-57` builds `er = new Connection(NET.er)` with no TEE token. Public reads work without one (verified with curl), but sends need a token (401 in `devnet-mb-test.log`). Sends go through the relay (`chain/scripts/sponsor.ts:231`, uses `tests/common.ts` `er`, which mints a token). No end-to-end app run on devnet-tee is recorded. |
| U10 | Commit ranges `375d706..6431028` (154), `93fa845..e833c62` (15), times, "the first three of these commits landed at 14:49 UTC" | Not checked: git was off limits. Re-run `TZ=UTC git log` and paste the output into the form; the ranges also omit every commit made on Nov 25, which is where most of the MagicBlock work is. |
| U11 | "GitHub repo is PRIVATE (checked with `gh repo view`)" | Unauthenticated API returns 404 today, consistent with private. The required "must be accessible" field will fail until it is public. |
| U12 | MagicBlock oracle "republished every 50 ms" (`magicblock.tsx` copy) | Sampling `ENYweb…` on devnet-as 4 times in 2.0 s gave a changed price on every read and `publish_time` stepping 1 s, so updates are sub-second, but 50 ms is not shown. Say "several times a second". |
| U13 | "Play now / Daily Cup top 20% get paid", "Leaderboard prizes", "Geofenced", "18+ confirmation", "Liquidation price shown before All-in", "Receipt: Entry fill, Exit fill, Venue fees, Funding" (web `:376-398`; landing `Bottom.tsx:45`) | No code. Real-venue fills are not implemented (`docs/REAL-TRADES.md` is a design; duels settle on price). Marked "On chain at launch" in the web, but the chips read as features. |
| U14 | `hello@clashy.fun` is "a real inbox" (`app/src/data/legal.ts:15` has `TODO(Nick)`) | MX records point to Hostinger but the mailbox is unconfirmed. The legal pages promise deletion on request to it. |
| U15 | Privy app, allowed origins, "Privy signs inside its own window" | Needs a person; the web app origin is not yet allowed for clashy.fun / play.clashy.fun (`docs/DEVNET.md:72`). |

## README.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| `:3-4` "every move on a MagicBlock Ephemeral Rollup and settlement on Solana" | UNPROVEN (overclaim) | Escrow, VRF request, delegation and settlement are base-layer txs (form table). Only start, scoring and Royale rounds are on the rollup. The 150 games are off-chain. | "every live move of a clash (picks, scoring, Royale rounds) runs on a MagicBlock Ephemeral Rollup; escrow and settlement are on Solana." |
| `:5` "Entry for MagicBlock's Solana Blitz v10 (Entertainment Finance)" | PROVEN | `api/events` id 17; Luma page. | None. |
| `:7` "live on Solana devnet with MagicBlock's Ephemeral Rollup and VRF (since Nov 22)" | PROVEN for the Nov 22 program; STALE for the current one | Txs listed. Current program has not completed a clash (S5, U1). | "Live on devnet since Nov 22 (VRF + rollup proven by the linked txs). The Nov 25 upgrade (cranks, keeper, Magic Actions, private picks, oracle) is deployed but not yet proven on devnet-tee." |
| `:9-12` "Made mostly before kickoff" disclosure | PROVEN direction; incomplete | Kickoff in API. See F6. | Update to include Nov 25 work. |
| `:18` Program, 1,324,136 bytes, initialized tx, "bytes on chain match `clashy.so`" | STALE (S2); init tx PROVEN | `4p3J8Mf…` is `Initialize` by `6XdpT4…` at 02:27:39. | "1,605,240 bytes, sha256 `2f77b872…`, upgraded Nov 25 (slot 526130812); matches `chain/target/deploy/clashy.so`." |
| `:19` Test USDC `8Jb66C…`, 6 decimals, no value | PROVEN | `getAccountInfo`: mint, 6 decimals, supply 12,800, authority `E8Lygi…` (faucet). | None. |
| `:20` Rollup devnet-as, validator `MAS1Dt9…` | STALE (S1) | Config `er_validator` = `MTEWGu…`. devnet-as `getIdentity` still `MAS1Dt9…`. | "`https://devnet-tee.magicblock.app`, validator `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo` (Private ER; needs an auth token for writes). The Nov 22 run used devnet-as `MAS1Dt9…`." |
| `:21` VRF queue `Cuj97g…`, program `Vrf1RNUj…`, oracle `vrfkfM4u…`, `vrf_required = true`, fallback refused | PROVEN | Config; callback tx `35ej9Xz7…` signed by `vrfkfM…`; `LIB:1106,1651` (`VrfRequired`); `clashy.test.ts:155`; `devnet-test-2.log`. | None. |
| `:22` Sponsor pays every fee and rent; players hold 0 SOL | PROVEN (devnet) / partly | Sponsor is fee payer of all tx (`payer=AjdLmw`); rollup fee 0. Keeper/Magic Action fees are paid by the keeper escrow, not the sponsor. The duel account rent "stays spent" (`chain/README.md:108`). | "The sponsor pays every Solana fee and rent for players; the keeper pays rollup-side action fees." |
| `:23` "The rake is 3% (300 bps)" | PROVEN | Config `rake_bps` 300. | Note it is admin-changeable up to 10% (U8). |
| `:25-34` One duel start to finish (links, 47 checks) | PROVEN | All 7 signatures exist, times 04:43 to 04:45, 47 `CheckDuel`. | Add that the explorer links to rollup txs use devnet-as, which is no longer the configured rollup. |
| `:36-52` "What was tested on devnet" | UNPROVEN as "every test passed"; individual rows PROVEN by reruns | See U3, U4. `:44` perps rows: `devnet-test-2/3/4.log`. `:46` void: `devnet-test-3.log`. `:49` "forged Privy tokens": relay test skipped/conditional on devnet. | Reword "passed (after reruns)" and link the logs; link the app-run settle txs. |
| `:56-57` "Stash buys are mainnet only" | PROVEN | `brief.test.ts:105` fails on devnet (`devnet-test-all.log`); DEVNET.md. | None. |
| `:58-59` "Nothing is on mainnet ... The open audit Highs in AUDIT.md are the gate" | PROVEN (mainnet) / wording STALE | Mainnet RPC: no account. AUDIT.md says Highs: 0 open, 3 mitigated with follow-ups; Mediums 6 open. | "The open Medium findings and the follow-ups to the three mitigated Highs in docs/AUDIT.md gate mainnet." |
| `:60-61` clashy.fun parked, play.clashy.fun no DNS | PROVEN (re-checked Nov 25) | `dig`, `curl`. | None. |
| `:65` "ran from Nov 20 14:00 to Nov 27 14:00 UTC" | PROVEN | `api/events`. | None. |
| `:68-72` commit ranges | UNPROVEN (git not checked) / FALSE for `:73` | F6, U10. | Regenerate the table from `git log` including Nov 25. |
| `:77-82` "runs end to end on a local MagicBlock stack ... and on devnet" | PROVEN for Nov 22; "5/5, 5/5, 11/11" FALSE | F2. | Replace by current counts from a fresh run. |
| `:83-84` "MagicBlock VRF rolls every coin" | PROVEN for on-chain duels and Royales; FALSE for practice games | Practice games roll client-side (`useRolled`, `Math.random` in 14 engines). | "rolls the coin of every on-chain duel and Royale". |
| `:85-92` v2 Trades: profit, ROI, candles, Copy trade; crosshair; desktop order-book terminal | PROVEN (code exists) | `ui/trade-detail.tsx` ("Copy trade"), `ui/scrub.tsx`, `ui/book-market.tsx`. | None; no behavioural test. |
| `:92-107` Chat, stickers (10 packs), tour "3 of 37", 25 inner tours | PROVEN: packs and 25 tours. UNPROVEN: "37" | 10 pack folders × 20 stickers each; `tour/screens.ts` 25 keys; `MAIN` in `tour/steps.ts` has 39 steps (44 `title:` incl. alts). | "3 of 39" or drop the number. |
| `:108-125` "150 games", "32 engines", "about 110 markets", fixed payouts from live volatility, game ideas | PROVEN: 150 (`catalog.ts` SPECS), 32 (`engines/index.ts`, all 32 used). UNPROVEN: "about 110" (runtime feed). PROVEN: payouts (`odds.ts` `payoutFor`, `sigmaOf`) | `app/src/games/catalog.ts`; `app/src/games/feed.ts:1-2` says "about 110 perps". | Say "every market Phoenix and Pacifica list (about 110 on Nov 20)". |
| `:119` "royale against seven bots" | PROVEN | `games/engines/royale.tsx:8,35` (`bots = 7`, names "Bot Ape" ...). | None. |
| `:132-133` Social server + Docker backend | PROVEN | `server/src`, `docker-compose.yml`. | None. |
| `:134-136` Audit done with Trail of Bits checklists by three independent reviewers; 4 Criticals fixed with tests | UNPROVEN as "independent" | AUDIT.md describes reviewers as agent reviews (read-only, no keys). Criticals have tests only for the relay (sponsor tests) and P1 "checked by code review only". | "reviewed against Trail of Bits checklists by three separate review passes"; say which Criticals lack tests (P1). |
| `:137-138` Archive: every call and squad message archived by `chain/scripts/indexer.ts`; SQLite testnet, Supabase mainnet | PROVEN (code) | `scripts/indexer.ts`, `server/src/db.ts`. Mainnet Supabase unproven. | None. |
| `:139-140` `bash deploy/up.sh testnet|mainnet` | PROVEN (script) | `deploy/up.sh`. Never run against a server. | None. |
| `:141-142` "100 players (load-tested at p95 8 ms with 0 errors) and a 6.58 SOL exact-size mainnet deploy (measured)" | UNPROVEN / STALE | U7, S10. | "Load test script `server/test/load.ts`; results not stored." Use 8.155 SOL for 1,605,240 bytes. |
| `:143-146` "Three screens play the real program ... Privy ... Locally the relay hands out 100 test USDC" | PROVEN | `app/src/app/onchain*.tsx`; sponsor faucet `sponsor.ts:241`. | None. |
| `:152-158` Layout table: `web/` = landing, `landing/` = second variant | PROVEN (folders) | See F4/F11 about which one is deployed. | State which is the product site. |
| `:164-182` Website section | FALSE | F4. Theme hex values: check `web/src/styles.css`. | Rewrite to describe `web/src/App.tsx` sections: hero, ticker, gameplay clips, how, games rail, real fights, ranks, live race, statement, tech. |
| `:186` MIT, Copyright (c) 2026 Nivesh Gajengi | PROVEN | `LICENSE`. | None. `app/README.md` is the untouched create-expo-app boilerplate: replace or delete. |

## HACKATHON_SUBMISSION_FORM.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| `:10-15` event, kickoff, deadline `2026-11-27T14:00Z`, prizes, form URL | PROVEN | `api/events` id 17 `submitEndDate`; Luma text "1st $500 ... Wizardio's Choice $100". | None. |
| `:15` "Not published: judging criteria ... any rule on code written before kickoff" | UNPROVEN (negative claim) | Luma page text read; no rule found. | Fine, keep "checked Nov 25". |
| `:21-22` "Required fields" | UNPROVEN | Based on the form's own validation, not reproducible from the repo. | Screenshot the form. |
| `:47,53` One-liner "every move on a MagicBlock Ephemeral Rollup, every coin rolled by MagicBlock VRF" | Overclaim | See README `:3-4`, `:83`. | "every live move of a clash; the coin of every duel and Royale". |
| `:55` "Perps clashes add leverage (up to 100x) with liquidation on the oracle price" | PROVEN (cap) / STALE (price source) | `MAX_LEVERAGE = 100` (`constants.rs`); `perps.test.ts:169`; app UI offers 2, 5, 10, 25, 50 (`ui/clash.tsx:19`), tour says "up to 50×". | "up to 100× on chain (the app offers up to 50×)". Say "on MagicBlock's oracle price" only after U1. |
| `:55` "Squads and clans add shared chests, votes and clan wars" | PROVEN | `clashy.test.ts:195`; devnet logs. | None. |
| `:58` ER paragraph, devnet-as | STALE (S1) | | Replace host by devnet-tee; keep devnet-as as "Nov 22 run". |
| `:59` VRF paragraph | PROVEN | See README `:21`. | None. |
| `:60` Zero-fee play, Privy | PROVEN; "We don't use MagicBlock session keys" STALE (S4) | | Reword per S4. |
| `:62` "Every on-chain test passed there" | UNPROVEN (U3) | | Reword. |
| `:62` "Two players also played through the web app with 0 SOL each ... all settled in test USDC" | UNPROVEN (U4) | | Add tx links. |
| `:62` "150 practice games on live Phoenix and Pacifica prices (practice money only), chat, squads and a guided tour" | PROVEN | `feed.ts`; `catalog.ts`. | None. |
| `:64` "What isn't live ... app isn't hosted yet; services ran on a Mac" | PROVEN | DNS and curl. | None. |
| `:66,140` honest timeline | See F6 | | Rewrite. |
| `:75-82` clashy.fun parked, `play.clashy.fun` no DNS | PROVEN | `dig`, `curl`. | None. |
| `:90` repo private | PROVEN-consistent (U11) | GitHub API 404. | Make public before submitting. |
| `:96-103` "launch film ... 48 s ... no devnet demo exists" | UNPROVEN | `marketing/clashy-x/film/clashy-launch-film-v2.mp4` is outside this repo. | Keep; verify the file exists before submitting. |
| `:117-118` Program and sponsor addresses | PROVEN | On chain. | None. |
| `:122` "last base-layer transaction was Nov 22 04:48" | STALE (S3) | Last is Nov 25. | Update; the new recent activity helps. |
| `:131-138` Additional-information links | PROVEN | All signatures verified. | None. |
| `:150-165` "1,520 base-layer transactions, 72 failed" and the counts table | PROVEN | Recounted; all counts exact. | Update to 1,591 total and mention the Nov 25 upgrade txs. |
| `:166-197` Duel and Royale tables | PROVEN | Instruction names, payers, fees, times (04:32:30 to 04:45:29). Second `SettleTournament` refused with 6011 (`2q9axbog…`, err `Custom 6011`). "A round called (12 calls in all), a round resolved (7 in all)" not recounted. | None. |
| `:196-197` "Rollup transactions open in Solana Explorer through custom RPC ... devnet-as still returned them Nov 24" | PROVEN (still returned Nov 25) | `getTransaction` on devnet-as. | Note devnet-as history may expire. |
| `:203-213` Before/after kickoff table | UNPROVEN / FALSE (F6, U10) | | Rewrite. |
| `:211` "program bytes on devnet match the local build" | STALE but true again today | sha256 matches `clashy.so` after the Nov 25 upgrade. | Use the sha. |
| `:221-222` "2 local docs commits ... push them" | UNPROVEN (git) | | Re-check. |
| `:230` "sponsor has about 0.26 devnet SOL" | STALE (S6) | 0.646 SOL. | Update. |

## chain/README.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| `:3` "Anchor 0.32.1, MagicBlock ephemeral-rollups-sdk 0.17 with anchor-compat and vrf" | STALE | `chain/programs/clashy/Cargo.toml:24,28`: Anchor 0.32.1, SDK `=0.18.0`, features `anchor-compat, vrf, crank, access-control`. | "0.18.0 with anchor-compat, vrf, crank, access-control". |
| `:9` Program id | PROVEN | `declare_id!` `LIB:~46`; Anchor.toml. | None. |
| `:10` "duels and tournaments are delegated, scored there every check, committed back" | PROVEN | `LIB:1203,1808,1987`. | None. |
| `:11` VRF queue `Cuj97ggr…` devnet/mainnet, `GKE6d7…` local; callbacks need VRF identity; fallback refused | PROVEN | `constants.rs` `VRF_BASE_QUEUE`; `#[vrf_callback]` `LIB:2467,3139`; test. | None. |
| `:12` Crank pushes Coinbase prices every second; base feeds every 5 s; program accepts oracle accounts `PriCems5…` | PROVEN (oracle read, `price.rs`; unit test with a real account) / partly STALE | SOL/BTC/ETH read oracle on devnet now. | Add "on devnet SOL, BTC and ETH read MagicBlock's oracle; the crank pushes only stocks". |
| `:13-33` Money, relay, faucet rules | PROVEN | `sponsor.ts` (`MAX_CU 1.4M`, price cap 100,000, fee cap 250,000, per-wallet 40 tx/10 s, quotas `create_clan 2, open_channel 8, ata 6`); `sponsor.test.ts`. | None. |
| `:15` "Deployed: Local MagicBlock stack only. Devnet and mainnet: not deployed" | STALE (S7) | Devnet deployed. | Rewrite. |
| `:37-60` What the program does (duel, clans, wars, Royale) | PROVEN | Instruction list; `clashy.test.ts`; `perps.test.ts`. | Add private picks, cranks, keeper, Magic Actions, session keys (source only). |
| `:42` Local fallback `reveal_seed` | PROVEN | `LIB:1105`, refused when VRF required. | None. |
| `:86-109` Security list (delegation lock, buying into a war, parked trades, abort, 1-lamport, lows) | PROVEN (code) / tests partly | `NotPlayer`, `WarLocked`, `NotCaptain`, `WarStakeTooBig`, `NotExpired` in tests; `abort_duel` 10-min payout "Not covered by a test" (TESTING.md `:61-63`, honest). | None. |
| `:105-109` "Trust that remains" | PROVEN, honest; incomplete | Does not mention single upgrade key or admin `update_config` (U8). | Add both. |
| `:113-114` "5/5 end-to-end, 5/5 relay and 11/11 unit" | FALSE (F2) | | Refresh. |
| `:116-117` "Privy: the Clashy app exists in Privy's dashboard" | UNPROVEN | Needs a person. | Keep as an owner statement. |
| `:118-123` VRF BLOCKED, 18.5 SOL | STALE (S7) | | Delete. |
| `:127-129` Mainnet 1.05 MB / 5.33 SOL | STALE | 1.6 MB / 8.155 SOL. | Update. |
| `:130-132` "MagicBlock sponsors only 10 commits per delegated account" | PROVEN as observed on the local validator (`crank.log`, Nov 18). Not re-proved on 1.1.1 TEE. Docs say the keeper "removes the limit" (`MAGICBLOCK.md:78`) | | Re-test on devnet-tee or say "observed on the local stack". |
| `:133-136` Clan trades are paper; Phoenix too thin | PROVEN | `.forknet/last-trade.json`: sold 1 SOL for 54.660103 USDC, best bid 60.03 at fork. | None. |

## chain/TESTING.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| `:3-6` Real validators, nothing mocked, 0-SOL players, SOL balance asserted 0 | PROVEN except F14 | Tests use `usdcPlayer` with no SOL; asserts exist in `clashy.test.ts`. | Add the staged-price exception. |
| `:10` Program unit tests, 11 | STALE | 12 `#[test]` (`math.rs` ×10, `price.rs` ×2); last run printed 13 passed (`run-all.log`). Reconcile; the 13th may be a doc test or a stale build. | State the exact count after a fresh `cargo test -p clashy --lib`. |
| `:11` e2e 5/5 | FALSE (F1) | | Use the latest run. |
| `:12` Relay 5 | PROVEN (5 tests exist) | `sponsor.test.ts:21,27,73,81,97`; the real-sponsored and Privy tests skip when keys are missing. | Say "5 tests, 2 skip without Privy/faucet keys". |
| `:13` Perps 3 | PROVEN | `suite-perps.log`: 3 pass Nov 25 (local). | Update the date. |
| `:14` Practice 5 | PROVEN | 5 tests; last devnet run `devnet-test-2.log` passes. "Played in the app: 10x and 25x clash ran 60 s" UNPROVEN. | |
| `:15` Markets 7 | PROVEN | 7 tests; passes in `devnet-test-all.log`. Fill prices (75.19) are run-specific, no log. | |
| `:16` Fork trade | PROVEN | `.forknet/last-trade.json`. | None. |
| `:17-21` Playwright suites | UNPROVEN (U6) | | |
| `:29-51` End-to-end descriptions; "Last USDC run: SOL 71.79 → 71.79 ... 5 USDC refunded", "1,334 ms", "8.333333 USDC of a 25" | PROVEN | `e2e-last.log` lines 3, 7, 12. "Royale last run on BTC ... 5.82 USDC" | UNPROVEN: the cranked Royale (SOL, 5.82) is in `suite-magicblock.log`; the `clashy.test.ts` Royale failed in `e2e-last.log`. | Cite the right log. |
| `:53-54` "MagicBlock sponsors only 10 commits per delegated account" | See chain/README. | | |
| `:56-63` Attack tests | PROVEN | Test names and error codes in `clashy.test.ts`; honest "not covered" list. | None. |
| `:72-74` Fork trade tx | PROVEN | See above. | None. |
| `:82-89` "~30 rollup checks at ~10 ms each" | UNPROVEN | No log. | |
| `:93-96` Not covered | STALE (S8) | | |

## docs/MAGICBLOCK.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| `:9-18` Step table (VRF, delegation, Private ER picks, cranks, oracle, commit+undelegate, Magic Action) and `:20` "After step 5 nobody sends another transaction" | PROVEN locally; UNPROVEN on devnet (U1) | `suite-magicblock.log` (cranked duel settled 30.6 s after start, keeper ticks 63→94; cranked Royale paid 5.82 to the survivor; private duel settled). Devnet: keeper ticks 0. | Add a banner: "Proven on the local MagicBlock stack (validator 1.1.1). Devnet-tee run pending." |
| `:25-30` Delegated accounts and function names | PROVEN | `delegate_*` fns exist; `set_er_validator` `LIB:564`; `pinned_validator` `LIB:~2258`. | None. |
| `:30` "Moves on the rollup cost nothing" | PROVEN | Rollup txs fee 0 on devnet-as. | None on devnet-tee yet. |
| `:33-36` VRF; `#[vrf_callback]` checks the identity; test name "MagicBlock VRF rolls the coin" | PROVEN | `clashy.test.ts:155`. | None. (Local run of that test failed on Nov 25 13:46: see F2.) |
| `:38-48` Private picks: permission private with one member, rival cannot read, second lock refused, start refuses before both locked, picks copied then public, `close_pick`, `abandon_private_duel` | PROVEN except "rival cannot read it" | `LIB:325-340` (is_private true, one member), `2086,2111,2156,2199`; `magicblock.test.ts:222-248`. | U2. |
| `:49` "replaces four Solana commit-reveal transactions" | PROVEN | `commit_pick`×2 + `reveal_pick`×2. | None. |
| `:51-55` Cranks: `ScheduleCrankCpi`, 1,000 ms, until bell + void grace, idempotent, task id from address | PROVEN | `LIB:2232`, `TICK_MILLIS`, `task_id`. | None. |
| `:55-56` "mainnet and MagicBlock's devnet TEE run 1.1.1, and so does the local stack" | PROVEN | `getVersion` on both; `er.log` "Validator version: 1.1.1". | None. |
| `:57-62` Oracle: `PriCems5…`, ids 6/1/2, `read_price` checks, +8 exponent, real-account unit test, stocks keep own feeds | PROVEN | `price.rs:35-60,79-100`; devnet-tee shows oracle accounts owned by `PriCems5…`, 134 bytes, exponent +8 on devnet-as; stocks are Clashy-owned. "ids 6, 1, 2" only in a script comment (`devnet-magicblock.ts:26`). | None. |
| `:64-71` Magic Actions, attached in 7 functions, "not atomic ... anyone can settle" | PROVEN (code) | `LIB:1203,1233,1809,1836,1988,2027,2167` (7 functions). Tests F15. | Reword the tests line. |
| `:73-79` Keeper PDA, magic fee vault seeds, escrow `["balance", keeper, 255]`, `ticks/finished` shown in app | PROVEN (code) | `constants.rs` `KEEPER_SEED`, `fee_vault_of` `LIB:2244`; `magicblock.tsx:49-55`. "Also removes the 10-sponsored-commits limit" UNPROVEN on devnet. | |
| `:83-84` SDK `=0.18.0`, TS SDK 0.18.0 | PROVEN | `chain/programs/clashy/Cargo.toml:28`, `chain/package.json:13`. | None. |
| `:85-86` "local stack ... same versions as devnet" | PROVEN (validator 1.1.1, base 4.5.0-beta.0 = `apiVersion` of devnet RPC) | | None. |
| `:98-103` Test table | PROVEN (names exist); "keeper cannot be abused" title F13. | | |
| Session keys | Missing | `LIB:2094,2102`; local test. | Add a "Session keys (source only, not deployed)" paragraph. |

## docs/DEVNET.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| `:7` Program, 1,324,136, authority `6XdpT4…` | PROVEN authority / STALE size | See S2. | Update size. |
| `:8` Base RPC | PROVEN | Works. | |
| `:9` devnet-as `MAS1Dt9…` | STALE | S1. | |
| `:10` VRF queue; oracle "answers in about 1.8 s" | PROVEN queue; 1.8 s UNPROVEN as a number | Tx times: request 04:44:07, callback 04:44:08 (1 s granularity). | "about 1 to 2 s". |
| `:11` Test USDC mint authority is the faucet key | PROVEN (non-null authority `E8Lygi…`); identity of key unverified | | |
| `:12` Rake 3% to treasury `6scuHR…HV3n` | PROVEN | Treasury token account owner `6scuHR…`. | |
| `:13` Keys in `chain/.keys/devnet-*.json` gitignored | UNPROVEN here (git) | | |
| `:15-30` Test table | See U3. "Rollup price feeds live and moving (crank running)" PROVEN Nov 22 (`devnet-test-2.log`) | | |
| `:30,40-46` Stash NVIDIA mainnet only; Royale stock-coin fix; faucet limits | PROVEN | `devnet-test-all.log` shows the Stash test failing; faucet code `sponsor.ts:238-253` (one per wallet a day, five per IP an hour). | |
| `:37-38` 126 + 24 games | UNPROVEN (U5) | | |
| `:48-62` Run commands | PROVEN (scripts exist) | Require a TEE token on devnet-tee. | Add the token step. |
| `:65-72` Before the public beta | STALE items S6; `:72` Privy origins still open | | |

## docs/AUDIT.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| `:9` scope "3,498 lines" | STALE (S11) | 4,507 lines. | |
| `:18-27` Trail of Bits skills, three independent reviewers | UNPROVEN | No reviewer reports in the repo. | Link or attach the three reports. |
| `:40-47` Counts (4 Critical fixed; High 6: 3 fixed, 3 mitigated; Medium 13: 6 fixed, 1 mitigated, 6 open) | PROVEN for Critical/High rows (6 High rows, 4 Critical rows). Mediums: only 12 rows listed (6 fixed, 1 partial, 5 open) | Rows P4-P7, M-M1..M3, R-M1..R-M5. | Fix 13 → 12 or add the missing row. |
| M-C1 `CrankIsAdmin` | PROVEN | `LIB:546,577`. | |
| R-C1/R-C2 relay limits and tests | PROVEN | `sponsor.ts:79-81,161`; `sponsor.test.ts:27`. | |
| P1 "Fixed ... checked by code review only" | PROVEN, honest | `DUEL_SETUP_SECS`, `DUEL_REVEAL_SECS` in `LIB:1130-1143`; no test. | Add the clock-warp test. |
| P7, M-H1 | STALE (S12, S13) | | |
| Whole file | Missing | No finding for cranks, keeper PDA, Magic Actions (non-atomic post-undelegate), TEE permissions, session tokens, oracle exponent heuristic (`oracle_exponent` guesses sign from the value). | Add an addendum or state "not audited". |

## docs/SYSTEM-DESIGN.md, REAL-TRADES.md, GAME-DESIGN.md, MINI-GAMES.md, LAUNCH-PLAN.md, DEPLOY-RUNBOOK.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| SYSTEM-DESIGN `:15,123,187-192` | STALE | S10 | Update the MagicBlock table to current status. |
| SYSTEM-DESIGN `:92` "Measured: 100 sign-ins in 0.20 s, 2,750 requests in 32 s ... p95 8.1 ms" | UNPROVEN (U7) | | Store the output. |
| SYSTEM-DESIGN `:127-132,138` 6.58 SOL deploy, "drops to about 8 SOL" | STALE | Program is 1,605,240 bytes: 8.155 SOL rent. | |
| SYSTEM-DESIGN `:159` per-duel cost 0.003 to 0.004 SOL | UNPROVEN | Cites MagicBlock pricing page; not measured on this stack. | |
| SYSTEM-DESIGN `:175` Solana Incubator deadline Dec 4 | UNPROVEN | Not rechecked. | |
| REAL-TRADES.md, GAME-DESIGN.md, MINI-GAMES.md ("real orders only", "Real fills", "10 Hz scoring", "Glicko-2", "Stand-ins", "matched in under 10 s", "No bots in money games", "Sealed picks ... 10 Hz scoring") | UNPROVEN: design documents dated Nov 15, never built | Duels settle on price (`chain/README.md:133-136`); scoring is 1 Hz (`TICK_MILLIS`); rating is Elo (`constants.rs`); matchmaking is an open challenge board, not a queue. | Put a banner on each: "Design only, not built." Currently the README links them under `docs/` as "Game design, mini-games, real-trades plan". |
| LAUNCH-PLAN | STALE (S14) and plans, not claims | | Mark as historical. |
| DEPLOY-RUNBOOK | STALE (S15) | | |

## docs/GAMES.md, GAME-KIT.md, ART-3D.md, DESIGN-BRIEF-NOV18.md, TEST_PLAN.md, docker/README.md

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| GAMES.md `:3` "100 games built Nov 20; 50 more on 11 new engines Nov 21" | PROVEN | `catalog.ts` header and section comments (22+21+20+19+18 = 100 plus the Nov 21 block; 150 SPECS rows; 32 engines). | None. |
| GAMES.md `:5` "Clashy Bot picks at random, said plainly" | FALSE (F5) | | |
| GAMES.md `:9-11` "140 + 38 Grok ideas", "all in `grokbot/research/clashy-games/`" | UNPROVEN | The path is outside this repo. | Point to a committed copy or drop. |
| GAMES.md `:22` `catalog.ts` "the 100 games" | FALSE | 150. | |
| GAMES.md `:13,26-27` `/games/kit`, `app/src/app/games/kit.tsx` | PROVEN | File exists. | |
| GAMES.md `:70` Royale: 7 bots, (bots+1)×0.97 = 7.76× | PROVEN arithmetic | `royale.tsx:6`. | |
| GAME-KIT.md `:79` "14 game colours" | PROVEN | `catalog.ts` `T` has 14 entries. | |
| ART-3D.md: 20 avatars, 10 sticker packs of 20, ChatGPT/CoinGecko references | PROVEN (counts); sources UNPROVEN | `app/assets/stickers/*` 10 × 20; `AVATARS = 20` (`constants.rs`). | Real brand logos in stickers is disclosed; confirm licensing before a public release. |
| DESIGN-BRIEF-NOV18.md | Brief, no factual claims about the product | | |
| TEST_PLAN.md `:14-67` "Results (Nov 16) ... all PASS ... Zero mocks or stubs remain" | UNPROVEN as results; the plan is real | No recorded output. Several items (Daily Cup, Skirmish, Bounty, "Ranked claimed a VRF queue") describe screens that no longer exist in `app/src/app`. | Date-stamp as the Nov 16 build and list which routes still exist. |
| docker/README.md "five containers", "Memory cap", measured footprint, "3 end-to-end tests" | PROVEN containers; F12; footprint UNPROVEN | `docker-compose.yml`. | |

## web/src/App.tsx (the `web/` landing)

| Claim (line) | Status | Evidence | Fix |
|---|---|---|---|
| `:130` "Practice games live on real prices" | PROVEN | `web/src/lib/markets.ts` (Coinbase, DexScreener); error shown, no invented price. | None. |
| `:136` "Quick match a rival, one coin gets rolled ... best move in 60 seconds wins" | UNPROVEN (matchmaking) / PROVEN (coin, 60 s) | Challenge board only (`clashy.test.ts:134`); no queue. | "Open a challenge or take someone's; one coin gets rolled ...". |
| `:140` Live card and ticker: Coinbase/DexScreener prices, 24h change | PROVEN | `markets.ts:23-36`. | |
| `:167-181` How steps: "VRF rolls one coin", "health bar drains", "ten tiers, Exit Liquidity to The House" | PROVEN for VRF; UNPROVEN for "health bar" and the ten **named** tiers in the app | Tour says "Rookie to Legend. Ten ranks" (`tour/screens.ts leaderboard`) while the web names them Exit Liquidity ... The House (`App.tsx:409`). Two different tier name sets. | Make them agree. |
| `:259-272` rail "Double or Nothing" (After any win, "×2, ×4, ×8 ... one loss ends the streak") | FALSE as described | In the app "Double or Nothing" is a 15 s streak game (`catalog.ts:228`), not a roll-the-pot feature. | Reword. |
| `:263` Royale | FALSE (F7) | | |
| `:259-272` Diamond Hands, Draw the line, Ranked, Daily Cup, Clan Skirmish "Playable now" | FALSE (F8) | | Remove or mark "removed from the beta". |
| `:271` Clan war "At launch" | PROVEN honest but STALE | On-chain wars run on devnet (`clashy.test.ts:195`, devnet logs). | "On devnet now". |
| `:346` "real pots open on Solana mainnet at launch" | PROVEN as intent | Mainnet not deployed. | Consider "later". |
| `:367-376` "Real pots. Real receipts", "Your stake goes into a Solana escrow before the game starts", "committed to Solana with a receipt anyone can check" | PROVEN (escrow, settlement on devnet) / UNPROVEN (receipt format: entry fill, exit fill, venue fees, funding) | No venue fills exist. | Drop the receipt fields that have no code. |
| `:398` chips "18+, Geofenced, Liquidation price shown before All-in, Daily loss limit" | UNPROVEN (U13) | A daily **stake** limit exists (`set_limits`, `brief.test.ts:46`), not a loss limit. | "Daily stake limit". |
| `:502` race note | FALSE (F10) | | |
| `:553` Statement | FALSE (F9) | | |
| `:553` "Every tick on a MagicBlock Ephemeral Rollup" | UNPROVEN (U1) and an overclaim for practice | | |
| `:566-568` Tech cards (private picks, VRF, rollup referees) | See U1, U2, U8 | | Present as "built and tested on the local MagicBlock stack; devnet run pending". |
| `:578` "run on Solana devnet with ... VRF, cranks, oracle and Magic Actions, in test USDC" | UNPROVEN (U1) | | |
| `:596` "Coming to iOS, Android, the Solana dApp Store and the web" and "App Store and Google Play: coming soon" | PROVEN honest (roadmap) | | |

Hard-coded content in the landing variant (`landing/`, a second site that `README.md` lists and `DEPLOY-RUNBOOK.md` builds), shown as if it were product data and **not** labelled (only the streak card carries "Design sample", `landing/src/sections/Rail.tsx:90`):

| Location | Hard-coded | Status | Fix |
|---|---|---|---|
| `landing/src/sections/How.tsx:92-97` | "Find a duel" list: nova "61% win", rexx "49% win", bao "57% win", merl "52% win" | FALSE if read as real players | Add "Design sample" or remove names and rates. |
| `landing/src/sections/How.tsx:146-148,128-135` | "0:42", "you · long SOL +64%", "rexx · short SOL −64%", "0:08 left to pick", 250×/500×/1000× | UNPROVEN (illustration); leverage options conflict with the program cap of 100× and the app's 2–50× | Label as illustration or drive from the Arena demo. |
| `landing/src/sections/Rail.tsx:28-37` | "Night Owls +14%", "Degen Inc. +9%", tug bar 58% | FALSE if read as real clans | Label. |
| `landing/src/sections/Rail.tsx:145-156` | Leaderboard podium with fixed avatars | Illustration, unlabelled | Label. |
| `landing/src/sections/Bottom.tsx:40` | "Up to 50 players" Royale, "Coming" | FALSE (cap 16); STALE (Royale is playable on devnet) | |
| `landing/src/sections/Bottom.tsx:45` | "Daily cup ... Top 20% get paid" | UNPROVEN | Remove. |

## App (copy and data)

| Claim | Status | Evidence | Fix |
|---|---|---|---|
| `help.tsx` "Stakes $5, $10, $25", "Royale join for 2 USDC, 2/4/8/16 seats, 1 to 3 hearts, 10 s rounds", "most hearts split it" | PROVEN | `settle_tournament` (`LIB:1841-1868`) pays all players with the max lives; `create_tournament` bounds (`LIB:1639-1645`). On-chain minimum stake is 1 USDC (`MIN_STAKE`); the 5/10/25 are UI choices. | None. |
| `help.tsx` "Ties refund, no fee" | PROVEN | `settle_duel` draw branch `LIB:~1262` (`(pot, 0)`). | |
| `help.tsx` "Both stakes minus the fee"; "Rate read live from the Clashy program" | PROVEN | Config. | |
| `help.tsx` "break cannot be shortened; raise waits 24 h; starts at $50" | PROVEN | `brief.test.ts:46,58`; `DEFAULT_DAILY_LIMIT`, `LIMIT_RAISE_DELAY`. | |
| `help.tsx` "Stash ... real tokenized shares ... bought through Orca" | PROVEN on a mainnet fork only (`brief.test.ts:105`); fails on devnet | | Add "mainnet only". |
| `help.tsx` "Nobody can take it out early, Clashy included" | UNPROVEN (U8) | | |
| `tour/steps.ts:57` "150 more games" | Minor: 150 total, not 150 more | | "150 games". |
| `tour/steps.ts:58,60` "Up to 16 players" PROVEN; "Go up to 50×" conflicts with the 100× cap | | | Say "up to 50× in the app". |
| `tour/steps.ts:56` "From $5" | UNPROVEN (UI choice) | | |
| `app/src/app/magicblock.tsx` "Nothing here is a mock" | PROVEN for data (reads `Config`, keeper, oracle accounts) | On devnet-tee `er.getAccountInfo(P.keeper)` shows 0 ticks. Copy "every 50 ms" U12; "Duels ... run here with no fees" fine. | |
| `data/legal.ts` Terms, Privacy, Responsible play | PROVEN to exist; legal review not done (LAUNCH-PLAN) | `legal.ts:15` TODO; F11. | |

Leftover mock or hard-coded data inside the Expo app: none found presenting invented numbers as live. Grep for mock, fake, dummy, placeholder, "Lorem", sample names found only: bot names labelled "Bot Ape ..." in Royale practice (`royale.tsx:28`), a placeholder logo while a market rolls (`games/kit/tokens.ts:23`), and the demo clock in `/games/kit` (`games/kit.tsx:146`, labelled "a 20 s demo clock"). Hard-coded values are confined to `landing/` (above).

## Code comments that claim behaviour the code does not have

| Where | Comment | Reality |
|---|---|---|
| `LIB:1-19` | "long/short picks are sealed by commit-reveal"; "Clans ... scored on the oracle price" | Private TEE picks exist; clan trades read Solana base feeds (`chain/README.md:51`: "at the Solana price"), not the MagicBlock oracle. |
| `app/src/app/onchain-clan.tsx:3` | "oracle price (paper P&L on the chest's notional)" | Reads the base feed pushed by the crank (`TEST_PLAN.md` E5 fixed to show the Solana price). |
| `chain/scripts/crank.ts:1-4` | "pushes live Coinbase prices into the delegated feeds on the rollup every second ... Rollup feeds are not committed back" | See S18. |
| `chain/tests/magicblock.test.ts:270` | "the keeper cannot be abused: ticking a duel that is not live does nothing" | F13. |
| `chain/tests/magicblock.test.ts:246-250` log line "picks private until the start" | Test prints this after only checking that a permission account exists; no read check. U2. |
| `LIB:2115-2119` (`start_private_duel` doc) "schedules the MagicBlock crank that runs tick_duel every second" | Proven locally only. |
| `LIB` `settle_duel_action` doc "if it fails, the duel still comes home FINISHED and anyone can call settle_duel (the app does)" | PROVEN in code: `onchain.tsx:235-236` (8 s / 14 s delay). Failure path itself is untested (the tests only wait for the happy path). |
| `chain/programs/clashy/src/price.rs:61-66` `oracle_exponent` | "A price is never quoted in units of 10^8 USD, so a positive exponent is read as decimals." The sign is inferred, not read from the account; a future oracle version that sends a negative exponent changes behaviour silently. Verified against the live devnet account only (exponent +8). |

## What is PROVEN and can be stated with confidence

- Devnet program, config, VRF queue, test USDC mint, sponsor and crank accounts exist and match the docs (except the stale rollup and size).
- All 18 linked transactions are real, correct instruction, correct time; 47 `CheckDuel` on the rollup; rollup fee 0; VRF callbacks signed by MagicBlock's oracle; a second settle refused with `WrongStatus` (6011).
- 1,520 pre-Nov-23 base-layer transactions, 72 failed, and every instruction count in the form.
- `vrf_required = true` on devnet; commit-reveal fallback and forged callbacks are refused (tests, `LIB:1106`).
- 3% rake; USDC-only escrow; players at 0 SOL; sponsor relay refusal rules (code plus tests).
- 150 games, 32 engines, 10 sticker packs × 20, 25 screen tours, 20 avatars; practice games run on live Phoenix/Pacifica prices with errors shown instead of fake prices.
- No mainnet deployment; clashy.fun parked; repo not publicly readable (today).
- The oracle read path (`price.rs`) with a unit test on a real devnet account; SOL/BTC/ETH now point at `PriCems5…` accounts on devnet-tee.
- The local MagicBlock stack proves, with logs (`suite-magicblock.log`): cranked duel settled by Magic Action 30.6 s after start, cranked Royale paid 5.82 USDC to the survivor, a private duel with a session-key lock settled itself.

## Recommended order of fixes before screening

1. Run one cranked duel and one private duel on devnet-tee (fix the crank's 401: pass the TEE token to every sender), keep the tx links and logs, then update README, form, MAGICBLOCK.md and the web Tech section (U1, U2, S1, S5).
2. Re-run `cargo test`, `clashy.test.ts` (VRF test), and publish the real counts (F1, F2, S9).
3. Rewrite the honest-timeline table from `git log` including Nov 25 (F6, U10).
4. Fix or delete the false landing claims (F7 to F11) and label the landing's illustrative data.
5. State the trust model: upgrade authority, `update_config`, keeper escrow (U8).
6. Make the repo public, host one site, and pick one of `web/` or `landing/`.
