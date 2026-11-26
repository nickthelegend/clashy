// Clashy's clay sprite animations: the mascot (bo) and the rival LASER, cut from ChatGPT sheets by
// scripts/make-sprites.py into one row of frames per animation (assets/sprites/<name>.webp, frame data in sprites.json).
// <Sprite> steps through the frames; every animation of a character shares one scale and one feet line, so switching
// between them (idle -> punch -> win) never makes the character jump or change size. Works on web and on phones.
// Reduced motion shows one still frame: the first of a loop, the last of a one-shot.
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';
import META from '../../assets/sprites/sprites.json';

const FILES = {
  'bo-idle': require('../../assets/sprites/bo-idle.webp'),
  'bo-punch': require('../../assets/sprites/bo-punch.webp'),
  'bo-hit': require('../../assets/sprites/bo-hit.webp'),
  'bo-ko': require('../../assets/sprites/bo-ko.webp'),
  'bo-win': require('../../assets/sprites/bo-win.webp'),
  'bo-lose': require('../../assets/sprites/bo-lose.webp'),
  'laser-idle': require('../../assets/sprites/laser-idle.webp'),
  'laser-attack': require('../../assets/sprites/laser-attack.webp'),
  'laser-hit': require('../../assets/sprites/laser-hit.webp'),
  'laser-ko': require('../../assets/sprites/laser-ko.webp'),
  'laser-win': require('../../assets/sprites/laser-win.webp'),
  'laser-lose': require('../../assets/sprites/laser-lose.webp'),
  // game moments (Nov 26)
  'bo-think': require('../../assets/sprites/bo-think.webp'),
  'bo-long': require('../../assets/sprites/bo-long.webp'),
  'bo-short': require('../../assets/sprites/bo-short.webp'),
  'bo-rocket': require('../../assets/sprites/bo-rocket.webp'),
  'bo-cashout': require('../../assets/sprites/bo-cashout.webp'),
  'bo-flip': require('../../assets/sprites/bo-flip.webp'),
  'bo-dice': require('../../assets/sprites/bo-dice.webp'),
  'bo-streak': require('../../assets/sprites/bo-streak.webp'),
  'bo-oops': require('../../assets/sprites/bo-oops.webp'),
  'bo-shrug': require('../../assets/sprites/bo-shrug.webp'),
  'bo-trophy': require('../../assets/sprites/bo-trophy.webp'),
  'bo-wave': require('../../assets/sprites/bo-wave.webp'),
  'laser-faceoff': require('../../assets/sprites/laser-faceoff.webp'),
  'laser-bored': require('../../assets/sprites/laser-bored.webp'),
  'laser-panic': require('../../assets/sprites/laser-panic.webp'),
  'laser-taunt': require('../../assets/sprites/laser-taunt.webp'),
  'laser-melt': require('../../assets/sprites/laser-melt.webp'),
  'laser-rage': require('../../assets/sprites/laser-rage.webp'),
};
export type SpriteName = keyof typeof FILES;
type Meta = { frames: number; size: number; fps: number; mode: 'loop' | 'pingpong' | 'once' };
const meta = META as Record<SpriteName, Meta>;
/** Each character's idle stance frame size: its other animations are bigger frames at the same scale. */
const baseOf = (name: SpriteName) => meta[`${name.split('-')[0]}-idle` as SpriteName].size;

function order(m: Meta): number[] {
  const f = [...Array(m.frames).keys()];
  return m.mode === 'pingpong' ? [...f, ...f.slice(1, -1).reverse()] : f;
}

/**
 * Plays one sprite animation. `size` is the on-screen size of a standing frame; the character stands on the bottom
 * edge of that box, centred. A one-shot animation (punch, hit, ko, lose) holds its last frame and calls onDone.
 * Changing `name` restarts the new animation from its first frame.
 */
export function Sprite({ name, size = 120, flip = false, onDone, style }: { name: SpriteName; size?: number; flip?: boolean; onDone?: () => void; style?: StyleProp<ViewStyle> }) {
  const m = meta[name];
  const seq = order(m);
  const [i, setI] = useState(0);
  const [reduce, setReduce] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => alive && setReduce(r)).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setI(0);
    if (reduce) {
      if (m.mode === 'once') { setI(seq.length - 1); done.current?.(); }
      return;
    }
    let k = 0;
    const h = setInterval(() => {
      k += 1;
      if (m.mode === 'once' && k >= seq.length) { clearInterval(h); done.current?.(); return; }
      setI(k % seq.length);
    }, 1000 / m.fps);
    return () => clearInterval(h);
  }, [name, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = (size * m.size) / baseOf(name);           // this animation's frame on screen
  const frame = seq[Math.min(i, seq.length - 1)];
  return (
    <View pointerEvents="none" style={[{ width: size, height: size, overflow: 'visible' }, style]}>
      <View style={{ position: 'absolute', width: d, height: d, left: (size - d) / 2, bottom: 0, overflow: 'hidden', transform: flip ? [{ scaleX: -1 }] : undefined }}>
        <Image source={FILES[name]} style={{ width: d * m.frames, height: d, transform: [{ translateX: -frame * d }] }} contentFit="fill" cachePolicy="memory" />
      </View>
    </View>
  );
}
