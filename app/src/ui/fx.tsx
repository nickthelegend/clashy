// Game FX: VS intro, 3-2-1-GO countdown, floating emotes, count-up numbers, shake, danger pulse, win burst.
// Built on Reanimated; art comes from the clay set (same filenames as assets/mobile, so new art drops in).
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, ZoomIn, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { ART } from './kit';
import { C, F } from './tokens';

/** Clay game FX art (assets/mobile/fx, same filenames). */
export const FX = {
  n3: require('../../assets/art/fx/fx-3.webp'), n2: require('../../assets/art/fx/fx-2.webp'), n1: require('../../assets/art/fx/fx-1.webp'), go: require('../../assets/art/fx/fx-go.webp'),
  ko: require('../../assets/art/fx/fx-ko.webp'), safe: require('../../assets/art/fx/fx-safe.webp'), out: require('../../assets/art/fx/fx-out.webp'), perfect: require('../../assets/art/fx/fx-perfect.webp'),
  heart: require('../../assets/art/fx/fx-heart.webp'), heartBroken: require('../../assets/art/fx/fx-heart-broken.webp'),
  fire: require('../../assets/art/fx/fx-fire.webp'), bolt: require('../../assets/art/fx/fx-bolt.webp'), coins: require('../../assets/art/fx/fx-coin-burst.webp'), sparkle: require('../../assets/art/fx/fx-sparkle.webp'),
  round: require('../../assets/art/fx/fx-round.webp'), pencil: require('../../assets/art/fx/fx-pencil-glow.webp'),
};

/** Full-screen 3-2-1-GO. Calls onDone right after GO. */
export function Countdown({ from = 3, onDone }: { from?: number; onDone: () => void }) {
  const [n, setN] = useState(from);
  const done = useRef(false);
  useEffect(() => {
    Haptics.impactAsync(n > 0 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
    if (n < 0) { if (!done.current) { done.current = true; onDone(); } return; }
    const h = setTimeout(() => setN((x) => x - 1), n === 0 ? 650 : 800);
    return () => clearTimeout(h);
  }, [n, onDone]);
  if (n < 0) return null;
  return (
    <Animated.View exiting={FadeOut.duration(200)} pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <Animated.View key={n} entering={ZoomIn.springify().damping(9).stiffness(220)}>
        <Image source={n === 0 ? FX.go : n === 1 ? FX.n1 : n === 2 ? FX.n2 : FX.n3} style={{ width: n === 0 ? 280 : 220, height: n === 0 ? 280 : 220 }} contentFit="contain" accessibilityLabel={n === 0 ? 'Go' : String(n)} />
      </Animated.View>
    </Animated.View>
  );
}

/** VS intro: left slides in, right slides in, the VS sticker slams down with a shake. ~1.6 s. */
export function VsIntro({ left, right, leftLabel, rightLabel, onDone }: { left: ReactNode; right: ReactNode; leftLabel: string; rightLabel: string; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const lx = useSharedValue(-width), rx = useSharedValue(width), vs = useSharedValue(3.2), vo = useSharedValue(0), shake = useSharedValue(0);
  useEffect(() => {
    lx.value = withSpring(0, { damping: 14, stiffness: 120 });
    rx.value = withSpring(0, { damping: 14, stiffness: 120 });
    vo.value = withDelay(420, withTiming(1, { duration: 120 }));
    vs.value = withDelay(420, withSpring(1, { damping: 7, stiffness: 260 }, () => {
      shake.value = withSequence(withTiming(-10, { duration: 40 }), withTiming(10, { duration: 40 }), withTiming(-6, { duration: 40 }), withTiming(0, { duration: 40 }));
    }));
    const t1 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 480);
    const t2 = setTimeout(onDone, 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [lx, rx, vs, vo, shake, onDone]);
  const L = useAnimatedStyle(() => ({ transform: [{ translateX: lx.value }] }));
  const R = useAnimatedStyle(() => ({ transform: [{ translateX: rx.value }] }));
  const V = useAnimatedStyle(() => ({ opacity: vo.value, transform: [{ scale: vs.value }, { rotate: '-8deg' }] }));
  const S = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  return (
    <Animated.View exiting={FadeOut.duration(250)} style={[{ position: 'absolute', inset: 0, zIndex: 60, backgroundColor: '#05050A', alignItems: 'center', justifyContent: 'center' }, S]}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', backgroundColor: 'rgba(91,108,255,0.22)' }} />
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', backgroundColor: 'rgba(240,70,140,0.2)' }} />
      <View style={{ flexDirection: 'row', width: '100%', maxWidth: 560, justifyContent: 'space-between', paddingHorizontal: 22 }}>
        <Animated.View style={[{ alignItems: 'center', gap: 10 }, L]}>{left}<Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 18 }}>{leftLabel}</Text></Animated.View>
        <Animated.View style={[{ alignItems: 'center', gap: 10 }, R]}>{right}<Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 18 }}>{rightLabel}</Text></Animated.View>
      </View>
      <Animated.View style={[{ position: 'absolute' }, V]}><Image source={ART.vs} style={{ width: 170, height: 170 }} contentFit="contain" /></Animated.View>
    </Animated.View>
  );
}

