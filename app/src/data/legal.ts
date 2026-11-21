// The three legal pages for the public beta (Terms, Privacy, Responsible play), shown by app/legal/[doc].tsx.
// Drafts in plain words for a practice-money beta: no deposits, withdrawals, real stakes or prizes. Every statement
// here was checked against the code (src/chain/*, server/, chain/scripts/sponsor.ts) on Nov 21, 2026. When the code
// changes what is stored or where (analytics, a server-side leaderboard, real money), change these pages with it.
//
// TODO(Nick): a lawyer reviews all three before any real-money play. Still missing for that review: the operator's
// legal name and address, the governing law, and a minimum-age rule per country.

/** A paragraph, or a list of bullet points. */
export type Block = string | string[];
export type Section = { h: string; body: Block[] };
export type LegalDoc = { title: string; lead: string; sections: Section[] };
export type LegalKey = 'terms' | 'privacy' | 'responsible';

// TODO(Nick): placeholder contact. Confirm hello@clashy.fun is a real inbox that someone reads before launch.
export const CONTACT = 'hello@clashy.fun';
export const DRAFT_NOTICE = 'Draft for the public beta — to be reviewed by a lawyer before any real-money play.';
export const UPDATED = 'Nov 21, 2026';

export const LEGAL_ORDER: LegalKey[] = ['terms', 'privacy', 'responsible'];
export const isLegalKey = (s: unknown): s is LegalKey => typeof s === 'string' && (LEGAL_ORDER as string[]).includes(s);

