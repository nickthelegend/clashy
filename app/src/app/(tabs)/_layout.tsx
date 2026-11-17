// Tab bar: Home · Play · + · Squads · You. The + is not a screen: it opens the Start-something drawer.
import * as Haptics from 'expo-haptics';
import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Shield, Swords, User } from '@/ui/icons';
import { CreateProvider, useCreate } from '@/ui/create';
import { Txt } from '@/ui/kit';
import { C } from '@/ui/tokens';
import { RightRail, Sidebar } from '@/ui/desk';
import { pref, useLayout } from '@/ui/layout';

type TB = Omit<TabTriggerSlotProps, 'ref'> & { icon: (c: string) => React.ReactNode; center?: boolean };
function TabBtn({ icon, isFocused, label, ref: _r, ...props }: TB & { ref?: unknown; label: string }) {
  return (
    <Pressable {...props} onPressIn={() => Haptics.selectionAsync()} style={{ width: 62, height: 50, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      {icon(isFocused ? C.ink : C.dim)}
      <Txt v="small" color={isFocused ? C.ink : C.dim} style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>{label}</Txt>
    </Pressable>
  );
}

/** The raised + in the middle: opens the Start-something drawer. */
function PlusBtn() {
  const { openMenu } = useCreate();
  return (
    <Pressable onPressIn={() => Haptics.selectionAsync()} onPress={openMenu} style={({ pressed }) => ({ width: 60, height: 46, borderRadius: 16, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }], shadowColor: C.brand, shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } })}>
      <Txt v="title" color="#fff" style={{ fontSize: 30, lineHeight: 32, marginTop: -2 }}>+</Txt>
    </Pressable>
  );
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
          <View style={{ flex: 1 }}><TabSlot style={{ flex: 1 }} /></View>
          {wide && !path.startsWith('/arena') ? <RightRail /> : null}
          {routes}
        </Tabs>
      </CreateProvider>
    );

  return (
    <CreateProvider>
      <Tabs style={{ flex: 1, backgroundColor: C.bg }}>
        <TabSlot style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: '#0A0A0D', borderTopWidth: 1, borderTopColor: '#1A1A20' }}>
          <TabTrigger name="index" asChild><TabBtn label="Home" icon={(c) => <Home size={23} color={c} />} /></TabTrigger>
          <TabTrigger name="arena" asChild><TabBtn label="Play" icon={(c) => <Swords size={22} color={c} />} /></TabTrigger>
          <PlusBtn />
          <TabTrigger name="clans" asChild><TabBtn label="Squads" icon={(c) => <Shield size={23} color={c} />} /></TabTrigger>
          <TabTrigger name="profile" asChild><TabBtn label="You" icon={(c) => <User size={23} color={c} />} /></TabTrigger>
        </View>
        {routes}
      </Tabs>
    </CreateProvider>
  );
}
