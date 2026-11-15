# Clashy

**Trade against people, not the house.** Clashy is a mobile-first PvP trading game on Solana: 1v1 Knockout Duels,
Draw the Line rooms and monthly Clan Wars, with every move on a MagicBlock Ephemeral Rollup and settlement on Solana.
Domain: clashy.fun. Entry for MagicBlock's Solana Blitz v10 (Entertainment Finance).

## Status: in development

> **Made before kickoff.** The marketing website (`web/`) and the 3D art (`assets/`) were made on Nov 15, 2026, before
> the Solana Blitz v10 kickoff on Nov 20. No game code, programs or app code exist yet; those start at kickoff.

Nothing on the website is live. The duel chart and the Draw the Line pad on the site use simulated price paths and say
so on the page; store badges are marked "coming".

## Layout

| Path | What |
|---|---|
| `web/` | Marketing site (Vite + React + TypeScript). `npm install && npm run dev` |
| `assets/web/` | 3D objects for the site (webp) and the OG card |
| `assets/mobile/` | App icon (1024 PNG + webp), splash, onboarding hero, 8 trader avatars, 4 clan crests, win crown, 3 mode tiles, 2 empty states |
| `assets/SOURCES.md` | How each image was made (ChatGPT conversation links and prompts) |
| `docs/ART-3D.md` | The 3D art kit: material, palette, banned subjects |
| `scripts/convert-art.sh` | Turns the raw ChatGPT PNGs into the webp sets and the site's sized copies |

## Website

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build && npm run lint
```

Sections: hero (3D swords on a moving grid floor), "your opponent is a person, not a pool", how a Knockout Duel works
(simulated duel with both knockout lines on one chart), the modes, a playable Draw the Line pad (simulated price),
servers and chat, built on MagicBlock (ER, Private ER, VRF, session keys), an honest comparison with house-pool apps
such as REKT, and the app download block (stores marked "coming").

Brand: night navy `#07071A`, indigo `#5B6CFF` (you), pink `#F0468C` (the opponent); Supreme (Fontshare) and Space Mono,
matching the approved app design comp.

## Credits

3D art generated with ChatGPT. MIT License, Copyright (c) 2026 Nivesh Gajengi.
