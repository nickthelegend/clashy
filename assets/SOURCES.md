# Asset sources

Every image here was generated with ChatGPT's image model on chatgpt.com (Nick's account), Nov 15, 2026, in one
conversation so the set stays consistent:

**Conversation:** https://chatgpt.com/c/6af97944-c64c-83e8-a67b-036543392d5a

No reference images were uploaded. Each prompt was `Create an image: <subject>` followed by one of two shared style
lines (see `docs/ART-3D.md`):

- **Object line** (transparent background): premium 3D render, polished mirror chrome with deep glossy indigo `#5B6CFF`
  enamel and hot pink `#F0468C` accents, soft studio lighting, cool lavender `#ECEDFB` rim light, crisp reflections of
  a dark navy `#07071A` room, clean sharp bevels, collectible esports-trophy quality, centred single object,
  transparent background (no background, no ground shadow), no text, no letters, no numbers, no logos; clean alpha
  edges, no sparkles or particles.
- **Scene line** (opaque): the same material line, on a seamless night-navy `#07071A` studio sweep with a soft
  indigo-to-pink horizon glow.

The raw PNGs (1254 px objects, 1536×1024 OG, 1024×1536 portraits) were converted to WebP with
`scripts/convert-art.sh`; the app icon is also kept as a 1024 px PNG.

## Website (`assets/web/`)

| File | Subject |
|---|---|
| `swords.webp` | Hero: two futuristic chrome swords crossed in an X, one indigo hilt, one pink hilt |
| `trophy.webp` | Duel trophy cup: chrome, indigo band, pink base ring, embossed crossed swords |
| `shield.webp` | Clan shield crest: chrome heater shield, indigo face, pink inner border, crossed swords |
| `ko-coin.webp` | Knockout coin: chrome rim, indigo face, crossed swords, a pink knockout line slicing across |
| `stopwatch.webp` | Stopwatch for 60 s rounds: chrome case, indigo bezel, pink hand and countdown arc |
| `market-cube.webp` | Market cube: indigo enamel cube with chrome rising chart lines, pink edge |
| `pencil-line.webp` | Draw the Line: a chrome and indigo stylus drawing a pink-to-indigo price line |
| `flag.webp` | Clan war flag: chrome pole, indigo pennant with a pink stripe and crossed swords |
| `og.webp` | Social card (1536×1024 scene): crossed swords on the left third, empty navy for a headline |

## Mobile app (`assets/mobile/`)

| File | Subject |
|---|---|
| `app-icon-1024.png`, `app-icon.webp` | App icon: crossed chrome swords on a full-bleed indigo gradient, one pink hilt |
| `splash.webp` | Splash (1024×1536 scene): crossed swords with an indigo glow over a faint grid floor |
| `onboarding.webp` | Onboarding hero (1024×1536 scene): an indigo and a pink duel piece facing off on a glowing chart line |
| `avatar-racer.webp` | Trader in a racing helmet with an indigo visor |
| `avatar-hood.webp` | Hooded trader, face in shadow, glowing indigo eyes |
| `avatar-bot.webp` | Rounded chrome robot with an indigo screen face and a pink LED smile |
| `avatar-gladiator.webp` | Futuristic visored helm with a pink crest fin |
| `avatar-cat.webp` | Chrome cat with pink ears and indigo shades |
| `avatar-shark.webp` | Grinning indigo shark with a chrome jaw and chain (regenerated once: the first had a glow base under the frame) |
| `avatar-bull.webp` | Indigo bull with chrome horns and a pink nose ring |
| `avatar-ghost.webp` | Lavender-white ghost with a pink-glowing chrome visor |
| `crest-moon.webp` | Clan crest: round chrome medallion, indigo face, crescent moon and star |
| `crest-bolt.webp` | Clan crest: hexagonal chrome badge, pink face, lightning bolt |
| `crest-flame.webp` | Clan crest: pennant badge, indigo face, chrome flame with a pink core |
| `crest-star.webp` | Clan crest: rounded diamond badge, split indigo/pink face, chrome star |
| `crown.webp` | Win-screen crown: chrome, indigo gem tips, pink band |
| `tile-duel.webp` | Mode tile, Knockout Duel (scene): two swords clashing, indigo vs pink light, a knockout line |
| `tile-line.webp` | Mode tile, Draw the Line (scene): a stylus drawing a pink line beside an indigo price line |
| `tile-war.webp` | Mode tile, Clan War (scene): an indigo and a pink pennant facing off across a glowing divide |
| `empty-duels.webp` | Empty state "no duels yet": a sword resting in an indigo stand with two visor-slit eyes |
| `empty-clan.webp` | Empty state "no clan yet": a flagpole with a folded pink flag in an indigo base with two visor-slit eyes |

The website uses resized copies of some of these in `web/public/art/` (avatars at 192 px, crests at 160 px, objects
at 420 px, the hero swords at 1120 px, a 1200×630 OG JPEG and the 64/128 px icons).
