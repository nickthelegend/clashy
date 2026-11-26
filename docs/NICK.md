# Nick: Clashy submission, Solana Blitz v10

**Deadline: Fri Nov 27, 2026 14:00 UTC (19:30 IST).** Form: https://build.magicblock.app/?stage=blitz#submit
(Telegram login). Paste-ready answers: [HACKATHON_SUBMISSION_FORM.md](../HACKATHON_SUBMISSION_FORM.md). Film plan:
`grokbot/research/films/clashy/FILM-DRAFT.md`. Written Nov 26, 2026, 05:10 UTC.

## Morning checklist (in order; "latest" times keep a 90-minute buffer)

| # | Step | Latest (UTC) | Latest (IST) |
|---|---|---|---|
| 1 | Run the read-only live check: `cd projects/clashy/chain && npx tsx scripts/devnet-livecheck.ts`; expect `no FAIL` (Nov 26 result below). | Nov 27 03:30 | 09:00 |
| 2 | Decide on eligibility: pre-kickoff code is disclosed in the form; if unsure, ask in the Blitz Telegram group now, not at 13:00. | Nov 27 03:30 | 09:00 |
| 3 | Push the six local docs commits: `git -C projects/clashy log --oneline origin/main..main`, then `git push origin main` (fast-forward). | Nov 27 03:45 | 09:15 |
| 4 | Make `github.com/nickthelegend/clashy` public (Settings → General → Change visibility), or invite GitHub user `jonasXchen` (Settings → Collaborators); the secrets audit below is clean. | Nov 27 04:00 | 09:30 |
| 5 | Website URL: paste the repo URL (zero work), or deploy `web/` as a static site on your Vercel/Netlify and point `clashy.fun` at it; never paste the parked page. | Nov 27 05:00 | 10:30 |
| 6 | Second player: book a friend for a 20-minute slot to play player B in a second browser window on your Mac; fallback is two device-wallet players, said on screen. | Nov 27 05:30 | 11:00 |
| 7 | Rebuild the devnet web app and start the relay and price crank (commands below); the Nov 25 build predates the 9e0a58e duel-screen fix. | Nov 27 06:00 | 11:30 |
| 8 | Record per FILM-DRAFT.md: live product in the first 15 s, a fresh devnet duel (not the Nov 25 one), explorer tabs, Royale, squads, landing. | Nov 27 08:30 | 14:00 |
| 9 | Approve the cut and upload it unlisted (YouTube, or Drive "anyone with the link"); that link is Pitch & Demo. | Nov 27 11:00 | 16:30 |
| 10 | Log in with Telegram, connect the payout wallet, fill About you, paste Proof of Work and Boost from HACKATHON_SUBMISSION_FORM.md (every `NICK:` field). | Nov 27 12:00 | 17:30 |
| 11 | Submit; check the GitHub field shows no "can't see repo" warning and the submission appears under the event. | Nov 27 12:30 | 18:00 |
| 12 | Stop the relay, crank and app server you started (Ctrl-C in each terminal). | after 11 | after 11 |

If you are up on Nov 26, the same steps work today; only the deadline is fixed.

### Commands for step 7 (from `projects/clashy`)

The other session's uncommitted app edits (see "Conflict" below) would go into this build: commit or discard them first.

```bash
# the devnet web build with device test wallets (each tab is its own player); drop DEV_WALLET=1 for Privy sign-in
cd app && EXPO_PUBLIC_CLASHY_NET=devnet EXPO_PUBLIC_CLASHY_BASE=https://rpc.magicblock.app/devnet \
  EXPO_PUBLIC_CLASHY_ER=https://devnet-tee.magicblock.app EXPO_PUBLIC_CLASHY_ER_VALIDATOR=MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo \
  EXPO_PUBLIC_CLASHY_USDC_MINT=8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN EXPO_PUBLIC_CLASHY_DEV_WALLET=1 \
  npx expo export -p web --output-dir dist-devwallet
node scripts/serve-web.mjs 8098 dist-devwallet                       # http://127.0.0.1:8098

# relay on devnet (second terminal); DEV_OPEN is loopback-only and refuses to start on a public bind
cd chain && source .devnet.env && CLASHY_ROLE=relay CLASHY_SPONSOR_PORT=8790 CLASHY_APP_ORIGIN=http://127.0.0.1:8098 \
  CLASHY_RELAY_DEV_OPEN=1 npx tsx scripts/sponsor.ts

# price crank (third terminal), only needed for a stock clash; SOL/BTC/ETH come from MagicBlock's oracle
cd chain && source .devnet.env && CLASHY_ROLE=crank npx tsx scripts/crank.ts
```

