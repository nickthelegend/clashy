// Range (Nov 20): a band around the entry, sized from the market's own live volatility so either side is an even bet.
// stay: STAY inside the band to the bell, or BREAK out of it (a touch ends the round there). side: which edge breaks
// first, UP or DOWN (no break by the bell is a push). bell: CALM or WILD, is the move at the bell inside the band or
// past it. Clashy Bot takes the other side; the right side wins 2×.
// p: { mode: 'stay' | 'side' | 'bell' }
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Row } from '@/ui/kit';
import { C } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { tickerOf, type Tick } from '../feed';
import { BotSays, Choice, Clock, MarketHead, Note, Panel, PxChart, RolledPanel, Sides, StatTile, absPct, bellPrice, fmtPx, lengthLabel, mktLine, mv, pStr, roundPath, secsIn, useClock, useRolled, type Dot, type GameApi, type Level, type Line } from '../kit';
import { evenBand, evenMove, sigmaOf } from '../odds';

type Mode = 'stay' | 'side' | 'bell';
type Side = 'a' | 'b';
type Final = { winner: Side | null; at: Tick; touched?: 'top' | 'bottom' };
/** Never a band narrower than ±0.02%. */
const MIN_HALF = 0.0002;

const COPY: Record<Mode, { a: string; b: string; aSub: string; bSub: string }> = {
  stay: { a: 'STAY', b: 'BREAK', aSub: 'Inside the band to the bell', bSub: 'Touches an edge first' },
  side: { a: '▲ UP', b: '▼ DOWN', aSub: 'Breaks the top first', bSub: 'Breaks the bottom first' },
  bell: { a: 'CALM', b: 'WILD', aSub: 'Inside the band at the bell', bSub: 'Past it at the bell' },
};

