import { useEffect, useState } from 'react'
import { StoreBadges } from './StoreBadges'

const LINKS = [
  ['Arena', '#arena'],
  ['Duels', '#features'],
  ['Clans', '#features'],
  ['vs the house', '#house'],
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 16)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={`nav${scrolled ? ' scrolled' : ''}`}>
      <div className="nav-in">
        <a className="wordmark-sm" href="#top" aria-label="clashy home">
          <img src="/art/icon-128.webp" alt="" width="28" height="28" />
          clashy
        </a>
        <nav className="nav-links" aria-label="Sections">
          {LINKS.map(([l, h]) => (
            <a key={l} href={h}>
              {l}
            </a>
          ))}
        </nav>
        <div className="nav-right">
          <StoreBadges size="sm" stores={['apple', 'google']} />
          <a className="btn btn-dark btn-sm" href="#arena">
            Play
          </a>
        </div>
      </div>
    </header>
  )
}
