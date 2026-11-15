import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ART, Chips, Pending, Txt, UnderTabs } from '@/ui/kit';
import { C, S } from '@/ui/tokens';

type Tab = 'friends' | 'board' | 'wars';
type Range = '24h' | '7d' | '30d' | 'all';
export default function Rank() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('board');
  const [range, setRange] = useState<Range>('7d');
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter }}>
      <Txt v="title" style={{ marginBottom: 12 }}>Leaderboard</Txt>
      <UnderTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'friends', label: 'Friends' }, { key: 'board', label: 'Leaderboard' }, { key: 'wars', label: 'Clan wars' }]} />
      <Chips<Range> value={range} onChange={setRange} items={[{ key: '24h', label: '24h' }, { key: '7d', label: '7d' }, { key: '30d', label: '30d' }, { key: 'all', label: 'All' }]} />
      <Pending art={ART.crown} title="No ranked duels yet" body="Rankings come from settled duels on Solana, so they start when the first real duel settles." />
    </ScrollView>
  );
}
