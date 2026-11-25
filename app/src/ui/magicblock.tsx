// The MagicBlock track: a clash's real on-chain steps as they happen, so players (and judges) can see where each part
// of the game runs. Every state shown comes from the duel account and the keeper on the rollup; nothing is simulated.
//   VRF roll → calls sealed (TEE rollup, or commit-reveal on Solana) → live on the rollup (crank ticks) → Magic Action payout
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { C, FONT } from '@/ui/tokens';

export type MbStep = { key: string; label: string; detail: string; state: 'done' | 'active' | 'todo' };

/** MagicBlock's own mark colour on our dark cards. */
const MB_GLOW = '#AB9FF2';

function Pulse() {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withSequence(withTiming(1.9, { duration: 900, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 0 })), -1);
  }, [s]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 2 - s.value }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: MB_GLOW }, ring]} />;
}

function Dot({ state }: { state: MbStep['state'] }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      {state === 'active' ? <Pulse /> : null}
      {state === 'done' ? (
        <Animated.View entering={ZoomIn.springify().damping(12)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: MB_GLOW, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...FONT.bold, fontSize: 13, color: C.onBrand, marginTop: -1 }}>✓</Text>
        </Animated.View>
      ) : (
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: state === 'active' ? MB_GLOW : '#2A2833' }} />
      )}
    </View>
  );
}

/** The connector between two steps fills when the upper step completes. */
function Link({ filled }: { filled: boolean }) {
  const h = useSharedValue(filled ? 1 : 0);
  useEffect(() => { h.value = withTiming(filled ? 1 : 0, { duration: 520, easing: Easing.out(Easing.cubic) }); }, [filled, h]);
  const fill = useAnimatedStyle(() => ({ height: `${h.value * 100}%` }));
  return (
    <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: '#24222C', marginVertical: 2, borderRadius: 1, overflow: 'hidden' }}>
      <Animated.View style={[{ width: 2, backgroundColor: MB_GLOW }, fill]} />
    </View>
  );
}

export function MagicBlockTrack({ steps, title = 'Running on MagicBlock' }: { steps: MbStep[]; title?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(320)} style={{ backgroundColor: '#0E0E13', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14 }}>
      <Text style={{ ...FONT.semi, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: C.dim, marginBottom: 10 }}>{title}</Text>
      {steps.map((st, i) => (
        <View key={st.key} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ alignItems: 'center', width: 22 }}>
            <Dot state={st.state} />
            {i < steps.length - 1 ? <Link filled={st.state === 'done'} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: i < steps.length - 1 ? 12 : 0, marginTop: 1 }}>
            <Text style={{ ...FONT.semi, fontSize: 15, color: st.state === 'todo' ? C.dim : C.ink }}>{st.label}</Text>
            {st.state !== 'todo' && st.detail ? <Animated.Text entering={FadeIn.duration(260)} style={{ ...FONT.regular, fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 2 }}>{st.detail}</Animated.Text> : null}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** A heartbeat for each MagicBlock crank tick: the number bumps and glows every time the rollup checks the clash. */
export function CrankBeat({ ticks }: { ticks: number }) {
  const g = useSharedValue(0);
  useEffect(() => { g.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 520 })); }, [ticks, g]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.35 + g.value * 0.65, transform: [{ scale: 1 + g.value * 0.12 }] }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: MB_GLOW }, glow]} />
      <Text style={{ ...FONT.semi, fontSize: 13, color: C.ink, fontVariant: ['tabular-nums'] }}>{ticks} crank {ticks === 1 ? 'check' : 'checks'} on the rollup · 0 fees</Text>
    </View>
  );
}

/** The moment a call is sealed in MagicBlock's TEE: a lock that snaps shut, then a slow glow while it stays sealed. */
export function SealedPick({ label, note }: { label: string; note: string }) {
  const shut = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    shut.value = withSequence(withTiming(1.18, { duration: 180, easing: Easing.out(Easing.back(2)) }), withTiming(1, { duration: 220 }));
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) })), -1);
  }, [shut, glow]);
  const lock = useAnimatedStyle(() => ({ transform: [{ scale: shut.value }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.45, transform: [{ scale: 1 + glow.value * 0.08 }] }));
  return (
    <View style={{ alignItems: 'center', backgroundColor: '#15151B', borderRadius: 24, paddingVertical: 20, paddingHorizontal: 18 }}>
      <View style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: 76, height: 76, borderRadius: 38, backgroundColor: MB_GLOW }, halo]} />
        <Animated.Text style={[{ fontSize: 38 }, lock]}>🔒</Animated.Text>
      </View>
      <Text style={{ ...FONT.display, fontSize: 26, color: C.ink, marginTop: 10 }}>{label}</Text>
      <Text style={{ ...FONT.regular, fontSize: 13.5, lineHeight: 19, color: C.muted, marginTop: 4, textAlign: 'center' }}>{note}</Text>
    </View>
  );
}
