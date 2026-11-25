import { AnimatePresence, MotionConfig, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MAJORS, fetchLast, fetchMajor, fetchTrending, fmtPct, fmtUsd, usePoll, type Coin, type MajorId } from './lib/markets';

const A = (f: string) => `/a/${f.replace(/\.(png|jpg)$/, '.webp')}`;
const SHOT = (f: string) => `/shots/${f}.webp`;
const CLIP = (f: string) => `/v/${f}.mp4`;
const POSTER = (f: string) => `/v/${f}.webp`;

/** A real gameplay clip recorded from the app. Loads nothing until near the viewport, plays only while visible,
 *  and stays on its poster frame for people who prefer reduced motion. */
/** A Higgsfield clay loop (assets/video/web). Black backgrounds drop out with mix-blend-mode: lighten.
 *  Loads near the viewport, plays only while visible, poster under reduced motion. */
function ClayLoop({ name, className, eager, loop = true }: { name: string; className?: string; eager?: boolean; loop?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(() => {}); } else if (loop) v.pause();
    }, { rootMargin: '200px 0px' });
    io.observe(v);
    return () => io.disconnect();
  }, [loop]);
  return <video ref={ref} className={`clay ${className ?? ''}`} src={`/clay/${name}.mp4`} poster={`/clay/${name}.webp`} muted loop={loop} playsInline preload={eager ? 'auto' : 'none'} aria-hidden="true" />;
}

function Clip({ name, label }: { name: string; label?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(() => {}); }
      else v.pause();
    }, { rootMargin: '200px 0px' });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} className="clip" src={CLIP(name)} poster={POSTER(name)} muted loop playsInline preload="none" aria-label={label ?? `${name} gameplay recorded from the Clashy app`} />;
}
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
        <a href="#real" className="pillnav-link">Real fights</a>
        <a href="#race" className="pillnav-link">Live race</a>
        <a href="#race" className="pill-cta">Play now</a>
      </nav>
    </motion.header>
  );
}

/* ───────── hero: big headline, clay players floating around it ───────── */
const W = ({ children, d }: { children: ReactNode; d: number }) => (
  <span className="hw"><motion.span style={{ display: 'inline-block' }} initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: d }}>{children}</motion.span></span>
);
const BUBBLES = [
  { a: 'cat', x: '3%', y: '0%', s: 88, d: 0.9 }, { a: 'shark', x: '90%', y: '2%', s: 80, d: 1.0 },
  { a: 'nova', x: '0%', y: '46%', s: 70, d: 1.1 }, { a: 'tiger', x: '93%', y: '44%', s: 74, d: 1.2 },
  { a: 'panda', x: '11%', y: '78%', s: 60, d: 1.3 }, { a: 'dragon', x: '84%', y: '80%', s: 64, d: 1.35 },
];
function Bubble({ b, sy }: { b: (typeof BUBBLES)[number]; sy: MotionValue<number> }) {
  const y = useTransform(sy, [0, 700], [0, -b.s * 1.4]);
  return (
    <motion.div className="bubble" style={{ left: b.x, top: b.y, width: b.s, height: b.s, y }} initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 13, delay: b.d }}>
      <motion.img src={A(`avatar-${b.a}.png`)} alt="" animate={{ y: [0, -10, 0] }} transition={{ duration: 3 + b.s / 40, repeat: Infinity, ease: 'easeInOut' }} />
    </motion.div>
  );
}

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
      <div className="hero2-bubbles" aria-hidden="true">{BUBBLES.map((b) => <Bubble key={b.a} b={b} sy={scrollY} />)}</div>
      <div className="wrap" style={{ textAlign: 'center', position: 'relative' }}>
        <motion.div className="pill pill-live" style={{ margin: '0 auto' }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6 }}><span className="dot" />Practice games live on real prices</motion.div>
        <h1 className="hero2-h" style={{ marginTop: 22 }}>
          <W d={0.2}>Trade</W> <W d={0.27}>against</W> <W d={0.34}>people,</W><br />
          <W d={0.44}><span className="grad">not the house.</span></W>
        </h1>
        <motion.p className="lead" style={{ margin: '26px auto 0', textAlign: 'center' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.8, ease }}>
          Clashy is a PvP trading game on Solana. Open a challenge or take someone's, one coin gets rolled, you pick long or short, best move in 60 seconds wins. Duels, Royales and clan wars.
        </motion.p>
        <motion.div className="hero-cta" style={{ justifyContent: 'center' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.8, ease }}>
          <a className="cta" href="#race">Race two coins now <span className="cta-arrow"><Arrow /></span></a>
          <a className="cta-ghost" href="#how"><span className="cta-play">▶</span>See how it works</a>
        </motion.div>
        <motion.div className="hero2-stage" style={{ y: artY }}>
          <motion.div className="hero2-art hero2-video" initial={{ opacity: 0, scale: 0.9, y: 60 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.2, ease, delay: 0.6 }} role="img" aria-label="Two clay traders face off over a price chart">
            <ClayLoop name="hero-duo-loop" eager />
          </motion.div>
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

