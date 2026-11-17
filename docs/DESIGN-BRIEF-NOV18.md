# Clashy UI brief (Nov 18): beat pump.fun and fomo, with the blip finish

Nick's bar: "cool and sexy", better than pump.fun and fomo.family. Every screen must hold up next to them.

## What the leaders do (copy the structure, never the brand)
From the App Store screenshots of fomo and pump.fun:
- **Money is the hero.**
  - A huge number in a neutral grotesk, with the cents dimmed: `Money` in `ui/kit.tsx`.
  - Today's change sits under it in green or red.
  - A pill action (Deposit / Add) on the right.
- **Near-black screens.** Almost no borders, hairline row dividers, sentence case.
- **Rows.**
  - A square avatar or token art on the left.
  - Name with a small coloured tag.
  - Value right-aligned, with the % change in a coloured pill.
- **Profile = track record.**
  - Avatar, name, one-line bio, Following / Followers style counts.
  - Then a big portfolio value with a P&L line chart and range chips (24h / 7d / 30d / All).
  - Then tabs (Open / Closed / Replies / Activity) and position rows.
- **fomo Clans.**
  - A ranked list: crest, name, member count, combined P&L in green, right-aligned.
  - Your rank pinned on top.
  - A horizontal carousel of top clans.
- **Success.** A big green check, the amount in huge type ("Withdrew $300.00"), and a full-width green button.

## The blip finish (Nick's Dribbble reference; do not copy its brand or art)
- **Squads like Discord.**
  - A left rail of squad icons with unread badges, plus "+" and a compass.
  - A banner header with the squad name, "N online · M members" and a level with an XP bar.
  - Three quick-action tiles (Invite / Events / Cup).
  - Channel groups: CHALLENGES (`#daily-challenge` "3 NEW", `#weekly-cup` LIVE), VOICE/LOBBY (members "playing X"), CHAT (`#general`).
- **Chat.**
  - Avatar, name, time; embedded cards with Accept / Replay.
  - System lines ("Kai accepted Maya's challenge"), reactions, "typing…".
- **Profile.**
  - A banner across the top with a big avatar overlapping it.
  - Name plus small badge chips, then a big "Edit profile" pill and a "+" next to it.
  - Three stats (games played, cup wins, day streak).
  - Tabs (Played / Made / Trophies) over a 2-column grid of cards with art.
- **Type.**
  - Chunky italic display (`F.display` = Archivo Black Italic, `F.displayB` = ExtraBold Italic) for headlines and game moments: WEEKLY CUP, YOU WON, CLASH, NEW PERSONAL BEST.
  - Inter for everything else.
- **Colour.**
  - Indigo `C.brand` #5B6CFF (you, primary), pink `C.opp` #F0468C (rival, LIVE), gold #FFC94A, mint `C.up`.
  - Black background, cards `#15151B` with a `#23232B` hairline.
  - Lighter cards only where the reference uses them.

## Rules
- **Real data only.** Read everything from the chain with the helpers in `src/chain/social.ts`, `src/chain/reads.ts` and `src/chain/client.ts`. Nothing invented; designed empty, loading and error states.
- **Quick actions are bottom drawers.** Use `Sheet` / `SheetTile` from `src/ui/sheet.tsx`, never alerts.
- **Our art only.**
  - Clay images in `ART` (`src/ui/kit.tsx`); clay loops `ClayLoop name=…` (`src/ui/clay.tsx`); Lottie `Lottie name=coin|heart|confetti|flame`.
  - Avatars: `ProfileAvatar` (`src/ui/feed.tsx`); stock art: `STOCK_ART`; crests: `CRESTS`.
- **Fit 390 px wide.** No overflow and no truncated button labels. Tap targets of 44 px or more.
- **Program writes** go through the `useChain()` hook (`progs.base` / `progs.er`, `onBase` / `onEr`); the sponsor relay pays.
