// Bracket (Nov 20): eight rolled markets seeded into quarter-finals, semi-finals and a final, every match decided by
// the % move since the entry at the bell (higher wins; dead level goes to the top market of the match). Before the
// start you call every match: each quarter-final, then each semi-final from your own winners, then the final.
// Clashy Bot fills a random bracket. A call is right if the market you picked really won that match of the real
// bracket; more right calls than Clashy Bot wins 2×, level is a push.
// p: { n?: 8 | 4 = 8 }
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { poolOf, tickerOf, useLivePool, type PoolKey, type Tick } from '../feed';
import { BotSays, Clock, Go, Logo, Note, Panel, Pill, Tag, Waiting, captureAt, fmtPx, readEntries, rollMarkets, useClock, useRoll, type GameApi, type Line } from '../kit';
import { signedPct } from '../odds';

type Slot = string | null;

/** The rounds' match numbers (0… n−2): the first round's matches, then each later round fed by pairs of the one before. */
function roundsOf(n: number) {
  const rounds: number[][] = [];
  let start = 0;
  for (let c = n / 2; c >= 1; c /= 2) { rounds.push(Array.from({ length: c }, (_, i) => start + i)); start += c; }
  return rounds;
}
const roundName = (fromEnd: number) => (fromEnd === 0 ? 'Final' : fromEnd === 1 ? 'Semi-finals' : fromEnd === 2 ? 'Quarter-finals' : 'Round of 16');
const shortName = (fromEnd: number, i: number) => (fromEnd === 0 ? 'Final' : `${fromEnd === 1 ? 'SF' : fromEnd === 2 ? 'QF' : 'R16'} ${i + 1}`);

