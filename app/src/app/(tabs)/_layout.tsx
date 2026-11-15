// Custom tab bar: flat black like pump.fun, icons only, raised indigo Duel square in the middle.
import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chat, Crown, Home, Shield, Swords } from '@/ui/icons';
import { Press } from '@/ui/kit';
import { C } from '@/ui/tokens';

type TB = Omit<TabTriggerSlotProps, 'ref'> & { icon: (c: string) => React.ReactNode; dot?: boolean };
function TabBtn({ icon, isFocused, dot, ref: _r, ...props }: TB & { ref?: unknown }) {
  return (
    <Pressable {...props} onPressIn={() => Haptics.selectionAsync()} style={{ width: 56, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      {icon(isFocused ? C.ink : C.dim)}
      {dot ? <View style={{ position: 'absolute', top: 10, right: 14, width: 7, height: 7, borderRadius: 4, backgroundColor: C.opp }} /> : null}
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
        <Press onPress={() => router.push({ pathname: '/duel/amount', params: { id: 'SOL' } })} style={{ width: 54, height: 42, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Swords size={22} color="#fff" />
        </Press>
        <TabTrigger name="clan" asChild><TabBtn icon={(c) => <Shield size={24} color={c} />} /></TabTrigger>
        <TabTrigger name="rank" asChild><TabBtn icon={(c) => <Crown size={24} color={c} />} /></TabTrigger>
      </View>
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="feed" href="/feed" />
        <TabTrigger name="clan" href="/clan" />
        <TabTrigger name="rank" href="/rank" />
      </TabList>
    </Tabs>
  );
}
