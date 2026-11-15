import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Wordmark } from '../components/Wordmark'
import { Money } from '../components/Money'
import { MARKETS, useLivePrice } from '../components/arena/useLivePrice'

const LINKS: [string, string][] = [
  ['How it works', '#how'],
  ['Features', '#features-rail'],
  ['Arena', '#arena'],
]

export function TopNav() {
  return (
    <header className="topnav">
      <div className="wrap topnav-in">
        <a href="#top" className="brand" aria-label="clashy home">
          <Wordmark size={26} />
        </a>
        <nav className="topnav-links" aria-label="Sections">
          {LINKS.map(([l, h]) => (
            <a key={l} href={h}>
              {l}
            </a>
          ))}
        </nav>
        <a className="btn btn-white btn-sm" href="#arena">
          Play free
        </a>
      </div>
    </header>
  )
}

// tab.markets' floating pill nav: shows once the hero is scrolled past
export function FloatNav() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const on = () => setShow(window.scrollY > 640)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <motion.nav
      className="floatnav"
      aria-label="Quick navigation"
      initial={false}
      animate={{ y: show ? 0 : -90, opacity: show ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <a href="#top" className="floatnav-brand" aria-label="Back to top">
        <Wordmark size={18} />
      </a>
      <span className="floatnav-sep" />
      {LINKS.map(([l, h]) => (
        <a key={l} href={h} className="floatnav-link">
          {l}
        </a>
      ))}
      <a href="#arena" className="floatnav-cta">
        Play free
      </a>
    </motion.nav>
  )
}

function Tile({ src, bg, delay }: { src: string; bg: string; delay: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.span
      className="htile"
      style={{ background: bg }}
      initial={reduce ? false : { scale: 0.4, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16, delay }}
      aria-hidden="true"
    >
      <img src={src} alt="" width="96" height="96" />
    </motion.span>
  )
}

export function Hero() {
  const reduce = useReducedMotion()
  return (
    <section className="hero" id="top">
      <div className="wrap hero-in">
        <h1 className="hero-h">
          Trade <Tile src="/art/tile-duel.webp" bg="#5B6CFF" delay={0.15} /> against
          <br />
          <Tile src="/art/av-nova.webp" bg="#F0468C" delay={0.3} /> people, not
          <br />
          the <Tile src="/art/crown.webp" bg="#FFC94A" delay={0.45} /> house.
        </h1>
        <motion.p className="hero-sub" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
          Clashy turns trading into a game you play against people. Get matched, a coin is rolled for you both, you pick long
          or short, and the best % in sixty seconds takes the pot.
        </motion.p>
        <motion.div className="hero-ctas" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }}>
          <a className="btn btn-primary" href="#arena">
            Play a free duel
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </a>
          <a className="btn btn-ghost" href="#how">
            <span className="play" aria-hidden="true">
              ▶
            </span>
            See how it works
          </a>
        </motion.div>
        <HeroCard />
      </div>
    </section>
  )
}

// The product card over a frosted stack, like tab.markets' event card. Prices are live; the
// players and the pot are a design sample and the card says so.
function HeroCard() {
  const sol = useLivePrice(MARKETS[0])
  const reduce = useReducedMotion()
  return (
    <motion.div className="hcard-stage" initial={reduce ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
      <div className="hcard-back" aria-hidden="true">
        <img className="hcard-duo" src="/art/hero-duo.webp" alt="" width="2000" height="1400" />
      </div>
      <div className="hcard">
        <div className="hcard-top">
          <span className="chip">
            <img src="/art/tile-duel.webp" alt="" width="20" height="20" /> knockout duel · quick match
          </span>
          <span className="sample">Design sample · live price</span>
        </div>
        <h3 className="hcard-title">SOL rolled for both of you. Long or short?</h3>
        <div className="hcard-who">
          <img src="/art/av-nova.webp" alt="" width="26" height="26" />
          <img src="/art/av-shark.webp" alt="" width="26" height="26" />
          <span>
            <b>you</b> vs <b>rexx</b> · $20 each · 60 s
          </span>
        </div>
        <div className="hcard-picks">
          <div className="pick on">
            <span>
              <img src="/coins/sol.webp" alt="" width="18" height="18" /> you · ▲ Long
            </span>
            {sol.price != null ? <Money value={sol.price} decimals={2} /> : <span className="cents">…</span>}
          </div>
          <div className="pick">
            <span>
              <img src="/coins/sol.webp" alt="" width="18" height="18" /> rexx · ▼ Short
            </span>
            <span className="cents">same coin</span>
          </div>
          <div className="hcard-pot">
            <b>+$38.80</b>
            <span>if you win (3% rake)</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
