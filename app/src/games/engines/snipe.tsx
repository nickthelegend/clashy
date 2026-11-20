// Snipe (Nov 20): a window of `secs`. Tap BUY once inside it to catch the dip (SELL: the top). Clashy Bot taps at a
// moment it picks at random when the window opens, hidden until the end. When the window closes, each tap is scored by
// its distance from the window's low (high); the closer one wins 2×. No tap loses.
// p: { side: 'buy' | 'sell' }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { tickerOf, type Tick } from '../feed';
import { BotSays, Clock, Go, MarketHead, Note, Panel, fmtPx, lengthLabel, useClock, type GameApi, type Line } from '../kit';
import { PxChart, RolledPanel, Sides, Stat, absPct, bellPrice, mktLine, pStr, roundPath, secsIn, useRolled, type Dot } from './_group-a';

/** A tap: when it happened (t), the time of the price it got (tt), and that price. */
type Tap = { t: number; tt: number; p: number };
type Final = { at: Tick; target: Tick; bot: Tap; mine: number | null; theirs: number; winner: 'you' | 'bot' | null };

export default function Snipe({ g }: { g: GameApi }) {
  const { def } = g;
  const buy = pStr(g, 'side', ['buy', 'sell'] as const, 'buy') === 'buy';
  const word = buy ? 'BUY' : 'SELL';
  const edge = buy ? 'low' : 'high';
  const { sym, shown, reroll } = useRolled(g);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [tap, setTap] = useState<Tap | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const tapRef = useRef<Tap | null>(null);
  /** Clashy Bot's tap: a random moment in the window, picked when it opens and kept out of the render until the end. */
  const botAt = useRef<number | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  const go = async () => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const t0 = Date.now();
    const end = t0 + def.secs * 1000;
    if (!(await g.begin(end))) return;
    botAt.current = t0 + (0.03 + Math.random() * 0.94) * def.secs * 1000;
    setEntry({ t: t0, p: m.p }); setEndsAt(end);
  };

  const tapNow = () => {
    if (!sym || !entry || !endsAt || tapRef.current || settled.current || g.phase !== 'live' || Date.now() >= endsAt) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    g.fail(undefined);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const t: Tap = { t: Date.now(), tt: Math.max(m.t, entry.t), p: m.p };
    tapRef.current = t;
    setTap(t);
  };

  // the window closes at the bell: score both taps against its low (high)
  useEffect(() => {
    if (!sym || !entry || !endsAt || settled.current || g.phase !== 'live') return;
    const b = bellPrice(g, sym, endsAt);
    if (b === 'wait') return;
    settled.current = true;
    if (b === 'quiet') { g.abandon(`No live ${tickerOf(sym)} price came in when the window closed, so your stake is back.`); return; }
    const path = roundPath(g, sym, entry, b);
    const mineTap = tapRef.current;
    const pts = mineTap ? [...path, { t: mineTap.tt, p: mineTap.p }] : path;
    const target = pts.reduce((a, x) => (buy ? (x.p < a.p ? x : a) : x.p > a.p ? x : a), pts[0]!);
    const ba = botAt.current ?? entry.t;
    const bt = [...path].reverse().find((x) => x.t <= ba) ?? path[0]!;
    const bot: Tap = { t: ba, tt: bt.t, p: bt.p };
    const dist = (p: number) => Math.max(0, buy ? p / target.p - 1 : 1 - p / target.p);
    const mine = mineTap ? dist(mineTap.p) : null;
    const theirs = dist(bot.p);
    const winner = mine === null ? 'bot' : Math.abs(mine - theirs) < 1e-12 ? null : mine < theirs ? 'you' : 'bot';
    setFinal({ at: b, target, bot, mine, theirs, winner });
    const tapLine = (x: Tap, d: number) => `${fmtPx(x.p)}, ${secsIn(x.t, entry.t)} (${absPct(d)} off)`;
    const lines: Line[] = [
      ['Market', mktLine(g, sym)],
      ['Side', buy ? 'Buy the dip' : 'Sell the top'],
      ['Window', lengthLabel(def.secs)],
      [buy ? 'Window low' : 'Window high', `${fmtPx(target.p)}, ${secsIn(target.t, entry.t)}`],
      ['Your tap', mineTap && mine !== null ? tapLine(mineTap, mine) : 'No tap'],
      ["Clashy Bot's tap", tapLine(bot, theirs)],
    ];
    const verdict = mine === null ? "You didn't tap in time. Clashy Bot takes it."
      : winner === null ? `You and Clashy Bot got the same price. Push.`
        : winner === 'you' ? mine === 0 ? `You ${buy ? 'bought the exact low' : 'sold the exact high'}. Clashy Bot was ${absPct(theirs)} off.` : `You were ${absPct(mine)} off the ${edge}. Clashy Bot was ${absPct(theirs)} off.`
          : `Clashy Bot was closer: ${absPct(theirs)} off the ${edge} to your ${absPct(mine)}.`;
    g.end(winner === null ? 1 : winner === 'you' ? 2 : 0, verdict, lines);
  });

  const m = sym ? g.feed.mark(sym) : undefined;

  if (g.phase === 'setup' || !entry || !sym) {
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <RolledPanel g={g} sym={sym} shown={shown} onReroll={reroll} sub={`${def.secs} s window`} />
        </TourTarget>
        {sym ? <PxChart g={g} sym={sym} h={150} color={def.tint} /> : null}
        <Row style={{ gap: 8 }}>
          <Stat k="Window" v={lengthLabel(def.secs)} />
          <Stat k="You tap" v="Once" />
          <Stat k="Closer wins" v="2×" />
        </Row>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title="Open the window" sub={`${def.secs} s to ${buy ? 'buy the dip' : 'sell the top'}`} color={def.tint} ink="#0A0A0D" onPress={() => void go()} disabled={!sym || g.busy} />
        </TourTarget>
        <Note center>Tap {word} once. Closer to the window&apos;s {edge} than Clashy Bot wins 2×.</Note>
      </View>
    );
  }

  // the low (high) so far, up to the close
  const path = roundPath(g, sym, entry, final?.at);
  const sofar = final ? final.target.p : path.reduce((a, x) => (buy ? Math.min(a, x.p) : Math.max(a, x.p)), entry.p);
  const myOff = tap ? Math.max(0, buy ? tap.p / sofar - 1 : 1 - tap.p / sofar) : null;
  const open = g.phase === 'live' && !final && (left ?? 0) > 0;
  const warn = open && !tap && (left ?? 99) <= 5;
  const dots: Dot[] = [];
  if (tap) dots.push({ t: tap.tt, p: tap.p, color: C.brand, label: 'You' });
  if (final) dots.push({ t: final.bot.tt, p: final.bot.p, color: C.opp, label: 'Bot' });
  const lead = final ? final.winner : null;

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <MarketHead g={g} sym={sym} from={entry.p} />
        <View style={{ marginTop: 12 }}><Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'closed' : open ? 'window open' : 'closing…'} /></View>
      </Panel>
      <PxChart g={g} sym={sym} from={entry.t} until={final?.at.t} entry={entry.p} h={200} dots={dots}
        levels={[{ p: sofar, color: def.tint, label: final ? `Window ${edge}` : `${buy ? 'Low' : 'High'} so far`, solid: true, fit: true }]} />
      {warn ? (
        <Animated.View entering={FadeIn.duration(150)}>
          <Row style={{ gap: 10, backgroundColor: C.downBg, borderRadius: 18, padding: 12 }}>
            <Text style={{ ...FONT.bold, fontSize: 22, color: C.down, fontVariant: ['tabular-nums'] }}>{Math.ceil(left ?? 0)}s</Text>
            <Txt v="label" color={C.down} style={{ flex: 1 }}>Tap {word} now, or you lose.</Txt>
          </Row>
        </Animated.View>
      ) : null}
      {!tap && open ? (
        <TapButton word={word} sub={`at ${fmtPx(m?.p)}`} color={def.tint} onPress={tapNow} />
      ) : tap ? (
        <Panel tint={C.brand} style={{ alignItems: 'center', gap: 4 }}>
          <Txt v="small" style={{ ...FONT.semi }}>{buy ? 'You bought at' : 'You sold at'}</Txt>
          <Text style={{ ...FONT.displayB, fontSize: 34, letterSpacing: -1, color: C.ink, fontVariant: ['tabular-nums'] }}>{fmtPx(tap.p)}</Text>
          <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{secsIn(tap.t, entry.t)} · {myOff === 0 ? `the ${edge} so far` : `${absPct(myOff ?? 0)} off the ${edge}${final ? '' : ' so far'}`}</Txt>
        </Panel>
      ) : (
        <Panel style={{ alignItems: 'center' }}><Txt v="label" color={C.down}>No tap. The window closed.</Txt></Panel>
      )}
      {final ? (
        <Sides lead={lead}
          you={{ title: final.mine === null ? 'No tap' : `${absPct(final.mine)} off`, color: final.mine === null ? C.down : C.ink, sub: tap ? `${fmtPx(tap.p)}, ${secsIn(tap.t, entry.t)}` : undefined }}
          bot={{ title: `${absPct(final.theirs)} off`, color: C.ink, sub: `${fmtPx(final.bot.p)}, ${secsIn(final.bot.t, entry.t)}` }} />
      ) : g.phase !== 'live' ? null : (
        <BotSays text={tap ? "Locked in. My tap shows up when the window closes." : `I tap ${word} at a random moment. You'll see when at the end.`} />
      )}
    </View>
  );
}

/** The one big tap. */
function TapButton({ word, sub, color, onPress }: { word: string; sub: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${word} now, ${sub}`}
      style={({ pressed }) => ({ height: 120, borderRadius: 30, backgroundColor: color, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }], shadowColor: color, shadowOpacity: 0.55, shadowRadius: 20, shadowOffset: { width: 0, height: 6 } })}>
      <Text style={{ ...FONT.displayB, fontSize: 44, letterSpacing: -1.4, color: '#0A0A0D', lineHeight: 50 }}>{word}</Text>
      <Text style={{ ...FONT.semi, fontSize: 13, color: 'rgba(10,10,13,0.72)', fontVariant: ['tabular-nums'] }}>{sub}</Text>
    </Pressable>
  );
}