/* ───────── how a duel works: dark, pinned; step list fills as you scroll ───────── */
const STEPS = [
  { tab: 'Match', art: 'tile-duel.png', t: 'One challenge. One coin.', b: 'Take a rival\'s open challenge and MagicBlock VRF rolls one coin for both of you. Pick long or short and your leverage.', shot: 'match-pick', glow: '#5B6CFF' },
  { tab: 'Duel', art: 'vs.png', t: 'Sixty seconds. Live.', b: 'Both lines race from 0% on the same clock. With leverage, a big enough move against you hits your knockout line.', shot: 'duel', glow: '#F0468C' },
  { tab: 'Win', art: 'win-trophy.png', t: 'Best % takes the pot.', b: 'Touch your knockout line and you are out. Survive and beat their move at the bell, and the pot is yours.', shot: 'result-win', glow: '#FFC94A' },
  { tab: 'Climb', art: 'crown.png', t: 'Climb the season.', b: 'Points from settled clashes move you up ten ranks, from Rookie to Legend.', shot: 'ranks', glow: '#30D158' },
];
function How() {
  const wide = useIsWide();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [i, setI] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setI(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length * 0.999)))));
  const fill = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const s = STEPS[i];
  const head = (
    <div className="how-head2">
      <span className="kicker">How a duel works</span>
      <h2 className="h-l" style={{ marginTop: 12 }}>One minute.<br />One winner.</h2>
    </div>
  );
  if (!wide) {
    return (
      <section className="sec" id="how">
        <div className="wrap">
          {head}
          {STEPS.map((x, k) => (
            <Reveal key={x.tab} style={{ marginTop: 56 }}>
              <div className="how-m">
                <img src={A(x.art)} alt="" className="how-m-art" />
                <div className="phone-sm"><img src={SHOT(x.shot)} alt={x.t} loading="lazy" /></div>
              </div>
              <div className="how2-n" style={{ background: x.glow, color: '#000', marginTop: 18 }}>{k + 1}</div>
              <h3 className="h-m" style={{ marginTop: 12 }}>{x.t}</h3>
              <p className="lead" style={{ marginTop: 8 }}>{x.b}</p>
            </Reveal>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section id="how" ref={ref} style={{ height: `${STEPS.length * 80 + 60}vh` }}>
      <div className="how2-pin">
        <motion.div className="how2-glow" animate={{ background: `radial-gradient(38% 50% at 62% 55%, ${s.glow}40, transparent 70%)` }} transition={{ duration: 0.8 }} />
        <div className="wrap how2-grid">
          <div>
            {head}
            <div className="how2-steps">
              <div className="how2-rail"><motion.div className="how2-fill" style={{ height: fill }} /></div>
              {STEPS.map((x, k) => (
                <motion.div key={x.tab} className="how2-step" animate={{ opacity: k === i ? 1 : 0.32 }} transition={{ duration: 0.35 }}>
                  <div className="how2-n" style={{ background: k <= i ? x.glow : '#1c1c21', color: k <= i ? '#000' : '#777' }}>{k + 1}</div>
                  <div>
                    <div className="h-s">{x.t}</div>
                    <AnimatePresence initial={false}>
                      {k === i ? <motion.p className="sm" style={{ marginTop: 6, maxWidth: 380, overflow: 'hidden' }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease }}>{x.b}</motion.p> : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="how2-phone">
            <div className="phone how-device">
              <div style={{ aspectRatio: '390 / 844' }} />
              <AnimatePresence mode="popLayout">
                <motion.img key={s.shot} className="how-screen" src={SHOT(s.shot)} alt={s.t} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease }} />
              </AnimatePresence>
            </div>
            <div className="how2-art">
              <AnimatePresence mode="wait">
                <motion.img key={s.art} src={A(s.art)} alt="" initial={{ opacity: 0, scale: 0.6, rotate: -14 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.7, rotate: 10 }} transition={{ type: 'spring', stiffness: 170, damping: 15 }} />
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── games rail: every game, its clay piece and the real screen (or a clip) ───────── */
type Game = { k: string; who: string; t: string; b: string; c: string; art: string; loop?: string; clip?: string; shot?: string; live: boolean };
const RAIL: Game[] = [
  { k: 'Knockout duel', who: '1 v 1 · open challenge · 60 s', t: 'One coin. One winner.', b: 'Take an open challenge. VRF rolls one coin for both of you. Long or short, survive the knockout line.', c: '#5B6CFF', loop: 'tile-duel-loop', art: 'tile-duel.png', clip: 'duel', live: true },
  { k: 'Double or Nothing', who: 'Practice game · 15 s calls', t: 'Let it ride.', b: 'Fifteen-second calls at nearly 2×. Keep calling right to keep the streak.', c: '#FFC94A', art: 'tile-double.png', shot: 'result-win', live: true },
  { k: 'Royale', who: '2–16 players · 10 s rounds', t: 'Last one standing.', b: 'Up or down every 10 seconds. The whole screen is the button. Wrong call costs a heart.', c: '#F0468C', loop: 'tile-royale-loop', art: 'tile-royale.png', clip: 'royale', live: true },
  { k: 'Diamond Duel', who: 'Practice game · vs Clashy Bot', t: 'Sell before it catches you.', b: 'Hold a leveraged long longer than the bot, and sell higher.', c: '#5AC8FA', loop: 'tile-diamond-loop', art: 'tile-diamond.png', clip: 'diamond', live: true },
  { k: 'Draw the line', who: 'Planned · clip from an earlier build', t: 'Draw the next minute.', b: 'Trace where the price goes. The real price draws over everyone. Closest line wins.', c: '#B49BFF', loop: 'tile-line-loop', art: 'tile-line.png', clip: 'line', live: false },
  { k: 'Ranked', who: 'Planned · clip from an earlier build', t: 'The queue picks the game.', b: 'A ranked queue that picks the mode for you. Today rank points come from settled clashes.', c: '#30D158', art: 'rank-10.png', clip: 'ranked', live: false },
  { k: 'Weekly Cup', who: 'Everyone · resets Monday 00:00 UTC', t: 'Top three take the podium.', b: 'Ranked by stock profit plus clash winnings this week, read from the chain.', c: '#FF8A4C', loop: 'tile-cup-loop', art: 'tile-cup.png', shot: 'cup', live: true },
  { k: 'Coin clash', who: 'Practice game · 60 s', t: 'Your coin vs theirs.', b: 'Two coins head to head for 60 seconds. Call the one that moves more.', c: '#AEB6FF', art: 'ko-burst.png', shot: 'clash', live: true },
  { k: 'Clan Skirmish', who: 'Planned · screen from an earlier build', t: 'Make the clan\'s call.', b: 'A coin is rolled each round. Your clan goes long or short. First clan to 3 rounds wins.', c: '#FF8A4C', art: 'crest-flame.png', shot: 'skirmish', live: false },
  { k: 'Clan Chest', who: 'Trade as a group · on devnet', t: 'The pot moves by vote.', b: 'Any member with shares proposes a trade on the clan pot. The clan votes. The captain executes it.', c: '#FFD66B', art: 'crown.png', shot: 'chest', live: true },
  { k: 'Clan war', who: 'Clan vs clan · on devnet', t: 'Bring the group chat.', b: 'Both captains stake from their chests. The better return from closed trades in the window takes the pot.', c: '#30D158', art: 'clan-banner.png', shot: 'war', live: true },
  { k: 'Bounty', who: 'Planned · screen from an earlier build', t: 'Put a price on your head.', b: 'Stake a reward on your week. Hunters pay to try and beat it.', c: '#5AC8FA', art: 'tile-bounty.png', shot: 'bounty', live: false },
];
function RailCard({ c }: { c: Game }) {
  return (
    <motion.article className="gcard2" style={{ ['--c' as string]: c.c }} whileHover="hov" initial="rest" animate="rest">
      <div className="gcard2-head">
        <motion.div className="gcard2-art" variants={{ rest: { rotate: 0, scale: 1 }, hov: { rotate: -8, scale: 1.12 } }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
          {c.loop ? <ClayLoop name={c.loop} /> : <img src={A(c.art)} alt="" width={72} height={72} loading="lazy" decoding="async" />}
        </motion.div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className={`pill ${c.live ? 'pill-live' : 'pill-soon'}`}>{c.live ? <><span className="dot" />Playable now</> : 'Planned'}</span>
          <div className="gcard-k" style={{ marginTop: 6 }}>{c.k}</div>
        </div>
      </div>
      <h3 className="gcard-t" style={{ marginTop: 14 }}>{c.t}</h3>
      <p className="sm" style={{ color: '#b9b9c2', marginTop: 6 }}>{c.b}</p>
      <div className="xs" style={{ color: 'var(--c)', fontWeight: 650, marginTop: 8 }}>{c.who}</div>
      <motion.div className="gcard2-phone" variants={{ rest: { y: 0 }, hov: { y: -16 } }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
        {c.clip ? <Clip name={c.clip} /> : <img src={SHOT(c.shot!)} alt={`${c.k} screen`} loading="lazy" decoding="async" />}
      </motion.div>
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
      <h2 className="h-l" style={{ marginTop: 14 }}>Twelve ways to<br />beat someone.</h2>
      <p className="lead" style={{ marginTop: 18 }}>Clips and screens were recorded from the app on live prices, some from earlier builds. Eight are playable today, as practice or on devnet in test USDC; four are planned.</p>
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
    <section id="crew" ref={ref} style={{ height: `${RAIL.length * 42 + 100}vh` }}>
      <div className="rail-pin">
        <motion.div className="rail-track" ref={track} style={{ x }}>
          {intro}
          {RAIL.map((c) => <RailCard key={c.k} c={c} />)}
        </motion.div>
      </div>
    </section>
  );
}

/* ───────── gameplay: three real clips side by side ───────── */
function Gameplay() {
  const items = [
    { clip: 'duel', t: 'Knockout duel', s: 'Coin roll → VS → live race' },
    { clip: 'royale', t: 'Royale', s: 'The whole screen is the button' },
    { clip: 'diamond', t: 'Diamond Duel', s: 'Hold, then sell before the knockout' },
  ];
  return (
    <section className="sec" id="play" style={{ paddingTop: 110 }}>
      <div className="wrap">
        <div className="sec-head" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Reveal><span className="kicker">Recorded from the app</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">No mockups.<br /><span className="grad">This is the game.</span></h2></Reveal>
          <Reveal delay={0.1}><p className="lead" style={{ margin: '0 auto' }}>Every clip was recorded from the Clashy app on live prices. Practice is free today; on-chain clashes run on Solana devnet in test USDC, and real pots wait for mainnet.</p></Reveal>
        </div>
        <div className="play-row">
          {items.map((it, k) => (
            <Reveal key={it.clip} delay={k * 0.08} className="play-item">
              <div className="phone play-phone"><Clip name={it.clip} label={`${it.t} gameplay`} /></div>
              <div className="h-s" style={{ marginTop: 16, textAlign: 'center' }}>{it.t}</div>
              <div className="sm" style={{ textAlign: 'center' }}>{it.s}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── real fights: how a real-money game runs and settles ───────── */
function RealFights() {
  const steps = [
    { n: '01', t: 'Pick your stake', b: 'Open a challenge or take one. Your stake goes into a Solana escrow before the game starts.', art: 'coins-pile.png' },
    { n: '02', t: 'One coin, rolled', b: 'Once both stakes are in, MagicBlock VRF rolls the coin for both of you. No player chooses it.', art: 'vs.png' },
    { n: '03', t: 'Sealed picks, live fight', b: 'Long or short stays sealed inside MagicBlock\'s private rollup until both of you lock. Then the rollup scores the duel live, every second.', art: 'ko-burst.png' },
    { n: '04', t: 'Settled on Solana', b: 'The winner takes the pot minus 3%. A Magic Action pays it on Solana as the result comes home, and every step is a transaction anyone can open.', art: 'win-trophy.png' },
  ];
  const receipt = ['Coin (VRF roll)', 'Entry price', 'Exit price', 'Side and leverage', 'P&L %', 'Rake (3%)', 'Pot', 'Payout'];
  return (
    <section className="sec realf" id="real">
      <div className="wrap">
        <div className="sec-head">
          <Reveal><span className="kicker">Real fights</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">Real pots.<br /><span className="grad">Real receipts.</span></h2></Reveal>
          <Reveal delay={0.1}><p className="lead">How an on-chain clash runs today on Solana devnet, in test USDC with no value. Real money waits for mainnet.</p></Reveal>
        </div>
        <div className="realf-grid">
          <div className="realf-steps">
            {steps.map((s, k) => (
              <Reveal key={s.n} delay={k * 0.06}>
                <div className="realf-step">
                  <img src={A(s.art)} alt="" width={84} height={84} loading="lazy" decoding="async" />
                  <div><div className="xs" style={{ color: 'var(--b2)', fontWeight: 700 }}>{s.n}</div><div className="h-s">{s.t}</div><p className="sm" style={{ marginTop: 4 }}>{s.b}</p></div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.1}>
            <div className="receipt">
              <div className="receipt-head"><span className="h-s">Game receipt</span><span className="pill pill-soon">Example layout</span></div>
              <p className="xs" style={{ margin: '6px 0 14px' }}>A clash's result is built only from on-chain data: the coin, both prices, both calls, the rake and the payout, each with its transaction.</p>
              {receipt.map((r) => (
                <div key={r} className="receipt-row"><span>{r}</span><span className="receipt-dash" /><span className="xs">tx link</span></div>
              ))}
              <div className="receipt-foot">
                {['18+ at sign-in', 'Daily stake limit', 'Breaks you can\'t shorten', 'Ties refund, no fee', 'Free practice'].map((t) => <span key={t} className="chip-sm">{t}</span>)}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ───────── ranks: the ten degen tiers ───────── */
const TIERS = ['Rookie', 'Saver', 'Starter', 'Steady', 'Investor', 'Analyst', 'Long-Term', 'Strategist', 'Expert', 'Legend'];
function Ranks() {
  return (
    <section className="sec" id="ranks" style={{ paddingTop: 40 }}>
      <div className="wrap">
        <div className="sec-head" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Reveal><span className="kicker">Ranked</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">From Rookie<br />to <span className="grad">Legend.</span></h2></Reveal>
          <Reveal delay={0.1}><p className="lead" style={{ margin: '0 auto' }}>Ten ranks. Points come only from settled clashes, never bought.</p></Reveal>
        </div>
        <div className="ranks">
          {TIERS.map((t, k) => (
            <motion.div key={t} className="rank" initial={{ opacity: 0, y: 40, scale: 0.8 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: '-40px' }} transition={{ type: 'spring', stiffness: 180, damping: 15, delay: k * 0.05 }} whileHover={{ y: -8, scale: 1.06 }}>
              <img src={A(`rank-${k + 1}.png`)} alt="" width={96} height={96} loading="lazy" decoding="async" />
              <div className="xs" style={{ color: 'var(--mu)' }}>{k + 1}</div>
              <div className="rank-t">{t}</div>
            </motion.div>
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
            {err ? <div className="xs" style={{ color: 'var(--dn)' }}>Price feed: {err}</div> : <div className="xs">Coinbase Exchange ticker, every second. No money, no sign-up. In an on-chain clash your rival is a real player; in practice it is Clashy Bot.</div>}
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
const HAND_SHOTS = ['duel', 'royale', 'line', 'arena', 'war', 'home'];
function HandPhone({ y }: { y?: MotionValue<number> }) {
  const [k, setK] = useState(0);
  useEffect(() => { const h = setInterval(() => setK((x) => (x + 1) % HAND_SHOTS.length), 2600); return () => clearInterval(h); }, []);
  return (
    <motion.div className="hand" style={{ y }}>
      <img src={A('phone-hand.png')} alt="A hand holding a phone running Clashy" />
      <div className="hand-screen">
        <AnimatePresence mode="popLayout">
          <motion.img key={HAND_SHOTS[k]} src={SHOT('hand-' + HAND_SHOTS[k])} alt="" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.45, ease }} />
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
function Statement() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 0.6, 1], [140, 0, 0]);
  return (
    <section className="statement" ref={ref}>
      <div className="wrap statement-grid">
        <div>
          <Reveal><div className="clanwar-band"><ClayLoop name="clan-war-loop" /></div></Reveal>
          <Reveal><h2 className="statement-h">The house always wins.<br /><span className="grad">So we removed it.</span></h2></Reveal>
          <Reveal delay={0.08}><p className="lead" style={{ marginTop: 24 }}>Casinos, perp exchanges and prediction apps put you against the house. In a Clashy duel, Royale or clan war the other side is a person: your friend, your rival, the other clan. Clashy only takes a 3% rake. Practice games are against Clashy Bot.</p></Reveal>
          <Reveal delay={0.14}>
            <ul className="vs-list">
              {[['Who you play', 'A person on chain; Clashy Bot in practice'], ['Your coin', 'Rolled by MagicBlock VRF, same for both'], ['Your crew', 'Duels, squads, clans and wars built in'], ['Speed', 'Every live tick of a clash on a MagicBlock rollup']].map(([k, v]) => <li key={k}><span className="xs">{k}</span><span>{v}</span></li>)}
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
    { t: 'Private picks in a TEE', b: 'Your long or short is locked inside MagicBlock\'s Private Ephemeral Rollup, readable only by you until your rival locks too. One free, instant move.' },
    { t: 'Verifiable randomness', b: 'The coin in every duel and Royale comes from MagicBlock VRF, and only its oracle can answer, so no player can rig a room. One admin key can still upgrade the program; a multisig comes before mainnet.' },
    { t: 'The rollup referees', b: 'A MagicBlock crank checks every live clash each second against the live price (MagicBlock\'s oracle for SOL, BTC and ETH). Knockouts and bells land even if both of you close the app.' },
    { t: 'Paid in the same step', b: 'When a clash ends, a Magic Action pays the winner on Solana in the same step that brings the result home. If it ever fails, the app settles by hand.' },
    { t: 'USDC in, no SOL', b: 'Sign in with email or Google and Privy makes your wallet. It holds USDC only: Clashy pays every network fee, and nothing pops up mid-duel.' },
  ];
  return (
    <section className="sec" id="tech">
      <div className="wrap">
        <div className="sec-head">
          <Reveal><span className="kicker">Under the hood</span></Reveal>
          <Reveal delay={0.05}><h2 className="h-l">Real time, on Solana.</h2></Reveal>
          <Reveal delay={0.1}><p className="lead">Duels and Royales run on Solana devnet with MagicBlock's Private Ephemeral Rollup, VRF, cranks, oracle and Magic Actions, in test USDC; clan chests and wars run on devnet too. Nothing is on mainnet yet; the practice games run on live prices with no money.</p></Reveal>
        </div>
        <div className="tech">
          {t.map((x, k) => <Reveal key={x.t} delay={k * 0.07}><div><span className="num">0{k + 1}</span><h3 className="h-s">{x.t}</h3><p className="sm">{x.b}</p></div></Reveal>)}
        </div>
      </div>
    </section>
  );
}

/* ───────── final CTA + avatar parade footer ───────── */
const PARADE = ['cat', 'shark', 'gladiator', 'nova', 'punk', 'panda', 'alien', 'monkey', 'wizard', 'dog', 'cyborg', 'dragon', 'skater', 'tiger', 'ghost', 'bull', 'racer', 'hood', 'bot', 'beanie'];
function Final() {
  return (
    <section className="final2">
      <div className="wrap" style={{ textAlign: 'center' }}>
        <Reveal><div className="final-win"><ClayLoop name="win-loop" /></div></Reveal>
        <Reveal><h2 className="final2-h">Find your rival.<br /><span className="grad">Make the first call.</span></h2></Reveal>
        <Reveal delay={0.1}><p className="lead" style={{ margin: '24px auto 0' }}>Coming to iOS, Android, the Solana dApp Store and the web. The practice games already run on live prices.</p></Reveal>
        <Reveal delay={0.15}><div className="hero-cta" style={{ justifyContent: 'center' }}><a className="cta" href="#race">Race two coins now <span className="cta-arrow"><Arrow /></span></a></div></Reveal>
        <div className="xs" style={{ marginTop: 14 }}>App Store and Google Play · coming soon</div>
      </div>
      <div className="parade" aria-hidden="true">
        <motion.div className="parade-track" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 46, ease: 'linear', repeat: Infinity }}>
          {[...PARADE, ...PARADE].map((a, k) => <img key={k} src={A(`avatar-${a}.png`)} alt="" loading="lazy" style={{ transform: `translateY(${k % 2 ? 14 : -6}px)` }} />)}
        </motion.div>
      </div>
      <footer className="wrap fbar">
        <img src={A('wordmark.svg')} alt="clashy" style={{ height: 26 }} />
        <nav className="fbar-links" aria-label="Footer"><a href="#how">How it works</a><a href="#crew">Games</a><a href="#race">Live race</a><a href="#tech">Tech</a></nav>
        <span className="xs">© 2026 Clashy · in development · prices from Coinbase Exchange and DexScreener</span>
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
        <Gameplay />
        <How />
        <Rail />
        <RealFights />
        <Ranks />
        <Race />
        <Statement />
        <Tech />
        <Final />
      </main>
    </MotionConfig>
  );
}
