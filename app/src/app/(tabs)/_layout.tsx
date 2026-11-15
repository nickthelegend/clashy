// Custom tab bar: flat black like pump.fun, icons only, raised indigo Arena square in the middle.
import * as Haptics from 'expo-haptics';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chat, Crown, Home, Shield, Swords } from '@/ui/icons';
import { C } from '@/ui/tokens';

type TB = Omit<TabTriggerSlotProps, 'ref'> & { icon: (c: string) => React.ReactNode; center?: boolean };
function TabBtn({ icon, isFocused, center, ref: _r, ...props }: TB & { ref?: unknown }) {
  if (center)
    return (
      <Pressable {...props} onPressIn={() => Haptics.selectionAsync()} style={{ width: 56, height: 42, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', opacity: isFocused ? 1 : 0.92 }}>
        {icon('#fff')}
      </Pressable>
    );
  return (
    <Pressable {...props} onPressIn={() => Haptics.selectionAsync()} style={{ width: 56, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      {icon(isFocused ? C.ink : C.dim)}
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={{ flex: 1, backgroundColor: C.bg }}>
      <TabSlot style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line }}>
        <TabTrigger name="index" asChild><TabBtn icon={(c) => <Home size={24} color={c} />} /></TabTrigger>
        <TabTrigger name="feed" asChild><TabBtn icon={(c) => <Chat size={24} color={c} />} /></TabTrigger>
        <TabTrigger name="arena" asChild><TabBtn center icon={(c) => <Swords size={22} color={c} />} /></TabTrigger>
        <TabTrigger name="clans" asChild><TabBtn icon={(c) => <Shield size={24} color={c} />} /></TabTrigger>
        <TabTrigger name="rank" asChild><TabBtn icon={(c) => <Crown size={24} color={c} />} /></TabTrigger>
      </View>
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="feed" href="/feed" />
        <TabTrigger name="arena" href="/arena" />
        <TabTrigger name="clans" href="/clans" />
        <TabTrigger name="rank" href="/rank" />
      </TabList>
    </Tabs>
  );
}
