// Exit Plan (Nov 21): set your exit second before the round. One rolled market: pick LONG or SHORT at `lev` and the
// whole second you get out (5 … secs−2). When the round starts Clashy Bot opens the same side at the same entry and
// picks a random exit second in the same range, kept secret until it happens. Each exit price is the first live price
// at or after that moment. A side is liquidated (−100%) the moment, before its exit, the price has moved against it by
// 1/lev from the entry. P&L = dir · (exit / entry − 1) · lev, as a share of the margin. Once both are out, the better
// P&L wins 2×; level (both liquidated included) is a push. No price within 15 s of an exit: stake back.
// p: { lev: number = 100 }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import {
  BotSays, Choice, Clock, GT, Go, MarketHead, Note, Panel, PxChart, RolledPanel, Sides, Slider, Tag, bellPrice, dirOf, fmtPx, mktLine, pNum, pathOf, pick,
  rollable, sideColor, sideGlyph, sideWord, signedPct, tickerOf, useClock, useRolled, type Dot, type GameApi, type Level, type Line, type Side, type Tick,
} from '../kit';

type Run = { entry: Tick; t0: number; endsAt: number; side: Side; me: number; bot: number };
/** How a side got out: its exit (or liquidation) tick, the second it happened, and the P&L (−1 when liquidated). */
type Exit = { t: number; p: number; sec: number; pnl: number; liq: boolean };
type Who = 'me' | 'bot';

const FIRST = 5;
const pctOf = (e: Exit) => (e.liq ? 'liquidated' : signedPct(e.pnl, 1));
const shortPct = (pnl: number, liq: boolean) => (liq ? 'LIQ' : signedPct(pnl, Math.abs(pnl) < 0.1 ? 1 : 0));
const pnlColor = (v: number) => (v > 0 ? C.up : v < 0 ? C.down : C.ink);