export default function Bracket({ g }: { g: GameApi }) {
  const { def } = g;
  const n = Number(def.p?.n) === 4 ? 4 : 8;
  const rounds = useMemo(() => roundsOf(n), [n]);
  const matches = n - 1;
  const live = useLivePool(def.pool as PoolKey[]);
  const [syms, setSyms] = useState<string[] | null>(null);
  const [picks, setPicks] = useState<Slot[]>(() => Array(matches).fill(null));
  const [bot, setBot] = useState<string[] | null>(null);
  const [entries, setEntries] = useState<Record<string, Tick> | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<Record<string, number> | null>(null);
  const bell = useRef(new Map<string, Tick>());
  const settled = useRef(false);
  const left = useClock(endsAt);

  /** Who plays match `s`: two seeded markets in the first round, else the winners of its two feeder matches. */
  const sidesOf = (s: number, syms: string[], winners: Slot[]): [Slot, Slot] => {
    if (s < n / 2) return [syms[2 * s]!, syms[2 * s + 1]!];
    const r = rounds.findIndex((x) => x.includes(s));
    const j = rounds[r]!.indexOf(s);
    const prev = rounds[r - 1]!;
    return [winners[prev[2 * j]!] ?? null, winners[prev[2 * j + 1]!] ?? null];
  };
  /** Every match's winner from the moves (higher wins; level goes to the top market). */
  const resolve = (syms: string[], mv: Record<string, number>) => {
    const w: Slot[] = [];
    for (let s = 0; s < matches; s++) { const [a, b] = sidesOf(s, syms, w); w[s] = a && b ? (mv[b]! > mv[a]! ? b : a) : null; }
    return w;
  };

  useEffect(() => { if (!syms) { const r = rollMarkets(g.feed, live, n); if (r) setSyms(r); } }, [syms, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(useMemo(() => poolOf(def.pool as PoolKey[]), [def.pool]), syms, 900);
  const reroll = () => { setPicks(Array(matches).fill(null)); setSyms(rollMarkets(g.feed, live, n)); };

  const choose = (s: number, sym: string) => {
    if (!syms || g.phase !== 'setup') return;
    Haptics.selectionAsync();
    const next = [...picks];
    next[s] = sym;
    // a changed call clears later calls that no longer have that market in the match
    for (let k = n / 2; k < matches; k++) { const [a, b] = sidesOf(k, syms, next); if (next[k] && next[k] !== a && next[k] !== b) next[k] = null; }
    setPicks(next);
  };

  const go = async () => {
    if (!syms || picks.some((p) => !p)) return;
    const e = readEntries(g.feed, syms);
    if (!e.ok) { g.fail(`Waiting for a live ${tickerOf(e.stale)} price.`); return; }
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    // Clashy Bot's bracket: a coin flip for every match, from its own winners
    const b: Slot[] = [];
    for (let s = 0; s < matches; s++) { const [x, y] = sidesOf(s, syms, b); b[s] = Math.random() < 0.5 ? x : y; }
    setBot(b as string[]); setEntries(e.at); setEndsAt(end);
  };

  // the bell: every market's first price at or after it
  useEffect(() => {
    if (!syms || !entries || !bot || !endsAt || settled.current || g.phase !== 'live') return;
    const now = Date.now();
    if (now < endsAt) return;
    if (captureAt(bell.current, g.feed, syms, endsAt)) {
      settled.current = true;
      const mv = Object.fromEntries(syms.map((s) => [s, bell.current.get(s)!.p / entries[s]!.p - 1]));
      setFinal(mv);
      const real = resolve(syms, mv);
      const mine = picks.filter((p, i) => p === real[i]).length;
      const theirs = bot.filter((p, i) => p === real[i]).length;
      const champ = real[matches - 1]!;
      const [fa, fb] = sidesOf(matches - 1, syms, real);
      const lines: Line[] = [
        ['Champion', `${tickerOf(champ)} ${signedPct(mv[champ]!, 3)}`],
        ['Final', `${tickerOf(champ)} beat ${tickerOf(champ === fa ? fb! : fa!)}`],
        ['Your right calls', `${mine} of ${matches}`],
        ["Clashy Bot's right calls", `${theirs} of ${matches}`],
        ...[...syms].sort((a, b) => mv[b]! - mv[a]!).map((s): Line => [tickerOf(s), `${fmtPx(entries[s]!.p)} → ${fmtPx(bell.current.get(s)!.p)} · ${signedPct(mv[s]!, 3)}`]),
      ];
      if (mine === theirs) g.end(1, `${mine} right calls each. Push.`, lines);
      else if (mine > theirs) g.end(2, `${mine} right calls to Clashy Bot's ${theirs}. ${tickerOf(champ)} took the bracket.`, lines);
      else g.end(0, `Clashy Bot called ${theirs} to your ${mine}. ${tickerOf(champ)} took the bracket.`, lines);
    } else if (now > endsAt + 15_000) {
      settled.current = true;
      const miss = syms.find((s) => !bell.current.has(s))!;
      g.abandon(`No live ${tickerOf(miss)} price came in at the bell, so your stake is back.`);
    }
  });

  if (!syms) return <Waiting text={`Finding ${n} markets with a live price…`} sub={`${live.length} of ${n} live so far`} progress={live.length / n} tint={def.tint} />;

  const wide = g.width > 560;
  const called = picks.filter(Boolean).length;

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between', gap: 10 }}>
          <Txt v="small" style={{ flex: 1 }}>Call every match. Winner: the bigger move at the bell.</Txt>
          <Pill label="Roll again" onPress={reroll} />
        </Row>
        <TourTarget id="g-pick">
          <View style={{ gap: 12 }}>
            {rounds.map((r, ri) => (
              <Panel key={ri} style={{ gap: 10 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="label" color={def.tint}>{roundName(rounds.length - 1 - ri)}</Txt>
                  <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{r.filter((s) => picks[s]).length} of {r.length} called</Txt>
                </Row>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {r.map((s, i) => {
                    const [a, b] = sidesOf(s, syms, picks);
                    const label = shortName(rounds.length - 1 - ri, i);
                    const j = ri > 0 ? rounds[ri]!.indexOf(s) : 0;
                    const wait = (k: number) => `Winner of ${shortName(rounds.length - ri, k)}`;
                    return (
                      <View key={s} style={{ flexBasis: wide ? '48%' : '100%', flexGrow: 1, gap: 6 }}>
                        <Txt v="small" style={{ ...FONT.semi, fontSize: 12 }}>{label}</Txt>
                        <Row style={{ gap: 6 }}>
                          <SideBtn g={g} sym={a && ri === 0 ? shown(2 * s) || a : a} waiting={ri > 0 ? wait(2 * j) : ''} picked={!!a && picks[s] === a} dim={!!picks[s] && picks[s] !== a} tint={def.tint} onPress={a ? () => choose(s, a) : undefined} />
                          <Text style={{ ...FONT.bold, fontSize: 12, color: C.dim }}>vs</Text>
                          <SideBtn g={g} sym={b && ri === 0 ? shown(2 * s + 1) || b : b} waiting={ri > 0 ? wait(2 * j + 1) : ''} picked={!!b && picks[s] === b} dim={!!picks[s] && picks[s] !== b} tint={def.tint} onPress={b ? () => choose(s, b) : undefined} />
                        </Row>
                      </View>
                    );
                  })}
                </View>
              </Panel>
            ))}
          </View>
        </TourTarget>
        <Note center>Clashy Bot fills a random bracket. More right calls: 2×.</Note>
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title="Lock in my bracket" sub={called === matches ? `${def.secs} s to the bell` : `${called} of ${matches} called`} color={def.tint} ink="#0A0A0D" onPress={() => void go()} disabled={called < matches || g.busy} />
        </TourTarget>
      </View>
    );
  }

  if (!entries || !bot) return <Note center>Locking in your bracket…</Note>;

  // the real bracket so far: from the live moves (or the bell's, once settled)
  const mv = final ?? Object.fromEntries(syms.map((s) => { const p = g.feed.price(s); return [s, p ? p / entries[s]!.p - 1 : 0]; }));
  const real = resolve(syms, mv);
  const mine = picks.filter((p, i) => p === real[i]).length;
  const theirs = bot.filter((p, i) => p === real[i]).length;
  const done = !!final;

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="small" style={{ ...FONT.semi }}>{done ? 'Final score' : 'If it ended now'}</Txt>
          <Row style={{ gap: 8 }}>
            <Tag text={`YOU ${mine}`} color={C.brand} />
            <Tag text={`BOT ${theirs}`} color={C.opp} />
          </Row>
        </Row>
        <Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} />
      </Panel>
      {rounds.map((r, ri) => {
        return (
          <Panel key={ri} style={{ gap: 10 }}>
            <Txt v="label" color={def.tint}>{roundName(rounds.length - 1 - ri)}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {r.map((s, i) => {
                const [a, b] = sidesOf(s, syms, real);
                const w = real[s];
                const mp = picks[s], bp = bot[s];
                return (
                  <View key={s} style={{ flexBasis: wide ? '48%' : '100%', flexGrow: 1, gap: 6 }}>
                    <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                      <Txt v="small" style={{ ...FONT.semi, fontSize: 12 }}>{shortName(rounds.length - 1 - ri, i)}</Txt>
                      <Txt v="small" lines={1} style={{ fontSize: 12, flexShrink: 1 }}>
                        <Text style={{ color: C.brand, ...FONT.semi }}>You {mp ? tickerOf(mp) : '–'}{mp === w ? ' ✓' : ''}</Text>
                        <Text style={{ color: C.dim }}>  ·  </Text>
                        <Text style={{ color: C.opp, ...FONT.semi }}>Bot {bp ? tickerOf(bp) : '–'}{bp === w ? ' ✓' : ''}</Text>
                      </Txt>
                    </Row>
                    <Row style={{ gap: 6 }}>
                      <LiveSide g={g} sym={a} mv={a ? mv[a] : undefined} lead={!!a && a === w} tint={def.tint} />
                      <Text style={{ ...FONT.bold, fontSize: 12, color: C.dim }}>vs</Text>
                      <LiveSide g={g} sym={b} mv={b ? mv[b] : undefined} lead={!!b && b === w} tint={def.tint} />
                    </Row>
                  </View>
                );
              })}
            </View>
          </Panel>
        );
      })}
      {g.phase === 'live' ? (
        <Animated.View entering={FadeIn}>
          <BotSays text={mine === theirs ? 'Level on calls. Every tick counts.' : mine > theirs ? 'Your bracket is ahead. For now.' : 'My random bracket is winning.'} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** One side of a match in setup: tap to call it. */
function SideBtn({ g, sym, waiting, picked, dim, tint, onPress }: { g: GameApi; sym: Slot; waiting: string; picked: boolean; dim: boolean; tint: string; onPress?: () => void }) {
  if (!sym) {
    return (
      <View style={{ flex: 1, minWidth: 0, minHeight: 56, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#2A2A33', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
        <Txt v="small" lines={2} style={{ fontSize: 12, textAlign: 'center' }}>{waiting}</Txt>
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Call ${tickerOf(sym)}`} accessibilityState={{ selected: picked }}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 56, borderRadius: 16, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: picked ? `${tint}2E` : '#17171E', borderWidth: 2, borderColor: picked ? tint : 'transparent', opacity: dim ? 0.5 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <Logo sym={sym} info={g.info} size={26} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1} style={{ fontSize: 14 }}>{tickerOf(sym)}</Txt>
        <Txt v="small" lines={1} style={{ fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{fmtPx(g.feed.price(sym))}</Txt>
      </View>
    </Pressable>
  );
}

/** One side of a match in the live bracket: its move since the entry; the one ahead is lit. */
function LiveSide({ g, sym, mv, lead, tint }: { g: GameApi; sym: Slot; mv?: number; lead: boolean; tint: string }) {
  if (!sym) return <View style={{ flex: 1, minHeight: 52 }} />;
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 52, borderRadius: 16, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: lead ? `${tint}22` : '#17171E', borderWidth: 2, borderColor: lead ? tint : 'transparent', opacity: lead ? 1 : 0.62 }}>
      <Logo sym={sym} info={g.info} size={24} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1} style={{ fontSize: 14 }}>{tickerOf(sym)}</Txt>
        <Txt v="small" lines={1} color={mv === undefined ? C.muted : mv >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontSize: 12, fontVariant: ['tabular-nums'] }}>{mv === undefined ? '–' : signedPct(mv, 3)}</Txt>
      </View>
    </View>
  );
}
