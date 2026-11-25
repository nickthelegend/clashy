# Clashy security audit (Nov 19, 2026)

**Status:** pre-mainnet internal audit. **Not a substitute for a paid third-party audit before real money.**

**Not covered (added after this audit, Nov 25):** MagicBlock cranks (`tick_duel`, `tick_round`), the keeper PDA, Magic
Action settlement, private picks on the TEE rollup and their permissions, session-key instructions, MagicBlock oracle
reads (including `oracle_exponent`, which infers the exponent's sign), `admin_undelegate` and the 0.5% Stash fee. None
of these has an audit finding yet.

**Scope:**

| Area | Files |
|---|---|
| Anchor program (all 3,498 lines on Nov 19; 4,546 lines on Nov 25, see Not covered) | `chain/programs/clashy/src` |
| MagicBlock links (delegation, commits, VRF, price feeds, crank) | `chain/scripts/crank.ts`, `chain/tests/common.ts` |
| Sponsor relay | `chain/scripts/sponsor.ts` |
| Social server | `server/` |
| Docker and deploy files | `docker-compose.yml`, `docker/`, `deploy/` |
| App wallet and session handling | `app/src/chain` |

## Method

- **Checklists:** [trailofbits/skills](https://github.com/trailofbits/skills) (CC-BY-SA-4.0, 8.3k stars, fetched from `main` on Nov 19). The skills used:
  - `building-secure-contracts/solana-vulnerability-scanner`, with its `VULNERABILITY_PATTERNS.md`;
  - `entry-point-analyzer` (Solana reference);
  - `insecure-defaults`;
  - `sharp-edges` (auth, config, crypto, JavaScript and Rust references).
- **Handling:** only the markdown was downloaded (no scripts). It was read in full and grepped for prompt injection before use, and used as a checklist.
- **Reviewers:**
  - Three independent reviewers, read-only, with no access to keys or `.env` files: program money paths, MagicBlock links, and off-chain services.
  - Each finding was re-checked against the code before fixing.
  - The MagicBlock reviewer also read the `ephemeral-rollups-sdk` 0.17 macro sources to confirm the VRF identity check. (The program moved to SDK `=0.18.0` on Nov 25.)
- **Tests after the fixes (Nov 19):**

| Suite | Result |
|---|---|
| Program unit tests | 11/11 |
| On-chain end-to-end (local MagicBlock stack, upgraded program) | 5/5 |
| Relay | 5/5, with new attack cases |
| Social server, SQLite | 4/4 |
| Social server, Postgres 16 | 4/4 |

## Summary

| Severity | Found | Fixed | Mitigated | Open |
|---|---|---|---|---|
| Critical | 4 | 4 | 0 | 0 |
| High | 6 | 3 | 3 | 0 (the 3 mitigated have follow-ups) |
| Medium | 12 | 6 | 2 | 4 |
| Low / Info | 20+ | 6 | 2 | the rest (listed) |

**Gate for mainnet:** every row marked **Open** at High or Medium below is fixed and re-audited, plus a paid external audit.

## Program: money paths

| # | Severity | Finding | Status |
|---|---|---|---|
| P1 | **Critical** | **Stealing the opponent's stake.**<br>• Picks had no deadline. After the 10-minute timeout, an attacker could `commit_pick`, `reveal_pick` and `abort_duel` in one transaction and take the forfeit pot.<br>• It needed only the honest player to commit first. | **Fixed.**<br>• Commits close at `matched_at + DUEL_SETUP_SECS`.<br>• Reveals close 5 minutes later (`DUEL_REVEAL_SECS`).<br>• Once both picks are in, abort is allowed only after the reveal window. A single transaction can't both reveal and abort, so the honest revealer wins. |
| P2 | **High** | **Draining a clan chest with a fake war.**<br>• A captain declares war on their own sock clan.<br>• The sock clan opens a long and a short at 20x on the same coin. Losses are floored at the notional with no liquidation, so the hedge can't lose.<br>• The sock clan wins the pot. | **Mitigated (Nov 19).**<br>• Declaring or accepting a war now requires the captain to hold more than half of the chest's shares (`NeedsMajority`), so a captain can't stake members' money. The e2e war test passes under this rule.<br>• **Open:** share-weighted war votes (so minority captains can war again), one position per coin per clan, liquidation at -100% |
| P3 | **High** | A tournament creator could delegate and never start, locking every entry on the rollup. | **Fixed.** Anyone can `start_tournament` once `created_at + TOUR_LOBBY_SECS` has passed. Delegation already requires 2 or more players. |
| P4 | Medium | An outsider with no shares could keep a 7-day proposal open and block withdrawals. | **Fixed (main path).**<br>• `propose` requires `member.shares > 0`.<br>• Open: a per-member vote lock instead of the clan-wide lock. |
| P5 | Medium | A declared war that's never accepted freezes withdrawals. | **Open.** Add an `accept_by` deadline; anyone cancels after it. |
| P6 | Medium | Breaks and daily limits aren't checked on chest deposits or wars. | **Open.** Call `check_stake` in `deposit_chest`, and in declare/accept. |
| P7 | Medium | `start_duel` on Solana could strand a duel LIVE if a coin pointed at an oracle readable there. | **Mitigated by delegation, not by code (Nov 25).** SOL, BTC and ETH were switched to MagicBlock oracle accounts on devnet on Nov 25. Those accounts are delegated on Solana (owner `DELeGG…`), so `read_price` there returns `FeedInvalid`. **Open:** a `delegated` flag and a LIVE-on-Solana timeout refund. |
| P8–P12 | Low | Other issues, all **Open** (tracked):<br>• the treasury mint isn't validated;<br>• rake is read at settle, not at creation;<br>• the global `auth` signer is passed to Orca;<br>• `initialize` can be front-run;<br>• one closed USDC account blocks settlement. | **Open** |

## MagicBlock links

| # | Severity | Finding | Status |
|---|---|---|---|
| M-C1 | **Critical** | **One key controlled everything.** The crank's always-online key was also the admin and program-upgrade key. Compromising the crank machine meant upgrading the program and draining every vault, or choosing every price. | **Fixed.**<br>• The program refuses `crank == authority` in `initialize` and `update_config` (`CrankIsAdmin`).<br>• The crank has its own key (`CLASHY_CRANK`; locally `.keys/local-crank.json`). Setup moved the live config onto it, verified on the local chain.<br>• Role-based key loading (`CLASHY_ROLE`): the crank process holds only the crank key and no longer runs admin setup; the relay holds only the sponsor key.<br>• `deploy.sh` refuses when the two keys are the same. |
| M-H1 | **High** | **The caller picks the exit price.**<br>• `check_duel` and `resolve_round` score at whatever price is live when called.<br>• A modified client can skip knockout checks and call at a favourable second after the bell. | **Mitigated (Nov 19).**<br>• Since Nov 25 the primary path is a MagicBlock crank on the rollup that ticks every live game every 1,000 ms (`TICK_MILLIS`). `chain/scripts/crank.ts` is the backup: it checks a cranked game only 10 s after its bell (`BACKUP_SECS`), and still checks games without a crank every 2 s with its own key.<br>• Both devices also check from the bell.<br>• **Open, before mainnet:** a price sampled at the bell (ring of `(ts, price)` in `PriceFeed`). |
| M-H2 | **High** | **Funds can get stuck on the rollup** if the crank stalls past 15 s, if a lobby is never started, or if the validator changes. | **Fixed (Nov 19).**<br>• New permissionless rollup instructions `void_duel` and `void_tournament`. 120 s after a bell that nobody could finish (`VOID_GRACE_SECS`), anyone ends the game and commits it back to Solana.<br>• A voided duel settles as a draw: both stakes refunded, no rake (`tests/void.test.ts`). A voided Royale settles to the players on the most lives.<br>• The keeper and the duel screen both call it.<br>• The tournament lobby is fixed too (P3).<br>• **Open:** an admin `undelegate_feed` for a validator change. |
| M-M1 | Medium | **Price feeds aren't sanity-checked.**<br>• Pushed prices have no per-update bound and no source timestamp.<br>• 15 s of staleness is tolerated on the rollup. | **Open.**<br>• `push_price(price, source_ts)`, monotonic and fresh.<br>• A move cap.<br>• A rollup age of about 3 s.<br>• For stocks, MagicBlock's oracle or a median of sources. |
| M-M2 | Medium | **Royale calls can wait for the price.** They can be changed until the bell with the price visible. | **Open.** Close calls at mid-round, or use commit-reveal. |
| M-M3 | Medium | **Any member chose the rollup validator** a squad's channels go to. | **Fixed.** Every delegation (channels, feeds, board) goes to `config.er_validator` (`pinned_validator`), never to a validator the caller passes. |
| M-L1 to L5 | Low | **Five low findings:**<br>1. Board and like spam on the zero-fee rollup.<br>2. `start_duel` isn't pinned to the rollup.<br>3. The advertised leverage isn't enforced.<br>4. The fallback roll lets the last revealer refuse.<br>5. The app swallowed failed checks. | • **L5 fixed:** check errors are shown.<br>• **L4 hardened:** local rules refuse a remote RPC.<br>• L1, L2 and L3: **Open**. |

**Checked and sound (verified in code and the SDK source):**
- VRF callbacks require MagicBlock's VRF identity signer and are one-shot per duel or tournament.
- The commit-reveal fallback is refused when VRF is required.
- Only the crank pushes prices; zero prices are rejected; oracle accounts are checked for key, owner, discriminator and freshness.
- Delegated accounts can't be mutated or settled on Solana.
- Duel and tournament delegation is pinned.
- Picks stay sealed until both are committed, and the hash binds duel, player and salt.
- Channel posts are members only.

## Off-chain services

| # | Severity | Finding | Status |
|---|---|---|---|
| R-C1 | **Critical** | **One transaction could empty the sponsor.** Compute Budget instructions were accepted unparsed. A transaction of only `[SetComputeUnitLimit(1.4M), SetComputeUnitPrice(huge)]` had no signers to check. | **Fixed + tests.**<br>• Only a unit limit (at most 1.4M) and a price (at most 100,000 micro-lamports) are allowed; anything else, including a heap request, is refused.<br>• A transaction of only compute-budget instructions is refused.<br>• Before signing, the network's own fee quote must be under 250,000 lamports. |
| R-C2 | **Critical** | **Rent farming.**<br>• The sponsor would create USDC accounts for any owner, without the owner's signature.<br>• Owners close them and keep the rent, about 0.002 SOL each, in a loop. | **Fixed + tests.**<br>• It must be the owner's own associated account, made by the System Program.<br>• The owner must sign the transaction, or receive USDC in it.<br>• Daily per-player quotas: 6 token accounts, 2 squads, 8 channels. |
| R-H1 | **High** | Squads and channels are permanent rent sinks: about 0.144 SOL per `create_clan` plus 4 channels, with no cap. | **Mitigated:** the relay's daily quotas. **Open:** an on-chain cap per player, a USDC fee for creating a squad, captain-only `open_channel`, and close instructions. |
| R-H2 | **High** | **Fail-open defaults.**<br>• `CLASHY_LOCAL` defaulted to 1 in compose (faucet on, no Privy auth, local keys).<br>• The localhost regex had no anchors. | **Fixed.**<br>• `CLASHY_LOCAL` defaults to 0, and local `.env` sets it.<br>• `IS_LOCAL` parses the hostname and refuses `CLASHY_LOCAL=1` for any host that isn't a local chain.<br>• The relay's `/faucet` stays local-only. |
| R-M1 | Medium | The internet-facing relay loaded the admin key. | **Fixed:** role-based keys (see M-C1). |
| R-M2 | Medium | **The market proxy could be abused:**<br>• `\b` and `..` let paths escape the allowlist;<br>• answers had no size cap;<br>• there was no per-IP limit. | **Fixed.**<br>• Dot segments, encoded slashes and backslashes are refused.<br>• Patterns are anchored.<br>• Answers are capped at 2 MB.<br>• 900 market reads per minute per IP.<br>(Async cache persistence: open, minor.) |
| R-M3 | Medium | **The rate limit could be dodged or abused through ports and the proxy:**<br>• service ports were published on all interfaces;<br>• the proxy's forwarded IP wasn't trusted. | **Fixed.**<br>• Every service port binds to 127.0.0.1, so only Caddy is public.<br>• The deploy env sets `CLASHY_TRUST_PROXY=1`. |
| R-M4 | Medium | The device test wallet's key sits in plain app storage, on any network. | **Fixed for mainnet:** the device wallet refuses mainnet builds; Privy is used there. **Open:** `expo-secure-store` on phones. |
| R-M5 | Medium | `/info` exposed the RPC URLs, which can carry API keys. | **Fixed:** hostnames only. |
| R-L | Low | **Remaining low issues:**<br>• a global nonce cap;<br>• no session-token revocation;<br>• private accounts' follower lists were public;<br>• unbounded maps;<br>• no CSP header;<br>• the inbox's N+1 queries;<br>• the local chain image runs as root;<br>• small-order Ed25519 keys. | • **Fixed:** private follower lists (now followers-only) and small-order keys (refused at sign-in).<br>• **Open:** the rest. |

**Checked and sound:**
- The sponsor signs only for Clashy, Compute Budget, Token and ATA programs. It is never a non-payer account, so it can't move SOL.
- USDC withdrawals come only from the signer's own account.
- Every program vault close refunds the recorded `rent_payer`.
- The signed bytes are the vetted bytes.
- Social:
  - SQL is fully parameterised;
  - DMs are keyed by the session's wallet (no IDOR);
  - sign-in nonces are single-use and wallet-bound;
  - the zero-blockhash sign-in is never sendable;
  - tokens are HMAC-signed, compared in constant time and expire;
  - the indexer endpoint compares its secret in constant time and fails closed.
- No secrets are in images or in git.

## Tests run after the fixes (local MagicBlock stack, program upgraded in place)

| Suite | Result |
|---|---|
| Program unit tests (`cargo test --lib`) | **11/11** |
| On-chain end-to-end (`tests/clashy.test.ts`: duel, challenge board, VRF, squad chest and war, Royale) | **5/5** |
| Relay (`tests/sponsor.test.ts`, with the new compute-budget, rent-farming and wrong-address cases) | **5/5** |
| Social server, SQLite and Postgres 16 | **4/4 each** |
| Stuck duel voided after the grace, both refunded, no rake (`tests/void.test.ts`) | **1/1** |

Latest local runs (Nov 25, not an audit re-run): 13/13 unit tests, clashy 5/5, perps 3/3, brief 9/9, void 1/1,
magicblock 4/4 (`chain/evidence/run-all.log`, `suite-*.log`, `c-vrf.log`).

On-chain, the end-to-end suite runs the full duel, VRF, squad chest and wars, and Royale flows. The fixes were checked in the following ways:
- **Crank / admin separation:** the live config moved from the admin key to the crank key through `update_config`, and the crank pushes with its own key.
- **Relay defences:** each has a test.
- **Pick deadlines:** checked by code review only. A deadline test would have to wait out the real 10-minute window. Add a clock-warp test in the program unit tests before mainnet.
