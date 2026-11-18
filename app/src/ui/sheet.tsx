// Bottom drawers: everything that is a quick action (your call, a clash, a save, joining a squad, the on-chain
// proof) slides up from the bottom over a dimmed backdrop, with a grab handle; tap outside or swipe down to close.
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './kit';
import { C, F, FONT } from './tokens';

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
        <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: '#000' }, backStyle]}>
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }} pointerEvents="box-none">
          <Animated.View style={[{ width: maxW, maxHeight: height ?? H * 0.88, backgroundColor: '#141418', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: insets.bottom + 14, borderWidth: 1, borderBottomWidth: 0, borderColor: '#24242B' }, sheetStyle]}>
            <GestureDetector gesture={pan}>
              <View style={{ paddingTop: 10, paddingBottom: title ? 10 : 12, paddingHorizontal: 20 }}>
                <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: '#3A3A44', alignSelf: 'center' }} />
                {title ? <Txt v="title" style={{ fontSize: 28, lineHeight: 33, marginTop: 14 }}>{title}</Txt> : null}
                {sub ? <Txt v="small" style={{ fontSize: 15, marginTop: 4, lineHeight: 20 }}>{sub}</Txt> : null}
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

/** A big tile for a drawer menu: clay art, title, one line. */
/** A row in a drawer menu: art on a soft tint, a title and one line, an optional live note, on a hairline; rows rise
 *  in one after another (pass each its index). */
export function SheetTile({ art, title, line, onPress, accent = C.brand, meta, index = 0 }: {
  art: ReactNode; title: string; line: string; onPress: () => void; accent?: string; /** A live note on the right ("3 waiting"). */ meta?: string; index?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(70 + index * 55).duration(360).springify().damping(17)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 18, marginHorizontal: -18, borderRadius: 18, backgroundColor: pressed ? '#1A1A20' : 'transparent', transform: [{ scale: pressed ? 0.985 : 1 }] })}>
        <View style={{ width: 56, height: 56, borderRadius: 17, backgroundColor: accent + '1C', alignItems: 'center', justifyContent: 'center' }}>{art}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1} style={{ fontSize: 17 }}>{title}</Txt>
          <Txt v="small" lines={2} style={{ marginTop: 2, lineHeight: 18 }}>{line}</Txt>
        </View>
        {meta ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
            <Txt v="small" color={C.ink} style={{ fontSize: 12.5 }}>{meta}</Txt>
          </View>
        ) : <Txt v="label" color={C.dim} style={{ fontSize: 20 }}>›</Txt>}
      </Pressable>
    </Animated.View>
  );
}

/** A small grey section label inside a drawer. */
export function SheetLabel({ children, index = 0 }: { children: string; index?: number }) {
  return (
    <Animated.View entering={FadeIn.delay(40 + index * 55).duration(300)}>
      <Txt v="small" style={{ ...FONT.semi, fontSize: 12.5, color: C.dim, letterSpacing: 0.3, marginTop: 14, marginBottom: 4 }}>{children}</Txt>
    </Animated.View>
  );
}
