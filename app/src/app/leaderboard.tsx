// Leaderboard: the best clashers of all time, ranked from the player accounts of the Clashy program on Solana.
// Rank points and Elo move only when an on-chain clash settles; names and faces come from on-chain profiles.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { useLeaderboardOnchain, type PlayerRow } from '@/chain/reads';
import { isTestAccount, useProfiles, type Profile } from '@/chain/social';
import { useWallet } from '@/chain/wallet';
import { ProfileAvatar } from '@/ui/feed';
import { ART, BackBtn, Btn, ErrorLine, Pending, RANKS, Row, SkeletonRows, Txt, rankFor } from '@/ui/kit';
import { C, FONT, S } from '@/ui/tokens';

const winRate = (p: PlayerRow) => (p.wins + p.losses ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0);
const open = (p: PlayerRow) => () => router.push(`/u/${p.owner.toBase58()}` as Href);

/** The ten ranks as a small horizontal strip: emblem, name, points needed; yours on the lighter chip. */
function Ladder({ current }: { current: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -S.gutter }} contentContainerStyle={{ gap: 8, paddingHorizontal: S.gutter }}>
      {RANKS.map((r) => {
        const on = r.n === current;
        return (
          <View key={r.key} accessibilityLabel={`${r.label}${on ? ', your rank' : ''}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingLeft: 8, paddingRight: 12, borderRadius: 14, backgroundColor: on ? C.s2 : C.card }}>
            <Image source={r.src} style={{ width: 26, height: 26 }} contentFit="contain" />
            <View>
              <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 12.5 }} lines={1}>{r.label}</Txt>
              <Txt v="small" style={{ fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{r.n === 1 ? 'Start' : `${r.pts} pts`}</Txt>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const board = useLeaderboardOnchain();
  const profiles = useProfiles();
  const names = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();
  const me = useWallet().signer?.publicKey.toBase58();
  // players with a name; test accounts from the automated runs stay off the public board
  const rows = board.status === 'ready' ? board.data.filter((p) => names.has(p.owner.toBase58()) && !isTestAccount(names.get(p.owner.toBase58()))) : [];
  const myIdx = rows.findIndex((r) => r.owner.toBase58() === me);
  const mine = myIdx >= 0 ? rows[myIdx] : undefined;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 32 }}>
      <Row style={{ gap: 10 }}><BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/arena' as Href))} /></Row>
      <Txt v="title" style={{ marginTop: 10 }}>Leaderboard</Txt>
      <Txt v="small" style={{ marginTop: 2 }}>All-time clashers. A win is +25 points, a loss −15.</Txt>

      {board.status === 'loading' || profiles.status === 'loading' ? <SkeletonRows n={5} /> : board.status === 'error' ? <ErrorLine msg={board.error} /> : rows.length === 0 ? (
        <Pending art={ART.emptyLeaderboard} title="No winners yet" body="The first clash that settles puts its winner on the board." action="Start a clash" onAction={() => router.push('/clash' as Href)} />
      ) : (
        <>
          {/* your rank, pinned above the list */}
          <View style={{ marginTop: 18, backgroundColor: C.card, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Txt v="label" color={mine ? C.brandSoft : C.muted} style={{ minWidth: 26, fontVariant: ['tabular-nums'] }}>{mine ? `#${myIdx + 1}` : '–'}</Txt>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" lines={1}>{mine ? 'Your rank' : 'Not ranked yet'}</Txt>
              <Txt v="small" lines={1}>{mine ? `${rankFor(mine.rp).label} · ${mine.wins}W ${mine.losses}L · ${mine.rp} pts` : 'Win one clash to get on the board'}</Txt>
            </View>
            <Btn title="Clash" h={36} onPress={() => router.push('/clash' as Href)} />
          </View>

          <View style={{ marginTop: 8 }}>
            {rows.map((r, i) => {
              const p = names.get(r.owner.toBase58());
              const isMe = r.owner.toBase58() === me;
              return (
                <Animated.View key={r.owner.toBase58()} entering={FadeInDown.delay(Math.min(i, 10) * 35).duration(300)}>
                  <Pressable onPress={open(r)} accessibilityRole="button" accessibilityLabel={`${i + 1}, ${isMe ? 'you' : p?.name ?? 'player'}, ${r.rp} points`}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
                    <Txt v="label" color={C.muted} style={{ width: 22, fontVariant: ['tabular-nums'] }}>{i + 1}</Txt>
                    <ProfileAvatar p={p} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt v="label" lines={1} color={isMe ? C.brandSoft : C.ink}>{isMe ? 'You' : p?.name}</Txt>
                      <Txt v="small" lines={1} style={{ marginTop: 1 }}>{rankFor(r.rp).label} · {r.wins}W {r.losses}L · {winRate(r)}% wins</Txt>
                    </View>
                    <Txt v="num" lines={1}>{r.rp} pts</Txt>
                  </Pressable>
                </Animated.View>
              );
            })}
            {rows.length <= 3 ? <Txt v="small" style={{ paddingVertical: 8 }}>Only {rows.length} ranked so far. Win a clash to join them.</Txt> : null}
          </View>
        </>
      )}

      <Txt v="h2" style={{ marginTop: 26 }}>The ladder</Txt>
      <Txt v="small" style={{ marginTop: 2, marginBottom: 10 }}>Ten ranks from Rookie to Legend. Points come only from settled clashes.</Txt>
      <Ladder current={mine ? rankFor(mine.rp).n : 1} />
    </ScrollView>
  );
}
