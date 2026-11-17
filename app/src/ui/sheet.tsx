// Bottom drawers: everything that is a quick action (your call, a clash, a save, joining a squad, the on-chain
// proof) slides up from the bottom over a dimmed backdrop, with a grab handle; tap outside or swipe down to close.
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './kit';
import { C, F } from './tokens';

export function Sheet({ open, onClose, title, children, height }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; height?: number }) {
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
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: title ? 6 : 12 }}>
                <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#3A3A44' }} />
                {title ? <Txt v="title" style={{ fontFamily: F.display, fontSize: 24, marginTop: 12, letterSpacing: -0.3 }}>{title}</Txt> : null}
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
export function SheetTile({ art, title, line, onPress, accent = C.brand }: { art: ReactNode; title: string; line: string; onPress: () => void; accent?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: pressed ? '#22222A' : '#1B1B21', marginBottom: 10, borderWidth: 1, borderColor: '#26262E' })}>
      <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>{art}</View>
      <View style={{ flex: 1 }}>
        <Txt v="title" style={{ fontFamily: F.semi, fontSize: 19, letterSpacing: -0.2 }}>{title}</Txt>
        <Txt v="small" style={{ marginTop: 2 }}>{line}</Txt>
      </View>
      <Txt v="label" color={C.muted} style={{ fontSize: 20 }}>›</Txt>
    </Pressable>
  );
}
