# Clashy: Solana Blitz v10 submission (ready to paste)

Prepared Nov 24, 2026 (UTC) for Nick, who submits. Everything below was checked against public pages and devnet the
same day. Fields marked **Nick** need his own details or a decision.

## The event (verified)

| | |
|---|---|
| Event | Solana Blitz v10 by MagicBlock, theme **Entertainment Finance** ([luma.com/hedv5sgh](https://luma.com/hedv5sgh)) |
| Kickoff | Fri Nov 20, 2026, 14:00 UTC (the Luma page says 10 PM Singapore time) |
| **Deadline** | **Fri Nov 27, 2026, 14:00 UTC** (19:30 IST). Luma only says "before the deadline". The date comes from MagicBlock's public events list (`https://build.magicblock.app/api/events`, event 17 "V10", `submitEndDate 2026-11-27T14:00:00.000Z`, status `active`). |
| Form | [build.magicblock.app/?stage=blitz#submit](https://build.magicblock.app/?stage=blitz#submit), linked from the Luma page. You log in with Telegram. |
| Prizes (Luma) | 1st $500, 2nd $250, 3rd $150, Wizardio's Choice $100 (USDC) |
| Not published | Judging criteria, a video length limit, and any rule on code written before kickoff. Luma says "Turn your idea into an MVP" and to build with the MagicBlock stack (zero-fee transactions, VRF, privacy). |

The form's server-rendered page says "No open events to submit to right now". That page is rendered before the
events list loads, and the events API lists V10 as `active`. If the form still shows no event after you log in, ask in
the Blitz Telegram group before the deadline.

**Required fields** (from the form's own validation): project name (up to 200 characters), description (up to 5,000),
**website, GitHub repo, Pitch & Demo and Explorer link** (each must be a URL), and a connected wallet ("required to
submit, prizes pay here"). Name, email and country are also required.

---

## Step 1: Purpose

**Submitting for:** Solana Blitz V10 (Entertainment Finance).

## Step 2: About you (Nick)

First name, last name, email, country of residence, your role(s) and **Wallet**. Connect the wallet you want the prize
paid to. Nick fills these in himself; none of it is written here.

## Step 3: Proof of Work

### Project name

```text
Clashy
```

### One-liner (start of the description, and for X)

```text
Trade against people, not the house: 1v1 trading duels and Royales on live prices, with every move on a MagicBlock Ephemeral Rollup, every coin rolled by MagicBlock VRF, and the pot settled in USDC on Solana.
```

### Description (3,031 characters, limit 5,000)

```text
Trade against people, not the house: 1v1 trading duels and Royales on live prices, with every move on a MagicBlock Ephemeral Rollup, every coin rolled by MagicBlock VRF, and the pot settled in USDC on Solana.

Most trading games pit you against a house pool. Clashy pits you against a friend or a stranger. Two players stake test USDC, MagicBlock VRF rolls the coin for both of them, they lock sealed picks (long or short, or up or down), and the clash runs live on a MagicBlock Ephemeral Rollup until the bell. The winner takes the pot minus a 3% rake, and Elo moves. Royale puts many players in one pot: VRF picks the coin, everyone calls each round on the rollup, and the survivors split the pot. Perps clashes add leverage (up to 100x) with liquidation on the oracle price. Squads and clans add shared chests, votes and clan wars.

How it uses MagicBlock:
- Ephemeral Rollup: duels, Royales, price feeds, boards and clan chat channels are delegated to MagicBlock's devnet rollup (devnet-as.magicblock.app). Start, the live scoring checks and every Royale round run there with no fees, then commit_and_undelegate brings the result back to Solana, where settle_duel or settle_tournament pays out from escrow.
- VRF: request_coin_roll and request_tournament_coin ask MagicBlock VRF for the coin. Only the VRF program's callback can set it. With vrf_required on, the commit-reveal fallback and forged callbacks are refused, and a test proves it.
- Zero-fee play: players hold 0 SOL. A sponsor relay pays every base-layer fee and rent, and the rollup moves are free. On web, players sign in with Privy (email or Google), which creates a Solana wallet that signs inside the game. We don't use MagicBlock session keys or private payments.

What is live: the Anchor program is deployed on Solana devnet (FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS), using MagicBlock's devnet rollup and their hosted VRF oracle. Every on-chain test passed there: duels, VRF required, Royale, perps settle, liquidation, leverage cap, void and refund, clans and clan wars, squads, and the chat and calls feed on the rollup. Two players also played through the web app with 0 SOL each: a crypto clash, a perps clash and an on-chain Royale, all settled in test USDC. Around that sit 150 practice games on live Phoenix and Pacifica prices (practice money only), chat, squads and a guided tour.

What isn't live: there is nothing on mainnet and no real money. Buying tokenized stocks for Stash needs an Orca xStock pool, which exists only on mainnet. The app isn't hosted yet; the services ran on a Mac for the devnet runs.

Honest timeline: most of Clashy, including the whole on-chain program, was written Nov 15–20, before the Nov 20 14:00 UTC kickoff (commits 375d706..6431028). Work after kickoff (93fa845..e833c62): the devnet deploy and the full devnet test run on MagicBlock's rollup and VRF, close_duel, the devnet test USDC and faucet, the Royale stock-coin fix, the 150 games and the game kit, and the beta legal pages. Details are in the README.
```

### Categories (up to 3)

`Games`, `Consumer`, `Social`

### Project website (required URL), Nick decides

**Not live yet.** On Nov 24, 2026, `clashy.fun` resolved to a parked Hostinger page (`2.57.91.91`, title "Parked
Domain name on Hostinger DNS system"), and `play.clashy.fun` had no DNS record. Pick one:
1. Deploy the landing (`web/`) and app per [docs/DEPLOY-RUNBOOK.md](docs/DEPLOY-RUNBOOK.md), point DNS, then use
   `https://clashy.fun`.
2. Otherwise paste the repo URL (`https://github.com/nickthelegend/clashy`) and say in Additional information that the
   site isn't hosted yet.

Don't paste `https://clashy.fun` while it's still the parked page.

### GitHub Project Repo (required, "must be accessible")

```text
https://github.com/nickthelegend/clashy
```

**The repo is PRIVATE** (checked with `gh repo view` on Nov 24, 2026). The form checks access live. Before
submitting, either make it public or invite the reviewer account that the form names in its "can't see repo" warning.
Also push the local commits first (see the checklist).

### Pitch & Demo (required URL), Nick

**No demo of the devnet product exists yet.** The launch film (`marketing/clashy-x/film/clashy-launch-film-v2.mp4`,
48 s) is a brand film on practice money. Nick hasn't approved it, and it shows no devnet clash. The form doesn't
publish a length limit. A demo that meets Nick's film rules would:
- open on the live product within 15 s (no title cards first);
- play one real devnet clash: the VRF roll, sealed picks, live on the rollup, settlement and the USDC receipt;
- show the explorer tabs for the same duel (base and rollup);
- tour the whole app (games, Royale, squads, chat);
- use no faked output.

Upload it (YouTube unlisted or Drive, viewable by anyone with the link) and paste the URL.

### Explorer link (required, "integration proof")

```text
https://explorer.solana.com/address/FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS?cluster=devnet
```

### On-chain addresses (optional; the form says they are checked for recent devnet/mainnet activity)

| Kind | Address |
|---|---|
| Program | `FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS` |
| Wallet (relayer / fee payer) | `AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz` |

Leave the fee vault out: it's for MagicBlock private-payment fees, and Clashy doesn't use them.

**"Recent" activity:** the program's last base-layer transaction was Nov 22, 2026 04:48 UTC. A fresh devnet clash,
for example while recording the demo, shows activity in the judging week.

### Additional information (optional, up to 5,000)

```text
Devnet proof (Solana Explorer, cluster devnet):
- Program: https://explorer.solana.com/address/FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS?cluster=devnet
- One duel start to finish, Nov 22 04:43-04:45 UTC:
  open https://explorer.solana.com/tx/QX8XN8N8sYrNF4DQw12SyDzfP82eJwVLpTxeahJqahdXiMcmja7R7rBoHXURgr6J2LDJRrw4DwLGfG5Xq4oc8X2?cluster=devnet
  VRF request https://explorer.solana.com/tx/2x4UDrwcsgKjE9GfHD72hGqc9sP7nVowSUA7KeMuiQm8nhGwBejhxKNYx3xL4gxqvmtyVrSnYMKqASmVpLx876ZD?cluster=devnet
  VRF callback (signed by MagicBlock's oracle) https://explorer.solana.com/tx/35ej9Xz7f4PuoPZ5icHEJB2uronYG1MQiQxmHTHThfEmMf3vfS8pKv9tnRmNxRjhacxFRs5zPmqctTy8UFqP4VAs?cluster=devnet
  delegate to the rollup https://explorer.solana.com/tx/3xGKFBWJDF61Tn6aemkYgDDTLBYtiimCxzyfjHgnVR2BPprzVXMXP8zPKduZiijjfZi1bg22t5ijCvF4XwGYr27Q?cluster=devnet
  start on the rollup https://explorer.solana.com/tx/47CE3R16VZXTvc3XhCwQhGgtBF31ubZGvbKGWSuTtXPqAfLApVnuWcBd175TSncB7vgTVJtFW8xMeHrvA45NJmPk?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app
  settle on Solana https://explorer.solana.com/tx/63Naj6C7Wttt8f666pJGhrWvuzHwJTLRSS9BVwLVynjW1yMuGjrU4ajSALcvCGT57HVrDW4VMry8h9fGKpJNiB7g?cluster=devnet
- One Royale: VRF coin https://explorer.solana.com/tx/5fccMbSw6RRApMmKPQw1veaUvmqvC3ZMFwEZzYHDtGMtntQ7p2S5ZeNvRBcTTP8DHCvDsVHdcaw7TWkrYV9ktZwX?cluster=devnet , settle https://explorer.solana.com/tx/2dgA24W5QajN3mRxjaHJ376rjYDbDrbA3ZxDFChW7NRLEdJGgygTJhaftnFsuto7KDgBYcYTZrga5KuLMKa85iTu?cluster=devnet
Rollup: devnet-as.magicblock.app. VRF queue Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh. Test USDC mint 8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN (no value).

Pre-kickoff disclosure: most of the code, including the whole on-chain program, predates the Nov 20 14:00 UTC kickoff (commits 375d706..6431028, Nov 15-20). After kickoff (93fa845..e833c62): the devnet deploy and test run on MagicBlock's rollup and VRF, close_duel, the devnet test USDC and faucet, the Royale stock-coin fix, the games and game kit, and the beta legal pages. Mainnet: not deployed, no real money.
```

## Step 4: Boost (Nick)

- **Your X account:** Clashy's X account (the drafts use `@ClashyFun`; confirm the handle).
- **Team members:** Telegram handles, if anyone else should be able to see and edit the submission.

---

## Devnet transactions (all real, read from devnet on Nov 24, 2026)

How they were found: `getSignaturesForAddress` on the program through `https://rpc.magicblock.app/devnet`, and on the
duel and Royale accounts through `https://devnet-as.magicblock.app`, then `getTransaction` for each one, read-only.
The program has 1,520 base-layer transactions, all on Nov 22 between 02:27 and 04:48 UTC. 72 of them failed, and they
include the tests that check refusals.

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

Rollup transactions open in Solana Explorer through its custom-RPC setting (`customUrl=https://devnet-as.magicblock.app`).
They depend on the rollup keeping its history. On Nov 24 the rollup still returned them.

---

## Before and after kickoff (honest disclosure)

Kickoff: Nov 20, 2026 14:00 UTC. These are commit times in UTC (`TZ=UTC git log`).

| Range | Commits | When (UTC) | What |
|---|---|---|---|
| `375d706..6431028` | 154 | Nov 15 09:43 to Nov 20 07:13 (**before kickoff**) | The website, art and app; the whole Anchor program (duels, sealed picks, rollup delegation, VRF coin rolls, Royale, clans and wars, perps, rake and Elo); the sponsor relay; the audit and its fixes; the local MagicBlock stack and tests; chat, stickers and the first tour |
| `93fa845..e833c62` | 15 | Nov 20 14:49 to Nov 22 04:47 (**after kickoff**) | The white tour card, the 150 practice games and the game kit (the first three commits landed at 14:49 UTC, 49 minutes after kickoff, so most of that work was written before it); the beta legal pages; `close_duel` (the only program change, 45 lines in `lib.rs` and `math.rs`); the devnet test USDC and faucet; **the devnet deploy and the full devnet test run**; the Royale stock-coin fix; the faucet limits; docs/DEVNET.md |
| `e833c62..` (local) | 2 | Nov 24 | This README status update and this file (docs only) |

The program bytes on devnet match the local build `chain/target/deploy/clashy.so`, which includes `close_duel`. The
event pages publish no rule on code written before kickoff, but Luma frames the week as building an MVP. Whether to
enter is Nick's call.

---

## What Nick must do before Fri Nov 27, 2026 14:00 UTC (19:30 IST)

1. **Decide on eligibility.** Most of the code predates kickoff (see the table above). If unsure, ask the MagicBlock
   team in the Blitz Telegram group, and keep the disclosure in the description either way.
2. **Push and open the repo.** `git -C projects/clashy log origin/main..main` shows the 2 local docs commits. Push them
   (`git push origin main`). Then make `github.com/nickthelegend/clashy` public, or invite the reviewer the form names.
   Check that the form's repo check goes green.
3. **Website.** Deploy `web/` and point `clashy.fun` (see docs/DEPLOY-RUNBOOK.md), or paste the repo URL instead. Never
   paste the parked page.
4. **Demo.** Record a devnet demo or approve one, then upload it so anyone with the link can watch. It should show the
   live product within 15 s, one real devnet clash with the VRF roll, the rollup and settlement, and the explorer. No
   video of the devnet product exists yet. A fresh clash while recording also gives the program recent devnet
   activity.
   - **Before recording:** the sponsor has about 0.26 devnet SOL and the crank about 0.3 (docs/DEVNET.md). That's
     enough for a demo. If new players will be made, top up the sponsor
     (`AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz`) from faucet.solana.com.
5. **Fill the form.** Log in with Telegram, connect the payout wallet, fill About you, paste Step 3 from this file,
   and add your X handle and any team members.
6. **Submit** before 14:00 UTC on Nov 27, then check that the submission shows on your builder profile.
