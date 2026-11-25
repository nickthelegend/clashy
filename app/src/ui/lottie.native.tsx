// Clashy's Lottie animations on phones, played with lottie-react-native. Same files, sizes and markers as the web
// player (lottie.tsx): a "loop" marker plays the intro once and then loops that segment; under reduced motion the
// "still" marker's frame is shown, and a file with no "still" marker shows nothing.
import LottieView from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';
import { FILES, marker, type LottieName } from './lottie-files';
export type { LottieName };

type Anim = { ip: number; op: number };

export function Lottie({ name, size = 120, width, height, loop = false, style, onDone }: { name: LottieName; size?: number; width?: number; height?: number; loop?: boolean; style?: StyleProp<ViewStyle>; onDone?: () => void }) {
  const ref = useRef<LottieView>(null);
  const [reduce, setReduce] = useState<boolean | null>(null);
  const looping = useRef(false);
  const seg = marker(name, 'loop');
  const still = marker(name, 'still');
  const box = { width: width ?? size, height: height ?? size };

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => alive && setReduce(r)).catch(() => alive && setReduce(false));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (reduce) onDone?.();
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  if (reduce === null) return <View pointerEvents="none" style={[box, style]} />;
  if (reduce) {
    if (!still) return <View pointerEvents="none" style={[box, style]} />;
    const a = FILES[name] as Anim;
    const progress = Math.min(1, Math.max(0, (still.tm - a.ip) / Math.max(1, a.op - a.ip)));
    return <LottieView source={FILES[name]} progress={progress} autoPlay={false} resizeMode="contain" style={[box, style]} />;
  }
  return (
    <View pointerEvents="none" style={[box, style]}>
      <LottieView
        ref={ref}
        source={FILES[name]}
        autoPlay
        loop={seg ? false : loop}
        resizeMode="contain"
        style={box}
        onAnimationFinish={(cancelled) => {
          if (cancelled) return;
          if (!looping.current) onDone?.();
          // intro done: loop the idle segment for as long as the result is on screen (replayed on each finish)
          if (seg) { looping.current = true; ref.current?.play(seg.tm, seg.tm + seg.dr); }
        }}
      />
    </View>
  );
}

/** The squad war scene: two crests clash on a VS burst. Sized to the box it is given, never stretched. */
export function WarScene({ width, height }: { width: number; height: number }) {
  return <Lottie name="squadWar" width={width} height={height} loop />;
}
