import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MARKETS, useLivePrice, type Market, type Tick } from './useLivePrice'
import { Money } from '../Money'
import { recordResult } from './record'
import { ClayLoop } from '../ClayLoop'

// The Arena: a free Knockout Duel practice on real prices, played the way the app's quick match works
// (specs/clashy-onchain.md §1): you get matched, ONE coin is rolled for both of you, each picks long or
// short, and the best % in 60 s wins unless someone hits their knockout line first. In the app the roll
// is MagicBlock VRF; here it's a device-random "practice roll" and the practice rival takes the other side.
// No wallet, no money, nothing on-chain. Prices: live Binance spot trades.

type Side = 'long' | 'short'
type Phase = 'idle' | 'rolling' | 'pick' | 'live' | 'done'
type Pick = { side: Side; lev: number }
type Result = { winner: 'you' | 'rival' | 'draw'; how: 'ko' | 'bell' | 'void'; you: number; rival: number; at: number }

const LEVS = [250, 500, 1000]
const DURATION = 60_000

const koPrice = (entry: number, p: Pick) => (p.side === 'long' ? entry * (1 - 1 / p.lev) : entry * (1 + 1 / p.lev))
const pnl = (entry: number, price: number, p: Pick) => Math.max(-100, (p.side === 'long' ? 1 : -1) * (price / entry - 1) * p.lev * 100)
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`
const decimals = (p: number) => (p >= 1000 ? 2 : p >= 10 ? 3 : 4)

export function CoinLogo({ m, size = 22 }: { m: Market; size?: number }) {
  return <img className="coin-logo" src={`/coins/${m.id}.webp`} alt="" width={size} height={size} />
}

export function ArenaWidget() {
  const [coin, setCoin] = useState<Market>(MARKETS[0])
  const [spin, setSpin] = useState(0)
  const feed = useLivePrice(coin)
  const [phase, setPhase] = useState<Phase>('idle')
  const [you, setYou] = useState<Pick>({ side: 'long', lev: 500 })
  const [rival, setRival] = useState<Pick>({ side: 'short', lev: 500 })
  const [entry, setEntry] = useState<{ price: number; t: number } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const finished = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // matchmaking + the practice roll: cycle the coins, land on one at random
  const findDuel = () => {
    setResult(null)
    setEntry(null)
    setPhase('rolling')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const final = MARKETS[Math.floor(Math.random() * MARKETS.length)]
    const steps = reduce ? 0 : 12
    for (let i = 0; i < steps; i++) timers.current.push(setTimeout(() => setSpin(i), 60 + i * i * 9))
    timers.current.push(
      setTimeout(
        () => {
          setCoin(final)
          setPhase('pick')
        },
        reduce ? 0 : 60 + steps * steps * 9 + 120,
      ),
    )
  }

  const start = () => {
    if (feed.price == null) return
    setRival({ side: you.side === 'long' ? 'short' : 'long', lev: LEVS[Math.floor(Math.random() * LEVS.length)] })
    setEntry({ price: feed.price, t: Date.now() })
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
        recordResult({ t: Date.now(), market: coin.label, side: you.side, lev: you.lev, result: res.winner === 'you' ? 'win' : res.winner === 'rival' ? 'loss' : 'draw', how: res.how, pnl: res.you })
    },
    [coin.label, you],
  )

  useEffect(() => {
    if (phase !== 'live' || !entry || feed.price == null) return
    const t = Date.now()
    setNow(t)
    const elapsed = t - entry.t
    const yp = pnl(entry.price, feed.price, you)
    const rp = pnl(entry.price, feed.price, rival)
    if (feed.state !== 'live') finish({ winner: 'draw', how: 'void', you: yp, rival: rp, at: elapsed })
    else if (yp <= -100) finish({ winner: 'rival', how: 'ko', you: -100, rival: rp, at: elapsed })
    else if (rp <= -100) finish({ winner: 'you', how: 'ko', you: yp, rival: -100, at: elapsed })
    else if (elapsed >= DURATION) finish({ winner: yp > rp ? 'you' : rp > yp ? 'rival' : 'draw', how: 'bell', you: yp, rival: rp, at: DURATION })
  }, [feed.ticks, phase, entry, feed.price, feed.state, you, rival, finish])

  const yp = result ? result.you : entry && feed.price != null ? pnl(entry.price, feed.price, you) : 0
  const rp = result ? result.rival : entry && feed.price != null ? pnl(entry.price, feed.price, rival) : 0
  const left = entry ? Math.max(0, DURATION - ((result ? entry.t + result.at : now) - entry.t)) : DURATION
  const rolled = phase !== 'idle' && phase !== 'rolling'
  const shown = phase === 'rolling' ? MARKETS[spin % MARKETS.length] : coin

  return (
    <div className="arena">
      <div className="arena-top">
        <div className={`roll${phase === 'rolling' ? ' spinning' : ''}`} aria-live="polite">
          <span className="roll-k">{phase === 'idle' ? 'Coin' : phase === 'rolling' ? 'Rolling…' : 'Rolled'}</span>
          {phase === 'idle' ? (
            <span className="roll-q">?</span>
          ) : (
            <span className="roll-coin">
              <CoinLogo m={shown} size={26} />
              {shown.label}
            </span>
          )}
        </div>
        <div className="arena-price">
          {rolled && feed.price != null ? <Money value={feed.price} decimals={decimals(feed.price)} className="arena-big" /> : <span className="arena-big cents">{rolled ? '…' : '—'}</span>}
          <span className="arena-pair">{rolled ? `${coin.label}/USDT · both players` : 'One coin, rolled for both players'}</span>
        </div>
        <span className={`feed feed-${rolled ? feed.state : 'connecting'}`}>
          <i />
          {rolled ? (feed.state === 'live' ? 'Live · Binance spot' : feed.state === 'error' ? 'Feed down' : 'Connecting') : 'Practice roll'}
        </span>
      </div>

      {feed.error && rolled && (
        <div className="arena-error" role="alert">
          {feed.error} The Arena needs live prices, so duels are paused.
        </div>
      )}

      <div className="arena-body">
        <div className="arena-charts single">
          {rolled ? (
            <Pane coin={coin} ticks={feed.ticks} entry={entry} you={you} rival={rival} live={phase === 'live' || phase === 'done'} />
          ) : (
            <div className="roll-stage">
              <div className="roll-coins">
                {MARKETS.map((m, i) => (
                  <img key={m.id} className={phase === 'rolling' && spin % MARKETS.length === i ? 'on' : ''} src={`/coins/${m.id}.webp`} alt="" width="64" height="64" />
                ))}
              </div>
              <p>{phase === 'rolling' ? 'Rolling the coin…' : 'Get matched. One coin is rolled for both of you. Then pick your side.'}</p>
            </div>
          )}
          {phase === 'done' && result && <ResultCard result={result} onAgain={findDuel} />}
        </div>

        <div className="arena-panel">
          {phase === 'idle' || phase === 'rolling' ? (
            <>
              <div className="rival-note panel-sec">
                <img src="/art/av-shark.webp" alt="" width="36" height="36" />
                <p>
                  Quick match against a <b>practice rival</b>. In the app it's a real person and the coin is rolled by MagicBlock VRF.
                </p>
              </div>
              <button className="btn btn-white arena-go" onClick={findDuel} disabled={phase === 'rolling'}>
                {phase === 'rolling' ? 'Matching…' : 'Find a duel'}
              </button>
              <p className="panel-fine">Free practice. No wallet, no money, nothing on-chain.</p>
            </>
          ) : phase === 'pick' || phase === 'done' ? (
            <>
              <div className="panel-sec">
                <span className="panel-k">Your side on {coin.label}</span>
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
              {phase === 'pick' ? (
                <button className="btn btn-white arena-go" disabled={feed.state !== 'live' || feed.price == null} onClick={start}>
                  {feed.state === 'live' ? 'Lock side · start 60 s' : 'Waiting for live price…'}
                </button>
              ) : (
                <button className="btn btn-white arena-go" onClick={findDuel}>
                  Find another duel
                </button>
              )}
              <p className="panel-fine">The practice rival takes the other side.</p>
            </>
          ) : (
            <>
              <div className="clock">
                <span className="num">0:{String(Math.ceil(left / 1000)).padStart(2, '0')}</span>
                <div className="clock-bar">
                  <i style={{ width: `${(1 - left / DURATION) * 100}%` }} />
                </div>
              </div>
              <PlayerRow name="you" img="/art/av-nova.webp" p={you} v={yp} tone="you" room={entry && feed.price != null ? roomPct(entry.price, feed.price, you) : 0} />
              <PlayerRow name="practice rival" img="/art/av-shark.webp" p={rival} v={rp} tone="opp" room={entry && feed.price != null ? roomPct(entry.price, feed.price, rival) : 0} />
              <p className="panel-fine">Same coin, one clock. Hit your line and you're out.</p>
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

function PlayerRow({ name, img, p, v, tone, room }: { name: string; img: string; p: Pick; v: number; tone: 'you' | 'opp'; room: number }) {
  return (
    <div className={`prow ${tone}`}>
      <img src={img} alt="" width="40" height="40" />
      <div className="prow-id">
        <b>{name}</b>
        <span className="prow-pick">
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
      {result.how === 'ko' && <ClayLoop name="ko-moment" once className="result-art clay-vid" size={150} />}
      {result.how === 'bell' && result.winner === 'you' && <ClayLoop name="win-loop" className="result-art clay-vid" size={140} />}
      <b>{title}</b>
      <span className="num">
        you {fmtPct(result.you)} · rival {fmtPct(result.rival)} · {Math.round(result.at / 1000)} s
      </span>
      <button className="btn btn-dark btn-sm" onClick={onAgain}>
        Find another duel
      </button>
    </div>
  )
}

function Pane({ coin, ticks, entry, you, rival, live }: { coin: Market; ticks: Tick[]; entry: { price: number; t: number } | null; you: Pick; rival: Pick; live: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 700, h: 320 })
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
  return (
    <div className="pane you">
      <div className="pane-head">
        <span className="pane-coin">
          <CoinLogo m={coin} size={16} /> {coin.label} · both players
        </span>
      </div>
      <div className="pane-chart" ref={box}>
        <ChartSvg ticks={ticks} entry={entry} you={you} rival={rival} live={live} W={size.w} H={size.h} />
      </div>
    </div>
  )
}

const PAD = { l: 8, r: 78, t: 14, b: 14 }

function ChartSvg({ ticks, entry, you, rival, live, W, H }: { ticks: Tick[]; entry: { price: number; t: number } | null; you: Pick; rival: Pick; live: boolean; W: number; H: number }) {
  const view = useMemo(() => {
    if (!ticks.length) return null
    const end = ticks[ticks.length - 1].t
    const t1 = live && entry ? Math.max(end, entry.t + DURATION) : end
    const t0 = live && entry ? entry.t - 30_000 : end - 90_000
    const pts = ticks.filter((k) => k.t >= t0)
    if (!pts.length) return null
    let lo = Math.min(...pts.map((k) => k.p))
    let hi = Math.max(...pts.map((k) => k.p))
    const lines: { y: number; color: string; label: string; below: boolean }[] = []
    if (live && entry) {
      const ky = koPrice(entry.price, you)
      const kr = koPrice(entry.price, rival)
      lo = Math.min(lo, ky, kr)
      hi = Math.max(hi, ky, kr)
      lines.push(
        { y: ky, color: '#8592FF', label: 'your KO', below: you.side === 'long' },
        { y: kr, color: '#F0468C', label: 'rival KO', below: rival.side === 'long' },
        { y: entry.price, color: 'rgba(255,255,255,.35)', label: 'entry', below: false },
      )
    }
    const padY = (hi - lo) * 0.14 || hi * 0.0002
    lo -= padY
    hi += padY
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r)
    const y = (p: number) => PAD.t + ((hi - p) / (hi - lo)) * (H - PAD.t - PAD.b)
    const d = pts.map((k, i) => `${i ? 'L' : 'M'}${x(k.t).toFixed(1)},${y(k.p).toFixed(1)}`).join(' ')
    return { d, x, y, lines, lastPt: pts[pts.length - 1] }
  }, [ticks, entry, you, rival, live, W, H])

  if (!view) return <div className="chart-empty">Loading live price…</div>
  const { d, x, y, lines, lastPt } = view
  const dec = decimals(lastPt.p)
  const area = `${d} L${x(lastPt.t).toFixed(1)},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart-svg" role="img" aria-label="Live price chart with both knockout lines">
      <defs>
        <linearGradient id="ar-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5B6CFF" stopOpacity="0.2" />
          <stop offset="1" stopColor="#5B6CFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {lines.map((l) => (
        <g key={l.label}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(l.y)} y2={y(l.y)} stroke={l.color} strokeWidth="1.5" strokeDasharray={l.label === 'entry' ? '2 4' : '7 6'} />
          <rect x={W - PAD.r + 4} y={y(l.y) - 11} width={PAD.r - 6} height="22" rx="6" fill="#111113" stroke={l.color} strokeOpacity="0.55" />
          <text x={W - PAD.r + 9} y={y(l.y) + 4} fill={l.label === 'entry' ? '#8E8E98' : l.color} fontSize="11" fontWeight="600" fontFamily="Inter">
            {l.y.toFixed(dec)}
          </text>
          {l.label !== 'entry' && (
            <text x={W - PAD.r - 8} y={y(l.y) + (l.below ? 16 : -7)} textAnchor="end" fill={l.color} fontSize="12" fontWeight="600" fontFamily="Inter">
              {l.label}
            </text>
          )}
        </g>
      ))}
      <path d={area} fill="url(#ar-fill)" />
      <path d={d} fill="none" stroke="#F5F5F7" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r="9" fill="#5B6CFF" opacity="0.25" />
      <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r="4" fill="#fff" />
    </svg>
  )
}
