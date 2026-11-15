import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Pending, Row, Txt } from '@/ui/kit';
import { C, S } from '@/ui/tokens';

const STEPS = [
  ['Push the pot', 'Members chip into a war chest held in escrow on Solana.'],
  ['Trade for a week', 'Propose trades in the clan channel; the clan votes live on a MagicBlock rollup.'],
  ['Hidden from rivals', "Positions stay sealed in a Private ER until the war ends."],
  ['Winner takes a cut', 'The best % return wins a share of the losing clan\'s stake.'],
];

export default function Clan() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter, gap: 12 }}>
      <Txt v="title">Clan wars</Txt>
      <Pending title="You're not in a clan" body="Clans and weekly wars open with the on-chain program at the Blitz kickoff." />
      <Txt v="h2" style={{ marginTop: 6 }}>How a war works</Txt>
      {STEPS.map(([t, b], i) => (
        <Card key={t}>
          <Row style={{ gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Txt v="label">{i + 1}</Txt></View>
            <View style={{ flex: 1 }}><Txt v="label">{t}</Txt><Txt v="small" style={{ marginTop: 2, lineHeight: 18 }}>{b}</Txt></View>
          </Row>
        </Card>
      ))}
    </ScrollView>
  );
}
