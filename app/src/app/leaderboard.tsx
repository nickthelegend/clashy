// Leaderboard (Nick's pick L1): podium for the top 3, rows below. Ranked from the player accounts of the Clashy
// program on Solana: rank points and Elo move only when an on-chain duel settles.
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { useLeaderboardOnchain, type PlayerRow } from '@/chain/reads';
import { useWallet } from '@/chain/wallet';
import { ART, Art, Avatar, BackBtn, ErrorLine, MEDALS, Pending, RANKS, Row, SkeletonRows, Txt, rankFor } from '@/ui/kit';
import { C, F, S } from '@/ui/tokens';

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

const Step = ({ place, h, p, me }: { place: 1 | 2 | 3; h: number; p?: PlayerRow; me: boolean }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    {p ? <Avatar name={p.owner.toBase58()} size={place === 1 ? 64 : 52} ring={place === 1 ? '#FFC94A' : undefined} /> : (
      <View style={{ width: place === 1 ? 64 : 52, height: place === 1 ? 64 : 52, borderRadius: 32, borderWidth: 2, borderStyle: 'dashed', borderColor: '#3A3A42', alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="small" style={{ fontSize: 10 }}>Open</Txt>
      </View>
    )}
    <Txt v="small" color={me ? C.brandSoft : C.ink} style={{ marginTop: 6 }} lines={1}>{p ? (me ? 'You' : short(p.owner.toBase58())) : ' '}</Txt>
    <Txt v="small" style={{ marginBottom: 8 }}>{p ? `${p.rp} RP` : ' '}</Txt>
    <View style={{ marginBottom: -18, zIndex: 2 }}><Art src={MEDALS[place - 1]} size={place === 1 ? 46 : 38} radius={0} /></View>
    <View style={{ width: '100%', height: h, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: place === 1 ? 'rgba(255,201,74,0.18)' : C.s1, alignItems: 'center', justifyContent: 'center' }}>
      <Txt v="title" color={place === 1 ? '#FFC94A' : '#6B6B78'} style={{ fontFamily: F.bold, marginTop: 10 }}>{place}</Txt>
    </View>
  </View>
);

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const board = useLeaderboardOnchain();
  const me = useWallet().signer?.publicKey.toBase58();
  const rows = board.status === 'ready' ? board.data : [];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
      <Row style={{ gap: 10, marginBottom: 6 }}><BackBtn onPress={() => router.back()} /><Txt v="title">Leaderboard</Txt></Row>
      <Txt v="small" style={{ marginBottom: 16 }}>All time, from on-chain duels: +25 RP a win, −15 a loss, Elo on every settled duel.</Txt>
      <Row style={{ alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
        <Step place={2} h={70} p={rows[1]} me={rows[1]?.owner.toBase58() === me} />
        <Step place={1} h={100} p={rows[0]} me={rows[0]?.owner.toBase58() === me} />
        <Step place={3} h={56} p={rows[2]} me={rows[2]?.owner.toBase58() === me} />
      </Row>
      {board.status === 'loading' ? <SkeletonRows n={4} /> : board.status === 'error' ? <ErrorLine msg={board.error} /> : rows.length === 0 ? (
        <Pending art={ART.emptyLeaderboard} title="No settled duels yet" body="The first on-chain duel that settles puts its winner on the podium." />
      ) : rows.map((p, i) => {
        const rank = rankFor(p.rp);
        const mine = p.owner.toBase58() === me;
        return (
          <Row key={p.owner.toBase58()} style={{ gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Txt v="label" style={{ width: 26, textAlign: 'center' }} color={i < 3 ? '#FFC94A' : C.muted}>{i + 1}</Txt>
            <Avatar name={p.owner.toBase58()} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" color={mine ? C.brandSoft : C.ink} lines={1}>{mine ? 'You' : short(p.owner.toBase58())}</Txt>
              <Txt v="small" lines={1}>{rank.label} · {p.wins}W {p.losses}L · best streak {p.bestStreak}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}><Txt v="label">{p.rp} RP</Txt><Txt v="small">Elo {p.rating}</Txt></View>
          </Row>
        );
      })}
      <Txt v="h2" style={{ marginTop: 22, marginBottom: 4 }}>Ranks</Txt>
      <Txt v="small" style={{ marginBottom: 12 }}>Ten tiers, Exit Liquidity to The House. On-chain duel wins earn rank points; reach the top and you are the house.</Txt>
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
