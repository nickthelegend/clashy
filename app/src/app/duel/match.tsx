// Knockout duel · quick match. One coin for both players, rolled at random; each picks long or short; 60 s.
// On chain the roll is MagicBlock VRF. In practice (before the program ships) it is a crypto-random roll on this
// device, labelled as such, and the opponent is a practice rival that takes the other side of your call.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMajors, useTrending, type Market } from '@/data/markets';
import { Bob } from '@/ui/fx';
import { ART, Art, Avatar, BackBtn, Btn, ErrorLine, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

const TILE = 104;
const LEVS = [25, 50, 100];
const PICK_SECS = 10;
type Phase = 'roll' | 'pick';

/** Uniform random index; uses the platform CSPRNG when present. */
function randomIndex(n: number) {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }
  return Math.floor(Math.random() * n);
}

export default function QuickMatch() {
  const p = useLocalSearchParams<{ stake?: string; streak?: string }>();
  const stake = Number(p.stake ?? 20);
  const streak = Number(p.streak ?? 0); // Double or Nothing chain length so far
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(620);
  const { width } = useWindowDimensions();
  const majors = useMajors();
  const trending = useTrending();
  const [phase, setPhase] = useState<Phase>('roll');
  const [picked, setPicked] = useState<Market>();
  const [side, setSide] = useState<'long' | 'short'>();
  const [lev, setLev] = useState(50);
  const [left, setLeft] = useState(PICK_SECS);
  const rolled = useRef(false);

  // the pool: majors plus trending Solana coins liquid enough to move inside 60 s (≥ $1M 24h volume)
  const pool = useMemo(() => [...(majors.data ?? []), ...(trending.data ?? []).filter((m) => m.image && (m.volume24h ?? 0) >= 1_000_000).slice(0, 9)], [majors.data, trending.data]);
  const ready = (majors.data?.length ?? 0) > 0 && (trending.data !== undefined || trending.error !== undefined);

  // roulette strip
  const x = useSharedValue(0);
  const strip = useMemo(() => Array.from({ length: 7 }).flatMap(() => pool), [pool]);
  const viewW = Math.min(width, 620) - S.gutter * 2;
  const land = (m: Market) => { setPicked(m); setPhase('pick'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
  useEffect(() => {
    if (!ready || rolled.current || pool.length < 2) return;
    rolled.current = true;
    const k = randomIndex(pool.length);
    const target = pool.length * 5 + k;
    const to = -(target * TILE) + viewW / 2 - TILE / 2;
    x.value = viewW / 2 - TILE / 2;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    x.value = withTiming(to, { duration: 3200, easing: Easing.out(Easing.cubic) }, (fin) => { if (fin) runOnJS(land)(pool[k]); });
  }, [ready, pool, viewW, x]); // eslint-disable-line react-hooks/exhaustive-deps
  const stripSt = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // pick-your-side clock: no call by 0 → long
  useEffect(() => {
    if (phase !== 'pick') return;
    const h = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(h);
  }, [phase]);
  const go = (s: 'long' | 'short') => {
    if (!picked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.replace({ pathname: '/duel/live', params: { mode: 'quick', streak: String(streak), id: picked.id, symbol: picked.symbol, image: picked.image ?? '', side: s, stake: String(stake), lev: String(lev), entry: String(picked.price) } });
  };
  useEffect(() => { if (phase === 'pick' && left <= 0) go(side ?? 'long'); }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 12 }}>
      <Row style={{ gap: 10 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">{streak ? `Double or Nothing · ×${2 ** streak}` : 'Knockout duel'}</Txt><Txt v="small">Quick match · ${stake} · 60 s{streak ? ` · streak ${streak}` : ''}</Txt></View>
        <View style={{ backgroundColor: C.s2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}><Txt v="small" color={C.ink}>Practice</Txt></View>
      </Row>

      {/* the two players */}
      <Row style={{ justifyContent: 'center', gap: 18, marginTop: 22 }}>
        <View style={{ alignItems: 'center', gap: 6 }}><Avatar name="you" size={76} ring={C.brand} /><Txt v="label">You</Txt></View>
        <Bob amp={6} ms={700}><Art src={ART.vs} size={84} radius={0} /></Bob>
        <View style={{ alignItems: 'center', gap: 6 }}><Avatar name="practice-rival" size={76} ring={C.opp} /><Txt v="label">Practice rival</Txt></View>
      </Row>

      {/* the roll */}
      <Txt v="small" style={{ textAlign: 'center', marginTop: 24, fontFamily: F.semi, letterSpacing: 1, fontSize: 11 }}>{phase === 'roll' ? 'ROLLING THE COIN' : 'YOUR COIN'}</Txt>
      <View style={{ height: TILE + 20, marginTop: 10, overflow: 'hidden', borderRadius: 22, backgroundColor: C.s1 }}>
        {pool.length >= 2 ? (
          <Animated.View style={[{ flexDirection: 'row', position: 'absolute', top: 10 }, stripSt]}>
            {strip.map((m, i) => (
              <View key={i} style={{ width: TILE, alignItems: 'center', gap: 6 }}>
                <TokenArt symbol={m.symbol} uri={m.image} size={58} />
                <Txt v="small" color={C.ink} lines={1} style={{ maxWidth: TILE - 12, fontFamily: F.semi }}>{m.symbol}</Txt>
              </View>
            ))}
          </Animated.View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">Loading live coins…</Txt></View>
        )}
        <View pointerEvents="none" style={{ position: 'absolute', left: '50%', marginLeft: -TILE / 2, top: 4, width: TILE, height: TILE + 12, borderRadius: 18, borderWidth: 2.5, borderColor: phase === 'pick' ? C.up : '#FFC94A' }} />
      </View>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Practice roll on this device · on chain this roll is MagicBlock VRF</Txt>
      {majors.error ? <ErrorLine msg={`Market feed: ${majors.error}`} onRetry={majors.refresh} /> : null}

      {phase === 'pick' && picked ? (
        <Animated.View entering={FadeInDown.springify().damping(14)} style={{ marginTop: 18, flex: 1 }}>
          <Row style={{ justifyContent: 'center', gap: 10 }}>
            <TokenArt symbol={picked.symbol} uri={picked.image} size={34} />
            <Txt v="title">{picked.symbol}</Txt>
            <Txt v="body" color={C.muted}>{fmtUsd(picked.price)}</Txt>
          </Row>
          <Animated.View entering={FadeIn.delay(150)}>
            <Text style={{ textAlign: 'center', color: left <= 3 ? C.down : C.ink, fontFamily: F.bold, fontSize: 15, marginTop: 10 }}>Pick your side · {Math.max(0, left)} s</Text>
          </Animated.View>
          <Row style={{ gap: 8, marginTop: 14 }}>
            {LEVS.map((v) => <Btn key={v} title={`${v}×`} h={38} kind={lev === v ? 'white' : 'ghost'} style={{ flex: 1 }} onPress={() => setLev(v)} />)}
          </Row>
          <View style={{ flex: 1 }} />
          <Row style={{ gap: 10 }}>
            <Btn title="Long ▲" kind="long" h={68} style={{ flex: 1, borderRadius: 20 }} onPress={() => { setSide('long'); go('long'); }} />
            <Btn title="Short ▼" kind="short" h={68} style={{ flex: 1, borderRadius: 20 }} onPress={() => { setSide('short'); go('short'); }} />
          </Row>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 10 }}>Practice rival takes the other side · real quick match opens at the Blitz kickoff</Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}
