import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MARKETS, useLivePrice, type Market, type Tick } from './useLivePrice'
import { Money } from '../Money'
import { recordResult } from './record'
import './arena.css'

// The Arena: a free Knockout Duel demo on a real price. You pick a side and leverage; a demo
// bot takes the other side. First to hit their knockout line loses; otherwise better P&L at the
// bell wins. No wallet, no money, nothing on-chain. Prices are live Binance spot trades.

type Side = 'long' | 'short'
type Phase = 'idle' | 'live' | 'done'
type Player = { side: Side; lev: number }
type Result = { winner: 'you' | 'rival' | 'draw'; how: 'ko' | 'bell' | 'void'; you: number; rival: number; at: number }

const LEVS = [250, 500, 1000]
const DURATION = 60_000
const H_DESKTOP = 360
const PAD = { l: 12, r: 92, t: 16, b: 24 }

const koPrice = (entry: number, p: Player) => (p.side === 'long' ? entry * (1 - 1 / p.lev) : entry * (1 + 1 / p.lev))
const pnl = (entry: number, price: number, p: Player) =>
  Math.max(-100, (p.side === 'long' ? 1 : -1) * (price / entry - 1) * p.lev * 100)
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`
const decimals = (p: number) => (p >= 1000 ? 2 : p >= 10 ? 3 : 4)

export function ArenaWidget() {
  const [market, setMarket] = useState<Market>(MARKETS[0])
  const { ticks, price, state, error } = useLivePrice(market)
  const [side, setSide] = useState<Side>('long')
  const [lev, setLev] = useState(500)
  const [phase, setPhase] = useState<Phase>('idle')
  const [entry, setEntry] = useState<{ price: number; t: number } | null>(null)
  const [you, setYou] = useState<Player>({ side: 'long', lev: 500 })
  const [rival, setRival] = useState<Player>({ side: 'short', lev: 500 })
  const [result, setResult] = useState<Result | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const finished = useRef(false)

  const canStart = state === 'live' && price != null && phase !== 'live'

  const start = () => {
    if (price == null) return
    const r: Player = { side: side === 'long' ? 'short' : 'long', lev: LEVS[Math.floor(Math.random() * LEVS.length)] }
    setYou({ side, lev })
    setRival(r)
    setEntry({ price, t: Date.now() })
    setResult(null)
    finished.current = false
    setPhase('live')
  }

  const finish = useCallback(
    (res: Result) => {
      if (finished.current) return
      finished.current = true
      setResult(res)
      setPhase('done')
      if (res.how !== 'void')
        recordResult({ t: Date.now(), market: market.label, side: you.side, lev: you.lev, result: res.winner === 'you' ? 'win' : res.winner === 'rival' ? 'loss' : 'draw', how: res.how, pnl: res.you })
    },
    [market.label, you],
  )

  // duel engine: runs on every published tick while live
  useEffect(() => {
    if (phase !== 'live' || !entry || price == null) return
    const t = Date.now()
    setNow(t)
    const elapsed = t - entry.t
    const yp = pnl(entry.price, price, you)
    const rp = pnl(entry.price, price, rival)
    if (state === 'error' || state === 'stale') {
      finish({ winner: 'draw', how: 'void', you: yp, rival: rp, at: elapsed })
      return
    }
    if (yp <= -100) finish({ winner: 'rival', how: 'ko', you: -100, rival: rp, at: elapsed })
    else if (rp <= -100) finish({ winner: 'you', how: 'ko', you: yp, rival: -100, at: elapsed })
    else if (elapsed >= DURATION)
      finish({ winner: yp > rp ? 'you' : rp > yp ? 'rival' : 'draw', how: 'bell', you: yp, rival: rp, at: DURATION })
  }, [ticks, phase, entry, price, you, rival, state, finish])

  // reset the duel if the market changes
  useEffect(() => {
    setPhase('idle')
    setEntry(null)
    setResult(null)
  }, [market.id])

  const yp = entry && price != null ? (result ? result.you : pnl(entry.price, price, you)) : 0
  const rp = entry && price != null ? (result ? result.rival : pnl(entry.price, price, rival)) : 0
  const left = entry ? Math.max(0, DURATION - ((result ? entry.t + result.at : now) - entry.t)) : DURATION

  return (
    <div className="arena">
      <div className="arena-top">
        <div className="seg" role="tablist" aria-label="Market">
          {MARKETS.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={m.id === market.id}
              className={m.id === market.id ? 'on' : ''}
              onClick={() => phase !== 'live' && setMarket(m)}
              disabled={phase === 'live' && m.id !== market.id}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="arena-price">
          <span className="arena-pair">{market.label}/USDT</span>
          {price != null ? <Money value={price} decimals={decimals(price)} className="arena-big" /> : <span className="arena-big cents">—</span>}
        </div>
        <FeedPill state={state} />
      </div>

      {error && (
        <div className="arena-error" role="alert">
          {error} The Arena needs the live price, so duels are paused.
        </div>
      )}

      <div className="arena-body">
        <div className="arena-chart">
          <Chart ticks={ticks} entry={entry} you={you} rival={rival} live={phase !== 'idle'} dec={price != null ? decimals(price) : 2} />
          {phase === 'done' && result && <ResultCard result={result} onAgain={() => setPhase('idle')} />}
        </div>

        <div className="arena-panel">
          {phase === 'idle' || phase === 'done' ? (
            <>
              <div className="panel-sec">
                <span className="panel-k">Your side</span>
                <div className="sides">
                  <button className={`side long${side === 'long' ? ' on' : ''}`} onClick={() => setSide('long')} aria-pressed={side === 'long'}>
                    ▲ Long
                  </button>
                  <button className={`side short${side === 'short' ? ' on' : ''}`} onClick={() => setSide('short')} aria-pressed={side === 'short'}>
                    ▼ Short
                  </button>
                </div>
              </div>
              <div className="panel-sec">
                <span className="panel-k">
                  Leverage <em>knockout at {(100 / lev).toFixed(2)}% against you</em>
                </span>
                <div className="levs">
                  {LEVS.map((l) => (
                    <button key={l} className={l === lev ? 'on' : ''} onClick={() => setLev(l)} aria-pressed={l === lev}>
                      {l}×
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-sec rival-note">
                <img src="/art/av-shark.webp" alt="" width="36" height="36" />
                <p>
                  Your rival is a <b>demo bot</b>. It takes the other side at a random leverage. In the app, it's a real person.
                </p>
              </div>
              <button className="btn btn-white arena-go" disabled={!canStart} onClick={start}>
                {state === 'live' ? (phase === 'done' ? 'Duel again · 60 s' : 'Start duel · 60 s') : 'Waiting for live price…'}
              </button>
              <p className="panel-fine">Free demo. No wallet, no money, nothing on-chain.</p>
            </>
          ) : (
            <>
              <div className="clock">
                <span className="num">0:{String(Math.ceil(left / 1000)).padStart(2, '0')}</span>
                <div className="clock-bar">
                  <i style={{ width: `${(1 - left / DURATION) * 100}%` }} />
                </div>
              </div>
              <PlayerRow name="you" img="/art/av-racer.webp" p={you} v={yp} tone="you" room={entry && price != null ? roomPct(entry.price, price, you) : 0} />
              <PlayerRow name="demo rival" img="/art/av-shark.webp" p={rival} v={rp} tone="opp" room={entry && price != null ? roomPct(entry.price, price, rival) : 0} />
              <p className="panel-fine">
                Entry <Money value={entry?.price ?? 0} decimals={decimals(entry?.price ?? 1)} /> · first to hit their line loses
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function roomPct(entry: number, price: number, p: Player) {
  const ko = koPrice(entry, p)
  return Math.max(0, (Math.abs(price - ko) / price) * 100)
}

function FeedPill({ state }: { state: string }) {
  const label = state === 'live' ? 'Live · Binance spot' : state === 'stale' ? 'Feed paused' : state === 'error' ? 'Feed down' : 'Connecting'
  return (
    <span className={`feed feed-${state}`} aria-live="polite">
      <i />
      {label}
    </span>
  )
}

function PlayerRow({ name, img, p, v, tone, room }: { name: string; img: string; p: Player; v: number; tone: 'you' | 'opp'; room: number }) {
  return (
    <div className={`prow ${tone}`}>
      <img src={img} alt="" width="40" height="40" />
      <div className="prow-id">
        <b>{name}</b>
        <span>
          <span className={p.side === 'long' ? 'up' : 'down'}>{p.side === 'long' ? 'Long' : 'Short'}</span> · {p.lev}×
        </span>
      </div>
      <div className="prow-v">
        <b className={`num ${v >= 0 ? 'up' : 'down'}`}>{fmtPct(v)}</b>
        <span className="num">KO room {room.toFixed(3)}%</span>
      </div>
    </div>
  )
}

function ResultCard({ result, onAgain }: { result: Result; onAgain: () => void }) {
  const title =
    result.how === 'void'
      ? 'Duel void: the price feed dropped.'
      : result.winner === 'you'
        ? result.how === 'ko'
          ? 'KO. Your rival hit their line.'
          : 'You win at the bell.'
        : result.winner === 'rival'
          ? result.how === 'ko'
            ? 'Knocked out.'
            : 'Rival wins at the bell.'
          : 'Dead even at the bell.'
  return (
    <div className={`result ${result.winner}`} role="status">
      {result.how === 'ko' && <img className="result-art" src="/art/ko-burst.webp" alt="" width="120" height="120" />}
      {result.how === 'bell' && result.winner === 'you' && <img className="result-art" src="/art/crown.webp" alt="" width="110" height="110" />}
      <b>{title}</b>
      <span className="num">
        you {fmtPct(result.you)} · rival {fmtPct(result.rival)} · {Math.round(result.at / 1000)} s
      </span>
      <button className="btn btn-dark btn-sm" onClick={onAgain}>
        Set up another
      </button>
    </div>
  )
}

function Chart(props: { ticks: Tick[]; entry: { price: number; t: number } | null; you: Player; rival: Player; live: boolean; dec: number }) {
  // the SVG's coordinate space follows the box's real size, so labels stay 11-12 px on phones
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 760, h: H_DESKTOP })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width)
      if (w > 0) setSize({ w, h: w < 560 ? 240 : H_DESKTOP })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="chart-box">
      <ChartSvg {...props} W={size.w} H={size.h} />
    </div>
  )
}

function ChartSvg({ ticks, entry, you, rival, live, dec, W, H }: { ticks: Tick[]; entry: { price: number; t: number } | null; you: Player; rival: Player; live: boolean; dec: number; W: number; H: number }) {
  const view = useMemo(() => {
    if (!ticks.length) return null
    const end = ticks[ticks.length - 1].t
    const t1 = live && entry ? Math.max(end, entry.t + DURATION) : end
    const t0 = live && entry ? entry.t - 30_000 : end - 90_000
    const pts = ticks.filter((k) => k.t >= t0)
    let lo = Math.min(...pts.map((k) => k.p))
    let hi = Math.max(...pts.map((k) => k.p))
    const lines: { y: number; color: string; label: string }[] = []
    if (live && entry) {
      const ky = koPrice(entry.price, you)
      const kr = koPrice(entry.price, rival)
      lo = Math.min(lo, ky, kr)
      hi = Math.max(hi, ky, kr)
      lines.push({ y: ky, color: '#8592FF', label: 'your KO' }, { y: kr, color: '#F0468C', label: 'rival KO' }, { y: entry.price, color: 'rgba(255,255,255,.35)', label: 'entry' })
    }
    const padY = (hi - lo) * 0.12 || hi * 0.0002
    lo -= padY
    hi += padY
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r)
    const y = (p: number) => PAD.t + ((hi - p) / (hi - lo)) * (H - PAD.t - PAD.b)
    const d = pts.map((k, i) => `${i ? 'L' : 'M'}${x(k.t).toFixed(1)},${y(k.p).toFixed(1)}`).join(' ')
    const lastPt = pts[pts.length - 1]
    return { d, x, y, lines, lastPt, t0, t1, lo, hi }
  }, [ticks, entry, you, rival, live, W, H])

  if (!view) return <div className="chart-empty">Loading live price…</div>
  const { d, x, y, lines, lastPt } = view
  const area = `${d} L${x(lastPt.t).toFixed(1)},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Live price chart">
      <defs>
        <linearGradient id="ar-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5B6CFF" stopOpacity="0.22" />
          <stop offset="1" stopColor="#5B6CFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="rgba(255,255,255,.05)" />
      ))}
      {live && entry && <line x1={x(entry.t + DURATION)} x2={x(entry.t + DURATION)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,.18)" strokeDasharray="2 5" />}
      {lines.map((l) => (
        <g key={l.label}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(l.y)} y2={y(l.y)} stroke={l.color} strokeWidth="1.5" strokeDasharray={l.label === 'entry' ? '2 4' : '7 6'} />
          <rect x={W - PAD.r + 4} y={y(l.y) - 11} width={PAD.r - 6} height="22" rx="6" fill="#111113" stroke={l.color} strokeOpacity="0.5" />
          <text x={W - PAD.r + 10} y={y(l.y) + 4} fill={l.color === 'rgba(255,255,255,.35)' ? '#8E8E98' : l.color} fontSize="11" fontWeight="600" fontFamily="Inter">
            {l.y.toFixed(dec)}
          </text>
          {l.label !== 'entry' && (
            <text x={W - PAD.r - 8} y={y(l.y) + (l.color === '#8592FF' ? 16 : -7)} textAnchor="end" fill={l.color} fontSize="12" fontWeight="600" fontFamily="Inter">
              {l.label}
            </text>
          )}
        </g>
      ))}
      <path d={area} fill="url(#ar-fill)" />
      <path d={d} fill="none" stroke="#F5F5F7" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r="9" fill="#5B6CFF" opacity="0.25" />
      <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r="4" fill="#fff" />
      {!live && (
        <g>
          <rect x={W - PAD.r + 4} y={y(lastPt.p) - 11} width={PAD.r - 6} height="22" rx="6" fill="#F5F5F7" />
          <text x={W - PAD.r + 10} y={y(lastPt.p) + 4} fill="#000" fontSize="11" fontWeight="700" fontFamily="Inter">
            {lastPt.p.toFixed(dec)}
          </text>
        </g>
      )}
    </svg>
  )
}
