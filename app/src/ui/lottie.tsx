// Clashy's Lottie micro-animations (made from our own clay art by scripts/make-lottie.py), played with lottie-web
// on the web build. Native builds show nothing for now (lottie-react-native is the native player to add).
// Respects reduced motion: when the viewer asks for less motion, nothing plays.
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

const FILES = {
  coin: require('../../assets/lottie/coin-drop.json'),
  heart: require('../../assets/lottie/heart-pop.json'),
  confetti: require('../../assets/lottie/confetti.json'),
  flame: require('../../assets/lottie/flame.json'),
  onboardSpend: require('../../assets/lottie/onboard-spend.json'),
  onboardInvest: require('../../assets/lottie/onboard-invest.json'),
  onboardSquad: require('../../assets/lottie/onboard-squad.json'),
  squadWar: require('../../assets/lottie/squad-war.json'),
};
export type LottieName = keyof typeof FILES;

export function Lottie({ name, size = 120, width, height, loop = false, style, onDone }: { name: LottieName; size?: number; width?: number; height?: number; loop?: boolean; style?: StyleProp<ViewStyle>; onDone?: () => void }) {
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
  return <View ref={box as never} pointerEvents="none" style={[{ width: width ?? size, height: height ?? size }, style]} />;
}

/** The squad war scene: two crests clash on a VS burst (web: the Lottie; phones: the still tile art until the native
 *  Lottie player is added). Sized to the box it is given, never stretched. */
export function WarScene({ width, height }: { width: number; height: number }) {
  if (Platform.OS !== 'web') {
    const s = Math.min(width, height);
    return <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}><Image source={require('../../assets/art/tile-war.webp')} style={{ width: s, height: s }} contentFit="contain" /></View>;
  }
  return <Lottie name="squadWar" width={width} height={height} loop />;
}
