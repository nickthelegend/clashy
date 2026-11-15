import { AnimatePresence, MotionConfig, motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MAJORS, fetchLast, fetchMajor, fetchTrending, fmtPct, fmtUsd, usePoll, type Coin, type MajorId } from './lib/markets';

const A = (f: string) => `/a/${f}`;
const SHOT = (f: string) => `/shots/${f}.png`;
const ease = [0.22, 1, 0.36, 1] as const;
const AVATARS = ['cat', 'shark', 'gladiator', 'nova', 'punk', 'panda', 'alien', 'monkey', 'wizard', 'dog', 'cyborg', 'dragon', 'skater', 'tiger', 'ghost', 'bull', 'racer', 'hood', 'bot', 'beanie'];

const Reveal = ({ children, delay = 0, y = 36, className, style }: { children: ReactNode; delay?: number; y?: number; className?: string; style?: React.CSSProperties }) => (
  <motion.div className={className} style={style} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease, delay }}>
    {children}
  </motion.div>
);

/* ───────── nav ───────── */
function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, 'change', (v) => setSolid(v > 24));
  return (
    <motion.header className={`nav ${solid ? 'solid' : ''}`} initial={{ y: -80 }} animate={{ y: 0 }} transition={{ duration: 0.7, ease }}>
      <div className="wrap nav-in">
        <a href="#top" aria-label="Clashy home"><img src={A('wordmark.svg')} alt="clashy" style={{ height: 26 }} /></a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#games">Games</a><a href="#race">Live race</a><a href="#how">How it works</a><a href="#clans">Clans</a><a href="#tech">Tech</a>
        </nav>
        <div className="spacer" />
        <a className="btn btn-w btn-sm" href="#race">Try a live race</a>
      </div>
    </motion.header>
  );
}

/* ───────── hero ───────── */
function Floater({ src, size, x, y, mx, my, depth, delay, rot = 0 }: { src: string; size: number; x: string; y: string; mx: MotionValue<number>; my: MotionValue<number>; depth: number; delay: number; rot?: number }) {
  const tx = useTransform(mx, (v) => v * depth);
  const ty = useTransform(my, (v) => v * depth);
  return (
    <motion.div className="float" style={{ left: x, top: y, x: tx, y: ty, width: size }} initial={{ opacity: 0, scale: 0.4, rotate: rot - 20 }} animate={{ opacity: 1, scale: 1, rotate: rot }} transition={{ type: 'spring', stiffness: 120, damping: 12, delay }}>
      <motion.img src={src} alt="" width={size} height={size} animate={{ y: [0, -14, 0] }} transition={{ duration: 4 + depth * 3, repeat: Infinity, ease: 'easeInOut' }} />
    </motion.div>
  );
}

