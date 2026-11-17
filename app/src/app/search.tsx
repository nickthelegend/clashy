// Search: one box for players, squads and stocks. Players are on-chain profiles (test accounts kept out), squads are
// the squad accounts of the Clashy program, stocks are the five tokenized stocks with their live price. Before you
// type, the best players, the biggest squads and the stocks are there as quick picks. Every row is read from chain.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClansOnchain, useLeaderboardOnchain, type ClanRow, type PlayerRow } from '@/chain/reads';
import { isTestAccount, usePrices, useProfiles, type Profile } from '@/chain/social';
import { STOCKS, type Stock } from '@/chain/stocks';
import { ProfileAvatar, STOCK_ART } from '@/ui/feed';
import { Search as SearchIcon } from '@/ui/icons';
import { ART, BackBtn, CRESTS, ErrorLine, Row, SkeletonRows, Txt, rankFor } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

type Tab = 'all' | 'players' | 'squads' | 'stocks';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'players', label: 'Players' }, { key: 'squads', label: 'Squads' }, { key: 'stocks', label: 'Stocks' },
];
const CARD = '#111116';
const HAIR = '#1F1F27';
const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const go = (to: string) => () => router.push(to as Href);
const crestSrc = (n: number) => CRESTS[((n % CRESTS.length) + CRESTS.length) % CRESTS.length];

/** Best match first: exact, then starts-with, then contains anywhere. -1 when it does not match. */
const score = (hay: string, q: string) => {
  const h = hay.toLowerCase();
  if (!q) return 0;
  if (h === q) return 3;
  if (h.startsWith(q)) return 2;
  return h.includes(q) ? 1 : -1;
};

function Head({ title, right, onRight }: { title: string; right?: string; onRight?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 24, marginBottom: 10 }}>
      <Txt v="h2" lines={1} style={{ flexShrink: 1 }}>{title}</Txt>
      {right ? (
        <Pressable onPress={onRight} hitSlop={12} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Txt v="small" color={C.brandSoft} style={{ fontFamily: F.semi }}>{right} ›</Txt>
        </Pressable>
      ) : null}
    </Row>
  );
}

/** A list group: rows inside one card with hairlines between them. */
function Group({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: HAIR, overflow: 'hidden' }}>{children}</View>;
}

function ResultRow({ first, onPress, left, title, sub, right, rightSub, rightColor }: {
  first: boolean; onPress: () => void; left: ReactNode; title: string; sub: string; right?: string; rightSub?: string; rightColor?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 64, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: '#18181E', backgroundColor: pressed ? '#17171D' : 'transparent' })}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{title}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 2 }}>{sub}</Txt>
      </View>
      {right ? (
        <View style={{ alignItems: 'flex-end', maxWidth: '38%' }}>
          <Txt v="label" lines={1} style={{ fontVariant: ['tabular-nums'] }}>{right}</Txt>
          {rightSub ? <Txt v="small" lines={1} color={rightColor} style={{ fontFamily: F.semi }}>{rightSub}</Txt> : null}
        </View>
      ) : <Txt v="label" color={C.dim}>›</Txt>}
    </Pressable>
  );
}