/** Floating emotes: spawn(src) sends a sticker drifting up and fading. Render {layer} on top. */
export function useFloaters() {
  const [items, setItems] = useState<{ id: number; src: number; x: number }[]>([]);
  const id = useRef(0);
  const spawn = useCallback((src: number) => {
    const k = ++id.current;
    Haptics.selectionAsync();
    setItems((a) => [...a.slice(-8), { id: k, src, x: Math.random() * 120 - 60 }]);
    setTimeout(() => setItems((a) => a.filter((f) => f.id !== k)), 1600);
  }, []);
  const layer = (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 90, height: 1, alignItems: 'center', zIndex: 40 }}>
      {items.map((f) => <Floater key={f.id} src={f.src} x={f.x} />)}
    </View>
  );
  return { spawn, layer };
}
function Floater({ src, x }: { src: number; x: number }) {
  const y = useSharedValue(0), o = useSharedValue(1), s = useSharedValue(0.4), r = useSharedValue(0);
  useEffect(() => {
    s.value = withSpring(1, { damping: 8, stiffness: 200 });
    y.value = withTiming(-300, { duration: 1500, easing: Easing.out(Easing.quad) });
    r.value = withTiming(x > 0 ? 14 : -14, { duration: 1500 });
    o.value = withDelay(900, withTiming(0, { duration: 600 }));
  }, [y, o, s, r, x]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateX: x }, { translateY: y.value }, { scale: s.value }, { rotate: `${r.value}deg` }] }));
  return <Animated.View style={[{ position: 'absolute' }, st]}><Image source={src} style={{ width: 84, height: 84 }} contentFit="contain" /></Animated.View>;
}

/** Counts a number up from 0 over `ms`. */
export function CountUp({ to, ms = 900, format, style }: { to: number; ms?: number; format: (v: number) => string; style?: object }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = Date.now();
    const tick = () => { const k = Math.min(1, (Date.now() - t0) / ms); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <Text style={style}>{format(v)}</Text>;
}

/** Shakes its children whenever `trigger` changes. */
export function Shake({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const x = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    x.value = withSequence(withTiming(-12, { duration: 45 }), withTiming(12, { duration: 45 }), withTiming(-8, { duration: 45 }), withTiming(8, { duration: 45 }), withTiming(0, { duration: 45 }));
  }, [trigger, x]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}

/** Red edge glow that pulses while `on` (close to a knockout). */
export function DangerPulse({ on }: { on: boolean }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = on ? withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.35, { duration: 420 })), -1, true) : withTiming(0, { duration: 300 });
  }, [on, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, borderWidth: 10, borderColor: 'rgba(255,69,58,0.55)', zIndex: 30 }, st]} />;
}

/** Big centred hit marker (SAFE / −1 / KO) that pops and fades. Re-keys on `k`. */
export function Hit({ k, text = '', color = C.ink, src }: { k: number; text?: string; color?: string; src?: number }) {
  if (!k) return null;
  return (
    <Animated.View key={k} pointerEvents="none" entering={ZoomIn.springify().damping(8).stiffness(240)} exiting={FadeOut.duration(250)} style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 45 }}>
      <AutoHide ms={900}>
        {src ? <Image source={src} style={{ width: text ? 150 : 240, height: text ? 150 : 240 }} contentFit="contain" /> : null}
        {text ? <Text style={{ fontFamily: F.bold, fontSize: 64, color, letterSpacing: -2, textShadowColor: color, textShadowRadius: 24, textShadowOffset: { width: 0, height: 0 }, textAlign: 'center' }}>{text}</Text> : null}
      </AutoHide>
    </Animated.View>
  );
}
function AutoHide({ ms, children }: { ms: number; children: ReactNode }) {
  const [show, setShow] = useState(true);
  useEffect(() => { const h = setTimeout(() => setShow(false), ms); return () => clearTimeout(h); }, [ms]);
  return show ? <Animated.View exiting={FadeOut.duration(200)} style={{ alignItems: 'center' }}>{children}</Animated.View> : null;
}

