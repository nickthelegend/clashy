// Leaderboard (Nick's pick L1): podium for the top 3, rows below. Its own screen, opened from Profile and the Arena.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { SOCIAL_SETUP, useLeaderboard } from '@/data/social';
import { ART, Art, BackBtn, Btn, MEDALS, Pending, RANKS, Row, SkeletonRows, Txt, useFirstLoad } from '@/ui/kit';
import { C, F, S } from '@/ui/tokens';

type Range = '24h' | '7d' | '30d' | 'all';
const Step = ({ place, h }: { place: 1 | 2 | 3; h: number }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <View style={{ width: place === 1 ? 64 : 52, height: place === 1 ? 64 : 52, borderRadius: 32, backgroundColor: C.s2, marginBottom: 8 }} />
    <View style={{ marginBottom: -18, zIndex: 2 }}><Art src={MEDALS[place - 1]} size={place === 1 ? 46 : 38} radius={0} /></View>
    <View style={{ width: '100%', height: h, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: place === 1 ? 'rgba(255,201,74,0.18)' : C.s1, alignItems: 'center', justifyContent: 'center' }}>
      <Txt v="title" color={place === 1 ? '#FFC94A' : '#3A3A42'} style={{ fontFamily: F.bold, marginTop: 10 }}>{place}</Txt>
    </View>
  </View>
);

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const [range, setRange] = useState<Range>('7d');
  const board = useLeaderboard();
  const loading = useFirstLoad();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
      <Row style={{ gap: 10, marginBottom: 14 }}><BackBtn onPress={() => router.back()} /><Txt v="title">Leaderboard</Txt></Row>
      <Row style={{ gap: 6, marginBottom: 16 }}>
        {(['24h', '7d', '30d', 'all'] as Range[]).map((r) => (
          <Btn key={r} title={r === 'all' ? 'All' : r} h={36} kind={range === r ? 'white' : 'ghost'} style={{ flex: 1 }} onPress={() => setRange(r)} />
        ))}
      </Row>
      {/* podium frame: empty seats until real duels settle */}
      <Row style={{ alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
        <Step place={2} h={70} /><Step place={1} h={100} /><Step place={3} h={56} />
      </Row>
      {loading ? <SkeletonRows n={4} /> : board.status !== 'ready' ? (
        <Pending art={ART.emptyLeaderboard} title="Setup required: rankings" body={`Rankings come from settled duels on Solana. ${SOCIAL_SETUP}`} />
      ) : board.data.length === 0 ? (
        <Pending art={ART.emptyLeaderboard} title="No ranked duels yet" body="The first settled duel puts someone on the podium." />
      ) : null}
      <Txt v="h2" style={{ marginTop: 22, marginBottom: 4 }}>Ranks</Txt>
      <Txt v="small" style={{ marginBottom: 12 }}>Ten tiers, Exit Liquidity to The House. Ranked wins earn points; reach the top and you are the house.</Txt>
      {RANKS.map((r) => (
        <Row key={r.key} style={{ gap: 12, backgroundColor: C.s1, borderRadius: 16, padding: 10, marginBottom: 8 }}>
          <Art src={r.src} size={46} radius={0} />
          <View style={{ flex: 1 }}><Txt v="label" color={r.color}>{r.n}. {r.label}</Txt><Txt v="small">{r.pts.toLocaleString()} pts</Txt></View>
          {r.n === 10 ? <Txt v="small" color="#FFD66B">Top tier</Txt> : null}
        </Row>
      ))}
    </ScrollView>
  );
}
