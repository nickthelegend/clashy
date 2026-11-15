// Clan war (style W2 territory map, with W4 feed and W5 pot votes as tabs).
// Every hex is a real coin with its live 24h move. Clans own a coin by beating the other clan's return on it.
// Ownership, the feed and votes need the clan program, so they say so instead of showing made-up clans.
import { Image } from 'expo-image';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';
import { SETUP_REASON } from '@/data/clans';
import { Bob } from '@/ui/fx';
import { useMajors, useTrending, type Market } from '@/data/markets';
import { ART, Art, BackBtn, Btn, Card, ErrorLine, Pending, Row, SkeletonRows, Txt, UnderTabs } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

type Tab = 'map' | 'feed' | 'votes';
const hexPts = (w: number, h: number) => `${w / 2},1 ${w - 1},${h * 0.25} ${w - 1},${h * 0.75} ${w / 2},${h - 1} 1,${h * 0.75} 1,${h * 0.25}`;

function Hex({ m, w, on, onPress }: { m: Market; w: number; on: boolean; onPress: () => void }) {
  const h = w * 1.14;
  const up = m.change24h >= 0;
  const edge = on ? C.brand : up ? 'rgba(48,209,88,0.55)' : 'rgba(255,69,58,0.55)';
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${m.symbol} ${m.change24h.toFixed(1)} percent today`} style={{ width: w, height: h }}>
      <Svg width={w} height={h} style={{ position: 'absolute' }}>
        <Polygon points={hexPts(w, h)} fill={on ? 'rgba(91,108,255,0.22)' : up ? 'rgba(48,209,88,0.08)' : 'rgba(255,69,58,0.08)'} stroke={edge} strokeWidth={on ? 3 : 2} />
      </Svg>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {m.image ? <Image source={{ uri: m.image }} style={{ width: w * 0.34, height: w * 0.34, borderRadius: w }} /> : null}
        <Txt v="small" color={C.ink} style={{ fontFamily: F.bold, fontSize: 11, marginTop: 3 }} lines={1}>{m.symbol.slice(0, 7)}</Txt>
        <Txt v="small" color={up ? C.up : C.down} style={{ fontSize: 10.5 }}>{up ? '+' : ''}{m.change24h.toFixed(1)}%</Txt>
      </View>
    </Pressable>
  );
}

export default function ClanWar() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(980);
  const { desk } = useLayout();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('map');
  const [sel, setSel] = useState<string>();
  const majors = useMajors();
  const trending = useTrending();
  const coins = [...(majors.data ?? []), ...(trending.data ?? [])].slice(0, 14);
  const picked = coins.find((c) => c.id === sel);

  const W = Math.min(width, desk ? 980 : 560) - S.gutter * 2 - (desk ? 360 : 0);
  const per = 4, gap = 4;
  const hw = Math.floor((W - gap * (per - 1)) / per);
  const rows: Market[][] = [];
  for (let i = 0, r = 0; i < coins.length; r++) { const k = r % 2 ? per - 1 : per; rows.push(coins.slice(i, i + k)); i += k; }

  const map = (
    <View>
      {coins.length === 0 ? <SkeletonRows n={4} /> : rows.map((row, r) => (
        <Row key={r} style={{ gap, marginLeft: r % 2 ? (hw + gap) / 2 : 0, marginTop: r ? -hw * 0.28 : 0 }}>
          {row.map((m, k) => <Animated.View key={m.id} entering={ZoomIn.delay((r * 4 + k) * 55).springify().damping(11)}><Hex m={m} w={hw} on={m.id === sel} onPress={() => setSel(m.id === sel ? undefined : m.id)} /></Animated.View>)}
        </Row>
      ))}
      {majors.error || trending.error ? <ErrorLine msg={`Market feed: ${majors.error ?? trending.error}`} onRetry={() => { majors.refresh(); trending.refresh(); }} /> : null}
    </View>
  );

  const side = (
    <View style={{ gap: 10, width: desk ? 340 : undefined }}>
      <Card style={{ padding: 14 }}>
        {picked ? (
          <>
            <Row style={{ gap: 10 }}>
              {picked.image ? <Image source={{ uri: picked.image }} style={{ width: 36, height: 36, borderRadius: 18 }} /> : null}
              <View style={{ flex: 1 }}><Txt v="label">{picked.symbol}</Txt><Txt v="small">{fmtUsd(picked.price)} · 24h {picked.change24h >= 0 ? '+' : ''}{picked.change24h.toFixed(2)}%</Txt></View>
              <View style={{ backgroundColor: C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" style={{ fontSize: 11 }}>Unclaimed</Txt></View>
            </Row>
            <Txt v="small" style={{ marginTop: 10, lineHeight: 18 }}>In a war, the clan whose members make the better return on {picked.symbol} owns this tile. Most tiles at the end of the week wins the war chest.</Txt>
          </>
        ) : (
          <>
            <Txt v="label">How a war works</Txt>
            <Txt v="small" style={{ marginTop: 6, lineHeight: 18 }}>Two clans, one week. Every coin on the map is a tile. Beat the other clan's return on a coin to own it. Most tiles wins the pot. Tap a tile to see it.</Txt>
          </>
        )}
      </Card>
      <Btn title="Find your clan" kind="white" onPress={() => router.push('/clans')} />
      <Txt v="small" style={{ textAlign: 'center' }}>{SETUP_REASON}</Txt>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Clan war</Txt><Txt v="small">Clan vs clan · one week · live coin map</Txt></View>
      </Row>
      <Image source={ART.bannerWar} style={{ width: '100%', aspectRatio: 16 / 9, maxHeight: 260, borderRadius: 20, marginBottom: 12 }} contentFit="cover" />
      <Row style={{ backgroundColor: C.s1, borderRadius: 20, padding: 12, gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1, alignItems: 'center' }}><Art src={ART.crestCreate} size={56} radius={0} /><Txt v="label" style={{ marginTop: 4 }}>Your clan</Txt><Txt v="small">Join or create</Txt></View>
        <Bob amp={5} ms={900}><Art src={ART.vs} size={64} radius={0} /></Bob>
        <View style={{ flex: 1, alignItems: 'center' }}><View style={{ opacity: 0.35 }}><Art src={ART.crest} size={56} radius={0} /></View><Txt v="label" style={{ marginTop: 4 }}>Rival clan</Txt><Txt v="small">Matched at war start</Txt></View>
      </Row>
      <View style={{ marginBottom: 12 }}><UnderTabs items={[{ key: 'map', label: 'Map' }, { key: 'feed', label: 'Feed' }, { key: 'votes', label: 'Pot votes' }]} value={tab} onChange={setTab} /></View>
      {tab === 'map' ? (
        <View style={{ flexDirection: desk ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
          {map}
          {side}
        </View>
      ) : tab === 'feed' ? (
        <Pending art={ART.tileWar} title="Setup required: war feed" body={`Every member's trade lands here with its effect on the pot. ${SETUP_REASON}`} />
      ) : (
        <Pending art={ART.crown} title="Setup required: pot votes" body={`The clan pot only trades by vote: a member proposes, the clan votes, captains execute. ${SETUP_REASON}`} />
      )}
    </ScrollView>
  );
}
