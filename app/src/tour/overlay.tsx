// The guided tour (Nov 20). The screen dims, one thing at a time is cut out of the dim with a lavender ring that
// breathes, and Clashy Bot's card beside it says what it is: a slogan and one line on what to do. Next (or a tap on
// the lit thing) moves on, switching tabs when the next thing lives elsewhere; Back goes back; Skip ends it. The
// welcome and the finale are full-screen cards over a blur. On a keyboard: → / ← / Esc.
//
// The lit area is measured where the thing is now (screens rise in, lists load), scrolled into view when it's below
// the fold, and a step whose thing isn't on screen at all is passed over. Under reduced motion nothing glides or loops.
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/ui/layout';
import { Lottie } from '@/ui/lottie';
import { C, FONT } from '@/ui/tokens';
import { CHAPTERS, TOURS, type TourStep } from './steps';
import { endTour, gotoStep, hasTarget, markSeen, measureTarget, useTourState, type TourRect } from './store';

const BOT = require('../../assets/art/avatar-bot.webp');
const TAB_ROUTES = ['/', '/chats', '/arena', '/clans', '/profile'];
/** Room around the lit thing, so the ring doesn't sit on its edge. */
const PAD = 6;
const GAP = 14;
const CARET = 14;
const DIM = 'rgba(3,2,8,0.8)';
const CARD_TOP = '#1C1730';
const CARD_BOTTOM = '#110F18';
const glideMs = 360;

export function TourOverlay() {
  const { tour } = useTourState();
  if (!tour || !TOURS[tour]) return null;
  return <Layer key={tour} id={tour} />;
}

type Lit = { rect: TourRect; title: string; body: string };

