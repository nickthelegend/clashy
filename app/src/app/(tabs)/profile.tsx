// Profile (last tab): your record. Rank card opens the leaderboard. Needs a wallet, so it says so until then.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { SOCIAL_SETUP, useMyProfile } from '@/data/social';
import { Crown } from '@/ui/icons';
import { ART, Art, BADGES, Btn, Card, Pending, Row, Txt, UnderTabs } from '@/ui/kit';
import { C, F, S } from '@/ui/tokens';

type Tab = 'duels' | 'callouts' | 'badges';
const Stat = ({ k, v }: { k: string; v: string }) => (
  <Card style={{ flex: 1, padding: 12 }}><Txt v="small">{k}</Txt><Txt v="h2" color={v === '–' ? C.dim : C.ink} style={{ marginTop: 4, fontSize: 20 }}>{v}</Txt></Card>
);

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const me = useMyProfile();
  const [tab, setTab] = useState<Tab>('duels');
  const ready = me.status === 'ready';
  const p = ready ? me.data : undefined;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }}>
      <Row style={{ gap: 14 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="title" color={C.dim}>?</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ fontSize: 24 }}>{p?.name ?? 'Your profile'}</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>{ready ? 'Gold III' : 'Connect a wallet to claim your name'}</Txt>
        </View>
      </Row>
      {!ready ? <Btn title="Connect wallet" style={{ marginTop: 14 }} onPress={() => router.push('/wallet')} /> : null}

      <Row style={{ gap: 8, marginTop: 16 }}>
        <Stat k="Win rate" v={p ? `${Math.round(p.winRate * 100)}%` : '–'} />
        <Stat k="Duels" v={p ? String(p.duels) : '–'} />
      </Row>
      <Row style={{ gap: 8, marginTop: 8 }}>
        <Stat k="30d P&L" v={p ? `$${p.pnl30d.toFixed(0)}` : '–'} />
        <Stat k="Best streak" v={p ? String(p.bestStreak) : '–'} />
      </Row>

      {/* rank card → leaderboard */}
      <Pressable onPress={() => router.push('/leaderboard')} style={{ marginTop: 12, backgroundColor: C.s1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(91,108,255,0.16)', alignItems: 'center', justifyContent: 'center' }}><Crown size={22} color={C.brandSoft} /></View>
        <View style={{ flex: 1 }}>
          <Txt v="label">Leaderboard</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>{p?.rank ? `You're #${p.rank} this week` : 'See who is on top this week'}</Txt>
        </View>
        <Txt v="small" style={{ fontFamily: F.semi, fontSize: 18 }}>›</Txt>
      </Pressable>

      <View style={{ marginTop: 18 }}>
        <UnderTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'duels', label: 'Duels' }, { key: 'callouts', label: 'Callouts' }, { key: 'badges', label: 'Badges' }]} />
      </View>
      {tab === 'badges' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {BADGES.map((b) => (
            <View key={b.key} style={{ width: '47%', backgroundColor: C.s1, borderRadius: 18, padding: 12, alignItems: 'center' }}>
              <View style={{ opacity: ready ? 1 : 0.4 }}><Art src={b.src} size={96} radius={20} /></View>
              <Txt v="label" style={{ marginTop: 8 }}>{b.label}</Txt>
              <Txt v="small" style={{ marginTop: 2 }}>{ready ? 'Earned' : 'Locked'}</Txt>
            </View>
          ))}
        </View>
      ) : (
        <Pending art={tab === 'duels' ? ART.duels : ART.bell} title={tab === 'duels' ? 'No duels yet' : 'No callouts yet'} body={ready ? 'Your record shows here.' : SOCIAL_SETUP} />
      )}
    </ScrollView>
  );
}
