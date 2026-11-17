// Clashy's Lottie micro-animations (made from our own clay art by scripts/make-lottie.py), played with lottie-web
// on the web build. Native builds show nothing for now (lottie-react-native is the native player to add).
// Respects reduced motion: when the viewer asks for less motion, nothing plays.
import { useEffect, useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

const FILES = {
  coin: require('../../assets/lottie/coin-drop.json'),
  heart: require('../../assets/lottie/heart-pop.json'),
  confetti: require('../../assets/lottie/confetti.json'),
  flame: require('../../assets/lottie/flame.json'),
};
export type LottieName = keyof typeof FILES;

export function Lottie({ name, size = 120, loop = false, style, onDone }: { name: LottieName; size?: number; loop?: boolean; style?: StyleProp<ViewStyle>; onDone?: () => void }) {
  const box = useRef<unknown>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = box.current as unknown as HTMLElement | null;
    if (!el || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) { onDone?.(); return; }
    type Anim = { destroy: () => void; addEventListener: (e: string, f: () => void) => void };
    let anim: Anim | null = null;
    let alive = true;
    import('lottie-web').then(({ default: lottie }) => {
      if (!alive) return;
      const a = lottie.loadAnimation({ container: el, renderer: 'svg', loop, autoplay: true, animationData: FILES[name] }) as unknown as Anim;
      a.addEventListener('complete', () => onDone?.());
      anim = a;
    }).catch(() => onDone?.());
    return () => { alive = false; anim?.destroy(); };
  }, [name, loop]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View ref={box as never} pointerEvents="none" style={[{ width: size, height: size }, style]} />;
}
