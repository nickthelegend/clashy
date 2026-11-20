// Cash out (Nov 20): a leveraged position shown as one live multiplier, 1 + leverage × the move (a short flips the
// sign). Cash out whenever you like; at 0× it's liquidated. Solo, it pays the multiplier you cashed out at, and the bell
// cashes you out. vsBot: Clashy Bot rides the same position and cashes out at a moment it picks at random when the
// round starts (hidden until the end); the higher cash-out wins 2×, and a liquidation loses. rungs: an early cash-out
// is only allowed on a rung and pays the highest rung the multiplier is on; the bell pays the live multiplier.
// p: { lev: number, side: 'long' | 'short' | 'choose', vsBot?: boolean, rungs?: number[] }
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { tickerOf, type Tick } from '../feed';
import { BigNumber, BotSays, Choice, Clock, Go, MarketHead, Note, Panel, PxChart, RolledPanel, Sides, StatTile, absPct, bellPrice, fmtPx, mktLine, pBool, pNum, pNums, pStr, roundPath, secsIn, usd, useClock, useRolled, type Dot, type GameApi, type Line } from '../kit';
import { fmtX } from '../odds';

type Dir = 'long' | 'short';
/** A cash-out: when, at what price and multiplier; `tt` is the time of the tick it priced from (for the chart). */
type Out = { t: number; tt?: number; px: number; mult: number; how: 'cash' | 'bell' | 'bust' };
const r2 = (x: number) => Math.round(x * 100) / 100;

