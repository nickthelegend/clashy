// Survive (Nov 20): pick a leverage (and a side); the liquidation price is 1/leverage away (side 'both': either way).
// Still standing at the bell pays a fixed multiplier priced from the market's live volatility (97% of fair odds),
// shown for every leverage before you start and locked when you do. A liquidation pays nothing and ends it there.
// p: { levs: number[], side: 'choose' | 'both' | 'long' | 'short' }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { tickerOf, type Tick } from '../feed';
import { BigNumber, Choice, Clock, Go, MarketHead, Note, Panel, fmtPx, usd, useClock, type GameApi, type Line } from '../kit';
import { fmtX, pStay, pTouch, payoutFor, sigmaOf } from '../odds';
import { PxChart, RolledPanel, absPct, bellPrice, mktLine, pNums, pStr, roundPath, secsIn, useRolled, type Dot, type Level } from './_group-a';

type Dir = 'long' | 'short' | 'both';
type Final = { at: Tick; dead: boolean };

export default function Survive({ g }: { g: GameApi }) {
  const { def } = g;
  const levs = pNums(g, 'levs', [10, 25, 50, 100]).filter((x) => x >= 1);
  const sideP = pStr(g, 'side', ['choose', 'both', 'long', 'short'] as const, 'choose');
  const both = sideP === 'both';
  const { sym, shown, reroll } = useRolled(g);
  const [lev, setLev] = useState(levs[Math.min(1, levs.length - 1)] ?? 10);
  const [dir, setDir] = useState<Dir | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [locked, setLocked] = useState<{ lev: number; mult: number } | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  // live odds: survive one side (no touch of the liquidation price) or both sides (stay inside ±1/lev)
  const sigma = sym ? sigmaOf(g.feed, sym) : 0;
  const payFor = (l: number) => (both ? payoutFor(pStay(1 / l, sigma, def.secs)) : payoutFor(1 - pTouch(1 / l, sigma, def.secs)));

  const go = async (d: Dir, mult: number) => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const t0 = Date.now();
    const end = t0 + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setDir(d); setEntry({ t: t0, p: m.p }); setEndsAt(end); setLocked({ lev, mult });
  };

  const liqOf = (e: number, l: number, d: Dir) => ({ lo: d === 'short' ? null : e * (1 - 1 / l), hi: d === 'long' ? null : e * (1 + 1 / l) });

  useEffect(() => {
    if (!sym || !entry || !dir || !endsAt || !locked || settled.current || g.phase !== 'live') return;
    const { lo, hi } = liqOf(entry.p, locked.lev, dir);
    const b = bellPrice(g, sym, endsAt);
    const bell = typeof b === 'object' ? b : undefined;
    const path = roundPath(g, sym, entry, bell);
    const dead = path.find((x) => (lo !== null && x.p <= lo) || (hi !== null && x.p >= hi));
    if (!dead && !bell) {
      if (b === 'quiet') { settled.current = true; g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`); }
      return;
    }
    settled.current = true;
    const at = dead ?? bell!;
    setFinal({ at, dead: !!dead });
    const moves = path.filter((x) => x.t <= at.t).map((x) => x.p / entry.p - 1);
    const worst = dir === 'long' ? Math.max(0, -Math.min(...moves)) : dir === 'short' ? Math.max(0, Math.max(...moves)) : Math.max(...moves.map(Math.abs));
    const lines: Line[] = [
      ['Market', mktLine(g, sym)],
      ['Leverage', `${locked.lev}× ${dir === 'both' ? 'both ways' : dir}`],
      ['Locked payout', fmtX(locked.mult)],
      ['Entry', fmtPx(entry.p)],
      ['Liquidation', [lo, hi].filter((x): x is number => x !== null).map(fmtPx).join(' / ')],
      dead ? ['Liquidated', `${fmtPx(dead.p)}, ${secsIn(dead.t, entry.t)}`] : ['Price at the bell', fmtPx(bell!.p)],
      ['Closest call', `${absPct(worst)} of ${absPct(1 / locked.lev)}`],
    ];
    if (dead) g.end(0, `${tickerOf(sym)} hit your liquidation price ${secsIn(dead.t, entry.t)}.`, lines);
    else g.end(locked.mult, `Still standing at the bell on ${locked.lev}×. ${fmtX(locked.mult)}.`, lines);
  });

  const m = sym ? g.feed.mark(sym) : undefined;

  if (g.phase === 'setup' || !dir || !entry || !locked || !sym) {
    const pay = payFor(lev);
    const p = m?.p;
    const preview: Level[] = p ? [
      ...(sideP !== 'short' ? [{ p: p * (1 - 1 / lev), color: C.down, label: sideP === 'choose' ? 'Long liquidation' : 'Liquidation' }] : []),
      ...(sideP !== 'long' ? [{ p: p * (1 + 1 / lev), color: C.down, label: sideP === 'choose' ? 'Short liquidation' : 'Liquidation' }] : []),
    ] : [];
    return (
      <View style={{ gap: 14 }}>
        <RolledPanel g={g} sym={sym} shown={shown} onReroll={reroll} sub={`${def.secs} s round`} />
        <TourTarget id="g-pick">
          <View style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="small" style={{ ...FONT.semi }}>Leverage</Txt>
              <Txt v="small" style={{ fontSize: 12 }}>pays · liquidation</Txt>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {levs.map((l) => <LevTile key={l} lev={l} pay={sym ? payFor(l) : null} both={both} on={l === lev} tint={def.tint} onPress={() => setLev(l)} />)}
            </View>
          </View>
        </TourTarget>
        {sym ? <PxChart g={g} sym={sym} h={150} color={def.tint} levels={preview} /> : null}
        {g.stakeRow}
        <TourTarget id="g-go">
          {sideP === 'choose' ? (
            <Row style={{ gap: 12 }}>
              <Choice title="▲ LONG" sub={`${lev}× · pays ${fmtX(pay)}`} color={C.up} onPress={() => void go('long', pay)} disabled={!sym || g.busy} />
              <Choice title="▼ SHORT" sub={`${lev}× · pays ${fmtX(pay)}`} color={C.down} onPress={() => void go('short', pay)} disabled={!sym || g.busy} />
            </Row>
          ) : (
            <Go title={`Start at ${lev}×${both ? '' : ` ${sideP}`}`} sub={sym ? `Alive at the bell pays ${fmtX(pay)}` : undefined} color={def.tint} ink="#0A0A0D" onPress={() => void go(sideP, pay)} disabled={!sym || g.busy} />
          )}
        </TourTarget>
        <Note center>Alive at the bell pays the multiplier. Liquidated pays nothing.</Note>
      </View>
    );
  }

  const { lo, hi } = liqOf(entry.p, locked.lev, dir);
  const cur = final ? final.at.p : m?.p ?? entry.p;
  const d = 1 / locked.lev;
  const toLo = lo !== null ? cur / entry.p - 1 + d : Infinity; // distance left to each liquidation price
  const toHi = hi !== null ? d - (cur / entry.p - 1) : Infinity;
  const room = Math.max(0, Math.min(toLo, toHi));
  const health = final?.dead ? 0 : Math.max(0, Math.min(1, room / d));
  const shownLeft = final ? Math.max(0, (endsAt! - final.at.t) / 1000) : left;
  const levels: Level[] = [lo, hi].filter((x): x is number => x !== null).map((p) => ({ p, color: C.down, label: 'Liquidation' }));
  const dots: Dot[] = final?.dead ? [{ t: final.at.t, p: final.at.p, color: C.down, label: 'Liquidated' }] : [];
  const color = final?.dead ? C.down : final ? C.up : C.ink;

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry.p} />
        <View style={{ marginTop: 12 }}><Clock left={shownLeft} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></View>
      </Panel>
      <Panel tint={def.tint} style={{ gap: 10 }}>
        <BigNumber value={final?.dead ? '0×' : fmtX(locked.mult)} color={color}
          sub={final?.dead ? 'Liquidated' : final ? 'Survived' : `${locked.lev}× ${dir === 'both' ? 'both ways' : dir} · pays ${usd(g.stake * locked.mult)} at the bell`} />
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="small" style={{ ...FONT.semi }}>{final?.dead ? 'Liquidated' : 'Room to liquidation'}</Txt>
            <Txt v="small" color={health < 0.3 ? C.down : C.ink} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>{final?.dead ? secsIn(final.at.t, entry.t) : absPct(room)}</Txt>
          </Row>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: '#1C1C22', overflow: 'hidden' }}>
            <View style={{ height: 10, borderRadius: 5, width: `${health * 100}%`, backgroundColor: health < 0.3 ? C.down : def.tint }} />
          </View>
        </View>
      </Panel>
      <PxChart g={g} sym={sym} from={entry.t} until={final?.at.t} entry={entry.p} h={200} levels={levels} dots={dots} />
    </View>
  );
}

function LevTile({ lev, pay, both, on, tint, onPress }: { lev: number; pay: number | null; both: boolean; on: boolean; tint: string; onPress: () => void }) {
  const ink = on ? '#0A0A0D' : C.ink;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      accessibilityLabel={`${lev}× leverage${pay ? `, pays ${fmtX(pay)}` : ''}`}
      style={({ pressed }) => ({ flexGrow: 1, flexBasis: '22%', minWidth: 72, minHeight: 96, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? tint : '#15151B', borderWidth: 2, borderColor: on ? '#fff' : 'transparent', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Text numberOfLines={1} style={{ ...FONT.displayB, fontSize: 24, letterSpacing: -0.6, color: ink }}>{lev}×</Text>
      <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 15, color: on ? ink : tint, fontVariant: ['tabular-nums'] }}>{pay ? fmtX(pay) : '–'}</Text>
      <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 11.5, color: on ? 'rgba(10,10,13,0.7)' : C.muted, fontVariant: ['tabular-nums'] }}>{both ? '±' : ''}{absPct(1 / lev)}</Text>
    </Pressable>
  );
}
