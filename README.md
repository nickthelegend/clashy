# Clashy

**Trade against people, not the house.** Clashy is a mobile-first PvP trading game on Solana: 1v1 Knockout Duels,
Draw the Line rooms and monthly Clan Wars, with every move on a MagicBlock Ephemeral Rollup and settlement on Solana.
Domain: clashy.fun. Entry for MagicBlock's Solana Blitz v10 (Entertainment Finance).

## Status: in development

> **Made before kickoff.** The marketing website (`web/`) and the 3D art (`assets/`) were made on Nov 15, 2026, before
> the Solana Blitz v10 kickoff on Nov 20. No game code, programs or app code exist yet; those start at kickoff.

Nothing for money is live. The website's **Arena** is a free Knockout Duel demo on **real prices** (Binance public
spot trades): you pick long or short against a demo bot, with no wallet, money or chain involved. The page says so
next to the widget. Store badges are marked "coming".

## Layout

| Path | What |
|---|---|
| `web/` | Marketing site (Vite + React + TypeScript). `npm install && npm run dev` |
| `assets/brand/` | Wordmark (SVG, outlined paths, plus a PNG) |
| `assets/web/` | Site art: hero, face-off, arena and OG scenes plus 8 objects |
| `assets/mobile/` | App icon (1024 PNG + webp), splash, onboarding, matchmaking, 8 avatars, 4 crests, crown, KO burst, 3 mode tiles, 4 empty states, 4 badges |
| `assets/gallery.html` | Every asset on one page (`gallery.jpg` is a capture) |
| `assets/SOURCES.md` | How each image was made (ChatGPT conversation links and prompts) |
| `docs/ART-3D.md` | The "duel light" art kit and the wordmark |
| `scripts/convert-art.sh` | Turns the raw ChatGPT PNGs into the webp sets and the site's sized copies |

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
