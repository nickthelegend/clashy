# Clashy

**Trade against people, not the house.** Clashy is a mobile-first PvP trading game on Solana: 1v1 Knockout Duels,
Draw the Line rooms and monthly Clan Wars, with every move on a MagicBlock Ephemeral Rollup and settlement on Solana.
Domain: clashy.fun. Entry for MagicBlock's Solana Blitz v10 (Entertainment Finance).

## Status: in development, local chain only

> **Made before kickoff.** The website, art, app and on-chain program were written Nov 15–16, 2026, before the Solana
> Blitz v10 kickoff on Nov 20. Code written before kickoff may not be eligible; check the event rules before submitting.

- **On-chain:** the Anchor program runs end to end on a local MagicBlock stack (Solana validator + Ephemeral Rollup):
  escrowed knockout duels, sealed picks, live scoring on the rollup, settlement with rake and Elo, clans with vote-run
  chest trades, clan wars and Royale tournaments. 5/5 end-to-end and 9/9 unit tests pass. See
  [chain/README.md](chain/README.md) and [chain/TESTING.md](chain/TESTING.md).
- **MagicBlock VRF rolls every coin**, proven locally with MagicBlock's own `vrf-oracle`.
- **Not deployed** to devnet or mainnet (devnet BLOCKED on devnet SOL). No real money moves anywhere.
- **App:** the practice games run on live prices with no money. Three screens play the real program on the local
  stack with a device test wallet: **On-chain duel**, **On-chain Royale** and **On-chain clan** (chest, votes, wars).

## Layout

| Path | What |
|---|---|
| `app/` | Expo app (iOS, Android, web): duels, 9 practice games, clans, ranks, chat, and the On-chain duel screen |
| `chain/` | Anchor program `clashy`, local MagicBlock stack launcher, price crank, mainnet-fork Phoenix trade, tests |
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
