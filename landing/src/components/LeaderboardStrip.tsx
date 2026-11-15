import { useEffect, useState } from 'react'
import { RECORD_EVENT, clearRecords, readRecords, type DuelRecord } from './arena/record'

// Your Arena record in this browser. Real results of the demo duels you played here, nothing else.
export function LeaderboardStrip({ compact = false }: { compact?: boolean }) {
  const [rows, setRows] = useState<DuelRecord[]>(() => readRecords())
  useEffect(() => {
    const on = (e: Event) => setRows((e as CustomEvent<DuelRecord[]>).detail)
    window.addEventListener(RECORD_EVENT, on)
    return () => window.removeEventListener(RECORD_EVENT, on)
  }, [])

  const wins = rows.filter((r) => r.result === 'win').length
  const losses = rows.filter((r) => r.result === 'loss').length
  let streak = 0
  for (const r of rows) {
    if (r.result === 'win') streak++
    else break
  }
  const best = rows.length ? Math.max(...rows.map((r) => r.pnl)) : null

  if (!rows.length)
    return (
      <div className={`lb lb-empty${compact ? ' compact' : ''}`}>
        <img src="/art/empty-duels.webp" alt="" width="72" height="72" loading="lazy" />
        <div>
          <b>No demo duels yet</b>
          <span>Play one in the Arena. Your record in this browser shows up here.</span>
        </div>
      </div>
    )

  return (
    <div className={`lb${compact ? ' compact' : ''}`}>
      <div className="lb-stats">
        <div>
          <span>Wins</span>
          <b className="num">{wins}</b>
        </div>
        <div>
          <span>Losses</span>
          <b className="num">{losses}</b>
        </div>
        <div>
          <span>Streak</span>
          <b className="num">{streak}</b>
        </div>
        <div>
          <span>Best P&amp;L</span>
          <b className={`num ${best != null && best >= 0 ? 'up' : 'down'}`}>{best == null ? '—' : `${best >= 0 ? '+' : ''}${best.toFixed(0)}%`}</b>
        </div>
      </div>
      <ol className="lb-rows">
        {rows.slice(0, compact ? 3 : 6).map((r) => (
          <li key={r.t}>
            <span className={`pill ${r.result}`}>{r.result === 'win' ? 'Won' : r.result === 'loss' ? 'Lost' : 'Draw'}</span>
            <span className="lb-what">
              {r.market} · <span className={r.side === 'long' ? 'up' : 'down'}>{r.side === 'long' ? 'Long' : 'Short'}</span> {r.lev}× · {r.how === 'ko' ? 'KO' : 'bell'}
            </span>
            <span className={`num ${r.pnl >= 0 ? 'up' : 'down'}`}>
              {r.pnl >= 0 ? '+' : ''}
              {r.pnl.toFixed(0)}%
            </span>
          </li>
        ))}
      </ol>
      {!compact && (
        <button className="lb-clear" onClick={clearRecords}>
          Clear this browser's record
        </button>
      )}
    </div>
  )
}
