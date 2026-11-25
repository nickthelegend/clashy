// The clay sprite cast: every animation of the mascot and of LASER, playing, plus the fight stage that live clashes use,
// driven here by buttons that swing the score. Sprites come from scripts/make-sprites.py (see docs/ANIMATIONS.md).
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FightStage } from '@/ui/fight';
import { BackBtn, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { Sprite, type SpriteName } from '@/ui/sprite';
import { C, FONT, S } from '@/ui/tokens';

const CAST: { who: string; names: [SpriteName, string][] }[] = [
  { who: 'You', names: [['bo-idle', 'Stance'], ['bo-punch', 'Punch'], ['bo-hit', 'Takes a hit'], ['bo-ko', 'Knocked out'], ['bo-win', 'Wins'], ['bo-lose', 'Loses']] },
  { who: 'LASER, the rival', names: [['laser-idle', 'Trash talk'], ['laser-attack', 'Laser eyes'], ['laser-hit', 'Takes a hit'], ['laser-ko', 'Knocked out'], ['laser-win', 'Gloats'], ['laser-lose', 'Loses']] },
];

/** A one-shot animation restarts every 2.4 s here so it can be watched. */
function Tile({ name, label }: { name: SpriteName; label: string }) {
  const [n, setN] = useState(0);
  return (
    <Pressable onPress={() => setN((x) => x + 1)} accessibilityLabel={`Replay ${label}`} style={{ width: '31%', minWidth: 100, alignItems: 'center', backgroundColor: '#0E0E13', borderRadius: 20, paddingTop: 10, paddingBottom: 8 }}>
      <Sprite key={n} name={name} size={96} onDone={() => setTimeout(() => setN((x) => x + 1), 1400)} />
      <Text style={{ ...FONT.semi, fontSize: 13, color: C.ink, marginTop: 6 }}>{label}</Text>
    </Pressable>
  );
}

export default function Sprites() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const [score, setScore] = useState({ me: 0, them: 0, over: false, ko: '' as '' | 'me' | 'them' });
  const btn = (label: string, on: () => void) => (
    <Pressable onPress={on} style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: pressed ? '#24232C' : '#1A1A20' })}>
      <Text style={{ ...FONT.semi, fontSize: 14, color: C.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
      <Row style={{ gap: 10, marginBottom: 8 }}>
        <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Row>
      <Text style={{ ...FONT.bold, fontSize: 32, letterSpacing: -1, color: C.ink }}>The cast</Text>
      <Txt v="small" style={{ marginTop: 4 }}>Clay sprites for live clashes. Tap one to replay it.</Txt>

      <View style={{ backgroundColor: '#0E0E13', borderRadius: 24, padding: 16, marginTop: 16 }}>
        <Text style={{ ...FONT.semi, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: C.dim, marginBottom: 10 }}>Fight stage</Text>
        <FightStage myPnl={score.me} theirPnl={score.them} over={score.over} myKo={score.ko === 'me'} theirKo={score.ko === 'them'} size={120} />
        <Row style={{ gap: 8, marginTop: 10 }}>
          {btn('You gain', () => setScore((s) => ({ ...s, me: s.me + 0.01, over: false, ko: '' })))}
          {btn('Rival gains', () => setScore((s) => ({ ...s, them: s.them + 0.01, over: false, ko: '' })))}
        </Row>
        <Row style={{ gap: 8, marginTop: 8 }}>
          {btn('Bell', () => setScore((s) => ({ ...s, over: true })))}
          {btn('KO', () => setScore((s) => ({ ...s, over: true, ko: s.me >= s.them ? 'them' : 'me' })))}
          {btn('Reset', () => setScore({ me: 0, them: 0, over: false, ko: '' }))}
        </Row>
      </View>

      {CAST.map((c) => (
        <View key={c.who} style={{ marginTop: 20 }}>
          <Text style={{ ...FONT.semi, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: C.dim, marginBottom: 10 }}>{c.who}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {c.names.map(([n, l]) => <Tile key={n} name={n} label={l} />)}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
