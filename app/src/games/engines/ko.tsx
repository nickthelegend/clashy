// Knockout (Nov 20): a leveraged 1v1 on one rolled market. Pick a leverage, then LONG or SHORT; Clashy Bot takes the
// other side at the same leverage. Both liquidation prices sit on the chart (entry × (1 ∓ 1/lev)): the first live
// price across one knocks that side out on the spot and the other side wins 2×. No knockout by the bell: the side in
// profit on the first price at or after it wins; dead flat is a push.
// p: { levs: number[] = [5, 10, 25, 50] }
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import Svg, { Line as SvgLine, Path } from 'react-native-svg';
import { CallButtons } from '@/ui/clash';
import { ART, Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, tickerOf, useLivePool } from '../feed';
import { BotSays, Clock, Logo, MarketChart, MarketHead, Note, Panel, Tag, fmtPx, useClock, useRoll, type GameApi, type Line } from '../kit';
import { pick, signedPct } from '../odds';
import { rollable } from './_group-b';

type Side = 'long' | 'short';
type Ko = { side: Side; p: number; t: number };

export default function Knockout({ g }: { g: GameApi }) {
  const { def } = g;
  const levs = useMemo(() => {
    const l = Array.isArray(def.p?.levs) ? (def.p!.levs as unknown[]).map(Number).filter((x) => Number.isFinite(x) && x > 1) : [];
    return l.length ? l : [5, 10, 25, 50];
  }, [def.p]);
  const live = useLivePool(def.pool);
  const [sym, setSym] = useState<string | null>(null);
  const [lev, setLev] = useState(() => levs[Math.min(1, levs.length - 1)]!);
  const [side, setSide] = useState<Side | null>(null);
  const [entry, setEntry] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [ko, setKo] = useState<Ko | null>(null);
  const [bellPx, setBellPx] = useState<number | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  useEffect(() => { if (!sym && live.length) setSym(pick(rollable(g, live, 1))); }, [sym, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(live, sym ? [sym] : null, 800);

  const longKo = entry ? entry * (1 - 1 / lev) : null;
  const shortKo = entry ? entry * (1 + 1 / lev) : null;
  const bot: Side | null = side ? (side === 'long' ? 'short' : 'long') : null;

  const go = async (s: Side) => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setSide(s); setEntry(m.p); setStartedAt(Date.now()); setEndsAt(end);
  };

  const receipt = (exit: number, how: string): Line[] => {
    const mv = exit / entry! - 1;
    return [
      ['Market', `${nameOf(g.info, sym!)} (${tickerOf(sym!)})`],
      ['You', `${side === 'long' ? 'Long' : 'Short'} ${lev}×`],
      ['Clashy Bot', `${bot === 'long' ? 'Long' : 'Short'} ${lev}×`],
      ['Entry', fmtPx(entry!)],
      ['Long KO at', fmtPx(longKo!)],
      ['Short KO at', fmtPx(shortKo!)],
      [how, fmtPx(exit)],
      ['Move', signedPct(mv, 3)],
    ];
  };

  // every live price: a knockout ends it on the spot; otherwise the first price at or after the bell decides
  useEffect(() => {
    if (!sym || !entry || !side || !startedAt || !endsAt || !longKo || !shortKo || settled.current || g.phase !== 'live') return;
    const m = g.feed.mark(sym);
    const ticks = g.feed.since(sym, startedAt);
    if (m && m.t >= startedAt && (!ticks.length || ticks[ticks.length - 1]!.t < m.t)) ticks.push({ t: m.t, p: m.p });
    for (const x of ticks) {
      const out: Side | null = x.p <= longKo ? 'long' : x.p >= shortKo ? 'short' : null;
      if (out) {
        settled.current = true;
        setKo({ side: out, p: x.p, t: x.t });
        const youOut = out === side;
        g.end(youOut ? 0 : 2,
          youOut ? `Knocked out at ${fmtPx(x.p)}. Clashy Bot's ${bot} takes it.` : `Clashy Bot's ${bot} got knocked out at ${fmtPx(x.p)}. You win.`,
          receipt(x.p, 'Knockout price'));
        return;
      }
      if (x.t >= endsAt) break;
    }
    if (Date.now() < endsAt) return;
    if (m && m.t >= endsAt) {
      settled.current = true;
      setBellPx(m.p);
      const mv = m.p / entry - 1;
      const won = mv === 0 ? null : (mv > 0) === (side === 'long');
      g.end(won === null ? 1 : won ? 2 : 0,
        won === null ? 'Dead flat at the bell. Push.' : won ? `No knockout. Your ${side} is in profit at the bell.` : `No knockout. Clashy Bot's ${bot} is in profit at the bell.`,
        receipt(m.p, 'Price at the bell'));
    } else if (Date.now() > endsAt + 15_000) {
      settled.current = true;
      g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`);
    }
  });

  if (!sym) return <Panel><Note center>{live.length ? 'Finding a market with a live price…' : 'Loading live prices…'}</Note></Panel>;
  const m = g.feed.mark(sym);

  if (g.phase === 'setup') {
    const dist = 1 / lev;
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <Panel style={{ gap: 14 }}>
            <Row style={{ gap: 12 }}>
              <Logo sym={shown(0) || sym} info={g.info} size={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1} style={{ fontSize: 18 }}>{nameOf(g.info, shown(0) || sym)}</Txt>
                <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{tickerOf(sym)} · {fmtPx(m?.p)} · {def.secs} s</Txt>
              </View>
              <Pressable onPress={() => setSym(pick(live.filter((s) => s !== sym)) ?? sym)} accessibilityRole="button" accessibilityLabel="Roll a new market" hitSlop={6}
                style={({ pressed }) => ({ paddingHorizontal: 14, height: 44, borderRadius: 22, backgroundColor: pressed ? '#24242C' : '#1D1D24', justifyContent: 'center' })}>
                <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll again</Txt>
              </Pressable>
            </Row>
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="small" style={{ ...FONT.semi }}>Leverage</Txt>
                <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>KO at ±{(dist * 100).toFixed(dist >= 0.1 ? 0 : 1)}%</Txt>
              </Row>
              <Row style={{ gap: 8 }}>
                {levs.map((l) => {
                  const on = l === lev;
                  return (
                    <Pressable key={l} onPress={() => setLev(l)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${l} times leverage`}
                      style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 24, backgroundColor: on ? def.tint : '#1A1A20', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                      <Text style={{ ...FONT.bold, fontSize: 16, color: on ? '#0A0A0D' : C.ink }}>{l}×</Text>
                    </Pressable>
                  );
                })}
              </Row>
            </View>
          </Panel>
        </TourTarget>
        <MarketChart g={g} sym={sym} h={140} />
        {g.stakeRow}
        <TourTarget id="g-go">
          <CallButtons upLabel="LONG" downLabel="SHORT" onUp={() => void go('long')} onDown={() => void go('short')} disabled={g.busy} />
        </TourTarget>
        <Note center>Clashy Bot takes the other side at {lev}×. First one knocked out loses.</Note>
      </View>
    );
  }

  // live and done (side and entry land right after begin())
  if (!side || !bot || !entry) return <Panel><Note center>Opening both sides…</Note></Panel>;
  const px = ko?.p ?? bellPx ?? m?.p ?? entry;
  const mv = entry ? px / entry - 1 : 0;
  const pnl = (s: Side) => (ko ? (ko.side === s ? -1 : Math.max(-1, (s === 'long' ? mv : -mv) * lev)) : Math.max(-1, (s === 'long' ? mv : -mv) * lev));
  const youPnl = pnl(side!), botPnl = pnl(bot!);
  const away = (s: Side) => (s === 'long' ? (longKo ? px / longKo - 1 : 0) : (shortKo ? shortKo / px - 1 : 0));
  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry ?? undefined} />
        <View style={{ marginTop: 12 }}><Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></View>
      </Panel>
      <View>
        {entry && startedAt && longKo && shortKo ? (
          <KoChart g={g} sym={sym} from={startedAt} entry={entry} lines={[
            { p: side === 'long' ? longKo : shortKo, label: 'Your KO', color: C.brand },
            { p: side === 'long' ? shortKo : longKo, label: 'Bot KO', color: C.opp },
          ]} />
        ) : null}
        {ko ? <KoBurst you={ko.side === side} /> : null}
      </View>
      <Row style={{ gap: 10 }}>
        <Fighter title="YOU" tagColor={C.brand} side={side!} lev={lev} pnl={youPnl} out={ko?.side === side} away={away(side!)} lead={youPnl > botPnl} edge={C.up} />
        <Fighter title="CLASHY BOT" tagColor={C.opp} side={bot!} lev={lev} pnl={botPnl} out={ko?.side === bot} away={away(bot!)} lead={botPnl > youPnl} edge={C.opp} />
      </Row>
      {g.phase === 'live' ? (
        <Animated.View entering={FadeIn}>
          <BotSays text={youPnl === botPnl ? 'Dead even. Who blinks first?' : youPnl > botPnl ? "You're ahead. My KO line is getting closer." : "I'm ahead. Watch your KO line."} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Fighter({ title, tagColor, side, lev, pnl, out, away, lead, edge }: { title: string; tagColor: string; side: Side; lev: number; pnl: number; out: boolean; away: number; lead: boolean; edge: string }) {
  return (
    <Panel style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, opacity: out ? 0.55 : 1 }} tint={lead && !out ? edge : undefined}>
      <Tag text={title} color={tagColor} />
      <Txt v="small" color={side === 'long' ? C.up : C.down} style={{ ...FONT.bold }}>{side === 'long' ? '▲ LONG' : '▼ SHORT'} {lev}×</Txt>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: 34, letterSpacing: -1.2, color: out ? C.down : pnl >= 0 ? C.up : C.down, fontVariant: ['tabular-nums'] }}>
        {out ? 'KO' : signedPct(pnl, 1)}
      </Text>
      <Txt v="small" lines={1} style={{ fontVariant: ['tabular-nums'] }}>{out ? 'Knocked out' : `KO ${(Math.max(0, away) * 100).toFixed(2)}% away`}</Txt>
    </Panel>
  );
}

