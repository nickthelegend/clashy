import { AnimatePresence, MotionConfig, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MAJORS, fetchLast, fetchMajor, fetchTrending, fmtPct, fmtUsd, usePoll, type Coin, type MajorId } from './lib/markets';

const A = (f: string) => `/a/${f}`;
const SHOT = (f: string) => `/shots/${f}.png`;
const ease = [0.22, 1, 0.36, 1] as const;

function useIsWide(min = 960) {
  const [w, setW] = useState(() => typeof window === 'undefined' || window.innerWidth >= min);
  useEffect(() => { const f = () => setW(window.innerWidth >= min); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, [min]);
  return w;
}

const Reveal = ({ children, delay = 0, y = 32, className, style }: { children: ReactNode; delay?: number; y?: number; className?: string; style?: React.CSSProperties }) => (
  <motion.div className={className} style={style} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.8, ease, delay }}>
    {children}
  </motion.div>
);
const Arrow = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

/* ───────── floating pill nav ───────── */
function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, 'change', (v) => setSolid(v > 40));
  return (
    <motion.header className="pillnav-wrap" initial={{ y: -90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
      <nav className={`pillnav ${solid ? 'solid' : ''}`} aria-label="Main">
        <a href="#top" aria-label="Clashy home" className="pillnav-logo"><img src={A('wordmark.svg')} alt="clashy" /></a>
        <span className="pillnav-sep" />
        <a href="#how" className="pillnav-link">How it works</a>
        <a href="#crew" className="pillnav-link">Games</a>
        <a href="#race" className="pillnav-link">Live race</a>
        <a href="#race" className="pill-cta">Play now</a>
      </nav>
    </motion.header>
  );
}

/* ───────── hero: headline with clay tiles inside the words ───────── */
const Tile = ({ src, bg, delay, rot }: { src: string; bg: string; delay: number; rot: number }) => (
  <motion.span className="htile" style={{ background: bg }} initial={{ scale: 0, rotate: rot * 3 }} animate={{ scale: 1, rotate: rot }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay }} whileHover={{ rotate: 0, scale: 1.08 }}>
    <img src={A(src)} alt="" />
  </motion.span>
);
const W = ({ children, d }: { children: ReactNode; d: number }) => (
  <span className="hw"><motion.span style={{ display: 'inline-block' }} initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: d }}>{children}</motion.span></span>
);

function LiveCard() {
  const majors = usePoll(() => Promise.all([fetchMajor('SOL'), fetchMajor('BTC')]), 6000);
  const [sol, btc] = majors.data ?? [];
  const lead = sol && btc ? (sol.change24h >= btc.change24h ? 0 : 1) : -1;
  return (
    <motion.div className="livecard" initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease, delay: 1.1 }}>
      <div className="livecard-top"><span className="pill pill-live"><span className="dot" />Live prices</span><span className="xs">Coinbase · 24h</span></div>
      <div className="livecard-q">Who is having the better day?</div>
      {majors.error && !sol ? <div className="xs" style={{ color: 'var(--dn)' }}>Price feed: {majors.error}</div> : (
        <div className="livecard-row">
          {[sol, btc].map((c, i) => (
            <a key={i} href="#race" className={`livecard-side ${lead === i ? 'lead' : ''}`}>
              <img src={MAJORS[i].image} alt="" width={28} height={28} />
              <div><div className="livecard-sym">{i === 0 ? 'SOL' : 'BTC'}</div><div className="xs">{c ? fmtUsd(c.price) : '…'}</div></div>
              <div className="livecard-pct" style={{ color: c && c.change24h < 0 ? 'var(--dn)' : 'var(--up)' }}>{c ? fmtPct(c.change24h) : ''}</div>
            </a>
          ))}
        </div>
      )}
      <div className="livecard-foot"><span className="xs">Race them live for 60 seconds</span><a href="#race" className="xs" style={{ color: 'var(--b2)', fontWeight: 650 }}>Start →</a></div>
    </motion.div>
  );
}

