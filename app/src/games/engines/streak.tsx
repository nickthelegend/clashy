// Streak (Nov 20): back-to-back quick calls of `roundSecs` each. The pot starts at your stake and every right call
// multiplies it by `step`; between calls you cash out (the pot pays) or go again. A miss loses it all; a flat call is
// replayed. mode: same (one market), reroll (a new random market each call), choose (pick the next market from six).
// rounds: a gauntlet of exactly that many calls with no cash-out, paying step^rounds only if every call is right.
// p: { roundSecs: number, step: number, mode: 'same' | 'reroll' | 'choose', rounds?: number }
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { CallButtons } from '@/ui/clash';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { tickerOf, useLivePool, type Tick } from '../feed';
import { BigNumber, Clock, Go, MarketHead, MarketTile, Note, Panel, Tag, usd, useClock, useRoll, type GameApi, type Line } from '../kit';
import { fmtX, pick, sample } from '../odds';
import { PxChart, RolledPanel, Stat, bellPrice, mv, pNum, pStr, poolList } from './_group-a';

type Call = 'up' | 'down';
type Cur = { sym: string; call: Call; entry: Tick; endsAt: number };
type Done = { sym: string; call: Call; entry: Tick; exit: Tick; result: 'right' | 'wrong' | 'flat' };

