import { motion, useReducedMotion } from 'framer-motion'
import { ClayLoop } from '../components/ClayLoop'
import { StoreBadges } from '../components/StoreBadges'
import { Wordmark } from '../components/Wordmark'
import { TopNav } from './Top'
import { Footer } from './Bottom'

// /download: the Android APK (a devnet beta build) plus the store plans. The APK link comes from VITE_CLASHY_APK_URL at
// build time; without it the button says the APK is coming, and nothing links to a file that does not exist.
const APK = import.meta.env.VITE_CLASHY_APK_URL as string | undefined
const APK_SIZE = import.meta.env.VITE_CLASHY_APK_SIZE as string | undefined

const LOOPS: [string, string][] = [
  ['tile-duel-loop', '1v1 clashes'],
  ['tile-royale-loop', 'Royales'],
  ['clan-war-loop', 'Squad wars'],
  ['tile-line-loop', 'Draw the Line'],
  ['tile-cup-loop', 'Weekly cup'],
  ['win-loop', 'Paid on Solana'],
]

export function DownloadPage() {
  const reduce = useReducedMotion()
  const up = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.6 } })
  return (
    <>
      <TopNav />
      <main id="main" className="dl">
        <section className="dl-hero wrap">
          <div className="dl-copy">
            <motion.div {...up(0.05)}>
              <Wordmark size={64} />
            </motion.div>
            <motion.h1 className="dl-h" {...up(0.15)}>
              Get Clashy on Android
            </motion.h1>
            <motion.p className="dl-sub" {...up(0.25)}>
              Clash 1v1. Squad up. Play 150+ games. PvP trading on Solana, with MagicBlock's rollup scoring every clash live.
            </motion.p>
            <motion.div className="dl-ctas" {...up(0.35)}>
              {APK ? (
                <a className="btn btn-primary dl-apk" href={APK} download>
                  <AndroidIcon />
                  Download APK
                  {APK_SIZE ? <span className="dl-size">{APK_SIZE}</span> : null}
                </a>
              ) : (
                <span className="btn btn-dark dl-apk" aria-disabled="true">
                  <AndroidIcon />
                  Android APK · coming soon
                </span>
              )}
              <a className="btn btn-ghost" href="/">
                See how it works
              </a>
            </motion.div>
            <motion.p className="dl-note" {...up(0.45)}>
              Devnet beta for Android (arm64). It runs on Solana devnet with test USDC, so no real money moves. To install,
              allow installs from your browser when Android asks. Clashes, chat and live prices need Clashy's servers, which are still
              being brought online, so those parts may show an error for now.
            </motion.p>
            <motion.div {...up(0.55)}>
              <StoreBadges />
            </motion.div>
          </div>
          <motion.div className="dl-phone" {...(reduce ? {} : { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 }, transition: { delay: 0.2, duration: 0.7 } })}>
            <ClayLoop name="hero-duo-loop" className="dl-hero-loop" />
          </motion.div>
        </section>
        <section className="dl-loops wrap" aria-label="What you can play">
          {LOOPS.map(([n, label], i) => (
            <motion.figure key={n} className="dl-tile" {...(reduce ? {} : { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { delay: 0.06 * i, duration: 0.5 } })}>
              <ClayLoop name={n} className="dl-tile-loop" />
              <figcaption>{label}</figcaption>
            </motion.figure>
          ))}
        </section>
      </main>
      <Footer />
    </>
  )
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 00-.83.22l-1.88 3.24a11.43 11.43 0 00-8.94 0L5.65 5.67a.643.643 0 00-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 001 18h22a10.78 10.78 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  )
}