The relay faucet allows 5 test-USDC claims per IP per hour (two per take); restarting the loopback relay resets it.
`grokbot/marketing/clashy-x/demo/duo-rec.mjs` records two phone-sized windows through one real duel, as it did for the
Nov 25 first cut. After the duel, `cd chain && npx tsx scripts/devnet-proof.ts <duel>` prints its explorer trail.

## Devnet live check

Read-only (`chain/scripts/devnet-livecheck.ts`: no key loaded, nothing signed or sent). Nov 26, 2026 05:06 UTC:

| Check | Result |
|---|---|
| Program `FQKy8f…1wdS` | PASS: executable, upgrade authority `6XdpT4…nYbe`, last deployed at slot 526211835 (the Nov 25 `3LJSPdfk` upgrade; the local build has the same sha256 `707e9cb8…`) |
| Last program activity on Solana | Nov 25, 17:46 UTC (the duel recorded for the first demo cut) |
| Config | PASS: rake 300 bps, `vrf_required` true, VRF queue `Cuj97g…`, rollup validator `MTEWGu…`, 8 coins |
| MagicBlock TEE rollup `devnet-tee` | PASS: up, magicblock-core 1.1.1, identity `MTEWGu…` matches the config. A throwaway key got a TEE auth token (30 days) and an authenticated `getSlot` returned 200 (`scripts/tee-token.ts`) |
| Keeper PDA `TRpZrv…` | PASS: delegated to the TEE validator; 554 crank ticks and 13 games finished so far |
| Keeper action escrow (pays Magic Actions) | PASS: 0.0507 SOL |
| SOL, BTC, ETH prices (MagicBlock oracle on the rollup) | PASS: 71.11, 60,924.47, 1,699.83, published 0–1 s before the read |
| NVDA, TSLA, AAPL, SPY, GOOGL (Clashy crank feeds) | WARN: last pushed 12.4 h ago; start the crank before any stock clash. A crypto duel does not need it |
| MagicBlock VRF queue `Cuj97g…` | PASS: owned by the VRF program; last activity 6 min before the read, so their devnet oracle is serving |
| Fee sponsor (relay) `AjdLmw…` | PASS: 0.6176 SOL, about 8 film takes at ~0.07 each |
| Price crank key `GGeCjD…` | PASS: 0.2895 SOL (base pushes cost about 0.09 SOL a day) |
| Rake treasury, test USDC | PASS: 7.44 test USDC collected; mint supply 18,200 (no value) |

What it cannot prove without sending a transaction: that MagicBlock's scheduler accepts a new crank task today. The
last proof is the keeper's 13th finished game, on Nov 25 evening. The relay, crank, social server and app are not running
anywhere: they only ever ran on the Mac. Every explorer link in the README, the form, docs/DEVNET.md and docs/MAGICBLOCK.md (40 unique) was checked
on chain on Nov 26: all resolve, including the Nov 22 ones on devnet-as. One is a deliberately failed transaction (the second
SettleTournament refused with WrongStatus), as the form says.

## Secrets audit (before the repo goes public)

**Result: clean. No key, seed phrase, token or `.env` file is in the git history.** Nothing needs rotating and the
history does not need rewriting. Checked Nov 26 over all 188 commits on every branch and tag (`v2.0.0`), every blob
(2,891), and every commit message:
- gitleaks and trufflehog are not installed, so a regex scan ran instead: PEM private keys, 64-byte Solana keypair
  arrays (one line or several), base58 64-byte secrets, Anthropic / OpenAI / OpenRouter / AWS / GitHub / Google / Slack
  keys, JWTs, `?api-key=` style URL keys, `SECRET`/`PRIVATE_KEY`/`API_KEY`/`PASSWORD`/`TOKEN`/`MNEMONIC` assignments,
  hex keys, `fromSecretKey([...])` and `bs58.decode("...")` literals, and runs of 12 or more BIP39 words.
