// Arena (Nick's pick A6): swipe between game modes, one huge Battle button. Any coin is picked inside the game.
import { ClayLoop, type ClayName } from '@/ui/clay';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swords } from '@/ui/icons';
import { ART, Art, Btn, Row, Txt } from '@/ui/kit';
import { C, F, R, S } from '@/ui/tokens';
import { useLayout } from '@/ui/layout';
import { Bob } from '@/ui/fx';
import { ScrollView } from 'react-native';

type Mode = { key: string; title: string; who: string; line: string; art: number; banner?: number; live: boolean };
const MODES: Mode[] = [
  { key: 'onchain', title: 'On-chain duel', who: 'Real escrow · Solana + MagicBlock rollup', line: 'The real program: stakes in escrow, a rolled coin, sealed picks, scored live on a MagicBlock rollup and settled on Solana.', art: ART.tileDuel, live: true },
  { key: 'onchain-royale', title: 'On-chain Royale', who: 'Real escrow · 2–16 players · 10 s rounds', line: 'Entries in escrow, rounds called on a MagicBlock rollup, survivors paid on Solana.', art: ART.tileRoyale, live: true },
  { key: 'onchain-clan', title: 'On-chain clan', who: 'Real chest · weighted votes', line: 'A clan chest on Solana: propose a trade, vote by deposit, the captain executes it at the live price.', art: ART.coinsPile ?? ART.crown, live: true },
  { key: 'ko', title: 'Knockout duel', who: '1 v 1 · quick match · 60 s', line: 'Quick match a rival. One coin is rolled for both of you (MagicBlock VRF in the on-chain duel). Pick long or short. Hit your knockout line and you are out.', art: ART.tileDuel, banner: ART.bannerDuel, live: true },
  { key: 'clash', title: 'Coin clash', who: '1 v 1 · each picks a coin · 60 s', line: 'You pick any coin, they pick theirs. Best % in 60 s takes the pot.', art: ART.ko, live: true },
  { key: 'diamond', title: 'Diamond Hands', who: 'Solo now · rooms at launch · max 3 min', line: 'Buy with leverage and hold as long as you dare. A knockout trails your peak. Sell before it catches you.', art: ART.tileDiamond, banner: ART.bannerDiamond, live: true },
  { key: 'streak', title: 'Hot Streak', who: 'Solo · a call every 5 s', line: 'Higher or lower, every 5 seconds. The combo grows with your streak. One miss ends it.', art: ART.ko, live: true },
  { key: 'snipe', title: 'Peak Snipe', who: 'Solo · 30 s · one tap', line: 'Hold a live coin for 30 seconds. One tap to sell. Score how close you got to the top.', art: ART.tileBounty, live: true },
  { key: 'cup', title: 'Daily Cup', who: 'Everyone · one run a day', line: 'One coin of the day for everyone. One shot at Draw the line. New cup at 00:00 UTC.', art: ART.tileCup, banner: ART.bannerCup, live: true },
  { key: 'line', title: 'Draw the line', who: '3–10 players · any coin', line: 'Draw the next 60 s with your finger. Closest line wins the room.', art: ART.tileLine, banner: ART.bannerLine, live: true },
  { key: 'skirmish', title: 'Clan Skirmish', who: 'Clan vs clan · best of 5', line: 'Each round rolls a coin. Make your clan\'s call. First clan to 3 rounds wins.', art: ART.tileWar, live: true },
  { key: 'chest', title: 'Clan Chest', who: 'Trade as a group', line: 'Propose a trade on the clan pot, vote, and the captain executes it on the live price.', art: ART.coinsPile ?? ART.crown, live: true },
  { key: 'war', title: 'Clan war', who: 'Clan vs clan · one week', line: 'Push the pot, trade any coins, best return wins the war.', art: ART.tileWar, banner: ART.bannerWar, live: false },
  { key: 'royale', title: 'Royale', who: '5–20 players · 10 s rounds', line: 'Call up or down on any coin. Wrong call loses a life.', art: ART.tileRoyale, banner: ART.bannerRoyale, live: true },
  { key: 'bounty', title: 'Bounty', who: 'Open · one week', line: 'Put a price on your head. Beat it and take it.', art: ART.tileBounty, banner: ART.bannerBounty, live: false },
];
/** Higgsfield clay loops for the games that have one. */
const LOOPS: Record<string, ClayName | undefined> = { ko: 'duel', royale: 'royale', 'onchain-royale': 'royale', diamond: 'diamond', line: 'line', cup: 'cup', skirmish: 'war', war: 'war' };
const STAKES = [5, 10, 20, 50];
/** Opens a mode's game. Practice modes play on live prices; Clan war and Bounty open their preview screens. */
const play = (key: string, stake: number) => {
  if (key === 'line') router.push('/game/line');
  else if (key === 'royale') router.push('/game/royale');
  else if (key === 'war') router.push('/game/war');
  else if (key === 'onchain') router.push('/onchain');
  else if (key === 'onchain-royale') router.push('/onchain-royale');
  else if (key === 'onchain-clan') router.push('/onchain-clan');
  else if (key === 'streak') router.push('/game/streak');
  else if (key === 'snipe') router.push('/game/snipe');
  else if (key === 'skirmish') router.push('/game/skirmish');
  else if (key === 'chest') router.push('/clan/chest');
  else if (key === 'diamond') router.push('/game/diamond');
  else if (key === 'cup') router.push('/game/cup');
  else if (key === 'bounty') router.push('/game/bounty');
  else if (key === 'ko') router.push({ pathname: '/duel/match', params: { stake: String(stake) } });
  else router.push({ pathname: '/duel/amount', params: { id: 'SOL', stake: String(stake) } });
};