/** Win burst: confetti spins out behind the trophy, the trophy pops and bobs. */
export function WinBurst({ src, size = 190, burst = true }: { src: number; size?: number; burst?: boolean }) {
  const cs = useSharedValue(0.2), cr = useSharedValue(-40), co = useSharedValue(0), ts = useSharedValue(0.3), ty = useSharedValue(0);
  useEffect(() => {
    if (burst) {
      co.value = withTiming(1, { duration: 200 });
      cs.value = withSpring(1, { damping: 9, stiffness: 90 });
      cr.value = withTiming(20, { duration: 1400, easing: Easing.out(Easing.cubic) });
    }
    ts.value = withSpring(1, { damping: 7, stiffness: 170 });
    ty.value = withDelay(700, withRepeat(withSequence(withTiming(-8, { duration: 900 }), withTiming(0, { duration: 900 })), -1, true));
    if (burst) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [cs, cr, co, ts, ty, burst]);
  const Cst = useAnimatedStyle(() => ({ opacity: co.value, transform: [{ scale: cs.value }, { rotate: `${cr.value}deg` }] }));
  const Tst = useAnimatedStyle(() => ({ transform: [{ scale: ts.value }, { translateY: ty.value }] }));
  return (
    <View style={{ width: size * 1.35, height: size * 1.25, alignItems: 'center', justifyContent: 'center' }}>
      {burst ? <Animated.View style={[{ position: 'absolute' }, Cst]}><Image source={FX.coins} style={{ width: size * 1.35, height: size * 1.2, opacity: 0.9 }} contentFit="contain" /></Animated.View> : null}
      {burst ? <Animated.View style={[{ position: 'absolute' }, Cst]}><Image source={ART.confetti} style={{ width: size * 1.3, height: size * 1.25 }} contentFit="contain" /></Animated.View> : null}
      <Animated.View style={Tst}><Image source={src} style={{ width: size, height: size }} contentFit="contain" /></Animated.View>
    </View>
  );
}

/** Gentle idle bob for art. */
export function Bob({ children, amp = 8, ms = 1600, style }: { children: ReactNode; amp?: number; ms?: number; style?: StyleProp<ViewStyle> }) {
  const y = useSharedValue(0);
  useEffect(() => { y.value = withRepeat(withSequence(withTiming(-amp, { duration: ms }), withTiming(0, { duration: ms })), -1, true); }, [y, amp, ms]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}

/** Smoothly animated bar fill (0..1). */
export function Fill({ v, color, height = 16, flip, skew }: { v: number; color: string; height?: number; flip?: boolean; skew?: boolean }) {
  const w = useSharedValue(v);
  useEffect(() => { w.value = withTiming(Math.max(0, Math.min(1, v)), { duration: 450, easing: Easing.out(Easing.cubic) }); }, [v, w]);
  const st = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ flex: 1, height, borderRadius: 5, backgroundColor: C.s2, overflow: 'hidden', flexDirection: flip ? 'row-reverse' : 'row', transform: skew ? [{ skewX: flip ? '14deg' : '-14deg' }] : undefined }}>
      <Animated.View style={[{ height: '100%', backgroundColor: v < 0.25 ? C.down : color }, st]} />
    </View>
  );
}

export const runJS = runOnJS;
export { FadeIn };

/** Clay ribbon with "Round N", pops in for ~1 s whenever `round` changes. */
export function RoundBanner({ round }: { round: number }) {
  if (!round) return null;
  return (
    <Animated.View key={round} pointerEvents="none" entering={ZoomIn.springify().damping(10)} exiting={FadeOut.duration(200)} style={{ position: 'absolute', left: 0, right: 0, top: '16%', alignItems: 'center', zIndex: 44 }}>
      <AutoHide ms={1100}>
        <View style={{ width: 320, height: 120, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={FX.round} style={{ position: 'absolute', width: 320, height: 120 }} contentFit="contain" />
          <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 26, letterSpacing: -0.5, marginTop: -4 }}>Round {round}</Text>
        </View>
      </AutoHide>
    </Animated.View>
  );
}
