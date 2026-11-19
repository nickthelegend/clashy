# Clashy

**Trade against people, not the house.** Clashy is a mobile-first PvP trading game on Solana: 1v1 Knockout Duels,
Draw the Line rooms and monthly Clan Wars, with every move on a MagicBlock Ephemeral Rollup and settlement on Solana.
Domain: clashy.fun. Entry for MagicBlock's Solana Blitz v10 (Entertainment Finance).

## Status: in development, local chain only

> **Made before kickoff.** The website, art, app and on-chain program were written Nov 15–16, 2026, before the Solana
> Blitz v10 kickoff on Nov 20. Code written before kickoff may not be eligible; check the event rules before submitting.

- **On-chain:** the Anchor program runs end to end on a local MagicBlock stack (Solana validator + Ephemeral Rollup):
  escrowed knockout duels, sealed picks, live scoring on the rollup, settlement with rake and Elo, clans with vote-run
  chest trades, clan wars and Royale tournaments. **Money is USDC only**: players never hold SOL, a sponsor relay pays
  every fee and rent. 5/5 end-to-end, 5/5 relay and 11/11 unit tests pass, every test player at 0 SOL. See
  [chain/README.md](chain/README.md) and [chain/TESTING.md](chain/TESTING.md).
- **MagicBlock VRF rolls every coin**, proven locally with MagicBlock's own `vrf-oracle`.
- **Not deployed** to devnet or mainnet (devnet BLOCKED on devnet SOL). No real money moves anywhere.
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
  stack: **On-chain duel**, **On-chain Royale** and **On-chain clan** (chest, votes, wars). On web you sign in with
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
