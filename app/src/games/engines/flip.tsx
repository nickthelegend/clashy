// Flip (Nov 20): one rolled market. Open LONG or SHORT at `lev`; during the round one FLIP turns your side round at the
// live price, and then it's locked. Clashy Bot opens the other side and picks a moment at random when the round starts
// (even odds it never flips) to flip once too. P&L is leg by leg at the leverage: each leg's move since it opened, added
// up. Down 100% is liquidated and stays there. The better P&L at the bell wins 2×; level is a push.
// p: { lev?: number = 10 }
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { CallButtons } from '@/ui/clash';
import { LiveChart, Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, poolOf, tickerOf, useLivePool, type PoolKey, type Tick } from '../feed';
import { BotSays, Clock, Go, Logo, MarketChart, MarketHead, Note, Panel, Pill, Tag, captureAt, dirOf, fmtPx, otherSide, pathOf, readEntries, sideColor, sideGlyph, sideWord, useClock, useRoll, type GameApi, type Line, type Side } from '../kit';
import { pick, signedPct } from '../odds';

/** The tick a side flipped on. */
type FlipAt = { t: number; p: number };
type Result = { pnl: number; liq: boolean };

/** A side's P&L (a fraction of its margin), walked tick by tick from the entry with its flip; −100% once liquidated. */
function walk(entry: number, side: Side, lev: number, flip: FlipAt | null, ticks: Tick[]): Result {
  const d = dirOf(side);
  let pnl = 0;
  for (const x of ticks) {
    pnl = !flip || x.t <= flip.t ? d * lev * (x.p / entry - 1) : d * lev * (flip.p / entry - 1) - d * lev * (x.p / flip.p - 1);
    if (pnl <= -1) return { pnl: -1, liq: true };
  }
  return { pnl, liq: false };
}
const sideNow = (side: Side, flip: FlipAt | null) => (flip ? otherSide(side) : side);

