import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion'
import { Money } from '../components/Money'
import { ClayLoop } from '../components/ClayLoop'
import { MARKETS, useLivePrice } from '../components/arena/useLivePrice'

// tab.markets' "Pick. Decide. Battle." stage: a pinned phone (clay hand) whose screen changes
// step by step as you scroll, a callout card wired to it, and a segmented control underneath.
// The phone's blank screen sits at 31.14% / 8.67% / 44.5% x 62.56% of phone-hand.webp.

const STEPS = [
  { k: 'Match', t: 'Get matched.', d: 'Sign in with email or Google and hit quick match. In the public beta your rival is Clashy Bot, and you play with practice money.' },
  { k: 'Roll', t: 'One coin. Pick your side.', d: 'One coin is rolled for both of you. Go long or short and set your leverage.' },
  { k: 'Battle', t: 'Sixty seconds. Best % wins.', d: 'One chart, both knockout lines. Hit yours and you are out. Best % at the bell takes the practice pot.' },
]

export function How() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [step, setStep] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(2, Math.floor(v * 3))))
  return (
    <section id="how" className="how">
      <div className="wrap how-head">
        <h2>
          Get matched. Roll a coin.
          <br />
          Duel it out.
        </h2>
        <p>Three moves, one minute. The screens below are design samples with sample players; only the prices are live. In the beta no duel uses real money.</p>
      </div>
      <div className="how-track" ref={ref}>
        <div className="how-sticky">
          <div className="how-stage">
            <div className="phone">
              <img className="phone-img" src="/art/phone-hand.webp" alt="" width="1400" height="1800" />
              <div className="phone-screen">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    className="ps"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.35 }}
                  >
                    {step === 0 ? <ScreenPick /> : step === 1 ? <ScreenDecide /> : <ScreenBattle />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div className="callout-wire" aria-hidden="true" />
            <AnimatePresence mode="wait">
              <motion.div key={step} className="callout" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.35 }}>
                {step === 2 ? (
                  <ClayLoop name="tile-duel-loop" className="clay-vid callout-vid" size={56} />
                ) : (
                  <img src={['/art/av-nova.webp', '/art/coins-pile.webp'][step]} alt="" width="56" height="56" />
                )}
                <span className="label">
                  0{step + 1} · {STEPS[step].k}
                </span>
                <h3>{STEPS[step].t}</h3>
                <p>{STEPS[step].d}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="seg3" role="tablist" aria-label="Steps">
            {STEPS.map((s, i) => (
              <span key={s.k} role="tab" aria-selected={i === step} className={i === step ? 'on' : i < step ? 'done' : ''}>
                {s.k}
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* phones and reduced motion: plain stacked steps */}
      <ol className="how-list">
        {STEPS.map((s, i) => (
          <li key={s.k}>
            <span className="label">0{i + 1} · {s.k}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ScreenPick() {
  const people = [
    ['nova', 'nova', 'sample player'],
    ['shark', 'rexx', 'sample player'],
    ['panda', 'bao', 'sample player'],
    ['wizard', 'merl', 'sample player'],
  ]
  return (
    <div className="ps-pad">
      <div className="ps-h">Find a duel · sample</div>
      <div className="ps-q">⚡ Quick match</div>
      {people.map(([a, n, w]) => (
        <div className="ps-row" key={n}>
          <img src={`/art/av-${a}.webp`} alt="" width="34" height="34" />
          <div>
            <b>{n}</b>
            <span>{w}</span>
          </div>
          <em>Duel</em>
        </div>
      ))}
    </div>
  )
}

function ScreenDecide() {
  const sol = useLivePrice(MARKETS[0])
  return (
    <div className="ps-pad">
      <div className="ps-h">Coin rolled</div>
      <div className="ps-roll">
        <img src="/coins/sol.webp" alt="" width="56" height="56" />
        <b>SOL</b>
        <span>{sol.price != null ? <Money value={sol.price} decimals={2} /> : 'loading…'}</span>
        <em>MagicBlock VRF · same coin for both</em>
      </div>
      <div className="ps-sides">
        <span className="long">▲ Long</span>
        <span>▼ Short</span>
      </div>
      <div className="ps-lev">
        <span>10×</span>
        <span className="on">25×</span>
        <span>50×</span>
      </div>
      <span className="ps-note">0:08 left to pick · sample</span>
    </div>
  )
}

function ScreenBattle() {
  const reduce = useReducedMotion()
  return (
    <div className="ps-pad">
      <div className="ps-clock">0:42</div>
      {[
        ['nova', 'you · long SOL', 64, '+64%', 'up'],
        ['shark', 'rexx · short SOL', 22, '−64%', 'down'],
      ].map(([a, n, w, v, c]) => (
        <div className="ps-bar" key={n as string}>
          <img src={`/art/av-${a}.webp`} alt="" width="30" height="30" />
          <div>
            <b>{n}</b>
            <div className="bar">
              <motion.i initial={reduce ? false : { width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 1.2, ease: 'easeOut' }} className={c as string} />
            </div>
          </div>
          <span className={`num ${c}`}>{v}</span>
        </div>
      ))}
      <ClayLoop name="win-loop" className="ps-trophy clay-vid" size={90} />
      <span className="ps-note">best % at the bell takes the pot</span>
    </div>
  )
}
