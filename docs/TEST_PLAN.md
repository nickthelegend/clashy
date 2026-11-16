# Clashy end-to-end test plan

Every item is run in a real browser against the **production web build** (`npx expo export -p web`, served by
`app/scripts/serve-web.mjs` on :8099) on the local MagicBlock stack (Solana :8999, rollup :7799, MagicBlock VRF
oracle), with the price crank and the sponsor relay running. The player is Nick's Privy wallet (email sign-in).
The other players are the **friends** in `chain/scripts/friends.ts`: real wallets holding only USDC (0 SOL) that sign
real transactions through the same program and relay. Nothing is mocked.

**Pass** = the exact expected result below, **and** no console error, **and** no failed network request (4xx/5xx,
except a relay 422 that the screen shows as a readable error on purpose). Checked at 1440 px (Chrome) and 390 px.

Status: `PASS` / `FAIL → fixed → PASS` / `UNTESTED (reason)`.

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
