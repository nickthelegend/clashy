// Draw the line (practice, neon finish of style L2): draw the next 60 s of a coin, then the real price draws over your line.
// Score = how closely the real path follows yours. Live Coinbase prices, no money.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { MAJORS } from '@/data/markets';
import { useTicks } from '@/data/ticks';
import { Countdown, CountUp, WinBurst } from '@/ui/fx';
import { ART } from '@/ui/kit';
import { BackBtn, Btn, Card, LiveDot, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, R, S, fmtUsd } from '@/ui/tokens';

const WINDOW = 60; // seconds you predict
const BAND = 0.0025; // ±0.25% vertical range around the price at lock
const PB_KEY = 'clashy:line:best';
type Phase = 'warm' | 'draw' | 'count' | 'live' | 'done';

export default function DrawTheLine() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(900);
  const { desk } = useLayout();
  const { width } = useWindowDimensions();
  const [coin, setCoin] = useState('SOL');
  const { ticks, last, error } = useTicks(coin, 120);
  const [phase, setPhase] = useState<Phase>('warm');
  const [drawn, setDrawn] = useState<{ x: number; y: number }[]>([]);
  const [lock, setLock] = useState<{ t: number; p: number } | null>(null);
  const [left, setLeft] = useState(WINDOW);
  const [best, setBest] = useState<number | null>(null);
  const done = useRef(false);
  const lastRef = useRef<number | undefined>(undefined);
  lastRef.current = last;

  const W = Math.min(width, desk ? 900 : 520) - S.gutter * 2 - (desk ? 340 : 0);
  const H = desk ? 420 : 340;
  const split = 0.35; // left 35% = recent history, right 65% = the next 60 s

  useEffect(() => { AsyncStorage.getItem(PB_KEY).then((v) => v && setBest(Number(v))).catch(() => {}); }, []);
  useEffect(() => { if (phase === 'warm' && ticks.length >= 8) setPhase('draw'); }, [phase, ticks.length]);
  useEffect(() => { setPhase('warm'); setDrawn([]); setLock(null); done.current = false; }, [coin]);

  // vertical scale: centred on the lock price (or last price while drawing)
  const mid = lock?.p ?? last ?? 0;
  const yOf = (p: number) => H / 2 - ((p - mid) / mid / BAND) * (H / 2);
  const pOf = (y: number) => mid * (1 + ((H / 2 - y) / (H / 2)) * BAND);
  const xNow = W * split;

  // history (before lock / before now) on the left part
  const histPath = useMemo(() => {
    const hist = lock ? ticks.filter((k) => k.t <= lock.t) : ticks;
    const h = hist.slice(-40);
    if (h.length < 2) return '';
    return h.map((k, i) => `${i ? 'L' : 'M'}${(xNow * i / (h.length - 1)).toFixed(1)},${yOf(k.p).toFixed(1)}`).join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks, lock, mid, W, H]);

  // real price after the lock, drawn over the user's line
  const realPts = lock ? ticks.filter((k) => k.t >= lock.t).map((k) => ({ x: xNow + ((k.t - lock.t) / 1000 / WINDOW) * (W - xNow), y: yOf(k.p) })) : [];
  const realPath = realPts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const userPath = drawn.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

  // score: 100 − mean vertical error as a share of the band, over the real points so far
  const userYAt = (x: number) => {
    if (drawn.length < 2) return null;
    let a = drawn[0], b = drawn[drawn.length - 1];
    for (let i = 1; i < drawn.length; i++) if (drawn[i].x >= x) { a = drawn[i - 1]; b = drawn[i]; break; }
    return b.x === a.x ? a.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  };
  const score = (() => {
    const errs = realPts.map((q) => { const u = userYAt(q.x); return u === null ? null : Math.abs(u - q.y) / H; }).filter((e): e is number => e !== null);
    if (!errs.length) return null;
    return Math.max(0, Math.round(100 - (errs.reduce((s, e) => s + e, 0) / errs.length) * 200));
  })();

  // drawing: only to the right of "now", left to right
  const addPoint = (x: number, y: number, start: boolean) => {
    if (phase !== 'draw') return;
    const cx = Math.max(xNow, Math.min(W, x)), cy = Math.max(4, Math.min(H - 4, y));
    setDrawn((d) => (start ? [{ x: xNow, y: yOf(last ?? mid) }, { x: cx, y: cy }] : cx > (d[d.length - 1]?.x ?? 0) ? [...d, { x: cx, y: cy }] : d));
  };
  const pan = Gesture.Pan().minDistance(0)
    .onBegin((e) => { runOnJS(addPoint)(e.x, e.y, true); })
    .onUpdate((e) => { runOnJS(addPoint)(e.x, e.y, false); });
  const covered = drawn.length > 1 && drawn[drawn.length - 1].x >= W - 6;

  const start = () => {
    if (!covered || !last) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setPhase('count');
  };
  // the line locks at GO, on the price at that moment
  const go = useCallback(() => { setLock({ t: Date.now(), p: lastRef.current ?? 0 }); setLeft(WINDOW); setPhase('live'); }, []);
  useEffect(() => {
    if (phase !== 'live') return;
    const h = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(h);
  }, [phase]);
  useEffect(() => {
    if (phase === 'live' && left <= 0 && !done.current) {
      done.current = true;
      setPhase('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (score !== null && (best === null || score > best)) { setBest(score); AsyncStorage.setItem(PB_KEY, String(score)).catch(() => {}); }
    }
  }, [phase, left, score, best]);

  const reset = () => { setDrawn([]); setLock(null); done.current = false; setPhase(ticks.length >= 8 ? 'draw' : 'warm'); };

  const side = (
    <View style={{ gap: 10, width: desk ? 320 : undefined }}>
      <Card>
        <Txt v="small">{phase === 'live' ? 'Match so far' : phase === 'done' ? 'Final match' : 'How it works'}</Txt>
        {phase === 'done' && score !== null ? (
          <View style={{ alignItems: 'center' }}>
            <WinBurst src={score >= 80 ? ART.winTrophy : score >= 60 ? ART.draw : ART.koSkull} size={110} burst={score >= 80} />
            <CountUp to={score} ms={1100} format={(v) => `${Math.round(v)}%`} style={{ fontFamily: F.bold, fontSize: 48, letterSpacing: -1.5, color: score >= 70 ? C.up : score >= 50 ? C.ink : C.down }} />
            <Txt v="label" style={{ marginTop: 2 }}>{score >= 80 ? 'Perfect read.' : score >= 60 ? 'Close call.' : 'The market had other plans.'}</Txt>
          </View>
        ) : phase === 'live' || phase === 'done' ? (
          <Txt v="title" color={score !== null && score >= 70 ? C.up : C.ink} style={{ fontSize: 40, marginTop: 4 }}>{score ?? '–'}%</Txt>
        ) : (
          <Txt v="small" color="#B9B9C2" style={{ marginTop: 6, lineHeight: 18 }}>Drag across the right side to draw where {coin} goes in the next 60 s. Lock it, then the real price draws over your line.</Txt>
        )}
        {best !== null ? <Txt v="small" style={{ marginTop: 6 }}>Your best: {best}%</Txt> : null}
      </Card>
      {phase === 'draw' ? <Btn title={covered ? 'Lock my line' : 'Draw to the right edge'} kind="white" disabled={!covered} onPress={start} /> : null}
      {phase === 'draw' && drawn.length ? <Btn title="Clear" kind="ghost" onPress={() => setDrawn([])} /> : null}
      {phase === 'done' ? <Btn title="Draw again" kind="white" onPress={reset} /> : null}
      <Txt v="small" style={{ textAlign: 'center' }}>Practice · live {coin} price · rooms with real players open at the Blitz kickoff</Txt>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 12 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Draw the line</Txt><Txt v="small">Practice · 60 s</Txt></View>
        {phase === 'live' ? <Row style={{ gap: 6 }}><LiveDot /><Txt v="title" style={{ fontSize: 22 }}>0:{String(Math.max(0, left)).padStart(2, '0')}</Txt></Row> : null}
      </Row>
      <Row style={{ gap: 8, marginBottom: 12 }}>
        {MAJORS.map((m) => (
          <Btn key={m.id} title={m.id} h={36} kind={coin === m.id ? 'white' : 'ghost'} style={{ flex: 1 }} disabled={phase === 'live'} onPress={() => setCoin(m.id)}
            icon={<TokenArt symbol={m.id} uri={m.image} size={18} />} />
        ))}
      </Row>
      <View style={{ flexDirection: desk ? 'row' : 'column', gap: 14, flex: desk ? undefined : 1 }}>
        <View>
          <GestureDetector gesture={pan}>
            <View style={{ width: W, height: H, borderRadius: R.lg, backgroundColor: '#060609', overflow: 'hidden', borderWidth: 1, borderColor: '#1A1A22' }}>
              <Svg width={W} height={H}>
                <Defs><LinearGradient id="fut" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={C.brand} stopOpacity={0.16} /><Stop offset="1" stopColor={C.brand} stopOpacity={0.03} /></LinearGradient></Defs>
                <Rect x={xNow} y={0} width={W - xNow} height={H} fill="url(#fut)" />
                {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="#14141B" />)}
                <Line x1={xNow} x2={xNow} y1={0} y2={H} stroke="#3A3A42" strokeDasharray="4 5" />
                {histPath ? <Path d={histPath} stroke={C.ink} strokeWidth={2} fill="none" /> : null}
                {userPath ? <><Path d={userPath} stroke={C.brand} strokeOpacity={0.28} strokeWidth={14} fill="none" strokeLinecap="round" strokeLinejoin="round" /><Path d={userPath} stroke="#7C8AFF" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></> : null}
                {realPath ? <><Path d={realPath} stroke="#fff" strokeOpacity={0.22} strokeWidth={10} fill="none" strokeLinejoin="round" /><Path d={realPath} stroke="#fff" strokeWidth={2.8} fill="none" strokeLinejoin="round" /></> : null}
              </Svg>
              <View style={{ position: 'absolute', left: 10, top: 8 }}><Txt v="small">{last ? `${coin} ${fmtUsd(last)}` : 'Loading price…'}</Txt></View>
              <View style={{ position: 'absolute', left: xNow + 8, top: 8 }}><Txt v="small" color={C.brandSoft}>{phase === 'warm' ? `Warming up ${Math.min(ticks.length, 8)}/8` : phase === 'draw' ? 'Draw here →' : 'Next 60 s'}</Txt></View>
              <View style={{ position: 'absolute', right: 8, top: 8 }}><Txt v="small">{fmtUsd(pOf(8))}</Txt></View>
              <View style={{ position: 'absolute', right: 8, bottom: 6 }}><Txt v="small">{fmtUsd(pOf(H - 8))}</Txt></View>
            </View>
          </GestureDetector>
          {error ? <Txt v="small" color={C.down} style={{ marginTop: 6 }}>Price feed: {error}</Txt> : null}
        </View>
        {side}
      </View>
      {phase === 'count' ? <Countdown onDone={go} /> : null}
    </View>
  );
}
