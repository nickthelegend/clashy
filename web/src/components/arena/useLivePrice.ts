import { useEffect, useRef, useState } from 'react'

// Live spot price from Binance's public market-data endpoints (no key, CORS open):
//   history: GET https://data-api.binance.vision/api/v3/klines?interval=1s
//   live:    wss://data-stream.binance.vision/ws/<symbol>@trade
// Real prices only. If the feed can't be reached the hook reports an error; it never invents a price.

export type Market = { id: string; label: string; symbol: string }
export const MARKETS: Market[] = [
  { id: 'sol', label: 'SOL', symbol: 'SOLUSDT' },
  { id: 'btc', label: 'BTC', symbol: 'BTCUSDT' },
  { id: 'eth', label: 'ETH', symbol: 'ETHUSDT' },
]

export type Tick = { t: number; p: number }
export type FeedState = 'connecting' | 'live' | 'stale' | 'error'

const HISTORY_SECONDS = 120
const STALE_MS = 8000

export function useLivePrice(market: Market) {
  const [ticks, setTicks] = useState<Tick[]>([])
  const [state, setState] = useState<FeedState>('connecting')
  const [error, setError] = useState<string | null>(null)
  const last = useRef<Tick | null>(null)

  useEffect(() => {
    let alive = true
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const buf: Tick[] = []
    last.current = null
    setTicks([])
    setState('connecting')
    setError(null)

    const push = (t: Tick) => {
      // one point per 250 ms keeps the chart smooth without thousands of points
      const prev = buf[buf.length - 1]
      if (prev && t.t - prev.t < 250) buf[buf.length - 1] = { t: prev.t, p: t.p }
      else buf.push(t)
      const cutoff = t.t - HISTORY_SECONDS * 1000
      while (buf.length && buf[0].t < cutoff) buf.shift()
      last.current = t
    }

    fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${market.symbol}&interval=1s&limit=${HISTORY_SECONDS}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Binance history HTTP ${r.status}`)
        return r.json() as Promise<[number, string, string, string, string][]>
      })
      .then((rows) => {
        if (!alive) return
        rows.forEach((k) => push({ t: k[0], p: Number(k[4]) }))
        setTicks([...buf])
      })
      .catch((e: Error) => alive && setError(`Price history unavailable: ${e.message}`))

    const connect = () => {
      ws = new WebSocket(`wss://data-stream.binance.vision/ws/${market.symbol.toLowerCase()}@trade`)
      ws.onopen = () => {
        attempts = 0
        if (alive) {
          setState('live')
          setError(null)
        }
      }
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data as string) as { T: number; p: string }
        push({ t: d.T, p: Number(d.p) })
      }
      ws.onerror = () => {
        if (alive) setError('Live price feed (Binance) could not be reached.')
      }
      ws.onclose = () => {
        if (!alive) return
        setState('error')
        attempts++
        if (attempts <= 5) retry = setTimeout(connect, Math.min(8000, 1000 * attempts))
        else setError('Live price feed (Binance) is down. Try again later.')
      }
    }
    connect()

    // publish to React at 8 fps
    const iv = setInterval(() => {
      if (!alive) return
      setTicks([...buf])
      const l = last.current
      if (l && Date.now() - l.t > STALE_MS) setState((s) => (s === 'live' ? 'stale' : s))
      else if (l) setState((s) => (s === 'stale' ? 'live' : s))
    }, 125)

    return () => {
      alive = false
      clearInterval(iv)
      clearTimeout(retry)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [market.symbol])

  const price = ticks.length ? ticks[ticks.length - 1].p : null
  return { ticks, price, state, error }
}
