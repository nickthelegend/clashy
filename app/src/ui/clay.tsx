// Higgsfield clay loops (assets/video, same files as the landing). Muted, looping, on a dark surface so the black
// background disappears. Shows the webp poster under reduce-motion and until the first frame is ready.
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';

const SRC = {
  hero: [require('../../assets/video/hero-duo-loop.mp4'), require('../../assets/video/hero-duo-loop.webp')],
  ko: [require('../../assets/video/ko-moment.mp4'), require('../../assets/video/ko-moment.webp')],
  war: [require('../../assets/video/clan-war-loop.mp4'), require('../../assets/video/clan-war-loop.webp')],
  duel: [require('../../assets/video/tile-duel-loop.mp4'), require('../../assets/video/tile-duel-loop.webp')],
  royale: [require('../../assets/video/tile-royale-loop.mp4'), require('../../assets/video/tile-royale-loop.webp')],
  diamond: [require('../../assets/video/tile-diamond-loop.mp4'), require('../../assets/video/tile-diamond-loop.webp')],
  line: [require('../../assets/video/tile-line-loop.mp4'), require('../../assets/video/tile-line-loop.webp')],
  cup: [require('../../assets/video/tile-cup-loop.mp4'), require('../../assets/video/tile-cup-loop.webp')],
  win: [require('../../assets/video/win-loop.mp4'), require('../../assets/video/win-loop.webp')],
} as const;
export type ClayName = keyof typeof SRC;
// explicit size: on web the <video> otherwise keeps its intrinsic 960 px size despite inset 0
const FILL = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' } as const;

export function ClayLoop({ name, size, width, height, loop = true, cover, style }: { name: ClayName; size?: number; width?: number | `${number}%`; height?: number; loop?: boolean; cover?: boolean; style?: StyleProp<ViewStyle> }) {
  const [video, poster] = SRC[name];
  const [reduce, setReduce] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
  const player = useVideoPlayer(video, (p) => { p.loop = loop; p.muted = true; });
  useEffect(() => {
    if (reduce) { player.pause(); return; }
    player.play();
    const sub = player.addListener('statusChange', ({ status }) => { if (status === 'readyToPlay') setReady(true); });
    return () => sub.remove();
  }, [player, reduce]);
  const box = { width: width ?? size, height: height ?? size };
  return (
    <View style={[box, { backgroundColor: '#000', overflow: 'hidden' }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!reduce ? <VideoView player={player} style={FILL} contentFit={cover ? 'cover' : 'contain'} nativeControls={false} /> : null}
      {reduce || !ready ? <Image source={poster} style={FILL} contentFit={cover ? 'cover' : 'contain'} /> : null}
    </View>
  );
}
