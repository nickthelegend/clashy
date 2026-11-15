import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MARKETS, useLivePrice, type Market, type Tick } from './useLivePrice'
import { Money } from '../Money'
import { recordResult } from './record'
import './arena.css'

// The Arena: a free Knockout Duel demo on real prices. A duel is two people, not one shared coin:
// each player picks their own coin, side and leverage, and gets a knockout line on their own chart.
// Hit your line and you lose; otherwise the better % P&L at the bell wins. Your rival here is a demo
// bot that picks its own coin. No wallet, no money, nothing on-chain. Prices: live Binance spot trades.

type Side = 'long' | 'short'
type Phase = 'idle' | 'live' | 'done'
type Pick = { market: Market; side: Side; lev: number }
type Entry = { price: number; t: number }
type Result = { winner: 'you' | 'rival' | 'draw'; how: 'ko' | 'bell' | 'void'; you: number; rival: number; at: number }

const LEVS = [250, 500, 1000]
const DURATION = 60_000

const koPrice = (entry: number, p: Pick) => (p.side === 'long' ? entry * (1 - 1 / p.lev) : entry * (1 + 1 / p.lev))
const pnl = (entry: number, price: number, p: Pick) => Math.max(-100, (p.side === 'long' ? 1 : -1) * (price / entry - 1) * p.lev * 100)
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`
const decimals = (p: number) => (p >= 1000 ? 2 : p >= 10 ? 3 : 4)
// In the app a rival can be on any coin, the same as yours or not. The demo bot always takes a
// different one so the two-coin duel is visible.
const pickRival = (mine: Market): Pick => {
  const others = MARKETS.filter((m) => m.id !== mine.id)
  return pickFrom(others)
}
const pickFrom = (pool: Market[]): Pick => ({
  market: pool[Math.floor(Math.random() * pool.length)],
  side: Math.random() < 0.5 ? 'long' : 'short',
  lev: LEVS[Math.floor(Math.random() * LEVS.length)],
})

export function CoinLogo({ m, size = 22 }: { m: Market; size?: number }) {
  return <img className="coin-logo" src={`/coins/${m.id}.webp`} alt="" width={size} height={size} />
}

export function ArenaWidget() {
  const [you, setYou] = useState<Pick>({ market: MARKETS[0], side: 'long', lev: 500 })
  const [rival, setRival] = useState<Pick>(() => ({ market: MARKETS[1], side: 'short', lev: 500 }))
  const mine = useLivePrice(you.market)
  const theirs = useLivePrice(rival.market)
  const [phase, setPhase] = useState<Phase>('idle')
  const [entries, setEntries] = useState<{ you: Entry; rival: Entry } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const finished = useRef(false)
  const pendingStart = useRef(false)

  const canStart = mine.state === 'live' && mine.price != null && phase !== 'live'

  // Starting: the bot picks its own coin, we wait until that feed is live, then both entries lock together.
  const start = () => {
    if (mine.price == null) return
    finished.current = false
    pendingStart.current = true
    setResult(null)
    setEntries(null)
    setRival(pickRival(you.market))
    setPhase('live')
  }

  useEffect(() => {
    if (!pendingStart.current || phase !== 'live') return
    if (mine.price == null || theirs.price == null || theirs.state !== 'live' || !theirs.ticks.length) return
    if (theirs.symbol !== rival.market.symbol) return
    pendingStart.current = false
    const t = Date.now()
    setEntries({ you: { price: mine.price, t }, rival: { price: theirs.price, t } })
  }, [phase, mine.price, theirs.price, theirs.state, theirs.ticks.length, theirs.symbol, rival.market.symbol])

  const finish = useCallback(
    (res: Result) => {
      if (finished.current) return
      finished.current = true
      setResult(res)
      setPhase('done')
      if (res.how !== 'void')
        recordResult({
          t: Date.now(),
          market: `${you.market.label} vs ${rival.market.label}`,
          side: you.side,
          lev: you.lev,
          result: res.winner === 'you' ? 'win' : res.winner === 'rival' ? 'loss' : 'draw',
          how: res.how,
          pnl: res.you,
        })
    },
    [you, rival],
  )

  // duel engine
  useEffect(() => {
    if (phase !== 'live' || !entries || mine.price == null || theirs.price == null) return
    const t = Date.now()
    setNow(t)
    const elapsed = t - entries.you.t
    const yp = pnl(entries.you.price, mine.price, you)
    const rp = pnl(entries.rival.price, theirs.price, rival)
    if (mine.state !== 'live' || theirs.state !== 'live') finish({ winner: 'draw', how: 'void', you: yp, rival: rp, at: elapsed })
    else if (yp <= -100) finish({ winner: 'rival', how: 'ko', you: -100, rival: rp, at: elapsed })
    else if (rp <= -100) finish({ winner: 'you', how: 'ko', you: yp, rival: -100, at: elapsed })
    else if (elapsed >= DURATION) finish({ winner: yp > rp ? 'you' : rp > yp ? 'rival' : 'draw', how: 'bell', you: yp, rival: rp, at: DURATION })
  }, [mine.ticks, theirs.ticks, phase, entries, mine.price, theirs.price, mine.state, theirs.state, you, rival, finish])

  const yp = result ? result.you : entries && mine.price != null ? pnl(entries.you.price, mine.price, you) : 0
  const rp = result ? result.rival : entries && theirs.price != null ? pnl(entries.rival.price, theirs.price, rival) : 0
  const left = entries ? Math.max(0, DURATION - ((result ? entries.you.t + result.at : now) - entries.you.t)) : DURATION
  const error = mine.error || (phase !== 'idle' ? theirs.error : null)
  const setMarket = (m: Market) => phase !== 'live' && setYou((p) => ({ ...p, market: m }))
  const showRival = phase !== 'idle'

  return (
    <div className="arena">
      <div className="arena-top">
        <div className="seg" role="tablist" aria-label="Your coin">
          {MARKETS.map((m) => (
            <button key={m.id} role="tab" aria-selected={m.id === you.market.id} className={m.id === you.market.id ? 'on' : ''} onClick={() => setMarket(m)} disabled={phase === 'live' && m.id !== you.market.id}>
              <CoinLogo m={m} size={18} />
              {m.label}
            </button>
          ))}
        </div>
        <div className="arena-price">
          <span className="arena-pair">Your coin</span>
          {mine.price != null ? <Money value={mine.price} decimals={decimals(mine.price)} className="arena-big" /> : <span className="arena-big cents">—</span>}
        </div>
        <FeedPill state={mine.state} />
      </div>

      {error && (
        <div className="arena-error" role="alert">
          {error} The Arena needs live prices, so duels are paused.
        </div>
      )}

      <div className="arena-body">
        <div className={`arena-charts${showRival ? '' : ' single'}`}>
          <Pane title="you" tone="you" pick={you} ticks={mine.ticks} entry={entries?.you ?? null} live={!!entries} />
          {showRival && <Pane title="demo rival" tone="opp" pick={rival} ticks={theirs.symbol === rival.market.symbol ? theirs.ticks : []} entry={entries?.rival ?? null} live={!!entries} />}
          {phase === 'live' && !entries && (
            <div className="arena-wait" aria-live="polite">
              Your rival picked {rival.market.label}. Locking both entries…
            </div>
          )}
          {phase === 'done' && result && <ResultCard result={result} onAgain={() => setPhase('idle')} />}
        </div>

        <div className="arena-panel">
          {phase !== 'live' ? (
            <>
              <div className="panel-sec">
                <span className="panel-k">Your side on {you.market.label}</span>
                <div className="sides">
                  <button className={`side long${you.side === 'long' ? ' on' : ''}`} onClick={() => setYou((p) => ({ ...p, side: 'long' }))} aria-pressed={you.side === 'long'}>
                    ▲ Long
                  </button>
                  <button className={`side short${you.side === 'short' ? ' on' : ''}`} onClick={() => setYou((p) => ({ ...p, side: 'short' }))} aria-pressed={you.side === 'short'}>
                    ▼ Short
                  </button>
                </div>
              </div>
              <div className="panel-sec">
                <span className="panel-k">
                  Leverage <em>knockout at {(100 / you.lev).toFixed(2)}% against you</em>
                </span>
                <div className="levs">
                  {LEVS.map((l) => (
                    <button key={l} className={l === you.lev ? 'on' : ''} onClick={() => setYou((p) => ({ ...p, lev: l }))} aria-pressed={l === you.lev}>
                      {l}×
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-sec rival-note">
                <img src="/art/av-shark.webp" alt="" width="36" height="36" />
                <p>
                  Your rival is a <b>demo bot</b> that picks its own coin, side and leverage. Best % in 60 s wins. In the app, it's a real person.
                </p>
              </div>
              <button className="btn btn-white arena-go" disabled={!canStart} onClick={start}>
                {mine.state === 'live' ? (phase === 'done' ? 'Duel again · 60 s' : 'Start duel · 60 s') : 'Waiting for live price…'}
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
              <PlayerRow name="you" img="/art/av-racer.webp" p={you} v={yp} tone="you" room={entries && mine.price != null ? roomPct(entries.you.price, mine.price, you) : 0} />
              <PlayerRow name="demo rival" img="/art/av-shark.webp" p={rival} v={rp} tone="opp" room={entries && theirs.price != null ? roomPct(entries.rival.price, theirs.price, rival) : 0} />
              <p className="panel-fine">Own coins, one clock. Hit your line and you're out.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function roomPct(entry: number, price: number, p: Pick) {
  return Math.max(0, (Math.abs(price - koPrice(entry, p)) / price) * 100)
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

function PlayerRow({ name, img, p, v, tone, room }: { name: string; img: string; p: Pick; v: number; tone: 'you' | 'opp'; room: number }) {
  return (
    <div className={`prow ${tone}`}>
      <img src={img} alt="" width="40" height="40" />
      <div className="prow-id">
        <b>{name}</b>
        <span className="prow-pick">
          <CoinLogo m={p.market} size={14} /> {p.market.label} · <span className={p.side === 'long' ? 'up' : 'down'}>{p.side === 'long' ? 'Long' : 'Short'}</span> · {p.lev}×
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
      ? 'Duel void: a price feed dropped.'
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

function Pane({ title, tone, pick, ticks, entry, live }: { title: string; tone: 'you' | 'opp'; pick: Pick; ticks: Tick[]; entry: Entry | null; live: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 300 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width)
      const h = Math.round(e.contentRect.height)
      if (w > 0 && h > 0) setSize({ w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const last = ticks.length ? ticks[ticks.length - 1].p : null
  return (
    <div className={`pane ${tone}`}>
      <div className="pane-head">
        <span className={`pane-who ${tone}`}>{title}</span>
        <span className="pane-coin">
          <CoinLogo m={pick.market} size={16} />
          {pick.market.label}
          {live && (
            <span className={pick.side === 'long' ? 'up' : 'down'}>
              {' '}
              · {pick.side === 'long' ? 'Long' : 'Short'} {pick.lev}×
            </span>
          )}
        </span>
        {last != null && <Money value={last} decimals={decimals(last)} className="pane-price" />}
      </div>
      <div className="pane-chart" ref={box}>
        <ChartSvg ticks={ticks} entry={entry} pick={pick} live={live} tone={tone} W={size.w} H={size.h} />
      </div>
    </div>
  )
}

const PAD = { l: 8, r: 78, t: 12, b: 12 }

function ChartSvg({ ticks, entry, pick, live, tone, W, H }: { ticks: Tick[]; entry: Entry | null; pick: Pick; live: boolean; tone: 'you' | 'opp'; W: number; H: number }) {
  const ko = tone === 'you' ? '#8592FF' : '#F0468C'
  const view = useMemo(() => {
    if (!ticks.length) return null
    const end = ticks[ticks.length - 1].t
    const t1 = live && entry ? Math.max(end, entry.t + DURATION) : end
    const t0 = live && entry ? entry.t - 30_000 : end - 90_000
    const pts = ticks.filter((k) => k.t >= t0)
    if (!pts.length) return null
    let lo = Math.min(...pts.map((k) => k.p))
    let hi = Math.max(...pts.map((k) => k.p))
    const lines: { y: number; color: string; label: string }[] = []
    if (live && entry) {
      const k = koPrice(entry.price, pick)
      lo = Math.min(lo, k)
      hi = Math.max(hi, k)
      lines.push({ y: k, color: ko, label: 'KO' }, { y: entry.price, color: 'rgba(255,255,255,.35)', label: 'entry' })
    }
    const padY = (hi - lo) * 0.14 || hi * 0.0002
    lo -= padY
    hi += padY
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r)
    const y = (p: number) => PAD.t + ((hi - p) / (hi - lo)) * (H - PAD.t - PAD.b)
    const d = pts.map((k, i) => `${i ? 'L' : 'M'}${x(k.t).toFixed(1)},${y(k.p).toFixed(1)}`).join(' ')
    return { d, x, y, lines, lastPt: pts[pts.length - 1] }
  }, [ticks, entry, pick, live, W, H, ko])

  if (!view) return <div className="chart-empty">Loading live price…</div>
  const { d, x, y, lines, lastPt } = view
  const dec = decimals(lastPt.p)
  const area = `${d} L${x(lastPt.t).toFixed(1)},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`
  const gid = `ar-fill-${tone}`
  const tint = tone === 'you' ? '#5B6CFF' : '#F0468C'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart-svg" role="img" aria-label={`Live ${pick.market.label} price chart`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={tint} stopOpacity="0.2" />
          <stop offset="1" stopColor={tint} stopOpacity="0" />
        </linearGradient>
      </defs>
      {lines.map((l) => (
        <g key={l.label}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(l.y)} y2={y(l.y)} stroke={l.color} strokeWidth="1.5" strokeDasharray={l.label === 'entry' ? '2 4' : '7 6'} />
          <rect x={W - PAD.r + 4} y={y(l.y) - 11} width={PAD.r - 6} height="22" rx="6" fill="#111113" stroke={l.color} strokeOpacity="0.55" />
          <text x={W - PAD.r + 9} y={y(l.y) + 4} fill={l.label === 'entry' ? '#8E8E98' : l.color} fontSize="11" fontWeight="600" fontFamily="Inter">
            {l.y.toFixed(dec)}
          </text>
          {l.label === 'KO' && (
            <text x={W - PAD.r - 8} y={y(l.y) + (pick.side === 'long' ? 16 : -7)} textAnchor="end" fill={l.color} fontSize="12" fontWeight="600" fontFamily="Inter">
              {tone === 'you' ? 'your KO' : 'rival KO'}
            </text>
          )}
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="#F5F5F7" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r="9" fill={tint} opacity="0.25" />
      <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r="4" fill="#fff" />
    </svg>
  )
}
