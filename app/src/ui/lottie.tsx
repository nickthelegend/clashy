// Clashy's Lottie animations, played with lottie-web on the web build. Native builds show nothing for now
// (lottie-react-native is the native player to add). Micro-animations (coin, heart, flame, squad war) come from our
// clay art via scripts/make-lottie.py; the four duel/Royale result moments are pure vector, from
// scripts/make-result-lottie.py (see docs/ANIMATIONS.md).
// A file may carry two markers: "loop" (play the intro once, then loop that segment) and "still" (the frame shown,
// not played, under reduced motion). Reduced motion with no "still" marker shows nothing.
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

const FILES = {
  coin: require('../../assets/lottie/coin-drop.json'),
  heart: require('../../assets/lottie/heart-pop.json'),
  confetti: require('../../assets/lottie/confetti.json'),
  flame: require('../../assets/lottie/flame.json'),
  squadWar: require('../../assets/lottie/squad-war.json'),
  // result moments: 300 px over the 170 px result tile (left -65, top -70)
  win: require('../../assets/lottie/result-win.json'),
  lose: require('../../assets/lottie/result-lose.json'),
  knockout: require('../../assets/lottie/result-liquidated.json'),
  deadHeat: require('../../assets/lottie/result-dead-heat.json'),
};
export type LottieName = keyof typeof FILES;

type Marker = { tm: number; cm: string; dr: number };
const marker = (name: LottieName, cm: string): Marker | undefined =>
  ((FILES[name] as { markers?: Marker[] }).markers ?? []).find((m) => m.cm === cm);

export function Lottie({ name, size = 120, width, height, loop = false, style, onDone }: { name: LottieName; size?: number; width?: number; height?: number; loop?: boolean; style?: StyleProp<ViewStyle>; onDone?: () => void }) {
  const box = useRef<unknown>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = box.current as unknown as HTMLElement | null;
    if (!el) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const still = marker(name, 'still');
    if (reduce && !still) { onDone?.(); return; }
    const seg = marker(name, 'loop');
    type Anim = {
      destroy: () => void; addEventListener: (e: string, f: () => void) => void;
      goToAndStop: (v: number, isFrame: boolean) => void; playSegments: (s: [number, number], force: boolean) => void; setLoop: (l: boolean) => void;
    };
    let anim: Anim | null = null;
    let alive = true;
    import('lottie-web').then(({ default: lottie }) => {
      if (!alive) return;
      const a = lottie.loadAnimation({ container: el, renderer: 'svg', loop: seg ? false : loop, autoplay: !reduce, animationData: FILES[name] }) as unknown as Anim;
      anim = a;
      if (reduce && still) {
        const show = () => a.goToAndStop(still.tm, true);
        show(); // no-op until loaded; DOMLoaded covers that case
        a.addEventListener('DOMLoaded', show);
        onDone?.();
        return;
      }
      let looping = false;
      a.addEventListener('complete', () => {
        if (looping) return;
        onDone?.();
        // intro done: loop the idle segment (glow breathing, matched pulses) for as long as the result is on screen
        if (seg) { looping = true; a.setLoop(true); a.playSegments([seg.tm, seg.tm + seg.dr], true); }
      });
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
