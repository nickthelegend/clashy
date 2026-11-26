# Clashy

**Trade against people, not the house.** Clashy is a mobile-first PvP trading game on Solana: 1v1 Knockout Duels,
Royales and Clan Wars. The live part of an on-chain clash (sealed picks, scoring every second, Royale rounds) runs on a
MagicBlock Ephemeral Rollup; escrow and settlement are on Solana. The 150 practice games run off chain on live prices.
Domain: clashy.fun (not hosted yet). Entry for MagicBlock's Solana Blitz v10 (Entertainment Finance).

**Everything below runs on Solana devnet with test USDC. No real money moves anywhere.**

The loop: two players stake, MagicBlock VRF rolls one coin for both, each locks up or down privately inside MagicBlock's
TEE rollup, a crank scores the clash every second for 60 s, and a Magic Action pays the winner on Solana.
[Tests](TESTING.md) · [Submission form](HACKATHON_SUBMISSION_FORM.md) · [MagicBlock design](docs/MAGICBLOCK.md) ·
[Devnet record](docs/DEVNET.md) · [Security audit](docs/AUDIT.md)

## Status: live on Solana devnet with MagicBlock's Private Ephemeral Rollup, VRF, cranks and Magic Actions (deployed Nov 22, upgraded Nov 25, 2026)