function Hero() {
  const { scrollY } = useScroll();
  const artY = useTransform(scrollY, [0, 800], [0, -60]);
  return (
    <section className="hero2" id="top">
      <div className="hero2-glow" />
      <div className="wrap" style={{ textAlign: 'center' }}>
        <h1 className="hero2-h">
          <W d={0.2}>Trade</W> <Tile src="avatar-cat.png" bg="#5B6CFF" delay={0.55} rot={-8} /> <W d={0.28}>against</W><br />
          <W d={0.36}>people,</W> <Tile src="vs.png" bg="#F0468C" delay={0.7} rot={7} /> <W d={0.44}>not</W><br />
          <W d={0.52}>the</W> <Tile src="crown.png" bg="#FFC94A" delay={0.85} rot={-6} /> <W d={0.6}><span className="grad">house.</span></W>
        </h1>
        <motion.p className="lead" style={{ margin: '28px auto 0', textAlign: 'center' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.8, ease }}>
          Clashy is a PvP trading game on Solana. You pick any coin, they pick theirs, best move wins. Duels, royales, rooms and week-long clan wars.
        </motion.p>
        <motion.div className="hero-cta" style={{ justifyContent: 'center' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95, duration: 0.8, ease }}>
          <a className="cta" href="#race">Race two coins now <span className="cta-arrow"><Arrow /></span></a>
          <a className="cta-ghost" href="#how"><span className="cta-play">▶</span>See how it works</a>
        </motion.div>
        <motion.div className="hero2-stage" style={{ y: artY }}>
          <motion.img className="hero2-art" src={A('hero-duo.png')} alt="Two clay traders face off over a price chart" initial={{ opacity: 0, scale: 0.9, y: 60 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.2, ease, delay: 0.7 }} />
          <LiveCard />
        </motion.div>
      </div>
    </section>
  );
}

/* ───────── live ticker ───────── */
function Ticker() {
  const majors = usePoll(() => Promise.all(MAJORS.map((m) => fetchMajor(m.id))), 8000);
  const trending = usePoll(() => fetchTrending(14), 30000);
  const items: Coin[] = [...(majors.data ?? []), ...(trending.data ?? [])];
  const err = majors.error ?? trending.error;
  if (!items.length) return <div className="ticker"><div className="wrap" style={{ padding: '16px 24px' }}><span className="sm">{err ? `Live prices unavailable: ${err}` : 'Loading live prices…'}</span></div></div>;
  const row = (k: string) => items.map((c) => (
    <div className="tick" key={k + c.id}>
      {c.image ? <img src={c.image} alt="" loading="lazy" /> : null}
      <span>{c.symbol}</span><span style={{ color: '#b9b9c2' }}>{fmtUsd(c.price)}</span>
      <span style={{ color: c.change24h >= 0 ? 'var(--up)' : 'var(--dn)' }}>{fmtPct(c.change24h)}</span>
    </div>
  ));
  return (
    <div className="ticker" aria-label="Live prices from Coinbase and DexScreener">
      <motion.div className="ticker-track" animate={{ x: ['0%', '-50%'] }} transition={{ duration: items.length * 3.2, ease: 'linear', repeat: Infinity }}>
        {row('a')}{row('b')}
      </motion.div>
    </div>
  );
}

