# Clashy art kit: "bold sticker" (v5, final)

Picked Nov 15, 2026 from six style boards (style 4; Nick asked grokbot new to decide between clay and sticker). It
replaces the "duel light" set, which was too dark to read at app size. Every asset is a flat, cel-shaded sticker
that reads at 32 px.

- **Shape:** chunky, slightly toy-like original designs; one subject per sticker.
- **Line:** a thick dark navy outline `#14143A` around every shape.
- **Colour:** flat fills with exactly one hard shadow tone and one small white highlight. Indigo `#5B6CFF` (you),
  hot pink `#F0468C` (your rival), gold `#FFC83D` for rewards, white.
- **Border:** a thick clean white sticker border is the outer edge of every sticker.
- **Background:** real alpha (transparent PNG/WebP). Scenes, the splash, onboarding and the profile banner sit on black
  or navy. `scripts/convert-art.sh` converts. ChatGPT sometimes paints a fake checkerboard or black behind a sticker;
  `clean.py` in the generation run strips it and redraws the white border (see SOURCES.md).
- **Text:** none, except the chat reaction stickers (KO!, GG, REKT, LFG, FADE ME), each checked for spelling.
- **Banned:** real logos and brands, Clash of Clans or any other game's characters, fomo.family's art.

**Wordmark (final, option A "Slice", picked Nov 15; alternatives in `assets/brand/options/`):**
`web/src/components/Wordmark.tsx` and `assets/brand/wordmark*.svg`.