function Hero() {
  const mx = useSpring(useMotionValue(0), { stiffness: 60, damping: 16 });
  const my = useSpring(useMotionValue(0), { stiffness: 60, damping: 16 });
  const onMove = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 60);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 60);
  };
  const { scrollY } = useScroll();
  const stageY = useTransform(scrollY, [0, 700], [0, 70]);
  const words = ['Trade', 'against', 'people,'];
  return (
    <section className="hero" id="top" onMouseMove={onMove}>
      <div className="hero-glow" />
      <div className="wrap hero-grid">
        <div>
          <motion.div className="pill pill-live" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
            <span className="dot" /> Practice games live on real prices
          </motion.div>
          <h1 className="h-xl" style={{ marginTop: 22 }}>
            {words.map((w, i) => (
              <span key={w} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', marginRight: '0.22em', paddingBottom: '0.12em', marginBottom: '-0.12em' }}>
                <motion.span style={{ display: 'inline-block' }} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: 0.25 + i * 0.09 }}>{w}</motion.span>
              </span>
            ))}
            <br />
            <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.12em', marginBottom: '-0.12em' }}>
              <motion.span className="grad" style={{ display: 'inline-block', paddingBottom: '0.06em' }} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: 0.55 }}>not the house.</motion.span>
            </span>
          </h1>
          <motion.p className="lead" style={{ marginTop: 26 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.8, ease }}>
            Clashy is a PvP trading game on Solana. Knockout duels, draw-the-line rooms, royales and week-long clan wars. You pick any coin, they pick theirs, best move wins.
          </motion.p>
          <motion.div className="hero-cta" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.8, ease }}>
            <a className="btn btn-b" href="#race">Race two coins now</a>
            <a className="btn btn-g" href="#games">See the games</a>
          </motion.div>
          <motion.div className="hero-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            <div style={{ display: 'flex', flex: 'none' }}>{AVATARS.slice(0, 5).map((a, i) => <img key={a} src={A(`avatar-${a}.png`)} alt="" width={30} height={30} style={{ borderRadius: '50%', background: '#111', marginLeft: i ? -8 : 0, boxShadow: '0 0 0 2px #000' }} />)}</div>
            <span className="sm">Built for MagicBlock Solana Blitz v10 · iOS, Android and web</span>
          </motion.div>
        </div>

        <motion.div className="stage" style={{ y: stageY }}>
          <motion.div className="phone" style={{ right: '4%', top: 30, rotate: 7 }} initial={{ opacity: 0, x: 80, rotate: 18 }} animate={{ opacity: 1, x: 0, rotate: 7 }} transition={{ duration: 1.1, ease, delay: 0.45 }}>
            <img className="screen" src={SHOT('arena')} alt="Clashy Arena screen" />
          </motion.div>
          <motion.div className="phone" style={{ left: '6%', top: 70, rotate: -6, zIndex: 2 }} initial={{ opacity: 0, y: 120, rotate: -16 }} animate={{ opacity: 1, y: 0, rotate: -6 }} transition={{ duration: 1.1, ease, delay: 0.3 }}>
            <img className="screen" src={SHOT('duel')} alt="A live knockout duel in Clashy" />
          </motion.div>
          <Floater src={A('vs.png')} size={130} x="40%" y="36%" mx={mx} my={my} depth={0.9} delay={1.0} rot={-8} />
          <Floater src={A('win-trophy.png')} size={150} x="68%" y="68%" mx={mx} my={my} depth={0.6} delay={1.15} rot={10} />
          <Floater src={A('crown.png')} size={110} x="0%" y="2%" mx={mx} my={my} depth={0.45} delay={1.25} rot={-14} />
          <Floater src={A('ko-skull.png')} size={96} x="-6%" y="74%" mx={mx} my={my} depth={0.75} delay={1.35} rot={-6} />
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
    <div className="ticker" aria-label="Live prices: Coinbase and DexScreener">
      <motion.div className="ticker-track" animate={{ x: ['0%', '-50%'] }} transition={{ duration: items.length * 3.2, ease: 'linear', repeat: Infinity }}>
        {row('a')}{row('b')}
      </motion.div>
    </div>
  );
}

/* ───────── manifesto (scroll-lit words) ───────── */
function Word({ w, i, n, p }: { w: string; i: number; n: number; p: MotionValue<number> }) {
  const o = useTransform(p, [i / n, (i + 1) / n], [0.14, 1]);
  return <motion.span style={{ opacity: o }}>{w}</motion.span>;
}
function Manifesto() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const text = 'Every casino, every perp exchange, every prediction app puts you against the house. Clashy puts you against people. Your friends. Your rivals. Your clan.';
  const words = text.split(' ');
  return (
    <section className="sec">
      <div className="wrap" ref={ref}>
        <p className="manifesto">{words.map((w, i) => <Word key={i} w={w} i={i} n={words.length} p={scrollYProgress} />)}</p>
      </div>
    </section>
  );
}

