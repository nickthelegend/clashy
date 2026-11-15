# Asset sources

Every image here was generated with ChatGPT's image model on chatgpt.com (Nick's account) on Nov 15, 2026, in the
**soft clay** style (`docs/ART-3D.md`). No reference images were uploaded.

**Conversations (three tabs in parallel, current set):**
- https://chatgpt.com/c/6af9c5d4-3ebc-83ec-8834-b7bdb1b3b0f8
- https://chatgpt.com/c/6af9c5d7-6948-83e8-b292-099cdd8511a3
- https://chatgpt.com/c/6af9c5d8-c968-83e8-9747-f7ae16a6287d

Style line appended to every prompt:

> premium soft clay 3D render, like hand-made matte play-dough or plasticine: soft rounded chunky forms, a visible
> subtle thumb-press and fingerprint texture, matte surface (no gloss, no shine), gentle soft studio light from the
> upper left, a soft contact shadow under the subject. Cute but premium, like Apple Memoji clay or Headspace polish.
> Palette: indigo #5B6CFF, hot pink #F0468C, warm gold #FFC94A, plus soft cream and white. No outlines, no sticker
> border, no comic style, no halftone. Original design, not from any existing game or brand.

Objects added "Transparent background (real alpha, not a checkerboard pattern)". Scenes added "plain pure black
background". Avatars added one shared character-family line. Word stickers spelled each word letter by letter.

**Post-processing:**
- ChatGPT sometimes paints a fake checkerboard behind a sticker; those are flood-filled to real alpha (no border is
  added for clay).
- `scripts/convert-art.sh` crops banners to 16:9 (1600×900), onboarding and splash to 1024×1536, and the desktop hero to
  2400×600. It fits objects onto exact square or landing canvases.

## Files
- **assets/mobile (97):**
  - app-icon-1024.png and app-icon.webp
  - splash, onboarding, onboard-1..3, matchmaking, radar, vs
  - crown, ko-burst, win-trophy, ko-skull, draw-handshake, confetti
  - 20 avatar-*
  - crest-* (9), tile-* (5), badge-* (6), sticker-* (8), medal-1..3, rank-bronze…rank-legend (6, old tiers)
  - rank-1..10: the 10 degen tiers, 1024×1024 transparent, no words (the app shows the names): 1 Exit Liquidity, 2 Paper Hands, 3 Bagholder, 4 Dip Buyer, 5 Ape, 6 Degen, 7 Diamond Hands, 8 Chad, 9 Whale, 10 The House
  - empty-* (8), banner-* (5), profile-banner
- **assets/desktop:** hero-home (2400×600), rail-live, sidebar-battle.
- **assets/web:**
  - scenes: hero-scene, faceoff, arena, og
  - objects: swords, ko-coin, trophy, shield, stopwatch, market-cube, pencil-line, flag
  - landing extras: hero-duo (2000×1400), phone-hand (1400×1800; blank screen at 31.14% / 8.67% / 44.5% × 62.56%),
    coins-pile and clan-banner (1600×1000)
- **assets/brand:** the wordmark (made in code from Archivo, SIL OFL).

## Earlier, replaced rounds
Chrome, smoked glass, glossy test, duel light, bold sticker (two runs). Their chats are in git history of this file.
