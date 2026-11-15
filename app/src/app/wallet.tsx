import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { BackBtn, Card, Pending, Row, Txt } from '@/ui/kit';
import { C, S } from '@/ui/tokens';

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, gap: 12 }}>
      <Row style={{ gap: 10 }}><BackBtn onPress={() => router.back()} /><Txt v="title">Wallet</Txt></Row>
      <Pending title="Setup required: wallet connection" body="Clashy connects through Solana Mobile Wallet Adapter (Phantom, Solflare, Seed Vault). It ships with the on-chain program at the Blitz kickoff, together with a session key that can only make duel moves." />
      <Card><Txt v="label">Where your money sits</Txt><Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>Stakes are held in an escrow vault on Solana. Duel moves run on a MagicBlock Ephemeral Rollup and the result settles back to Solana. The rollup never holds your funds.</Txt></Card>
    </ScrollView>
  );
}
