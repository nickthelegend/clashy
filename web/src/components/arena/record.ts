// This browser's demo duel results. Per-visitor convenience only: never sent anywhere.
export type DuelRecord = {
  t: number
  market: string
  side: 'long' | 'short'
  lev: number
  result: 'win' | 'loss' | 'draw'
  how: 'ko' | 'bell'
  pnl: number
}

const KEY = 'clashy-arena-v1'
export const RECORD_EVENT = 'clashy:arena-result'

export function readRecords(): DuelRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DuelRecord[]) : []
  } catch {
    return []
  }
}

export function recordResult(r: DuelRecord) {
  const all = [r, ...readRecords()].slice(0, 50)
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage blocked: the result still shows on screen */
  }
  window.dispatchEvent(new CustomEvent(RECORD_EVENT, { detail: all }))
}

export function clearRecords() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(RECORD_EVENT, { detail: [] }))
}
