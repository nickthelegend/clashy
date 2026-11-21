# Clashy: the plan to go public (Nov 21, 2026)

Written for Nick by Claude, acting as CEO, CTO, CFO and CMO. Read it at 5 pm; the decisions you have to make are at the
bottom.

## Where we really are

| Area | State |
|---|---|
| App | 150 games, practice trading on real Phoenix and Pacifica prices, chats, squads, tours, profiles. Sign-in with Privy (email or Google, an embedded Solana wallet). Web build works. iOS and Android run through Expo but are not in any store. |
| On-chain | The Anchor program handles escrowed duels, Royale, clans, clan wars, rake and Elo, on MagicBlock Ephemeral Rollups with VRF, USDC only and gasless. It has only ever run on a **local** chain. A devnet deploy needs about 14 devnet SOL (the program is 1.3 MB, so its rent is 6.7 SOL, and the buffer briefly doubles that). The deployer wallet `6XdpT4cYBZBMMNXnxzoRYWMxtQk3FuooB98bAp79nYbe` has 0 SOL. |
| Backend | A Docker stack (relay, crank, social server, web, and Caddy for HTTPS) built to run on one VM with `deploy/up.sh`. Not deployed. |
| Domain | clashy.fun is bought, but it is a parked Hostinger page. Nothing points at our app yet. |
| Hackathon | MagicBlock Solana Blitz v10 started Nov 20 and runs one week, so the deadline is about Nov 27 (not published yet). Prizes are $500 / $250 / $150 / $100 USDC. The submission form asks for a public repo, a demo, a website, and an explorer link that proves **devnet or mainnet** activity. Most of our code was written before Nov 20, and that eligibility risk is yours to call. |
| Money | No real money anywhere. Practice money only. |

## The call (CEO)

**Launch in two steps:**
1. **A public beta on practice money, this week.**
   - Anyone can sign in and play all 150 games.
   - They can trade in Practice, chat, join squads and climb a weekly practice leaderboard.
   - No deposits, no withdrawals, no real stakes.
2. **Real-money duels after that.**
   - The first one is Call Out: a 1v1 USDC duel by link, from [the 30 money games](../../../research/clashy-games/round3/judged-30.md).
   - It goes on mainnet with small caps, but only after a lawyer's read, a geofence, the audit fixes, and a Squads
     multisig treasury.

**Why practice first:**
- It's legal everywhere, and it ships in days, not weeks.
- It shows which games people come back to, so we only build the money versions of games that keep players.
- It gives X real content from day one.
- Real money without legal cover can end the company. A slow start can't.

**In parallel:** the hackathon. We deploy the program to devnet and record real devnet duels for the Blitz submission.
The devnet duels also go live in the beta as an "On-chain (devnet)" showcase, with test USDC from our faucet.

## The week (calendar, IST)

| When | What | Who |
|---|---|---|
| **Sat Nov 21, 5 pm** | Your decisions below. Then point DNS at our server, fund devnet SOL, and set up the X account. | You (about 30 min), with me |
| Sat night | Deploy the stack to the VM: `clashy.fun` (landing) and `play.clashy.fun` (app), with HTTPS, health checks, error tracking and analytics. Deploy the program to devnet and run the preflight. | Me |
| Sun Nov 22 | Devnet duels and Royale live from the app. A real devnet run recorded for proof. Terms, Privacy and Responsible play pages. The landing says "Play free". | Me |
| Mon Nov 23 | A soft launch to about 20 friends. Fix what breaks. Record clips for X. | You invite, I fix |
| **Tue Nov 24** | **Public beta launch:** a launch thread on X, the film, posts in Solana and MagicBlock communities. | Both |
| Wed–Thu | Submit to the Solana dApp Store. The first weekly practice cup. Daily content. | Me, with your OK |
| Fri Nov 27 (or the posted deadline) | Blitz v10 submission: repo, film, devnet explorer links. | You submit, I prepare everything |
| Week 2 | Call Out on devnet with test USDC. Legal consult. Meme War season 0 (practice) with outreach to the BONK and WIF teams. | Both |

## Product: what's in the beta (CPO)

**In:**
- the 150 games
- Practice trading
- practice duels against Clashy Bot
- chats, squads, profiles
- the guided tour
- a weekly practice leaderboard
- the devnet on-chain showcase

**Out (for now):**
- real-money stakes, deposits and withdrawals
- cash or prize payouts
- mainnet

**Must fix before public:**
1. **Leaderboards can be cheated.** Practice results are worked out on the phone, so a player can edit them. Until
   results are checked on the server, leaderboards are for bragging only and carry no prizes. Prizes come later, on
   server-checked games or on chain.
2. **Privy domains.** Add `clashy.fun` and `play.clashy.fun` as allowed origins in the Privy dashboard (you).
3. **Legal pages.** Terms, Privacy and Responsible play, plus an 18+ confirmation at sign-in. I draft them; a lawyer
   reviews them before real money.
4. **Visibility.** Analytics (PostHog) and crash reporting (Sentry), each with a clear "Setup required" until there
   are keys. Without them we're flying blind.
5. **Phone experience.** Install to home screen (PWA) on day one. App stores come later.

## Tech (CTO)

**One VM to start:** 2 vCPU and 4 GB RAM, running the prod profile in `docker-compose.yml`: Caddy (HTTPS), web,
relay, crank and social.
- RPC: Solana devnet plus MagicBlock's devnet Ephemeral Rollup.
- Mainnet waits for phase 2.
- Deploy with `bash deploy/up.sh testnet`. The preflight checks every service.

