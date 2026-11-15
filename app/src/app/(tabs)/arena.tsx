// Arena: every game you can play. You never hold a coin here: a game asks you to pick any coin inside it.
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ART, Art, Btn, Press, Row, Txt } from '@/ui/kit';
import { C, R, S } from '@/ui/tokens';

type Game = { key: string; title: string; line: string; who: string; art?: number; status: 'practice' | 'soon'; go?: () => void };
const GAMES: Game[] = [
  { key: 'ko', title: 'Knockout duel', line: 'You pick any coin, they pick theirs. Hit your knockout line and you are out. Best % in 60 s takes the pot.', who: '1 v 1', art: ART.tileDuel, status: 'practice', go: () => router.push({ pathname: '/duel/amount', params: { id: 'SOL' } }) },
  { key: 'line', title: 'Draw the line', line: 'Draw the next 60 s of any coin with your finger. Closest line wins the room.', who: '3–10 players', art: ART.tileLine, status: 'soon' },
  { key: 'war', title: 'Clan war', line: 'Your clan vs theirs for a week. Push the pot, trade any coins, best return wins.', who: 'Clan vs clan', art: ART.tileWar, status: 'soon', go: () => router.push('/clans') },
  { key: 'royale', title: 'Royale', line: 'Call up or down every 10 s on any coin. Wrong call loses a life. Last one standing wins.', who: '5–20 players', status: 'soon' },
  { key: 'bounty', title: 'Bounty', line: 'Put a price on your head. Anyone who beats your % this week takes it.', who: 'Open', status: 'soon' },
];

export default function Arena() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24, gap: 10 }}>
      <Txt v="title">Arena</Txt>
      <Txt v="small" style={{ marginTop: -6, marginBottom: 4 }}>Pick a game. Each one lets you play any coin.</Txt>
      {GAMES.map((g) => (
        <Press key={g.key} onPress={g.go} haptic={!!g.go} style={{ backgroundColor: C.s1, borderRadius: R.xl, padding: 12 }}>
          <Row style={{ gap: 12, alignItems: 'flex-start' }}>
            {g.art ? <Art src={g.art} size={84} /> : <View style={{ width: 84, height: 84, borderRadius: 18, backgroundColor: '#000' }} />}
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="h2">{g.title}</Txt>
                <View style={{ backgroundColor: g.status === 'practice' ? C.upBg : C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Txt v="small" color={g.status === 'practice' ? C.up : C.muted} style={{ fontSize: 11 }}>{g.status === 'practice' ? 'Practice open' : 'Soon'}</Txt>
                </View>
              </Row>
              <Txt v="small" style={{ marginTop: 3 }}>{g.who}</Txt>
              <Txt v="small" color="#B9B9C2" style={{ marginTop: 6, lineHeight: 18 }}>{g.line}</Txt>
            </View>
          </Row>
          {g.key === 'ko' ? <Btn title="Play" h={40} style={{ marginTop: 12 }} onPress={g.go} /> : null}
        </Press>
      ))}
    </ScrollView>
  );
}
