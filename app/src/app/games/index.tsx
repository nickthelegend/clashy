// Games: /games. All 100 games on live prices: the hot ones up top, then every game by category, with search. Each
// card opens the game (/games/[id]). Practice money, so anyone can play straight away.
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePractice } from '@/chain/practice';
import { ENGINE_ART } from '@/games/art';
import { GAMES } from '@/games/catalog';
import { useFeed } from '@/games/feed';
import { lengthOf, usd } from '@/games/kit';
import { CATEGORIES, type Category, type GameDef } from '@/games/types';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { BackBtn, Row, SearchBar, Txt } from '@/ui/kit';
import { C, FONT, S } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/arena' as Href));
const open = (g: GameDef) => router.push(`/games/${g.id}` as Href);
const HOT = GAMES.filter((g) => g.badge === 'Hot');
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
              <Pressable onPress={() => router.push('/practice' as Href)} accessibilityRole="button" accessibilityLabel="Practice balance"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.s2, borderRadius: 20, paddingHorizontal: 14, height: 38, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand }} />
                <Txt v="label" style={{ fontVariant: ['tabular-nums'] }}>{pr.book ? usd(pr.book.balance) : '…'}</Txt>
                <Txt v="small">practice</Txt>
              </Pressable>
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

        {recent.length ? (
          <View style={{ marginTop: 18 }}>
            <Txt v="label" style={{ paddingHorizontal: S.gutter, fontSize: 18 }}>Jump back in</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 8, marginTop: 8 }}>
              {recent.map((g) => (
                <Pressable key={g.id} onPress={() => open(g)} accessibilityRole="button" accessibilityLabel={g.name}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingLeft: 6, paddingRight: 14, borderRadius: 24, backgroundColor: pressed ? '#1C1C24' : '#14141A' })}>
                  <Image source={ENGINE_ART[g.engine]} style={{ width: 36, height: 36 }} contentFit="contain" />
                  <Txt v="label" color={g.tint} style={{ fontSize: 14 }}>{g.name}</Txt>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: S.gutter, marginTop: 18, gap: 12 }}>
          <TourTarget id="games-cats">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {([{ key: 'all', label: 'All' }, ...CATEGORIES] as { key: Filter; label: string }[]).map((c) => {
                const on = c.key === cat;
                const n = c.key === 'all' ? GAMES.length : GAMES.filter((g) => g.cat === c.key).length;
                return (
                  <Pressable key={c.key} onPress={() => setCat(c.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? C.ink : pressed ? '#1C1C24' : '#15151B' })}>
                    <Txt v="label" color={on ? '#000' : C.ink} style={{ fontSize: 14 }}>{c.label}</Txt>
                    <Txt v="small" color={on ? '#444' : C.dim} style={{ fontSize: 12, ...FONT.semi }}>{n}</Txt>
                  </Pressable>
                );
              })}
            </ScrollView>
          </TourTarget>
          <TourTarget id="games-search"><SearchBar value={q} onChange={setQ} placeholder="Search 100 games" /></TourTarget>
        </View>

        <View style={{ paddingHorizontal: S.gutter, marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {list.map((g, i) => (i === 0 ? <TourTarget key={g.id} id="games-card"><GameCard g={g} w={cardW} /></TourTarget> : <GameCard key={g.id} g={g} w={cardW} />))}
          {!list.length ? <Txt v="small" style={{ paddingVertical: 24 }}>No game matches “{q}”.</Txt> : null}
        </View>
        <Txt v="small" style={{ textAlign: 'center', marginTop: 22, paddingHorizontal: S.gutter, color: C.dim }}>Practice money on live prices from Phoenix and Pacifica. Nothing is sent on chain.</Txt>
      </TourScroll>
    </ScrollView>
  );
}

function Badge({ text }: { text: string }) {
  const color = text === 'Hot' ? '#FF6B3D' : text === 'New' ? C.brand : '#FFD60A';
  return (
    <View style={{ backgroundColor: color, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ ...FONT.bold, fontSize: 10.5, letterSpacing: 0.5, color: '#0A0A0D' }}>{text.toUpperCase()}</Text>
    </View>
  );
}

function HotCard({ g, i, w }: { g: GameDef; i: number; w: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(i * 50).duration(320)}>
      <Pressable onPress={() => open(g)} accessibilityRole="button" accessibilityLabel={`${g.name}. ${g.hook}`}
        style={({ pressed }) => ({ width: w, height: 168, borderRadius: 28, overflow: 'hidden', backgroundColor: '#100F15', borderWidth: 1.5, borderColor: `${g.tint}55`, padding: 16, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <View style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: g.tint, opacity: 0.18 }} />
        <Image source={ENGINE_ART[g.engine]} style={{ position: 'absolute', right: 8, top: 10, width: 92, height: 92 }} contentFit="contain" />
        <Badge text={g.badge ?? 'Hot'} />
        <View style={{ flex: 1 }} />
        <Text numberOfLines={1} style={{ ...FONT.displayB, fontSize: 26, letterSpacing: -0.8, color: g.tint }}>{g.name}</Text>
        <Txt v="small" color="#D2CDE0" lines={1} style={{ ...FONT.semi }}>{g.hook}</Txt>
        <Txt v="small" style={{ marginTop: 3 }}>{lengthOf(g)} · {g.vs === 'bot' ? 'vs Clashy Bot' : g.vs === 'bots' ? 'vs 7 bots' : 'Solo'}</Txt>
      </Pressable>
    </Animated.View>
  );
}

function GameCard({ g, w }: { g: GameDef; w: number }) {
  return (
    <Pressable onPress={() => open(g)} accessibilityRole="button" accessibilityLabel={`${g.name}. ${g.hook}`}
      style={({ pressed }) => ({ width: w, minHeight: 196, borderRadius: 24, overflow: 'hidden', backgroundColor: pressed ? '#16161D' : '#111116', padding: 12, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <View style={{ position: 'absolute', left: -30, top: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: g.tint, opacity: 0.12 }} />
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Image source={ENGINE_ART[g.engine]} style={{ width: 64, height: 64 }} contentFit="contain" />
        {g.badge ? <Badge text={g.badge} /> : null}
      </Row>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.bold, fontSize: 18, letterSpacing: -0.4, color: g.tint, marginTop: 8 }}>{g.name}</Text>
      <Txt v="small" color="#C9C4D6" lines={2} style={{ marginTop: 2, lineHeight: 17, minHeight: 34 }}>{g.hook}</Txt>
      <View style={{ flex: 1 }} />
      <Row style={{ gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
        <View style={{ backgroundColor: '#1C1A25', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" color={C.ink} style={{ fontSize: 11, ...FONT.semi }}>{lengthOf(g)}</Txt></View>
        <View style={{ backgroundColor: '#1C1A25', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" color={C.muted} style={{ fontSize: 11, ...FONT.semi }}>{g.vs === 'bot' ? 'vs Bot' : g.vs === 'bots' ? 'vs 7 bots' : 'Solo'}</Txt></View>
      </Row>
    </Pressable>
  );
}
