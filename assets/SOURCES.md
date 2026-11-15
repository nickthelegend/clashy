# Asset sources

Every image here was generated with ChatGPT's image model on chatgpt.com (Nick's account) on Nov 15, 2026, in the
"duel light" style (`docs/ART-3D.md`). No reference images were uploaded. This set replaces two rejected rounds
(chrome + saturated enamel, then a navy smoked-glass test).

**Conversation (the full set):** https://chatgpt.com/c/6af987b0-fb6c-83ee-a939-366aab2c11ce
(the knockout coin is the style test from the start of that chat).

Earlier, rejected rounds, kept for the record: https://chatgpt.com/c/6af97944-c64c-83e8-a67b-036543392d5a (chrome set),
https://chatgpt.com/c/6af982b9-cd5c-83ee-b5b6-aa82eb081677 (smoked-glass test),
https://chatgpt.com/c/6af9837b-ac04-83ee-b836-21882d34f2c8 (glossy game-art test).

Each prompt was `Create an image: <subject>. <size>.` followed by this style line:

> Art direction 'duel light': a cinematic high-end render where the subject is lit from two sides at once by strong
> saturated coloured rim lights, a vivid indigo-blue #5B6CFF light from the left and a vivid hot pink #F0468C light
> from the right, so the left edges glow indigo and the right edges glow pink, meeting on the object, with deep black
> shadows in between. Materials: glossy black obsidian glass and dark satin metal, sharp faceted geometry, crisp
> specular edges, a faint coloured haze. Photoreal, premium, dramatic. No chrome rainbow, no cartoon, no thick
> outlines, no sparkles. Background is pure black #000000 (not navy, not blue), no visible floor. No text, no letters,
> no numbers, no logos.

The app icon prompt used its own line (full-bleed square, black background, crossed swords, readable at small size).
Raw PNGs (1254 px squares, 1536×1024 scenes, 1024×1536 portraits) were converted with `scripts/convert-art.sh`.
Everything sits on pure black, which is the app and site background. On grey surfaces the site uses
`mix-blend-mode: screen`.

## Brand (`assets/brand/`)

| File | What |
|---|---|
| `wordmark.svg`, `wordmark-black.svg`, `wordmark@2x.png` | "clashy" in Archivo black italic at 125% width (SIL OFL), outlined to paths and sliced once; the halves are knocked apart and the cut glows indigo into pink. Made in code, not generated. |

## Website (`assets/web/`)

| File | Subject |
|---|---|
| `hero-scene.webp` | Wide hero: two obsidian swords crossed, an indigo haze on the left and a pink haze on the right, a spark at the cross |
| `faceoff.webp` | Wide: two hooded obsidian figures face off across a glowing price line (closing CTA backdrop) |
| `arena.webp` | Wide: a circular obsidian arena platform with a price line above it (Arena section backdrop) |
| `og.webp` | Social card: crossed swords on the left third, empty black on the right |
| `swords.webp` | Crossed swords, square |
| `ko-coin.webp` | Knockout coin: faceted obsidian face, engraved swords, a cut across the face |
| `trophy.webp`, `shield.webp`, `stopwatch.webp`, `market-cube.webp`, `pencil-line.webp`, `flag.webp` | Trophy, clan shield, stopwatch, chart cube, stylus drawing a line, war banner |

## Mobile app (`assets/mobile/`)

| File | Subject |
|---|---|
| `app-icon-1024.png`, `app-icon.webp` | App icon: crossed obsidian swords on black, indigo and pink edges |
| `splash.webp` | Splash (1024×1536): small crossed swords in the centre of black |
| `onboarding.webp` | Onboarding (1024×1536): two obsidian pawns face off on a glowing line |
| `matchmaking.webp` | Matchmaking: a scanning ring between an indigo pawn and a pink pawn |
| `avatar-{racer,hood,bot,gladiator,cat,shark,bull,ghost}.webp` | 8 original trader avatars in obsidian, each in a ring that glows indigo into pink |
| `crest-{moon,bolt,flame,star}.webp` | 4 clan crests |
| `crown.webp` | Win-screen crown |
| `ko-burst.webp` | Knockout burst: obsidian shards flying from a white-hot core |
| `tile-{duel,line,war}.webp` | Mode tiles: Knockout Duel, Draw the Line, Clan War |
| `empty-{duels,clan,notifications,offline}.webp` | Empty states |
| `badge-{top10,streak,500,captain}.webp` | Badges: season top 10, win streak, veteran of many duels, clan captain (no numbers in the art; the app labels them) |

The website uses resized copies in `web/public/art/` (objects at 480 px, hero swords at 1100 px, scenes at 1600 px,
avatars at 192 px, crests and badges at 200 px, `m-*` phone art at 640 px, a 1200×630 OG JPEG and 64/128 px icons).
