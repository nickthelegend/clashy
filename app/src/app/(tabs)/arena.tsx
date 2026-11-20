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
import { ClayLoop } from '@/ui/clay';
import { WarScene } from '@/ui/lottie';
import { Badge, CoinToken } from '@/ui/clash';
import { ProfileAvatar } from '@/ui/feed';
import { BotPic } from '@/ui/practice-kit';
import { ART, ErrorLine, LiveDot, Row, SkeletonRows, Txt } from '@/ui/kit';
import { C, F, FONT, S, fmtUsd } from '@/ui/tokens';
import { TourScroll, TourTarget, useTourScroll } from '@/tour';

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
    <Row style={{ justifyContent: 'space-between', marginTop: 26, marginBottom: 12 }}>
      <Text style={{ ...FONT.semi, fontSize: 19, letterSpacing: -0.3, color: C.ink }}>{title}</Text>
      {right ? <Pressable onPress={onRight} hitSlop={10}><Txt v="small" color={C.brandSoft} style={{ ...FONT.semi }}>{right} ›</Txt></Pressable> : null}
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
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#111116', borderRadius: 20, padding: 12, marginBottom: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <View style={{ width: 74, height: 46 }}>
        <View style={{ position: 'absolute', left: 0, top: 0, borderRadius: 24, borderWidth: 2, borderColor: d.winner === 1 ? C.up : '#111116' }}><ProfileAvatar p={a} size={42} /></View>
        <View style={{ position: 'absolute', left: 30, top: 0, borderRadius: 24, borderWidth: 2, borderColor: d.winner === 2 ? C.up : '#111116' }}><ProfileAvatar p={b} size={42} /></View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}><Txt v="label" color={d.winner === 1 ? C.up : C.ink}>{a?.name ?? 'someone'}</Txt> <Txt v="small" color={C.dim}>vs</Txt> <Txt v="label" color={d.winner === 2 ? C.up : C.ink}>{b?.name ?? 'someone'}</Txt></Txt>
        <Row style={{ gap: 6, marginTop: 3 }}>
          {live ? <><LiveDot /><Txt v="small" color={C.down} style={{ ...FONT.semi }}>LIVE</Txt></> : <Txt v="small">{ago(d.ts)}</Txt>}
          <Txt v="small">· {fmtUsd(d.stake)} each</Txt>
        </Row>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <CoinToken sym={sym} size={30} />
        {live ? null : won ? <Txt v="small" color={C.up} style={{ ...FONT.bold }}>+{fmtUsd(pot - d.stake)}</Txt> : <Txt v="small">Tie</Txt>}
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
  const ts = useTourScroll<React.ComponentRef<typeof ScrollView>>();
  const top = board.status === 'ready' ? board.data.filter((p) => names.has(p.owner.toBase58()) && !isTestAccount(names.get(p.owner.toBase58()))).slice(0, 3) : [];

  return (
    <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: S.gutter, paddingBottom: 120, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <TourScroll value={ts.scroller}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="title">Play</Txt>
        <Pressable onPress={go('/wallet')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.s2, borderRadius: 20, paddingHorizontal: 14, height: 38, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.up }} />
          <Txt v="label">{chain.bal == null ? '…' : `$${chain.bal.toFixed(2)}`}</Txt>
        </Pressable>
      </Row>

      {/* the hero: Clash */}
      <Animated.View entering={FadeInDown.duration(380)}>
        <TourTarget id="arena-clash">
        <Pressable onPress={go('/clash')} style={({ pressed }) => ({ marginTop: 16, borderRadius: 30, overflow: 'hidden', backgroundColor: '#14101C', borderWidth: 1.5, borderColor: '#3A2340', transform: [{ scale: pressed ? 0.985 : 1 }] })}>
          <View style={{ position: 'absolute', right: -40, top: -40, width: 260, height: 260, borderRadius: 130, backgroundColor: C.opp, opacity: 0.16 }} />
          <View style={{ position: 'absolute', left: -60, bottom: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: C.brand, opacity: 0.18 }} />
          <View style={{ position: 'absolute', right: 6, top: 10 }}><ClayLoop name="duel" size={118} style={{ borderRadius: 28 }} /></View>
          <View style={{ padding: 18, paddingBottom: 0 }}>
            <View>
              <Row style={{ gap: 6 }}>
                {waiting ? <><LiveDot /><Txt v="small" color={C.down} style={{ ...FONT.bold, letterSpacing: 0.6 }}>{waiting} WAITING</Txt></> : <Txt v="small" style={{ ...FONT.bold, letterSpacing: 0.6 }}>1 V 1</Txt>}
              </Row>
              <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 42, letterSpacing: -1.4, color: '#fff', marginTop: 4, lineHeight: 60 }}>Clash</Text>
              <Txt v="small" color="#C9C3D6" style={{ marginTop: 6, lineHeight: 18, maxWidth: 230 }}>Same coin, two calls. A stock in 1 hour or crypto in 60 seconds. Best call takes the pot.</Txt>
            </View>
          </View>
          <View style={{ margin: 14, marginTop: 14, height: 56, borderRadius: 18, backgroundColor: C.opp, alignItems: 'center', justifyContent: 'center', shadowColor: C.opp, shadowOpacity: 0.5, shadowRadius: 18 }}>
            <Text style={{ ...FONT.semi, fontSize: 19, letterSpacing: -0.3, color: '#fff' }}>Find a rival · from $5</Text>
          </View>
        </Pressable>
        </TourTarget>
      </Animated.View>

      {/* Royale and the squad war */}
      <TourTarget id="arena-games">
      <Row style={{ gap: 10, marginTop: 10, alignItems: 'stretch' }}>
        <GameTile title="Royale" sub="Up to 16 players" line="$2 in · last one standing" loop="royale" tint="#FFC94A" onPress={go('/onchain-royale')} />
        <GameTile title="Squad war" sub="Squad vs squad" line="Chest vs chest · best trades win" art={<WarScene width={150} height={96} />} tint={C.brandSoft} onPress={go('/clans')} />
      </Row>
      <Row style={{ gap: 10, marginTop: 10, alignItems: 'stretch' }}>
        <GameTile title="Perps clash" sub="Long or short · up to 50×" line="60 s · liquidated means out" art={<Row><Image source={ART.logoSOL} style={{ width: 52, height: 52 }} /><Image source={ART.logoBTC} style={{ width: 52, height: 52, marginLeft: -16 }} /><Image source={ART.logoETH} style={{ width: 52, height: 52, marginLeft: -16 }} /></Row>} tint="#B79BFF" onPress={go('/clash?mode=perps')} />
        <GameTile title="Practice clash" sub="vs Clashy Bot · free" line="Practice money, live prices" art={<BotPic size={56} />} tint={C.brandSoft} onPress={go('/practice/clash')} />
      </Row>
      </TourTarget>

      {/* the Weekly Cup */}
      <TourTarget id="arena-cup">
      <Pressable onPress={go('/cup')} style={({ pressed }) => ({ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 12, backgroundColor: '#1A1406', borderWidth: 1, borderColor: '#3D3010', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <Image source={ART.cupBig} style={{ width: 64, height: 64 }} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={{ ...FONT.semi, fontSize: 21, color: '#FFD66B' }}>Weekly Cup</Text>
          <Txt v="small" color="#CDBB8A">Best profit this week wins · ends in {cupLeft()}</Txt>
        </View>
        <Txt v="label" color="#FFD66B">›</Txt>
      </Pressable>
      </TourTarget>

      {/* live on chain */}
      <Head title="Live now" />
      <TourTarget id="arena-live">
      {feed.status === 'loading' ? <SkeletonRows n={2} /> : feed.status === 'error' ? <ErrorLine msg={feed.error} /> : live.length ? (
        live.slice(0, 4).map((d) => <VersusRow key={d.key.toBase58()} d={d} names={names} live />)
      ) : (
        <Pressable onPress={go('/clash')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14, backgroundColor: '#0E0E12' }}>
          <Image source={ART.radar} style={{ width: 44, height: 44 }} contentFit="contain" />
          <Txt v="small" style={{ flex: 1 }}>No clashes running right now. Start one and the next rival takes you on.</Txt>
        </Pressable>
      )}
      </TourTarget>

      <Head title="Top players" right="Leaderboard" onRight={go('/leaderboard')} />
      {board.status === 'loading' ? <SkeletonRows n={1} /> : top.length ? (
        <TourTarget id="arena-top">
        <Row style={{ gap: 8 }}>
          {top.map((p, i) => {
            const prof = names.get(p.owner.toBase58());
            return (
              <Pressable key={p.owner.toBase58()} onPress={() => router.push(`/u/${p.owner.toBase58()}` as Href)} style={({ pressed }) => ({ flex: 1, alignItems: 'center', borderRadius: 22, paddingVertical: 14, backgroundColor: i === 0 ? '#1B1708' : C.s1, borderWidth: 1, borderColor: i === 0 ? '#4A3B10' : 'transparent', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                <Text style={{ ...FONT.semi, fontSize: 15, color: i === 0 ? '#FFD66B' : C.muted }}>#{i + 1}</Text>
                <View style={{ marginTop: 6 }}><ProfileAvatar p={prof} size={52} /></View>
                <Txt v="label" lines={1} style={{ marginTop: 8, maxWidth: '90%' }}>{prof?.name}</Txt>
                <Txt v="small">{p.wins}W · {p.losses}L</Txt>
              </Pressable>
            );
          })}
        </Row>
        </TourTarget>
      ) : <Txt v="small">Win a clash to get on the board.</Txt>}

      <Head title="Recent results" />
      {feed.status === 'ready' && settled.length ? settled.map((d) => <VersusRow key={d.key.toBase58()} d={d} names={names} />) : feed.status === 'ready' ? <Txt v="small">No settled clashes yet.</Txt> : null}

      <Row style={{ gap: 8, justifyContent: 'center', marginTop: 18 }}>
        <Badge text="Real USDC" color={C.up} />
        <Txt v="small">Every fee paid by Clashy · settled on Solana</Txt>
      </Row>
      </TourScroll>
    </ScrollView>
  );
}

function GameTile({ title, sub, line, loop, art, tint, onPress }: { title: string; sub: string; line: string; loop?: 'royale' | 'war' | 'line'; art?: React.ReactNode; tint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, borderRadius: 26, padding: 14, backgroundColor: '#111116', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {loop ? <ClayLoop name={loop} size={96} style={{ borderRadius: 22, alignSelf: 'center' }} /> : <View style={{ height: 96, alignItems: 'center', justifyContent: 'center' }}>{art}</View>}
      <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 20, color: tint, marginTop: 10 }}>{title}</Text>
      <Txt v="small" color={C.ink} style={{ ...FONT.semi, marginTop: 2 }}>{sub}</Txt>
      <Txt v="small" style={{ marginTop: 2 }}>{line}</Txt>
    </Pressable>
  );
}
