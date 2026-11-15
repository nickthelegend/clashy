// Home: fomo / pump.fun anatomy. Balance header, biggest duels, "Duel a coin" list with ⚔ on every row.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Market, useMajors, useTrending } from '@/data/markets';
import { Bell, Search } from '@/ui/icons';
import { Btn, Chips, CoinRow, ErrorLine, IconBtn, Pending, Row, Txt, UnderTabs } from '@/ui/kit';
import { C, S, fmtUsd } from '@/ui/tokens';

type Tab = 'watch' | 'duel' | 'live';
type Filter = 'trending' | 'majors' | 'new' | 'gainers';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('duel');
  const [filter, setFilter] = useState<Filter>('trending');
  const majors = useMajors();
  const trending = useTrending();

  const list: Market[] = useMemo(() => {
    const t = trending.data ?? [];
    if (filter === 'majors') return majors.data ?? [];
    if (filter === 'new') return [...t].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    if (filter === 'gainers') return [...t].sort((a, b) => b.change24h - a.change24h);
    return [...(majors.data ?? []), ...t];
  }, [filter, majors.data, trending.data]);

  const openCoin = (m: Market) => router.push({ pathname: '/coin/[id]', params: { id: m.id } });
  const duel = (m: Market) => router.push({ pathname: '/duel/amount', params: { id: m.id } });
  const err = majors.error ?? trending.error;

  const header = (
    <View>
      {/* balance header: needs a wallet, so we say so instead of showing a number */}
      <Row style={{ gap: 10, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Txt v="small">Balance</Txt>
          <Txt v="h2" color={C.dim} style={{ fontSize: 20, marginTop: 2 }}>Not connected</Txt>
        </View>
        <Btn title="Connect" h={34} onPress={() => router.push('/wallet')} />
        <IconBtn onPress={() => router.push('/discover')}><Search size={18} color={C.ink} /></IconBtn>
        <IconBtn><Bell size={18} color={C.ink} /></IconBtn>
      </Row>

      <Pressable onPress={() => router.push({ pathname: '/duel/amount', params: { id: 'SOL' } })} style={{ backgroundColor: C.s1, borderRadius: 18, padding: 16, marginBottom: 16, overflow: 'hidden' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="small">Knockout duel · 60s</Txt>
          <View style={{ backgroundColor: C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" color={C.ink} style={{ fontSize: 11 }}>Practice open</Txt></View>
        </Row>
        <Txt v="title" style={{ marginTop: 8 }}>Duel anyone.</Txt>
        <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>You pick any coin. They pick theirs. Best % in 60 seconds takes the pot.</Txt>
        <Row style={{ gap: 8, marginTop: 14 }}>
          <Btn title="Find a duel" h={40} style={{ flex: 1 }} onPress={() => router.push({ pathname: '/duel/amount', params: { id: 'SOL' } })} />
          <Btn title="Challenge a friend" kind="ghost" h={40} style={{ flex: 1 }} onPress={() => router.push('/wallet')} />
        </Row>
      </Pressable>

      <UnderTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'watch', label: 'Watchlist' }, { key: 'duel', label: 'Markets' }, { key: 'live', label: 'Live duels' }]} />
      {tab === 'duel' ? (
        <Chips<Filter> value={filter} onChange={setFilter} items={[{ key: 'trending', label: 'Trending' }, { key: 'majors', label: 'Majors' }, { key: 'new', label: 'New' }, { key: 'gainers', label: 'Top gainers' }]} />
      ) : null}
      {err && tab === 'duel' ? <ErrorLine msg={`Prices unavailable: ${err}`} onRetry={() => { majors.refresh(); trending.refresh(); }} /> : null}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }}
      data={tab === 'duel' ? list : []}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl tintColor={C.muted} refreshing={false} onRefresh={() => { majors.refresh(); trending.refresh(); }} />}
      ListEmptyComponent={
        tab === 'watch' ? <Pending title="Your watchlist is empty" body="Star a coin to keep it here." /> :
        tab === 'live' ? <Pending title="No live duels" body="Live duels between traders appear here once duels are on chain." /> :
        majors.loading || trending.loading ? <Txt v="small" style={{ paddingVertical: 20, textAlign: 'center' }}>Loading live prices…</Txt> : undefined
      }
      renderItem={({ item: m }) => (
        <CoinRow
          symbol={m.symbol}
          name={m.kind === 'major' ? m.name : undefined}
          image={m.image}
          price={m.kind === 'meme' && m.marketCap ? fmtUsd(m.marketCap, { compact: true }) : fmtUsd(m.price)}
          change={m.change24h}
          sub={m.kind === 'meme' ? `MC · vol ${fmtUsd(m.volume24h ?? 0, { compact: true })}` : `vol ${fmtUsd(m.volume24h ?? 0, { compact: true })}`}
          hot={m.kind === 'meme' && m.change24h > 50}
          onPress={() => openCoin(m)}
          onDuel={() => duel(m)}
        />
      )}
    />
  );
}