export default function Timer({ g }: { g: GameApi }) {
  const { def } = g;
  const lev = Math.max(1, pNum(g, 'lev', 100));
  const last = Math.max(FIRST, Math.floor(def.secs) - 2);
  const roll = useRolled(g);
  const sym = roll.sym;
  const [side, setSide] = useState<Side | null>(null);
  const [sec, setSec] = useState(() => Math.round((FIRST + last) / 2));
  const [run, setRun] = useState<Run | null>(null);
  const [out, setOut] = useState<{ me?: Exit; bot?: Exit }>({});
  const outRef = useRef<{ me?: Exit; bot?: Exit }>({});
  const settled = useRef(false);
  const fixed = useRef(false);
  const live = g.phase === 'live' && !!run;
  const leftMe = useClock(live && !out.me ? run!.t0 + run!.me * 1000 : null);
  const leftRound = useClock(live ? run!.endsAt : null);

  // prefer a market that's really moving (US stocks sit still after hours)
  useEffect(() => {
    if (fixed.current || !sym) return;
    fixed.current = true;
    if (!g.feed.moving(sym)) { const o = roll.live.filter((s) => s !== sym && g.feed.moving(s)); if (o.length) roll.setSym(pick(o)); }
  }, [sym]); // eslint-disable-line react-hooks/exhaustive-deps
  const reroll = () => { const o = rollable(g, roll.live, 2).filter((s) => s !== sym); if (o.length) roll.setSym(pick(o)); };

  const liqOf = (s: Side, entry: number) => entry * (1 - dirOf(s) / lev);

  const go = async () => {
    if (!sym || !side) return;
    const m = g.feed.mark(sym);
    // read the entry before taking the stake, and refuse a stale price
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const t0 = Date.now();
    const end = t0 + def.secs * 1000;
    if (!(await g.begin(end))) return;
    // Clashy Bot's secret exit second, picked now in the same range as yours
    const bot = FIRST + Math.floor(Math.random() * (last - FIRST + 1));
    setRun({ entry: { t: t0, p: m.p }, t0, endsAt: end, side, me: sec, bot });
  };

  // each side's exit: liquidated on the first price past the line before its exit, else the first price at or after it
  useEffect(() => {
    if (!run || !sym || settled.current || g.phase !== 'live') return;
    const d = dirOf(run.side);
    const pnlAt = (p: number) => d * (p / run.entry.p - 1) * lev;
    const path = pathOf(g.feed, sym, run.entry.t);
    const r = { ...outRef.current };
    for (const who of ['me', 'bot'] as Who[]) {
      if (r[who]) continue;
      const at = run.t0 + (who === 'me' ? run.me : run.bot) * 1000;
      const hit = path.find((x) => x.t < at && pnlAt(x.p) <= -1);
      if (hit) { r[who] = { t: hit.t, p: hit.p, sec: Math.max(0, Math.round((hit.t - run.t0) / 1000)), pnl: -1, liq: true }; continue; }
      const b = bellPrice(g, sym, at);
      if (b === 'wait') continue;
      if (b === 'quiet') { settled.current = true; g.abandon(`No live ${tickerOf(sym)} price came in at ${who === 'me' ? 'your' : "Clashy Bot's"} exit, so your stake is back.`); return; }
      const pnl = pnlAt(b.p);
      r[who] = { t: b.t, p: b.p, sec: who === 'me' ? run.me : run.bot, pnl: pnl <= -1 ? -1 : pnl, liq: pnl <= -1 };
    }
    if (r.me !== outRef.current.me || r.bot !== outRef.current.bot) {
      if (r.me && !outRef.current.me) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      outRef.current = r; setOut(r);
    }
    if (!r.me || !r.bot) return;
    settled.current = true;
    const me = r.me, bot = r.bot;
    const lines: Line[] = [
      ['Market', mktLine(g, sym)],
      ['Side', `${sideWord(run.side)} ${lev}× (you and Clashy Bot)`],
      ['Entry', fmtPx(run.entry.p)],
      ['Liquidation', fmtPx(liqOf(run.side, run.entry.p))],
      ['Your exit', `${run.me} s`],
      ['Your exit price', me.liq ? `liquidated ${fmtPx(me.p)} at ${me.sec} s` : fmtPx(me.p)],
      ["Clashy Bot's exit", `${run.bot} s`],
      ["Clashy Bot's exit price", bot.liq ? `liquidated ${fmtPx(bot.p)} at ${bot.sec} s` : fmtPx(bot.p)],
      ['Your P&L', pctOf(me)],
      ["Clashy Bot's P&L", pctOf(bot)],
    ];
    const how = (e: Exit, who: string) => (e.liq ? `${who} got liquidated at ${e.sec} s` : `${who} got out at ${e.sec} s with ${pctOf(e)}`);
    const diff = me.pnl - bot.pnl;
    if (Math.abs(diff) < 1e-12) g.end(1, me.liq && bot.liq ? 'Both liquidated. Push.' : `Level P&L: ${pctOf(me)} each. Push.`, lines);
    else if (diff > 0) g.end(2, `${how(me, 'You')}. ${how(bot, 'Clashy Bot')}.`, lines);
    else g.end(0, `${how(bot, 'Clashy Bot')}. ${how(me, 'You')}.`, lines);
  });

  const m = sym ? g.feed.mark(sym) : undefined;

  if (g.phase === 'setup' || !run || !sym) {
    const levels: Level[] = side && m ? [{ p: liqOf(side, m.p), color: C.down, label: 'Liquidation' }] : [];
    const frac = last > FIRST ? (sec - FIRST) / (last - FIRST) : 0;
    const nudge = (k: number) => setSec((s) => Math.max(FIRST, Math.min(last, s + k)));
    return (
      <View style={{ gap: 14 }}>
        <RolledPanel g={g} sym={sym} shown={roll.shown} onReroll={reroll} sub={`${lev}× · ${def.secs} s round`} />
        {sym ? <PxChart g={g} sym={sym} h={130} color={def.tint} levels={levels} /> : null}
        <TourTarget id="g-pick">
          <Panel tint={def.tint} style={{ gap: 14 }}>
            <Row style={{ gap: 10 }}>
              {(['long', 'short'] as Side[]).map((s) => (
                <Choice key={s} title={`${sideGlyph(s)} ${sideWord(s)}`} sub={s === 'long' ? 'Up is profit' : 'Down is profit'} color={sideColor(s)} h={84}
                  selected={side ? side === s : undefined} onPress={() => setSide(s)} disabled={!sym || g.busy} />
              ))}
            </Row>
            <View style={{ gap: 6 }}>
              <Txt v="small" style={{ ...FONT.semi, textAlign: 'center' }}>Your exit second</Txt>
              <Text style={{ ...FONT.displayB, fontSize: 40, letterSpacing: -1.4, color: C.ink, textAlign: 'center', fontVariant: ['tabular-nums'] }}>Exit at {sec} s</Text>
              <Row style={{ gap: 10 }}>
                <StepBtn label="−" onPress={() => nudge(-1)} disabled={g.busy || sec <= FIRST} />
                <View style={{ flex: 1 }}>
                  <Slider frac={frac} min={0} steps={Math.max(1, last - FIRST)} disabled={g.busy} label="Exit second" text={`Exit at ${sec} s`}
                    onChange={(f) => setSec(Math.max(FIRST, Math.min(last, Math.round(FIRST + f * (last - FIRST)))))} />
                </View>
                <StepBtn label="+" onPress={() => nudge(1)} disabled={g.busy || sec >= last} />
              </Row>
              <Row style={{ justifyContent: 'space-between', paddingHorizontal: 54 }}>
                <Txt v="small" style={{ fontSize: 12 }}>{FIRST} s</Txt>
                <Txt v="small" style={{ fontSize: 12 }}>{last} s</Txt>
              </Row>
            </View>
          </Panel>
        </TourTarget>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title="Start" sub={side ? `${sideWord(side)} ${lev}× · exit at ${sec} s` : 'Pick long or short first'} color={def.tint} ink={GT.onTint}
            onPress={() => void go()} disabled={!sym || !side || g.busy} />
        </TourTarget>
        <Note center>Clashy Bot opens the same side and exits at a secret second.</Note>
      </View>
    );
  }

  // the round: live P&L until each side is out, then fixed
  const d = dirOf(run.side);
  const liq = liqOf(run.side, run.entry.p);
  const pnlNow = (who: Who) => {
    const e = out[who];
    if (e) return e.pnl;
    return m ? Math.max(-1, d * (m.p / run.entry.p - 1) * lev) : 0;
  };
  const me = pnlNow('me'), bot = pnlNow('bot');
  const dots: Dot[] = [];
  if (out.me && out.bot && out.me.t === out.bot.t) dots.push({ t: out.me.t, p: out.me.p, color: C.ink, label: `BOTH ${shortPct(out.me.pnl, out.me.liq)}` });
  else {
    if (out.me) dots.push({ t: out.me.t, p: out.me.p, color: C.brand, label: `YOU ${shortPct(out.me.pnl, out.me.liq)}` });
    if (out.bot) dots.push({ t: out.bot.t, p: out.bot.p, color: C.opp, label: `BOT ${shortPct(out.bot.pnl, out.bot.liq)}` });
  }
  const until = g.phase === 'done' && out.me && out.bot ? Math.max(out.me.t, out.bot.t) : undefined;
  const lead = Math.abs(me - bot) < 1e-12 ? null : me > bot ? 'you' : 'bot';
  const subOf = (e: Exit | undefined, plan: string) => (e ? (e.liq ? `Liquidated at ${e.sec} s` : `Out at ${e.sec} s · ${fmtPx(e.p)}`) : plan);

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <MarketHead g={g} sym={sym} from={run.entry.p} right={<Tag text={`${sideGlyph(run.side)} ${sideWord(run.side)} ${lev}×`} color={sideColor(run.side)} />} />
        {g.phase === 'live' ? (
          !out.me ? <Clock left={leftMe} total={run.me} tint={def.tint} label={`to your exit at ${run.me} s`} />
            : !out.bot ? <Clock left={leftRound} total={def.secs} tint={C.opp} label="Clashy Bot is still in" /> : null
        ) : null}
      </Panel>
      <PxChart g={g} sym={sym} from={run.entry.t} until={until} entry={run.entry.p} h={210} dots={dots}
        levels={[{ p: liq, color: C.down, label: 'Liquidation' }]} />
      <Sides lead={lead}
        you={{ title: out.me?.liq ? 'LIQ' : signedPct(me, 1), color: pnlColor(me), sub: subOf(out.me, `Exit at ${run.me} s`) }}
        bot={{ title: out.bot?.liq ? 'LIQ' : signedPct(bot, 1), color: pnlColor(bot), sub: subOf(out.bot, 'Secret exit second') }} />
      {g.phase === 'live' ? (
        <BotSays text={!out.bot ? 'Clashy Bot picked a secret exit second.' : out.bot.liq ? `I got liquidated at ${out.bot.sec} s.` : `I got out at ${out.bot.sec} s with ${pctOf(out.bot)}.`} />
      ) : null}
    </View>
  );
}

/** − / + buttons for one-second steps. */
function StepBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label === '+' ? 'One second later' : 'One second earlier'}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? GT.pillPressed : GT.pill, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1 })}>
      <Text style={{ ...FONT.bold, fontSize: 22, color: C.ink, lineHeight: 26 }}>{label}</Text>
    </Pressable>
  );
}
