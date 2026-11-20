// The guided tour (Nov 20, restyled after XORR's walkthrough). The screen dims, one thing at a time is cut out of the
// dim with a lavender ring, and a white card beside it says what it is: a short title and one line on what to do. Next
// (or a tap on the lit thing) moves on, switching tabs when the next thing lives elsewhere; Back goes back; Skip ends
// it. The welcome and the finale are the same white card in the middle of the screen. On a keyboard: → / ← / Esc.
//
// The lit area is measured where the thing is now (screens rise in, lists load), scrolled into view when it's below
// the fold, and a step whose thing isn't on screen at all is passed over. Nothing loops; under reduced motion the
// light jumps instead of gliding.
import * as Haptics from 'expo-haptics';
import { router, usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/ui/layout';
import { C, FONT } from '@/ui/tokens';
import { TOURS, type TourStep } from './steps';
import { endTour, gotoStep, hasTarget, markSeen, measureTarget, useTourState, type TourRect } from './store';

const TAB_ROUTES = ['/', '/chats', '/arena', '/clans', '/profile'];
/** Room around the lit thing, so the ring doesn't sit on its edge. */
const PAD = 6;
const GAP = 14;
const CARET = 12;
const DIM = 'rgba(0,0,0,0.74)';
/** The card: XORR's white walkthrough card with black ink. */
const CARD = '#F7F7F8';
const INK = '#0B0B0B';
const glideMs = 320;

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
  const cardIn = useSharedValue(0);
  const shake = useSharedValue(0);

  const finish = useCallback((to?: string) => {
    void markSeen(id);
    endTour();
    if (id === 'main' && pathname !== '/') router.navigate('/' as Href);
    if (to) router.push(to as Href);
  }, [id, pathname]);

  const go = useCallback((d: 1 | -1) => {
    dir.current = d;
    Haptics.selectionAsync();
    if (d > 0) { if (last) finish(s.ctaTo); else gotoStep(step + 1); }
    else if (step > 0) gotoStep(step - 1);
  }, [last, step, finish, s.ctaTo]);

  // The layer fades in once.
  useEffect(() => {
    shown.value = withTiming(1, { duration: reduced ? 0 : 220 });
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
    if (center) {
      setLit(null);
      hx.value = withTiming(W / 2, ease); hy.value = withTiming(H / 2, ease); hw.value = withTiming(0, ease); hh.value = withTiming(0, ease); hr.value = withTiming(0, ease);
      cardIn.value = withDelay(reduced ? 0 : 120, withTiming(1, { duration: reduced ? 0 : 260, easing: Easing.out(Easing.cubic) }));
      setLive(true);
      AccessibilityInfo.announceForAccessibility(`${s.title} ${s.body}`);
      return;
    }
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
      cardIn.value = withDelay(reduced ? 0 : 100, withTiming(1, { duration: reduced ? 0 : 260, easing: Easing.out(Easing.cubic) }));
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
    borderRadius: hr.value + B, borderWidth: B, opacity: shown.value,
  }));
  const ring = useAnimatedStyle(() => ({ left: hx.value, top: hy.value, width: hw.value, height: hh.value, borderRadius: hr.value, opacity: hw.value > 1 ? 1 : 0 }));
  // a second, fainter ring just outside the first (XORR's glow)
  const glow = useAnimatedStyle(() => ({ left: hx.value - 6, top: hy.value - 6, width: hw.value + 12, height: hh.value + 12, borderRadius: hr.value + 6, opacity: hw.value > 1 ? 0.4 : 0 }));
  const tap = useAnimatedStyle(() => ({ left: hx.value, top: hy.value, width: hw.value, height: hh.value, borderRadius: hr.value }));
  const below = !lit || lit.rect.y + lit.rect.height / 2 < H / 2;
  const cardSt = useAnimatedStyle(() => ({ opacity: cardIn.value, transform: [{ translateX: shake.value }, { translateY: (1 - cardIn.value) * (center ? 10 : below ? 8 : -8) }] }));
  const nudge = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    shake.value = withSequence(withTiming(-7, { duration: 45 }), withTiming(7, { duration: 70 }), withTiming(-4, { duration: 60 }), withTiming(0, { duration: 50 }));
  };

  // Where the card goes: beside a sidebar item on desktop, else under the thing, over it, or pinned to the bottom.
  const CW = Math.min(W - 32, desk ? 380 : 440);
  const h = cardH || 170;
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
    if (place === 'below' || place === 'above') caret = Math.min(Math.max(r.x + r.width / 2 - left - CARET / 2, 22), CW - 22 - CARET);
  }

  const mainTour = id === 'main';
  const realSteps = steps.filter((x) => x.target).length;
  const realIndex = steps.slice(0, step + 1).filter((x) => x.target).length;
  const lastSpot = !steps.slice(step + 1).some((x) => x.target);
  const backOk = step > 0 && !!steps[step - 1]?.target;
  const nextLabel = lastSpot && !mainTour ? 'Got it' : 'Next';

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000, overflow: 'hidden' }]} accessibilityViewIsModal>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderColor: DIM }, dim]} />
      {/* a tap anywhere else nudges the card; a tap on the lit thing moves on */}
      <Pressable style={StyleSheet.absoluteFill} onPress={center ? undefined : nudge} accessible={false} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 2, borderColor: 'rgba(171,159,242,0.5)' }, glow]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 2, borderColor: C.brand }, ring]} />
      {lit && !center ? (
        <Animated.View style={[{ position: 'absolute', overflow: 'hidden' }, tap]}>
          <Pressable style={{ flex: 1 }} onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Next" />
        </Animated.View>
      ) : null}

      {center ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 16 }]} pointerEvents="box-none">
          <Animated.View style={[styles.card, { width: CW, paddingTop: 18 }, cardSt]}>
            <Text style={styles.kicker}>{last ? 'All set' : mainTour ? 'Quick tour' : 'Quick tip'}</Text>
            <Text style={[styles.title, { fontSize: 24, lineHeight: 30, marginTop: 6 }]}>{s.title}</Text>
            <Text style={[styles.body, { marginTop: 6 }]}>{s.body}</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => finish()} accessibilityRole="button" accessibilityLabel={s.skip ?? 'Skip'} style={styles.ghost}>
                <Text style={styles.ghostText}>{s.skip ?? 'Skip'}</Text>
              </Pressable>
              <Pressable onPress={() => (last ? finish(s.ctaTo) : go(1))} accessibilityRole="button" accessibilityLabel={s.cta ?? 'Next'}
                style={({ pressed }) => [styles.primary, last ? { backgroundColor: C.brand } : null, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <Text style={[styles.primaryText, last ? { color: C.onBrand } : null]}>{s.cta ?? 'Next'}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : lit ? (
        <Animated.View onLayout={(e) => setCardH(Math.round(e.nativeEvent.layout.height))} pointerEvents={live ? 'auto' : 'none'}
          style={[styles.card, { position: 'absolute', left, top, width: CW, opacity: cardH ? 1 : 0 }, cardSt]}>
          {place === 'inside' ? null : (
            <View style={[{ position: 'absolute', width: CARET, height: CARET, borderRadius: 2, backgroundColor: CARD, transform: [{ rotate: '45deg' }] },
              place === 'below' ? { top: -CARET / 2 + 1, left: caret } : place === 'above' ? { bottom: -CARET / 2 + 1, left: caret } : { left: -CARET / 2 + 1, top: caret }]} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.count, { flex: 1 }]}>{realSteps > 1 ? `${realIndex} of ${realSteps}` : 'Tip'}</Text>
            {lastSpot && !mainTour ? null : (
              <Pressable onPress={() => finish()} accessibilityRole="button" accessibilityLabel="Skip the tour" hitSlop={10} style={{ minHeight: 24, justifyContent: 'center', paddingLeft: 12 }}>
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
            )}
          </View>
          <Text style={[styles.title, { marginTop: 6 }]}>{lit.title}</Text>
          <Text style={[styles.body, { marginTop: 4 }]}>{lit.body}</Text>
          <View style={styles.actions}>
            {backOk ? (
              <Pressable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Back" style={styles.ghost}>
                <Text style={styles.ghostText}>Back</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => go(1)} accessibilityRole="button" accessibilityLabel={nextLabel}
              style={({ pressed }) => [styles.primary, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
              <Text style={styles.primaryText}>{nextLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: CARD, borderRadius: 22, padding: 16, paddingTop: 14, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  kicker: { ...FONT.semi, fontSize: 13, color: 'rgba(11,11,11,0.5)' },
  count: { ...FONT.medium, fontSize: 13, color: 'rgba(11,11,11,0.5)', fontVariant: ['tabular-nums'] },
  skip: { ...FONT.medium, fontSize: 13.5, color: 'rgba(11,11,11,0.6)' },
  title: { ...FONT.bold, fontSize: 18, lineHeight: 23, letterSpacing: -0.3, color: INK },
  body: { ...FONT.regular, fontSize: 15, lineHeight: 21, color: 'rgba(11,11,11,0.64)' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 14 },
  ghost: { height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  ghostText: { ...FONT.semi, fontSize: 16, color: 'rgba(11,11,11,0.7)' },
  primary: { height: 44, minWidth: 104, paddingHorizontal: 20, borderRadius: 22, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...FONT.semi, fontSize: 16, color: '#fff' },
});