const PlayerResult = ({ p, row, first }: { p: Profile; row?: PlayerRow; first: boolean }) => (
  <ResultRow first={first} onPress={go(`/u/${p.owner.toBase58()}`)} left={<ProfileAvatar p={p} size={42} />} title={p.name}
    sub={row ? `${rankFor(row.rp).label} · ${row.wins}W ${row.losses}L` : p.dayStreak >= 2 ? `🔥 ${p.dayStreak}-day streak` : 'No clashes yet'}
    right={row ? `${row.rp} pts` : undefined} />
);
const SquadResult = ({ c, first }: { c: ClanRow; first: boolean }) => (
  <ResultRow first={first} onPress={go(`/squad/${c.key.toBase58()}`)}
    left={<View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: '#1A1A22', alignItems: 'center', justifyContent: 'center' }}><Image source={crestSrc(c.crest)} style={{ width: 36, height: 36 }} contentFit="contain" /></View>}
    title={c.name} sub={`${c.members} member${c.members === 1 ? '' : 's'} · ${c.wins}W ${c.losses}L${c.atWar ? ' · at war' : ''}`}
    right={fmtUsd(c.chest, { compact: true })} rightSub="in the chest" rightColor={C.muted} />
);
const StockResult = ({ st, price, first }: { st: Stock; price?: number; first: boolean }) => (
  <ResultRow first={first} onPress={go(`/stock/${st.symbol}`)}
    left={<View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: '#1A1A22', alignItems: 'center', justifyContent: 'center' }}><Image source={STOCK_ART[st.symbol]} style={{ width: 36, height: 36 }} contentFit="contain" /></View>}
    title={st.name} sub={`${st.symbol} · tokenized stock`} right={price ? fmtUsd(price) : '…'} rightSub="live" rightColor={C.up} />
);

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const profiles = useProfiles();
  const clans = useClansOnchain();
  const board = useLeaderboardOnchain();
  const prices = usePrices();
  const query = q.trim().toLowerCase().replace(/^@/, '');

  const names = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();
  const rowsBy = useMemo(() => new Map((board.status === 'ready' ? board.data : []).map((r) => [r.owner.toBase58(), r])), [board]);
  const px = prices.status === 'ready' ? prices.data : {};

  // real players only, best ranked first, then by name
  const players = useMemo(() => {
    const all = [...names.values()].filter((p) => !isTestAccount(p) && p.name);
    const rank = (p: Profile) => rowsBy.get(p.owner.toBase58())?.rp ?? -1;
    return all
      .map((p) => ({ p, s: query ? Math.max(score(p.name, query), p.owner.toBase58().toLowerCase() === query ? 3 : -1) : 0 }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || rank(b.p) - rank(a.p) || a.p.name.localeCompare(b.p.name))
      .map((x) => x.p);
  }, [names, rowsBy, query]);
  // squads whose captain is a test account stay out, like test players
  const squads = useMemo(() => {
    const all = (clans.status === 'ready' ? clans.data : []).filter((c) => c.name && !isTestAccount(names.get(c.captain.toBase58())));
    return all
      .map((c) => ({ c, s: query ? Math.max(score(c.name, query), c.key.toBase58().toLowerCase() === query ? 3 : -1) : 0 }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || b.c.chest - a.c.chest || b.c.members - a.c.members)
      .map((x) => x.c);
  }, [clans, names, query]);
  const stocks = useMemo(() => STOCKS
    .map((st) => ({ st, s: query ? Math.max(score(st.symbol, query), score(st.name, query)) : 0 }))
    .filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).map((x) => x.st), [query]);
  const topPlayers = (board.status === 'ready' ? board.data : [])
    .filter((r) => names.has(r.owner.toBase58()) && !isTestAccount(names.get(r.owner.toBase58()))).slice(0, 5);

  const playersLoading = profiles.status === 'loading';
  const squadsLoading = clans.status === 'loading' || profiles.status === 'loading';
  const nothing = !!query && !playersLoading && !squadsLoading
    && (tab === 'all' ? !players.length && !squads.length && !stocks.length
      : tab === 'players' ? !players.length : tab === 'squads' ? !squads.length : !stocks.length);
  const cap = tab === 'all' ? 4 : 50;

  const playersBlock = (title: string, list: Profile[], more?: boolean) => (
    <>
      <Head title={title} right={more && list.length > cap ? `All ${list.length}` : undefined} onRight={() => setTab('players')} />
      {playersLoading ? <SkeletonRows n={3} /> : profiles.status === 'error' ? <ErrorLine msg={profiles.error} onRetry={profiles.reload} /> : list.length ? (
        <Group>{list.slice(0, cap).map((p, i) => <PlayerResult key={p.owner.toBase58()} p={p} row={rowsBy.get(p.owner.toBase58())} first={i === 0} />)}</Group>
      ) : <Txt v="small">{query ? `No players match "${q.trim()}".` : 'No players yet.'}</Txt>}
    </>
  );
  const squadsBlock = (title: string, list: ClanRow[], more?: boolean) => (
    <>
      <Head title={title} right={more && list.length > cap ? `All ${list.length}` : undefined} onRight={() => setTab('squads')} />
      {squadsLoading ? <SkeletonRows n={3} square /> : clans.status === 'error' ? <ErrorLine msg={clans.error} /> : list.length ? (
        <Group>{list.slice(0, cap).map((c, i) => <SquadResult key={c.key.toBase58()} c={c} first={i === 0} />)}</Group>
      ) : <Txt v="small">{query ? `No squads match "${q.trim()}".` : 'No squads yet. Start one from the Squads tab.'}</Txt>}
    </>
  );
  const stocksBlock = (title: string, list: Stock[]) => (
    <>
      <Head title={title} />
      {prices.status === 'error' ? <ErrorLine msg={prices.error} onRetry={prices.reload} /> : null}
      {list.length ? <Group>{list.map((st, i) => <StockResult key={st.symbol} st={st} price={px[st.symbol]} first={i === 0} />)}</Group>
        : <Txt v="small">{`No stocks match "${q.trim()}".`}</Txt>}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" stickyHeaderIndices={[0]}>
      {/* the box and the tabs stay on top while results scroll */}
      <View style={{ backgroundColor: C.bg, paddingTop: 2, paddingBottom: 6 }}>
        <Row style={{ gap: 10 }}>
          <BackBtn onPress={back} />
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: query ? '#33334A' : HAIR, paddingLeft: 14, paddingRight: 6 }}>
            <SearchIcon size={17} color={C.muted} />
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Players, squads, stocks" placeholderTextColor={C.dim}
              autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel="Search"
              style={{ flex: 1, minWidth: 0, height: 46, color: C.ink, fontFamily: F.medium, fontSize: 16 }} />
            {q ? (
              <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={8} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: pressed ? '#2A2A33' : C.s2, alignItems: 'center', justifyContent: 'center' })}>
                <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 13 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </Row>
        <View style={{ flexDirection: 'row', marginTop: 12, backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: HAIR, padding: 3 }}>
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.ink : 'transparent', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: 13.5, color: on ? '#000' : C.muted }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Animated.View key={`${tab}:${query ? 1 : 0}`} entering={FadeIn.duration(180)}>
        {nothing ? (
          <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
            <Image source={ART.emptySearch} style={{ width: 150, height: 150 }} contentFit="contain" />
            <Txt v="title" style={{ marginTop: 8, textAlign: 'center' }}>Nothing found</Txt>
            <Txt v="small" style={{ textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
              No {tab === 'all' ? 'players, squads or stocks' : tab} match "{q.trim()}". Check the spelling, or try a name, a squad or a ticker like NVDA.
            </Txt>
            {tab !== 'all' ? (
              <Pressable onPress={() => setTab('all')} style={({ pressed }) => ({ marginTop: 16, height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: C.s2, justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <Txt v="label">Search everything</Txt>
              </Pressable>
            ) : null}
          </View>
        ) : tab === 'all' && !query ? (
          <>
            <Head title="Top players" right="Leaderboard" onRight={go('/leaderboard')} />
            {board.status === 'loading' || playersLoading ? <SkeletonRows n={3} /> : board.status === 'error' ? <ErrorLine msg={board.error} /> : topPlayers.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.gutter }} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 8 }}>
                {topPlayers.map((r, i) => {
                  const p = names.get(r.owner.toBase58());
                  return (
                    <Pressable key={r.owner.toBase58()} onPress={go(`/u/${r.owner.toBase58()}`)}
                      style={({ pressed }) => ({ width: 104, alignItems: 'center', borderRadius: 22, paddingVertical: 14, paddingHorizontal: 6, backgroundColor: i === 0 ? '#1B1708' : CARD, borderWidth: 1, borderColor: i === 0 ? '#4A3B10' : HAIR, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                      <Txt v="label" color={i === 0 ? '#FFD66B' : C.muted} style={{ fontSize: 13 }}>#{i + 1}</Txt>
                      <View style={{ marginTop: 6 }}><ProfileAvatar p={p} size={50} /></View>
                      <Txt v="label" lines={1} style={{ marginTop: 8, maxWidth: '100%' }}>{p?.name}</Txt>
                      <Txt v="small" lines={1}>{r.rp} pts</Txt>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : <Txt v="small">Win a clash to get on the board.</Txt>}
            {squadsBlock('Top squads', squads.slice(0, 3))}
            {stocksBlock('Stocks', STOCKS)}
          </>
        ) : (
          <>
            {/* in All, a section with no matches steps aside so the hits come first */}
            {tab === 'players' || (tab === 'all' && (playersLoading || players.length > 0)) ? playersBlock(query ? 'Players' : 'All players', players, tab === 'all') : null}
            {tab === 'squads' || (tab === 'all' && (squadsLoading || squads.length > 0)) ? squadsBlock(query ? 'Squads' : 'All squads', squads, tab === 'all') : null}
            {tab === 'stocks' || (tab === 'all' && stocks.length > 0) ? stocksBlock('Stocks', stocks) : null}
            {tab !== 'all' && tab !== 'stocks' && (tab === 'players' ? players.length : squads.length) > cap ? (
              <Txt v="small" style={{ textAlign: 'center', marginTop: 12 }}>Showing the first {cap}. Type to narrow it down.</Txt>
            ) : null}
          </>
        )}
      </Animated.View>
    </ScrollView>
    </View>
  );
}