export const LEGAL: Record<LegalKey, LegalDoc> = {
  terms: {
    title: 'Terms',
    lead: 'The rules for using Clashy during the public beta, kept short.',
    sections: [
      {
        h: 'What Clashy is',
        body: ['Clashy is a game: 150 trading games on live market prices, played with practice money. In the public beta, every game runs on practice money.'],
      },
      {
        h: 'You must be 18 or older',
        body: [
          'You can only use Clashy if you are 18 or older. By signing in you confirm that you are. If the law where you live sets a higher age for games like this, that age applies.',
          "Don't use Clashy where the law doesn't allow it.",
        ],
      },
      {
        h: 'Practice money is not money',
        body: [[
          "Practice money has no cash value. You can't withdraw it, cash it out, sell it or swap it for anything.",
          "It's free, and you can't buy it.",
          "It's kept on your device. Clearing the app's or browser's data, or switching devices, can wipe it, and we can't bring it back.",
          'We may reset or change practice balances, games and payouts at any time.',
          'Leaderboards and cups in the beta are for bragging rights only. They carry no prizes.',
        ]],
      },
      {
        h: 'No real-money play in the beta',
        body: [
          'The beta takes no deposits, pays no withdrawals or prizes, and has no real stakes. No game in the beta uses real money.',
          "Nobody from Clashy will ask you to send money or tokens. If someone does, it isn't us.",
          'If real-money duels open later, they will come with their own terms, and you will have to accept those first.',
        ],
      },
      {
        h: 'The on-chain showcase uses test tokens',
        body: [
          "The on-chain (devnet) showcase runs Clashy's program on Solana devnet, a test network. The USDC there is a test token with no value. Devnet can be reset, slow or down, and what is on it can disappear.",
          "Results there are public on the test network, carry no prizes and can't be exchanged for anything.",
        ],
      },
      {
        h: 'Not investment advice',
        body: [
          "Prices in Clashy are real, but the games are entertainment. Nothing in Clashy, including other players' calls, posts and messages, is investment, financial, legal or tax advice, or a recommendation to buy or sell anything.",
          "Clashy is not a broker or an exchange. In Practice you don't buy, sell or own any real asset. Games use big leverage to keep rounds short, so a practice win says nothing about how you would do with real money.",
        ],
      },
      {
        h: 'Your wallet',
        body: [
          "Signing in gives you your own Solana wallet, made by Privy. The key stays with Privy and you. Clashy never sees it, so we can't move, freeze or recover anything in that wallet.",
          "The beta doesn't use real funds, so there's no reason to send real money to it.",
        ],
      },
      {
        h: 'Play fair',
        body: [[
          'One account per person.',
          'No cheating, bots, scripts or exploiting bugs. Tell us about a bug instead.',
          'Be decent in chats, squads and messages: no harassment, hate, threats, scams, spam or illegal content.',
        ], "We may remove content from our servers and stop serving accounts that break these rules. Names, calls and squad chat written on Solana are public there, and nobody can erase them."],
      },
      {
        h: 'The beta can change',
        body: [
          'This is a beta. Games, features, practice balances and these terms can change, pause or end at any time. Things will sometimes break.',
          "Clashy is provided as is, with no promise that it will always be available, accurate or free of errors. As far as the law allows, we aren't liable for losses that come from using it.",
          'When we change these terms, we change the date at the top. Using Clashy after that means you accept the new version.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy',
    lead: 'What Clashy keeps, where it lives and who else can see it. We keep only what the game needs to run.',
    sections: [
      {
        h: 'Sign-in: Privy',
        body: [
          'Privy runs sign-in with your email or Google account and makes your Solana wallet. Privy keeps your login details and holds your wallet key. Clashy never sees the key.',
          "The app shows your sign-in email on your own wallet card. Our servers don't save your email: they only ask Privy which wallets belong to the person signed in. Privy's own privacy policy covers what Privy does.",
        ],
      },
      {
        h: 'On Solana: public and permanent',
        body: [
          'When you pick a name, the Clashy program on Solana records your player: wallet address, name, avatar, daily limit and breaks. Calls you post, squads you join, squad chat and on-chain duels are recorded there too.',
          "Anything on chain is public: anyone can read it with a Solana explorer. Nobody, including us, can delete it. In the beta this is Solana devnet, a test network, and MagicBlock's devnet rollup.",
        ],
      },
      {
        h: 'On our servers',
        body: [
          'Our social server stores your bio, link and private-account setting, who you follow and follow requests, your direct messages and read receipts, and notifications. It also keeps a copy of public calls, squad chat and squad member lists, so history survives when the on-chain feed rolls over.',
          "Direct messages are not end-to-end encrypted. They sit on our server so the other person can read them, so don't send passwords, keys or anything secret.",
          'Our relay pays network fees for you, so it sees the transactions you sign and your wallet address. It keeps no record of players.',
          "Both servers see your IP address when your device connects, as any website does. They use it only to limit how many requests one address can make, and don't store it in a database.",
        ],
      },
      {
        h: 'On your device',
        body: [
          "Your practice money, practice trades and game history are stored only on this device, in the app's storage (your browser's local storage on the web). They are never sent to our servers.",
          'The device also keeps your session with our social server (up to 7 days), tour progress, what you recently viewed from search, recent stickers and emoji, which squad messages you have seen, and, for an on-chain duel, the secret half of your sealed call until it is revealed.',
          "Clearing the app's or browser's data deletes all of this, and we can't restore it.",
        ],
      },
      {
        h: 'Market data',
        body: [
          "Prices, charts and order books come from Jupiter, Phoenix and Pacifica. Most of it goes through our relay, which fetches it once for everyone, so those services don't see you.",
          'Live order books connect your device straight to Phoenix and Pacifica, so they see your IP address, as any website would. Coin logos load from the sites that host them. We never send them your wallet, email or practice trades.',
        ],
      },
      {
        h: 'Analytics and crash reports',
        body: ['None are switched on yet. If we turn them on, it will be PostHog for product analytics (which screens and games get used) and Sentry for crash reports, and we will update this page first to say what they collect.'],
      },
      {
        h: "What we don't do",
        body: [[
          "We don't sell your data or share it with advertisers.",
          'There are no ads and no ad trackers in Clashy.',
          'We never see or store your wallet key.',
        ]],
      },
      {
        h: 'Your choices',
        body: [
          'Edit your bio and link, make your account private, or sign out any time in Settings.',
          `To delete what our server holds for your wallet (bio, follows, messages and notifications), write to ${CONTACT}. We check that the wallet is yours first. What is on chain can't be deleted.`,
        ],
      },
      {
        h: 'The clashy.fun website',
        body: ['The website loads its fonts from Google Fonts, and its free demo Arena reads prices straight from Binance, so both see your IP address. Your demo record stays in your browser.'],
      },
      {
        h: 'Changes',
        body: ['If what we keep changes, we update this page and the date at the top.'],
      },
    ],
  },

  responsible: {
    title: 'Responsible play',
    lead: "Clashy is a game. Keep it one.",
    sections: [
      {
        h: 'Play for fun',
        body: [
          "Practice money has no value, so the only thing you can lose in the beta is time. Spend it on purpose.",
          [
            "Decide how long you'll play before you start.",
            'Take breaks. Stand up and look away from the chart.',
            "Don't play when you're upset, tired or drunk.",
            "Losing streaks happen. Chasing them is how the fun stops.",
          ],
        ],
      },
      {
        h: 'No real money in the beta',
        body: [
          "Real-money play isn't available in the public beta. There are no deposits, real stakes or prizes.",
          "Nobody from Clashy will ask you to deposit or send money. If anyone does, it isn't us: don't send it.",
        ],
      },
      {
        h: "Practice isn't proof",
        body: ["Games use big leverage so a round can end in seconds. Real leveraged trading can wipe out real money just as fast. A practice streak doesn't mean you would win with real money, and nothing in Clashy is advice to trade."],
      },
      {
        h: "Signs it's time to stop",
        body: [
          [
            'You keep playing longer than you meant to.',
            "You feel restless or low when you aren't playing.",
            'You hide how much you play, or it gets in the way of sleep, work, school or people.',
            'You want to put real money in to win back a loss.',
          ],
          "If any of these sound like you, take a real break: sign out, remove Clashy from your home screen, and talk to someone.",
        ],
      },
      {
        h: 'Where to get help',
        body: [
          "If gambling, trading or gaming is hurting you or someone close to you, you're not alone, and free help exists in most countries. Talk to someone you trust, and contact a gambling-support or mental-health service where you live. A doctor can point you to one.",
          'If you might hurt yourself, or you are in danger right now, call your local emergency number.',
        ],
      },
      {
        h: 'Before real money',
        body: ["Real-money duels won't open in the beta. The on-chain showcase already has the limits we plan to keep for them: a daily stake limit you can lower at once but only raise after 24 hours, and breaks of 1, 7 or 30 days that can't be shortened, not even by you."],
      },
    ],
  },
};
