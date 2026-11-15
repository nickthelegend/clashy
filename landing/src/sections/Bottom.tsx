import { motion, useReducedMotion } from 'framer-motion'
import { ArenaWidget } from '../components/arena/ArenaWidget'
import { LeaderboardStrip } from '../components/LeaderboardStrip'
import { StoreBadges } from '../components/StoreBadges'
import { Wordmark } from '../components/Wordmark'

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

// tab.markets' dark "Close 100 tabs. Open one." break, as Clashy's "fight people, not the house"
export function Break() {
  const banners = ['duel', 'line', 'war', 'royale', 'bounty']
  return (
    <section className="break">
      <div className="wrap break-in">
        <h2>
          Stop fighting the house.
          <br />
          <span>Fight your friends.</span>
        </h2>
        <p>
          Trading arcades put you against a house pool that keeps your loss. On Clashy the other side is a person, the pot sits
          in Solana escrow, and the winner takes it, minus a 3% rake.
        </p>
      </div>
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...banners, ...banners].map((b, i) => (
            <img key={i} src={`/art/banner-${b}.webp`} alt="" width="1600" height="900" loading="lazy" />
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
          <p>The app is coming to iOS, Android and the Solana dApp Store. Until then, the Arena above is free to play.</p>
          <a className="btn btn-primary" href="#arena">
            Play a free duel
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </a>
          <StoreBadges size="sm" />
          <span className="sample">Free to try. Real stakes when the app ships.</span>
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
        </div>
        <div className="foot-q">
          <p>Trade against people, not the house.</p>
        </div>
      </div>
      <div className="wrap foot-fine">
        <span>© 2026 Clashy · clashy.fun · In development: the app and duels for money are not live.</span>
        <span>Leveraged trading is risky. Arena prices: Binance spot. Art generated with ChatGPT.</span>
      </div>
    </footer>
  )
}
