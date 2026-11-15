import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion'
import { Money } from '../components/Money'
import { MARKETS, useLivePrice } from '../components/arena/useLivePrice'

// tab.markets' "Pick. Decide. Battle." stage: a pinned phone (clay hand) whose screen changes
// step by step as you scroll, a callout card wired to it, and a segmented control underneath.
// The phone's blank screen sits at 31.14% / 8.67% / 44.5% x 62.56% of phone-hand.webp.

const STEPS = [
  { k: 'Pick', t: 'Pick a rival.', d: 'Quick match a stranger or call out a friend from chat. Anyone, anywhere, any time.' },
  { k: 'Decide', t: 'Pick your coin and side.', d: "SOL, BTC, ETH or any coin you like. Long or short, your leverage. Your rival picks their own." },
  { k: 'Battle', t: 'Sixty seconds. Best % wins.', d: 'Both charts live on one screen. Hit your knockout line and you are out. The pot settles on Solana.' },
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
          Pick a rival. Pick a coin.
          <br />
          Duel it out.
        </h2>
        <p>Three moves, one minute. The screens below are the app design; prices are live.</p>
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
                <img src={['/art/av-nova.webp', '/art/coins-pile.webp', '/art/tile-duel.webp'][step]} alt="" width="56" height="56" />
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
    ['nova', 'nova', '61% win'],
    ['shark', 'rexx', '49% win'],
    ['panda', 'bao', '57% win'],
    ['wizard', 'merl', '52% win'],
  ]
  return (
    <div className="ps-pad">
      <div className="ps-h">Find a rival</div>
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
  const btc = useLivePrice(MARKETS[1])
  const eth = useLivePrice(MARKETS[2])
  const rows: [string, string, number | null][] = [
    ['sol', 'SOL', sol.price],
    ['btc', 'BTC', btc.price],
    ['eth', 'ETH', eth.price],
  ]
  return (
    <div className="ps-pad">
      <div className="ps-h">Your coin</div>
      {rows.map(([id, l, p], i) => (
        <div className={`ps-row coin${i === 0 ? ' on' : ''}`} key={id}>
          <img src={`/coins/${id}.webp`} alt="" width="30" height="30" />
          <div>
            <b>{l}</b>
            <span>{p != null ? <Money value={p} decimals={p > 1000 ? 0 : 2} /> : 'loading…'}</span>
          </div>
        </div>
      ))}
      <div className="ps-sides">
        <span className="long">▲ Long</span>
        <span>▼ Short</span>
      </div>
      <div className="ps-lev">
        <span>250×</span>
        <span className="on">500×</span>
        <span>1000×</span>
      </div>
    </div>
  )
}

function ScreenBattle() {
  const reduce = useReducedMotion()
  return (
    <div className="ps-pad">
      <div className="ps-clock">0:42</div>
      {[
        ['nova', 'you · SOL long', 64, '+64%', 'up'],
        ['shark', 'rexx · BTC short', 22, '−22%', 'down'],
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
      <img className="ps-trophy" src="/art/win-trophy.webp" alt="" width="110" height="110" />
      <span className="ps-note">best % at the bell takes the pot</span>
    </div>
  )
}
