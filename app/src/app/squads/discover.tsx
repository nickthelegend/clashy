// Discover squads: every squad on chain ranked by combined real P&L (the chest's realised trading score plus members'
// stock positions marked to the crank's prices), your own squads first, a search, and a drawer per squad with its
// crest, level, members, chest and a Join button. Starting a squad opens its own drawer. Squads run by chain-test
// accounts stay off this public board.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PublicKey } from '@solana/web3.js';
import { isTestAccount, usePoll, usePrices, useProfiles } from '@/chain/social';
import { fmtPnl, pnlColor, readMySquads, readSquadBoard, saveSelected, type SquadRank } from '@/chain/squads';
import { useChain } from '@/chain/useChain';
import { Plus } from '@/ui/icons';
import { ART, BackBtn, ErrorLine, Pending, Row, SearchBar, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { SheetTile } from '@/ui/sheet';
import { Badge, crestSrc } from '@/ui/squads/parts';
import { CreateSquadSheet, SquadSheet } from '@/ui/squads/sheets';
import { C, S } from '@/ui/tokens';

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
  const myBest = rows.find((r) => mySet.has(r.key.toBase58()));
  const n = mySet.size;
  const goTo = (k: PublicKey) => { saveSelected(k); setOpen(null); router.dismissTo({ pathname: '/clans', params: { clan: k.toBase58() } } as unknown as Href); };
  const loading = board.status === 'loading' || (board.status === 'ready' && !board.data) || profiles.status === 'loading';
  const yours = rows.filter((r) => mySet.has(r.key.toBase58()));
  const startOwn = () => (me ? setCreating(true) : chain.wallet.login?.());

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 36 }} keyboardShouldPersistTaps="handled">
        <Row style={{ gap: 10 }}>
          <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/clans' as Href))} />
          <View style={{ flex: 1 }} />
          <Pressable onPress={startOwn} accessibilityRole="button" accessibilityLabel="Start a squad"
            style={({ pressed }) => ({ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: pressed ? C.s1 : C.s2, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
            <Plus size={16} color={C.ink} />
            <Txt v="label" style={{ fontSize: 13.5 }}>Start a squad</Txt>
          </Pressable>
        </Row>

        <View style={{ marginTop: 14 }}>
          <Txt v="title">Squads</Txt>
          <Pressable onPress={() => n && router.dismissTo('/clans' as Href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {mine.status === 'ready' && mine.data.length ? (
              <Row>{mine.data.slice(0, 4).map((s, i) => (
                <View key={s.key.toBase58()} style={{ marginLeft: i ? -8 : 0, width: 26, height: 26, borderRadius: 9, backgroundColor: C.s2, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={crestSrc(s.crest)} style={{ width: 20, height: 20 }} contentFit="contain" />
                </View>
              ))}</Row>
            ) : null}
            <Txt v="small" lines={1} style={{ flexShrink: 1 }}>
              {!me ? 'Sign in to join squads' : mine.status !== 'ready' ? 'Loading your squads…' : n ? `You're in ${n} squad${n === 1 ? '' : 's'}` : "You're not in a squad yet"}
              {myBest ? ` · best #${rankOf(myBest.key)}` : ''}
            </Txt>
          </Pressable>
        </View>

        <View style={{ marginTop: 18 }}>
          <SearchBar value={q} onChange={setQ} placeholder="Search squads" />
        </View>

        {yours.length && !q ? (
          <>
            <Row style={{ marginTop: 22, marginBottom: 2 }}>
              <Txt v="h2" style={{ flex: 1 }}>{yours.length === 1 ? 'Your squad' : 'Your squads'}</Txt>
            </Row>
            {yours.map((s, i) => <RankRow key={s.key.toBase58()} index={i} s={s} rank={rankOf(s.key)} mine onPress={() => setOpen(s)} />)}
          </>
        ) : null}

        <Row style={{ marginTop: 22, marginBottom: 2 }}>
          <Txt v="h2" style={{ flex: 1 }}>{q ? 'Results' : 'All squads'}</Txt>
          <Txt v="small">P&L</Txt>
        </Row>
        {loading ? <SkeletonRows n={5} /> : board.status === 'error' ? <ErrorLine msg={board.error} onRetry={board.reload} /> : list.length === 0 ? (
          q ? <Pending art={ART.emptySearch} title="No squads match" body={`Nothing called “${q.trim()}”. Start it yourself?`} action="Start a squad" onAction={() => setCreating(true)} />
            : <Pending art={ART.clubhouse} title="No squads yet" body="Be the first: start a squad and invite your friends." action="Start a squad" onAction={() => setCreating(true)} />
        ) : list.map((s, i) => <RankRow key={s.key.toBase58()} index={i} s={s} rank={rankOf(s.key)} mine={mySet.has(s.key.toBase58())} onPress={() => setOpen(s)} />)}

        <View style={{ marginTop: 14 }}>
          <SheetTile art={<Plus size={20} color={C.ink} />} title="Start your own squad" line="Name it, pick a crest, you're the captain" onPress={startOwn} />
        </View>
        <Txt v="small" style={{ fontSize: 12, lineHeight: 16, marginTop: 14, color: C.dim }}>P&L = the chest's trading score plus members' stock positions at live prices, read from the Clashy program.</Txt>
      </ScrollView>

      <SquadSheet squad={open} rank={open ? rankOf(open.key) : 0} mine={!!open && mySet.has(open.key.toBase58())} profiles={prof} chain={chain} onClose={() => setOpen(null)} onOpen={goTo} />
      <CreateSquadSheet open={creating} onClose={() => setCreating(false)} chain={chain} onCreated={(k) => { setCreating(false); goTo(k); }} />
    </View>
  );
}

/** A ranked squad row, the way a market list reads: rank, crest, name over members and level, P&L over the war record. */
function RankRow({ s, rank, mine, onPress, index = 0 }: { s: SquadRank; rank: number; mine: boolean; onPress: () => void; index?: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 35).duration(300)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${s.name}, rank ${rank}, ${fmtPnl(s.pnl)}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
        <Txt v="label" color={rank <= 3 ? C.ink : C.muted} style={{ width: 20, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{rank}</Txt>
        <Image source={crestSrc(s.crest)} style={{ width: 40, height: 40 }} contentFit="contain" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ gap: 6 }}>
            <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{s.name}</Txt>
            {mine ? <Badge text="In" /> : null}
            {s.atWar ? <Badge text="War" color={C.s2} fg={C.ink} /> : null}
          </Row>
          <Txt v="small" lines={1} style={{ marginTop: 1 }}>{s.members} member{s.members === 1 ? '' : 's'} · Lv {s.level} · chest ${s.chest.toFixed(0)}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="num" lines={1} color={pnlColor(s.pnl, C.up, C.down, C.ink)}>{fmtPnl(s.pnl)}</Txt>
          <Txt v="small" lines={1} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>{s.wins}W {s.losses}L</Txt>
        </View>
      </Pressable>
    </Animated.View>
  );
}
