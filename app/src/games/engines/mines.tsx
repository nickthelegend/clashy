// Mines (Nov 21): an instant game on the day's real 24 h change (Pacifica's number, through the live feed). A board of
// `tiles` real markets, ranked by the day's change: the `count` worst are the mines (the best, with mines: 'green'), so
// a board deals on red days and green days alike, and you're told how many. Flip a safe one and the pot grows by the exact odds less 3%: after k safe flips of N tiles with m mines it
// is 0.97 × Π (N − i) / (N − m − i). Flip a mine and every tile turns over and the pot is gone. Cash out any time after
// a safe flip; flipping every safe tile cashes out on its own. The 24 h changes are a snapshot taken when the board is
// dealt (a board older than 10 minutes is dealt again before the stake is taken), and the receipt shows that snapshot.
// No board is ever faked: too few markets with a 24 h change, or a tie where the mines start, says so plainly.
// The stake is taken at the first flip.
// p: { tiles: 16 | 9 = 16, mines: 'red' (the worst) | 'green' (the best) = 'red', count (4 of 16, 2 of 9), faceUp = true }
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FlipInEasyY, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { CountUp, GS, GT, Logo, Pill, PotBar, Waiting, candleTime, fmtPctUnits, fmtX, mktLine, poolList, sample, tickerOf, type GameApi, type Line } from '../kit';

type Tile = { sym: string; ch: number; mine: boolean };
type Board = { tiles: Tile[]; mines: number; at: number };
/** A board older than this is dealt again before the stake is taken, so the 24 h changes are current. */
const MAX_AGE = 10 * 60_000;
/** How long the screen waits for the first prices and 24 h changes before it says what's missing. */
const GRACE_MS = 6000;

/** The pot after `k` safe flips of `n` tiles with `m` mines: 97% of the exact odds. */
const potAt = (k: number, n: number, m: number) => { let x = 0.97; for (let i = 0; i < k; i++) x *= (n - i) / (n - m - i); return x; };
/** A 24 h change (percent units) with enough digits that a tiny red one never reads as +0.00%. */
const fmtCh = (c: number) => { let dp = 2; while (dp < 4 && c !== 0 && Math.abs(c) < 0.5 * 10 ** -dp) dp++; return fmtPctUnits(c, dp); };

/**
 * `n` of the candidates, ranked by the day's change: the `m` worst (or best, `green`) are the mines. A board is only dealt
 * when the m-th and (m+1)-th changes differ, so the line between mine and safe is never a tie. Null if that can't happen.
 */
function deal(cands: { sym: string; ch: number }[], n: number, m: number, green: boolean): Board | null {
  for (let i = 0; i < 60; i++) {
    const s = sample(cands, n);
    if (s.length < n) return null;
    const ranked = [...s].sort((a, b) => (green ? b.ch - a.ch : a.ch - b.ch));
    if (ranked[m - 1]!.ch === ranked[m]!.ch) continue;
    const mines = new Set(ranked.slice(0, m).map((t) => t.sym));
    return { tiles: s.map((t) => ({ ...t, mine: mines.has(t.sym) })), mines: m, at: Date.now() };
  }
  return null;
}