export default function Streak({ g }: { g: GameApi }) {
  const { def } = g;
  const roundSecs = Math.max(3, pNum(g, 'roundSecs', 15));
  const step = Math.max(1.01, pNum(g, 'step', 1.9));
  const mode = pStr(g, 'mode', ['same', 'reroll', 'choose'] as const, 'same');
  const rounds = Math.max(0, Math.floor(pNum(g, 'rounds', 0)));
  const gauntlet = rounds > 0;
  const live = useLivePool(def.pool);
  const all = useMemo(() => poolList(def.pool), [def.pool]);
  const [sym, setSym] = useState<string | null>(null);
  const [tiles, setTiles] = useState<string[]>([]);
  const [cur, setCur] = useState<Cur | null>(null);
  const [last, setLast] = useState<Done | null>(null);
  const [calls, setCalls] = useState<Done[]>([]);
  const [wins, setWins] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const left = useClock(cur?.endsAt);
  const began = useRef(false);
  const starting = useRef(false);
  const handled = useRef<number | null>(null);
  const settled = useRef(false);

  // the first market (same / reroll) or the first six tiles (choose), as soon as the pool has live prices
  useEffect(() => {
    if (!live.length) return;
    if (mode === 'choose') { if (!sym && !cur && tiles.length < Math.min(6, live.length)) setTiles(sample(live, 6)); }
    else if (!sym) setSym(pick(live));
  }, [live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(all, mode !== 'choose' && sym ? [sym] : null, 700);

  const mult = Math.pow(step, wins);
  const pot = g.stake * mult;
  const linesOf = (h: Done[], w: number): Line[] => [
    ...h.map((x, i): Line => [`Call ${i + 1}`, `${tickerOf(x.sym)} ${x.call === 'up' ? 'Up' : 'Down'} · ${mv(x.exit.p / x.entry.p - 1)} ${x.result === 'right' ? '✓' : x.result === 'flat' ? '· flat, replayed' : '✗'}`]),
    ['Each right call', `×${step}`],
    ['Right calls', gauntlet ? `${w} of ${rounds}` : String(w)],
  ];

  const startCall = async (c: Call) => {
    if (!sym || cur || starting.current || settled.current) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    starting.current = true;
    try {
      const t0 = Date.now();
      if (!began.current) { if (!(await g.begin())) return; began.current = true; } else g.fail(undefined);
      setFlash(null);
      setCur({ sym, call: c, entry: { t: t0, p: m.p }, endsAt: t0 + roundSecs * 1000 });
    } finally { starting.current = false; }
  };

  // each call's bell: the first live price at or after it
  useEffect(() => {
    if (!cur || settled.current || g.phase !== 'live' || handled.current === cur.entry.t) return;
    const b = bellPrice(g, cur.sym, cur.endsAt);
    if (b === 'wait') return;
    handled.current = cur.entry.t;
    const tk = tickerOf(cur.sym);
    if (b === 'quiet') {
      settled.current = true;
      if (!gauntlet && wins > 0) g.end(mult, `No live ${tk} price came in at the bell, so that call doesn't count. You keep the pot.`, linesOf(calls, wins));
      else g.abandon(`No live ${tk} price came in at the bell, so your stake is back.`);
      return;
    }
    const exit = b;
    const move = exit.p / cur.entry.p - 1;
    const result: Done['result'] = move === 0 ? 'flat' : (move > 0) === (cur.call === 'up') ? 'right' : 'wrong';
    const done: Done = { sym: cur.sym, call: cur.call, entry: cur.entry, exit, result };
    const h = [...calls, done];
    setCalls(h); setLast(done); setCur(null);
    if (result === 'flat') { setFlash(`${tk} didn't move. Call it again.`); return; }
    if (result === 'wrong') {
      settled.current = true; setLost(true);
      g.end(0, `${tk} went ${move > 0 ? 'up' : 'down'}. The streak ends at ${wins}.`, linesOf(h, wins));
      return;
    }
    const w = wins + 1;
    setWins(w);
    if (gauntlet && w >= rounds) {
      settled.current = true;
      g.end(Math.pow(step, rounds), `All ${rounds} calls right. ${fmtX(Math.pow(step, rounds))}.`, linesOf(h, w));
      return;
    }
    setFlash(`${tk} went ${move > 0 ? 'up' : 'down'}. Pot ×${step}.`);
    if (mode === 'reroll') { const o = live.filter((s) => s !== cur.sym); if (o.length) setSym(pick(o)); }
    if (mode === 'choose') { setTiles(sample(live, 6)); setSym(null); }
  });

  const cashOut = () => {
    if (gauntlet || cur || starting.current || wins < 1 || settled.current || g.phase !== 'live') return;
    settled.current = true;
    g.end(mult, `Cashed out after ${wins} right call${wins === 1 ? '' : 's'}: ${fmtX(mult)}.`, linesOf(calls, wins));
  };

  const between = !cur && g.phase !== 'done';
  const showSym = cur?.sym ?? (g.phase === 'done' ? last?.sym : sym) ?? null;
  const picker = mode === 'choose' ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {tiles.length ? tiles.map((s) => <MarketTile key={s} g={g} sym={s} selected={s === sym} onPress={() => setSym(s)} />)
        : <Panel style={{ flex: 1, alignItems: 'center' }}><Note center>Finding markets with a live price…</Note></Panel>}
    </View>
  ) : g.phase === 'setup' ? (
    <RolledPanel g={g} sym={sym} shown={shown} onReroll={mode === 'same' ? () => { const o = live.filter((s) => s !== sym); if (o.length) setSym(pick(o)); } : undefined} sub={mode === 'reroll' ? 'a new market every call' : `${roundSecs} s calls`} />
  ) : sym ? (
    <Panel><MarketHead g={g} sym={sym} right={mode === 'reroll' ? <Tag text="NEXT MARKET" color={def.tint} /> : undefined} /></Panel>
  ) : null;

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">{picker}</TourTarget>
        {sym ? <PxChart g={g} sym={sym} h={140} color={def.tint} /> : null}
        <Row style={{ gap: 8 }}>
          <Stat k="Right call" v={`Pot ×${step}`} />
          {gauntlet ? <Stat k={`All ${rounds} right`} v={fmtX(Math.pow(step, rounds))} /> : <Stat k="Each call" v={`${roundSecs} s`} />}
        </Row>
        {g.stakeRow}
        <TourTarget id="g-go">
          <CallButtons onUp={() => void startCall('up')} onDown={() => void startCall('down')} disabled={!sym || g.busy} />
        </TourTarget>
        <Note center>{gauntlet ? `${rounds} right calls in a row pays ${fmtX(Math.pow(step, rounds))}. One miss loses it.` : 'Cash out between calls. One miss loses the pot.'}</Note>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <Panel tint={def.tint} style={{ gap: 10 }}>
        <BigNumber value={lost ? usd(0) : usd(pot)} color={lost ? C.down : wins > 0 ? C.up : C.ink}
          sub={lost ? `Missed after ${wins} right` : `${wins} right · ${fmtX(mult)} your stake${gauntlet ? ` · ${rounds - wins} to go` : ''}`} />
        <Dots wins={wins} rounds={rounds} lost={lost} ended={g.phase === 'done'} running={!!cur} tint={def.tint} step={step} />
      </Panel>
      {flash && between ? (
        <Animated.View key={flash} entering={FadeIn.duration(200)}>
          <Txt v="label" color={flash.includes("didn't move") ? C.ink : C.up} style={{ textAlign: 'center' }}>{flash}</Txt>
        </Animated.View>
      ) : null}
      {cur ? (
        <>
          <Panel>
            <MarketHead g={g} sym={cur.sym} from={cur.entry.p}
              right={<Text style={{ ...FONT.bold, fontSize: 18, color: cur.call === 'up' ? C.up : C.down }}>{cur.call === 'up' ? '▲ UP' : '▼ DOWN'}</Text>} />
            <View style={{ marginTop: 12 }}><Clock left={left} total={roundSecs} tint={def.tint} label={gauntlet ? `call ${wins + 1} of ${rounds}` : `call ${wins + 1}`} /></View>
          </Panel>
          <PxChart g={g} sym={cur.sym} from={cur.entry.t} entry={cur.entry.p} h={190} />
        </>
      ) : g.phase === 'done' ? (
        showSym && last ? <PxChart g={g} sym={showSym} from={last.entry.t} until={last.exit.t} entry={last.entry.p} h={170} /> : null
      ) : (
        <>
          {picker}
          {sym ? <PxChart g={g} sym={sym} h={150} color={def.tint} /> : null}
          <CallButtons onUp={() => void startCall('up')} onDown={() => void startCall('down')} disabled={!sym || g.busy} />
          {!gauntlet && wins > 0 ? (
            <Go title={`CASH OUT ${usd(pot)}`} sub={`${fmtX(mult)} your stake`} color={def.tint} ink="#0A0A0D" onPress={cashOut} />
          ) : null}
          <Note center>{gauntlet ? `Call ${wins + 1} of ${rounds}. No cash-out until the end.` : mode === 'choose' ? 'Pick a market, then call it.' : 'Call again for the next step, or cash out.'}</Note>
        </>
      )}
    </View>
  );
}

/** The streak so far: a dot per right call, the one in play, and (gauntlet) the calls still to come. */
function Dots({ wins, rounds, lost, ended, running, tint, step }: { wins: number; rounds: number; lost: boolean; ended: boolean; running: boolean; tint: string; step: number }) {
  const n = rounds > 0 ? rounds : wins + (ended && !lost ? 0 : 1);
  return (
    <Row style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {Array.from({ length: n }, (_, i) => {
        const right = i < wins;
        const miss = lost && i === wins;
        const now = !ended && i === wins;
        return (
          <Animated.View key={i} entering={right ? ZoomIn.springify().damping(12) : undefined}
            style={{ minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: right ? C.up : miss ? C.down : '#17171D', borderWidth: 2, borderColor: now ? (running ? '#fff' : tint) : 'transparent' }}>
            <Text style={{ ...FONT.bold, fontSize: right || miss ? 15 : 12, color: right || miss ? '#0A0A0D' : now ? tint : C.dim }}>
              {right ? '✓' : miss ? '✗' : now && rounds === 0 ? `×${step}` : i + 1}
            </Text>
          </Animated.View>
        );
      })}
    </Row>
  );
}
