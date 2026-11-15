# Asset sources

Every image here was generated with ChatGPT's image model on chatgpt.com (Nick's account) on Nov 15, 2026, in the
**bold sticker** style (`docs/ART-3D.md`). No reference images were uploaded.

**Conversations (current set):**
- https://chatgpt.com/c/6af9add3-fd08-83ee-9f7b-5b0e41a369a6 (most of the set)
- https://chatgpt.com/c/6af9b750-9534-83e8-9d0b-9d76b3ec87a5 (second tab: splash, onboarding, matchmaking, web scenes and objects, medals, profile banner)

The six-style comparison it was picked from: https://chatgpt.com/c/6af9a8ca-2eb4-83ec-ab52-f71f13369f52

Style line appended to every prompt:

> bold flat sticker illustration like a premium sticker pack. Thick dark navy outline (#14143A) around every shape,
> flat cel-shaded colour with exactly one hard shadow tone and one small white highlight, and a thick clean white
> sticker border around the whole design. Palette: indigo #5B6CFF, hot pink #F0468C, gold #FFC83D for rewards,
> white, and the dark navy outline. Chunky, readable at 32 pixels, punchy, original design (not from any existing
> game or brand). Transparent background, the white sticker border is the outer edge. No text, no letters, no numbers,
> no logos.

Chat reaction stickers with words used the same line but allowed the one word, spelled out letter by letter.
Post-processing: five avatars came back with a painted checkerboard and the KO burst on black; a script flood-filled
the painted background away and redrew the white border, so every sticker has real alpha.

## Files
- **Website (`assets/web/`):** hero-scene, faceoff, arena, og (scenes on black); swords, ko-coin, trophy, shield,
  stopwatch, market-cube, pencil-line, flag (stickers).
- **App (`assets/mobile/`):** app-icon-1024.png + app-icon.webp; splash, onboarding (1024×1536); matchmaking; crown;
  ko-burst; avatar-{racer,hood,bot,gladiator,cat,shark,bull,ghost}; crest-{moon,bolt,flame,star,skull,wolf,crown,rocket,create};
  tile-{duel,line,war,royale,bounty}; badge-{top10,streak,500,captain,first-ko,giant-slayer};
  sticker-{ko,gg,rekt,lfg,fade-me,moon,crying,crown}; medal-{1,2,3}; empty-{duels,clan,notifications,offline};
  profile-banner (1536×1024 pattern).
- **Brand (`assets/brand/`):** the wordmark (made in code from Archivo, SIL OFL; not generated).

## Earlier, rejected rounds (kept for the record)
Chrome set https://chatgpt.com/c/6af97944-c64c-83e8-a67b-036543392d5a · smoked-glass test
https://chatgpt.com/c/6af982b9-cd5c-83ee-b5b6-aa82eb081677 · glossy test https://chatgpt.com/c/6af9837b-ac04-83ee-b836-21882d34f2c8 ·
duel light https://chatgpt.com/c/6af987b0-fb6c-83ee-a939-366aab2c11ce

## Second sticker run (same style, Nov 15)
Conversations: https://chatgpt.com/c/6af9bd77-3354-83e8-b93b-f029440a4ac1 and
https://chatgpt.com/c/6af9bd9f-3b18-83ec-933f-5d5f7807e73f (two tabs in parallel).

- **Mode banners (`assets/mobile/banner-{duel,line,war,royale,bounty}.webp`):** busy sticker scenes on black.
  ChatGPT returned them at 16:9; they were resized to 1600×900.
- **Rank tiers:** `rank-{bronze,silver,gold,platinum,diamond,legend}`.
- **Onboarding slides:** `onboard-{1,2,3}` (1024×1536, on black): duel anyone, any coin, clan wars.
- **Matchmaking:** `radar`, `vs` (contains the word VS).
- **Results:** `win-trophy`, `ko-skull` (friendly, dizzy), `draw-handshake`, `confetti`.
- **Empty states:** `empty-{chats,leaderboard,profile,search}`.
- **Avatars:** 12 more, 20 in total: `avatar-{nova,beanie,punk,panda,alien,monkey,wizard,dog,cyborg,dragon,skater,tiger}`.
- **Desktop (`assets/desktop/`):**
  - `hero-home` (composed as one row, cropped to 4:1, 2400×600)
  - `rail-live` (contains the word LIVE)
  - `sidebar-battle`

Ten of these came back with a painted checkerboard and were cleaned to real alpha the same way as the first run.
