import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ClayLoop } from '../components/ClayLoop'

// tab.markets' #features-rail: the heading stays pinned on the left while a rail of coloured
// feature cards slides in from the right as you scroll down. On phones it becomes a swipeable row.

type Card = { n: string; label: string; title: string; body: string; bg: string; ink: string; ui: React.ReactNode }

// tiles that have a clay animation loop in /video
const LOOPS = new Set(['duel', 'royale', 'line'])

const RANKS = ['Rookie', 'Saver', 'Starter', 'Steady', 'Investor', 'Analyst', 'Long-Term', 'Strategist', 'Expert', 'Legend']

const CARDS: Card[] = [
  {
    n: '01',
    label: 'Squads',
    title: 'Your squad vs theirs.',
    body: 'Pool one chest with your crew, vote every call up or down, then stake it against a rival squad. Test USDC on devnet; no real money in the beta.',
    bg: '#F0468C',
    ink: '#fff',
    ui: (
      <div className="ui-clan">
        <img className="ui-castle" src="/art/clan-banner.webp" alt="" width="1600" height="1000" />
        <div className="ui-tug">
          <img src="/art/crest-moon.webp" alt="" width="48" height="48" />
          <div className="tug">
            <i style={{ width: '58%' }} />
          </div>
          <img src="/art/crest-bolt.webp" alt="" width="48" height="48" />
        </div>
        <div className="ui-tugn">
          <span>Sample squad +14%</span>
          <span>Rival squad +9%</span>
        </div>
      </div>
    ),
  },
  {
    n: '02',
    label: 'The arena',
    title: '150 ways to play.',
    body: 'Knockout duels, Royale, races, snipes, streaks and more: 150 games on live prices, free with practice money.',
    bg: '#5B6CFF',
    ink: '#fff',
    ui: (
      <div className="ui-modes">
        {[
          ['duel', 'Knockout duel'],
          ['clash', 'Coin clash'],
          ['diamond', 'Diamond duel'],
          ['royale', 'Royale'],
          ['double', 'Double or nothing'],
          ['war', 'Squad war'],
        ].map(([t, n]) => (
          <div key={t} className="ui-mode">
            {LOOPS.has(t) ? (
              <ClayLoop name={`tile-${t}-loop`} className="clay-vid" size={64} />
            ) : (
              <img src={t === 'clash' ? '/art/coins-pile.webp' : `/art/tile-${t}.webp`} alt="" width="72" height="72" />
            )}
            <span>{n}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: '03',
    label: 'Streaks',
    title: 'Keep the streak alive.',
    body: 'Win in a row and the streak climbs. Lose one and it is back to zero.',
    bg: '#FFC94A',
    ink: '#1a1405',
    ui: (
      <div className="ui-streak">
        <div className="ui-streak-top">
          <b>4</b>
          <span>in a row</span>
          <img src="/art/badge-streak.webp" alt="" width="84" height="84" />
        </div>
        <div className="ui-wl">
          {['W', 'W', 'L', 'W', 'W', 'W', 'W', '?'].map((x, i) => (
            <span key={i} className={x === 'W' ? 'w' : x === 'L' ? 'l' : 'q'}>
              {x}
            </span>
          ))}
        </div>
        <span className="ui-note">Design sample</span>
      </div>
    ),
  },
  {
    n: '04',
    label: 'Your rank',
    title: 'Climb ten tiers.',
    body: 'From Rookie to Legend. Points come only from settled clashes.',
    bg: '#C9C2FF',
    ink: '#16123a',
    ui: (
      <div className="ui-ranks">
        {RANKS.map((r, i) => (
          <div key={r} className={`ui-rank${i === 9 ? ' top' : ''}`}>
            <img src={`/art/rank-${i + 1}.webp`} alt="" width="64" height="64" />
            <span>{r}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: '05',
    label: 'Chat',
    title: 'Talk trash. Settle it.',
    body: 'Squad channels and DMs, with stickers and a Clash shortcut in every chat. Messages shown are samples.',
    bg: '#FFF3DF',
    ink: '#1b1a24',
    ui: (
      <div className="ui-chat">
        <div className="msg">
          <img src="/art/av-cat.webp" alt="" width="30" height="30" />
          <p>
            <b>jyu</b> who's fading this pump
          </p>
        </div>
        <div className="msg">
          <img src="/art/av-shark.webp" alt="" width="30" height="30" />
          <p>
            <b>rexx</b> me. 60 seconds, let the coin roll
          </p>
        </div>
        <div className="ui-stickers">
          {['ko', 'gg', 'lfg', 'rekt'].map((s) => (
            <img key={s} src={`/art/sticker-${s}.webp`} alt="" width="64" height="64" />
          ))}
        </div>
      </div>
    ),
  },
  {
    n: '06',
    label: 'Leaderboard',
    title: 'Top the board.',
    body: 'Ten ranks, points from settled clashes. The podium shown is a sample.',
    bg: '#16161a',
    ink: '#f5f5f7',
    ui: (
      <div className="ui-podium">
        {[
          ['dragon', 2, 'medal-2', 70],
          ['nova', 1, 'medal-1', 100],
          ['tiger', 3, 'medal-3', 50],
        ].map(([a, p, m, h]) => (
          <div key={p as number} className="ui-pod">
            <img className="ui-pod-av" src={`/art/av-${a}.webp`} alt="" width="64" height="64" />
            <img className="ui-pod-m" src={`/art/${m}.webp`} alt="" width="40" height="40" />
            <i style={{ height: h as number }} />
          </div>
        ))}
      </div>
    ),
  },
]

function CardView({ c }: { c: Card }) {
  return (
    <article className="rcard" style={{ background: c.bg, color: c.ink }}>
      <span className="label rcard-l">
        {c.n} <b>{c.label}</b>
      </span>
      <h3>{c.title}</h3>
      <p>{c.body}</p>
      <div className="rcard-ui">{c.ui}</div>
    </article>
  )
}

export function Rail() {
  const ref = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [dist, setDist] = useState(0)
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const measure = () => {
      setWide(window.innerWidth > 900)
      if (rail.current) setDist(Math.max(0, rail.current.scrollWidth - (window.innerWidth - rail.current.getBoundingClientRect().left) + 48))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const x = useTransform(scrollYProgress, [0.05, 0.95], [0, -dist])
  const headFade = useTransform(scrollYProgress, [0.12, 0.32], [1, 0])
  const pinned = wide && !reduce

  return (
    <section id="features-rail" className={`rail${pinned ? ' pinned' : ''}`} ref={ref} style={pinned ? { height: `calc(100vh + ${dist}px)` } : undefined}>
      <div className="rail-sticky">
        <motion.div className="rail-head" style={pinned ? { opacity: headFade } : undefined}>
          <h2>
            Duels are better
            <br />
            with friends.
            <br />
            <span>Squads, streaks and your rank.</span>
          </h2>
          <p>Everything around the duel that keeps you coming back.</p>
        </motion.div>
        <motion.div className="rail-row" ref={rail} style={pinned ? { x } : undefined}>
          {CARDS.map((c) => (
            <CardView key={c.n} c={c} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
