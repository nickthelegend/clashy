// Custom tab bar: flat black like pump.fun, icons only, raised indigo Arena square in the middle.
// CreateProvider wraps the tabs so any screen can open the "What's your call?" drawer (Home and Reply use it).
import * as Haptics from 'expo-haptics';
import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect, useState } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chat, Home, Shield, Swords, User } from '@/ui/icons';
import { CreateProvider, useCreate } from '@/ui/create';
import { C } from '@/ui/tokens';
import { RightRail, Sidebar } from '@/ui/desk';
import { pref, useLayout } from '@/ui/layout';

type TB = Omit<TabTriggerSlotProps, 'ref'> & { icon: (c: string) => React.ReactNode; center?: boolean };
function TabBtn({ icon, isFocused, center, ref: _r, ...props }: TB & { ref?: unknown }) {
  if (center)
    return (
      <Pressable {...props} onPressIn={() => Haptics.selectionAsync()} style={{ width: 56, height: 42, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', opacity: isFocused ? 1 : 0.92 }}>
        {icon(C.onBrand)}
      </Pressable>
    );
  return (
    <Pressable {...props} onPressIn={() => Haptics.selectionAsync()} style={{ width: 56, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      {icon(isFocused ? C.ink : C.dim)}
    </Pressable>
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
    <Pressable accessibilityRole="button" accessibilityLabel="Play a game" accessibilityState={{ expanded: arenaOpen }}
      onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); press.value = withSpring(0.9, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 10, stiffness: 260 }); }}
      onPress={openArena}>
      <Animated.View style={[{ width: 58, height: 44, borderRadius: 15, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', opacity: on || arenaOpen ? 1 : 0.94, shadowColor: C.brand, shadowOpacity: arenaOpen ? 0.55 : 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }, box]}>
        <Animated.View style={icon}><Swords size={22} color={C.onBrand} /></Animated.View>
      </Animated.View>
    </Pressable>
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
      <CreateProvider>
        <Tabs style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
          <Sidebar collapsed={collapsed} onToggle={toggle} />
          <View style={{ flex: 1 }}><TabFade><TabSlot style={{ flex: 1 }} /></TabFade></View>
          {wide && !path.startsWith('/arena') ? <RightRail /> : null}
          {routes}
        </Tabs>
      </CreateProvider>
    );

  return (
    <CreateProvider>
      <Tabs style={{ flex: 1, backgroundColor: C.bg }}>
        <TabFade><TabSlot style={{ flex: 1 }} /></TabFade>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line }}>
          <TabTrigger name="index" asChild><TabBtn icon={(c) => <Home size={24} color={c} />} /></TabTrigger>
          <TabTrigger name="chats" asChild><TabBtn icon={(c) => <Chat size={24} color={c} />} /></TabTrigger>
          <ArenaBtn on={path.startsWith('/arena')} />
          <TabTrigger name="clans" asChild><TabBtn icon={(c) => <Shield size={24} color={c} />} /></TabTrigger>
          <TabTrigger name="profile" asChild><TabBtn icon={(c) => <User size={24} color={c} />} /></TabTrigger>
        </View>
        {routes}
      </Tabs>
    </CreateProvider>
  );
}
