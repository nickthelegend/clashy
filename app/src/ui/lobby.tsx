// Lobby pieces for the game screens: the ranked ladder strip and the Royale lobby.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Bob } from './fx';
import { ART, Art, Btn, Card, RANKS, Txt, UnderTabs } from './kit';
import { C, F, FONT } from './tokens';

/** Horizontal ladder of the ten ranks, current tier highlighted. */
export function RankStrip({ current }: { current?: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 4, alignItems: 'flex-start' }}>
      {RANKS.map((r) => {
        const on = r.n === current;
        return (
          <View key={r.key} style={{ width: 76, alignItems: 'center', paddingVertical: 10, borderRadius: 16, backgroundColor: on ? C.s2 : C.card }}>
            <Art src={r.src} size={36} radius={0} />
            <Txt v="small" color={on ? C.ink : C.muted} style={{ ...FONT.semi, fontSize: 11.5, marginTop: 5, textAlign: 'center' }} lines={1}>{r.label}</Txt>
            <Txt v="small" style={{ fontSize: 10.5, color: C.dim }}>{r.n === 1 ? 'Start' : `${r.pts} pts`}</Txt>
          </View>
        );
      })}
    </ScrollView>
  );
}

type Tab = 'practice' | 'usdc';

/** The Royale lobby under the chart: solo practice here, or the real USDC Royale with other players. */
export function RoyaleLobby({ best }: { best: number | null }) {
  const [tab, setTab] = useState<Tab>('practice');
  return (
    <View style={{ marginTop: 14 }}>
      <UnderTabs items={[{ key: 'practice', label: 'Practice' }, { key: 'usdc', label: 'Play for USDC' }]} value={tab} onChange={setTab} />
      {tab === 'practice' ? (
        <View style={{ marginTop: 8, alignItems: 'center' }}>
          <Bob amp={8} ms={1300}><Art src={ART.tileRoyale} size={150} radius={0} /></Bob>
          <Txt v="label" style={{ textAlign: 'center', marginTop: 6 }}>Solo on the live price</Txt>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 2 }}>{best !== null ? `Your best: ${best} round${best === 1 ? '' : 's'}` : 'No practice record yet'} · no money moves</Txt>
        </View>
      ) : (
        <View style={{ marginTop: 12 }}>
          <Card style={{ padding: 14 }}>
            <Txt v="label">Royale for USDC</Txt>
            <Txt v="small" color="#B9B9C2" style={{ marginTop: 6, lineHeight: 18 }}>2 USDC entry, 2 to 16 players. MagicBlock VRF rolls the coin, every round is called on a MagicBlock rollup, and the survivors split the pot on Solana. Fees are on Clashy.</Txt>
          </Card>
          <Btn title="Open the USDC Royale" kind="brand" style={{ marginTop: 10 }} onPress={() => router.push('/onchain-royale')} />
          <Txt v="small" style={{ marginTop: 14, marginBottom: 6 }}>Ranks: rank points come from on-chain duels</Txt>
          <RankStrip />
        </View>
      )}
    </View>
  );
}
