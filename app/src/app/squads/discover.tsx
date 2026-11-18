// Discover squads (fomo Clans style): every squad on chain ranked by combined real P&L (the chest's realised trading
// score plus members' stock positions marked to the crank's prices), the top three in a carousel, your best squad
// pinned, a search, and a drawer per squad with its banner, level, members, chest and a Join button. Starting a squad
// opens its own drawer. Squads run by chain-test accounts stay off this public board.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PublicKey } from '@solana/web3.js';
import { isTestAccount, usePoll, usePrices, useProfiles } from '@/chain/social';
import { fmtPnl, pnlColor, readMySquads, readSquadBoard, saveSelected, type SquadRank } from '@/chain/squads';
import { useChain } from '@/chain/useChain';
import { ClayLoop } from '@/ui/clay';
import { ART, BackBtn, ErrorLine, MEDALS, Pending, Row, SearchBar, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { SheetTile } from '@/ui/sheet';
import { CARD, GOLD, HAIR, crestSrc } from '@/ui/squads/parts';
import { CreateSquadSheet, SquadSheet } from '@/ui/squads/sheets';
import { C, F, FONT } from '@/ui/tokens';

export default function DiscoverSquads() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(760);
  const chain = useChain();
  const { me } = chain;
  const prices = usePrices();
  const profiles = useProfiles();
  const pricesReady = prices.status === 'ready';
  // the poll reads the latest prices through a ref (its closure is made once per dependency change)
  const px = useRef<Record<string, number>>({});
  if (prices.status === 'ready') px.current = prices.data;
  const board = usePoll(() => (pricesReady ? readSquadBoard(px.current) : Promise.resolve(null)), 8000, [pricesReady, chain.tick]);
  const mine = usePoll(() => (me ? readMySquads(me) : Promise.resolve([])), 6000, [me?.toBase58(), chain.tick]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<SquadRank | null>(null);
  const [creating, setCreating] = useState(false);

  const prof = profiles.status === 'ready' ? profiles.data : new Map();
  const mySet = useMemo(() => new Set(mine.status === 'ready' ? mine.data.map((s) => s.key.toBase58()) : []), [mine]);
  // public board: hide squads whose captain is a chain-test account, unless you are in them
  const rows = board.status === 'ready' && board.data && profiles.status === 'ready'
    ? board.data.filter((s) => mySet.has(s.key.toBase58()) || !isTestAccount(prof.get(s.captain.toBase58()))) : [];
  const rankOf = (k: PublicKey) => rows.findIndex((r) => r.key.equals(k)) + 1;
  const list = q.trim() ? rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())) : rows;
  const top = rows.slice(0, 3);
  const myBest = rows.find((r) => mySet.has(r.key.toBase58()));
  const n = mySet.size;
  const goTo = (k: PublicKey) => { saveSelected(k); setOpen(null); router.dismissTo({ pathname: '/clans', params: { clan: k.toBase58() } } as unknown as Href); };
  const loading = board.status === 'loading' || (board.status === 'ready' && !board.data) || profiles.status === 'loading';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 36 }} keyboardShouldPersistTaps="handled">
        <Row style={{ gap: 10, paddingHorizontal: 16 }}>
          <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/clans' as Href))} />
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => (me ? setCreating(true) : chain.wallet.login?.())} style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: pressed ? '#2A2A33' : C.s2, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
            <Txt v="label" color={C.up} style={{ fontSize: 18, marginTop: -2 }}>+</Txt>
            <Txt v="label" style={{ fontSize: 13.5 }}>Start a squad</Txt>
          </Pressable>
        </Row>

        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <Txt v="title">Squads</Txt>
          <Pressable onPress={() => n && router.dismissTo('/clans' as Href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {mine.status === 'ready' && mine.data.length ? (
              <Row>{mine.data.slice(0, 4).map((s, i) => (
                <View key={s.key.toBase58()} style={{ marginLeft: i ? -8 : 0, width: 26, height: 26, borderRadius: 9, backgroundColor: CARD, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={crestSrc(s.crest)} style={{ width: 22, height: 22 }} contentFit="contain" />
                </View>
              ))}</Row>
            ) : null}
            <Txt v="small" color="#B9B9C3" style={{ fontSize: 13.5 }}>
              {!me ? 'Sign in to join squads' : mine.status !== 'ready' ? 'Loading your squads…' : n ? `You're in ${n} squad${n === 1 ? '' : 's'}` : "You're not in a squad yet"}
              {myBest ? <Txt v="small" color={C.muted} style={{ fontSize: 13.5 }}>{` · best #${rankOf(myBest.key)}`}</Txt> : null}
            </Txt>
          </Pressable>
        </View>

        {/* top three */}
        {loading ? (
          <View style={{ paddingHorizontal: 16, marginTop: 14 }}><SkeletonRows n={1} square /></View>
        ) : top.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingTop: 16 }} decelerationRate="fast" snapToInterval={234}>
            {top.map((s, i) => (
              <Pressable key={s.key.toBase58()} onPress={() => setOpen(s)} style={({ pressed }) => ({ width: 224, borderRadius: 22, overflow: 'hidden', backgroundColor: CARD, borderWidth: 1, borderColor: i === 0 ? 'rgba(255,201,74,0.45)' : HAIR, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <View style={{ height: 96 }}>
                  {i === 0 ? <ClayLoop name="clanCity" width="100%" height={96} cover /> : <Image source={ART.clanCity} style={{ width: '100%', height: 96 }} contentFit="cover" />}
                  <LinearGradient colors={['rgba(21,21,27,0)', CARD]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 }} />
                  <Image source={MEDALS[i]} style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 34 }} contentFit="contain" />
                </View>
                <View style={{ padding: 12, paddingTop: 0, marginTop: -26 }}>
                  <Image source={crestSrc(s.crest)} style={{ width: 52, height: 52 }} contentFit="contain" />
                  <Txt v="label" lines={1} style={{ fontSize: 16, marginTop: 4 }}>{s.name}</Txt>
                  <Txt v="small" lines={1}>{s.members} member{s.members === 1 ? '' : 's'} · Lv {s.level}</Txt>
                  <Txt v="title" color={pnlColor(s.pnl, C.up, C.down, C.ink)} style={{ fontSize: 24, marginTop: 6, fontVariant: ['tabular-nums'] }}>{fmtPnl(s.pnl)}</Txt>
                  <Txt v="small" style={{ fontSize: 11 }}>combined P&L</Txt>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
          <SearchBar value={q} onChange={setQ} placeholder="Search squads" />

          {myBest && !q ? (
            <>
              <Txt v="small" color={C.muted} style={{ ...FONT.bold, fontSize: 11, letterSpacing: 1, marginTop: 18, marginBottom: 4 }}>Your best squad</Txt>
              <RankRow s={myBest} rank={rankOf(myBest.key)} mine pinned onPress={() => setOpen(myBest)} />
            </>
          ) : null}

          <Row style={{ marginTop: 18, marginBottom: 4 }}>
            <Txt v="small" color={C.muted} style={{ ...FONT.bold, fontSize: 11, letterSpacing: 1, flex: 1 }}>{q ? 'Results' : 'All squads'}</Txt>
            <Txt v="small" color={C.dim} style={{ fontSize: 11 }}>P&L</Txt>
          </Row>
          {loading ? <SkeletonRows n={5} square /> : board.status === 'error' ? <ErrorLine msg={board.error} onRetry={board.reload} /> : list.length === 0 ? (
            q ? <Pending art={ART.emptySearch} title="No squads match" body={`Nothing called “${q.trim()}”. Start it yourself?`} action="Start a squad" onAction={() => setCreating(true)} />
              : <Pending art={ART.clubhouse} title="No squads yet" body="Be the first: start a squad and invite your friends." action="Start a squad" onAction={() => setCreating(true)} />
          ) : list.map((s) => <RankRow key={s.key.toBase58()} s={s} rank={rankOf(s.key)} mine={mySet.has(s.key.toBase58())} onPress={() => setOpen(s)} />)}

          <View style={{ marginTop: 18 }}>
            <SheetTile art={<Image source={ART.crestCreate} style={{ width: 50, height: 50 }} contentFit="contain" />} title="Start your own squad" line="Name it, pick a crest, you're the captain" accent={GOLD} onPress={() => (me ? setCreating(true) : chain.wallet.login?.())} />
          </View>
          <Txt v="small" style={{ fontSize: 11.5, lineHeight: 16, marginTop: 4 }}>P&L = the chest's trading score plus members' stock positions at live prices, read from the Clashy program.</Txt>
        </View>
      </ScrollView>

      <SquadSheet squad={open} rank={open ? rankOf(open.key) : 0} mine={!!open && mySet.has(open.key.toBase58())} profiles={prof} chain={chain} onClose={() => setOpen(null)} onOpen={goTo} />
      <CreateSquadSheet open={creating} onClose={() => setCreating(false)} chain={chain} onCreated={(k) => { setCreating(false); goTo(k); }} />
    </View>
  );
}

function RankRow({ s, rank, mine, pinned, onPress }: { s: SquadRank; rank: number; mine: boolean; pinned?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 8, paddingHorizontal: pinned ? 10 : 2,
      borderRadius: 16, backgroundColor: pinned ? 'rgba(171,159,242,0.10)' : pressed ? '#111116' : 'transparent', borderWidth: pinned ? 1 : 0, borderColor: 'rgba(171,159,242,0.45)',
      borderBottomWidth: pinned ? 1 : 1, borderBottomColor: pinned ? 'rgba(171,159,242,0.45)' : '#141419',
    })}>
      <Txt v="label" color={rank <= 3 ? GOLD : C.dim} style={{ width: 24, textAlign: 'center', ...FONT.semi, fontSize: 14 }}>{rank}</Txt>
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={crestSrc(s.crest)} style={{ width: 42, height: 42 }} contentFit="contain" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row style={{ gap: 6 }}>
          <Txt v="label" lines={1} style={{ fontSize: 15, flexShrink: 1 }}>{s.name}</Txt>
          {mine ? <View style={{ backgroundColor: 'rgba(171,159,242,0.22)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Txt v="small" color={C.brandSoft} style={{ fontSize: 9.5, ...FONT.bold }}>IN</Txt></View> : null}
          {s.atWar ? <View style={{ backgroundColor: 'rgba(240,70,140,0.2)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Txt v="small" color={C.opp} style={{ fontSize: 9.5, ...FONT.bold }}>War</Txt></View> : null}
        </Row>
        <Txt v="small" lines={1}>{s.members} member{s.members === 1 ? '' : 's'} · Lv {s.level} · chest ${s.chest.toFixed(0)}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt v="num" color={pnlColor(s.pnl, C.up, C.down, C.ink)} style={{ fontSize: 15.5 }}>{fmtPnl(s.pnl)}</Txt>
        <Txt v="small" style={{ fontSize: 11 }}>{s.wins}W {s.losses}L</Txt>
      </View>
    </Pressable>
  );
}

