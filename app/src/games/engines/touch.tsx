// Touch (Nov 20): solo. A rolled market and a few target rings above and below the price, each with a payout priced
// from how much this market has really been moving (odds.ts). Pick one; if the price touches it before the bell you're
// paid the multiplier, the moment it touches. The bell without a touch: the stake is gone.
// p: { rings = 3, dir = 'both' | 'up' | 'down' }
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { fallbackSigma, nameOf, tickerOf, useLivePool, type PoolKey } from '../feed';
import { BigNumber, Choice, Clock, Go, MarketChart, MarketHead, Note, Panel, fmtPx, useClock, type GameApi } from '../kit';
import { fmtX, payoutFor, pick, pTouch, sigmaOf, signedPct } from '../odds';

type Ring = { d: number; mult: number; up: boolean };
const K = [0.45, 0.9, 1.5, 2.2];

export default function Touch({ g }: { g: GameApi }) {
  const { def } = g;
  const dir = (def.p?.dir as 'both' | 'up' | 'down') ?? 'both';
  const nRings = Math.max(1, Math.min(4, Number(def.p?.rings ?? 3)));
  const live = useLivePool(def.pool as PoolKey[]);
  const [sym, setSym] = useState<string | null>(null);
  const [ring, setRing] = useState<Ring | null>(null);
  const [entry, setEntry] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [locked, setLocked] = useState<Ring | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);
  useEffect(() => { if (!sym && live.length) setSym(pick(live)); }, [sym, live.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // the rings, priced from the last ten minutes of this market's moves
  const sigma = sym ? sigmaOf(g.feed, sym, fallbackSigma(sym)) : 0;
  const rings = useMemo(() => {
    if (!sym || !sigma) return [];
    const step = sigma * Math.sqrt(Math.max(def.secs, 1));
    const ks = K.slice(0, nRings);
    const make = (up: boolean) => ks.map((k) => { const d = Math.max(0.0002, k * step); return { d, up, mult: payoutFor(pTouch(d, sigma, def.secs)) }; });
    return dir === 'up' ? make(true) : dir === 'down' ? make(false) : [...make(true), ...make(false)];
  }, [sym, Math.round(sigma * 1e7), def.secs, dir, nRings]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    if (!sym || !ring) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setEntry(m.p); setLocked(ring); setStartedAt(Date.now()); setEndsAt(end);
  };

  const target = entry && locked ? entry * (locked.up ? 1 + locked.d : 1 - locked.d) : null;
  useEffect(() => {
    if (!sym || !entry || !locked || !endsAt || !target || settled.current || g.phase !== 'live') return;
    const m = g.feed.mark(sym);
    const touched = m && m.t >= (startedAt ?? 0) && (locked.up ? m.p >= target : m.p <= target);
    const lines = (p: number): [string, string][] => [
      ['Market', `${nameOf(g.info, sym)} (${tickerOf(sym)})`],
      ['Entry', fmtPx(entry)],
      ['Target', `${fmtPx(target)} (${signedPct(locked.up ? locked.d : -locked.d, 2)})`],
      ['Payout if touched', fmtX(locked.mult)],
      [touched ? 'Touched at' : 'Price at the bell', fmtPx(p)],
    ];
    if (touched) { settled.current = true; g.end(locked.mult, `Touched ${fmtPx(target)}. Paid ${fmtX(locked.mult)}.`, lines(m.p)); return; }
    if (Date.now() < endsAt) return;
    if (m && m.t >= endsAt) { settled.current = true; g.end(0, `The bell rang ${signedPct(m.p / entry - 1, 3)} from entry. No touch.`, lines(m.p)); }
    else if (Date.now() > endsAt + 15_000) { settled.current = true; g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`); }
  });

  if (!sym) return <Panel><Note center>Finding a market with a live price…</Note></Panel>;

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <Panel>
          <MarketHead g={g} sym={sym} right={
            <Pressable onPress={() => { setSym(pick(live.filter((s) => s !== sym)) ?? sym); setRing(null); }} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: '#1D1D24', justifyContent: 'center' }}>
              <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll</Txt>
            </Pressable>
          } />
        </Panel>
        <MarketChart g={g} sym={sym} h={130} color={def.tint} />
        <TourTarget id="g-pick">
          <Txt v="label" style={{ marginBottom: 8 }}>Pick a target. Further pays more.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {rings.map((r) => {
              const on = ring?.up === r.up && ring?.d === r.d;
              return (
                <View key={`${r.up}-${r.d}`} style={{ flexBasis: '30%', flexGrow: 1 }}>
                  <Choice title={fmtX(r.mult)} sub={`${r.up ? '▲' : '▼'} ${signedPct(r.up ? r.d : -r.d, 2)}`} color={r.up ? C.up : C.down} selected={ring ? on : undefined} onPress={() => setRing(r)} h={78} />
                </View>
              );
            })}
          </View>
        </TourTarget>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title={ring ? `Go for ${fmtX(ring.mult)}` : 'Pick a target first'} onPress={() => void go()} disabled={!ring || g.busy} color={def.tint} ink="#0A0A0D" />
        </TourTarget>
        <Note center>Odds come from this market's last ten minutes of moves.</Note>
      </View>
    );
  }

  const m = g.feed.mark(sym);
  const gap = target && m ? (locked!.up ? target / m.p - 1 : 1 - target / m.p) : null;
  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry ?? undefined} />
        <View style={{ marginTop: 12 }}><Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to touch it'} /></View>
      </Panel>
      {target ? <MarketChart g={g} sym={sym} from={startedAt ?? undefined} entry={target} h={210} label={`Target ${fmtX(locked!.mult)}`} /> : null}
      {g.phase === 'live' && gap !== null ? (
        <Row style={{ justifyContent: 'center' }}>
          <BigNumber value={gap <= 0 ? 'Touched!' : `${(gap * 100).toFixed(3)}%`} color={gap <= 0 ? C.up : C.ink} sub={gap <= 0 ? undefined : `to go ${locked!.up ? 'up' : 'down'} to ${fmtPx(target!)}`} />
        </Row>
      ) : null}
    </View>
  );
}