/* ───────── how it works: pinned phone, step tabs, callouts ───────── */
const STEPS = [
  { tab: 'Pick', icon: 'tile-duel.png', n: '01 · Pick', t: 'Pick any coin.', b: 'SOL, BTC, ETH or the newest Solana memecoin. Your opponent picks their own. Set a stake and leverage.', shot: 'amount', chips: ['Any coin, on both sides', 'Stake $5 to $50', '25×, 50× or 100× leverage'] },
  { tab: 'Duel', icon: 'vs.png', n: '02 · Duel', t: 'Sixty seconds. Live.', b: 'Both lines race from 0% on the same clock. Your health bar drains as you get close to your knockout line.', shot: 'duel', chips: ['Live price every second', 'Health bars, fighting-game style', 'Cash out any time'] },
  { tab: 'Win', icon: 'win-trophy.png', n: '03 · Win', t: 'Best % takes the pot.', b: 'Touch your knockout line and you are out. Survive and beat their move at the bell, and the pot is yours.', shot: 'royale', chips: ['Settled on Solana', 'No house on the other side', 'Rematch in one tap'] },
  { tab: 'Climb', icon: 'crown.png', n: '04 · Climb', t: 'Climb the season.', b: 'Every win moves you up the ladder, Bronze to Legend. Medals for the top of every season.', shot: 'leaderboard', chips: ['Six rank tiers', 'Season medals', 'Friends-only boards'] },
];
function StepCallout({ s }: { s: (typeof STEPS)[number] }) {
  return (
    <div className="callout">
      <img src={A(s.icon)} alt="" className="callout-ic" />
      <div><div className="xs" style={{ color: '#6b6b76' }}>{s.n}</div><div className="callout-t">{s.t}</div><p className="callout-b">{s.b}</p></div>
    </div>
  );
}
function How() {
  const wide = useIsWide();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [i, setI] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setI(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length * 0.999)))));
  const s = STEPS[i];
  const head = (
    <div className="how-head">
      <h2 className="h-l">Pick a coin. Duel a person.<br />Take the pot.</h2>
      <p className="lead" style={{ margin: '14px auto 0', color: '#E4E7FF' }}>Four moves, about a minute. Every screen here is the real app.</p>
    </div>
  );
  if (!wide) {
    return (
      <section className="how" id="how">
        <div className="wrap" style={{ padding: '96px 16px' }}>
          {head}
          {STEPS.map((x) => (
            <Reveal key={x.tab} style={{ marginTop: 48 }}>
              <div className="phone-sm"><img src={SHOT(x.shot)} alt={x.t} loading="lazy" /></div>
              <StepCallout s={x} />
            </Reveal>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="how" id="how" ref={ref} style={{ height: `${STEPS.length * 85 + 60}vh` }}>
      <div className="how-pin">
        {head}
        <div className="how-stage">
          <div className="how-chips">
            <AnimatePresence mode="wait">
              <motion.div key={s.tab} initial="h" animate="v" exit="h" variants={{ v: { transition: { staggerChildren: 0.07 } } }}>
                {s.chips.map((c) => (
                  <motion.div key={c} className="chip-check" variants={{ h: { opacity: 0, x: -20 }, v: { opacity: 1, x: 0 } }}><span className="chip-tick">✓</span>{c}</motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="how-phone">
            <div className="phone how-device">
              <div style={{ aspectRatio: '390 / 844' }} />
              <AnimatePresence mode="popLayout">
                <motion.img key={s.shot} className="how-screen" src={SHOT(s.shot)} alt={s.t} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease }} />
              </AnimatePresence>
            </div>
            <div className="seg">
              {STEPS.map((x, k) => (
                <span key={x.tab} className={`seg-i ${k === i ? 'on' : ''}`}>{k === i ? <motion.span layoutId="seg" className="seg-bg" transition={{ type: 'spring', stiffness: 400, damping: 32 }} /> : null}<span style={{ position: 'relative' }}>{x.tab}</span></span>
              ))}
            </div>
          </div>
          <div className="how-callout">
            <span className="how-line"><span className="how-knob" /></span>
            <AnimatePresence mode="wait">
              <motion.div key={s.tab} initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.45, ease }}>
                <StepCallout s={s} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── games rail: vertical scroll drives it sideways ───────── */
const RAIL = [
  { k: '01 · Knockout duel', t: 'One minute. One winner.', b: 'You pick any coin, they pick theirs. Leverage up, survive the knockout line, best % takes the pot.', bg: '#8E9AFF', ink: '#0B0E3A', art: 'tile-duel.png', shot: 'duel' },
  { k: '02 · Draw the line', t: 'Draw the next minute.', b: 'Trace where the price goes with your finger. The real price draws over everyone. Closest line wins.', bg: '#FF8DBB', ink: '#3A0B1E', art: 'tile-line.png', shot: 'line' },
  { k: '03 · Royale', t: 'Up or down. Last one standing.', b: 'A call every 10 seconds. Wrong call costs a life. The whole screen is the button.', bg: '#FFD66B', ink: '#3A2A00', art: 'tile-royale.png', shot: 'royale' },
  { k: '04 · Clan war', t: 'Bring the group chat.', b: 'Clan vs clan for a week. Every coin is a tile on the map. Beat the other clan on it to own it.', bg: '#7FE3A0', ink: '#08321A', art: 'clan-banner.png', shot: 'war' },
  { k: '05 · Bounty', t: 'Put a price on your head.', b: 'Stake a reward on your week. Hunters pay to try and beat it. Survive and keep it all.', bg: '#8FD3FF', ink: '#062A3D', art: 'tile-bounty.png', shot: 'bounty' },
  { k: '06 · Your record', t: 'Bronze to Legend.', b: 'Six rank tiers, season medals and a record that is yours. Friends-only boards too.', bg: '#FFB38A', ink: '#3A1606', art: 'win-trophy.png', shot: 'leaderboard' },
];
function RailCard({ c }: { c: (typeof RAIL)[number] }) {
  return (
    <motion.article className="rcard" style={{ background: c.bg, color: c.ink }} whileHover="hov">
      <div className="rcard-k">{c.k}</div>
      <h3 className="rcard-t">{c.t}</h3>
      <p className="rcard-b">{c.b}</p>
      <div className="rcard-media">
        <motion.img className="rcard-art" src={A(c.art)} alt="" loading="lazy" variants={{ hov: { rotate: -6, scale: 1.06 } }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} />
        <motion.div className="rcard-phone" variants={{ hov: { y: -14 } }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}><img src={SHOT(c.shot)} alt={`${c.t} screen`} loading="lazy" /></motion.div>
      </div>
    </motion.article>
  );
}
function Rail() {
  const wide = useIsWide();
  const ref = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [dist, setDist] = useState(0);
  useLayoutEffect(() => {
    const m = () => { if (track.current) setDist(Math.max(0, track.current.scrollWidth - window.innerWidth + 48)); };
    m(); window.addEventListener('resize', m); return () => window.removeEventListener('resize', m);
  }, [wide]);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -dist]);
  const intro = (
    <div className="rail-intro">
      <span className="kicker">The games</span>
      <h2 className="h-l" style={{ marginTop: 14 }}>Better with<br />your crew.</h2>
      <p className="lead" style={{ marginTop: 18 }}>Five games, one record. Duel a friend, call a royale, go to war with your clan.</p>
    </div>
  );
  if (!wide) {
    return (
      <section className="sec" id="crew">
        <div className="wrap">{intro}</div>
        <div className="rail-native">{RAIL.map((c) => <RailCard key={c.k} c={c} />)}</div>
      </section>
    );
  }
  return (
    <section id="crew" ref={ref} style={{ height: `${RAIL.length * 55 + 100}vh` }}>
      <div className="rail-pin">
        <motion.div className="rail-track" ref={track} style={{ x }}>
          {intro}
          {RAIL.map((c) => <RailCard key={c.k} c={c} />)}
        </motion.div>
      </div>
    </section>
  );
}

/* ───────── live race demo ───────── */
const LEN = 60;
function Race() {
  const [a, setA] = useState<MajorId>('SOL');
  const [b, setB] = useState<MajorId>('BTC');
  const [run, setRun] = useState<'idle' | 'live' | 'done'>('idle');
  const [sa, setSa] = useState<number[]>([]);
  const [sb, setSb] = useState<number[]>([]);
  const [left, setLeft] = useState(LEN);
  const [err, setErr] = useState<string>();
  useEffect(() => {
    if (run !== 'live') return;
    let alive = true;
    const poll = async () => {
      try {
        const [pa, pb] = await Promise.all([fetchLast(a), fetchLast(b)]);
        if (!alive) return;
        setErr(undefined); setSa((s) => [...s, pa]); setSb((s) => [...s, pb]);
      } catch (e) { if (alive) setErr((e as Error).message); }
    };
    poll();
    const h = setInterval(poll, 1000);
    const c = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => { alive = false; clearInterval(h); clearInterval(c); };
  }, [run, a, b]);
  useEffect(() => { if (run === 'live' && left <= 0) setRun('done'); }, [run, left]);
  const start = () => { setSa([]); setSb([]); setLeft(LEN); setRun('live'); };

  const pa = sa.map((v) => ((v - sa[0]) / sa[0]) * 100), pb = sb.map((v) => ((v - sb[0]) / sb[0]) * 100);
  const lastA = pa[pa.length - 1] ?? 0, lastB = pb[pb.length - 1] ?? 0;
  const CW = 800, CH = 380;
  const mn = Math.min(0, ...pa, ...pb), mx = Math.max(0, ...pa, ...pb), span = Math.max(0.04, mx - mn);
  const lo = mn - span * 0.3, hi = mx + span * 0.3;
  const X = (i: number) => 20 + (i / LEN) * (CW - 70);
  const Y = (v: number) => 20 + (1 - (v - lo) / (hi - lo)) * (CH - 40);
  const d = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const img = (id: MajorId) => MAJORS.find((m) => m.id === id)!.image;
  const winner = lastA === lastB ? null : lastA > lastB ? a : b;
  const Picker = ({ v, set, other, label }: { v: MajorId; set: (x: MajorId) => void; other: MajorId; label: string }) => (
    <div>
      <div className="xs" style={{ marginBottom: 8 }}>{label}</div>
      <div className="picker">{MAJORS.map((m) => <button key={m.id} className={`chip ${v === m.id ? 'on' : ''}`} disabled={m.id === other || run === 'live'} onClick={() => set(m.id)}><img src={m.image} alt="" />{m.id}</button>)}</div>
    </div>
  );
  return (
    <section className="sec" id="race">
      <div className="wrap">
        <div className="sec-head" style={{ textAlign: 'center', alignItems: 'center' }}>
          <Reveal><span className="kicker">Live, right now</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">Race two coins.<br /><span style={{ color: 'var(--mu)' }}>Real prices. 60 seconds.</span></h2></Reveal>
        </div>
        <Reveal className="race">
          <div className="race-side">
            <Picker v={a} set={setA} other={b} label="Your coin" />
            <Picker v={b} set={setB} other={a} label="Their coin" />
            <div className="scoreboard">
              <div><div className="xs">{a}</div><div className="big-num" style={{ color: lastA >= 0 ? 'var(--up)' : 'var(--dn)' }}>{fmtPct(lastA)}</div></div>
              <div className="big-num" style={{ fontSize: 26, color: run === 'live' && left <= 10 ? 'var(--dn)' : 'var(--ink)' }}>{run === 'idle' ? '60' : Math.max(0, left)}</div>
              <div style={{ textAlign: 'right' }}><div className="xs">{b}</div><div className="big-num" style={{ color: lastB >= 0 ? 'var(--up)' : 'var(--dn)' }}>{fmtPct(lastB)}</div></div>
            </div>
            <AnimatePresence mode="wait">
              {run === 'done' ? (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={A(winner === a ? 'win-trophy.png' : 'ko-skull.png')} alt="" width={64} height={64} />
                  <div><div className="h-s">{winner ? (winner === a ? 'Your coin won.' : 'Their coin won.') : 'Dead heat.'}</div><div className="xs">Decided by live Coinbase prices</div></div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <motion.button className="btn btn-b" onClick={start} disabled={run === 'live'} whileTap={{ scale: 0.97 }} style={{ opacity: run === 'live' ? 0.5 : 1 }}>{run === 'live' ? 'Racing…' : run === 'done' ? 'Race again' : 'Start the race'}</motion.button>
            {err ? <div className="xs" style={{ color: 'var(--dn)' }}>Price feed: {err}</div> : <div className="xs">Coinbase Exchange ticker, every second. No money, no sign-up. In the app, the other coin is picked by a real opponent.</div>}
          </div>
          <div className="race-chart">
            <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" height="100%" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
              <line x1="0" x2={CW} y1={Y(0)} y2={Y(0)} stroke="#26262c" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
              {pb.length > 1 ? <><path d={d(pb)} stroke="var(--p)" strokeOpacity=".25" strokeWidth="10" fill="none" vectorEffect="non-scaling-stroke" /><path d={d(pb)} stroke="var(--p)" strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" /></> : null}
              {pa.length > 1 ? <><path d={d(pa)} stroke="var(--b)" strokeOpacity=".3" strokeWidth="11" fill="none" vectorEffect="non-scaling-stroke" /><path d={d(pa)} stroke="var(--b2)" strokeWidth="3.2" fill="none" vectorEffect="non-scaling-stroke" /></> : null}
            </svg>
            {pa.length ? <img src={img(a)} alt="" width={30} height={30} className="race-dot" style={{ left: `${(X(pa.length - 1) / CW) * 100}%`, top: `${(Y(lastA) / CH) * 100}%`, boxShadow: '0 0 0 3px #000, 0 0 0 5px var(--b)' }} /> : null}
            {pb.length ? <img src={img(b)} alt="" width={30} height={30} className="race-dot" style={{ left: `${(X(pb.length - 1) / CW) * 100}%`, top: `${(Y(lastB) / CH) * 100}%`, boxShadow: '0 0 0 3px #000, 0 0 0 5px var(--p)' }} /> : null}
            {run === 'idle' ? (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 16 }}>
                <div><motion.img src={A('coins-pile.png')} alt="" style={{ width: 'min(360px, 66vw)', margin: '0 auto' }} animate={{ y: [0, -10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} /><div className="sm" style={{ marginTop: 6 }}>Pick two coins and start. Both lines race from 0%.</div></div>
              </div>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────── statement with the clay hand holding the real app ───────── */
const HAND_SHOTS = ['home', 'arena', 'duel', 'royale', 'line', 'war'];
function HandPhone({ y }: { y?: MotionValue<number> }) {
  const [k, setK] = useState(0);
  useEffect(() => { const h = setInterval(() => setK((x) => (x + 1) % HAND_SHOTS.length), 2600); return () => clearInterval(h); }, []);
  return (
    <motion.div className="hand" style={{ y }}>
      <img src={A('phone-hand.png')} alt="A hand holding a phone running Clashy" />
      <div className="hand-screen">
        <AnimatePresence mode="popLayout">
          <motion.img key={HAND_SHOTS[k]} src={SHOT(HAND_SHOTS[k])} alt="" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease }} />
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
function Statement() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [90, -50]);
  return (
    <section className="statement" ref={ref}>
      <div className="wrap statement-grid">
        <div>
          <Reveal><h2 className="statement-h">The house always wins.<br /><span className="grad">So we removed it.</span></h2></Reveal>
          <Reveal delay={0.08}><p className="lead" style={{ marginTop: 24 }}>Casinos, perp exchanges and prediction apps put you against the house. In Clashy the other side is a person you can see: your friend, your rival, the other clan.</p></Reveal>
          <Reveal delay={0.14}>
            <ul className="vs-list">
              {[['Who you play', 'A person, never the house'], ['Your coin', 'Any coin, on both sides'], ['Your crew', 'Duels, clans, wars and bounties built in'], ['Speed', 'Every tick on a MagicBlock Ephemeral Rollup']].map(([k, v]) => <li key={k}><span className="xs">{k}</span><span>{v}</span></li>)}
            </ul>
          </Reveal>
        </div>
        <HandPhone y={y} />
      </div>
    </section>
  );
}

/* ───────── tech ───────── */
function Tech() {
  const t = [
    { t: 'Ephemeral Rollups', b: 'Every duel runs on a MagicBlock rollup: price ticks, knockouts and settlement in real time, then committed to Solana.' },
    { t: 'Private rollups', b: 'Your coin pick stays sealed inside a TEE until both players lock in. Nobody copies your call.' },
    { t: 'Verifiable randomness', b: 'Fair matchmaking and the random coin in Royale come from on-chain VRF, so nobody can rig a room.' },
    { t: 'Session keys', b: 'Approve once, play the whole session. No wallet pop-up in the middle of a 60-second duel.' },
  ];
  return (
    <section className="sec" id="tech">
      <div className="wrap">
        <div className="sec-head">
          <Reveal><span className="kicker">Under the hood</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">Real time, on Solana.</h2></Reveal>
          <Reveal delay={0.1}><p className="lead">The on-chain program is being built during MagicBlock Solana Blitz v10. Until it ships, the practice games run on live prices with no money.</p></Reveal>
        </div>
        <div className="tech">
          {t.map((x, k) => <Reveal key={x.t} delay={k * 0.07}><div><span className="num">0{k + 1}</span><h3 className="h-s">{x.t}</h3><p className="sm">{x.b}</p></div></Reveal>)}
        </div>
      </div>
    </section>
  );
}

/* ───────── final CTA + clay footer grid ───────── */
function Final() {
  const cells: (string | null)[] = ['avatar-nova.png', null, 'crest-flame.png', null, null, 'avatar-tiger.png', null, 'medal-1.png', null, 'avatar-panda.png', null, null, 'crest-wolf.png', null, 'avatar-dragon.png', null, 'rank-diamond.png', null, null, 'avatar-skater.png'];
  const tint = ['#5B6CFF', '#F0468C', '#FFC94A', '#30D158', '#8FD3FF', '#FF8A4C'];
  return (
    <section className="final2">
      <div className="wrap final2-grid">
        <Reveal><h2 className="final2-h">Find your rival.<br /><span className="grad">Make the first call.</span></h2></Reveal>
        <Reveal delay={0.1}>
          <div className="final2-side">
            <p className="lead">Clashy is coming to iOS, Android, the Solana dApp Store and the web. The practice games already run on live prices.</p>
            <div className="hero-cta"><a className="cta" href="#race">Race two coins now <span className="cta-arrow"><Arrow /></span></a></div>
            <div className="xs" style={{ marginTop: 14 }}>App Store and Google Play · coming soon</div>
          </div>
        </Reveal>
      </div>
      <footer className="fgrid">
        <div className="fgrid-cells">
          {cells.map((c, i) => (
            <motion.div key={i} className="fcell" style={{ background: c ? tint[i % tint.length] : undefined }} initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 200, damping: 16, delay: (i % 10) * 0.04 }}>
              {c ? <img src={A(c)} alt="" loading="lazy" /> : null}
            </motion.div>
          ))}
        </div>
        <div className="wrap fgrid-bar">
          <img src={A('wordmark.svg')} alt="clashy" style={{ height: 30 }} />
          <div className="fgrid-links">
            <div><span className="xs">PLAY</span><a href="#how">How it works</a><a href="#crew">Games</a><a href="#race">Live race</a></div>
            <div><span className="xs">BUILT ON</span><a href="#tech">MagicBlock</a><a href="#tech">Solana</a></div>
          </div>
          <span className="xs">© 2026 Clashy · in development · prices from Coinbase Exchange and DexScreener</span>
        </div>
      </footer>
    </section>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <How />
        <Rail />
        <Race />
        <Statement />
        <Tech />
        <Final />
      </main>
    </MotionConfig>
  );
}
