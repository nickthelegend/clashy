// Feed: pump.fun "Callouts". Posts need the social backend, so this is an honest empty state for now.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pending, Txt, UnderTabs } from '@/ui/kit';
import { C, S } from '@/ui/tokens';

type Tab = 'callouts' | 'following' | 'clans';
export default function Feed() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('callouts');
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter }}>
      <Txt v="title" style={{ marginBottom: 12 }}>Feed</Txt>
      <UnderTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'callouts', label: 'Callouts' }, { key: 'following', label: 'Following' }, { key: 'clans', label: 'Clans' }]} />
      <Pending
        title={tab === 'callouts' ? 'No callouts yet' : tab === 'following' ? "You're not following anyone" : 'No clan posts'}
        body="Posts carry a real duel result or an open challenge you can accept. They arrive with the on-chain duel program."
        action="Practice a duel"
        onAction={() => router.push({ pathname: '/duel/amount', params: { id: 'SOL' } })}
      />
    </ScrollView>
  );
}