/** Desktop Arena: every game in a grid, the selected one's Battle panel pinned on the right. */
function ArenaDesk() {
  const [i, setI] = useState(0);
  const [stake, setStake] = useState(20);
  const m = MODES[i];
  const battle = () => play(m.key, stake);
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 28, gap: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View><Txt v="title">Arena</Txt><Txt v="small" style={{ marginTop: 4 }}>Three modes run on the real program: escrow on Solana, play on a MagicBlock rollup. The rest are free practice on live prices.</Txt></View>
          <Btn title="Leaderboard" kind="ghost" h={38} onPress={() => router.push('/leaderboard')} />
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {MODES.map((g, k) => {
            const on = k === i;
            return (
              <Pressable key={g.key} onPress={() => setI(k)} style={(st) => ({
                width: 300, backgroundColor: C.s1, borderRadius: R.xl, padding: 12,
                borderWidth: 1.5, borderColor: on ? C.brand : (st as { hovered?: boolean }).hovered ? '#2A2A30' : 'transparent',
              })}>
                {g.banner ? <Image source={g.banner} style={{ width: 276, height: 155, borderRadius: 14 }} contentFit="cover" /> : (
                  <View style={{ width: 276, height: 155, borderRadius: 14, backgroundColor: '#15151C', alignItems: 'center', justifyContent: 'center' }}><Art src={g.art} size={130} radius={0} /></View>
                )}
                <Row style={{ justifyContent: 'space-between', marginTop: 12 }}>
                  <Txt v="h2">{g.title}</Txt>
                  <View style={{ backgroundColor: g.live ? C.upBg : C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}><Txt v="small" color={g.live ? C.up : C.muted} style={{ fontSize: 11 }}>{g.live ? 'Practice' : 'Soon'}</Txt></View>
                </Row>
                <Txt v="small" style={{ marginTop: 4 }}>{g.who}</Txt>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ width: 360, borderLeftWidth: 1, borderLeftColor: C.line, padding: 22 }}>
        <Txt v="small" style={{ fontFamily: F.semi, letterSpacing: 0.8, fontSize: 11 }}>SELECTED MODE</Txt>
        <Txt v="title" style={{ marginTop: 6 }}>{m.title}</Txt>
        <Txt v="small" style={{ marginTop: 4 }}>{m.who}</Txt>
        <Txt v="body" color="#B9B9C2" style={{ marginTop: 14, lineHeight: 21 }}>{m.line}</Txt>
        <Txt v="small" color={C.ink} style={{ marginTop: 22, marginBottom: 8 }}>Stake</Txt>
        <Row style={{ gap: 8 }}>
          {STAKES.map((v) => <Btn key={v} title={`$${v}`} h={38} kind={stake === v ? 'white' : 'ghost'} style={{ flex: 1 }} onPress={() => setStake(v)} />)}
        </Row>
        <View style={{ flex: 1 }} />
        <Btn title={m.live ? 'Battle' : 'See how it works'} h={60} kind={m.live ? 'brand' : 'white'} icon={m.live ? <Swords size={20} color="#fff" /> : undefined} style={{ borderRadius: 18 }} onPress={battle} />
        <Txt v="small" style={{ textAlign: 'center', marginTop: 10 }}>{m.live ? 'Practice on a live price · real duels open at the Blitz kickoff' : 'Preview on live coins · wars and bounties open at the Blitz kickoff'}</Txt>
      </View>
    </View>
  );
}

export default function Arena() {
  const { desk } = useLayout();
  return desk ? <ArenaDesk /> : <ArenaPhone />;
}

function ArenaPhone() {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const [stake, setStake] = useState(20);
  const m = MODES[i];
  const go = (d: number) => { Haptics.selectionAsync(); setI((x) => (x + d + MODES.length) % MODES.length); };
  const swipe = Gesture.Pan().activeOffsetX([-24, 24]).onEnd((e) => { runOnJS(go)(e.translationX < 0 ? 1 : -1); });
  const battle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    play(m.key, stake);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8, paddingHorizontal: S.gutter }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="title">Arena</Txt>
        <Row style={{ gap: 8 }}>
          <View style={{ backgroundColor: C.upBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}><Txt v="small" color={C.up} style={{ fontSize: 11.5 }}>Practice open</Txt></View>
          <Btn title="Ranked" kind="white" h={32} onPress={() => router.push('/ranked')} />
          <Btn title="Ranks" kind="ghost" h={32} onPress={() => router.push('/leaderboard')} />
        </Row>
      </Row>

      <GestureDetector gesture={swipe}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <Txt v="small" style={{ fontFamily: F.semi, letterSpacing: 0.8, fontSize: 11 }}>MODE</Txt>
            <Row style={{ gap: 14, marginTop: 6 }}>
              <Pressable onPress={() => go(-1)} hitSlop={12}><Text style={{ color: C.dim, fontSize: 26, fontFamily: F.semi }}>‹</Text></Pressable>
              <Txt v="title" style={{ minWidth: 200, textAlign: 'center' }}>{m.title}</Txt>
              <Pressable onPress={() => go(1)} hitSlop={12}><Text style={{ color: C.dim, fontSize: 26, fontFamily: F.semi }}>›</Text></Pressable>
            </Row>
            <Txt v="small" style={{ marginTop: 4 }}>{m.who}</Txt>
          </View>
          <Animated.View key={m.key} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={{ alignItems: 'center', marginTop: 22 }}>
            {LOOPS[m.key] ? <ClayLoop name={LOOPS[m.key]!} size={240} style={{ borderRadius: 44 }} /> : <Bob amp={10} ms={1500}><Art src={m.art} size={220} radius={44} /></Bob>}
            <Txt v="small" color="#B9B9C2" style={{ textAlign: 'center', marginTop: 16, lineHeight: 19, maxWidth: 300 }}>{m.line}</Txt>
          </Animated.View>
          <Row style={{ gap: 6, justifyContent: 'center', marginTop: 16 }}>
            {MODES.map((x, k) => <View key={x.key} style={{ width: k === i ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? C.ink : '#333' }} />)}
          </Row>
        </View>
      </GestureDetector>

      <Row style={{ gap: 8, justifyContent: 'center', marginBottom: 14 }}>
        {STAKES.map((v) => (
          <Btn key={v} title={`$${v}`} h={36} kind={stake === v ? 'white' : 'ghost'} style={{ flex: 1 }} onPress={() => setStake(v)} />
        ))}
      </Row>
      <Btn
        title={m.live ? 'Battle' : 'See how it works'}
        h={60}
        kind={m.live ? 'brand' : 'white'}
        icon={m.live ? <Swords size={20} color="#fff" /> : undefined}
        style={{ borderRadius: 18, marginBottom: 14 }}
        onPress={battle}
      />
    </View>
  );
}