function KoBurst({ you }: { you: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View entering={ZoomIn.springify().damping(9)} style={{ alignItems: 'center' }}>
        <Image source={ART.ko} style={{ width: 150, height: 150 }} contentFit="contain" />
        <Text style={{ ...FONT.displayB, fontSize: 40, letterSpacing: -1.4, color: '#fff', marginTop: -18, textShadowColor: '#000', textShadowRadius: 12 }}>KO!</Text>
        <Txt v="label" color={you ? C.brand : C.opp} style={{ marginTop: 2 }}>{you ? 'You got knocked out' : 'Clashy Bot is out'}</Txt>
      </Animated.View>
    </View>
  );
}

type KoLine = { p: number; label: string; color: string };
/** The round's live line with the entry and both knockout prices. A KO line far outside the price's range is pinned
 *  to the edge with its distance, and comes into view as the price gets close. */
function KoChart({ g, sym, from, entry, lines, h = 220 }: { g: GameApi; sym: string; from: number; entry: number; lines: KoLine[]; h?: number }) {
  const w = g.width;
  const ticks = g.feed.since(sym, from - 1500);
  const data = ticks.map((x) => x.p);
  if (data.length === 1) data.push(data[0]!);
  if (data.length < 2) return <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">Loading price…</Txt></View>;
  const last = data[data.length - 1]!;
  let lo = Math.min(...data, entry), hi = Math.max(...data, entry);
  const need = entry * 0.0016;
  if (hi - lo < need) { const mid = (hi + lo) / 2; lo = mid - need / 2; hi = mid + need / 2; }
  for (const l of lines) {
    const span = hi - lo;
    if (l.p < lo && lo - l.p < span * 1.5) lo = l.p;
    if (l.p > hi && l.p - hi < span * 1.5) hi = l.p;
  }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const RG = 74;
  const X = (i: number) => 4 + (i / (data.length - 1)) * (w - RG);
  const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (h - 16);
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const ex = X(data.length - 1), ey = Y(last);
  const lc = last >= entry ? C.up : C.down;
  const inView = lines.filter((l) => l.p >= lo && l.p <= hi);
  const above = lines.filter((l) => l.p > hi), below = lines.filter((l) => l.p < lo);
  const pin = (l: KoLine, top: boolean) => (
    <View key={l.label} style={{ position: 'absolute', left: 6, top: top ? 4 : undefined, bottom: top ? undefined : 4, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0E0E12', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: `${l.color}66` }}>
      <Text style={{ ...FONT.bold, fontSize: 10.5, color: l.color }}>{top ? '▲' : '▼'} {l.label} {fmtPx(l.p)}</Text>
      <Text style={{ ...FONT.semi, fontSize: 10.5, color: C.muted }}>{(Math.abs(l.p / last - 1) * 100).toFixed(2)}% away</Text>
    </View>
  );
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {[0.25, 0.5, 0.75].map((f) => <SvgLine key={f} x1={0} x2={w - RG + 4} y1={h * f} y2={h * f} stroke="#18181C" />)}
        <SvgLine x1={0} x2={w} y1={Y(entry)} y2={Y(entry)} stroke={C.brandSoft} strokeWidth={1.2} strokeDasharray="5 5" />
        {inView.map((l) => <SvgLine key={l.label} x1={0} x2={w} y1={Y(l.p)} y2={Y(l.p)} stroke={l.color} strokeWidth={2} strokeDasharray="7 4" />)}
        <Path d={d} stroke={lc} strokeOpacity={0.25} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={d} stroke={lc} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', left: ex - 5, top: ey - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: lc, borderWidth: 2, borderColor: '#000' }} />
      <View pointerEvents="none" style={{ position: 'absolute', right: 4, top: Math.max(2, Math.min(h - 24, ey - 11)), backgroundColor: lc, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 }}>
        <Text style={{ ...FONT.bold, fontSize: 11, color: '#000' }}>{last >= 1000 ? last.toLocaleString('en-US', { maximumFractionDigits: 0 }) : last.toPrecision(5)}</Text>
      </View>
      <Text pointerEvents="none" style={{ position: 'absolute', left: 8, top: Math.max(2, Y(entry) - 18), ...FONT.semi, fontSize: 10.5, color: C.brandSoft }}>Entry</Text>
      {inView.map((l) => (
        <Text key={l.label} pointerEvents="none" style={{ position: 'absolute', left: 8, top: Math.max(2, Math.min(h - 16, Y(l.p) + (l.p > entry ? -18 : 4))), ...FONT.bold, fontSize: 10.5, color: l.color }}>{l.label} {fmtPx(l.p)}</Text>
      ))}
      {above.map((l) => pin(l, true))}
      {below.map((l) => pin(l, false))}
    </View>
  );
}
