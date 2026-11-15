// The honest comparison with house-pool arcades (REKT is the one live on Solana).
const ROWS: [string, string, string][] = [
  ['Other side of your trade', 'A shared house liquidity pool', 'Another player, or a clan'],
  ['Where a lost stake goes', 'Into the house pool', 'To whoever beat you, minus a 3% rake'],
  ['Social', 'Solo play', 'Servers, chat, challenges, clans'],
  ['Status', 'Live on Solana mainnet (REKT, beta)', 'In development · Solana Blitz v10'],
]

export function CompareStrip() {
  return (
    <div className="cmp reveal">
      <div className="cmp-row cmp-head">
        <span />
        <span>House-pool apps</span>
        <span className="you">clashy</span>
      </div>
      {ROWS.map(([k, a, b]) => (
        <div className="cmp-row" key={k}>
          <span className="cmp-k">{k}</span>
          <span className="cmp-a" data-k="House-pool apps">
            {a}
          </span>
          <span className="cmp-b" data-k="clashy">
            {b}
          </span>
        </div>
      ))}
      <p className="cmp-note">REKT facts from rekt.money and its public docs, read Nov 15, 2026. A design comparison, not a performance one.</p>
    </div>
  )
}
