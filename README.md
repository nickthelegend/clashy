# Clashy

**Trade against people, not the house.** Clashy is a mobile-first PvP trading game on Solana: 1v1 Knockout Duels,
Draw the Line rooms and monthly Clan Wars, with every move on a MagicBlock Ephemeral Rollup and settlement on Solana.
Domain: clashy.fun. Entry for MagicBlock's Solana Blitz v10 (Entertainment Finance).

## Status: live on Solana devnet with MagicBlock's Ephemeral Rollup and VRF (since Nov 22, 2026)

> **Made mostly before kickoff.** Solana Blitz v10 kicked off on Nov 20, 2026 at 14:00 UTC. Most of this repo,
> including the whole on-chain program, was written before then. The commit ranges are in
> [Before and after kickoff](#before-and-after-kickoff). Code written before kickoff may not be eligible; check the event
> rules before submitting.

### Devnet deployment

| Piece | Address | Notes |
|---|---|---|
| Program `clashy` | [`FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS`](https://explorer.solana.com/address/FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS?cluster=devnet) | Anchor, 1,324,136 bytes, [initialized](https://explorer.solana.com/tx/4p3J8MfGMNSBjhiyjTLpA9T1CcnC1ewXb6bjgVBvawMuokZJCyQeF2jjJY4AxyY568CWYxKthMLPkiBvMJdsfD7o?cluster=devnet) Nov 22 02:27 UTC. The bytes on chain match `chain/target/deploy/clashy.so`. |
| Test USDC (stake currency) | [`8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN`](https://explorer.solana.com/address/8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN?cluster=devnet) | SPL token, 6 decimals. It has no value and exists only on devnet. |
| Ephemeral Rollup | `https://devnet-as.magicblock.app` | MagicBlock's devnet rollup (Asia), validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` (checked with `getIdentity`). |
| VRF | queue [`Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh`](https://explorer.solana.com/address/Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh?cluster=devnet) | MagicBlock VRF program `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`. The callbacks are signed by their oracle `vrfkfM4uoisXZQPrFiS2brY4oMkU9EWjyvmvqaFd5AS`. `vrf_required = true`, so the commit-reveal fallback is refused. |
| Fee sponsor (relay) | [`AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz`](https://explorer.solana.com/address/AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz?cluster=devnet) | Pays every fee and every rent. Players hold 0 SOL. |
| Base RPC | `https://rpc.magicblock.app/devnet` | The rake is 3% (300 bps). |

**One duel on devnet, start to finish** (Nov 22, 04:43–04:45 UTC, duel account `H6GpASV8…DG8t`):
[open](https://explorer.solana.com/tx/QX8XN8N8sYrNF4DQw12SyDzfP82eJwVLpTxeahJqahdXiMcmja7R7rBoHXURgr6J2LDJRrw4DwLGfG5Xq4oc8X2?cluster=devnet) →
[join](https://explorer.solana.com/tx/oGzZJJrcEfiFJ6idseA34Ydwp8goXfF8ek8Way44BzpBrTwAkRHPNUzUu2WaZizWoe3EUY3qEdrrdgfiYNPKqWb?cluster=devnet) →
[VRF request](https://explorer.solana.com/tx/2x4UDrwcsgKjE9GfHD72hGqc9sP7nVowSUA7KeMuiQm8nhGwBejhxKNYx3xL4gxqvmtyVrSnYMKqASmVpLx876ZD?cluster=devnet) →
[VRF callback](https://explorer.solana.com/tx/35ej9Xz7f4PuoPZ5icHEJB2uronYG1MQiQxmHTHThfEmMf3vfS8pKv9tnRmNxRjhacxFRs5zPmqctTy8UFqP4VAs?cluster=devnet) →
[delegate to the rollup](https://explorer.solana.com/tx/3xGKFBWJDF61Tn6aemkYgDDTLBYtiimCxzyfjHgnVR2BPprzVXMXP8zPKduZiijjfZi1bg22t5ijCvF4XwGYr27Q?cluster=devnet) →
[start on the rollup](https://explorer.solana.com/tx/47CE3R16VZXTvc3XhCwQhGgtBF31ubZGvbKGWSuTtXPqAfLApVnuWcBd175TSncB7vgTVJtFW8xMeHrvA45NJmPk?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) →
47 scoring checks on the rollup →
[settle on Solana](https://explorer.solana.com/tx/63Naj6C7Wttt8f666pJGhrWvuzHwJTLRSS9BVwLVynjW1yMuGjrU4ajSALcvCGT57HVrDW4VMry8h9fGKpJNiB7g?cluster=devnet).
More, including a Royale, are in [HACKATHON_SUBMISSION_FORM.md](HACKATHON_SUBMISSION_FORM.md).

### What was tested on devnet

Every on-chain test passed against MagicBlock's devnet rollup and their hosted VRF oracle. The full record is in
[docs/DEVNET.md](docs/DEVNET.md).
- **Knockout duel:** open, join, VRF coin roll, sealed picks, live scoring on the rollup, then settlement with rake and
  Elo.
- **VRF:** VRF is required; the commit-reveal roll and a forged callback are both refused.
- **Royale:** USDC entries, a VRF coin, calls and rounds on the rollup, and survivors split the pot.
- **Perps:** a 25× vs 25× clash settles at the bell, a 50× long is liquidated by a 2.5% drop, and leverage above 100× is
  refused.
- **Safety:** a live duel nobody finishes is voided and refunds both stakes.
- **Social:** clans (chest shares, votes, a trade closed at the oracle price, clan war), squads, names, safety limits,
  the calls feed and clan chat on the rollup.
- **Relay:** the sponsor relay refuses bad requests and forged Privy tokens.
- **Through the web app:** two players with device wallets and 0 SOL played a crypto clash (VRF rolled ETH, the
  winner got +9.70 USDC from a $10 pot), a perps clash (VRF rolled BTC, +9.70 USDC) and an on-chain Royale (VRF rolled
  SOL, 6 rounds on the rollup, +3.88 USDC to the survivor).

### Not on devnet

- **Stash buys are mainnet only.** Buying a tokenized stock (for example NVIDIA) goes through an Orca xStock pool, and
  devnet has no such pool. Stash savings do work on devnet.
- **Nothing is on mainnet.** The program is not deployed there, and no real money moves anywhere. The open audit Highs
  in [docs/AUDIT.md](docs/AUDIT.md) are the gate for mainnet.
- **Not hosted yet.** `clashy.fun` is still a parked Hostinger page, and `play.clashy.fun` has no DNS record (both
  checked Nov 24, 2026). The relay, crank and app ran on a Mac for the devnet tests.

### Before and after kickoff

Solana Blitz v10 ran from Nov 20, 2026 14:00 UTC to Nov 27, 2026 14:00 UTC (MagicBlock's events list). All times
below are commit times in UTC.

| Range | Commits | When (UTC) | What |
|---|---|---|---|
| `375d706..6431028` | 154 | Nov 15 09:43 to Nov 20 07:13 (before kickoff) | The website, art and app; **the whole Anchor program** (duels, sealed picks, Ephemeral Rollup delegation, VRF coin rolls, Royale, clans and wars, perps, rake and Elo); the sponsor relay; the security audit and its fixes; the local MagicBlock stack and tests; chat, stickers and the first tour |
| `93fa845..e833c62` | 15 | Nov 20 14:49 to Nov 22 04:47 (after kickoff) | The white tour card, the 150 practice games and the game kit. The first three of these commits landed at 14:49 UTC, 49 minutes after kickoff, so most of that work was written before it. Also: the beta legal pages, `close_duel` (the only program change after kickoff, 45 lines), the devnet test USDC and faucet, **the devnet deploy and the devnet test run**, the Royale stock-coin fix, the faucet limits and the devnet record |

The program on devnet is the pre-kickoff program plus `close_duel`.

### Details

- **On-chain:** the Anchor program runs end to end on a local MagicBlock stack (Solana validator + Ephemeral Rollup)
  and on devnet: escrowed knockout duels, sealed picks, live scoring on the rollup, settlement with rake and Elo, clans
  with vote-run chest trades, clan wars and Royale tournaments. **Money is USDC only**: players never hold SOL, a
  sponsor relay pays every fee and rent. Locally, 5/5 end-to-end, 5/5 relay and 11/11 unit tests pass, with every test
  player at 0 SOL. See [chain/README.md](chain/README.md) and [chain/TESTING.md](chain/TESTING.md) (both written before
  the devnet deploy; [docs/DEVNET.md](docs/DEVNET.md) is current).
- **MagicBlock VRF rolls every coin:** first proven locally with MagicBlock's own `vrf-oracle`, and now on devnet with
  their hosted oracle.
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
    short title, one line on what to do, "3 of 37", Back, Next and Skip. It switches tabs and scrolls by itself, and
    skips anything that isn't on screen. 25 inner screens and every game get their own short tour on the first visit.
    Replay it from Settings → Take the tour again. Code: [app/src/tour/](app/src/tour/).
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

    They run on 32 engines, all driven by one shared stream of Phoenix and Pacifica mark prices (about 110 markets), plus
    Jupiter data for pump.fun coins. Fixed payouts are priced from each market's live volatility. All games use
    practice money against Clashy Bot (which picks at random) or solo, and each round ends on a receipt of real prices.
    Ideas came from two Grok sessions and research on what ships today (tap trading, PrizePicks, chart-replay
    quizzes), and the game icons are new clay art. Code: [app/src/games/](app/src/games/) and `app/games`.
  - **Game kit:** every piece the games are built from, in one import (`@/games/kit`): style tokens, the round API,
    bell and market helpers, real past candles, the price and candle charts, the controls, and the screen pieces (game
    cards, hero, result card). [docs/GAME-KIT.md](docs/GAME-KIT.md) lists them and how to add a game or an engine;
    /games/kit shows them all live.
  - **Squads:** a squad podium, and squad search in the search drawer.
  - **Art:** Lottie onboarding and a squad war scene.
  - **Backend:** the social server ([server/](server/)) and the whole backend in Docker
    ([docker/README.md](docker/README.md)).
  - **Security audit:** [docs/AUDIT.md](docs/AUDIT.md), done with Trail of Bits' Solana and insecure-defaults
    checklists by three independent reviewers. All 4 Criticals are fixed with tests. The open Highs are the gate for
    mainnet.
  - **Archive and database:** every call and squad message is archived by `chain/scripts/indexer.ts`. Storage is
    SQLite on testnet and Supabase Postgres on mainnet (`CLASHY_DATABASE_URL`).
  - **Deploying:** `bash deploy/up.sh testnet|mainnet` (settings in `deploy/*.env.example`), followed by a read-only
    preflight.
  - **System design and costs:** [docs/SYSTEM-DESIGN.md](docs/SYSTEM-DESIGN.md). It covers 100 players (load-tested
    at p95 8 ms with 0 errors) and a 6.58 SOL exact-size mainnet deploy (measured), not 12 SOL.
- **App:** the practice games run on live prices with no money. Three screens play the real program on the local
  stack or on devnet: **On-chain duel**, **On-chain Royale** and **On-chain clan** (chest, votes, wars). On web you sign in with
  **Privy** (email or Google); Privy makes a Solana wallet that holds USDC, signs silently inside the game, and lets you
  send USDC out or export the key. Locally the relay hands out 100 test USDC. Automated runs use device test keys.

## Layout

| Path | What |
|---|---|
| `app/` | Expo app (iOS, Android, web): duels, 9 practice games, clans, ranks, chat, and the On-chain duel screen |
| `chain/` | Anchor program `clashy`, local MagicBlock stack launcher (with the local USDC mint), price crank, sponsor relay, mainnet-fork Phoenix trade, tests |
| `server/` | Social server: DMs, follows, follow requests, notifications, bios (Node, built-in SQLite, wallet sign-in) |
| `docker/`, `docker-compose.yml` | The backend in containers: relay, crank, social, web, the local chain, Caddy |
| `web/` | Landing page (Vite + React + motion) |
| `landing/` | Second landing page variant with the clay animation clips |
| `assets/` | Brand, 3D/clay art and clay animation clips (`assets/SOURCES.md` says how each was made) |
| `docs/` | Game design, mini-games, real-trades plan, art kit |

## Website

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build && npm run lint
```

Layout follows fomo.family's page order with Clashy's own brand:
1. Hero: the sliced wordmark, a line, two CTAs, the duel-light swords.
2. **Arena:** a live Knockout Duel demo on real prices (`web/src/components/arena/`): SOL, BTC or ETH; long or short at
   250×, 500× or 1000×; both knockout lines on one chart; a 60 s bell; this browser's record.
3. Six feature cards (leaderboard, knockout duels, draw the line, clan wars, servers, MagicBlock).
4. An honest comparison with house-pool apps such as REKT.
5. Closing CTA over the face-off scene, then the footer.

Reusable components live in `web/src/components`: Nav, Hero, Wordmark, SectionHead, FeatureCard/FeatureGrid,
ArenaWidget, LeaderboardStrip, CompareStrip, DownloadCTA, StoreBadges, Money, Footer.

Theme: v12, matching the app. Pure black `#000`, surfaces `#111113`/`#1C1C1F`, Inter, indigo `#5B6CFF` (you), pink
`#F0468C` (your rival), green `#30D158` / red `#FF453A` for long and short.

## Credits

3D art generated with ChatGPT. MIT License, Copyright (c) 2026 Nivesh Gajengi.
