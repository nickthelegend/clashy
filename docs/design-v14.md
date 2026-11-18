# Clashy design v14: look like the trading apps people already use

Nov 18. Nick compared Clashy with OKX Wallet, Phantom, Coinbase and Robinhood and asked why ours looked worse. It looked
like a mobile game: many colours, 3D clay art everywhere, oversized type and buttons, cards inside cards, explanations
on every screen. v14 keeps the game for game moments and makes every other screen read like a wallet or brokerage.

Reference implementations (read these first):

- `app/src/app/(tabs)/index.tsx` (Home): one balance, a round actions row, a watchlist, then the feed.
- `app/src/ui/watchlist.tsx`: `RoundAction`, `ActionRow`, `MarketRow` (the canonical list row).
- `app/src/app/(tabs)/arena.tsx` (Play): one featured card, then flat `GameRow` lists, ranked rows.
- `app/src/app/onchain.tsx` lobby + `ModeRow` in `app/src/ui/clash.tsx`: a picker, segmented controls, one summary
  card, one primary button.

## Rules

1. **Colour.** Black, white, grey and one accent.
   - **Tokens only.** Use `C.*` from `ui/tokens.ts`.
   - **Buttons.** Primary is `C.brand` with `C.onBrand` text; secondary is `C.s2` with `C.ink` text.
   - **Green and red** (`C.up` / `C.down`) are for numbers, profit and loss, and the Long/Short or Buy/Sell trade
     buttons only.
   - **Pink and gold.** `C.opp` (pink) and gold/yellow appear only inside a live game: the rival's marker, a running
     clash board, a royale table in play. They never go on a call-to-action, card, header, tile or badge outside that.
   - **Hand-written surface hexes.** Replace `'#15151B'`, `'#111116'`, `'#0E0E12'`, `'#121216'`, `'#141419'`,
     `'#17171D'`, `'#1A1406'` and similar:
     - card surfaces → `C.card`
     - chips and icon buttons → `C.s2`
     - pressed state → `C.s1`
     - backgrounds → `C.bg`
2. **Type.** Use the `Txt` variants: `title` 24 (one per screen), `h2` 17 (section heads), `label` 15 (row titles),
   `body` 15, `small` 13 (sub-lines, grey).
   - **The one big number.** A screen may have one, as `Money` at size 40 (a tab's balance) or 34 (a detail page).
   - **Other big type.** Delete other custom `fontSize` ≥ 22. In-game moments keep theirs: a countdown, a result
     ("You won"), a live price inside a running clash.
   - **Weights.** Prefer `FONT.semi` / `FONT.medium` over `FONT.display` / `FONT.displayB`.
3. **Art.** No `ClayLoop` and no clay `ART.*` illustrations in headers, cards, tiles, rows or buttons.
   - **Instead:** icons from `ui/icons.tsx` in a 44 px `C.s2` circle, coin and stock logos (`ART.logoSOL/BTC/ETH`,
     `STOCK_ART[sym]`, `CoinToken`, `MarketLogo`), avatars (`ProfileAvatar`), and squad crests (identity, ≤ 48 px).
   - **Allowed places for clay:** empty states (through `Pending`, which draws it at 64 px), a win/lose result
     moment, and the welcome/onboarding slides.
4. **Layout.** Lists are rows on black, like `MarketRow`: `paddingVertical` 10, `gap` 12, a 36–44 px leading
   logo/icon/avatar, a `label` over a `small`, and the value right-aligned (`num`) over its change.
   - **Cards.** At most one level of card (`C.card`, radius 18, padding 12–16) for a summary, a chart panel or a
     grouped form.
   - **Never:** cards inside cards, borders or outlines, glow shadows, gradient blobs, or hero banners.
   - **Grids.** Stat tiles in a row are fine (`C.card`, radius 14–16, `small` label over `num` value).
5. **Buttons.** Use `Btn` (now pill-shaped). Primary height is 48–54 with one primary per screen. Chips and segmented
   controls: the selected item is `C.ink` with black text, or `C.s2`; the track is `C.card`.
6. **Copy.** Show data, don't explain.
   - At most one short `small` line under a section, no paragraphs. Rules and fine print go in one dim 12 px line at
     the bottom of the screen, or are removed when another screen (Help) already says it.
   - Never remove honesty labels: "Paper money", "Practice", "Setup required", error lines (`ErrorLine`), units,
     test-network notes, "Live from …".
7. **Don't touch** logic, data reads, chain calls, routes, state, or numbers. Don't change the fonts (the `FONT`
   tokens) or the bottom tab bar. Keep `accessibilityRole` / `accessibilityLabel` and 44 px tap targets. Keep
   animations subtle (`FadeInDown` 300 ms, press scale 0.97–0.985).
8. **Phone width.** Every screen must fit 375 px with no horizontal overflow and no clipped text: use `lines={1}`
   plus `flexShrink: 1`, and shorten copy instead of truncating mid-word.
