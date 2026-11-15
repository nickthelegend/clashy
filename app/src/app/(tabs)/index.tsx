// Home (Nick's pick, Nov 15): H2 live stories on top, H4 one-time "Play now" card, H5 posts feed.
// No coins, no holdings. Stories and posts come from the social backend; until it's live they show honest empty states.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { Bell, Bolt } from '@/ui/icons';
import { ART, Art, Btn, IconBtn, Pending, Row, Txt, UnderTabs, Wordmark } from '@/ui/kit';
import { C, F, S } from '@/ui/tokens';
import Svg, { Path } from 'react-native-svg';

type Tab = 'foryou' | 'following' | 'clans';

/** A story bubble: gradient ring when live. */
const Story = ({ label, add, onPress }: { label: string; add?: boolean; onPress?: () => void }) => (
  <Pressable onPress={onPress} style={{ width: 66, alignItems: 'center' }}>
    <View style={{ width: 64, height: 64, borderRadius: 32, padding: 2.5, backgroundColor: add ? C.s2 : C.brand }}>
      <View style={{ flex: 1, borderRadius: 30, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        {add ? (
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={C.brandSoft} strokeWidth={2.4} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
        ) : null}
      </View>
    </View>
    <Txt v="small" color={C.ink} style={{ marginTop: 6, fontSize: 12 }} lines={1}>{label}</Txt>
  </Pressable>
);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const [tab, setTab] = useState<Tab>('foryou');
  const { desk } = useLayout();
  const [showPlay, setShowPlay] = useState(true); // one-time card; dismissing hides it for this session

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        {desk ? <Txt v="title">Home</Txt> : <Wordmark height={24} />}
        <Row style={{ gap: 8 }}>
          <Btn title="Connect" h={36} onPress={() => router.push('/wallet')} />
          <IconBtn size={36}><Bell size={18} color={C.ink} /></IconBtn>
        </Row>
      </Row>

      {/* H2: live stories. Friends you have in common post stories of their duels. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.gutter, marginBottom: 14 }} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 10 }}>
        <Story label="Your story" add onPress={() => router.push('/wallet')} />
        <View style={{ justifyContent: 'center', paddingLeft: 4, maxWidth: 220 }}>
          <Txt v="small" style={{ lineHeight: 17 }}>Stories from friends and people you both know show here, live from their duels.</Txt>
        </View>
      </ScrollView>

      {/* H4: one-time Play now card */}
      {showPlay ? (
        <View style={{ borderRadius: 22, padding: 16, backgroundColor: C.brand, marginBottom: 18, overflow: 'hidden' }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Txt v="small" color="#D6DBFF" style={{ fontFamily: F.semi, letterSpacing: 0.6, fontSize: 11 }}>QUICK MATCH</Txt>
              <Txt v="title" color="#fff" style={{ marginTop: 4 }}>Play now</Txt>
              <Txt v="small" color="#DDE1FF" style={{ marginTop: 2 }}>Practice a knockout duel on a live price.</Txt>
            </View>
            <Art src={ART.tileDuel} size={72} radius={18} />
          </Row>
          <Row style={{ gap: 8, marginTop: 14 }}>
            <Btn title="Find a duel" kind="white" style={{ flex: 1 }} icon={<Bolt size={16} color="#000" />} onPress={() => router.push('/arena')} />
            <Btn title="Not now" kind="ghost" style={{ flex: 0.6, backgroundColor: 'rgba(255,255,255,0.16)' }} onPress={() => setShowPlay(false)} />
          </Row>
        </View>
      ) : null}

      {/* H5: posts feed */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <UnderTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'foryou', label: 'For you' }, { key: 'following', label: 'Following' }, { key: 'clans', label: 'Clans' }]} />
        <Btn title="Post" kind="ghost" h={34} style={{ marginBottom: 10 }} onPress={() => router.push('/wallet')} />
      </Row>
      <Pending
        art={ART.bell}
        title={tab === 'following' ? "You're not following anyone yet" : tab === 'clans' ? 'No clan posts yet' : 'No posts yet'}
        body="Posts carry a real duel result or an open challenge you can accept in one tap. Posting opens with accounts at the Blitz kickoff."
        action="Open the arena"
        onAction={() => router.push('/arena')}
      />
    </ScrollView>
  );
}