**Keys:** the sponsor, authority and crank keypairs are made on the VM, stored there with mode 600, and never put in git
or printed. The devnet deployer already exists (address above).

**Monitoring:** `/health` and `/info` on every service, plus Sentry and an uptime check.

**Mobile:**
- Week 1: the PWA.
- Week 2: Expo EAS builds for TestFlight and Google Play internal testing, and the Solana dApp Store.

**Before mainnet:**
- fix every finding in `docs/AUDIT.md`
- cap stakes
- a kill switch on the relay
- a Squads multisig for the rake
- geofencing by country at sign-in
- deposits and withdrawals only through Privy's wallet

## Money (CFO)

**Monthly costs in phase 1, kept to the minimum:**
- one small VM
- X Premium
- RPC on a free tier to start (Helius or the public devnet)
- Privy, PostHog and Sentry on their free tiers

The domain is paid. App store accounts come in week 2 (Apple about $99 a year, Google Play about $25 once). Check
current prices before buying anything.

**Revenue in phase 1 is zero, on purpose.** What we buy with phase 1 is users, retention data and an audience. Phase 2
revenue comes from:
- the rake: 4% on duels, 8–10% on pools and cups
- sponsor fees for branded cups and Meme War seasons
- creator revenue share, which is a cost that brings players

**Non-dilutive money to chase now:**
- MagicBlock Blitz v10 (prizes as above).
- MagicBlock's builder support.
- Superteam grants for Solana consumer apps.
- Solana Foundation and dApp Store programs.

Every grant application needs a live product and real usage. That is one more reason the beta comes first.

**Treasury:** a Squads multisig from the first real dollar. You hold a key, and I never do.

## Growth and X (CMO)

**The account.** You create it, and you decide the handle. Options:
- `@clashyfun` (matches the domain)
- `@playclashy`
- `@clashy_fun`

**Premium.** Start with blue Premium: reply boost, long posts, edits, analytics. Gold is X's Verified Organizations
tier, a business plan priced for companies. It's worth it when we have sponsors and revenue, not before. Check the
current price on X.

**Profile.**
- Name: Clashy.
- Bio: "Trade against people, not the house. 150 trading games on live prices. Built on Solana and MagicBlock."
- Link: clashy.fun.
- Avatar: our clay app icon. Banner: clay arena art.
- Pinned: the launch thread.

**The content engine.** I make it; you approve each day's batch before it goes out.

| Cadence | Post |
|---|---|
| Daily | A 15–30 s clip of a real round (Tap Grid, Royale, Rocket, Knockout). Real prices, labelled practice money. |
| Daily | A Chartle-style real chart: "higher or lower 10 minutes later?", answered in the evening. Easy replies. |
| Daily | 10–20 thoughtful replies in Solana, MagicBlock, meme and trading threads. Replies grow a new account faster than posts. |
| 3× a week | Building in public: what shipped, real numbers, honest problems. |
| Weekly | A game of the week, the practice cup results, and Meme War standings once it's live. |
| Launch day | A thread (the problem, the product, the 150 games, the on-chain duel, try it), the 60–90 s film, and tags for MagicBlock, Solana and Phantom where it's true. |

**Rules for every post:**
- Real numbers and real rounds only. No fake users or fake testimonials, and no bought engagement.
- Never promise returns. Practice money is labelled as practice money.
- No tagging a project to imply a partnership we don't have.

**How posting works:**
- I draft in a queue file, and you approve each batch by saying so in chat.
- I post through your logged-in X in Chrome.
- I never DM anyone, follow mass accounts or use bots. X bans that, and it would burn the account.

**Week 1 targets (goals, not promises):**
- 1,000 visits
- 300 sign-ins
- 100 daily players
- 30% back the next day
- 500 followers on X

## What I'll have ready at 5 pm (working on it now)

1. **This plan.**
2. **Legal pages.** Terms, Privacy and Responsible play drafts, plus the 18+ line, in the app and the landing footer.
3. **The X launch kit.**
   - profile copy, avatar and banner
   - a 14-day calendar
   - the launch thread
   - real game clips recorded from the app
4. **The landing refresh.** "150 games · Play free" pointing to play.clashy.fun. Staged only; nothing goes live without
   your OK.
5. **Deploy runbook.** The exact steps for DNS, the VM and devnet, so tonight's deploy is copy and paste.

## What only you can do (5 pm)

1. **Server.** Use the VPS that already runs our relay, or rent a new small VM. Tell me which.
2. **DNS (Hostinger).** Point `clashy.fun` and `play.clashy.fun` at the VM's IP with two A records. About 5 minutes.
3. **Devnet SOL.** About 16 SOL in total: about 14 for the deployer `6XdpT4cYBZBMMNXnxzoRYWMxtQk3FuooB98bAp79nYbe` and
   about 2 for the sponsor.
   - From faucet.solana.com, signed in with GitHub; it takes several requests.
   - Or approve me trying the public faucets, which are rate-limited.
4. **Privy.** Add the two domains as allowed origins.
5. **X.** Create the account, buy Premium, log in in Chrome, and tell me how you want to approve posts (each post, or a
   daily batch).
6. **Calls to make:**
   - the public beta date (I say Tue Nov 24)
   - whether we submit to Blitz v10, given the pre-kickoff code
   - practice-only until a lawyer says yes to real money
