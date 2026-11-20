// Podium (Nov 20): n markets (3 to 5) are rolled; put them in finishing order (tap 1st, 2nd, 3rd…; tap again to
// clear). At the bell they finish by their move since the start, and the best line of the payout table you hit pays.
// The table is shown before you play; on a random order it pays back at most your stake on average (checked below).
// A dead heat that changes the payout has no fair finish, so it refunds.
// p: { n: 3 | 4 | 5 = 3 }
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, tickerOf, useLivePool } from '../feed';
import { Clock, Go, Logo, MarketTile, Note, Panel, bellPrices, clampInt, fmtPx, rollable, useClock, type GameApi, type Line } from '../kit';
import { sample, signedPct } from '../odds';

/** A line of the payout table: the first `k` places in your exact order pay `x` × the stake. */
type Tier = { k: number; x: number; label: string };
const TABLES: Record<number, Tier[]> = {
  3: [{ k: 3, x: 5, label: 'All 3 in order' }, { k: 1, x: 1, label: 'Right winner' }],
  4: [{ k: 4, x: 20, label: 'All 4 in order' }, { k: 2, x: 3, label: 'Top two in order' }, { k: 1, x: 0.25, label: 'Right winner' }],
  5: [{ k: 5, x: 100, label: 'All 5 in order' }, { k: 3, x: 6, label: 'Top three in order' }, { k: 1, x: 0.5, label: 'Right winner' }],
};
/** The best line a call hits. `call` and `finish` are market indexes, first place first. */
function lineHit(n: number, call: number[], finish: number[]): Tier | null {
  for (const t of TABLES[n]!) if (call.slice(0, t.k).every((x, i) => x === finish[i])) return t;
  return null;
}
function perms(a: number[]): number[][] {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** The average multiplier when the finish is random: every one of the n! orders is equally likely. */
function evOf(n: number) {
  const all = perms(range(n));
  return all.reduce((s, f) => s + (lineHit(n, range(n), f)?.x ?? 0), 0) / all.length;
}
// Enumerated over every order: n=3 (5 + 1) / 6 = 1.000 · n=4 (20 + 3 + 4 × 0.25) / 24 = 1.000 ·
// n=5 (100 + 6 + 22 × 0.5) / 120 = 0.975. Dev builds check it on load: no table may pay over 1 on a random order.
const EV: Record<number, number> = { 3: evOf(3), 4: evOf(4), 5: evOf(5) };
if (__DEV__) for (const n of [3, 4, 5]) if (EV[n]! > 1 + 1e-9) console.error(`Podium: the n=${n} table pays ${EV[n]!.toFixed(4)}× on a random order (over 1).`);

const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
/** 5×, 0.25×, 100× (the table's own numbers, no padding). */
const fx = (x: number) => `${x}×`;
const MEDAL = ['#FFD66B', '#D9DEE6', '#E0A472', C.muted, C.muted];

export default function Podium({ g }: { g: GameApi }) {
  const { def } = g;
  const n = clampInt(def.p?.n, 3, 5, 3);
  const table = TABLES[n]!;
  const live = useLivePool(def.pool);
  const [syms, setSyms] = useState<string[] | null>(null);
  /** order[r] = the market you put in place r. */
  const [order, setOrder] = useState<(string | null)[]>(() => range(n).map(() => null));
  const [entries, setEntries] = useState<Record<string, number> | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<{ px: Record<string, number>; finish: number[] } | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);
  const bell = useRef<Record<string, number>>({});

  useEffect(() => { if (!syms && live.length >= n) setSyms(sample(rollable(g, live, n), n)); }, [syms, live.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reroll = () => { setOrder(range(n).map(() => null)); setSyms(sample(rollable(g, live, n), n)); };
  const tap = (s: string) => setOrder((o) => {
    const at = o.indexOf(s);
    if (at >= 0) return o.map((x, i) => (i === at ? null : x));
    const free = o.indexOf(null);
    return free < 0 ? o : o.map((x, i) => (i === free ? s : x));
  });
  const full = order.every(Boolean);

  const go = async () => {
    if (!syms || !full) return;
    const stale = syms.find((s) => !g.feed.fresh(s));
    if (stale) { g.fail(`Waiting for a live ${tickerOf(stale)} price.`); return; }
    const e: Record<string, number> = {};
    for (const s of syms) e[s] = g.feed.mark(s)!.p;
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setEntries(e); setEndsAt(end);
  };

  // the bell: every market's first live price at or after it
  useEffect(() => {
    if (!syms || !entries || !endsAt || settled.current || g.phase !== 'live') return;
    if (Date.now() < endsAt) return;
    const px = bellPrices(g, syms, endsAt, bell);
    if (!px) {
      if (Date.now() > endsAt + 15_000) {
        settled.current = true;
        g.abandon('Not every market sent a live price at the bell, so your stake is back.');
      }
      return;
    }
    settled.current = true;
    const moves = syms.map((s) => px[s]! / entries[s]! - 1);
    const call = order.map((s) => syms.indexOf(s!));
    // every finish the moves allow (a dead heat could go either way); they must all pay the same
    const finishes = perms(range(n)).filter((f) => f.every((x, j) => j === 0 || moves[f[j - 1]!]! >= moves[x]!));
    const pays = finishes.map((f) => lineHit(n, call, f)?.x ?? 0);
    const finish = finishes[0]!;
    setFinal({ px, finish });
    if (pays.some((x) => x !== pays[0])) {
      g.abandon('Two markets finished dead level where it mattered, so there is no fair order. Your stake is back.');
      return;
    }
    const hit = lineHit(n, call, finish);
    const winner = tickerOf(syms[finish[0]!]!);
    const lines: Line[] = [
      ...finish.map((i, r): Line => [`${ORD[r]} ${tickerOf(syms[i]!)}`, `${signedPct(moves[i]!, 3)} · ${fmtPx(entries[syms[i]!])} → ${fmtPx(px[syms[i]!])}`]),
      ['Your order', order.map((s) => tickerOf(s!)).join(' · ')],
      ['Line hit', hit ? `${hit.label}, ${fx(hit.x)}` : 'None'],
    ];
    const verdict = !hit ? `${winner} won it. Not your pick for 1st.`
      : hit.k === n ? `Called the whole podium. ${fx(hit.x)}.`
      : hit.k > 1 ? `${hit.label}. ${fx(hit.x)}.`
      : hit.x >= 1 ? `${winner} won, as you said. Wrong order after that: stake back.`
      : `${winner} won, as you said. Wrong order after that: ${fx(hit.x)} back.`;
    g.end(hit?.x ?? 0, verdict, lines);
  });

  if (!syms) {
    return <Panel><Note center>{live.length ? `Finding ${n} markets with a live price…` : 'Loading live prices…'}</Note></Panel>;
  }

  if (g.phase === 'setup') {
    const placed = order.filter(Boolean).length;
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <Panel style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt v="h2">Call the finish</Txt>
                <Txt v="small">{full ? 'Order set. Tap one to change it.' : `Tap the ${ORD[order.indexOf(null)]} place finisher.`}</Txt>
              </View>
              <Pressable onPress={reroll} accessibilityRole="button" accessibilityLabel="Roll new markets" hitSlop={6}
                style={({ pressed }) => ({ paddingHorizontal: 14, height: 44, borderRadius: 22, backgroundColor: pressed ? '#24242C' : '#1D1D24', justifyContent: 'center' })}>
                <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll again</Txt>
              </Pressable>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {syms.map((s) => {
                const r = order.indexOf(s);
                return (
                  <MarketTile key={s} g={g} sym={s} selected={r >= 0} onPress={() => tap(s)}
                    mark={r >= 0 ? <Medal r={r} /> : undefined} />
                );
              })}
            </View>
            <Row style={{ gap: 6 }}>
              {order.map((s, r) => (
                <View key={r} style={{ flex: 1, minWidth: 0, height: 52, borderRadius: 16, backgroundColor: s ? '#1B1824' : '#121217', borderWidth: 1, borderColor: s ? `${MEDAL[r]}55` : '#22222A', borderStyle: s ? 'solid' : 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <Text style={{ ...FONT.bold, fontSize: 10.5, letterSpacing: 0.3, color: MEDAL[r] }}>{ORD[r]}</Text>
                  {s ? <Txt v="label" lines={1} style={{ fontSize: 13 }}>{tickerOf(s)}</Txt> : <Txt v="small" style={{ fontSize: 12 }}>–</Txt>}
                </View>
              ))}
            </Row>
          </Panel>
        </TourTarget>
        <PayTable table={table} tint={def.tint} />
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title={full ? 'Lock the order' : `Place ${n - placed} more`} sub={`${def.secs} s race`} onPress={() => void go()} disabled={!full || g.busy} color={def.tint} ink="#0A0A0D" />
        </TourTarget>
        <Note center>A random order pays back {Math.round(EV[n]! * 1000) / 10}% on average.</Note>
      </View>
    );
  }

  // live and done: the standings, best move first
  const priceOf = (s: string) => (final ? final.px[s] : g.feed.mark(s)?.p);
  const moveOf = (s: string) => { const p = priceOf(s), e = entries?.[s]; return p && e ? p / e - 1 : 0; };
  const standing = final ? final.finish.map((i) => syms[i]!) : [...syms].sort((a, b) => moveOf(b) - moveOf(a));
  const now = lineHit(n, order.map((s) => syms.indexOf(s!)), standing.map((s) => syms.indexOf(s)));
  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} />
        <Row style={{ justifyContent: 'space-between', gap: 8 }}>
          <Txt v="small">{g.phase === 'done' ? 'Finish' : 'Right now'}</Txt>
          <Txt v="label" color={now ? def.tint : C.muted} style={{ fontSize: 14 }}>{now ? `${now.label} · ${fx(now.x)}` : 'No line yet'}</Txt>
        </Row>
      </Panel>
      <View style={{ gap: 8 }}>
        {standing.map((s, r) => {
          const mv = moveOf(s);
          const mine = order.indexOf(s);
          const hit = mine === r;
          return (
            <Animated.View key={s} layout={LinearTransition.duration(300)} entering={FadeIn.duration(200)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#131318', borderRadius: 20, padding: 10, borderWidth: 1.5, borderColor: hit ? `${def.tint}AA` : 'transparent' }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${MEDAL[r]}22`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...FONT.bold, fontSize: 13, color: MEDAL[r] }}>{ORD[r]}</Text>
              </View>
              <Logo sym={s} info={g.info} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1}>{nameOf(g.info, s)}</Txt>
                <Txt v="small" lines={1} color={hit ? def.tint : C.muted}>You said {ORD[mine]}{hit ? ' ✓' : ''}</Txt>
              </View>
              <Txt v="label" color={mv >= 0 ? C.up : C.down} style={{ fontVariant: ['tabular-nums'] }}>{signedPct(mv, 3)}</Txt>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

function Medal({ r }: { r: number }) {
  return (
    <View style={{ minWidth: 30, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: MEDAL[r], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ ...FONT.bold, fontSize: 11, color: '#0A0A0D' }}>{ORD[r]}</Text>
    </View>
  );
}

function PayTable({ table, tint }: { table: Tier[]; tint: string }) {
  return (
    <Panel style={{ gap: 8, paddingVertical: 14 }}>
      <Txt v="small" style={{ ...FONT.semi, letterSpacing: 0.6 }}>PAYS</Txt>
      {table.map((t) => (
        <Row key={t.label} style={{ justifyContent: 'space-between', gap: 10 }}>
          <Txt v="body" lines={1} style={{ flex: 1 }}>{t.label}</Txt>
          <Txt v="label" color={t.x >= 1 ? tint : C.ink} style={{ fontVariant: ['tabular-nums'] }}>{fx(t.x)}{t.x === 1 ? ' (stake back)' : ''}</Txt>
        </Row>
      ))}
      <Row style={{ justifyContent: 'space-between', gap: 10 }}>
        <Txt v="body" color={C.muted} style={{ flex: 1 }}>Anything else</Txt>
        <Txt v="label" color={C.muted}>0×</Txt>
      </Row>
    </Panel>
  );
}
