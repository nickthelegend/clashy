import { useEffect } from 'react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { SectionHead } from './components/SectionHead'
import { ArenaWidget } from './components/arena/ArenaWidget'
import { LeaderboardStrip } from './components/LeaderboardStrip'
import { FeatureCard, FeatureGrid } from './components/FeatureCard'
import { CompareStrip } from './components/CompareStrip'
import { DownloadCTA } from './components/DownloadCTA'
import { Footer } from './components/Footer'

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((e) => e.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
}

function useStickyCta() {
  // hide the phone sticky CTA while the Arena (its target) or the closing CTA is on screen
  useEffect(() => {
    const cta = document.querySelector('.sticky-cta')
    const targets = ['#arena', '#download'].map((s) => document.querySelector(s)).filter(Boolean) as Element[]
    if (!cta || !targets.length) return
    const visible = new Set<Element>()
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))
        cta.classList.toggle('hidden', visible.size > 0)
      },
      { threshold: 0.15 },
    )
    targets.forEach((t) => io.observe(t))
    return () => io.disconnect()
  }, [])
}

export default function App() {
  useReveal()
  useStickyCta()
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />

        <section className="section arena-sec" id="arena">
          <img className="arena-bg" src="/art/arena.webp" alt="" width="1600" height="1067" loading="lazy" aria-hidden="true" />
          <div className="wrap">
            <SectionHead
              center
              label="Free demo · real prices"
              title={
                <>
                  step into the arena.
                  <br />
                  one duel, sixty seconds.
                </>
              }
              sub="Pick long or short on the live price against a demo bot. No wallet and no money: the Arena is practice. In the app your rival is a real person and the pot is real."
            />
            <div className="reveal">
              <ArenaWidget />
            </div>
            <div className="arena-record reveal">
              <span className="label">Your record · this browser</span>
              <LeaderboardStrip />
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="wrap">
            <SectionHead title="never trade alone again" sub="the only pvp trading app" />
            <FeatureGrid>
              <FeatureCard label="Leaderboard" title="become a legend, top the leaderboard">
                <LeaderboardStrip compact />
              </FeatureCard>
              <FeatureCard label="Knockout duels" title="1v1 anyone. last one standing takes the pot" art="/art/ko-coin.webp" />
              <FeatureCard label="Draw the line" title="draw the next minute. closest line wins" art="/art/pencil-line.webp" />
              <FeatureCard label="Clan wars" title="your clan vs theirs, a new war every week" note="Design sample" art="/art/flag.webp">
                <div className="tug">
                  <div className="tug-crests">
                    <img src="/art/crest-moon.webp" alt="" width="56" height="56" loading="lazy" />
                    <span>vs</span>
                    <img src="/art/crest-bolt.webp" alt="" width="56" height="56" loading="lazy" />
                  </div>
                  <div className="tug-bar">
                    <i style={{ width: '58%' }} />
                  </div>
                  <div className="tug-names">
                    <span className="you">Night Owls</span>
                    <span className="opp">Degen Inc.</span>
                  </div>
                </div>
              </FeatureCard>
              <FeatureCard label="Servers" title="chart and chat, side by side" note="Design sample">
                <div className="chat">
                  <div className="msg">
                    <img src="/art/av-cat.webp" alt="" width="28" height="28" loading="lazy" />
                    <p>
                      <b>jyu</b> reclaimed the range. who's fading this
                    </p>
                  </div>
                  <div className="msg">
                    <img src="/art/av-shark.webp" alt="" width="28" height="28" loading="lazy" />
                    <p>
                      <b>rexx</b> me. put money on it
                    </p>
                  </div>
                  <div className="challenge">
                    <b>⚔ Knockout duel · SOL · 60 s</b>
                    <span>rexx is short · $20 each</span>
                    <span className="challenge-btn">Accept · go long</span>
                  </div>
                </div>
              </FeatureCard>
              <FeatureCard label="Built on MagicBlock" title="every move on an ephemeral rollup" art="/art/stopwatch.webp">
                <div className="chips">
                  <span>Ephemeral Rollup</span>
                  <span>Private ER</span>
                  <span>VRF</span>
                  <span>Session keys</span>
                </div>
              </FeatureCard>
            </FeatureGrid>
          </div>
        </section>

        <section className="section house" id="house">
          <div className="wrap">
            <SectionHead
              title="your rival's stake. not a house pool."
              sub="Most trading arcades put you against a house pool that keeps your loss. In Clashy the other side is a person, the pot sits in Solana escrow, and the winner takes it."
            />
            <CompareStrip />
          </div>
        </section>

        <DownloadCTA />
      </main>
      <Footer />
      <a className="sticky-cta btn btn-primary" href="#arena">
        Play the arena · free
      </a>
    </>
  )
}