export default function FlipGame({ g }: { g: GameApi }) {
  const { def } = g;
  const lev = Math.max(1, Number(def.p?.lev ?? 10));
  const live = useLivePool(def.pool as PoolKey[]);
  const [sym, setSym] = useState<string | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [mine, setMine] = useState<FlipAt | null>(null);
  const [bots, setBots] = useState<FlipAt | null>(null);
  const [final, setFinal] = useState<{ me: Result; bot: Result; bell: Tick } | null>(null);
  const botAt = useRef<number | null>(null);
  const bell = useRef(new Map<string, Tick>());
  const settled = useRef(false);
  const left = useClock(endsAt);

  useEffect(() => { if (!sym && live.length) setSym(pick(live)); }, [sym, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(useMemo(() => poolOf(def.pool as PoolKey[]), [def.pool]), sym ? [sym] : null, 800);

  const go = async (s: Side) => {
    if (!sym) return;
    const e = readEntries(g.feed, [sym]);
    if (!e.ok) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const start = Date.now();
    const end = start + def.secs * 1000;
    if (!(await g.begin(end))) return;
    // Clashy Bot's flip moment, chosen now: even odds it never flips, else somewhere in the middle of the round
    botAt.current = Math.random() < 0.5 ? null : start + def.secs * 1000 * (0.12 + 0.76 * Math.random());
    setSide(s); setEntry(e.at[sym]!); setStartedAt(start); setEndsAt(end);
  };

  const flipNow = () => {
    if (!sym || !side || !entry || !endsAt || mine || g.phase !== 'live' || Date.now() >= endsAt) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price to flip at.`); return; }
    g.fail();
    setMine({ t: m.t, p: m.p });
  };

  // Clashy Bot's flip (on the first live price at or after its moment) and the bell
  useEffect(() => {
    if (!sym || !side || !entry || !endsAt || settled.current || g.phase !== 'live') return;
    const now = Date.now();
    const m = g.feed.mark(sym);
    const at = botAt.current;
    if (at && !bots && now >= at && m && m.t >= at && m.t < endsAt) setBots({ t: m.t, p: m.p });
    if (now < endsAt) return;
    if (captureAt(bell.current, g.feed, [sym], endsAt)) {
      settled.current = true;
      const b = bell.current.get(sym)!;
      const ticks = pathOf(g.feed, sym, entry.t, b.t);
      const botFlip = bots && bots.t < endsAt ? bots : null;
      const me = walk(entry.p, side, lev, mine, ticks);
      const bot = walk(entry.p, otherSide(side), lev, botFlip, ticks);
      setFinal({ me, bot, bell: b });
      const diff = me.pnl - bot.pnl;
      const tk = tickerOf(sym);
      const pct = (r: Result) => (r.liq ? 'liquidated' : signedPct(r.pnl, 1));
      const lines: Line[] = [
        ['Market', `${nameOf(g.info, sym)} (${tk})`],
        ['Leverage', `${lev}×`],
        ['Entry', fmtPx(entry.p)],
        ['You', mine ? `${sideWord(side)}, flipped at ${fmtPx(mine.p)}` : `${sideWord(side)}, no flip`],
        ['Clashy Bot', botFlip ? `${sideWord(otherSide(side))}, flipped at ${fmtPx(botFlip.p)}` : `${sideWord(otherSide(side))}, no flip`],
        ['Price at the bell', fmtPx(b.p)],
        ['Your P&L', pct(me)],
        ["Clashy Bot's P&L", pct(bot)],
      ];
      if (Math.abs(diff) < 1e-9) g.end(1, me.liq ? 'Both liquidated. Push.' : 'Level P&L at the bell. Push.', lines);
      else if (diff > 0) g.end(2, `You finished ${pct(me)} to Clashy Bot's ${pct(bot)}.`, lines);
      else g.end(0, `Clashy Bot finished ${pct(bot)} to your ${pct(me)}.`, lines);
    } else if (now > endsAt + 15_000) {
      settled.current = true;
      g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`);
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
        <Note center>One flip each. Clashy Bot takes the other side. Better P&L at the bell: 2×.</Note>
      </View>
    );
  }

  if (!sym || !side || !entry || !startedAt) return <Note center>Opening your position…</Note>;

  const ticks = final ? pathOf(g.feed, sym, entry.t, final.bell.t) : pathOf(g.feed, sym, entry.t);
  const botFlip = bots;
  const me = final?.me ?? walk(entry.p, side, lev, mine, ticks);
  const bot = final?.bot ?? walk(entry.p, otherSide(side), lev, botFlip, ticks);
  const lead = me.pnl - bot.pnl;
  const open = g.phase === 'live' && !!left && left > 0;
  const mySide = sideNow(side, mine);

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry.p} right={<Tag text={`${lev}×`} color={def.tint} />} />
        <View style={{ marginTop: 12 }}><Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></View>
      </Panel>
      <FlipChart g={g} sym={sym} entry={entry} upto={final?.bell.t} flips={[mine ? { f: mine, who: 'you' } : null, botFlip ? { f: botFlip, who: 'bot' } : null]} />
      <Row style={{ gap: 10 }}>
        <PnlCard who="YOU" color={C.brand} side={side} flip={mine} r={me} ahead={lead > 0} />
        <PnlCard who="CLASHY BOT" color={C.opp} side={otherSide(side)} flip={botFlip} r={bot} ahead={lead < 0} />
      </Row>
      {g.phase === 'live' ? (
        <>
          <Go title={mine ? `Flipped to ${sideWord(mySide)}` : me.liq ? 'Liquidated' : `FLIP TO ${sideWord(otherSide(side))}`}
            sub={mine ? `at ${fmtPx(mine.p)} · locked` : me.liq ? undefined : `at ${fmtPx(m?.p)} · one flip a round`}
            color={def.tint} ink="#0A0A0D" onPress={flipNow} disabled={!!mine || me.liq || !open} />
          <Animated.View entering={FadeIn}>
            <BotSays text={botFlip ? `I flipped to ${sideWord(side)} at ${fmtPx(botFlip.p)}.` : lead === 0 ? 'Dead even. I might flip. I might not.' : lead > 0 ? "You're ahead. I might flip." : "I'm ahead. Your move."} />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

function PnlCard({ who, color, side, flip, r, ahead }: { who: string; color: string; side: Side; flip: FlipAt | null; r: Result; ahead: boolean }) {
  const now = sideNow(side, flip);
  return (
    <Panel style={{ flex: 1, alignItems: 'center', gap: 6 }} tint={ahead ? (who === 'YOU' ? C.up : C.opp) : undefined}>
      <Tag text={who} color={color} />
      <Txt v="label" color={sideColor(now)} style={{ fontSize: 18 }}>{sideGlyph(now)} {sideWord(now)}</Txt>
      <Text style={{ ...FONT.displayB, fontSize: 30, letterSpacing: -1, color: r.liq || r.pnl < 0 ? C.down : r.pnl > 0 ? C.up : C.ink, fontVariant: ['tabular-nums'] }}>
        {r.liq ? '−100%' : signedPct(r.pnl, 1)}
      </Text>
      <Txt v="small" lines={2} style={{ textAlign: 'center' }}>{r.liq ? 'Liquidated' : flip ? `Flipped at ${fmtPx(flip.p)}` : 'No flip yet'}</Txt>
    </Panel>
  );
}

/** The round's chart with each flip marked where it happened (LiveChart's own scale, worked out the same way). */
function FlipChart({ g, sym, entry, upto, flips }: { g: GameApi; sym: string; entry: Tick; upto?: number; flips: ({ f: FlipAt; who: 'you' | 'bot' } | null)[] }) {
  const h = 200;
  const w = g.width;
  const ticks = [entry, ...pathOf(g.feed, sym, entry.t, upto)];
  const data = ticks.map((x) => x.p);
  if (data.length === 1) data.push(data[0]!);
  const times = ticks.map((x) => x.t);
  if (times.length === 1) times.push(times[0]!);
  const last = data[data.length - 1]!;
  let lo = Math.min(...data, entry.p), hi = Math.max(...data, entry.p);
  const need = last * 0.0008;
  if (hi - lo < need) { const mid = (hi + lo) / 2; lo = mid - need / 2; hi = mid + need / 2; }
  const pad = (hi - lo) * 0.14; lo -= pad; hi += pad;
  const X = (i: number) => 4 + (i / (data.length - 1)) * (w - 74);
  const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (h - 16);
  return (
    <View style={{ width: w, height: h }}>
      <LiveChart data={data} w={w} h={h} refLine={entry.p} refLabel="Entry" times={times} fmt={(v) => fmtPx(v)} />
      {flips.map((x) => {
        if (!x) return null;
        let i = 0;
        for (let k = 0; k < ticks.length; k++) if (ticks[k]!.t <= x.f.t) i = k;
        const cx = X(i), cy = Y(x.f.p);
        const c = x.who === 'you' ? C.brand : C.opp;
        const above = x.who === 'you' ? cy > 34 : cy > h - 34;
        return (
          <Animated.View key={x.who} entering={ZoomIn.duration(240)} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }}>
            <View style={{ position: 'absolute', left: cx - 8, top: cy - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#000', borderWidth: 3, borderColor: c }} />
            <View style={{ position: 'absolute', left: Math.max(0, Math.min(w - 58, cx - 29)), top: above ? cy - 32 : cy + 12, width: 58, alignItems: 'center' }}>
              <View style={{ backgroundColor: c, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ ...FONT.bold, fontSize: 10, color: '#0A0A0D' }}>{x.who === 'you' ? 'YOU ⇄' : 'BOT ⇄'}</Text>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