export default function Cashout({ g }: { g: GameApi }) {
  const { def } = g;
  const lev = Math.max(1, pNum(g, 'lev', 10));
  const sideP = pStr(g, 'side', ['long', 'short', 'choose'] as const, 'choose');
  const vsBot = pBool(g, 'vsBot');
  const rungs = useMemo(() => [...pNums(g, 'rungs', [])].filter((x) => x > 0).sort((a, b) => a - b), [def.p]); // eslint-disable-line react-hooks/exhaustive-deps
  const { sym, shown, reroll } = useRolled(g);
  const [dir, setDir] = useState<Dir | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [you, setYou] = useState<Out | null>(null);
  const [bot, setBot] = useState<Out | null>(null);
  const [final, setFinal] = useState<{ at: number } | null>(null);
  const youRef = useRef<Out | null>(null);
  /** Clashy Bot's cash-out moment: picked at random when the round starts, kept out of the render until the end. */
  const botAt = useRef<number | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  const sgn = dir === 'short' ? -1 : 1;
  const multAt = (p: number) => (entry ? 1 + lev * sgn * (p / entry.p - 1) : 1);
  const rungOf = (x: number) => { let r: number | null = null; for (const k of rungs) if (x >= k) r = k; return r; };
  const bustPx = entry ? entry.p * (1 - sgn / lev) : 0;

  const go = async (d: Dir) => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const t0 = Date.now();
    const end = t0 + def.secs * 1000;
    if (!(await g.begin(end))) return;
    botAt.current = vsBot ? t0 + (0.1 + Math.random() * 0.9) * def.secs * 1000 : null;
    setDir(d); setEntry({ t: t0, p: m.p }); setEndsAt(end);
  };

  const cashOut = () => {
    if (!sym || !entry || !dir || !endsAt || youRef.current || settled.current || g.phase !== 'live' || Date.now() >= endsAt) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price to cash out on.`); return; }
    if (roundPath(g, sym, entry).some((x) => multAt(x.p) <= 0)) return; // already liquidated: the bell check settles it
    const x = multAt(m.p);
    const pay = rungs.length ? rungOf(x) : x;
    if (pay === null || pay <= 0) return;
    g.fail(undefined);
    const out: Out = { t: Date.now(), tt: Math.max(m.t, entry.t), px: m.p, mult: pay, how: 'cash' };
    youRef.current = out;
    setYou(out);
  };

  useEffect(() => {
    if (!sym || !entry || !dir || !endsAt || settled.current || g.phase !== 'live') return;
    const b = bellPrice(g, sym, endsAt);
    const bell = typeof b === 'object' ? b : undefined;
    const path = roundPath(g, sym, entry, bell);
    const quiet = () => { settled.current = true; g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`); };

    // you: liquidated before you cashed out, or cashed out by the bell
    let me = youRef.current;
    if (!me) {
      const bust = path.find((x) => multAt(x.p) <= 0);
      if (bust) me = { t: bust.t, px: bust.p, mult: 0, how: 'bust' };
      else if (bell) me = { t: bell.t, px: bell.p, mult: multAt(bell.p), how: 'bell' };
    }
    if (!me) { if (b === 'quiet') quiet(); return; }
    const mine = me;

    // Clashy Bot: the price at its moment; on a ladder below the first rung it rides on to the next rung, or the bell
    const ba = botAt.current ?? endsAt;
    const botOut = (pts: Tick[], end?: Tick): Out | null => {
      const busted = pts.find((x) => x.t <= ba && multAt(x.p) <= 0);
      if (busted) return { t: busted.t, px: busted.p, mult: 0, how: 'bust' };
      const at = [...pts].reverse().find((x) => x.t <= ba) ?? pts[0]!;
      const r = rungs.length ? rungOf(multAt(at.p)) : multAt(at.p);
      if (r !== null) return { t: ba, tt: at.t, px: at.p, mult: r, how: 'cash' };
      for (const y of pts) {
        if (y.t <= ba) continue;
        const ym = multAt(y.p);
        if (ym <= 0) return { t: y.t, px: y.p, mult: 0, how: 'bust' };
        const rr = rungOf(ym);
        if (rr !== null) return { t: y.t, px: y.p, mult: rr, how: 'cash' };
      }
      return end ? { t: end.t, px: end.p, mult: multAt(end.p), how: 'bell' } : null;
    };
    // a liquidation settles at once (vsBot: the bot's own result if its moment came first)
    if (mine.how === 'bust') { settle(mine, vsBot && ba < mine.t ? botOut(path.filter((x) => x.t <= mine.t)) : null); return; }
    if (!vsBot) { settle(mine, null); return; }
    const lastT = Math.max(g.feed.mark(sym)?.t ?? 0, path[path.length - 1]!.t);
    if (lastT <= ba && !bell) { if (b === 'quiet') quiet(); return; } // its moment hasn't fully come in yet
    const theirs = botOut(path, bell);
    if (!theirs) { if (b === 'quiet') quiet(); return; }
    settle(mine, theirs);
  });

  function settle(me: Out, theirs: Out | null) {
    if (!sym || !entry || !dir) return;
    settled.current = true;
    youRef.current = me;
    setYou(me); setBot(theirs); setFinal({ at: Math.max(me.tt ?? me.t, theirs?.tt ?? theirs?.t ?? 0) });
    const tk = tickerOf(sym);
    const outLine = (o: Out) => (o.how === 'bust' ? `Liquidated at ${fmtPx(o.px)}, ${secsIn(o.t, entry.t)}` : `${fmtX(o.mult)} at ${fmtPx(o.px)}, ${secsIn(o.t, entry.t)}`);
    const lines: Line[] = [
      ['Market', mktLine(g, sym)],
      ['Position', `${dir === 'long' ? 'Long' : 'Short'} ${lev}×`],
      ['Entry', fmtPx(entry.p)],
      ['Liquidation', fmtPx(bustPx)],
      [me.how === 'bell' ? 'Cashed out at the bell' : me.how === 'bust' ? 'You' : 'You cashed out', outLine(me)],
    ];
    if (vsBot) lines.push(['Clashy Bot', theirs ? `${theirs.how === 'bell' ? 'At the bell: ' : ''}${outLine(theirs)}` : `Still riding (its moment: ${secsIn(botAt.current ?? endsAt!, entry.t)})`]);
    if (!vsBot) {
      const verdict = me.how === 'bust' ? `${tk} hit your liquidation price. 0×.` : me.how === 'bell' ? `The bell cashed you out at ${fmtX(me.mult)}.` : `Cashed out at ${fmtX(me.mult)}.`;
      g.end(me.mult, verdict, lines);
      return;
    }
    if (me.how === 'bust') { g.end(0, 'You were liquidated. Clashy Bot takes it.', lines); return; }
    if (!theirs || theirs.how === 'bust') { g.end(2, `Clashy Bot rode it into liquidation. Your ${fmtX(me.mult)} wins.`, lines); return; }
    const a = r2(me.mult), c = r2(theirs.mult);
    if (a === c) g.end(1, `Same cash-out, ${fmtX(a)}. Push.`, lines);
    else if (a > c) g.end(2, `Your ${fmtX(a)} beats Clashy Bot's ${fmtX(c)}.`, lines);
    else g.end(0, `Clashy Bot cashed out higher: ${fmtX(c)} to your ${fmtX(a)}.`, lines);
  }

  const m = sym ? g.feed.mark(sym) : undefined;
  const note = vsBot ? 'Clashy Bot cashes out at a secret moment. Higher cash-out wins 2×.'
    : rungs.length ? 'Cash out early only on a rung. The bell pays the live multiplier.'
      : 'Cash out any time. At 0× you are liquidated; the bell cashes you out.';

  if (g.phase === 'setup' || !dir || !entry || !sym) {
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <RolledPanel g={g} sym={sym} shown={shown} onReroll={reroll} sub={`${def.secs} s round`} />
        </TourTarget>
        {sym ? <PxChart g={g} sym={sym} h={150} color={def.tint} /> : null}
        <Row style={{ gap: 8 }}>
          <StatTile k="Leverage" v={`${lev}×`} />
          <StatTile k="Liquidated after" v={`${absPct(1 / lev)} against`} />
        </Row>
        {rungs.length ? (
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            <Txt v="small" style={{ ...FONT.semi, marginRight: 2 }}>Rungs</Txt>
            {rungs.map((r) => (
              <View key={r} style={{ backgroundColor: `${def.tint}26`, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text style={{ ...FONT.bold, fontSize: 13, color: def.tint }}>{fmtX(r)}</Text>
              </View>
            ))}
          </Row>
        ) : null}
        {g.stakeRow}
        <TourTarget id="g-go">
          {sideP === 'choose' ? (
            <Row style={{ gap: 12 }}>
              <Choice title="▲ LONG" sub="Up grows it" color={C.up} onPress={() => void go('long')} disabled={!sym || g.busy} />
              <Choice title="▼ SHORT" sub="Down grows it" color={C.down} onPress={() => void go('short')} disabled={!sym || g.busy} />
            </Row>
          ) : (
            <Go title={`Open ${sideP} ${lev}×`} sub={sym ? `${tickerOf(sym)} · ${def.secs} s` : undefined} color={def.tint} ink="#0A0A0D" onPress={() => void go(sideP)} disabled={!sym || g.busy} />
          )}
        </TourTarget>
        <Note center>{note}</Note>
      </View>
    );
  }

  const x = m ? multAt(m.p) : 1;
  const liveX = Math.max(0, x);
  const payNow = rungs.length ? rungOf(x) : x > 0 ? x : null;
  const big = you ? you.mult : liveX;
  const waiting = vsBot && you?.how === 'cash' && g.phase === 'live';
  const shownLeft = final ? Math.max(0, (endsAt! - final.at) / 1000) : left;
  const dots: Dot[] = [];
  if (you) dots.push({ t: you.tt ?? you.t, p: you.px, color: you.how === 'bust' ? C.down : C.brand, label: you.how === 'bust' ? 'Liquidated' : `You ${fmtX(you.mult)}` });
  if (bot && final) dots.push({ t: bot.tt ?? bot.t, p: bot.px, color: C.opp, label: bot.how === 'bust' ? 'Bot out' : `Bot ${fmtX(bot.mult)}` });

  // the done duel: who cashed out higher (a liquidation loses)
  const duel = !you || g.phase !== 'done' ? null : you.how === 'bust' ? 'bot' : !bot || bot.how === 'bust' ? 'you'
    : r2(you.mult) > r2(bot.mult) ? 'you' : r2(you.mult) < r2(bot.mult) ? 'bot' : null;
  const multPanel = (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <BigNumber value={fmtX(big)} color={big >= 1 ? C.up : C.down}
        sub={you ? (you.how === 'bust' ? 'Liquidated' : waiting ? `You're out · now ${fmtX(liveX)}` : you.how === 'bell' ? 'Cashed out at the bell' : 'Cashed out') : `${dir === 'long' ? 'Long' : 'Short'} ${lev}× · 0× at ${fmtPx(bustPx)}`} />
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry.p} />
        <View style={{ marginTop: 12 }}><Clock left={shownLeft} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></View>
      </Panel>
      <Panel tint={def.tint} style={{ paddingVertical: 12 }}>
        {rungs.length ? (
          <Row style={{ gap: 12, alignItems: 'center' }}>
            {multPanel}
            <View style={{ width: 88, gap: 6 }} accessibilityLabel={`Rungs: ${rungs.map(fmtX).join(', ')}`}>
              {[...rungs].reverse().map((r) => {
                const on = (you ? you.mult : x) >= r;
                const here = you ? you.how === 'cash' && you.mult === r : payNow === r;
                return (
                  <View key={r} style={{ height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? def.tint : '#1A1A21', borderWidth: 2, borderColor: here ? '#fff' : 'transparent' }}>
                    <Text style={{ ...FONT.bold, fontSize: 14, color: on ? '#0A0A0D' : C.muted, fontVariant: ['tabular-nums'] }}>{fmtX(r)}</Text>
                  </View>
                );
              })}
            </View>
          </Row>
        ) : multPanel}
      </Panel>
      {g.phase === 'live' ? (
        <Go color={def.tint} ink="#0A0A0D" onPress={cashOut} disabled={!!you || payNow === null}
          title={you ? `Out at ${fmtX(you.mult)}` : payNow !== null ? `CASH OUT ${fmtX(payNow)}` : `Next rung ${fmtX(rungs.find((r) => r > x) ?? rungs[0] ?? 1)}`}
          sub={you ? (vsBot ? 'Waiting for Clashy Bot…' : 'Settling…') : payNow !== null ? `Pays ${usd(g.stake * payNow)}` : 'Cash-out opens on a rung'} />
      ) : null}
      <PxChart g={g} sym={sym} from={entry.t} until={final?.at} entry={entry.p} h={190} dots={dots}
        levels={[{ p: bustPx, color: C.down, label: 'Liquidation' }]} />
      {vsBot && g.phase === 'done' && you ? (
        <Sides lead={duel}
          you={{ title: you.how === 'bust' ? 'Liquidated' : fmtX(you.mult), color: you.how === 'bust' ? C.down : C.ink, sub: you.how === 'bust' ? secsIn(you.t, entry.t) : `${you.how === 'bell' ? 'at the bell' : 'cashed out'}, ${secsIn(you.t, entry.t)}` }}
          bot={{ title: !bot ? 'Riding' : bot.how === 'bust' ? 'Liquidated' : fmtX(bot.mult), color: bot?.how === 'bust' ? C.down : C.ink, sub: bot ? secsIn(bot.t, entry.t) : `planned ${secsIn(botAt.current ?? endsAt!, entry.t)}` }} />
      ) : null}
      {vsBot && g.phase === 'live' ? (
        <BotSays text={waiting ? `You're out at ${fmtX(you!.mult)}. My moment hasn't come yet…` : "I'm riding this too. I cash out at a moment I picked at random."} />
      ) : null}
    </View>
  );
}
