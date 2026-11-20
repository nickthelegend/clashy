// Add once (Nov 20): solo. One rolled market; open LONG or SHORT at `lev`. The whole stake is taken at the start, but
// only half of it goes in; one ADD puts the other half in at the live price, doubling the position. At the bell the
// position is worth each half's margin × (1 + lev × its move since it went in), plus the half you never added. If the
// position's equity hits zero it's liquidated on the spot and only the unadded half (if any) comes back.
// Payout = value ÷ stake.
// p: { lev?: number = 10 }
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CallButtons } from '@/ui/clash';
import { Row, Txt } from '@/ui/kit';
import { C } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, poolOf, tickerOf, useLivePool, type PoolKey, type Tick } from '../feed';
import { BigNumber, Clock, Go, Logo, MarketChart, MarketHead, Note, Panel, Tag, fmtPx, usd, useClock, useRoll, type GameApi, type Line } from '../kit';
import { fmtX, pick, signedPct } from '../odds';
import { Pill, Stat, captureAt, dirOf, pathOf, readEntries, sideColor, sideGlyph, sideWord, type Side } from './_group-c';

type State = { value: number; pos: number; reserve: number; liq: boolean; liqAt?: Tick };

/** Walks the ticks since the entry: the position's equity (the margin in plus its P&L) and the half not yet added. */
function walk(entry: number, add: Tick | null, side: Side, lev: number, half: number, ticks: Tick[]): State {
  const d = dirOf(side);
  let pos = half, reserve = half;
  for (const x of ticks) {
    const leg1 = half * (1 + d * lev * (x.p / entry - 1));
    const added = !!add && x.t > add.t;
    pos = added ? leg1 + half * (1 + d * lev * (x.p / add!.p - 1)) : leg1;
    reserve = added ? 0 : half;
    if (pos <= 0) return { value: reserve, pos: 0, reserve, liq: true, liqAt: x };
  }
  return { value: pos + reserve, pos, reserve, liq: false };
}
/** Where the position is liquidated: one half at `e1`, or both halves (e1 and e2) after the add. Null if it can't be. */
function liqPrice(side: Side, lev: number, e1: number, e2?: number) {
  const d = dirOf(side);
  const h = e2 ? 2 / (1 / e1 + 1 / e2) : e1;
  const p = h * (1 - 1 / (d * lev));
  return p > 0 ? p : null;
}

