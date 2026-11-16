# Clashy end-to-end test plan

Every item is run in a real browser against the **production web build** (`npx expo export -p web`, served by
`app/scripts/serve-web.mjs` on :8099) on the local MagicBlock stack (Solana :8999, rollup :7799, MagicBlock VRF
oracle), with the price crank and the sponsor relay running. The player is Nick's Privy wallet (email sign-in).
The other players are the **friends** in `chain/scripts/friends.ts`: real wallets holding only USDC (0 SOL) that sign
real transactions through the same program and relay. Nothing is mocked.

**Pass** = the exact expected result below, **and** no console error, **and** no failed network request (4xx/5xx,
except a relay 422 that the screen shows as a readable error on purpose). Checked at 1440 px (Chrome) and 390 px.

Status: `PASS` / `FAIL → fixed → PASS` / `UNTESTED (reason)`.

## Results (Nov 16, 2026, production build, local MagicBlock stack, Privy wallet `GRtL…b8Zq` + 7 friends)

Run in Claude in Chrome (signed out, 1568 px desktop and a 606 px tab) and in the app's browser pane as Nick's signed-in
Privy wallet (Chrome's own Privy sign-in needs Nick's email code). Every item was re-run after its fix; the last pass
over all items ran on the final build. Console: zero errors on every route and every flow on the final build (the only
messages are Privy's two debug lines). Network: every request 2xx; the relay's one deliberate 422 path (a transaction
the chain refuses) no longer occurs in normal play.

| # | Status | What was wrong → what was fixed |
|---|---|---|
| A1 | PASS | – |
| A2 | FAIL → fixed → PASS | "Twelve ways to win", weekly-war and chat copy described things that do not exist → slides now say USDC, email sign-in, no SOL, clan chests and wars |
| A3 | PASS | – |
| A4 | FAIL → fixed → PASS | Right rail had a hardcoded "0 live", a fake "Message your clan" input and "once duels are on chain" → live duel/challenge/Royale/clan counts from the program |
| A5 | FAIL → fixed → PASS | `/discover`, `/chat/[id]`, `/clan/[id]` unreachable; war preview orphaned → Discover linked from Home; dead routes removed |
| A6 | FAIL → fixed → PASS | Skirmish and the practice duel overflowed to 758 px at 390 px (the VS sticker starts at 3.2× scale) → full-screen effects clip; all 25 routes measure 375/390 |
| B1 | PASS | – |
| B2 | PASS | Privy modal "Sign in to Clashy" (email, Google) verified in Chrome; Nick's own sign-in earlier today created wallet `GRtL…b8Zq` and its player account |
| B3 | PASS | Faucet 4.07 → 104.07 USDC; button disappears; Open enabled |
| B4 | FAIL → fixed → PASS | Refunds were labelled "Paid out by a game" → "Back from a game"; history matches every on-chain stake, payout, refund and send |
| B5 | PASS | Bad address / 0 / over balance errors exact; 3 and 70 USDC sends landed; sender SOL 0 |
| B6 | PASS | Privy's "Export wallet" opens in Privy's frame (auth.privy.io); the key never enters the app |
| B7 | UNTESTED | Signing back in needs Nick's email code (Privy identity provider); signing out was not run so his session stays usable |
| B8 | FAIL → fixed → PASS | Relay down showed empty boards and a developer command → readable "payment relay is offline" message, boards still read the chain, recovers on its own in ~5 s |
| C1–C5 | PASS (and re-run) | Win (+9.70, balance exact), loss (−5.00), dead heat (stake back) all verified |
| C2–C3 | FAIL → fixed → PASS | Start on the rollup was sent before the rollup had the delegated copy (two 422s per duel) → "on the rollup" now means the rollup copy is program-owned; zero errors |
| C6 | FAIL → fixed → PASS | Signed out, the board said "No open duels" while Mira's challenge was open → board reads the chain without a wallet; joined Mira's challenge and won |
| C7 | PASS | Cancel refunds the full 5 USDC |
| C8 | PASS | Below 5 USDC, Open is disabled and the faucet is offered |
| C9 | FAIL → fixed → PASS | Profile showed placeholders and fake "Gold III" → on-chain record (2–0, Elo 1031, 50 RP, best streak 2, #1 of 7), settled-duel history, badges earned only from chain facts |
| C+ | FAIL → fixed → PASS | A duel whose creator leaves was stuck (only the creator could roll VRF / delegate / start) → the joiner's device drives after 8 s; after the 10-min setup window a refund button calls the program's abort (unlock waits 3 s for the chain clock: the first try was refused with NotExpired) |
| D1–D5 | PASS (and re-run) | Hosted 3/4 seats with Ash and Bo, VRF coin, rounds on the rollup; knocked out (balance unchanged) and won as last survivor (+5.82) |
| D5 | FAIL → fixed → PASS | "Last one standing." shown even with several survivors; no survivor names → exact survivor count, names and payout |
| D6 | FAIL → fixed → PASS | Lobby hidden when signed out; full lobbies showed "Join" → lobby reads the chain; "Full"; lobby age shown |
| D7 | PASS | Cancel with 3 players refunds every entry |
| E1–E7 | PASS | Name rules, deposit (share 67%), Lux joins and votes, early pass, execute/close at the Solana price (P&L to the cent), war lost −0.58% vs 0.00%, tie refunded, cash-out exactly pro rata (16.67) |
| E1 | FAIL → fixed → PASS | Clan list empty when signed out ("No clans yet") → reads the chain without a wallet |
| E5 | FAIL → fixed → PASS | Prices shown from the rollup feed but trades executed at the Solana feed → shows the Solana price |
| E8 | PASS | At war: +5/+20/Cash out disabled with "deposits and cash-outs wait until it settles" |
| F1 | FAIL → fixed → PASS | Fake story bubble, dead bell, Post, "posting opens at kickoff" → live-now stories, open challenges (Join) and results from the chain, balance chip |
| F2 | FAIL → fixed → PASS | "Setup required: clans" with a disabled Create → real clans, your clan, Create/Join to the clan screen |
| F3 | FAIL → fixed → PASS | Dashed placeholder podium, dead range buttons → on-chain ranking |
| F4 | FAIL → fixed → PASS | (see C9) |
| F5 | FAIL → fixed → PASS | Fake 700 ms skeleton → honest "not built yet" |
| F6 | FAIL → fixed → PASS | Real-USDC modes labelled "Practice", "real duels open at kickoff", Clan war "Soon", stake chips on modes that ignore them → USDC/Practice/Preview badges, stakes only where used, Clan war opens the real war |
| F7–F8 | FAIL → fixed → PASS | Practice screens titled like the real duel; clash claimed "your opponent picks theirs" and "Real clashes … settle on Solana"; "until real duels open" → practice labels and true copy |
| F9 | FAIL → fixed → PASS | Daily Cup retry by leaving mid-run → attempt recorded at start; used cup shows only "Today's run is done" |
| F10 | FAIL → fixed → PASS | Diamond "+-2.8%"; Skirmish round with no price never ended; feed errors silent in Skirmish/Snipe/Streak; 28 "navigator.vibrate blocked" console errors → fixed sign, waits for a price, feed errors shown, vibrate only after a tap |
| F11 | FAIL → fixed → PASS | Reset wiped without asking → two-tap confirm |
| F12 | FAIL → fixed → PASS | Bounty board, sort chips and Post did nothing; Ranked claimed a VRF ranked queue → Bounty is an honest preview; "Surprise me" practice roll |
| F13 | FAIL → fixed → PASS | Discover unreachable, market cap in the price column; coin page "No duels on this coin yet" while SOL had on-chain duels → linked, price column, real top duelists |

**Zero mocks or stubs remain in the tested surface:** every number on the USDC screens, Home, Clans, Leaderboard,
Profile and the rail is read from the Clashy program or the token accounts; practice games use live Coinbase /
DexScreener prices and say "no money moves"; features that do not exist (chat, bounties) say so.

## A. Shell and navigation

| # | Item | Correct means |
|---|---|---|
| A1 | First open | `/` sends a first-time visitor to `/welcome`: 3 slides, Next/Skip, Get started → Home; never shown again |
| A2 | Welcome copy | Says what the app really is: sign in with email, play in USDC, on-chain duels/Royales/clans; counts match the Arena |
| A3 | Tab bar (phone) / sidebar (desktop) | Home, Chats, Arena, Clans, Profile all open; Wallet item opens `/wallet`; active tab highlighted |
| A4 | Right rail (desktop) | Only real data (no hardcoded "0 live", no fake input); every button navigates |
| A5 | Every route reachable by tapping | No route reachable only by typing a URL |
| A6 | 390 px layout | No horizontal overflow (`scrollWidth <= innerWidth`) and no clipped text on any route |

## B. Wallet and sign-in (Privy)

| # | Item | Correct means |
|---|---|---|
| B1 | Signed out | On-chain screens show "Sign in to play for USDC" + Sign in; Profile shows Sign in |
| B2 | Sign in | Privy modal "Sign in to Clashy" (email, Google); after the code, the card shows `Privy · <email>`, address, balance |
| B3 | Get started | "Get 100 test USDC and start" → balance 100.00 USDC, player account created (a sponsored, Privy-signed tx in the strip), wallet SOL = 0 |
| B4 | Wallet screen | Balance, full address + Copy (copies), Test USDC, Send, Explorer, Export key, Sign out; activity rows from the chain |
| B5 | Send USDC | Bad address → "That is not a Solana address"; 0 → "Enter an amount above 0"; too much → "You have X USDC"; valid → balance drops, "Sent −X USDC" row, sender SOL still 0 |
| B6 | Export key | Opens Privy's export window (key shown inside Privy's frame, never in the app) |
| B7 | Sign out / in again | Sign out returns to the signed-out card; signing in again restores the same wallet and balance |
| B8 | Relay down | Every on-chain screen shows a readable "Clashy's payment relay is offline" error, never an empty board |

## C. On-chain duel (`/onchain`) with friends Kai and Mira

| # | Item | Correct means |
|---|---|---|
| C1 | Open a duel | "Open a duel · 5 USDC" → balance −5, "Waiting for an opponent", escrow tx in the strip |
| C2 | Friend joins | Kai joins within seconds; screen shows MagicBlock VRF rolling, then "<COIN> rolled · Rolled by MagicBlock VRF" |
| C3 | Sealed pick | Long/Short 50× → "Locked"; reveal, delegate, start on the rollup happen by themselves |
| C4 | Live on the rollup | Both P&Ls update every check (~2 s), "Check duel ×N" folds, latency shown |
| C5 | Settle | At the bell: committed to Solana and settled; result shows exact USDC won/lost/refunded; balance matches (win = +9.70 net of stake) |
| C6 | Join from the board | Mira's challenge listed with her stake; Join → duel runs to the end with Mira as creator |
| C7 | Cancel | Own unmatched duel → "Cancel and refund" → full 5 USDC back, no rake |
| C8 | Errors | Not enough USDC → Open disabled with the reason; a failed tx shows the program's message |
| C9 | Profile after duels | Profile W–L, Elo and RP match the on-chain player account |

## D. On-chain Royale (`/onchain-royale`) with friends Ash, Bo, Sol

| # | Item | Correct means |
|---|---|---|
| D1 | Host | Seats/lives chips; "Host and join · 2 USDC" → create + join + VRF request; lobby shows it; coin rolled by VRF |
| D2 | Friends join | Ash and Bo join; seats show 3/N; pot = 2 × players |
| D3 | Start | "Start on the rollup" (host) → round 1 live with the coin price, countdown |
| D4 | Rounds | Up/Down calls land on the rollup; wrong or missing calls lose a heart; every player's state is shown |
| D5 | Finish | Survivors split pot − 3 %; the result says who survived (not "last one standing" when several do); balances match |
| D6 | Join a friend's Royale | Sol's lobby listed → Join → play to the end as a guest |
| D7 | Cancel | Host cancels an unstarted lobby → every entry refunded |

## E. On-chain clan (`/onchain-clan`) with friends Lux and Rex

| # | Item | Correct means |
|---|---|---|
| E1 | Create | Name + crest → clan on chain, you are captain; name rules enforced (empty, >24 bytes, taken) |
| E2 | Deposit | +5 / +20 → chest and your shares grow; share % right |
| E3 | Friend joins | Lux joins your clan and deposits 10; member count 2, your share recomputed |
| E4 | Propose + vote | Proposal listed; your vote + Lux's yes; passes early when yes > half of shares |
| E5 | Execute + close | Captain executes at the oracle price → position with live P&L; close → P&L booked to the score |
| E6 | War | Declare on Rex's clan → Rex accepts → live returns both sides → window over → settle → winner's chest gets pot − 3 % |
| E7 | Cash out | Shares → USDC pro rata, exactly |
| E8 | Locks | Deposit/cash-out locked at war with the reason shown |

## F. Off-chain screens (practice and social)

| # | Item | Correct means |
|---|---|---|
| F1 | Home | No contradicting "opens at kickoff" copy for things that are live; Connect shows wallet state; every button works |
| F2 | Clans tab | Lists real on-chain clans (members, chest, score) and your own clan; Create/Join go to the on-chain clan screen |
| F3 | Leaderboard | Real on-chain ranking (Elo/RP/W–L from player accounts); no dashed placeholder podium |
| F4 | Profile | On-chain record and on-chain duel history; no "Gold III"/fake badges |
| F5 | Chats | Honest "not live yet" state; no fake skeleton |
| F6 | Arena | Real-money modes labelled "USDC" (not "Practice"); practice modes labelled practice; every mode opens; stake chips only where used |
| F7 | Practice duel (match → live → result) | Live coins load; 60 s race on live prices; result + double or nothing; "no money moved" |
| F8 | Coin clash (amount → live → result) | Copy matches what happens (rival coin) |
| F9 | Draw the line, Daily Cup | Line draws, scores; cup one attempt per day enforced |
| F10 | Diamond, Streak, Snipe, Skirmish, Royale (practice) | Each starts, plays on live prices, ends with a result; feed errors shown; no "+-x%" |
| F11 | Practice clan chest | Propose/vote/execute/close; reset asks first |
| F12 | Clan war preview, Bounty, Ranked | No fake data; copy consistent with live on-chain wars |
| F13 | Discover + Coin page | Reachable; trending from DexScreener; coin page market + chart; duel buttons |

## Untestable here

- Privy on phones (needs a development build with `@privy-io/expo`).
- Real-money (mainnet) USDC; Privy's buy-USDC flow (mainnet only).
- A second human signing in with Privy (friends are real wallets but not Privy logins).
