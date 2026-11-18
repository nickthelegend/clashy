// Play: every game, real USDC first, then Practice on paper money. Clash is the hero; Royale, the squad war and the Weekly Cup
// sit under it, then what is happening on chain right now (open challenges, clashes live on the rollup, results).
import type React from 'react';
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COIN_SYMBOLS } from '@/chain/client';
import { useChain } from '@/chain/useChain';
import { useFeed, useLeaderboardOnchain, useLiveCounts, type FeedDuel } from '@/chain/reads';
import { ago, isTestAccount, useProfiles, type Profile } from '@/chain/social';
import { Badge, CoinToken } from '@/ui/clash';
import { ProfileAvatar } from '@/ui/feed';
import { BotPic } from '@/ui/practice-kit';
import { ART, ErrorLine, LiveDot, Row, SkeletonRows, Txt } from '@/ui/kit';
import { Bolt, Crown, Shield } from '@/ui/icons';
import { C, F, FONT, S, fmtUsd } from '@/ui/tokens';

/** Monday 00:00 UTC of the current week (the Weekly Cup resets then). */
const cupLeft = () => {
  const now = Date.now() / 1000;
  const d = Math.floor(now / 86_400);
  const end = (d - ((d + 3) % 7)) * 86_400 + 7 * 86_400;
  const left = Math.max(0, end - now);
  const days = Math.floor(left / 86_400), hrs = Math.floor((left % 86_400) / 3600);
  return days ? `${days}d ${hrs}h` : `${hrs}h ${Math.floor((left % 3600) / 60)}m`;
};

const go = (to: string) => () => router.push(to as Href);

function Head({ title, right, onRight }: { title: string; right?: string; onRight?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 6 }}>
      <Txt v="h2">{title}</Txt>
      {right ? <Pressable onPress={onRight} hitSlop={10}><Txt v="small" color={C.brandSoft} style={{ ...FONT.medium }}>{right}</Txt></Pressable> : null}
    </Row>
  );
}

/** A versus row for a clash: both faces, the coin, the stake and how it ended (or that it is live). */
function VersusRow({ d, names, live }: { d: FeedDuel; names: Map<string, Profile>; live?: boolean }) {
  const a = names.get(d.creator.toBase58()), b = names.get(d.joiner.toBase58());
  const sym = COIN_SYMBOLS[d.coin] ?? 'SOL';
  const won = d.winner === 1 ? a : d.winner === 2 ? b : null;
  const pot = d.stake * 2 * 0.97;
  return (
    <Pressable onPress={() => router.push(`/match/${d.key.toBase58()}` as Href)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 62, height: 40 }}>
        <View style={{ position: 'absolute', left: 0, top: 0, borderRadius: 21, borderWidth: 2, borderColor: d.winner === 1 ? C.up : C.bg }}><ProfileAvatar p={a} size={36} /></View>
        <View style={{ position: 'absolute', left: 24, top: 0, borderRadius: 21, borderWidth: 2, borderColor: d.winner === 2 ? C.up : C.bg }}><ProfileAvatar p={b} size={36} /></View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}><Txt v="label" color={d.winner === 1 ? C.up : C.ink}>{a?.name ?? 'someone'}</Txt> <Txt v="small" color={C.dim}>vs</Txt> <Txt v="label" color={d.winner === 2 ? C.up : C.ink}>{b?.name ?? 'someone'}</Txt></Txt>
        <Row style={{ gap: 6, marginTop: 3 }}>
          {live ? <><LiveDot color={C.up} /><Txt v="small" color={C.up} style={{ ...FONT.medium }}>Live</Txt></> : <Txt v="small">{ago(d.ts)}</Txt>}
          <Txt v="small">· {fmtUsd(d.stake)} each</Txt>
        </Row>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <CoinToken sym={sym} size={24} />
        {live ? null : won ? <Txt v="small" color={C.up} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>+{fmtUsd(pot - d.stake)}</Txt> : <Txt v="small">Tie</Txt>}
      </View>
    </Pressable>
  );
}