function Layer({ id }: { id: string }) {
  const steps = TOURS[id]!;
  const { step } = useTourState();
  const s: TourStep = steps[Math.min(step, steps.length - 1)]!;
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { desk } = useLayout();
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const center = !s.target;
  const onRoute = !s.route || pathname === s.route;
  const last = step === steps.length - 1;
  const [lit, setLit] = useState<Lit | null>(null);
  const [cardH, setCardH] = useState(0);
  /** The card answers taps only once its step is lit (while the next thing is being found it's fading out). */
  const [live, setLive] = useState(false);
  const dir = useRef<1 | -1>(1);

  const hx = useSharedValue(W / 2), hy = useSharedValue(H / 2), hw = useSharedValue(0), hh = useSharedValue(0), hr = useSharedValue(0);
  const shown = useSharedValue(0);
  const blur = useSharedValue(0);
  const cardIn = useSharedValue(0);
  const shake = useSharedValue(0);
  const pulse = useSharedValue(0);
  const hop = useSharedValue(1);
  const bob = useSharedValue(0);

  const finish = useCallback((to?: string) => {
    void markSeen(id);
    endTour();
    if (id === 'main' && pathname !== '/') router.navigate('/' as Href);
    if (to) router.push(to as Href);
  }, [id, pathname]);

  const go = useCallback((d: 1 | -1) => {
    dir.current = d;
    Haptics.selectionAsync();
    if (d > 0) { if (last) finish(); else gotoStep(step + 1); }
    else if (step > 0) gotoStep(step - 1);
  }, [last, step, finish]);

  // The layer fades in once; the ring breathes and the bot bobs while it's up.
  useEffect(() => {
    shown.value = withTiming(1, { duration: reduced ? 0 : 240 });
    if (reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }), -1, false);
    bob.value = withRepeat(withSequence(withTiming(-3, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1, false);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // A main-tour step runs on its tab: go there first (closing anything pushed over the tabs).
  useEffect(() => {
    if (!s.route || pathname === s.route) return;
    if (router.canDismiss()) router.dismissAll();
    router.navigate(s.route as Href);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find the step's thing once it has stopped moving, scroll it into view if it's below the fold, then light it.
  useEffect(() => {
    const ease = { duration: reduced ? 0 : glideMs, easing: Easing.out(Easing.cubic) };
    cardIn.value = 0;
    setLive(false);
    hop.value = withSequence(withTiming(0.84, { duration: reduced ? 0 : 90 }), withSpring(1, { damping: 8, stiffness: 260 }));
    if (center) {
      setLit(null);
      hx.value = withTiming(W / 2, ease); hy.value = withTiming(H / 2, ease); hw.value = withTiming(0, ease); hh.value = withTiming(0, ease); hr.value = withTiming(0, ease);
      blur.value = withTiming(1, { duration: reduced ? 0 : 300 });
      cardIn.value = withDelay(reduced ? 0 : 140, withTiming(1, { duration: reduced ? 0 : 320, easing: Easing.out(Easing.back(1.4)) }));
      setLive(true);
      AccessibilityInfo.announceForAccessibility(`${s.title} ${s.body}`);
      return;
    }
    blur.value = withTiming(0, { duration: reduced ? 0 : 220 });
    if (!onRoute) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    let prev: TourRect | null = null;
    let scrolls = 0;
    const wants = [{ target: s.target!, title: s.title, body: s.body }, ...(s.alts ?? [])];
    const tabBar = !desk && TAB_ROUTES.includes(pathname) ? 59 + Math.max(insets.bottom, 10) : Math.max(insets.bottom, 4);
    const passOver = () => {
      if (dir.current > 0) { if (last) finish(); else gotoStep(step + 1); }
      else if (step > 0) gotoStep(step - 1); else gotoStep(step + 1);
    };
    const light = (r: TourRect, w: { title: string; body: string }, isTab: boolean) => {
      const top = insets.top + 4, bottom = isTab ? H : H - tabBar;
      const y0 = Math.max(r.y, top), y1 = Math.min(r.y + r.height, bottom);
      if (y1 - y0 < Math.min(36, r.height * 0.5)) return passOver();
      const rect = { x: r.x - PAD, y: y0 - PAD, width: r.width + PAD * 2, height: y1 - y0 + PAD * 2 };
      const rad = Math.min((s.radius ?? 18) + PAD, rect.width / 2, rect.height / 2);
      hx.value = withTiming(rect.x, ease); hy.value = withTiming(rect.y, ease); hw.value = withTiming(rect.width, ease); hh.value = withTiming(rect.height, ease); hr.value = withTiming(rad, ease);
      setLit({ rect, title: w.title, body: w.body });
      setLive(true);
      cardIn.value = withDelay(reduced ? 0 : 120, withTiming(1, { duration: reduced ? 0 : 280, easing: Easing.out(Easing.cubic) }));
      AccessibilityInfo.announceForAccessibility(`${w.title} ${w.body}`);
    };
    const tick = async () => {
      let found: { rect: TourRect; scroller: { by: (dy: number) => void } | null; w: (typeof wants)[number] } | null = null;
      for (const w of wants) {
        const m = await measureTarget(w.target);
        if (m) { found = { ...m, w }; break; }
      }
      if (!alive) return;
      if (!found) {
        prev = null;
        // not on this screen at all (e.g. no live clashes right now): move on quickly; mounted but not laid out yet: wait
        const mounted = wants.some((w) => hasTarget(w.target));
        if (Date.now() - started > (mounted ? 2600 : 650)) return passOver();
        timer = setTimeout(() => void tick(), 150);
        return;
      }
      const r = found.rect;
      const isTab = found.w.target.startsWith('tab-');
      const top = insets.top + 4, bottom = isTab ? H : H - tabBar;
      if ((r.y < top || r.y + r.height > bottom) && found.scroller && scrolls < 3) {
        scrolls += 1;
        prev = null;
        found.scroller.by(r.y - (top + 64));
        timer = setTimeout(() => void tick(), reduced ? 120 : 460);
        return;
      }
      const settled = prev && Math.abs(r.x - prev.x) < 1 && Math.abs(r.y - prev.y) < 1 && Math.abs(r.height - prev.height) < 1 && Math.abs(r.width - prev.width) < 1;
      if (settled || Date.now() - started > 3200) return light(r, found.w, isTab);
      prev = r;
      timer = setTimeout(() => void tick(), 120);
    };
    timer = setTimeout(() => void tick(), 90);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [step, onRoute, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard on web: → next, ← back, Esc skips.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, finish]);

  // The dim is one huge rounded border around the hole: the hole keeps the thing's corner radius on every platform.
  const B = Math.ceil(Math.max(W, H) * 2);
  const dim = useAnimatedStyle(() => ({
    left: hx.value - B, top: hy.value - B, width: hw.value + B * 2, height: hh.value + B * 2,
    borderRadius: hr.value + B, borderWidth: B, opacity: shown.value * (1 - blur.value * 0.25),
  }));
  const ring = useAnimatedStyle(() => ({ left: hx.value, top: hy.value, width: hw.value, height: hh.value, borderRadius: hr.value, opacity: hw.value > 1 ? 1 : 0 }));
  const halo = useAnimatedStyle(() => {
    const g = pulse.value * 12;
    return { left: hx.value - g, top: hy.value - g, width: hw.value + g * 2, height: hh.value + g * 2, borderRadius: hr.value + g, opacity: hw.value > 1 ? (1 - pulse.value) * 0.7 : 0 };
  });
  const tap = useAnimatedStyle(() => ({ left: hx.value, top: hy.value, width: hw.value, height: hh.value, borderRadius: hr.value }));
  const blurSt = useAnimatedStyle(() => ({ opacity: blur.value }));
  const cardSt = useAnimatedStyle(() => ({ opacity: cardIn.value, transform: [{ translateX: shake.value }, { translateY: (1 - cardIn.value) * 10 }, { scale: 0.96 + cardIn.value * 0.04 }] }));
  const botSt = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }, { scale: hop.value }] }));
  const nudge = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    shake.value = withSequence(withTiming(-7, { duration: 45 }), withTiming(7, { duration: 70 }), withTiming(-4, { duration: 60 }), withTiming(0, { duration: 50 }));
  };

  // Where the card goes: beside a sidebar item on desktop, else under the thing, over it, or pinned to the bottom.
  const CW = Math.min(W - 32, desk ? 380 : 420);
  const h = cardH || 190;
  let place: 'below' | 'above' | 'right' | 'inside' = 'below';
  let left = (W - CW) / 2, top = 0, caret = 0;
  if (lit) {
    const r = lit.rect;
    const floor = H - Math.max(insets.bottom, 12);
    left = Math.min(Math.max(r.x + r.width / 2 - CW / 2, 16), W - CW - 16);
    if (desk && r.x + r.width < 320 && r.x + r.width + GAP + CW < W - 16) {
      place = 'right'; left = r.x + r.width + GAP; top = Math.min(Math.max(r.y + r.height / 2 - h / 2, 16), H - h - 16);
      caret = Math.min(Math.max(r.y + r.height / 2 - top - CARET / 2, 20), h - 20 - CARET);
    } else if (r.y + r.height + GAP + h <= floor) { place = 'below'; top = r.y + r.height + GAP; }
    else if (r.y - GAP - h >= insets.top + 8) { place = 'above'; top = r.y - GAP - h; }
    else { place = 'inside'; top = floor - h - 10; }
    if (place === 'below' || place === 'above') caret = Math.min(Math.max(r.x + r.width / 2 - left - CARET / 2, 24), CW - 24 - CARET);
  }

  const mainTour = id === 'main';
  const body = useTypewriter(lit?.body ?? s.body, `${id}:${step}:${lit?.title ?? ''}`, reduced);
  const realSteps = steps.filter((x) => x.target).length;
  const realIndex = steps.slice(0, step + 1).filter((x) => x.target).length;
  const chapter = s.chapter ? CHAPTERS.indexOf(s.chapter as (typeof CHAPTERS)[number]) : -1;
  const lastSpot = !steps.slice(step + 1).some((x) => x.target);

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000, overflow: 'hidden' }]} accessibilityViewIsModal>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderColor: DIM }, dim]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurSt]}>
        <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3,2,8,0.45)' }]} />
      </Animated.View>
      {/* a tap anywhere else nudges the card; a tap on the lit thing moves on */}
      <Pressable style={StyleSheet.absoluteFill} onPress={center ? undefined : nudge} accessible={false} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 2, borderColor: C.brand }, halo]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 2.5, borderColor: C.brand, shadowColor: C.brand, shadowOpacity: 0.9, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } }, ring]} />
      {lit && !center ? (
        <Animated.View style={[{ position: 'absolute', overflow: 'hidden' }, tap]}>
          <Pressable style={{ flex: 1 }} onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Next" />
        </Animated.View>
      ) : null}

      {center ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 16 }]} pointerEvents="box-none">
          <Animated.View style={[{ width: CW, alignItems: 'center' }, cardSt]}>
            <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
              {last && !reduced ? <Lottie name="confetti" size={340} style={{ position: 'absolute', left: -95, top: -110 }} /> : null}
              <View style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: C.brand, opacity: 0.18 }} />
              <Animated.View style={botSt}><Image source={BOT} style={{ width: 128, height: 128 }} contentFit="contain" accessibilityLabel="Clashy Bot" /></Animated.View>
            </View>
            <Text style={{ ...FONT.bold, fontSize: 12, letterSpacing: 1.6, color: C.brandSoft, marginTop: 18 }}>{last ? 'TOUR COMPLETE' : mainTour ? 'CLASHY · QUICK TOUR' : 'QUICK TIP'}</Text>
            <Text style={{ ...FONT.bold, fontSize: 32, letterSpacing: -1, lineHeight: 38, color: '#fff', textAlign: 'center', marginTop: 8 }}>{s.title}</Text>
            <View style={{ marginTop: 10, maxWidth: 330 }}>
              <Text style={{ ...FONT.regular, fontSize: 16, lineHeight: 23, color: 'transparent', textAlign: 'center' }} aria-hidden>{s.body}</Text>
              <Text style={{ ...FONT.regular, fontSize: 16, lineHeight: 23, color: '#C7C2D6', textAlign: 'center', position: 'absolute', left: 0, right: 0, top: 0 }}>{body}</Text>
            </View>
            <Pressable onPress={() => (last ? finish(s.ctaTo) : go(1))} accessibilityRole="button" accessibilityLabel={s.cta ?? 'Next'}
              style={({ pressed }) => ({ marginTop: 26, alignSelf: 'stretch', height: 58, borderRadius: 29, backgroundColor: last ? C.opp : C.brand, alignItems: 'center', justifyContent: 'center', shadowColor: last ? C.opp : C.brand, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <Text style={{ ...FONT.bold, fontSize: 18, color: last ? '#fff' : C.onBrand }}>{s.cta ?? 'Next'}</Text>
            </Pressable>
            <Pressable onPress={() => finish()} accessibilityRole="button" accessibilityLabel={s.skip ?? 'Skip'} hitSlop={8} style={{ marginTop: 10, height: 44, paddingHorizontal: 16, justifyContent: 'center' }}>
              <Text style={{ ...FONT.semi, fontSize: 15, color: C.muted }}>{s.skip ?? 'Skip'}</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : lit ? (
        <Animated.View onLayout={(e) => setCardH(Math.round(e.nativeEvent.layout.height))} pointerEvents={live ? 'auto' : 'none'}
          style={[{ position: 'absolute', left, top, width: CW, opacity: cardH ? 1 : 0, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 12 } }, cardSt]}>
          {place === 'inside' ? null : (
            <View style={[{ position: 'absolute', width: CARET, height: CARET, borderRadius: 3, transform: [{ rotate: '45deg' }] },
              place === 'below' ? { top: -CARET / 2 + 1, left: caret, backgroundColor: CARD_TOP } : place === 'above' ? { bottom: -CARET / 2 + 1, left: caret, backgroundColor: CARD_BOTTOM } : { left: -CARET / 2 + 1, top: caret, backgroundColor: CARD_TOP }]} />
          )}
          <LinearGradient colors={[CARD_TOP, CARD_BOTTOM]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={{ borderRadius: 24, padding: 14, paddingTop: 13, borderWidth: 1, borderColor: 'rgba(171,159,242,0.3)' }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Animated.View style={[{ width: 50, height: 50 }, botSt]}><Image source={BOT} style={{ width: 50, height: 50 }} contentFit="contain" accessibilityLabel="Clashy Bot" /></Animated.View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 }}>
                  <Text style={{ ...FONT.bold, fontSize: 11.5, letterSpacing: 1.3, color: C.brandSoft }}>{chapter >= 0 ? CHAPTERS[chapter]!.toUpperCase() : 'TIP'}</Text>
                  {chapter >= 0 ? (
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {CHAPTERS.map((c, i) => <View key={c} style={{ width: i === chapter ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i < chapter ? 'rgba(171,159,242,0.55)' : i === chapter ? C.brand : '#2E2A3B' }} />)}
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => finish()} accessibilityRole="button" accessibilityLabel="Skip the tour" hitSlop={10} style={{ height: 24, justifyContent: 'center', paddingLeft: 8 }}>
                    <Text style={{ ...FONT.semi, fontSize: 13, color: C.muted }}>Skip</Text>
                  </Pressable>
                </View>
                <Text style={{ ...FONT.bold, fontSize: 21, letterSpacing: -0.5, lineHeight: 26, color: '#fff', marginTop: 4 }}>{lit.title}</Text>
                <View style={{ marginTop: 4 }}>
                  {/* the full line holds the card's height while the typed one fills in over it */}
                  <Text style={{ ...FONT.regular, fontSize: 14.5, lineHeight: 20, color: 'transparent' }} aria-hidden>{lit.body}</Text>
                  <Text style={{ ...FONT.regular, fontSize: 14.5, lineHeight: 20, color: '#BEB9CC', position: 'absolute', left: 0, right: 0, top: 0 }}>{body}</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
              <Text style={{ ...FONT.semi, fontSize: 12.5, color: C.dim, fontVariant: ['tabular-nums'], flex: 1 }}>{realIndex} / {realSteps}</Text>
              {step > 0 && !(steps[step - 1] && !steps[step - 1]!.target) ? (
                <Pressable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', backgroundColor: pressed ? '#24203A' : 'transparent' })}>
                  <Text style={{ ...FONT.semi, fontSize: 15, color: '#D5D0E6' }}>Back</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => go(1)} accessibilityRole="button" accessibilityLabel={lastSpot && !mainTour ? 'Got it' : 'Next'}
                style={({ pressed }) => ({ height: 40, minWidth: 96, paddingHorizontal: 18, borderRadius: 20, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                <Text style={{ ...FONT.bold, fontSize: 15, color: C.onBrand }}>{lastSpot && !mainTour ? 'Got it' : 'Next  ›'}</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The bot "says" its line: the words type in quickly (all at once under reduced motion). */
function useTypewriter(text: string, key: string, reduced: boolean) {
  const chars = Array.from(text);
  const [n, setN] = useState(reduced ? chars.length : 0);
  useEffect(() => {
    if (reduced) { setN(chars.length); return; }
    setN(0);
    const per = Math.max(1, Math.ceil(chars.length / 26));
    const t = setInterval(() => setN((x) => { if (x + per >= chars.length) { clearInterval(t); return chars.length; } return x + per; }), 16);
    return () => clearInterval(t);
  }, [key, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return chars.slice(0, n).join('');
}
