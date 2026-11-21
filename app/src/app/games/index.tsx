// Games: /games. All 150 games on live prices: the hot ones up top, then every game by category, with search. Each
// card opens the game (/games/[id]). Practice money, so anyone can play straight away.
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePractice } from '@/chain/practice';
import { GAMES } from '@/games/catalog';
import { useFeed } from '@/games/feed';
import { BalancePill, CategoryChips, GameCard, GameChip, HotCard } from '@/games/kit';
import { CATEGORIES, type Category, type GameDef } from '@/games/types';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { BackBtn, Row, SearchBar, Txt } from '@/ui/kit';
import { C, FONT, S } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/arena' as Href));
const HOT = GAMES.filter((g) => g.badge === 'Hot');
const NEW = GAMES.filter((g) => g.badge === 'New');
/** Dev builds and the local dev-wallet build link the game kit (/games/kit) for whoever builds the next game. */
const BUILDER = __DEV__ || process.env.EXPO_PUBLIC_CLASHY_DEV_WALLET === '1';
type Filter = 'all' | Category;

export default function Games() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pr = usePractice();
  // start the live stream here, so each game's odds and charts have a few minutes of history by the time it opens
  useFeed();
  const [cat, setCat] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const ts = useTourScroll<React.ComponentRef<typeof ScrollView>>();
  useScreenTour('games', pr.ready);
  const maxW = Math.min(width, 1080);
  const cols = maxW >= 1000 ? 4 : maxW >= 700 ? 3 : 2;
  const gap = 10;
  const cardW = (maxW - S.gutter * 2 - gap * (cols - 1)) / cols;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return GAMES.filter((g) => (cat === 'all' || g.cat === cat) && (!s || `${g.name} ${g.hook} ${g.cat}`.toLowerCase().includes(s)));
  }, [cat, q]);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: GameDef[] = [];
    for (const r of pr.book?.games ?? []) {
      if (seen.has(r.gameId)) continue;
      seen.add(r.gameId);
      const g = GAMES.find((x) => x.id === r.gameId);
      if (g) out.push(g);
      if (out.length >= 6) break;
    }
    return out;
  }, [pr.book?.games]);

  return (
    <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 48, width: '100%', maxWidth: 1080, alignSelf: 'center' }}>
      <TourScroll value={ts.scroller}>
        <View style={{ paddingHorizontal: S.gutter }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <BackBtn onPress={back} />
            <TourTarget id="games-balance">
              <BalancePill balance={pr.book ? pr.book.balance : null} />
            </TourTarget>
          </Row>
          <Text style={{ ...FONT.displayB, fontSize: 40, letterSpacing: -1.4, color: C.ink, marginTop: 14, lineHeight: 46 }}>Games</Text>
          <Txt v="small" style={{ marginTop: 2 }}>{GAMES.length} games on live prices · memes, perps, stocks and more</Txt>
        </View>

        {/* hot right now */}
        <TourTarget id="games-hot" style={{ marginTop: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 10 }}>
            {HOT.map((g, i) => <HotCard key={g.id} g={g} i={i} w={Math.min(300, width * 0.74)} />)}
          </ScrollView>
        </TourTarget>

        {/* new ways to play */}
        <View style={{ marginTop: 18 }}>
          <Txt v="label" style={{ paddingHorizontal: S.gutter, fontSize: 18 }}>New ways to play</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 10, marginTop: 8 }}>
            {NEW.map((g, i) => <HotCard key={g.id} g={g} i={i} w={Math.min(260, width * 0.64)} />)}
          </ScrollView>
        </View>

        {recent.length ? (
          <View style={{ marginTop: 18 }}>
            <Txt v="label" style={{ paddingHorizontal: S.gutter, fontSize: 18 }}>Jump back in</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 8, marginTop: 8 }}>
              {recent.map((g) => <GameChip key={g.id} g={g} />)}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: S.gutter, marginTop: 18, gap: 12 }}>
          <TourTarget id="games-cats">
            <CategoryChips value={cat} onChange={setCat} items={[{ key: 'all' as Filter, label: 'All', n: GAMES.length }, ...CATEGORIES.map((c) => ({ key: c.key as Filter, label: c.label, n: GAMES.filter((g) => g.cat === c.key).length }))]} />
          </TourTarget>
          <TourTarget id="games-search"><SearchBar value={q} onChange={setQ} placeholder={`Search ${GAMES.length} games`} /></TourTarget>
        </View>

        <View style={{ paddingHorizontal: S.gutter, marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {list.map((g, i) => (i === 0 ? <TourTarget key={g.id} id="games-card"><GameCard g={g} w={cardW} /></TourTarget> : <GameCard key={g.id} g={g} w={cardW} />))}
          {!list.length ? <Txt v="small" style={{ paddingVertical: 24 }}>No game matches “{q}”.</Txt> : null}
        </View>
        <Txt v="small" style={{ textAlign: 'center', marginTop: 22, paddingHorizontal: S.gutter, color: C.dim }}>Practice money on live prices from Phoenix and Pacifica. Nothing is sent on chain.</Txt>
        {BUILDER ? (
          <Pressable onPress={() => router.push('/games/kit' as Href)} accessibilityRole="link" style={{ alignSelf: 'center', marginTop: 10, height: 44, justifyContent: 'center', paddingHorizontal: 16 }}>
            <Txt v="small" color={C.brandSoft} style={{ ...FONT.semi }}>Game kit: every piece these games are built from</Txt>
          </Pressable>
        ) : null}
      </TourScroll>
    </ScrollView>
  );
}