- No file named `.env`, `*.devnet.env`, `chain/.keys/*`, a keypair, a wallet or a credentials file was ever committed.
  `chain/.env`, `chain/.devnet.env`, `chain/.keys/` (10 keypairs), `.env`, `app/.env.local` and `deploy/*.env` are all
  gitignored today.
- Hits, all false positives: `CLASHY_PRIVY_APP_SECRET` appears only as a variable name (`chain/scripts/sponsor.ts`,
  `deploy.sh`, `preflight.ts`, `tests/sponsor.test.ts`, `chain/README.md`, commits `f88ca02`, `5fa4937`); the
  `deploy/*.env.example` files have every secret value empty (commits `5fa4937`, `c32f4b1`, `42adc8a`);
  `chain/scripts/indexer.ts` reads `process.env.CLASHY_INDEXER_SECRET` (`5fa4937`); four base58-looking runs are
  base64 PNG data inside `app/assets/lottie/squad-war.json` and `onboard-squad.json` (`f3ab866`); the BIP39 run is
  emoji names in `app/src/stickers/emoji.json` (`2348bc2`).
- Public by design: the Privy app id (`cmwisksg…`), program and account addresses, the commit author
  `nickthelegend@users.noreply.github.com`.
- The 28 test logs and the Nov 26 logs added to `chain/evidence/` were scanned the same way first; they contain no
  secrets (they do contain local paths under `/Volumes/Extreme SSD/Projects/grokbot/projects/clashy`).
- One thing to know: when a local deploy retries, `solana program deploy` in `chain/scripts/localnet.sh` prints a
  recovery phrase for its temporary upload buffer to the terminal. It is a local test validator's buffer with no
  value, but don't paste `localnet.sh` output anywhere public. Never paste devnet deploy output (`scripts/deploy.sh`)
  publicly either: a devnet buffer's phrase would control the SOL in that buffer.

If a secret is ever found in history later, rotate it first (new Privy app secret in the Privy dashboard; new
keypairs, then move SOL and program authority to them), then either publish a fresh repo from a clean tree
(`git archive HEAD`, new repo, one commit) or rewrite with `git filter-repo --path <file> --invert-paths` and
force-push a new repo. Never force-push over the existing remote.

## Conflict: another session's uncommitted app work

On Nov 26 at 04:30 UTC the repo had uncommitted changes that this session did not make and did not touch:
`app/src/app/onchain-royale.tsx`, `app/src/app/onchain.tsx`, `app/src/games/kit/screen.tsx`,
`app/src/games/kit/ui.tsx` (20 lines added, 2 removed), and a Clashy iOS simulator was running. This session worked
only on docs, `chain/scripts/devnet-livecheck.ts`, `chain/evidence/` and `.gitignore`. Commit or discard that work
before rebuilding the app for the film. The app lint and type check were not run for the same reason.

## What this session changed (local commits, not pushed)

| Commit | What |
|---|---|
| `e50830c` | The 28 test logs the docs cite, published in `chain/evidence/` (the `*.log` ignore rule had kept them out) |
| `4f6f5bd` | `chain/scripts/devnet-livecheck.ts`, the read-only live check |
| `f22fbde` | `TESTING.md`: every local suite re-run on Nov 26, 56 of 56 pass, logs in `chain/evidence/*-nov26.log` |
| `b39ebe6` | README: the loop and "devnet, test USDC" up top, architecture, how to run, current counts |
| `47f0718` | The form re-checked against the live form's code: field limits, reviewer `jonasXchen`, `NICK:` marks |
| this file | `docs/NICK.md` |

## Still not real (say so if asked)

Devnet only, test USDC, no mainnet and no real money. Not hosted. Stash stock buys need an Orca xStock pool, which
exists only on mainnet. The 0-SOL sponsored sign-in through Privy was never shown on devnet (it needs a real Privy
login; locally it passes). One deployer key can upgrade the program. Pre-kickoff code exists and is disclosed.