export default function Mines({ g }: { g: GameApi }) {
  const { def } = g;
  const N = g.def.p?.tiles === 9 ? 9 : 16;
  const cols = N === 9 ? 3 : 4;
  const green = def.p?.mines === 'green';
  const faceUp = def.p?.faceUp !== false;
  const word = green ? 'best' : 'worst';
  /** How many mines: a quarter of the board by default (4 of 16, 2 of 9). */
  const M = Math.max(1, Math.min(N - 2, Math.round(Number(def.p?.count) || (N === 9 ? 2 : 4))));
  const [board, setBoard] = useState<Board | null>(null);
  const [none, setNone] = useState<{ red: number; total: number } | null>(null);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [boom, setBoom] = useState<number | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const ended = useRef(false);
  const starting = useRef(false);
  const flips = useRef<number[]>([]); // the handlers' copy of `flipped`, so fast taps never drop a flip
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.get() }] }));

  // every market in the pool with a fresh price and a real 24 h change (only the markets Pacifica lists have one)
  const pool = poolList(def.pool);
  const live = pool.filter((s) => g.feed.fresh(s));
  const cands = live.flatMap((s) => {
    const c = g.feed.mark(s)?.ch24;
    return c === undefined || !Number.isFinite(c) ? [] : [{ sym: s, ch: c }];
  });

  const tryDeal = () => {
    const b = deal(cands, N, M, green);
    if (b) { setBoard(b); setNone(null); } else setNone({ red: cands.filter((t) => t.ch < 0).length, total: cands.length });
  };
  // deal as soon as enough markets have a 24 h change (no deps on purpose: the feed re-renders every 1.5 s)
  useEffect(() => { if (!board && !none && !ended.current && cands.length >= N) tryDeal(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const m = board?.mines ?? 0;
  const k = flipped.length - (boom !== null ? 1 : 0); // safe flips so far
  const pot = k > 0 ? potAt(k, N, m) : 1;

  const linesFor = (b: Board, order: number[], extra: Line[]): Line[] => [
    ['Mines', `${b.mines} of ${N}: the day's ${word} (24 h change, Pacifica)`],
    ['24 h change as of', candleTime(b.at)],
    ...order.map((j, n): Line => { const t = b.tiles[j]!; return [`${n + 1}. ${mktLine(g, t.sym)}`, `${fmtCh(t.ch)} · ${t.mine ? 'mine' : 'safe'}`]; }),
    ...extra,
  ];

  const flip = async (i: number) => {
    if (!board || ended.current || starting.current || g.busy || g.phase === 'done' || flips.current.includes(i)) return;
    if (g.phase === 'setup') {
      if (Date.now() - board.at > MAX_AGE) { setBoard(null); setNone(null); g.fail("That board was over 10 minutes old, so here's a fresh deal."); return; }
      if (!g.feed.fresh(board.tiles[i]!.sym)) { g.fail('Waiting for live prices.'); return; }
      starting.current = true;
      const ok = await g.begin();
      starting.current = false;
      if (!ok) return;
    }
    if (ended.current || flips.current.includes(i)) return;
    const t = board.tiles[i]!;
    const before = flips.current.length; // every flip before this one was safe
    const order = [...flips.current, i];
    flips.current = order;
    setFlipped(order);
    if (t.mine) {
      ended.current = true;
      setBoom(i);
      shakeX.set(withSequence(withTiming(-8, { duration: 45 }), withRepeat(withTiming(8, { duration: 70 }), 5, true), withTiming(0, { duration: 45 })));
      g.end(0, `${tickerOf(t.sym)} is ${fmtCh(t.ch)} today. Mine.${before > 0 ? ` The ${fmtX(potAt(before, N, board.mines))} pot is gone.` : ''}`,
        linesFor(board, order, [['Safe flips', String(before)], ['Pot', 'Lost']]));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const safe = order.length;
    if (safe === N - board.mines) {
      ended.current = true;
      const x = potAt(safe, N, board.mines);
      g.end(x, `Every safe tile flipped. ${fmtX(x)}.`, linesFor(board, order, [['Safe flips', `${safe} of ${N - board.mines}`], ['Pot', fmtX(x)]]));
    }
  };

  const cashOut = () => {
    const safe = flips.current.length;
    if (!board || ended.current || safe < 1 || g.phase !== 'live') return;
    ended.current = true;
    const x = potAt(safe, N, board.mines);
    g.end(x, `Cashed out after ${safe} safe flip${safe === 1 ? '' : 's'} at ${fmtX(x)}.`, linesFor(board, flips.current, [['Safe flips', `${safe} of ${N - board.mines}`], ['Pot', fmtX(x)]]));
  };

  const fresh = () => { g.fail(undefined); setBoard(null); setNone(null); };

  /* ---------- no board yet ---------- */
  if (!board) {
    if (none) {
      return (
        <View style={{ gap: 12 }}>
          <Waiting text="These markets' 24 h changes are tied right where the mines would start." sub="There's no fair board right now. The changes move, so try again in a bit." tint={def.tint} />
          <View style={{ alignItems: 'center' }}><Pill label="Try again" onPress={() => setNone(null)} /></View>
        </View>
      );
    }
    const early = Date.now() - since < GRACE_MS;
    if (early || !live.length) return <Waiting text={live.length ? "Waiting for Pacifica's 24 h changes…" : 'Loading live prices…'} tint={def.tint} />;
    return (
      <View style={{ gap: 12 }}>
        <Waiting text={`Only ${cands.length} of these markets have a 24 h change right now.`} sub={`A board needs ${N}. Pacifica sends the 24 h change only for the markets it lists.`} tint={def.tint} />
        <View style={{ alignItems: 'center' }}><Pill label="Try again" onPress={() => setSince(Date.now())} /></View>
      </View>
    );
  }

  /* ---------- the board ---------- */
  const over = g.phase === 'done' || boom !== null;
  const gap = 8;
  const boardW = Math.min(g.width, cols === 4 ? 420 : 372);
  const size = Math.floor((boardW - gap * (cols - 1)) / cols);
  const locked = over || g.busy;
  const nextX = k < N - m ? potAt(k + 1, N, m) : null;

  return (
    <View style={{ gap: 14 }}>
      <Row style={{ gap: 12, justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="h2" style={{ fontSize: 21 }}>
            <Text style={{ color: C.down }}>{m} of {N}</Text> are mines: today's {word}
          </Txt>
          <Txt v="small">24 h change on Pacifica · {faceUp ? 'face up' : 'face down'}</Txt>
        </View>
        {g.phase === 'setup' ? <Pill label="New board" onPress={fresh} disabled={g.busy} /> : null}
      </Row>
      {g.phase === 'setup' ? g.stakeRow : null}
      <TourTarget id="g-pick" style={{ alignItems: 'center' }}>
        <Animated.View style={[{ width: boardW, flexDirection: 'row', flexWrap: 'wrap', gap }, shakeStyle]}>
          {board.tiles.map((t, i) => {
            const mine = flipped.includes(i);
            const state: TileState = mine ? (i === boom ? 'boom' : 'safe') : over ? 'shown' : 'down';
            return (
              <MineTile key={t.sym} g={g} t={t} size={size} state={state} faceUp={faceUp} tint={def.tint} delay={over && !mine ? 60 + i * 28 : 0}
                onPress={() => void flip(i)} disabled={locked || mine} />
            );
          })}
        </Animated.View>
      </TourTarget>
      <View style={{ minHeight: 22, alignItems: 'center' }}>
        {boom !== null ? (
          <Animated.View entering={ZoomIn.springify()}><Txt v="label" color={C.down}>Mine. The pot is gone.</Txt></Animated.View>
        ) : g.phase === 'done' ? (
          <Animated.View entering={FadeIn.duration(220)}><Txt v="label" color={C.up}>Banked at {fmtX(pot)}.</Txt></Animated.View>
        ) : g.phase === 'setup' ? (
          <Txt v="small">Tap a tile to start. A safe flip pays {fmtX(potAt(1, N, m))}.</Txt>
        ) : nextX !== null ? (
          <Animated.View key={k} entering={FadeIn.duration(220)}><Txt v="small">Next safe flip: <Text style={{ ...FONT.bold, color: def.tint }}>{fmtX(nextX)}</Text></Txt></Animated.View>
        ) : null}
      </View>
      <PotBar g={g} mult={pot} streak={k} streakLabel="Safe flips" canCash={k > 0 && g.phase === 'live' && boom === null} onCash={cashOut} />
    </View>
  );
}

type TileState = 'down' | 'safe' | 'boom' | 'shown';
/** One tile: the market face up (logo, ticker) or a "?" face down; flipped, its 24 h change counts up. */
function MineTile({ g, t, size, state, faceUp, tint, delay, onPress, disabled }: {
  g: GameApi; t: Tile; size: number; state: TileState; faceUp: boolean; tint: string; delay: number; onPress: () => void; disabled: boolean;
}) {
  const open = state !== 'down';
  const bg = state === 'safe' ? C.upBg : state === 'boom' ? `${C.down}4D` : !open && !faceUp ? `${tint}1F` : GT.raised;
  const edge = state === 'safe' ? C.up : state === 'boom' ? C.down : !open && !faceUp ? `${tint}55` : 'transparent';
  const glow = state === 'safe' ? C.up : state === 'boom' ? C.down : undefined;
  const small = size < 90;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={open ? `${tickerOf(t.sym)}, ${fmtCh(t.ch)} today, ${t.mine ? 'mine' : 'safe'}` : faceUp ? `Flip ${tickerOf(t.sym)}` : 'Flip a face-down tile'}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: small ? GS.radius.stat : GS.radius.tile, backgroundColor: bg, borderWidth: 2, borderColor: edge,
        alignItems: 'center', justifyContent: 'center', padding: 4, opacity: state === 'shown' ? 0.62 : 1,
        transform: [{ scale: pressed && !disabled ? 0.94 : 1 }],
        shadowColor: glow, shadowOpacity: glow ? 0.55 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
      })}>
      {!open ? (
        faceUp ? (
          <View style={{ alignItems: 'center', gap: small ? 4 : 6 }}>
            <Logo sym={t.sym} info={g.info} size={Math.round(size * 0.4)} />
            <Txt v="label" lines={1} style={{ fontSize: small ? 12.5 : 14 }}>{tickerOf(t.sym)}</Txt>
          </View>
        ) : <Text style={{ ...FONT.displayB, fontSize: Math.round(size * 0.38), color: tint }}>?</Text>
      ) : (
        <Animated.View key="open" entering={FlipInEasyY.duration(320).delay(delay)} style={{ alignItems: 'center', gap: 2, width: '100%' }}>
          <Logo sym={t.sym} info={g.info} size={Math.round(size * 0.3)} />
          <Txt v="small" lines={1} color={C.ink} style={{ ...FONT.semi, fontSize: small ? 11 : 12.5 }}>{tickerOf(t.sym)}</Txt>
          <View style={{ height: small ? 18 : 22, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
            <CountUp to={t.ch} size={small ? 13 : 16} color={t.ch >= 0 ? C.up : C.down} fmt={(x) => (x === t.ch ? fmtCh(t.ch) : fmtPctUnits(x, 2))} />
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}
