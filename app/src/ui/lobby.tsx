// Lobby pieces for the game screens: a spinning ring of players, the ranked ladder strip, and custom room settings.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Bob } from './fx';
import { ART, AVATARS, Art, Btn, Card, RANKS, Row, Txt, UnderTabs } from './kit';
import { C, F } from './tokens';

/** Clay players orbit the centre art. Purely decorative: says how many fit a room, not who is online. */
export function AvatarRing({ size = 280, center }: { size?: number; center: number }) {
  const rot = useSharedValue(0);
  useEffect(() => { rot.value = withRepeat(withTiming(360, { duration: 40000, easing: Easing.linear }), -1, false); }, [rot]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const counter = useAnimatedStyle(() => ({ transform: [{ rotate: `${-rot.value}deg` }] }));
  const n = 12, r = size / 2 - 26, av = 46;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <View style={{ position: 'absolute', inset: 22, borderRadius: size, borderWidth: 2, borderColor: '#1E1E26', borderStyle: 'dashed' }} />
      <View style={{ position: 'absolute', inset: size * 0.2, borderRadius: size, backgroundColor: 'rgba(255,201,74,0.07)' }} />
      <Animated.View style={[{ position: 'absolute', inset: 0 }, spin]}>
        {Array.from({ length: n }).map((_, k) => {
          const a = (k / n) * Math.PI * 2;
          return (
            <Animated.View key={k} style={[{ position: 'absolute', left: size / 2 + Math.cos(a) * r - av / 2, top: size / 2 + Math.sin(a) * r - av / 2 }, counter]}>
              <Art src={AVATARS[k % AVATARS.length]} size={av} radius={0} />
            </Animated.View>
          );
        })}
      </Animated.View>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Bob amp={8} ms={1300}><Art src={center} size={size * 0.42} radius={0} /></Bob>
      </View>
    </View>
  );
}

/** Horizontal ladder of the ten ranks, current tier highlighted. */
export function RankStrip({ current }: { current?: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 4, alignItems: 'flex-start' }}>
      {RANKS.map((r) => {
        const on = r.n === current;
        return (
          <View key={r.key} style={{ width: 88, alignItems: 'center', paddingVertical: 10, borderRadius: 16, backgroundColor: on ? 'rgba(91,108,255,0.16)' : C.s1, borderWidth: 1.5, borderColor: on ? C.brand : 'transparent' }}>
            <Art src={r.src} size={46} radius={0} />
            <Txt v="small" color={r.color} style={{ fontFamily: F.bold, fontSize: 11.5, marginTop: 4, textAlign: 'center' }} lines={1}>{r.label}</Txt>
            <Txt v="small" style={{ fontSize: 10.5 }}>{r.n === 1 ? 'Start' : `${r.pts} pts`}</Txt>
          </View>
        );
      })}
    </ScrollView>
  );
}

type Tab = 'practice' | 'ranked' | 'custom';
const Opt = <T extends string | number>({ label, items, value, set }: { label: string; items: T[]; value: T; set: (v: T) => void }) => (
  <View style={{ marginTop: 12 }}>
    <Txt v="small" style={{ marginBottom: 6 }}>{label}</Txt>
    <Row style={{ gap: 6 }}>{items.map((v) => <Btn key={String(v)} title={String(v)} h={36} kind={value === v ? 'white' : 'ghost'} style={{ flex: 1 }} onPress={() => set(v)} />)}</Row>
  </View>
);

/** The Royale lobby under the chart: practice ring, ranked ladder, custom room settings. */
export function RoyaleLobby({ best }: { best: number | null }) {
  const [tab, setTab] = useState<Tab>('practice');
  const [rounds, setRounds] = useState<number>(20);
  const [lives, setLives] = useState<number>(3);
  const [players, setPlayers] = useState<number>(10);
  const [coin, setCoin] = useState<string>('VRF');
  return (
    <View style={{ marginTop: 14 }}>
      <UnderTabs items={[{ key: 'practice', label: 'Practice' }, { key: 'ranked', label: 'Ranked' }, { key: 'custom', label: 'Custom' }]} value={tab} onChange={setTab} />
      {tab === 'practice' ? (
        <View style={{ marginTop: 8 }}>
          <AvatarRing center={ART.tileRoyale} />
          <Txt v="label" style={{ textAlign: 'center' }}>Up to 20 players a room</Txt>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 2 }}>Practice is solo on the live price{best !== null ? ` · your best ${best} rounds` : ''}</Txt>
        </View>
      ) : tab === 'ranked' ? (
        <View style={{ marginTop: 12 }}>
          <Card style={{ padding: 14 }}>
            <Row style={{ gap: 12 }}>
              <Art src={RANKS[0].src} size={56} radius={0} />
              <View style={{ flex: 1 }}><Txt v="small">Your rank</Txt><Txt v="h2">Unranked</Txt><Txt v="small">Ranked opens with wallets at the Blitz kickoff</Txt></View>
            </Row>
            <Txt v="small" color="#B9B9C2" style={{ marginTop: 10, lineHeight: 18 }}>Ranked queue puts you in any game. MagicBlock VRF rolls Knockout duel, Draw the line or Royale. Wins earn points; climb from Exit Liquidity to The House.</Txt>
          </Card>
          <View style={{ marginTop: 10 }}><RankStrip /></View>
          <Btn title="Try a ranked roll" kind="brand" style={{ marginTop: 10 }} onPress={() => router.push('/ranked')} />
        </View>
      ) : (
        <View style={{ marginTop: 4 }}>
          <Opt label="Rounds" items={[10, 20, 30]} value={rounds} set={setRounds} />
          <Opt label="Lives" items={[1, 3, 5]} value={lives} set={setLives} />
          <Opt label="Players" items={[2, 5, 10, 20]} value={players} set={setPlayers} />
          <Opt label="Coin each round" items={['VRF', 'SOL', 'BTC', 'ETH']} value={coin} set={setCoin} />
          <Btn title="Create room · opens at kickoff" kind="white" disabled style={{ marginTop: 14 }} />
          <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Custom rooms get an invite link and a room pot on chain. Your settings: {rounds} rounds, {lives} lives, {players} players, {coin === 'VRF' ? 'random coin each round' : coin}.</Txt>
        </View>
      )}
    </View>
  );
}
