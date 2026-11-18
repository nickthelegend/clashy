// Leaderboard: the best clashers of all time, ranked from the player accounts of the Clashy program on Solana.
// Rank points and Elo move only when an on-chain clash settles; names and faces come from on-chain profiles.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { useLeaderboardOnchain, type PlayerRow } from '@/chain/reads';
import { isTestAccount, useProfiles, type Profile } from '@/chain/social';
import { useWallet } from '@/chain/wallet';
import { ProfileAvatar } from '@/ui/feed';
import { RankStrip } from '@/ui/lobby';
import { ART, BackBtn, Btn, ErrorLine, Row, SkeletonRows, Txt, rankFor } from '@/ui/kit';
import { C, F, FONT, S } from '@/ui/tokens';

const winRate = (p: PlayerRow) => (p.wins + p.losses ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0);
const open = (p: PlayerRow) => () => router.push(`/u/${p.owner.toBase58()}` as Href);

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const board = useLeaderboardOnchain();
  const profiles = useProfiles();
  const names = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();
  const me = useWallet().signer?.publicKey.toBase58();
  // players with a name; test accounts from the automated runs stay off the public board
  const rows = board.status === 'ready' ? board.data.filter((p) => names.has(p.owner.toBase58()) && !isTestAccount(names.get(p.owner.toBase58()))) : [];
  const top = [rows[1], rows[0], rows[2]];
  const myIdx = rows.findIndex((r) => r.owner.toBase58() === me);
  const mine = myIdx >= 0 ? rows[myIdx] : undefined;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 32 }}>
      <Row style={{ gap: 10 }}><BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/arena' as Href))} /></Row>
      <Txt v="title" style={{ marginTop: 10 }}>Leaderboard</Txt>
      <Txt v="small" style={{ marginTop: 2 }}>All-time clashers. A win is +25 points, a loss −15.</Txt>

      {board.status === 'loading' || profiles.status === 'loading' ? <SkeletonRows n={5} /> : board.status === 'error' ? <ErrorLine msg={board.error} /> : rows.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 30 }}>
          <Image source={ART.emptyLeaderboard} style={{ width: 140, height: 140 }} contentFit="contain" />
          <Txt v="h2" style={{ marginTop: 8 }}>No winners yet</Txt>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 4 }}>The first clash that settles puts its winner on the podium.</Txt>
          <Btn title="Start a clash" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => router.push('/clash' as Href)} />
        </View>
      ) : (
        <>
          <Row style={{ alignItems: 'flex-end', gap: 8, marginTop: 26 }}>
            {top.map((r, i) => {
              const place = i === 1 ? 1 : i === 0 ? 2 : 3;
              if (!r) return <View key={i} style={{ flex: 1 }} />;
              const p = names.get(r.owner.toBase58());
              return (
                <Pressable key={r.owner.toBase58()} onPress={open(r)} style={{ flex: 1, alignItems: 'center' }}>
                  {place === 1 ? <Image source={ART.crown} style={{ width: 30, height: 30, marginBottom: -4 }} contentFit="contain" /> : null}
                  <View style={{ borderRadius: 40, borderWidth: 3, borderColor: place === 1 ? '#FFC94A' : place === 2 ? '#C9CDD6' : '#D08A4E' }}>
                    <ProfileAvatar p={p} size={place === 1 ? 66 : 52} />
                  </View>
                  <Txt v="label" lines={1} style={{ marginTop: 6, maxWidth: '95%' }}>{r.owner.toBase58() === me ? 'You' : p?.name}</Txt>
                  <Txt v="small" color={place === 1 ? '#FFD66B' : C.muted} style={{ ...FONT.semi }}>{r.rp} pts</Txt>
                  <View style={{ width: '100%', height: place === 1 ? 74 : place === 2 ? 54 : 40, marginTop: 6, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: place === 1 ? '#FFC94A' : C.s1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ ...FONT.display, fontSize: 24, color: place === 1 ? '#2A1E00' : C.ink }}>{place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Row>
          <View style={{ backgroundColor: C.s1, borderRadius: 20, paddingVertical: 4 }}>
            {rows.slice(3).map((r, i) => {
              const p = names.get(r.owner.toBase58());
              const isMe = r.owner.toBase58() === me;
              return (
                <Pressable key={r.owner.toBase58()} onPress={open(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: isMe ? 'rgba(171,159,242,0.15)' : 'transparent' }}>
                  <Txt v="label" color={C.muted} style={{ width: 22 }}>{i + 4}</Txt>
                  <ProfileAvatar p={p} size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label" lines={1} color={isMe ? C.brandSoft : C.ink}>{isMe ? 'You' : p?.name}</Txt>
                    <Txt v="small" lines={1}>{rankFor(r.rp).label} · {r.wins}W {r.losses}L · {winRate(r)}% wins</Txt>
                  </View>
                  <Txt v="label">{r.rp} pts</Txt>
                </Pressable>
              );
            })}
            {rows.length <= 3 ? <Txt v="small" style={{ padding: 14, textAlign: 'center' }}>Only {rows.length} ranked so far. Win a clash to join them.</Txt> : null}
          </View>

          <View style={{ marginTop: 12, backgroundColor: C.s1, borderRadius: 20, padding: 12, borderWidth: 1.5, borderColor: mine ? C.brand : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ ...FONT.semi, fontSize: 20, color: mine ? C.brandSoft : C.muted, width: 40 }}>{mine ? `#${myIdx + 1}` : '–'}</Text>
            <View style={{ flex: 1 }}>
              <Txt v="label">{mine ? 'Your rank' : 'Not ranked yet'}</Txt>
              <Txt v="small">{mine ? `${rankFor(mine.rp).label} · ${mine.wins}W ${mine.losses}L` : 'Win one clash to get on the board'}</Txt>
            </View>
            <Btn title="Clash" h={40} onPress={() => router.push('/clash' as Href)} />
          </View>
        </>
      )}

      <Text style={{ ...FONT.semi, fontSize: 19, letterSpacing: -0.3, color: C.ink, marginTop: 28, marginBottom: 4 }}>The ladder</Text>
      <Txt v="small" style={{ marginBottom: 12 }}>Ten ranks from Rookie to Legend. Points come only from settled clashes.</Txt>
      <RankStrip current={mine ? rankFor(mine.rp).n : 1} />
    </ScrollView>
  );
}
