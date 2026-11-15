// fomo.family's hero: giant lowercase wordmark, one line, one sub line, a CTA pair, then one cinematic object.
export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy wrap">
        <div className="wordmark-xl" aria-hidden="true">
          clashy
        </div>
        <h1>trade against people, not the house.</h1>
        <p>Knockout duels, draw-the-line rooms and clan wars on real markets.</p>
        <div className="cta-pair">
          <a className="btn btn-primary" href="#arena">
            Play the arena
          </a>
          <a className="btn btn-dark" href="#download">
            Download app
          </a>
        </div>
      </div>
      <div className="hero-art">
        <img src="/art/hero-scene.webp" alt="Two dark glass swords crossed in an X, lit by an indigo rim light" width="1536" height="1024" fetchPriority="high" />
      </div>
    </section>
  )
}
