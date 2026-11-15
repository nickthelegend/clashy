import type { ReactNode } from 'react'

export function SectionHead({ label, title, sub, center = false }: { label?: string; title: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={`sec-head reveal${center ? ' center' : ''}`}>
      {label && <span className="label">{label}</span>}
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  )
}
