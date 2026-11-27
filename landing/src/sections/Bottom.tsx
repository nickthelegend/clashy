import { motion, useReducedMotion } from 'framer-motion'
import { ArenaWidget } from '../components/arena/ArenaWidget'
import { LeaderboardStrip } from '../components/LeaderboardStrip'
import { StoreBadges } from '../components/StoreBadges'
import { Wordmark } from '../components/Wordmark'
import { ClayLoop } from '../components/ClayLoop'

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }

export function ArenaSection() {
  const reduce = useReducedMotion()
  const r = reduce ? {} : rise
  return (
    <section id="arena" className="arena-sec">
      <div className="wrap">
        <motion.div className="sec-head" {...r}>
          <span className="label you">Free demo · live prices</span>
          <h2>Try a duel. Right now.</h2>
          <p>
            A quick match against a practice rival. One coin is rolled for you both, you pick long or short, and the rival
            takes the other side. Best % in sixty seconds wins. No wallet, no money: practice on real prices.
          </p>
        </motion.div>
        <motion.div {...r}>
          <ArenaWidget />
        </motion.div>
        <div className="arena-record">
          <span className="label">Your record · this browser</span>
          <LeaderboardStrip />
        </div>
      </div>
    </section>
  )
}

// "Stop fighting the house": the message, then every game mode as a card on a slow rail.
// Banner art is clay on black; mix-blend lighten lets each card's tint show through the black.
const MODES: { art: string; name: string; line: string; tint: string; tag: string; video?: string }[] = [
  { art: 'duel', name: 'Knockout duel', line: 'One rolled coin. Long or short. First KO loses.', tint: '#1a1c4a', tag: 'Free practice above' },
  { art: 'royale', name: 'Royale', line: 'Up to 16 players. Call up or down each round; a wrong call costs a heart.', tint: '#3a1230', tag: 'On devnet' },
  { art: 'diamond', name: 'Diamond duel', line: 'Hold longer than the bot. Sell higher.', tint: '#10284a', tag: 'Practice' },
  { art: 'double', name: 'Double or nothing', line: 'Fifteen-second calls at nearly 2×.', tint: '#3a2a0c', tag: 'Practice' },
  { art: 'war', name: 'Squad war', line: "Your squad's chest against theirs. Members vote every call; the better return takes both stakes.", tint: '#2a1440', tag: 'On devnet', video: 'clan-war-loop' },
  { art: 'line', name: 'Draw the line', line: 'Draw the next minute. The closest line wins.', tint: '#1a1c4a', tag: 'Coming' },
  { art: 'cup', name: 'Weekly cup', line: 'Stock profit plus clash winnings this week. Top three take the podium.', tint: '#3a2a0c', tag: 'In the app' },
  { art: 'bounty', name: 'Bounty', line: "Beat a top player's week and take the bounty.", tint: '#3a1230', tag: 'Coming' },
]

function ModeCard({ m }: { m: (typeof MODES)[number] }) {
  return (
    <article className="mode" style={{ background: m.tint }}>
      {m.video ? (
        <ClayLoop name={m.video} className="mode-vid" />
      ) : (
        <img src={`/art/banner-${m.art}.webp`} alt="" width="1600" height="900" loading="lazy" />
      )}
      <div className="mode-tx">
        <div className="mode-top">
          <h3>{m.name}</h3>
          <span className={m.tag === 'Coming' ? 'mode-tag' : 'mode-tag live'}>{m.tag}</span>
        </div>
        <p>{m.line}</p>
      </div>
    </article>
  )
}

export function Break() {
  const reduce = useReducedMotion()
  return (
    <section className="break" id="modes">
      <div className="wrap break-in">
        <h2>
          Stop fighting the house.
          <br />
          <span>Fight your friends.</span>
        </h2>
        <p>
          Trading arcades put you against a house pool that keeps your loss. Clashy's duels put a person
          on the other side: the USDC pot sits in escrow on Solana and the winner takes it, minus a 3% rake. They run on Solana
          devnet today in test USDC; real money comes later. The beta is free, on practice money.
        </p>
      </div>
      <div className={`modes${reduce ? ' still' : ''}`}>
        <div className="modes-track">
          {(reduce ? MODES : [...MODES, ...MODES]).map((m, i) => (
            <ModeCard key={i} m={m} />
          ))}
        </div>
      </div>
    </section>
  )
}

export function Join() {
  const reduce = useReducedMotion()
  const r = reduce ? {} : rise
  return (
    <section className="join" id="join">
      <div className="wrap join-in">
        <motion.h2 {...r}>
          Find your rival.
          <br />
          Make the first move.
        </motion.h2>
        <motion.div className="join-side" {...r}>
          <p>The beta will open at play.clashy.fun (not live yet): 150 games on live prices, free with practice money. Real-money duels come later, and apps for iOS, Android and the Solana dApp Store are on the way.</p>
          <a className="btn btn-primary" href="https://play.clashy.fun">
            Play free
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </a>
          <StoreBadges size="sm" />
          <span className="sample">Practice money only. No deposits, no real stakes.</span>
        </motion.div>
      </div>
    </section>
  )
}

// tab.markets' gridded dark footer with coloured shapes, as clay objects in grid cells
export function Footer() {
  const art: [number, number, string][] = [
    [4, 1, 'tile-duel'],
    [9, 1, 'crown'],
    [6, 2, 'crest-bolt'],
    [1, 3, 'badge-streak'],
    [8, 3, 'coins-pile'],
    [11, 2, 'av-nova'],
  ]
  return (
    <footer className="foot">
      <div className="foot-grid">
        {art.map(([c, r, n]) => (
          <img key={n} className="foot-art" src={`/art/${n}.webp`} alt="" width="96" height="96" loading="lazy" style={{ gridColumn: c, gridRow: r }} />
        ))}
        <div className="foot-brand">
          <Wordmark size={46} />
        </div>
        <div className="foot-links">
          <div>
            <span className="label">Play</span>
            <a href="https://play.clashy.fun">Play free</a>
            <a href="#arena">Arena (free)</a>
            <a href="#how">How it works</a>
          </div>
          <div>
            <span className="label">Learn</span>
            <a href="#features-rail">Features</a>
            <a href="https://docs.magicblock.gg" target="_blank" rel="noreferrer">
              MagicBlock ↗
            </a>
          </div>
          <div>
            <span className="label">Legal</span>
            <a href="https://play.clashy.fun/legal/terms">Terms</a>
            <a href="https://play.clashy.fun/legal/privacy">Privacy</a>
            <a href="https://play.clashy.fun/legal/responsible">Responsible play</a>
          </div>
        </div>
        <div className="foot-q">
          <p>Clash 1v1. Squad up. Play 150 games.</p>
        </div>
      </div>
      <div className="wrap foot-fine">
        <span>© 2026 Clashy · clashy.fun · Public beta on practice money, 18+. Duels for money are not live.</span>
        <span>Leveraged trading is risky. Arena prices: Binance spot. Art generated with ChatGPT.</span>
      </div>
    </footer>
  )
}
