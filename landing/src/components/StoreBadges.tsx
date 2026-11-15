// App store badges. The app isn't released, so they're labelled "coming" and don't link anywhere.
type Store = 'apple' | 'google' | 'solana'
const NAMES: Record<Store, [string, string]> = {
  apple: ['Coming to the', 'App Store'],
  google: ['Coming to', 'Google Play'],
  solana: ['Coming to the', 'dApp Store'],
}

function Icon({ s }: { s: Store }) {
  if (s === 'apple')
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.5 1.3 0 1.7-.8 3.2-.8s1.9.8 3.3.8c1.4 0 2.2-1.2 3-2.5.9-1.4 1.3-2.8 1.3-2.9 0 0-2.5-1-2.5-4zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4z" />
      </svg>
    )
  if (s === 'google')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 3.2v17.6c0 .4.4.6.7.4L19.6 12.4c.3-.2.3-.6 0-.8L4.7 2.8c-.3-.2-.7 0-.7.4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M10 18.5h4" />
    </svg>
  )
}

export function StoreBadge({ store, size = 'md' }: { store: Store; size?: 'sm' | 'md' }) {
  const [small, big] = NAMES[store]
  return (
    <span className={`store store-${size}`} aria-label={`${big}, coming soon`}>
      <Icon s={store} />
      <span>
        <small>{small}</small>
        <b>{big}</b>
      </span>
    </span>
  )
}

export function StoreBadges({ size = 'md', stores = ['apple', 'google', 'solana'] }: { size?: 'sm' | 'md'; stores?: Store[] }) {
  return (
    <div className="stores">
      {stores.map((s) => (
        <StoreBadge key={s} store={s} size={size} />
      ))}
    </div>
  )
}
