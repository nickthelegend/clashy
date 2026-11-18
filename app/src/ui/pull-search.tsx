// Pull down past the top of Home and hold to open search, like a phone's pull-down search. A pill follows the pull
// ("Pull down to search", then "Hold to search") and the drawer opens after a short hold; letting go early cancels.
// iOS reads the scroll view's bounce (a negative offset), touch web reads the finger, and desktop web reads the
// wheel or trackpad scrolling up while the page is already at the top.
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Search } from './icons';
import { Txt } from './kit';
import { C, FONT } from './tokens';

const HOLD_MS = 380;
const web = Platform.OS === 'web';

export function usePullSearch(open: () => void, scroll: { current: unknown }) {
  const [pull, setPull] = useState(0); // 1 = armed
  const pullRef = useRef(0);
  const startY = useRef<number | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const set = (p: number) => {
    const was = pullRef.current;
    pullRef.current = p;
    setPull(p);
    if (p >= 1 && was < 1 && !web) Haptics.selectionAsync().catch(() => {});
    if (p >= 1 && !hold.current && !fired.current) {
      hold.current = setTimeout(() => { hold.current = null; fired.current = true; pullRef.current = 0; setPull(0); open(); }, HOLD_MS);
    }
    if (p < 1 && hold.current) { clearTimeout(hold.current); hold.current = null; }
  };
  const reset = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null; startY.current = null; fired.current = false;
    if (pullRef.current) { pullRef.current = 0; setPull(0); }
  };

  // web: the browser's own events on the scrolling element. A finger pulling down at the top, or (desktop) the wheel
  // or trackpad scrolling up while already at the top; lifting the finger or pausing the wheel lets go.
  const api = useRef({ set, reset });
  api.current = { set, reset };
  useEffect(() => {
    if (!web) return;
    const node = (scroll.current as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;
    let acc = 0;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      if (node.scrollTop > 0 || e.deltaY >= 0) { acc = 0; return; }
      acc += -e.deltaY;
      api.current.set(Math.min(1.4, acc / 260));
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => { acc = 0; api.current.reset(); }, 260);
    };
    const onStart = (e: TouchEvent) => { startY.current = node.scrollTop <= 0 ? e.touches[0]?.pageY ?? null : null; };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = (e.touches[0]?.pageY ?? startY.current) - startY.current;
      if (node.scrollTop > 0 || dy <= 0) { if (pullRef.current) api.current.set(0); return; }
      api.current.set(Math.min(1.4, dy / 130));
    };
    const onEnd = () => api.current.reset();
    node.addEventListener('wheel', onWheel, { passive: true });
    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: true });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
      if (idle) clearTimeout(idle);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Spread on the ScrollView. On web the content also slides down with the pull, like a rubber band. */
  const scrollProps = {
    scrollEventThrottle: 16,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!web) set(e.nativeEvent.contentOffset.y < 0 ? Math.min(1.4, -e.nativeEvent.contentOffset.y / 90) : 0);
    },
    onScrollEndDrag: () => { if (!web) reset(); },
  };
  /** The content's slide on web (iOS bounces on its own). */
  const slide = web ? Math.min(pull, 1.4) * 34 : 0;
  return { pull, slide, scrollProps };
}

/** The pill that follows the pull. */
export function PullSearchHint({ pull, top }: { pull: number; top: number }): ReactNode {
  if (pull <= 0.05) return null;
  const armed = pull >= 1;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: top + 4, left: 0, right: 0, alignItems: 'center', zIndex: 20, opacity: Math.min(1, pull * 1.6), transform: [{ translateY: Math.min(pull, 1) * 14 }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: armed ? C.brand : C.s2 }}>
        <Search size={15} color={armed ? C.onBrand : C.ink} />
        <Txt v="small" color={armed ? C.onBrand : C.ink} style={{ ...FONT.semi, fontSize: 13 }}>{armed ? 'Hold to search' : 'Pull down to search'}</Txt>
      </View>
    </View>
  );
}
