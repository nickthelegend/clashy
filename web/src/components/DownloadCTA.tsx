import { StoreBadges } from './StoreBadges'

// fomo's closing scene: a big centred line over orbiting faces, then the CTA pair.
const OUTER = ['racer', 'hood', 'bot', 'gladiator', 'cat']
const INNER = ['shark', 'bull', 'ghost']

export function DownloadCTA() {
  return (
    <section className="closing" id="download">
      <div className="orbit o1" aria-hidden="true">
        {OUTER.map((n, k) => {
          const a = (k / OUTER.length) * Math.PI * 2 - 0.4
          return <img key={n} src={`/art/av-${n}.webp`} alt="" width="64" height="64" loading="lazy" style={{ left: `calc(50% + ${Math.cos(a) * 50}% - 32px)`, top: `calc(50% + ${Math.sin(a) * 50}% - 32px)` }} />
        })}
      </div>
      <div className="orbit o2" aria-hidden="true">
        {INNER.map((n, k) => {
          const a = (k / INNER.length) * Math.PI * 2 + 0.5
          return <img key={n} src={`/art/av-${n}.webp`} alt="" width="52" height="52" loading="lazy" style={{ left: `calc(50% + ${Math.cos(a) * 50}% - 26px)`, top: `calc(50% + ${Math.sin(a) * 50}% - 26px)` }} />
        })}
      </div>
      <div className="wrap closing-copy reveal">
        <h2>
          a trading game
          <br />
          for the rest of us
        </h2>
        <p>Find a rival, join a clan, settle it in sixty seconds. iOS, Android and the Solana dApp Store.</p>
        <div className="cta-pair">
          <a className="btn btn-primary" href="#arena">
            Play the arena
          </a>
        </div>
        <StoreBadges />
      </div>
    </section>
  )
}
