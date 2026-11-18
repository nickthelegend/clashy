// Bottom drawers: everything that is a quick action (your call, a clash, a save, joining a squad, the on-chain
// proof) slides up from the bottom over a dimmed backdrop, with a grab handle; tap outside or swipe down to close.
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './kit';
import { C, FONT } from './tokens';

export function Sheet({ open, onClose, title, sub, children, height }: { open: boolean; onClose: () => void; title?: string; /** A grey line under the title. */ sub?: string; children: ReactNode; height?: number }) {
  const insets = useSafeAreaInsets();
  const { height: H, width: W } = useWindowDimensions();
  const y = useSharedValue(H);
  const dim = useSharedValue(0);
  useEffect(() => {
    if (open) {
      y.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.9 });
      dim.value = withTiming(1, { duration: 220 });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    dim.value = withTiming(0, { duration: 180 });
    y.value = withTiming(H, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(onClose)(); });
  };
  const pan = Gesture.Pan()
    .onChange((e) => { y.value = Math.max(0, y.value + e.changeY); })
    .onEnd((e) => {
      if (y.value > 120 || e.velocityY > 900) runOnJS(close)();
      else y.value = withSpring(0, { damping: 22, stiffness: 220 });
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backStyle = useAnimatedStyle(() => ({ opacity: dim.value * 0.66 }));
  const maxW = Math.min(W, 560);
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: C.bg }, backStyle]}>
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }} pointerEvents="box-none">
          <Animated.View style={[{ width: maxW, maxHeight: height ?? H * 0.88, backgroundColor: C.s1, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 14 }, sheetStyle]}>
            <GestureDetector gesture={pan}>
              <View style={{ paddingTop: 8, paddingBottom: title ? 8 : 12, paddingHorizontal: 18 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.s2, alignSelf: 'center' }} />
                {title ? <Txt v="title" style={{ marginTop: 14 }}>{title}</Txt> : null}
                {sub ? <Txt v="small" style={{ marginTop: 3, lineHeight: 18 }}>{sub}</Txt> : null}
              </View>
            </GestureDetector>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 6 }} keyboardShouldPersistTaps="handled" bounces={false}>
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** A row in a drawer menu, like Play's game rows: an icon or logo in a 44 px circle, a title over one line, and a
 *  chevron or a live note on the right. Rows rise in one after another (pass each its index). `bare` drops the circle
 *  behind art that is already round (a logo, Clashy Bot). `accent` is kept for callers and no longer tints anything. */
export function SheetTile({ art, title, line, onPress, meta, index = 0, bare }: {
  art: ReactNode; title: string; line: string; onPress: () => void; accent?: string; /** A live note on the right ("3 waiting"). */ meta?: string; index?: number; bare?: boolean;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(40 + index * 35).duration(300)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: bare ? 'transparent' : C.s2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{art}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1}>{title}</Txt>
          <Txt v="small" lines={2} style={{ marginTop: 1, lineHeight: 17 }}>{line}</Txt>
        </View>
        {meta ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.up }} />
            <Txt v="small" color={C.ink} style={{ fontSize: 12.5 }}>{meta}</Txt>
          </View>
        ) : <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>}
      </Pressable>
    </Animated.View>
  );
}

/** A small grey section label inside a drawer. */
export function SheetLabel({ children, index = 0 }: { children: string; index?: number }) {
  return (
    <Animated.View entering={FadeIn.delay(30 + index * 35).duration(300)}>
      <Txt v="small" style={{ ...FONT.semi, fontSize: 12.5, color: C.dim, marginTop: 14, marginBottom: 2 }}>{children}</Txt>
    </Animated.View>
  );
}