> **Built before and after kickoff.** Solana Blitz v10 kicked off on Nov 20, 2026 at 14:00 UTC. The first version of
> the app, the website and the on-chain program was written before then. All of the MagicBlock work beyond delegation
> and VRF (cranks, the keeper, Magic Action payouts, private picks on the TEE rollup, oracle prices, session keys) was
> written after kickoff, on Nov 25. The commit ranges are in [Before and after kickoff](#before-and-after-kickoff).
> Check the event rules before submitting.

### Devnet deployment

| Piece | Address | Notes |
|---|---|---|
| Program `clashy` | [`FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS`](https://explorer.solana.com/address/FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS?cluster=devnet) | Anchor. [Initialized](https://explorer.solana.com/tx/4p3J8MfGMNSBjhiyjTLpA9T1CcnC1ewXb6bjgVBvawMuokZJCyQeF2jjJY4AxyY568CWYxKthMLPkiBvMJdsfD7o?cluster=devnet) Nov 22 02:27 UTC. Upgraded four times on Nov 25: [cranks, keeper, Magic Actions, private picks, oracle](https://explorer.solana.com/tx/4VJAbxj2mqY962jYCXSRhdrf86p3bGuyAkuGuhVFh8adfPC4XW32iNm7Tme8aWWdHyPXuJABskug16qnKQhGbwZw?cluster=devnet), [session keys](https://explorer.solana.com/tx/2bfRV8kMn2X3PWXwz7fxRamt1Akd1MhSQjWTviTvc6B3ydiyXh5Z6mLbgsgXVdoNQU8CpgHCv1sYnHbXbheydEJZ?cluster=devnet), [VRF callback fix and 0.5% Stash fee](https://explorer.solana.com/tx/jKQqVjuN48xpkFaKwkAwkwui86jg3nnKEx6L6CYYPLReu8zBEwQ4WVmfJMVVREFFz9vGfhaVNriYSHo6axhqSnt?cluster=devnet), [crank cancelled by the finishing tick](https://explorer.solana.com/tx/3LJSPdfkpULiu9HnWVaJxHh3rhLTew6rpRPwvS1NVwDZvHsnKejPYj5Fv8dMDEycfNH6sVrXZV3SXyfymyU944k6?cluster=devnet). Program space: 1,605,240 bytes (the program data account is 1,605,285 bytes with its 45-byte header). Its first 1,583,160 bytes match `chain/target/deploy/clashy.so` (sha256 `707e9cb8…2dc9b7`) and the rest is zero padding (checked Nov 25 with `solana program dump`). Upgrade authority: one deployer key, `6XdpT4…nYbe`. |
| Test USDC (stake currency) | [`8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN`](https://explorer.solana.com/address/8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN?cluster=devnet) | SPL token, 6 decimals. It has no value and exists only on devnet. |
| Ephemeral Rollup | `https://devnet-tee.magicblock.app` | MagicBlock's Private Ephemeral Rollup (TEE), validator `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`, validator version 1.1.1. Transactions need an auth token (valid 30 days); public reads need none. The Nov 22 runs used `devnet-as.magicblock.app` (validator `MAS1Dt9…`); feeds, boards and the squad channel were moved home from there with `admin_undelegate` and re-delegated to the TEE on Nov 25 (`chain/evidence/devnet-migrate.log`, `devnet-migrate2.log`). |
| Prices | SOL `ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu`, BTC `71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr`, ETH `5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG` | SOL, BTC and ETH read MagicBlock's oracle accounts. The five stocks (NVDA, TSLA, AAPL, SPY, GOOGL) keep Clashy's own crank-pushed feeds. |
| Keeper | `TRpZrvYjB4nBqpq36kEzoghkG7RMipuMZirFbXBwyPK` | A PDA delegated to the rollup. It signs the crank's commits; its action escrow `FxRMULTCDTT4xXbiwdacGDPtn5J9cM9jK2hqq8Jj13nE` pays for Magic Actions. |
| VRF | queue [`Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh`](https://explorer.solana.com/address/Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh?cluster=devnet) | MagicBlock VRF program `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`. The callbacks are signed by their oracle `vrfkfM4uoisXZQPrFiS2brY4oMkU9EWjyvmvqaFd5AS`. `vrf_required = true`, so the commit-reveal fallback is refused. |
| Fee sponsor (relay) | [`AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz`](https://explorer.solana.com/address/AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz?cluster=devnet) | Pays every Solana fee and rent for players, who hold 0 SOL. The keeper's escrow pays the rollup-side Magic Action fees. |
| Base RPC | `https://rpc.magicblock.app/devnet` | The rake is 3% (300 bps). The admin can change it (up to 10%) with `update_config`. |

**One private duel through the app, start to finish** (Nov 25, 11:33–11:35 UTC, duel `3iqsLN25cTK2SMMHqLyvvQhDLKPDBfHPBEUWBjhx8PW4`,
two device-wallet players with 0 SOL; full trail of 97 transactions, 85 on the rollup, in
[`chain/evidence/devnet-proof.txt`](chain/evidence/devnet-proof.txt)):
[open](https://explorer.solana.com/tx/4eQDRFpkCtejM51giwd8MRPcoEgeKHmQLdRHhw7ThyNo8VpPGdNWnEu5NgcEARGqdCNnxp364hZQVySLQWMw2F6k?cluster=devnet) →
[join](https://explorer.solana.com/tx/2zh5WqipZtcJ3ciuQoLhLXtasJc8fVZkxA3RuyyG2GB7GHRiKHj7RYQMvzBrMqjyPyvF4B1Nd9WimThBDYnfY8gd?cluster=devnet) →
[VRF request](https://explorer.solana.com/tx/4iyNPdpSNGCtNocH52ouFeWPZWQbApD2ptWPvRKrzDm2TZeM7uwmFFzurqJJhfuhnw9Gh8XcaxJeVNkKJSgghaom?cluster=devnet) →
[VRF callback (ETH)](https://explorer.solana.com/tx/2Zw2y1eKtUcCwezCpjLyhn5JJwTBTTaf9d1yKAdpAR7a4dd4xUEBG19TTk2BbsM4VkjzjD75QZDFpNHpkTXe2v71?cluster=devnet) →
[open private picks](https://explorer.solana.com/tx/2sbsAPkPeLggFuJaKqZv63F4v52f6TcmnPGycHLzZoMcRHWFcvL9cU7EFgegoKcugh4HjfWnYQPM5dYfv7BdGfHq?cluster=devnet) →
[delegate to the TEE](https://explorer.solana.com/tx/WdtSjg2a61LVRNT4i6g8mbFMCZMkvLb1DkKzf8SgQYY1jUV9TJCoGFjuhFLaFHM61FoBXvDiF82MbnqPWyoKHyn?cluster=devnet) →
[lock pick A](https://explorer.solana.com/tx/5XprAGcb1V3TPCXuPhsKAnhNbyru2jHbvwoeobFHdhjS6fbu9dgNqC4fgjcApU37z7SnVUmzPUcCPMdMuJQ4axL7?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) and
[lock pick B](https://explorer.solana.com/tx/3Z8DxDcXYhd68CFC2p95CNQbaTfzJo7TfbMTQvMa5jG1CxyaVM1zGSpGzcvdTmpCJf1AeJP8nC9RdVPHMAM4FKQm?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) on the rollup →
[start](https://explorer.solana.com/tx/45DauMxTGoQnq3frKWPY48KR8b7pXAjsyTrBFKgfzuR7NrpaAFY56rvUcqEmDi8CL7EtMhfput8vkWz2Uh2NJ7r2?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app) →
one crank `TickDuel` per second for 60 s ([first](https://explorer.solana.com/tx/4NHsJ6ehn78NCT9j285LXHCP7zduBmNkbLp75R4BucrAsaENDMD7YETCX8BBVVfw9gQ2eLynoNHBNM4cNuEuUL26?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app), [last](https://explorer.solana.com/tx/49EUfL6UUTnqgGAKbaobDE9w3M8gpGkazXJVkTehaDiZkGaW5NoGTp8o6cvQpvCGNW8m6ABN9G7iWvVytY17XNu3?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app)) →
commit and settle on Solana at 11:35:04 ([Solana](https://explorer.solana.com/tx/3TRqj5wUv7Euxm2kSfToEiKrrMvjnzgCzF3UQDQLQGkL4LcTNQ37nfwwvhJrbgABAwRA7SdcNHLuSgrvL9vfCMC5?cluster=devnet), [rollup](https://explorer.solana.com/tx/mWYjHRgP7gacpxzJmHT9o1UP1qmfB5nptMisS1MeDt8qupje4KaCLMxKY3x2yM7FM8Ss6MrvsJKQgkLDpj9Te2B?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app)).
ETH went 1,639.80 → 1,638.63; player B called down and won +9.70 USDC, player A lost 5 USDC. After the duel went
home, MagicBlock's scheduler tried the remaining ticks 11 more times; they failed because the duel had left the rollup,
and then the task was dropped. Since the devnet upgrade that evening, the finishing tick cancels its crank and no
failed tick follows (`docs/MAGICBLOCK.md`). Four failed VRF-oracle transactions also appear in the trail before the callback landed.

**One duel on the first deployment** (Nov 22, 04:43–04:45 UTC, on `devnet-as`, duel account `H6GpASV8…DG8t`):
[open](https://explorer.solana.com/tx/QX8XN8N8sYrNF4DQw12SyDzfP82eJwVLpTxeahJqahdXiMcmja7R7rBoHXURgr6J2LDJRrw4DwLGfG5Xq4oc8X2?cluster=devnet) →
[join](https://explorer.solana.com/tx/oGzZJJrcEfiFJ6idseA34Ydwp8goXfF8ek8Way44BzpBrTwAkRHPNUzUu2WaZizWoe3EUY3qEdrrdgfiYNPKqWb?cluster=devnet) →
[VRF request](https://explorer.solana.com/tx/2x4UDrwcsgKjE9GfHD72hGqc9sP7nVowSUA7KeMuiQm8nhGwBejhxKNYx3xL4gxqvmtyVrSnYMKqASmVpLx876ZD?cluster=devnet) →
[VRF callback](https://explorer.solana.com/tx/35ej9Xz7f4PuoPZ5icHEJB2uronYG1MQiQxmHTHThfEmMf3vfS8pKv9tnRmNxRjhacxFRs5zPmqctTy8UFqP4VAs?cluster=devnet) →
[delegate to the rollup](https://explorer.solana.com/tx/3xGKFBWJDF61Tn6aemkYgDDTLBYtiimCxzyfjHgnVR2BPprzVXMXP8zPKduZiijjfZi1bg22t5ijCvF4XwGYr27Q?cluster=devnet) →
[start on the rollup](https://explorer.solana.com/tx/47CE3R16VZXTvc3XhCwQhGgtBF31ubZGvbKGWSuTtXPqAfLApVnuWcBd175TSncB7vgTVJtFW8xMeHrvA45NJmPk?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) →
47 scoring checks on the rollup →
[settle on Solana](https://explorer.solana.com/tx/63Naj6C7Wttt8f666pJGhrWvuzHwJTLRSS9BVwLVynjW1yMuGjrU4ajSALcvCGT57HVrDW4VMry8h9fGKpJNiB7g?cluster=devnet).
The rollup links read devnet-as, which is no longer the configured rollup; it still served this history on Nov 25.
More, including a Royale, are in [HACKATHON_SUBMISSION_FORM.md](HACKATHON_SUBMISSION_FORM.md).

### What was tested on devnet

**Nov 25, on the TEE rollup** (`chain/evidence/devnet-mb-test.log`, `chain/evidence/devnet-private.log`). All four
tests in `chain/tests/magicblock.test.ts` passed, over two runs: the first run passed three and the private duel failed
on a devnet mint timeout while funding a test player; a second run passed the private duel.
- **Cranked duel:** VRF rolled BTC; 31 crank ticks; settled by a Magic Action 31.8 s after the start, with no
  transaction sent after the start.
- **Cranked Royale:** the survivor was paid 5.82 USDC; nobody resolved or settled by hand; round calls were signed by a
  MagicBlock session key.
- **Private duel:** picks locked inside the TEE. Player A's authenticated connection reads A's pick; player B's reads
  nothing. The clash then settled itself.
- **Keeper abuse:** an outsider cannot create or delegate the keeper.
- **Through the web app:** the private ETH duel above, played by two device-wallet players with 0 SOL.

**Nov 22, on devnet-as** (logs `chain/evidence/devnet-test-all.log`, `devnet-test-2.log`, `devnet-test-3.log`,
`devnet-test-4.log`, `devnet-test-clashy.log`). No single run was all green: each test below passed in at least one
run, several only after reruns.
- **Knockout duel:** open, join, VRF coin roll, sealed picks, live scoring on the rollup, then settlement with rake and
  Elo.
- **VRF:** VRF is required; the commit-reveal roll and a forged callback are both refused.
- **Royale:** USDC entries, a VRF coin, calls and rounds on the rollup, and survivors split the pot.
- **Perps:** a 25× vs 25× clash settles at the bell, a 50× long is liquidated by a 2.5% drop (price staged with the
  crank key), and leverage above 100× is refused.
- **Safety:** a live duel nobody finishes is voided and refunds both stakes.
- **Social:** clans (chest shares, votes, a trade closed at the Solana price, clan war), squads, names, safety limits,
  the calls feed and clan chat on the rollup.
- **Relay:** the sponsor relay refuses bad requests and a forged Privy token. The zero-SOL sponsored-player test failed
  on devnet (it needs a real Privy sign-in).
- **Through the web app:** two players reported a crypto clash, a perps clash and an on-chain Royale. No transaction
  links were kept for those runs, so the Nov 25 duel above is the in-app proof.

### Not on devnet

- **Stash buys are mainnet only.** Buying a tokenized stock (for example NVIDIA) goes through an Orca xStock pool, and
  devnet has no such pool. Stash savings do work on devnet.
- **Nothing is on mainnet.** The program is not deployed there, and no real money moves anywhere. The open Medium
  findings and the follow-ups to the three mitigated Highs in [docs/AUDIT.md](docs/AUDIT.md) gate mainnet. The Nov 25
  MagicBlock code has not been audited yet.
- **Not hosted yet.** `clashy.fun` is still a parked Hostinger page, and `play.clashy.fun` has no DNS record (both
  checked Nov 25, 2026). The relay, crank and app ran on a Mac for the devnet tests.

### Who can change the program

Players cannot change a game's coin, prices or payout. The Clashy admin still can change the rules: the program is
upgradeable by one deployer key (`6XdpT4…nYbe`), and `update_config` lets the admin change the rake (up to 10%), the
treasury and `vrf_required`. The crank key sets the five stock prices. Moving the upgrade and admin keys to a Squads
multisig is the mainnet plan; it is not done.

### Before and after kickoff

Solana Blitz v10 ran from Nov 20, 2026 14:00 UTC to Nov 27, 2026 14:00 UTC (MagicBlock's events list). All times
below are commit times in UTC (`TZ=UTC git log`).

| Range | Commits | When (UTC) | What |
|---|---|---|---|
| `375d706..6431028` | 154 | Nov 15 09:43 to Nov 20 07:13 (before kickoff) | The website, art and app; the first Anchor program (duels, commit-reveal picks, Ephemeral Rollup delegation, VRF coin rolls, Royale, clans and wars, perps, rake and Elo; `lib.rs` was 2,618 lines); the sponsor relay; the security audit and its fixes; the local MagicBlock stack and tests; chat, stickers and the first tour |
| `93fa845..e833c62` | 15 | Nov 20 14:49 to Nov 22 04:47 (after kickoff) | The white tour card, the practice games and the game kit (the first three commits landed at 14:49 UTC, 49 minutes after kickoff, so part of that work was written before it); the beta legal pages; `close_duel` (45 program lines); the devnet test USDC and faucet; the first devnet deploy and test run; the Royale stock-coin fix; the faucet limits; the devnet record |
| `ddfa4da..e14e80f` | 10 | Nov 24 20:29 to Nov 25 11:37 (after kickoff) | README and submission form; **MagicBlock cranks, the keeper PDA, Magic Action payouts, private picks on the TEE rollup, MagicBlock oracle prices** (program, app and tests); the app's MagicBlock track and Live on MagicBlock screen; session keys (`lock_pick_session`, `call_round_session`); the VRF callback fix; the 0.5% Stash trading fee; TEE authentication; the three devnet upgrades and the TEE test runs; result Lottie animations; the sealed-in-TEE duel card; `scripts/devnet-proof.ts` |
| `a72149c..9e0a58e` | 9 | Nov 25 11:54 to 17:56 (after kickoff) | Session keys in the app (private picks signed on the device); the claims audit of docs and site copy; the finishing crank tick cancels its MagicBlock task (the fourth devnet upgrade, `3LJSPdfk…`); Lottie on phones; the clay sprite animations in live clashes; two duel-screen fixes found while filming |
| `e50830c..` | | Nov 26 (after kickoff) | Docs only: the cited test logs published, the Nov 26 test re-run (TESTING.md), the read-only devnet live check script, and this README |

After kickoff the program grew by 1,039 lines and lost 74 (`git diff --shortstat 6431028 HEAD -- chain/programs`);
`lib.rs` is now 3,485 lines and the program source 4,564.

### Details

- **On-chain:** the Anchor program runs end to end on a local MagicBlock stack (Solana validator + Ephemeral Rollup)
  and on devnet: escrowed knockout duels, sealed picks (commit-reveal or private TEE picks), live scoring on the
  rollup, settlement with rake and Elo, clans with vote-run chest trades, clan wars and Royale tournaments. **Money is
  USDC only**: players never hold SOL, a sponsor relay pays every fee and rent. Latest local run (Nov 26, MagicBlock
  validator 1.1.1 over Agave 4.5.0-beta.0): magicblock 4/4, clashy 5/5, perps 3/3, brief 9/9, void 1/1, sponsor relay
  5/5, practice clash 5/5, live order books 7/7, 13/13 Rust unit tests and the social server 4/4, every test player at
  0 SOL ([TESTING.md](TESTING.md), logs in `chain/evidence/*-nov26.log`). See [chain/README.md](chain/README.md), [chain/TESTING.md](chain/TESTING.md) and
  [docs/DEVNET.md](docs/DEVNET.md).
- **MagicBlock VRF rolls the coin of every on-chain duel and Royale:** proven locally with MagicBlock's own
  `vrf-oracle`, and on devnet with their hosted oracle. Practice games roll their coin in the app.
- **MagicBlock end to end:** cranks score every live clash each second, the keeper commits the result, a Magic Action
  pays it out on Solana, picks can be locked privately in the TEE, and SOL/BTC/ETH read MagicBlock's oracle. See
  [docs/MAGICBLOCK.md](docs/MAGICBLOCK.md).
- **v2 (Nov 19, 2026):**
  - **Trades:** tap any trade for its own page: profit and ROI, real candles with Open and Close pins, details, and
    Copy trade.
  - **Charts:** every chart has a crosshair (hover or drag).
  - **Desktop:** an order-book trading terminal on wide screens.
  - **Social:** Instagram-style Chats with DMs, notifications and follow requests; Follow and Message on profiles;
    Edit profile.
  - **Stickers:** a Telegram-style emoji + sticker keyboard in every DM and squad chat, with 10 clay sticker packs
    (Clashy, Perps, Solana, Solana DeFi, Solana Apps, MagicBlock, BONK, dogwifhat, Meme Zoo, Supercycle). It has
    search, recents, favourites, a long-press preview and sticker suggestions as you type. Emoji-only messages show big.
    Live taunts in a clash go to your rival in real time.
  - **Chat:** WhatsApp-style threads in DMs and squad channels. Bubbles have tails, with the time and read ticks
    inside. A faint Clashy doodle wallpaper sits behind them. Swipe a message to reply. Long-press it over a
    blurred chat for six quick reactions (or any emoji), Reply, Copy and the author's profile. A scroll-to-bottom
    button counts new messages. The composer has an emoji key, 📎 shortcuts (Clash, Stickers, Emoji, Profile or
    the squad page), a field that grows as you type, and a round send button that is a quick 🔥 when empty.
    Replies and reactions are ordinary messages underneath, so squad ones are on chain too.
  - **Guided tour:** on first run, a spotlight walkthrough shows a new player every item on Home and every tab: each
    tab button, the Play tab's game tiles one by one, the squad chest and challenges, and the stats, rank and history on
    You. The screen dims, the item is cut out with a lavender ring, and a white card (XORR's walkthrough style) gives a
    short title, one line on what to do, a step counter, Back, Next and Skip. It switches tabs and scrolls by itself,
    and skips anything that isn't on screen. 25 inner screens and every game get their own short tour on the first
    visit. Replay it from Settings → Take the tour again. Code: [app/src/tour/](app/src/tour/).
  - **Games:** 150 games on live prices ([docs/GAMES.md](docs/GAMES.md)): memecoins, perps, US stocks, crypto and party
    games. Some examples:
    - tap trading on a price grid (Tap Grid, Meme Grid), More or Less lines (More or Less, Power Play), a tower climb,
      Mines on the day's red markets, roulette on the move;
    - replays of real candles (Rewind, Call the Close, Who's That Chart), one live candle (Candle Call, Wick Duel),
      whole-path calls (Path Pick), same-or-split pairs (In Sync), and a pre-set exit (Exit Plan);
    - races (Meme Sprint, Pair Pick, Chip War);
    - cash-outs (Rocket, Rug Radar, Leverage Ladder);
    - liquidation games (Knockout, Safe Zone);
    - quick calls in a streak (Hot Streak, Gauntlet);
    - instant quizzes (Cap or No Cap, Better Day);
    - brackets, bingo, drafts, and a royale against seven bots.

    They run on 32 engines, all driven by one shared stream of Phoenix and Pacifica mark prices (every market the two
    venues list; about 110 on Nov 20), plus Jupiter data for pump.fun coins. Fixed payouts are priced from each
    market's live volatility. All games use practice money, solo or against Clashy Bot. In up/down games the bot always
    takes the other side; in some engines (race, guess, snipe, royale) it picks at random. Each round ends on a receipt
    of real prices. Ideas came from two Grok sessions and research on what ships today (tap trading, PrizePicks,
    chart-replay quizzes), and the game icons are new clay art. Code: [app/src/games/](app/src/games/) and `app/games`.
  - **Game kit:** every piece the games are built from, in one import (`@/games/kit`): style tokens, the round API,
    bell and market helpers, real past candles, the price and candle charts, the controls, and the screen pieces (game
    cards, hero, result card). [docs/GAME-KIT.md](docs/GAME-KIT.md) lists them and how to add a game or an engine;
    /games/kit shows them all live.
  - **Squads:** a squad podium, and squad search in the search drawer.
  - **Art:** Lottie onboarding and a squad war scene; vector Lottie results (win, lose, liquidated, dead heat) since
    Nov 25.
  - **Backend:** the social server ([server/](server/)) and the whole backend in Docker
    ([docker/README.md](docker/README.md)).
  - **Security audit:** [docs/AUDIT.md](docs/AUDIT.md), an internal review against Trail of Bits' Solana and
    insecure-defaults checklists, in three separate read-only review passes. All 4 Criticals are fixed; the relay ones
    have tests, and P1 was checked by code review only. The audit predates the Nov 25 MagicBlock code.
  - **Archive and database:** every call and squad message is archived by `chain/scripts/indexer.ts`. Storage is
    SQLite on testnet and Supabase Postgres on mainnet (`CLASHY_DATABASE_URL`).
  - **Deploying:** `bash deploy/up.sh testnet|mainnet` (settings in `deploy/*.env.example`), followed by a read-only
    preflight. Not yet run against a server.
  - **System design and costs:** [docs/SYSTEM-DESIGN.md](docs/SYSTEM-DESIGN.md). It plans for 100 players (load-test
    script `server/test/load.ts`; a Nov 19 run on the Mac reported p95 8 ms with 0 errors, but its output is not stored
    in the repo) and an exact-size mainnet deploy (8.155 SOL rent for 1,605,240 bytes).
- **App:** the practice games run on live prices with no money. Three screens play the real program on the local
  stack or on devnet: **On-chain duel** (commit-reveal or private TEE picks), **On-chain Royale** and **On-chain clan**
  (chest, votes, wars), plus a **Live on MagicBlock** screen that reads the config, keeper and oracle accounts. On web
  you sign in with **Privy** (email or Google); Privy makes a Solana wallet that holds USDC, signs silently inside the
  game, and lets you send USDC out or export the key. Locally the relay hands out 100 test USDC. Automated runs use
  device test keys. In-game moves (the private pick lock and Royale calls) are signed by a MagicBlock session key the
  app keeps on the device for 6 hours.

## Layout

| Path | What |
|---|---|
| `app/` | Expo app (iOS, Android, web): on-chain duels, Royale and clans, 150 practice games on 32 engines, ranks, chat, squads and the tour |
| `chain/` | Anchor program `clashy`, local MagicBlock stack launcher (with the local USDC mint), price crank, sponsor relay, mainnet-fork Phoenix trade, tests |
| `server/` | Social server: DMs, follows, follow requests, notifications, bios (Node, built-in SQLite, wallet sign-in) |
| `docker/`, `docker-compose.yml` | The backend in containers: relay, crank, social, web, the local chain, Caddy |
| `web/` | Landing page (Vite + React + motion), one file: `web/src/App.tsx`. Not hosted yet |
| `landing/` | Second landing page variant with the clay animation clips and the Arena demo; `docs/DEPLOY-RUNBOOK.md` builds this one. Not hosted yet |
| `assets/` | Brand, 3D/clay art and clay animation clips (`assets/SOURCES.md` says how each was made) |
| `docs/` | MagicBlock, devnet, audit and system design; game design, mini-games and the real-trades plan are design documents, not built |

## Architecture

```text
 Player (Expo app: iOS, Android, web)        holds test USDC only, 0 SOL; Privy wallet on web, session key on device
   │  signs moves                                   │ in-game moves (pick lock, Royale calls) by a 6-hour MagicBlock session key
   ▼                                                ▼
 Sponsor relay (chain/scripts/sponsor.ts)  ── pays every Solana fee and rent, co-signs only Clashy player instructions
   │
   ├─► Solana devnet: program `clashy` (Anchor)
   │      open / join duel (USDC into an escrow PDA) · request_coin_roll ─► MagicBlock VRF ─► coin_roll_callback
   │      delegate the duel and the private pick accounts to the rollup
   │      settle_duel (pot minus 3% rake, Elo) ◄── Magic Action after commit and undelegate
   │
   └─► MagicBlock Private Ephemeral Rollup (devnet-tee, TEE validator MTEW…)
          lock_pick: each pick is a private account only its owner can read until the start
          start ─► schedules a crank: tick_duel / tick_round every 1,000 ms, no player online
          prices: MagicBlock oracle accounts (SOL, BTC, ETH); Clashy crank feeds for five stocks
          finishing tick ─► keeper PDA commits and undelegates, cancels its crank, Magic Action settles on Solana

 Social server (server/): DMs, follows, notifications · indexer: archives calls and squad messages
 Practice games: 150 games in the app on live Phoenix / Pacifica / Jupiter prices, practice money, off chain
```

The step-by-step flow, with the MagicBlock feature behind each step, is in [docs/MAGICBLOCK.md](docs/MAGICBLOCK.md);
capacity and costs are in [docs/SYSTEM-DESIGN.md](docs/SYSTEM-DESIGN.md).

## How to run

Tools: Node 22+, Rust with Anchor 0.32.1, the Solana CLI, and MagicBlock's validator CLI
(`npm i -g @magicblock-labs/ephemeral-validator@1.1.1`).

**Check the devnet deployment (read-only, no keys):**

```bash
cd chain && npm install
npx tsx scripts/devnet-livecheck.ts
```

**Local MagicBlock stack and every test:**

```bash
cd chain && npm install && anchor build
CLASHY_RESET=1 bash scripts/localnet.sh       # base :8999, MagicBlock rollup :7799, vrf-oracle; deploys the program
cargo test -p clashy --lib
for t in magicblock clashy perps brief void sponsor; do npx tsx --test --test-concurrency=1 tests/$t.test.ts; done
npx tsx scripts/crank.ts &                     # prices, for practice-clash.test.ts and the app
npx tsx scripts/sponsor.ts &                   # the relay on :8790, for markets.test.ts and the app
npx tsx --test tests/practice-clash.test.ts tests/markets.test.ts
(cd ../server && npm install && npm test)
```

**The app against the local stack:** with the stack, crank and relay running,
`cd app && npm install && EXPO_PUBLIC_CLASHY_DEV_WALLET=1 npx expo start --web --port 8098` gives each browser tab its
own device test wallet, so two tabs can clash each other. Without that variable the web app signs in with Privy.

**Against devnet:** `source chain/.devnet.env` (gitignored; endpoints and key paths), then run the crank and relay as
in [docs/DEVNET.md](docs/DEVNET.md#running-the-backend-against-devnet-from-chain). The whole backend in Docker:
[docker/README.md](docker/README.md); a server deploy: [docs/DEPLOY-RUNBOOK.md](docs/DEPLOY-RUNBOOK.md).

## Website

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build && npm run lint
```

`web/src/App.tsx` has these sections, in order:
1. Hero: the headline, two CTAs, a clay loop and a live price card (Coinbase).
2. Ticker: live prices from Coinbase and DexScreener; an error is shown if a feed fails.
3. Gameplay: three clips recorded from the app.
4. How a duel works: four pinned steps.
5. Games rail: one card per game mode, marked playable now or planned.
6. Real fights: how an on-chain clash runs and settles.
7. Ranks: the ten ranks.
8. Live race: race two coins for 60 s on Coinbase prices, in the browser, with no money.
9. Statement, then the MagicBlock tech cards and the footer.

Prices come from `web/src/lib/markets.ts`. The Arena widget (`landing/src/components/arena/`), `LeaderboardStrip` and
`StoreBadges` live in `landing/`, not in `web/`.

Theme (`web/src/styles.css`): pure black `#000`, surfaces `#0f0f12`/`#18181c`/`#232329`, Inter, indigo `#5b6cff`
(you), pink `#f0468c` (your rival), green `#30d158` / red `#ff453a` for long and short.

## Credits

3D art generated with ChatGPT. MIT License, Copyright (c) 2026 Nivesh Gajengi.
