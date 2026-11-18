// Clashy's own nav icons: soft-clay 3D art (docs/ART-3D.md), generated with ChatGPT. Each tab has a full-colour
// icon and a muted one; the selected tab cross-fades to colour and springs up a little, like a game's menu bar.
import { useEffect } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { C } from './tokens';

export type TabName = 'home' | 'chats' | 'play' | 'squads' | 'you' | 'wallet';

const ON: Record<TabName, number> = {
  home: require('../../assets/art/tab/tab-home.webp'),
  chats: require('../../assets/art/tab/tab-chats.webp'),
  play: require('../../assets/art/tab/tab-play.webp'),
  squads: require('../../assets/art/tab/tab-squads.webp'),
  you: require('../../assets/art/tab/tab-you.webp'),
  wallet: require('../../assets/art/tab/tab-wallet.webp'),
};
const OFF: Record<TabName, number> = {
  home: require('../../assets/art/tab/tab-home-off.webp'),
  chats: require('../../assets/art/tab/tab-chats-off.webp'),
  play: require('../../assets/art/tab/tab-play-off.webp'),
  squads: require('../../assets/art/tab/tab-squads-off.webp'),
  you: require('../../assets/art/tab/tab-you-off.webp'),
  wallet: require('../../assets/art/tab/tab-wallet-off.webp'),
};

/** One nav icon. `on` = this tab is open; `dot` adds the small lavender marker under the selected tab. */
export function TabIcon({ name, on, size = 30, dot = false }: { name: TabName; on: boolean; size?: number; dot?: boolean }) {
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => { t.value = on ? withSpring(1, { damping: 11, stiffness: 220 }) : withTiming(0, { duration: 160 }); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * t.value }, { scale: 0.9 + 0.12 * t.value }] }));
  const colour = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value) }));
  const marker = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value), transform: [{ scaleX: 0.4 + 0.6 * Math.min(1, t.value) }] }));
  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={[{ width: size, height: size }, lift]}>
        <Image source={OFF[name]} style={{ position: 'absolute', width: size, height: size }} contentFit="contain" />
        <Animated.View style={[{ position: 'absolute', width: size, height: size }, colour]}>
          <Image source={ON[name]} style={{ width: size, height: size }} contentFit="contain" />
        </Animated.View>
      </Animated.View>
      {dot ? <Animated.View style={[{ width: 14, height: 3, borderRadius: 2, backgroundColor: C.brand, marginTop: 3 }, marker]} /> : null}
    </View>
  );
}

/** The colour art alone (the raised Play button keeps it in colour all the time). */
export const tabArt = (name: TabName) => ON[name];
