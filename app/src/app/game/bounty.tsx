// Bounty (style B5 price-tag board + B1 wanted poster).
// Board: open bounties sorted by size. They need the program, so the board shows its setup state.
// Poster: your own wanted poster, built from your real practice bests stored on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SOCIAL_SETUP } from '@/data/social';
import { ART, Avatar, BackBtn, Btn, Chips, Pending, Row, Txt, UnderTabs } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

type Tab = 'board' | 'poster';
type Sort = 'big' | 'ending' | 'friends';
const PAPER = '#EADBB8', INK = '#2B1D0E', RED = '#8A1C0E';

function Poster({ line, royale }: { line: number | null; royale: number | null }) {
  const claim = line !== null ? `${line}% Draw-the-line match` : royale !== null ? `${royale} Royale rounds survived` : 'No practice record yet';
  return (
    <View style={{ backgroundColor: PAPER, borderRadius: 10, padding: 18, alignItems: 'center', transform: [{ rotate: '-1.2deg' }], borderWidth: 6, borderColor: '#D7C296' }}>
      <Text style={{ fontFamily: F.bold, fontSize: 44, letterSpacing: 4, color: INK }}>WANTED</Text>
      <Text style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 4, color: INK, marginTop: -2 }}>BEAT MY WEEK</Text>
      <View style={{ marginTop: 14, borderWidth: 4, borderColor: INK, borderRadius: 8, overflow: 'hidden' }}><Avatar name="you" size={180} /></View>
      <Text style={{ fontFamily: F.bold, fontSize: 22, color: INK, marginTop: 12 }}>You</Text>
      <Text style={{ fontFamily: F.semi, fontSize: 13, color: INK, opacity: 0.75, marginTop: 2 }}>Practice best: {claim}</Text>
      <Text style={{ fontFamily: F.bold, fontSize: 40, color: RED, marginTop: 8 }}>$ —</Text>
      <Text style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 3, color: INK }}>REWARD SET AT KICKOFF</Text>
    </View>
  );
}

export default function Bounty() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(980);
  const { desk } = useLayout();
  const [tab, setTab] = useState<Tab>('board');
  const [sort, setSort] = useState<Sort>('big');
  const [line, setLine] = useState<number | null>(null);
  const [royale, setRoyale] = useState<number | null>(null);
  useEffect(() => {
    AsyncStorage.multiGet(['clashy:line:best', 'clashy:royale:best']).then(([[, a], [, b]]) => { if (a) setLine(Number(a)); if (b) setRoyale(Number(b)); }).catch(() => {});
  }, []);

  const board = (
    <View style={{ gap: 12 }}>
      <Chips items={[{ key: 'big', label: 'Biggest' }, { key: 'ending', label: 'Ending soon' }, { key: 'friends', label: 'Friends' }]} value={sort} onChange={setSort} />
      <Pending art={ART.tileBounty} title="Setup required: bounties" body={`Bounties are escrowed on chain: a player stakes a reward on their own week, hunters pay an entry to try and beat it. ${SOCIAL_SETUP}`} />
    </View>
  );
  const poster = (
    <View style={{ gap: 12, width: desk ? 360 : undefined }}>
      <Poster line={line} royale={royale} />
      <Btn title="Post my bounty" disabled />
      <Txt v="small" style={{ textAlign: 'center' }}>Posting a bounty stakes real money, so it opens with the program at the Blitz kickoff.</Txt>
      {line === null && royale === null ? <Btn title="Set a practice record" kind="ghost" onPress={() => router.push('/game/line')} /> : null}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Bounty</Txt><Txt v="small">Put a price on your head · beat theirs and take it</Txt></View>
      </Row>
      <Image source={ART.bannerBounty} style={{ width: '100%', aspectRatio: 16 / 9, maxHeight: 260, borderRadius: 20, marginBottom: 12 }} contentFit="cover" />
      {desk ? (
        <Row style={{ gap: 20, alignItems: 'flex-start' }}><View style={{ flex: 1 }}>{board}</View>{poster}</Row>
      ) : (
        <>
          <View style={{ marginBottom: 12 }}><UnderTabs items={[{ key: 'board', label: 'Board' }, { key: 'poster', label: 'My poster' }]} value={tab} onChange={setTab} /></View>
          {tab === 'board' ? board : poster}
        </>
      )}
    </ScrollView>
  );
}
