// Clashy's Lottie animations on the web build, played with lottie-web. Phones use lottie.native.tsx
// (lottie-react-native) with the same files and markers. Micro-animations (coin, heart, flame, squad war) come from our
// clay art via scripts/make-lottie.py; the four duel/Royale result moments are pure vector, from
// scripts/make-result-lottie.py (see docs/ANIMATIONS.md).
// A file may carry two markers: "loop" (play the intro once, then loop that segment) and "still" (the frame shown,
// not played, under reduced motion). Reduced motion with no "still" marker shows nothing.
import { useEffect, useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { FILES, marker, type LottieName } from './lottie-files';
export type { LottieName };

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

/** The squad war scene: two crests clash on a VS burst. Sized to the box it is given, never stretched. */
export function WarScene({ width, height }: { width: number; height: number }) {
  return <Lottie name="squadWar" width={width} height={height} loop />;
}
