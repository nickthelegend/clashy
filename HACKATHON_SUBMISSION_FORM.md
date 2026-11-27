# Clashy: Solana Blitz v10 submission (ready to paste)

Prepared Nov 24, 2026 (UTC) for Nick, who submits; updated Nov 25 after the TEE rollup move and the program upgrades,
and re-checked on **Nov 26, 2026 at 04:30–05:10 UTC** against the live form's own code, the events API, the Luma page
and devnet (every explorer link below resolves on chain). Everything Nick must type or decide is marked `NICK:`.
His morning checklist is [docs/NICK.md](docs/NICK.md).

## The event (verified)

| | |
|---|---|
| Event | Solana Blitz v10 by MagicBlock, theme **Entertainment Finance** ([luma.com/hedv5sgh](https://luma.com/hedv5sgh)) |
| Kickoff | Fri Nov 20, 2026, 14:00 UTC (the Luma page says 10 PM Singapore time) |
| **Deadline** | **Fri Nov 27, 2026, 14:00 UTC** (19:30 IST). Luma only says "before the deadline". The date comes from MagicBlock's public events list (`https://build.magicblock.app/api/events`, event 17 "V10", `submitEndDate 2026-11-27T14:00:00.000Z`, status `active`). |
| Form | [build.magicblock.app/?stage=blitz#submit](https://build.magicblock.app/?stage=blitz#submit), linked from the Luma page. You log in with Telegram. |
| Prizes (Luma) | 1st $500, 2nd $250, 3rd $150, Wizardio's Choice $100 (USDC) |
| Not published (checked Nov 25) | Judging criteria, a video length limit, and any rule on code written before kickoff. Luma says "Turn your idea into an MVP" and to build with the MagicBlock stack (zero-fee transactions, VRF, privacy). |

The form's server-rendered page says "No open events to submit to right now". That page is rendered before the
events list loads, and the events API lists V10 as `active`. If the form still shows no event after you log in, ask in
the Blitz Telegram group before the deadline.

**The form's fields**, read from its own validation code on Nov 26 (the page's JavaScript bundle; no screenshot is
stored). Four steps: Purpose, About you, Proof of Work, Boost.
- **Required:** first and last name (up to 100 characters each), email, country (picked from the list), a connected
  wallet ("Connect a wallet in About you to submit"), project name (up to 200), description (up to 5,000), and four
  URLs: **Website, GitHub, Pitch & Demo, Explorer link**. A Telegram login is needed to use the form at all.
- **Optional:** your role(s), on-chain addresses (up to 28, "Program ID, wallet or fee vault"), categories (up to 3 of
  DeFi, Payments, Games, AI / Agents, Privacy, Infra, DePIN, Social, Consumer, Other), team members (each needs at
  least one role), additional info (up to 5,000), your X account and other X accounts.
- **GitHub check:** the form checks the repo live (`/api/repo-check`). If it can't see the repo it says "can't see
  repo — invite @jonasXchen" and links to the repo's collaborator settings. So a private repo works if Nick invites
  GitHub user `jonasXchen`; a public repo needs nothing.
- Roles to pick from: Founder, Technical / Engineering, Business / Operations, Marketing / Growth, Design / Creative,
  Product, Community, Other.

---

## Step 1: Purpose

**Submitting for:** Solana Blitz V10 (Entertainment Finance).

## Step 2: About you (Nick)

| Field | Value |
|---|---|
| First name | `NICK:` |
| Last name | `NICK:` |
| Email | `NICK:` |
| Country of residence | `NICK:` (pick from the list) |
| Role(s) | `NICK:` (suggested: Founder, Technical / Engineering) |
| Wallet | `NICK:` connect the Solana wallet the prize should be paid to (prizes are USDC) |

None of Nick's personal details are written in this repo.

## Step 3: Proof of Work

### Project name

```text
Clashy
```

### One-liner (start of the description, and for X)

```text
Trade against people, not the house: 1v1 trading duels and Royales on live prices. MagicBlock VRF rolls the coin, picks stay sealed in MagicBlock's Private Ephemeral Rollup, a crank scores every second on the rollup, and a Magic Action pays the pot in USDC on Solana.
```

### Description (4,343 characters, limit 5,000)

```text
Trade against people, not the house: 1v1 trading duels and Royales on live prices. MagicBlock VRF rolls the coin, picks stay sealed in MagicBlock's Private Ephemeral Rollup, a crank scores every second on the rollup, and a Magic Action pays the pot in USDC on Solana.

Most trading games pit you against a house pool. Clashy pits you against a friend or a stranger. Two players stake test USDC, MagicBlock VRF rolls the coin for both of them, each locks long or short inside MagicBlock's Private Ephemeral Rollup, and a crank scores the clash on the rollup every second until the bell. The winner takes the pot minus a 3% rake, and Elo moves. Royale puts up to 16 players in one pot: VRF picks the coin, everyone calls each round on the rollup, and the survivors split the pot. Perps clashes add leverage (up to 100x on chain; the app offers up to 50x) with liquidation. Squads and clans add shared chests, votes and clan wars.

How it uses MagicBlock (devnet program FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS, rollup devnet-tee.magicblock.app):
- Private Ephemeral Rollup (TEE): each player's pick is a private account the rival cannot read until the start. On devnet, player A's authenticated connection read A's pick and player B's read nothing. It is private from the rival, not from Clashy: the sponsor relay co-signs each lock.
- Cranks: the start schedules a task that runs tick_duel / tick_round every second. Knockouts and bells land with no player online.
- Keeper PDA + Magic Actions: a delegated keeper commits the finished game, and a post-undelegate Magic Action runs settle_duel or settle_tournament on Solana in the same intent. If the action fails, anyone can settle by hand.
- Oracle: SOL, BTC and ETH read MagicBlock's oracle accounts on the rollup; stocks, squad trades and squad wars use Clashy's own crank-pushed feeds on Solana.
- VRF: request_coin_roll and request_tournament_coin ask MagicBlock VRF for the coin. Only the VRF program's callback can set it. With vrf_required on, the commit-reveal fallback and forged callbacks are refused, and a test proves it.
- Session keys: lock_pick_session and call_round_session let a MagicBlock session key make in-game moves (used by the app: one wallet signature creates a 6-hour session key on the device (sponsored, relay-checked), and the private-duel pick lock and every Royale call are signed by it; played on devnet in duel 3qa893zcqdm9WpPAGJMdjfxZqUXFvhr1U2A2ZdHwuT8t, both picks landed as LockPickSession).
- Zero-fee play: players hold 0 SOL. A sponsor relay pays every Solana fee and rent, Magic Actions are sent by MagicBlock's TEE validator, and rollup moves are free. On web, players sign in with Privy (email or Google). We don't use MagicBlock private payments.

What is live: the program on Solana devnet with MagicBlock's TEE rollup, VRF oracle and oracle prices. On Nov 25 all four MagicBlock tests passed there in one run: a cranked duel settled by a Magic Action 31.6 s after the start, a cranked Royale paid its survivor with no resolve or settle by hand, a private duel, and keeper abuse checks. Two players with 0 SOL also played a private ETH duel through the web app: 100 transactions, 88 on the rollup, one crank tick per second, and the winner got +9.70 USDC. On Nov 26 a duel, a 3-player Royale and a squad war were played the same way. Around that sit 150 practice games on live Phoenix and Pacifica prices (practice money only), chat, squads and a guided tour. On Nov 26 every local suite was re-run on MagicBlock's own validator: 56 of 56 tests pass.

What isn't live: there is nothing on mainnet and no real money. Buying tokenized stocks for Stash needs an Orca xStock pool, which exists only on mainnet. The app isn't hosted yet; the services ran on a Mac. The program is upgradeable by one key; a multisig is the mainnet plan.

Honest timeline: the first app, website and program were written Nov 15-20, before the Nov 20 14:00 UTC kickoff (commits 375d706..6431028). After kickoff (93fa845..9e0a58e, then docs, app UI and landing polish): the practice games and game kit, the first devnet deploy, and all of the MagicBlock work above except delegation and VRF: cranks, keeper, Magic Actions, TEE private picks, oracle prices, session keys, the VRF callback fix, the move to the TEE rollup and the devnet runs. Details are in the README.
```

### Categories (up to 3)

`Games`, `Consumer`, `Social`

### Project website (required URL)

`NICK:` paste one of the two options below.


**Not live yet.** On Nov 24, 25 and 26, 2026, `clashy.fun` resolved to a parked Hostinger page (`2.57.91.91`, title
"Parked Domain name on Hostinger DNS system"), and `play.clashy.fun` had no DNS record. Pick one:
1. Deploy a landing page and the app, point DNS, then use `https://clashy.fun`. The repo has two landing pages:
   `web/` and `landing/`; [docs/DEPLOY-RUNBOOK.md](docs/DEPLOY-RUNBOOK.md) builds `landing/`. Pick one before
   deploying.
2. Otherwise paste the repo URL (`https://github.com/nickthelegend/clashy`) and say in Additional information that the
   site isn't hosted yet.

Don't paste `https://clashy.fun` while it's still the parked page.

### GitHub Project Repo (required, "must be accessible")

```text
https://github.com/nickthelegend/clashy
```

**The repo is PRIVATE** (checked with `gh repo view` on Nov 26, 2026). The form checks access live. `NICK:` before
submitting, either make it public, or invite GitHub user **`jonasXchen`** (the reviewer the form names) under
Settings → Collaborators. Every commit is already pushed.

### Pitch & Demo (required URL)

```text
NICK: the unlisted YouTube or Drive link of the demo film
```

**Demo film v5 (4:44) is in the repo: [`docs/media/clashy-demo.mp4`](docs/media/clashy-demo.mp4)** (phone-size copy, 10 MB;
the full-quality master is `marketing/clashy-x/demo/clashy-demo-film-v5.mp4` in the grokbot folder, outside this repo).
Not yet uploaded anywhere: NICK uploads it (unlisted YouTube or Drive) and pastes the link above. Recorded live on
Solana devnet and MagicBlock's TEE rollup, with no faked output:
- a 5-second intro from the launch film, then onboarding (four slides, a name, a funded test wallet), Home and Play;
- the private 1v1 clash (Nov 27): escrow, MagicBlock VRF coin roll (SOL), both phones show the coin's chart from
  Clashy's on-chain feed, then both calls are sealed in the TEE with a session key, 61 crank ticks, the Magic Action
  payout (Ben +9.70 USDC);
- a 3-player Royale (Nov 27): a price line each round, 21 session-key calls, all three outlast ten rounds;
- a squad war (Nov 26): two squads, chest deposits, a challenge, a voted SOL 10× up trade, Night Owls win the pot;
- chats (Nov 27): search and follow, a DM with MagicBlock and Clashy stickers, the squad's #general on the rollup;
- ten practice games on live prices: Tap Grid on Bitcoin, Meme Roulette, Chart Detective, Gold Rush and Macro Picks
  solo; Coin Call, Hot Potato, In Sync, Knockout at 1000× and Breakout against Clashy Bot;
- the Stash and its limits, then eight Solana Explorer cards (escrow, VRF signer, TEE lock at fee 0, crank tick 61,
  payout by the TEE validator, Royale session-key call, squad vote, war settle).
Trails: [`chain/evidence/devnet-proof-nov26.md`](chain/evidence/devnet-proof-nov26.md). Narration: the builder's voice,
cloned (ElevenLabs; a local Chatterbox model for the Royale, squad war, games and Stash lines).

Upload it (YouTube unlisted or Drive, viewable by anyone with the link) and paste the URL.

### Explorer link (required, "integration proof")

```text
https://explorer.solana.com/address/FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS?cluster=devnet
```

### On-chain addresses (optional, up to 28; the form says they are checked for recent devnet/mainnet activity)

| Kind | Address |
|---|---|
| Program | `FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS` |
| Wallet (relayer / fee payer) | `AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz` |

Leave the fee vault out: the form's fee vault is for MagicBlock private-payment fees, and Clashy doesn't use them.
(Clashy's Magic Actions pass the validator's magic fee vault, a different account; the keeper's escrow `FxRMULT…` has
not been debited on devnet.)

**"Recent" activity:** the program's latest base-layer transaction was on Nov 26, 2026 at 22:36 UTC (read with
`getSignaturesForAddress` on Nov 27). The Nov 26 film games (duel, Royale, squad war) are in
`chain/evidence/devnet-proof-nov26.md`.

### Additional information (optional, up to 5,000)

```text
Devnet proof (Solana Explorer):
- Program: https://explorer.solana.com/address/FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS?cluster=devnet
- Rollup: MagicBlock Private Ephemeral Rollup https://devnet-tee.magicblock.app (validator MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo). Rollup links below open through Explorer's custom RPC setting.
- One private duel played through the web app by two 0-SOL players, Nov 25 11:33-11:35 UTC (duel 3iqsLN25cTK2SMMHqLyvvQhDLKPDBfHPBEUWBjhx8PW4, 100 txs, 88 on the rollup, winner +9.70 USDC):
  open https://explorer.solana.com/tx/4eQDRFpkCtejM51giwd8MRPcoEgeKHmQLdRHhw7ThyNo8VpPGdNWnEu5NgcEARGqdCNnxp364hZQVySLQWMw2F6k?cluster=devnet
  VRF callback https://explorer.solana.com/tx/2Zw2y1eKtUcCwezCpjLyhn5JJwTBTTaf9d1yKAdpAR7a4dd4xUEBG19TTk2BbsM4VkjzjD75QZDFpNHpkTXe2v71?cluster=devnet
  delegate to the TEE https://explorer.solana.com/tx/WdtSjg2a61LVRNT4i6g8mbFMCZMkvLb1DkKzf8SgQYY1jUV9TJCoGFjuhFLaFHM61FoBXvDiF82MbnqPWyoKHyn?cluster=devnet
  private pick lock https://explorer.solana.com/tx/5XprAGcb1V3TPCXuPhsKAnhNbyru2jHbvwoeobFHdhjS6fbu9dgNqC4fgjcApU37z7SnVUmzPUcCPMdMuJQ4axL7?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app
  start https://explorer.solana.com/tx/45DauMxTGoQnq3frKWPY48KR8b7pXAjsyTrBFKgfzuR7NrpaAFY56rvUcqEmDi8CL7EtMhfput8vkWz2Uh2NJ7r2?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app
  first crank tick https://explorer.solana.com/tx/4NHsJ6ehn78NCT9j285LXHCP7zduBmNkbLp75R4BucrAsaENDMD7YETCX8BBVVfw9gQ2eLynoNHBNM4cNuEuUL26?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app
  Magic Action settle on Solana (ProcessUndelegation + SettleDuel, signed by the TEE validator) https://explorer.solana.com/tx/3TRqj5wUv7Euxm2kSfToEiKrrMvjnzgCzF3UQDQLQGkL4LcTNQ37nfwwvhJrbgABAwRA7SdcNHLuSgrvL9vfCMC5?cluster=devnet
- Program upgrades Nov 25: https://explorer.solana.com/tx/4VJAbxj2mqY962jYCXSRhdrf86p3bGuyAkuGuhVFh8adfPC4XW32iNm7Tme8aWWdHyPXuJABskug16qnKQhGbwZw?cluster=devnet , https://explorer.solana.com/tx/2bfRV8kMn2X3PWXwz7fxRamt1Akd1MhSQjWTviTvc6B3ydiyXh5Z6mLbgsgXVdoNQU8CpgHCv1sYnHbXbheydEJZ?cluster=devnet , https://explorer.solana.com/tx/jKQqVjuN48xpkFaKwkAwkwui86jg3nnKEx6L6CYYPLReu8zBEwQ4WVmfJMVVREFFz9vGfhaVNriYSHo6axhqSnt?cluster=devnet
- First deployment, Nov 22, on devnet-as.magicblock.app: one duel (settle https://explorer.solana.com/tx/63Naj6C7Wttt8f666pJGhrWvuzHwJTLRSS9BVwLVynjW1yMuGjrU4ajSALcvCGT57HVrDW4VMry8h9fGKpJNiB7g?cluster=devnet ) and one Royale (settle https://explorer.solana.com/tx/2dgA24W5QajN3mRxjaHJ376rjYDbDrbA3ZxDFChW7NRLEdJGgygTJhaftnFsuto7KDgBYcYTZrga5KuLMKa85iTu?cluster=devnet ).
VRF queue Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh. Test USDC mint 8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN (no value). Keeper TRpZrvYjB4nBqpq36kEzoghkG7RMipuMZirFbXBwyPK.

Trust: the program is upgradeable by one deployer key, and the admin can change rake (max 10%), treasury and vrf_required. A multisig is the mainnet plan.

Kickoff disclosure: the first app, website and program predate the Nov 20 14:00 UTC kickoff (commits 375d706..6431028, Nov 15-20). After kickoff (93fa845..9e0a58e, Nov 20-25; Nov 26: docs, app UI and landing polish, program unchanged): the practice games and game kit, close_duel, the devnet deploy, and the MagicBlock cranks, keeper, Magic Actions, TEE private picks, oracle prices, session keys, VRF callback fix, 0.5% Stash fee, the TEE migration and the devnet runs. Mainnet: not deployed, no real money.
```

## Step 4: Boost (Nick)

- **Your X account:** `NICK:` (the X drafts use `@ClashyFun`; confirm the handle exists before pasting it).
- **Team members:** `NICK:` none, unless someone else should see and edit the submission (each needs a role).
- **X accounts:** `NICK:` optional.

---

## Devnet transactions (all real)

**Private duel through the web app, Nov 25 2026 (UTC)**, duel `3iqsLN25cTK2SMMHqLyvvQhDLKPDBfHPBEUWBjhx8PW4` on the
TEE rollup. Two device-wallet players with 0 SOL; ETH 1,639.80 → 1,638.63; B called down and won +9.70 USDC, A lost
5 USDC. The full trail (100 transactions, 88 on the rollup, each with an explorer link) is
[`chain/evidence/devnet-proof.txt`](chain/evidence/devnet-proof.txt), printed by `chain/scripts/devnet-proof.ts`.

| Step | Time | Layer | Transaction |
|---|---|---|---|
| OpenDuel | 11:33:19 | Solana devnet | [4eQDRFpk…QWMw2F6k](https://explorer.solana.com/tx/4eQDRFpkCtejM51giwd8MRPcoEgeKHmQLdRHhw7ThyNo8VpPGdNWnEu5NgcEARGqdCNnxp364hZQVySLQWMw2F6k?cluster=devnet) |
| JoinDuel | 11:33:45 | Solana devnet | [2zh5Wqip…DYnfY8gd](https://explorer.solana.com/tx/2zh5WqipZtcJ3ciuQoLhLXtasJc8fVZkxA3RuyyG2GB7GHRiKHj7RYQMvzBrMqjyPyvF4B1Nd9WimThBDYnfY8gd?cluster=devnet) |
| RequestCoinRoll | 11:33:47 | Solana devnet | [4iyNPdpS…JSgghaom](https://explorer.solana.com/tx/4iyNPdpSNGCtNocH52ouFeWPZWQbApD2ptWPvRKrzDm2TZeM7uwmFFzurqJJhfuhnw9Gh8XcaxJeVNkKJSgghaom?cluster=devnet) |
| CoinRollCallback (ETH) | 11:33:48 | Solana devnet | [2Zw2y1eK…kTXe2v71](https://explorer.solana.com/tx/2Zw2y1eKtUcCwezCpjLyhn5JJwTBTTaf9d1yKAdpAR7a4dd4xUEBG19TTk2BbsM4VkjzjD75QZDFpNHpkTXe2v71?cluster=devnet) |
| OpenPrivatePicks | 11:33:49 | Solana devnet | [2sbsAPkP…v7BdGfHq](https://explorer.solana.com/tx/2sbsAPkPeLggFuJaKqZv63F4v52f6TcmnPGycHLzZoMcRHWFcvL9cU7EFgegoKcugh4HjfWnYQPM5dYfv7BdGfHq?cluster=devnet) |
| DelegatePrivateDuel | 11:33:50 | Solana devnet | [WdtSjg2a…PWyoKHyn](https://explorer.solana.com/tx/WdtSjg2a61LVRNT4i6g8mbFMCZMkvLb1DkKzf8SgQYY1jUV9TJCoGFjuhFLaFHM61FoBXvDiF82MbnqPWyoKHyn?cluster=devnet) |
| LockPick (A) | 11:34:01 | TEE rollup | [5XprAGcb…uJQ4axL7](https://explorer.solana.com/tx/5XprAGcb1V3TPCXuPhsKAnhNbyru2jHbvwoeobFHdhjS6fbu9dgNqC4fgjcApU37z7SnVUmzPUcCPMdMuJQ4axL7?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) |
| LockPick (B) | 11:34:01 | TEE rollup | [3Z8DxDcX…MAM4FKQm](https://explorer.solana.com/tx/3Z8DxDcXYhd68CFC2p95CNQbaTfzJo7TfbMTQvMa5jG1CxyaVM1zGSpGzcvdTmpCJf1AeJP8nC9RdVPHMAM4FKQm?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) |
| StartPrivateDuel | 11:34:03 | TEE rollup | [45DauMxT…Uh2NJ7r2](https://explorer.solana.com/tx/45DauMxTGoQnq3frKWPY48KR8b7pXAjsyTrBFKgfzuR7NrpaAFY56rvUcqEmDi8CL7EtMhfput8vkWz2Uh2NJ7r2?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) |
| TickDuel by the crank, once a second (first / last) | 11:34:03 / 11:35:03 | TEE rollup | [4NHsJ6eh…NuEuUL26](https://explorer.solana.com/tx/4NHsJ6ehn78NCT9j285LXHCP7zduBmNkbLp75R4BucrAsaENDMD7YETCX8BBVVfw9gQ2eLynoNHBNM4cNuEuUL26?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) / [49EUfL6U…tY17XNu3](https://explorer.solana.com/tx/49EUfL6UUTnqgGAKbaobDE9w3M8gpGkazXJVkTehaDiZkGaW5NoGTp8o6cvQpvCGNW8m6ABN9G7iWvVytY17XNu3?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) |
| Magic Action: ProcessUndelegation + SettleDuel on Solana, signed by the TEE validator `MTEWGuqx…` / rollup side | 11:35:04 / 11:35:05 | Solana devnet / TEE rollup | [3TRqj5wU…L9vfCMC5](https://explorer.solana.com/tx/3TRqj5wUv7Euxm2kSfToEiKrrMvjnzgCzF3UQDQLQGkL4LcTNQ37nfwwvhJrbgABAwRA7SdcNHLuSgrvL9vfCMC5?cluster=devnet) / [mWYjHRgP…Dpj9Te2B](https://explorer.solana.com/tx/mWYjHRgP7gacpxzJmHT9o1UP1qmfB5nptMisS1MeDt8qupje4KaCLMxKY3x2yM7FM8Ss6MrvsJKQgkLDpj9Te2B?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) |

After the duel went home, MagicBlock's scheduler tried the remaining ticks 11 more times (11:35:04 to 11:35:31); they
failed because the duel had left the rollup, and then the task was dropped. Since the devnet upgrade that evening
(`3LJSPdfk…`), the finishing tick cancels its crank; a few runs the scheduler had already queued can still land in
the next 3 s and stop at the scheduler's own check (`InvalidAccountOwner`, fee 0) before Clashy's program runs
(`chain/evidence/devnet-proof-nov26.md`). Four failed
VRF-oracle transactions also appear before the callback landed.

**First deployment, Nov 22 2026, on devnet-as** (read from devnet on Nov 24). How they were found: `getSignaturesForAddress` on the program through `https://rpc.magicblock.app/devnet`, and on the
duel and Royale accounts through `https://devnet-as.magicblock.app`, then `getTransaction` for each one, read-only.
These counts come from a read-only script whose output is not stored in the repo; treat them as self-reported.
By Nov 22 04:48 UTC the program had 1,520 base-layer transactions, all on Nov 22 from 02:27 UTC. 72 of them failed,
and they include the tests that check refusals. The table counts those 1,520. A recount on Nov 25 at 11:20 UTC found
1,591 (71 more that day: setup, the TEE migration and the first test attempts); the TEE test runs and the in-app duel
came after that recount.

| Instruction (base layer) | Count | | Instruction (base layer) | Count |
|---|---|---|---|---|
| OpenDuel | 35 | | CreateTournament | 4 |
| JoinDuel | 26 | | RequestTournamentCoin / callback | 3 / 3 |
| RequestCoinRoll / CoinRollCallback | 21 / 21 | | DelegateTournament | 4 |
| CommitPick / RevealPick | 28 / 24 | | SettleTournament | 4 |
| DelegateDuel | 12 | | CreateClan / DeclareWar / SettleWar | 12 / 4 / 4 |
| SettleDuel | 9 | | InitPlayer / CreateProfile | 112 / 112 |

**Duel `H6GpASV8ThsegMkDbxdy6KeWAVrXaPZhnxpbnBguDG8t`, Nov 22 2026 (UTC):**

| Step | Time | Layer | Transaction |
|---|---|---|---|
| Open (stake escrowed; the sponsor pays the fee) | 04:43:40 | Solana devnet | [QX8XN8N8…Xq4oc8X2](https://explorer.solana.com/tx/QX8XN8N8sYrNF4DQw12SyDzfP82eJwVLpTxeahJqahdXiMcmja7R7rBoHXURgr6J2LDJRrw4DwLGfG5Xq4oc8X2?cluster=devnet) |
| Join | 04:44:06 | Solana devnet | [oGzZJJrc…iYNPKqWb](https://explorer.solana.com/tx/oGzZJJrcEfiFJ6idseA34Ydwp8goXfF8ek8Way44BzpBrTwAkRHPNUzUu2WaZizWoe3EUY3qEdrrdgfiYNPKqWb?cluster=devnet) |
| VRF request | 04:44:07 | Solana devnet | [2x4UDrwc…pLx876ZD](https://explorer.solana.com/tx/2x4UDrwcsgKjE9GfHD72hGqc9sP7nVowSUA7KeMuiQm8nhGwBejhxKNYx3xL4gxqvmtyVrSnYMKqASmVpLx876ZD?cluster=devnet) |
| VRF callback, signed by MagicBlock's oracle `vrfkfM4u…d5AS` through `Vrf1RNUj…QUwGz` | 04:44:08 | Solana devnet | [35ej9Xz7…UFqP4VAs](https://explorer.solana.com/tx/35ej9Xz7f4PuoPZ5icHEJB2uronYG1MQiQxmHTHThfEmMf3vfS8pKv9tnRmNxRjhacxFRs5zPmqctTy8UFqP4VAs?cluster=devnet) |
| Delegate to the Ephemeral Rollup | 04:44:25 | Solana devnet | [3xGKFBWJ…XwGYr27Q](https://explorer.solana.com/tx/3xGKFBWJDF61Tn6aemkYgDDTLBYtiimCxzyfjHgnVR2BPprzVXMXP8zPKduZiijjfZi1bg22t5ijCvF4XwGYr27Q?cluster=devnet) |
| StartDuel | 04:44:27 | MagicBlock rollup | [47CE3R16…A45NJmPk](https://explorer.solana.com/tx/47CE3R16VZXTvc3XhCwQhGgtBF31ubZGvbKGWSuTtXPqAfLApVnuWcBd175TSncB7vgTVJtFW8xMeHrvA45NJmPk?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| First of 47 CheckDuel scoring ticks | 04:44:28 | MagicBlock rollup | [26mbyTzh…Mf3TahHy](https://explorer.solana.com/tx/26mbyTzhw1Gpd2a8u3eB7ZSRfNuWQYcJUb9511An2wHUWfniPaTRTMrfjT4xTzwN2v6fpPzVx5Hg7N8JMf3TahHy?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| Settle (pot, rake, Elo) | 04:45:29 | Solana devnet | [63Naj6C7…KpJNiB7g](https://explorer.solana.com/tx/63Naj6C7Wttt8f666pJGhrWvuzHwJTLRSS9BVwLVynjW1yMuGjrU4ajSALcvCGT57HVrDW4VMry8h9fGKpJNiB7g?cluster=devnet) |

**Royale `8wT2UCqJiwha3wrPfaanMhuKs2DF17ChMVuHyHbeHfLE`, Nov 22 2026 (UTC):**

| Step | Time | Layer | Transaction |
|---|---|---|---|
| CreateTournament | 04:32:30 | Solana devnet | [4aJijtCr…rT9y8bfG](https://explorer.solana.com/tx/4aJijtCr5ovyLAJt3djNK5SvVqjUBsHAtf4Mdu1jQMe6vyMirUqrLVJz3psXycJ68QcrboRTj2yZCsNWrT9y8bfG?cluster=devnet) |
| VRF request for the coin | 04:32:32 | Solana devnet | [5FFnRoLy…ENe4aLhR](https://explorer.solana.com/tx/5FFnRoLyAFeqJK3saaGzjP7BxUt3emJaVCZCPiMsS42iqfw3b8tcnMrXWZd9SSRJrbhX5U55zXfjgBeYENe4aLhR?cluster=devnet) |
| VRF callback (MagicBlock oracle) | 04:32:33 | Solana devnet | [5fccMbSw…YV9ktZwX](https://explorer.solana.com/tx/5fccMbSw6RRApMmKPQw1veaUvmqvC3ZMFwEZzYHDtGMtntQ7p2S5ZeNvRBcTTP8DHCvDsVHdcaw7TWkrYV9ktZwX?cluster=devnet) |
| Delegate to the rollup | 04:33:35 | Solana devnet | [5Vu3fAmF…mkJuCrSb](https://explorer.solana.com/tx/5Vu3fAmFmvBk5SbqQnkKmFb9XjBHo6VETTgXKp4fPmJqfD6NJ8oLC5BPF7U7FHz7pCtEJqKMCzYFkXz1mkJuCrSb?cluster=devnet) |
| StartTournament | 04:33:37 | MagicBlock rollup | [VwtUbtEd…tusJHGag](https://explorer.solana.com/tx/VwtUbtEdPVspo8Nib3nzcETPzSLNDzMXouzoBqzU6g21Ev1wEa2EVuxsWYjNNNArsezLDwjD9k8G9RstusJHGag?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| A round called (12 calls in all) | 04:33:39 | MagicBlock rollup | [3J6hrVio…zBWZWFZf](https://explorer.solana.com/tx/3J6hrVioUvbaeJieUSaiRWyi6TymeHGFJYKvpbmi9M3HNx4AXxBXycJ1mEiieXr1wgtsSCbfH5sALpUVzBWZWFZf?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| A round resolved (7 in all) | 04:33:47 | MagicBlock rollup | [3rmGGNMM…9tsGMgwy](https://explorer.solana.com/tx/3rmGGNMMdwaze17Ke9X1LWiD2GAaxu6dWae7iVjzZ5kwdJ5XfxxS5tyP6DCZG72XUEq1MTtdry8Spwbs9tsGMgwy?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| SettleTournament (survivors paid) | 04:34:39 | Solana devnet | [2dgA24W5…MKa85iTu](https://explorer.solana.com/tx/2dgA24W5QajN3mRxjaHJ376rjYDbDrbA3ZxDFChW7NRLEdJGgygTJhaftnFsuto7KDgBYcYTZrga5KuLMKa85iTu?cluster=devnet) |

A second SettleTournament one second later
([2q9axbog…AzWtbBAq](https://explorer.solana.com/tx/2q9axbogpdditKHxsqRxa5FU9guaYbjEwKtLwZcC4BWzF33fn3ekxF8gNu4doXucR3UF6gZKtyVAwebmAzWtbBAq?cluster=devnet))
was refused with `WrongStatus` (6011), so a Royale can't be paid out twice.

Rollup transactions open in Solana Explorer through its custom-RPC setting (`customUrl=https://devnet-as.magicblock.app`
for Nov 22, `https://devnet-tee.magicblock.app` for Nov 25). They depend on the rollup keeping its history. On Nov 25
devnet-as still returned the Nov 22 ones; it is no longer Clashy's configured rollup, so that history may expire.

---

## Before and after kickoff (honest disclosure)

Kickoff: Nov 20, 2026 14:00 UTC. These are commit times in UTC (`TZ=UTC git log`).

| Range | Commits | When (UTC) | What |
|---|---|---|---|
| `375d706..6431028` | 154 | Nov 15 09:43 to Nov 20 07:13 (**before kickoff**) | The website, art and app; the first Anchor program (duels, commit-reveal picks, rollup delegation, VRF coin rolls, Royale, clans and wars, perps, rake and Elo; `lib.rs` 2,618 lines); the sponsor relay; the audit and its fixes; the local MagicBlock stack and tests; chat, stickers and the first tour |
| `93fa845..e833c62` | 15 | Nov 20 14:49 to Nov 22 04:47 (**after kickoff**) | The white tour card, the practice games and the game kit (the first three commits landed at 14:49 UTC, 49 minutes after kickoff, so part of that work was written before it); the beta legal pages; `close_duel` (45 lines in `lib.rs` and `math.rs`); the devnet test USDC and faucet; the first devnet deploy and test run; the Royale stock-coin fix; the faucet limits; docs/DEVNET.md |
| `ddfa4da..e14e80f` | 10 | Nov 24 20:29 to Nov 25 11:37 (**after kickoff**) | README and this form; **MagicBlock cranks, the keeper PDA, Magic Action payouts, private picks on the TEE rollup and MagicBlock oracle prices** in the program, app and tests; the app's MagicBlock track and Live on MagicBlock screen; session keys (`lock_pick_session`, `call_round_session`); the VRF callback fix; the 0.5% Stash trading fee; TEE authentication; the TEE tests with a real privacy check; result Lottie animations; the sealed-in-TEE duel card; `scripts/devnet-proof.ts` |
| `a72149c..9e0a58e` | 9 | Nov 25 11:54 to 17:56 (**after kickoff**) | Session keys in the app; the claims audit of docs and site copy; the finishing crank tick cancels its MagicBlock task (devnet upgrade `3LJSPdfk…`); Lottie on phones; the clay sprite animations in live clashes; two duel-screen fixes found while filming |
| `e50830c..ba4d09d`, then doc fixes | 15 to `ba4d09d` | Nov 26 04:39 to 22:52, then Nov 27 (**after kickoff**) | Docs and evidence: the cited test logs, the Nov 26 re-run of every local suite, the read-only devnet live check, the proof scripts and the Nov 26 trails, README, this form, docs/NICK.md. App UI: sprite animations, live-clash polish, the Play tab, the squad leverage vote (62 app files, +376/−112 since `9e0a58e`). Landing: the Squads rename. The program, tests, server and `web/` are unchanged |

Every commit is pushed to the private repo's `main`. After kickoff the program grew by 1,039 lines and lost 74
(`git diff --shortstat 6431028 HEAD -- chain/programs`); `lib.rs` is now 3,485 lines. The program on devnet is the last
Nov 25 build (upgrade `3LJSPdfk…`): a `solana program dump` after it gave 1,605,240 bytes of program space (a 1,605,285-byte program data account with its
45-byte header) whose
first 1,583,160 bytes match `chain/target/deploy/clashy.so` (sha256 `707e9cb8…2dc9b7`); the rest is zero padding. The event pages publish no rule on code written before kickoff, but Luma frames the week as building an MVP.
Whether to enter is Nick's call.

---

## What Nick must do before Fri Nov 27, 2026 14:00 UTC (19:30 IST)

The ordered checklist, with times in UTC and IST, is at the top of [docs/NICK.md](docs/NICK.md).
