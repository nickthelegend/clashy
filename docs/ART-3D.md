# Clashy art kit: "duel light"

Clashy's own look (v4, Nov 15 2026; replaces the rejected chrome set). Every image is one subject made of black
obsidian glass and dark satin metal, lit from two sides at once: **indigo `#5B6CFF` from the left (you)** and **hot
pink `#F0468C` from the right (your rival)**. The two colours meet on the subject's edges; everything else is deep
shadow on **pure black `#000000`**, the app and site background (v12 theme). It's the brand idea, you vs them,
turned into lighting.

- **Material:** glossy black obsidian glass, dark satin metal, sharp faceted geometry, crisp specular edges.
- **Light:** strong saturated indigo rim light from the left, hot pink from the right, a faint coloured haze; a
  white-hot spark where two things clash.
- **Palette:** `#000000` background, `#5B6CFF` indigo, `#F0468C` pink. No chrome rainbow, no royal blue, no green.
- **Background:** pure black, never transparent. On dark UI surfaces (`#111113`, `#1C1C1F`) the art is drawn with
  `mix-blend-mode: screen`, so the black disappears and no box shows.
- **Faces:** none, except the avatars, which are original characters in obsidian.
- **Subjects:** crossed swords, a knockout coin, trophy, shield, crown, stopwatch, market cube, stylus and line,
  war banner, crests, badges, face-off and arena scenes.
- **Banned:** text, letters, numbers, logos, real brands, Clash of Clans visuals, fomo.family's photo style.

**Wordmark (final, Nick picked option A "Slice" on Nov 15; the alternatives are in `assets/brand/options/`):** `web/src/components/Wordmark.tsx` and `assets/brand/wordmark*.svg`. "clashy" in Archivo black italic at 125% width (not used by any other
product), sliced once on a shallow diagonal. The halves are knocked apart and the cut glows indigo into pink.

Style line used in every prompt: see `assets/SOURCES.md`.