export default function Range({ g }: { g: GameApi }) {
  const { def } = g;
  const mode = pStr(g, 'mode', ['stay', 'side', 'bell'] as const, 'stay');
  const copy = COPY[mode];
  const { sym, shown, reroll } = useRolled(g);
  const [side, setSide] = useState<Side | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [half, setHalf] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  const widthOf = (s: string) => {
    const sigma = sigmaOf(g.feed, s);
    return Math.max(MIN_HALF, mode === 'bell' ? evenMove(sigma, def.secs) : evenBand(sigma, def.secs));
  };
  const colorOf = (s: Side) => (mode === 'side' ? (s === 'a' ? C.up : C.down) : s === 'a' ? def.tint : C.ink);
  const label = (s: Side) => (s === 'a' ? copy.a : copy.b);
  const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');

  const go = async (s: Side) => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const w = widthOf(sym);
    const t0 = Date.now();
    const end = t0 + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setSide(s); setEntry({ t: t0, p: m.p }); setHalf(w); setEndsAt(end);
  };

  // a touch ends stay/side at once; otherwise the first live price at or after the bell decides it
  useEffect(() => {
    if (!sym || !entry || !side || !endsAt || settled.current || g.phase !== 'live') return;
    const lo = entry.p * (1 - half), hi = entry.p * (1 + half);
    const b = bellPrice(g, sym, endsAt);
    const bell = typeof b === 'object' ? b : undefined;
    const path = roundPath(g, sym, entry, bell);
    let fin: Final | null = null;
    if (mode !== 'bell') {
      const hit = path.find((x) => x.p >= hi || x.p <= lo);
      if (hit) { const top = hit.p >= hi; fin = { at: hit, touched: top ? 'top' : 'bottom', winner: mode === 'stay' ? 'b' : top ? 'a' : 'b' }; }
      else if (bell) fin = { at: bell, winner: mode === 'stay' ? 'a' : null };
    } else if (bell) {
      const x = Math.abs(bell.p / entry.p - 1);
      fin = { at: bell, winner: x === half ? null : x < half ? 'a' : 'b' };
    }
    if (!fin) {
      if (b === 'quiet') { settled.current = true; g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`); }
      return;
    }
    settled.current = true;
    setFinal(fin);
    const tk = tickerOf(sym);
    const move = fin.at.p / entry.p - 1;
    const lines: Line[] = [
      ['Market', mktLine(g, sym)],
      ['Your side', label(side).replace(/^[▲▼] /, '')],
      ['Clashy Bot', label(other(side)).replace(/^[▲▼] /, '')],
      ['Entry', fmtPx(entry.p)],
      ['Band', `±${absPct(half)}`],
      ['Top / bottom', `${fmtPx(hi)} / ${fmtPx(lo)}`],
      fin.touched ? [fin.touched === 'top' ? 'Broke the top' : 'Broke the bottom', `${fmtPx(fin.at.p)}, ${secsIn(fin.at.t, entry.t)}`] : ['Price at the bell', fmtPx(fin.at.p)],
      ['Move', mv(move)],
    ];
    const what = fin.touched
      ? mode === 'stay' ? `${tk} broke the band ${secsIn(fin.at.t, entry.t)}.` : `${tk} broke the ${fin.touched} first.`
      : mode === 'stay' ? `${tk} stayed inside to the bell.` : mode === 'side' ? `${tk} broke neither edge.` : `${tk} moved ${mv(move)}, ${fin.winner === 'a' ? 'inside' : fin.winner === 'b' ? 'past' : 'right on'} the band.`;
    const who = fin.winner === null ? ' Push.' : fin.winner === side ? ' You called it.' : ' Clashy Bot takes it.';
    g.end(fin.winner === null ? 1 : fin.winner === side ? 2 : 0, what + who, lines);
  });

  const m = sym ? g.feed.mark(sym) : undefined;

  if (g.phase === 'setup' || !side || !entry || !sym) {
    const w = sym ? widthOf(sym) : 0;
    const p = m?.p;
    const edge = (f: number, lab: string, color: string): Level => ({ p: (p ?? 0) * (1 + f), color, label: lab, fit: true });
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <RolledPanel g={g} sym={sym} shown={shown} onReroll={reroll} sub={`${def.secs} s round`} />
        </TourTarget>
        {sym && p ? (
          <PxChart g={g} sym={sym} h={160} band={{ lo: p * (1 - w), hi: p * (1 + w), color: def.tint }}
            levels={[edge(w, `+${absPct(w)}`, mode === 'side' ? C.up : def.tint), edge(-w, `−${absPct(w)}`, mode === 'side' ? C.down : def.tint)]} />
        ) : null}
        {sym ? (
          <Row style={{ gap: 8 }}>
            <StatTile k="Band" v={`±${absPct(w)}`} />
            <StatTile k="Round" v={lengthLabel(def.secs)} />
            <StatTile k="Right side" v="2×" />
          </Row>
        ) : null}
        {g.stakeRow}
        <TourTarget id="g-go">
          <Row style={{ gap: 12 }}>
            <Choice title={copy.a} sub={copy.aSub} color={colorOf('a')} onPress={() => void go('a')} disabled={!sym || g.busy} h={104} />
            <Choice title={copy.b} sub={copy.bSub} color={colorOf('b')} onPress={() => void go('b')} disabled={!sym || g.busy} h={104} />
          </Row>
        </TourTarget>
        <Note center>Clashy Bot takes the other side. Right side: 2× your stake.</Note>
      </View>
    );
  }

  const lo = entry.p * (1 - half), hi = entry.p * (1 + half);
  const cur = final ? final.at.p : m?.p ?? entry.p;
  const now = cur / entry.p - 1;
  // who's ahead right now (stay: inside means STAY; side: the edge it's leaning to; bell: inside or past)
  const ahead: Side | null = final ? final.winner : mode === 'stay' ? 'a' : mode === 'side' ? (now > 0 ? 'a' : now < 0 ? 'b' : null) : Math.abs(now) < half ? 'a' : 'b';
  const lead = ahead === null ? null : ahead === side ? 'you' : 'bot';
  const shownLeft = final ? Math.max(0, (endsAt! - final.at.t) / 1000) : left;
  const dots: Dot[] = final?.touched ? [{ t: final.at.t, p: final.at.p, color: mode === 'side' ? (final.touched === 'top' ? C.up : C.down) : def.tint, label: 'Break' }] : [];
  const botLine = mode === 'stay'
    ? side === 'a' ? "One touch of an edge and it's mine." : 'Every second inside the band is mine.'
    : lead === 'you' ? "You're ahead. Bell's coming." : lead === 'bot' ? "I'm ahead right now." : 'Dead even. Anything can happen.';

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry.p} />
        <View style={{ marginTop: 12 }}><Clock left={shownLeft} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></View>
      </Panel>
      <PxChart g={g} sym={sym} from={entry.t} until={final?.at.t} entry={entry.p} h={210} dots={dots}
        band={{ lo, hi, color: def.tint }}
        levels={[
          { p: hi, color: mode === 'side' ? C.up : def.tint, label: `Top ${fmtPx(hi)}`, fit: true },
          { p: lo, color: mode === 'side' ? C.down : def.tint, label: `Bottom ${fmtPx(lo)}`, fit: true },
        ]} />
      <Row style={{ gap: 8 }}>
        {mode === 'bell' ? (
          <>
            <StatTile k={final ? 'Move at the bell' : 'Move now'} v={mv(now)} color={now === 0 ? C.ink : now > 0 ? C.up : C.down} />
            <StatTile k="Band" v={`±${absPct(half)}`} />
          </>
        ) : (
          <>
            <StatTile k="To the top" v={final?.touched ? (final.touched === 'top' ? 'Broken' : '–') : mv(hi / cur - 1)} color={mode === 'side' ? C.up : undefined} />
            <StatTile k="To the bottom" v={final?.touched ? (final.touched === 'bottom' ? 'Broken' : '–') : mv(lo / cur - 1)} color={mode === 'side' ? C.down : undefined} />
          </>
        )}
      </Row>
      <Sides lead={lead}
        you={{ title: label(side), color: colorOf(side), sub: side === 'a' ? copy.aSub : copy.bSub }}
        bot={{ title: label(other(side)), color: colorOf(other(side)), sub: side === 'a' ? copy.bSub : copy.aSub }} />
      {g.phase === 'live' ? <BotSays text={botLine} /> : null}
    </View>
  );
}
