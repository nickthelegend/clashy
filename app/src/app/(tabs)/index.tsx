// Home: what's happening between people. No coin lists, no holdings. Games live in the Arena.
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell } from '@/ui/icons';
import { ART, Btn, IconBtn, Pending, Row, Txt, Wordmark } from '@/ui/kit';
import { C, S } from '@/ui/tokens';

const Section = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => (
  <Row style={{ justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
    <Txt v="h2">{title}</Txt>
    {action ? <Pressable onPress={onAction}><Txt v="small">{action}</Txt></Pressable> : null}
  </Row>
);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <Wordmark height={24} />
        <Row style={{ gap: 8 }}>
          <Btn title="Connect" h={34} onPress={() => router.push('/wallet')} />
          <IconBtn><Bell size={18} color={C.ink} /></IconBtn>
        </Row>
      </Row>

      <Pressable onPress={() => router.push('/arena')} style={{ backgroundColor: C.s1, borderRadius: 18, padding: 16 }}>
        <Txt v="small">Arena</Txt>
        <Txt v="title" style={{ marginTop: 6 }}>Duel anyone.</Txt>
        <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>Knockout duels, draw the line, clan wars. Pick a game, pick any coin, beat a person.</Txt>
        <Row style={{ gap: 8, marginTop: 14 }}>
          <Btn title="Open the arena" h={40} style={{ flex: 1 }} onPress={() => router.push('/arena')} />
          <Btn title="Find my clan" kind="ghost" h={40} style={{ flex: 1 }} onPress={() => router.push('/clans')} />
        </Row>
      </Pressable>

      <Section title="Challenges for you" />
      <Pending art={ART.duels} title="No challenges yet" body="When someone calls you out, the challenge lands here with an Accept button." />

      <Section title="Live now" action="Arena" onAction={() => router.push('/arena')} />
      <Pending art={ART.bell} title="Nobody is dueling right now" body="Live duels between players show here so you can watch and back a side." />

      <Section title="Your clans" action="All clans" onAction={() => router.push('/clans')} />
      <Pending art={ART.clan} title="You're not in a clan" body="Join a clan to chat, push the pot and fight weekly wars." action="Browse clans" onAction={() => router.push('/clans')} />
      <View style={{ height: 8 }} />
    </ScrollView>
  );
}
