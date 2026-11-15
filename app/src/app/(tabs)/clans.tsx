// Clans (Nick's pick K2): your clan as a hero card, search, discover clans to join. Tapping a clan opens its room.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { SETUP_REASON, useClans } from '@/data/clans';
import { Search } from '@/ui/icons';
import { ART, Art, Btn, crestFor, IconBtn, Pending, Press, Row, SearchBar, SkeletonRows, Txt, useFirstLoad } from '@/ui/kit';
import { C, F, R, S } from '@/ui/tokens';

export default function Clans() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const clans = useClans();
  const loading = useFirstLoad();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const live = clans.status === 'ready';
  const list = live ? clans.data.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Txt v="title">Clans</Txt>
        <Row style={{ gap: 8 }}>
          <IconBtn size={36} onPress={() => setSearching((s) => !s)}><Search size={17} color={C.ink} /></IconBtn>
          <Btn title="Create" h={36} disabled={!live} />
        </Row>
      </Row>
      {searching ? <View style={{ marginBottom: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Search clans" /></View> : null}

      {/* your clan hero */}
      <LinearGradient colors={['#2A33A8', '#5B6CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 16 }}>
        <Row style={{ gap: 12 }}>
          <Art src={ART.crestCreate} size={60} radius={16} />
          <View style={{ flex: 1 }}>
            <Txt v="small" color="#D6DBFF" style={{ fontFamily: F.semi, fontSize: 11, letterSpacing: 0.6 }}>YOUR CLAN</Txt>
            <Txt v="h2" color="#fff" style={{ marginTop: 2 }}>{live ? 'Pick a crew' : 'No clan yet'}</Txt>
            <Txt v="small" color="#DDE1FF" style={{ marginTop: 2 }}>Chat, push the pot, fight a war every week.</Txt>
          </View>
        </Row>
        <Row style={{ gap: 8, marginTop: 14 }}>
          <Btn title="Create a clan" kind="white" style={{ flex: 1 }} disabled={!live} />
          <Btn title="Find one" kind="ghost" style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.16)' }} onPress={() => setSearching(true)} />
        </Row>
        <Row style={{ gap: 8, marginTop: 8 }}>
          <Btn title="Clan Chest" kind="ghost" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={() => router.push('/clan/chest')} />
          <Btn title="Skirmish" kind="ghost" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={() => router.push('/game/skirmish')} />
        </Row>
        <Txt v="small" color="#C9CEFF" style={{ marginTop: 8, textAlign: 'center' }}>Practice the chest and skirmishes now · real clans open at the Blitz kickoff</Txt>
      </LinearGradient>

      <Row style={{ justifyContent: 'space-between', marginTop: 20, marginBottom: 6 }}>
        <Txt v="h2">Discover</Txt>
        <Txt v="small">{live ? `${clans.data.length} clans` : 'Count appears at launch'}</Txt>
      </Row>
      {loading ? (
        <SkeletonRows n={5} square />
      ) : !live ? (
        <Pending art={ART.clan} title="Setup required: clans" body={SETUP_REASON} />
      ) : list.length === 0 ? (
        <Pending art={q ? ART.emptySearch : ART.clan} title={q ? 'No clans match' : 'No clans yet'} body="Be the first: create a clan and invite your friends." />
      ) : (
        list.map((c) => (
          <Press key={c.id} onPress={() => router.push({ pathname: '/clan/[id]', params: { id: c.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
            <Art src={crestFor(c.name)} size={46} radius={13} />
            <View style={{ flex: 1 }}><Txt v="label">{c.name}</Txt><Txt v="small" style={{ marginTop: 2 }}>{c.members} members · {c.online} online</Txt></View>
            <Btn title="Join" kind="ghost" h={34} />
          </Press>
        ))
      )}
      <View style={{ height: 1, marginTop: 4, borderRadius: R.sm }} />
    </ScrollView>
  );
}