/* ───────── games ───────── */
const GAMES = [
  { k: 'ko', cls: 'g-ko', title: 'Knockout duel', who: '1 v 1 · 60 seconds', body: 'You pick any coin, they pick theirs. Leverage up. Touch your knockout line and you are out. Best % at the bell takes the pot.', banner: 'banner-duel.jpg', live: true, shot: 'duel' },
  { k: 'line', cls: 'g-line', title: 'Draw the line', who: '3–10 players', body: 'Draw the next 60 seconds with your finger. The real price draws over everyone. Closest line wins the room.', banner: 'banner-line.jpg', live: true },
  { k: 'royale', cls: 'g-royale', title: 'Royale', who: '5–20 players · 10 s rounds', body: 'Up or down, every 10 seconds. Wrong call costs a life. Last one standing.', banner: 'banner-royale.jpg', live: true },
  { k: 'war', cls: 'g-war', title: 'Clan war', who: 'Clan vs clan · one week', body: 'Every coin is a tile on the map. Beat the other clan on it to own it.', banner: 'banner-war.jpg', live: false },
  { k: 'bounty', cls: 'g-bounty', title: 'Bounty', who: 'Open · one week', body: 'Put a price on your head. Hunters pay to try and beat your week.', banner: 'banner-bounty.jpg', live: false },
];
function Games() {
  return (
    <section className="sec" id="games">
      <div className="wrap">
        <div className="sec-head">
          <Reveal><span className="kicker">The games</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">Five ways to beat<br />someone today.</h2></Reveal>
        </div>
        <div className="bento">
          {GAMES.map((g, i) => (
            <motion.article key={g.k} className={`card ${g.cls}`} initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.8, ease, delay: (i % 3) * 0.08 }} whileHover="hover">
              <motion.div className="art" variants={{ hover: { scale: 1.06 } }} transition={{ duration: 0.6, ease }}><img src={A(g.banner)} alt="" loading="lazy" /></motion.div>
              {g.shot ? <motion.img className="shot" src={SHOT(g.shot)} alt={`${g.title} screen`} loading="lazy" variants={{ hover: { y: -10, rotate: -2 } }} transition={{ type: 'spring', stiffness: 200, damping: 18 }} /> : null}
              <div className="card-body">
                <span className={`pill ${g.live ? 'pill-live' : 'pill-soon'}`} style={{ alignSelf: 'flex-start' }}>{g.live ? <><span className="dot" />Practice live</> : 'Opens at launch'}</span>
                <h3 className="h-m">{g.title}</h3>
                <span className="xs" style={{ color: '#c9c9d2' }}>{g.who}</span>
                <p className="sm" style={{ color: '#c9c9d2', maxWidth: 440 }}>{g.body}</p>
              </div>
            </motion.article>
          ))}
        </div>
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
  const W = 800, H = 380;
  const mn = Math.min(0, ...pa, ...pb), mx = Math.max(0, ...pa, ...pb), span = Math.max(0.04, mx - mn);
  const lo = mn - span * 0.3, hi = mx + span * 0.3;
  const X = (i: number) => 20 + (i / LEN) * (W - 70);
  const Y = (v: number) => 20 + (1 - (v - lo) / (hi - lo)) * (H - 40);
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
    <section className="sec" id="race" style={{ paddingTop: 40 }}>
      <div className="wrap">
        <div className="sec-head">
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
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
              <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} stroke="#26262c" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
              {pb.length > 1 ? <><path d={d(pb)} stroke="var(--p)" strokeOpacity=".25" strokeWidth="10" fill="none" vectorEffect="non-scaling-stroke" /><path d={d(pb)} stroke="var(--p)" strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" /></> : null}
              {pa.length > 1 ? <><path d={d(pa)} stroke="var(--b)" strokeOpacity=".3" strokeWidth="11" fill="none" vectorEffect="non-scaling-stroke" /><path d={d(pa)} stroke="var(--b2)" strokeWidth="3.2" fill="none" vectorEffect="non-scaling-stroke" /></> : null}
            </svg>
            {pa.length ? <img src={img(a)} alt="" width={30} height={30} style={{ position: 'absolute', left: `${(X(pa.length - 1) / W) * 100}%`, top: `${(Y(lastA) / H) * 100}%`, transform: 'translate(-50%,-50%)', borderRadius: '50%', boxShadow: '0 0 0 3px #000, 0 0 0 5px var(--b)', transition: 'left 1s linear, top 1s linear' }} /> : null}
            {pb.length ? <img src={img(b)} alt="" width={30} height={30} style={{ position: 'absolute', left: `${(X(pb.length - 1) / W) * 100}%`, top: `${(Y(lastB) / H) * 100}%`, transform: 'translate(-50%,-50%)', borderRadius: '50%', boxShadow: '0 0 0 3px #000, 0 0 0 5px var(--p)', transition: 'left 1s linear, top 1s linear' }} /> : null}
            {run === 'idle' ? (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                <div><motion.img src={A('vs.png')} alt="" width={120} height={120} style={{ margin: '0 auto' }} animate={{ rotate: [-4, 4, -4] }} transition={{ duration: 3, repeat: Infinity }} /><div className="sm" style={{ marginTop: 10 }}>Pick two coins and start. Both lines race from 0%.</div></div>
              </div>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────── how a duel works (pinned phone) ───────── */
const STEPS = [
  { t: 'Pick any coin.', b: 'SOL, BTC, ETH or the newest Solana memecoin. Your opponent picks their own. Set your stake and leverage.', shot: 'amount' },
  { t: 'Sixty seconds. Live.', b: 'Both lines race from 0% on the same clock. Health bars drain as you get close to your knockout line.', shot: 'duel' },
  { t: 'Best % takes the pot.', b: 'Get knocked out and you are done early. Survive and beat their move at the bell, and the pot is yours.', shot: 'royale' },
  { t: 'Climb the season.', b: 'Every win moves you up the ladder, Bronze to Legend. Medals and badges for the top of each season.', shot: 'leaderboard' },
];
function Story() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start center', 'end center'] });
  const [i, setI] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setI(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)))));
  const bar = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  return (
    <section className="sec" id="how">
      <div className="wrap">
        <div className="sec-head">
          <Reveal><span className="kicker">How a duel works</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">One minute.<br />One winner.</h2></Reveal>
        </div>
        <div className="story" ref={ref}>
          <div className="story-pin">
            <div style={{ position: 'relative' }}>
              <div className="phone" style={{ position: 'relative' }}>
                <div style={{ aspectRatio: '390 / 844' }} />
                <AnimatePresence mode="popLayout">
                  <motion.div key={STEPS[i].shot} className="layer" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease }}>
                    <img src={SHOT(STEPS[i].shot)} alt={STEPS[i].t} />
                  </motion.div>
                </AnimatePresence>
              </div>
              <div style={{ position: 'absolute', left: -28, top: 40, bottom: 40, width: 3, borderRadius: 3, background: '#1c1c21' }}>
                <motion.div style={{ height: bar, width: 3, borderRadius: 3, background: 'var(--b)' }} />
              </div>
            </div>
          </div>
          <div className="story-steps">
            {STEPS.map((s, k) => (
              <motion.div key={s.t} className="step" animate={{ opacity: k === i ? 1 : 0.28 }} transition={{ duration: 0.4 }}>
                <div className="step-n" style={{ background: k === i ? 'var(--b)' : undefined }}>{k + 1}</div>
                <h3 className="h-m">{s.t}</h3>
                <p className="lead">{s.b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── clans ───────── */
function Clans() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y1 = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const y2 = useTransform(scrollYProgress, [0, 1], [-30, 30]);
  const feats = [
    { img: 'crest-flame.png', t: 'Monthly seasons', b: 'Clans climb a season ladder. Every month resets the race.' },
    { img: 'crest-wolf.png', t: 'Week-long wars', b: 'Clan vs clan. Each coin is a tile. Most tiles wins the chest.' },
    { img: 'crest-crown.png', t: 'Pot votes', b: 'The clan pot only trades by vote. Captains execute what passes.' },
    { img: 'crest-skull.png', t: 'Bounties', b: 'Put a price on your head, or hunt someone else’s.' },
  ];
  return (
    <section className="sec" id="clans" ref={ref}>
      <div className="wrap clans">
        <div>
          <Reveal><span className="kicker">Clans</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l" style={{ marginTop: 16 }}>Bring your<br />whole group chat.</h2></Reveal>
          <Reveal delay={0.1}><p className="lead" style={{ marginTop: 20 }}>Start a clan, push a shared pot and go to war every week. Chat, call trades and vote on what the pot does next.</p></Reveal>
          <div className="feat">
            {feats.map((f, k) => (
              <Reveal key={f.t} delay={0.05 * k}><div><img src={A(f.img)} alt="" loading="lazy" /><div className="h-s" style={{ fontSize: 17 }}>{f.t}</div><p className="sm" style={{ marginTop: 4 }}>{f.b}</p></div></Reveal>
            ))}
          </div>
        </div>
        <div className="clans-phones">
          <motion.div className="phone" style={{ left: '2%', top: 20, rotate: -5, y: y1 }}><img className="screen" src={SHOT('war')} alt="Clan war map" loading="lazy" /></motion.div>
          <motion.div className="phone" style={{ right: '2%', top: 90, rotate: 6, y: y2 }}><img className="screen" src={SHOT('bounty')} alt="Bounty wanted poster" loading="lazy" /></motion.div>
        </div>
      </div>
    </section>
  );
}

/* ───────── vs the house ───────── */
function VsHouse() {
  const rows = [
    ['Who you play against', 'The house, a market maker, the pool', 'A person you can see'],
    ['Who wins when you lose', 'The platform', 'Your opponent'],
    ['Your coin', 'Whatever the venue lists', 'Any coin, on both sides'],
    ['Friends', 'Screenshots in a group chat', 'Duels, clans, wars and bounties built in'],
    ['Speed', 'Wait for blocks', 'Every tick on a MagicBlock Ephemeral Rollup'],
  ];
  return (
    <section className="sec" style={{ paddingTop: 40 }}>
      <div className="wrap">
        <div className="sec-head">
          <Reveal><span className="kicker">Why it is different</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">The house always wins.<br /><span className="grad">So we removed it.</span></h2></Reveal>
        </div>
        <Reveal className="vs-table">
          <div className="vs-row"><div className="xs">&nbsp;</div><div className="xs">Casinos, perps, prediction apps</div><div className="xs" style={{ color: 'var(--b2)' }}>Clashy</div></div>
          {rows.map((r) => <div className="vs-row" key={r[0]}><div className="sm" style={{ color: 'var(--ink)' }}>{r[0]}</div><div className="sm">{r[1]}</div><div>{r[2]}</div></div>)}
        </Reveal>
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
          <Reveal delay={0.05}><h2 className="h-l">Real time,<br />on Solana.</h2></Reveal>
          <Reveal delay={0.1}><p className="lead">The on-chain program is being built during MagicBlock Solana Blitz v10. Until it ships, the practice games run on live prices with no money.</p></Reveal>
        </div>
        <div className="tech">
          {t.map((x, k) => (
            <Reveal key={x.t} delay={k * 0.07}><div><span className="num">0{k + 1}</span><h3 className="h-s">{x.t}</h3><p className="sm">{x.b}</p></div></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── final ───────── */
function Final() {
  const row = useMemo(() => [...AVATARS, ...AVATARS], []);
  return (
    <section className="final">
      <motion.div className="av-row" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 40, ease: 'linear', repeat: Infinity }} style={{ marginBottom: 56 }}>
        {row.map((a, i) => <img key={i} src={A(`avatar-${a}.png`)} alt="" loading="lazy" />)}
      </motion.div>
      <div className="wrap">
        <Reveal><h2 className="h-xl">Duel <span className="grad">anyone.</span></h2></Reveal>
        <Reveal delay={0.1}><p className="lead" style={{ margin: '24px auto 0' }}>Coming to iOS, Android, the Solana dApp Store and the web. Practice games already run on live prices.</p></Reveal>
        <Reveal delay={0.15}>
          <div className="hero-cta" style={{ justifyContent: 'center' }}>
            <a className="btn btn-b" href="#race">Race two coins now</a>
            <span className="btn btn-g" aria-disabled="true">App Store · soon</span>
            <span className="btn btn-g" aria-disabled="true">Google Play · soon</span>
          </div>
        </Reveal>
      </div>
      <div className="wrap">
        <footer className="foot" style={{ marginTop: 120 }}>
          <img src={A('wordmark.svg')} alt="clashy" style={{ height: 22 }} />
          <span className="xs">© 2026 Clashy · in development · prices from Coinbase Exchange and DexScreener</span>
        </footer>
      </div>
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
        <Manifesto />
        <Games />
        <Race />
        <Story />
        <Clans />
        <VsHouse />
        <Tech />
        <Final />
      </main>
    </MotionConfig>
  );
}
