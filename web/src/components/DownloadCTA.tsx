import { StoreBadges } from './StoreBadges'

// The closing scene (fomo's slot for its crowd photo): two hooded rivals face off across a price line,
// a big centred line over them, then the CTA and the store badges.
export function DownloadCTA() {
  return (
    <section className="closing" id="download">
      <img className="closing-bg" src="/art/faceoff.webp" alt="" width="1600" height="1067" loading="lazy" aria-hidden="true" />
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
