import { StoreBadges } from './StoreBadges'
import { Wordmark } from './Wordmark'

const COLS: [string, [string, string][]][] = [
  ['Play', [['Arena (free demo)', '#arena'], ['Knockout duels', '#features'], ['Draw the line', '#features'], ['Clan wars', '#features']]],
  ['Learn', [['vs the house', '#house'], ['MagicBlock docs ↗', 'https://docs.magicblock.gg'], ['Solana ↗', 'https://solana.com']]],
]

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="foot">
          <div className="foot-brand">
            <a className="wordmark-md" href="#top" aria-label="clashy home">
              <Wordmark size={34} />
            </a>
            <p>trade against people, not the house.</p>
            <StoreBadges size="sm" />
          </div>
          {COLS.map(([h, links]) => (
            <div key={h}>
              <h4>{h}</h4>
              <ul>
                {links.map(([l, href]) => (
                  <li key={l}>
                    <a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="fine">
          <span>© 2026 Clashy · clashy.fun · In development: the app and duels for money are not live.</span>
          <span>Leveraged trading is risky. Arena prices: Binance spot. 3D art generated with ChatGPT.</span>
        </div>
      </div>
    </footer>
  )
}
