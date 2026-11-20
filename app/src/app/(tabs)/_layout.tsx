// Custom tab bar: flat black, icons only (Clashy's own clay icons, ui/tab-icons.tsx), the raised Play square in the middle.
// The drawers (call, arena, search) come from CreateProvider in the root layout.
import * as Haptics from 'expo-haptics';
import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect, useState } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { TabIcon, tabArt, type TabName } from '@/ui/tab-icons';
import { useCreate } from '@/ui/create';
import { C } from '@/ui/tokens';
import { RightRail, Sidebar } from '@/ui/desk';
import { TourTarget } from '@/tour';
import { pref, useLayout } from '@/ui/layout';

type TB = Omit<TabTriggerSlotProps, 'ref'> & { name: TabName; label: string };
function TabBtn({ name, label, isFocused, ref: _r, ...props }: TB & { ref?: unknown }) {
  return (
    <TourTarget id={`tab-${name}`}>
      <Pressable {...props} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: !!isFocused }} onPressIn={() => Haptics.selectionAsync()} style={{ width: 56, height: 50, alignItems: 'center', justifyContent: 'center' }}>
        <TabIcon name={name} on={!!isFocused} size={31} dot />
      </Pressable>
    </TourTarget>
  );
}

/** The raised Arena square: it opens the game picker; the swords turn and the square springs while it's open. */
function ArenaBtn({ on }: { on: boolean }) {
  const { openArena, arenaOpen } = useCreate();
  const turn = useSharedValue(0);
  const press = useSharedValue(1);
  useEffect(() => { turn.value = withSpring(arenaOpen ? 1 : 0, { damping: 13, stiffness: 180 }); }, [arenaOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = useAnimatedStyle(() => ({ transform: [{ scale: press.value * (1 + turn.value * 0.06) }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));
  return (
    <TourTarget id="tab-play">
    <Pressable accessibilityRole="button" accessibilityLabel="Play a game" accessibilityState={{ expanded: arenaOpen }}
      onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); press.value = withSpring(0.9, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 10, stiffness: 260 }); }}
      onPress={openArena}>
      <Animated.View style={[{ width: 58, height: 44, borderRadius: 15, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', opacity: on || arenaOpen ? 1 : 0.94, shadowColor: C.brand, shadowOpacity: arenaOpen ? 0.55 : 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }, box]}>
        <Animated.View style={icon}><Image source={tabArt('play')} style={{ width: 34, height: 34 }} contentFit="contain" /></Animated.View>
      </Animated.View>
    </Pressable>
    </TourTarget>
  );
}

/** Switching tabs: the new tab fades up 8 pt instead of snapping in (the screens stay mounted, so nothing reloads). */
function TabFade({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const tab = path.split('/')[1] ?? '';
  const t = useSharedValue(1);
  useEffect(() => { t.value = 0; t.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({ flex: 1, opacity: 0.35 + t.value * 0.65, transform: [{ translateY: (1 - t.value) * 8 }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { desk, wide } = useLayout();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(() => pref.get('sidebar') === 'collapsed');
  const toggle = () => setCollapsed((c) => { pref.set('sidebar', c ? 'open' : 'collapsed'); return !c; });
  const routes = (
    <TabList style={{ display: 'none' }}>
      <TabTrigger name="index" href="/" />
      <TabTrigger name="chats" href="/chats" />
      <TabTrigger name="arena" href="/arena" />
      <TabTrigger name="clans" href="/clans" />
      <TabTrigger name="profile" href="/profile" />
    </TabList>
  );

  // Desktop: D1 sidebar (collapses to the D2 icon rail) + main column + right rail on wide screens.
  if (desk)
    return (
      <>
        <Tabs style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
          <Sidebar collapsed={collapsed} onToggle={toggle} />
          <View style={{ flex: 1 }}><TabFade><TabSlot style={{ flex: 1 }} /></TabFade></View>
          {wide && !path.startsWith('/arena') ? <RightRail /> : null}
          {routes}
        </Tabs>
      </>
    );

  return (
    <>
      <Tabs style={{ flex: 1, backgroundColor: C.bg }}>
        <TabFade><TabSlot style={{ flex: 1 }} /></TabFade>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line }}>
          <TabTrigger name="index" asChild><TabBtn name="home" label="Home" /></TabTrigger>
          <TabTrigger name="chats" asChild><TabBtn name="chats" label="Chats" /></TabTrigger>
          <ArenaBtn on={path.startsWith('/arena')} />
          <TabTrigger name="clans" asChild><TabBtn name="squads" label="Squads" /></TabTrigger>
          <TabTrigger name="profile" asChild><TabBtn name="you" label="You" /></TabTrigger>
        </View>
        {routes}
      </Tabs>
    </>
  );
}