export default function Play() {
  const insets = useSafeAreaInsets();
  const chain = useChain();
  const counts = useLiveCounts();
  const feed = useFeed();
  const profiles = useProfiles();
  const board = useLeaderboardOnchain();
  const names = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();
  const waiting = counts.status === 'ready' ? counts.data.openDuels : null;
  const real = (d: FeedDuel) => !isTestAccount(names.get(d.creator.toBase58())) && !isTestAccount(names.get(d.joiner.toBase58()));
  const live = feed.status === 'ready' ? feed.data.live.filter(real) : [];
  const settled = feed.status === 'ready' ? feed.data.settled.filter((d) => real(d) && d.ts > 0).slice(0, 6) : [];
  const top = board.status === 'ready' ? board.data.filter((p) => names.has(p.owner.toBase58()) && !isTestAccount(names.get(p.owner.toBase58()))).slice(0, 3) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: S.gutter, paddingBottom: 120, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="title">Play</Txt>
        <Pressable onPress={go('/wallet')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.s2, borderRadius: 20, paddingHorizontal: 14, height: 38, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.up }} />
          <Txt v="label">{chain.bal == null ? '…' : `$${chain.bal.toFixed(2)}`}</Txt>
        </Pressable>
      </Row>

      {/* the featured game: Clash */}
      <Animated.View entering={FadeInDown.duration(320)}>
        <Pressable onPress={go('/clash')} accessibilityRole="button" accessibilityLabel="Clash: find a rival"
          style={({ pressed }) => ({ marginTop: 18, borderRadius: 22, padding: 16, backgroundColor: pressed ? C.s1 : C.card })}>
          <Row style={{ gap: 14 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Row style={{ gap: 6 }}>
                {waiting ? <><LiveDot color={C.up} /><Txt v="small" color={C.up} style={{ ...FONT.medium }}>{waiting} waiting for a rival</Txt></> : <Txt v="small">1 v 1 · real USDC</Txt>}
              </Row>
              <Txt v="title" style={{ marginTop: 4 }}>Clash</Txt>
              <Txt v="small" style={{ marginTop: 2, lineHeight: 18 }}>Two calls on one price. The better call takes the pot.</Txt>
            </View>
            <Row>{(['SOL', 'BTC', 'ETH'] as const).map((c, i) => <View key={c} style={{ marginLeft: i ? -12 : 0, borderRadius: 20, borderWidth: 2, borderColor: C.card }}><CoinToken sym={c} size={34} /></View>)}</Row>
          </Row>
          <View style={{ marginTop: 14, height: 48, borderRadius: 24, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...FONT.semi, fontSize: 15.5, color: C.onBrand }}>Find a rival · from $5</Text>
          </View>
        </Pressable>
      </Animated.View>

      <Head title="Games" />
      <GameRow index={0} title="Perps clash" line="Long or short up to 50× · 60 seconds" onPress={go('/clash?mode=perps')}
        icon={<Row>{(['SOL', 'ETH'] as const).map((c, i) => <View key={c} style={{ marginLeft: i ? -12 : 0 }}><CoinToken sym={c} size={28} /></View>)}</Row>} />
      <GameRow index={1} title="Royale" line="Up to 16 players · $2 in · last one standing" onPress={go('/onchain-royale')} icon={<Crown size={20} color={C.ink} />} />
      <GameRow index={2} title="Squad war" line="Your squad's chest against another's" onPress={go('/clans')} icon={<Shield size={20} color={C.ink} />} />
      <GameRow index={3} title="Weekly Cup" line="Best profit this week wins" meta={`Ends in ${cupLeft()}`} onPress={go('/cup')} icon={<Image source={ART.cupBig} style={{ width: 30, height: 30 }} contentFit="contain" />} />

      <Head title="Free practice" />
      <GameRow index={4} title="Practice clash" line="Clashy Bot · practice money, live prices" onPress={go('/practice/clash')} icon={<BotPic size={44} />} bare />
      <GameRow index={5} title="Paper trading" line="$10,000 practice money · stocks, perps, memecoins" onPress={go('/practice')} icon={<Bolt size={19} color={C.ink} />} />

      {/* live on chain */}
      <Head title="Live now" />
      {feed.status === 'loading' ? <SkeletonRows n={2} /> : feed.status === 'error' ? <ErrorLine msg={feed.error} /> : live.length ? (
        live.slice(0, 4).map((d) => <VersusRow key={d.key.toBase58()} d={d} names={names} live />)
      ) : (
        <Txt v="small" style={{ paddingVertical: 8 }}>No clashes running right now. Start one and the next rival takes you on.</Txt>
      )}

      <Head title="Top players" right="Leaderboard" onRight={go('/leaderboard')} />
      {board.status === 'loading' ? <SkeletonRows n={1} /> : top.length ? (
        <View>
          {top.map((p, i) => {
            const prof = names.get(p.owner.toBase58());
            return (
              <Pressable key={p.owner.toBase58()} onPress={() => router.push(`/u/${p.owner.toBase58()}` as Href)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: pressed ? 0.6 : 1 })}>
                <Txt v="label" color={C.muted} style={{ width: 18, fontVariant: ['tabular-nums'] }}>{i + 1}</Txt>
                <ProfileAvatar p={prof} size={36} />
                <Txt v="label" lines={1} style={{ flex: 1 }}>{prof?.name}</Txt>
                <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{p.wins}W · {p.losses}L</Txt>
              </Pressable>
            );
          })}
        </View>
      ) : <Txt v="small">Win a clash to get on the board.</Txt>}

      <Head title="Recent results" />
      {feed.status === 'ready' && settled.length ? settled.map((d) => <VersusRow key={d.key.toBase58()} d={d} names={names} />) : feed.status === 'ready' ? <Txt v="small">No settled clashes yet.</Txt> : null}

      <Txt v="small" style={{ textAlign: 'center', marginTop: 22, fontSize: 12 }}>Real USDC · settled on Solana · network fees paid by Clashy</Txt>
    </ScrollView>
  );
}

/** One game in the list: an icon tile, the name, its rules in one line, and a chevron (or a live note). */
function GameRow({ title, line, icon, meta, onPress, index = 0, bare }: { title: string; line: string; icon: React.ReactNode; meta?: string; onPress: () => void; index?: number; bare?: boolean }) {
  return (
    <Animated.View entering={FadeInDown.delay(40 + index * 35).duration(300)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: bare ? 'transparent' : C.s2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{icon}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1}>{title}</Txt>
          <Txt v="small" lines={1} style={{ marginTop: 1 }}>{line}</Txt>
        </View>
        {meta ? <Txt v="small" color={C.ink} style={{ fontSize: 12.5 }}>{meta}</Txt> : <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>}
      </Pressable>
    </Animated.View>
  );
}
