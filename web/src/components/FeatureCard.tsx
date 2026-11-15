import type { ReactNode } from 'react'

// fomo's feature card: small blue caps label, a two-line lowercase title, then a real UI fragment or object.
export function FeatureCard({ label, title, children, art, note }: { label: string; title: ReactNode; children?: ReactNode; art?: string; note?: string }) {
  return (
    <article className="feat reveal">
      <span className="label">{label}</span>
      <h3>{title}</h3>
      <div className="feat-visual">
        {art && <img className="feat-art" src={art} alt="" width="220" height="220" loading="lazy" />}
        {children}
      </div>
      {note && <span className="feat-note">{note}</span>}
    </article>
  )
}

export function FeatureGrid({ children }: { children: ReactNode }) {
  return <div className="feat-grid">{children}</div>
}
