// What a tour can light up, and the scroll views it can scroll. A TourTarget is a plain View (give it the style the
// wrapped thing needs from its row, e.g. flex: 1); it adds nothing visible.
import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { registerTarget, type Scroller } from './store';

const ScrollCtx = createContext<Scroller | null>(null);
/** Wrap a scroll view's content so the targets inside it can be scrolled into view. */
export const TourScroll = ScrollCtx.Provider;

export function TourTarget({ id, style, children }: { id: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const scroller = useContext(ScrollCtx);
  useEffect(() => registerTarget(id, { ref: ref as unknown as { current: null }, scroller }), [id, scroller]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

type ScrollLike = { scrollTo: (o: { y: number; animated?: boolean }) => void };
/** A scroll view's handle for the tour: spread `onScroll` on it (or call it from yours) and pass `scroller` to TourScroll. */
export function useTourScroll<T>(ref?: RefObject<T | null>) {
  const own = useRef<T>(null);
  const r = ref ?? own;
  const y = useRef(0);
  const scroller = useMemo<Scroller>(() => ({
    by: (dy) => { (r.current as unknown as ScrollLike | null)?.scrollTo({ y: Math.max(0, y.current + dy), animated: true }); },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { y.current = e.nativeEvent.contentOffset.y; };
  return { ref: r, onScroll, scroller, scrollEventThrottle: 16 };
}
