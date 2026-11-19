# Clashy art kit: "soft clay" (v7, final)

Picked by Nick on Nov 15, 2026: "use clay dough please". It replaces the bold sticker set (v5), which replaced
"duel light" (v4). Every asset is matte play-dough / plasticine.

- **Form:** soft rounded chunky shapes with a visible thumb-press texture; matte, no gloss.
- **Light:** gentle studio light from the upper left, with a soft contact shadow baked in.
- **Character:** cute but premium, Apple Memoji clay / Headspace polish. The 20 avatars are one character family:
  same head shape, round eyes, rosy cheeks, in an indigo badge with a gold rim.
- **Palette:** indigo `#5B6CFF` (you), hot pink `#F0468C` (your rival), warm gold `#FFC94A`, plus soft cream and white.
- **Never:** outlines, sticker borders, comic halftone.
- **Background:** real alpha for objects and characters. Banners, onboarding, splash, the desktop hero and the web
  scenes sit on pure black.
- **Words:** chat stickers, VS and LIVE are made of clay letters, each spell-checked.
- **Banned:** real logos and brands (coins are generic), any existing game's characters, fomo.family's art.

**Wordmark (final, option A "Slice"; alternatives in `assets/brand/options/`):** `assets/brand/wordmark*.svg`.

**Nav icons (Nov 18):** `assets/art/tab/tab-{home,chats,play,squads,you,wallet}.webp`: a clay house with a pink
pennant, two speech bubbles, crossed swords with a gold star, a gold-rimmed shield with a star, and a gold-rimmed
player medallion, plus a wallet with a gold clasp for the desktop sidebar. The five tab icons were generated as one
ChatGPT sheet so they match (the wallet came from the same chat), then cut into 192 px tiles; the
`-off` copies are desaturated and darkened for unselected tabs. `ui/tab-icons.tsx` cross-fades between the two, and
the same icons appear in the bottom tab bar and the desktop sidebar.

**Sticker packs (Nov 20):** `app/assets/stickers/<pack>/<slot>.webp`, 10 packs of 20 for the chat keyboard (Clashy,
Perps, Solana, Solana DeFi, Solana Apps, MagicBlock, BONK, dogwifhat, Meme Zoo, Supercycle). Same soft clay, with clay
caption letters on a coloured plate. Nick asked for the **real logos** here, so this is the one place the "no real
logos" rule is lifted: each brand pack was generated with the official mark (CoinGecko coin images, the projects' own
site icons) uploaded as a reference next to the Clashy sticker sheet as the style reference. Each pack is two 4×3
ChatGPT sheets (slots 1–24); `src/stickers/spec.json` lists the captions, emoji and tags, and `keep` picks the 20 that
ship. Cut with a blob-per-cell slicer (real alpha, or an edge flood fill when ChatGPT returned a white or painted
checkerboard backdrop), then `python3 -I app/scripts/make-stickers.py <cut dir>` writes 384 px WebP and the catalogue.
