// Higgsfield clay loops (assets/video, same files as the landing). Muted, looping, on a dark surface so the black
// background disappears. Shows the webp poster under reduce-motion and until the first frame is ready.
import type React from 'react';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

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
  stash: [require('../../assets/video/stash-jar-loop.mp4'), require('../../assets/video/stash-jar-loop.webp')],
  roundup: [require('../../assets/video/roundup-coin-loop.mp4'), require('../../assets/video/roundup-coin-loop.webp')],
  streak: [require('../../assets/video/streak-flame-loop.mp4'), require('../../assets/video/streak-flame-loop.webp')],
  limits: [require('../../assets/video/limit-shield-loop.mp4'), require('../../assets/video/limit-shield-loop.webp')],
  clock: [require('../../assets/video/market-clock-loop.mp4'), require('../../assets/video/market-clock-loop.webp')],
  chat: [require('../../assets/video/chat-bubbles-loop.mp4'), require('../../assets/video/chat-bubbles-loop.webp')],
  spend: [require('../../assets/video/spend-card-loop.mp4'), require('../../assets/video/spend-card-loop.webp')],
  goal: [require('../../assets/video/goal-target-loop.mp4'), require('../../assets/video/goal-target-loop.webp')],
  stocks: [require('../../assets/video/stocks-loop.mp4'), require('../../assets/video/stocks-loop.webp')],
  onSpend: [require('../../assets/video/onboard-spend-loop.mp4'), require('../../assets/video/onboard-spend-loop.webp')],
  onInvest: [require('../../assets/video/onboard-invest-loop.mp4'), require('../../assets/video/onboard-invest-loop.webp')],
  onSquad: [require('../../assets/video/onboard-squad-loop.mp4'), require('../../assets/video/onboard-squad-loop.webp')],
  clanCity: [require('../../assets/video/clan-banner-loop.mp4'), require('../../assets/video/clan-banner-loop.webp')],
  cupBig: [require('../../assets/video/cup-big-loop.mp4'), require('../../assets/video/cup-big-loop.webp')],
  bell: [require('../../assets/video/inbox-bell-loop.mp4'), require('../../assets/video/inbox-bell-loop.webp')],
  megaphone: [require('../../assets/video/megaphone-loop.mp4'), require('../../assets/video/megaphone-loop.webp')],
  gift: [require('../../assets/video/gift-loop.mp4'), require('../../assets/video/gift-loop.webp')],
  podium: [require('../../assets/video/podium-loop.mp4'), require('../../assets/video/podium-loop.webp')],
  clubhouse: [require('../../assets/video/clubhouse-loop.mp4'), require('../../assets/video/clubhouse-loop.webp')],
  journey: [require('../../assets/video/journey-hero-loop.mp4'), require('../../assets/video/journey-hero-loop.webp')],
} as const;
export type ClayName = keyof typeof SRC;
// explicit size: on web the <video> otherwise keeps its intrinsic 960 px size despite inset 0
const FILL = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' } as const;

/**
 * `blend` screens the loop onto the surface under it, so its black background vanishes on any dark card (not only on
 * pure black) instead of showing as a black square.
 */
export function ClayLoop({ name, size, width, height, loop = true, cover, blend, style }: { name: ClayName; size?: number; width?: number | `${number}%`; height?: number; loop?: boolean; cover?: boolean; blend?: boolean; style?: StyleProp<ViewStyle> }) {
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
  // react-native-web drops mixBlendMode from styles, so on web it is set on the DOM node
  const el = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !blend) return;
    // react-native-web gives positioned views z-index 0, which makes each one its own stacking context: blending inside
    // a transparent wrapper would blend with nothing. Blend the outermost wrapper that holds only this loop instead.
    let node = el.current as unknown as HTMLElement | null;
    for (let i = 0; i < 3 && node?.parentElement && node.parentElement.childElementCount === 1 && getComputedStyle(node.parentElement).backgroundColor === 'rgba(0, 0, 0, 0)'; i++) node = node.parentElement;
    if (node?.style) node.style.mixBlendMode = 'screen';
  }, [blend]);
  return (
    <View ref={el} style={[box, { backgroundColor: '#000', overflow: 'hidden' }, blend ? { mixBlendMode: 'screen' } : null, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!reduce ? <VideoView player={player} style={FILL} contentFit={cover ? 'cover' : 'contain'} nativeControls={false} /> : null}
      {reduce || !ready ? <Image source={poster} style={FILL} contentFit={cover ? 'cover' : 'contain'} /> : null}
    </View>
  );
}