export default function AddOnce({ g }: { g: GameApi }) {
  const { def } = g;
  const lev = Math.max(1, Number(def.p?.lev ?? 10));
  const live = useLivePool(def.pool as PoolKey[]);
  const [sym, setSym] = useState<string | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [stake, setStake] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [add, setAdd] = useState<Tick | null>(null);
  const [final, setFinal] = useState<{ s: State; upto: number } | null>(null);
  const bell = useRef(new Map<string, Tick>());
  const settled = useRef(false);
  const left = useClock(endsAt);
  const half = g.stake / 2;

  useEffect(() => { if (!sym && live.length) setSym(pick(live)); }, [sym, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(useMemo(() => poolOf(def.pool as PoolKey[]), [def.pool]), sym ? [sym] : null, 800);

  const go = async (s: Side) => {
    if (!sym) return;
    const e = readEntries(g.feed, [sym]);
    if (!e.ok) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const end = Date.now() + def.secs * 1000;
    const st = g.stake;
    if (!(await g.begin(end))) return;
    setSide(s); setEntry(e.at[sym]!); setStake(st); setStartedAt(Date.now()); setEndsAt(end);
  };

  const addNow = () => {
    if (!sym || !entry || !endsAt || add || g.phase !== 'live' || Date.now() >= endsAt) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price to add at.`); return; }
    g.fail();
    setAdd({ t: m.t, p: m.p });
  };

  const settle = (s: State, upto: number, lines: Line[], verdict: string) => {
    settled.current = true;
    setFinal({ s, upto });
    g.end(stake > 0 ? s.value / stake : 0, verdict, lines);
  };

  // liquidation (any tick) and the bell
  useEffect(() => {
    if (!sym || !side || !entry || !endsAt || !stake || settled.current || g.phase !== 'live') return;
    const now = Date.now();
    const b = now >= endsAt && captureAt(bell.current, g.feed, [sym], endsAt) ? bell.current.get(sym)! : null;
    const upto = b ? b.t : Infinity;
    const s = walk(entry.p, add, side, lev, stake / 2, pathOf(g.feed, sym, entry.t, upto));
    const tk = tickerOf(sym);
    const base: Line[] = [
      ['Market', `${nameOf(g.info, sym)} (${tk})`],
      ['Position', `${sideWord(side)} at ${lev}×`],
      ['Entry (half)', fmtPx(entry.p)],
      ['Add (other half)', add ? fmtPx(add.p) : 'Not added'],
    ];
    if (s.liq && s.liqAt && s.liqAt.t < endsAt) {
      settle(s, s.liqAt.t, [...base, ['Liquidated at', fmtPx(s.liqAt.p)], ['Value', usd(s.value)]],
        add ? `Liquidated at ${fmtPx(s.liqAt.p)}.` : `Liquidated at ${fmtPx(s.liqAt.p)}. The half you never added comes back.`);
      return;
    }
    if (now < endsAt) return;
    if (b) {
      const lines: Line[] = s.liq && s.liqAt
        ? [...base, ['Liquidated at', fmtPx(s.liqAt.p)], ['Value', usd(s.value)]]
        : [...base, ['Price at the bell', fmtPx(b.p)], ['Move', signedPct(b.p / entry.p - 1, 3)], ['Value', usd(s.value)], ['Payout', fmtX(s.value / stake)]];
      const pnl = s.value - stake;
      settle(s, b.t, lines, s.liq ? 'Liquidated at the bell.' : Math.abs(pnl) < 0.005 ? 'Worth what you put in. Stake back.' : pnl > 0 ? `Worth ${usd(s.value)} at the bell. Nice ride.` : `Worth ${usd(s.value)} at the bell.`);
    } else if (now > endsAt + 15_000) {
      settled.current = true;
      g.abandon(`No live ${tk} price came in at the bell, so your stake is back.`);
    }
  });

  const m = sym ? g.feed.mark(sym) : undefined;

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <Panel style={{ alignItems: 'center', gap: 10 }}>
            {sym ? <Logo sym={shown(0) || sym} info={g.info} size={84} /> : <View style={{ width: 84, height: 84 }} />}
            <Txt v="title" style={{ fontSize: 24, textAlign: 'center' }}>{sym ? nameOf(g.info, shown(0) || sym) : 'Rolling…'}</Txt>
            <Note center>{sym ? `${tickerOf(sym)} · ${fmtPx(m?.p)} · ${lev}× · ${def.secs} s round` : 'Finding a market with a live price…'}</Note>
            {sym ? <Pill label="Roll again" onPress={() => setSym(pick(live.filter((s) => s !== sym)) ?? sym)} /> : null}
          </Panel>
        </TourTarget>
        {sym ? <MarketChart g={g} sym={sym} h={150} /> : null}
        {g.stakeRow}
        <TourTarget id="g-go">
          <CallButtons upLabel="LONG" downLabel="SHORT" onUp={() => void go('long')} onDown={() => void go('short')} disabled={!sym || g.busy} />
        </TourTarget>
        <Note center>{usd(half)} goes in now. One ADD puts in the other {usd(half)} at the price then.</Note>
      </View>
    );
  }

  if (!sym || !side || !entry || !startedAt || !stake) return <Note center>Opening your position…</Note>;

  const s = final?.s ?? walk(entry.p, add, side, lev, stake / 2, pathOf(g.feed, sym, entry.t));
  const pnl = s.value - stake;
  const liqNow = liqPrice(side, lev, entry.p, add?.p);
  const liqIfAdd = !add && m ? liqPrice(side, lev, entry.p, m.p) : null;
  const open = g.phase === 'live' && !!left && left > 0 && !s.liq;
  const dist = liqNow && m ? Math.abs(m.p / liqNow - 1) : null;

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry.p} right={<Tag text={`${sideGlyph(side)} ${sideWord(side)} ${lev}×`} color={sideColor(side)} />} />
        <View style={{ marginTop: 12 }}><Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></View>
      </Panel>
      <Panel style={{ alignItems: 'center' }} tint={s.liq ? C.down : undefined}>
        <BigNumber value={usd(s.value)} color={s.liq || pnl < -0.004 ? C.down : pnl > 0.004 ? C.up : C.ink} sub={s.liq ? 'Liquidated' : `${fmtX(s.value / stake)} of your ${usd(stake)} stake`} />
      </Panel>
      <MarketChart g={g} sym={sym} from={startedAt} entry={entry.p} h={170} />
      <Panel style={{ gap: 9 }}>
        <Stat label="In the position" value={add ? `${usd(stake)} (both halves)` : `${usd(stake / 2)} (half)`} />
        <Stat label="Entry" value={add ? `${fmtPx(entry.p)} and ${fmtPx(add.p)}` : fmtPx(entry.p)} />
        <Stat label="Liquidation price" value={liqNow ? `${fmtPx(liqNow)}${dist !== null && !s.liq ? ` · ${(dist * 100).toFixed(2)}% away` : ''}` : 'None'} color={dist !== null && dist < 0.25 / lev ? C.down : undefined} />
        {!add && open && liqIfAdd ? <Stat label="Liquidation if you add now" value={fmtPx(liqIfAdd)} /> : null}
      </Panel>
      {g.phase === 'live' ? (
        <Animated.View entering={FadeIn} style={{ gap: 8 }}>
          {!add && open ? <Txt v="label" color={def.tint} style={{ textAlign: 'center' }}>Adding costs another {usd(stake / 2)}</Txt> : null}
          <Go title={add ? `Added at ${fmtPx(add.p)}` : s.liq ? 'Liquidated' : `ADD at ${fmtPx(m?.p)}`} sub={add ? 'Position doubled' : s.liq ? undefined : `Puts in the other ${usd(stake / 2)}`}
            color={def.tint} ink="#0A0A0D" onPress={addNow} disabled={!!add || !open} />
        </Animated.View>
      ) : null}
      {g.phase === 'live' && !add ? (
        <Row style={{ justifyContent: 'center' }}><Note center>Not adding? That {usd(stake / 2)} comes back at the bell.</Note></Row>
      ) : null}
    </View>
  );
}
