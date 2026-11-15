// Chats (Nick's pick C2): filter pills, pinned + recent, search and New. Opening a chat goes to its own screen.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { SOCIAL_SETUP, useChats } from '@/data/social';
import { Search } from '@/ui/icons';
import { ART, Avatar, Btn, IconBtn, Pending, Row, SearchBar, SkeletonRows, Txt, useFirstLoad } from '@/ui/kit';
import { C, F, R, S } from '@/ui/tokens';
import { Text } from 'react-native';

type Filter = 'all' | 'dm' | 'clan' | 'challenge';
const FILTERS: { key: Filter; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'dm', label: 'DMs' }, { key: 'clan', label: 'Clans' }, { key: 'challenge', label: 'Challenges' }];

export default function Chats() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const [f, setF] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const loading = useFirstLoad();
  const chats = useChats();
  const list = chats.status === 'ready' ? chats.data.filter((c) => (f === 'all' || c.kind === f) && (!q || c.name.toLowerCase().includes(q.toLowerCase()))) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Txt v="title">Chats</Txt>
        <Row style={{ gap: 8 }}>
          <IconBtn size={36} onPress={() => setSearching((s) => !s)}><Search size={17} color={C.ink} /></IconBtn>
          <Btn title="New" h={36} disabled={chats.status !== 'ready'} />
        </Row>
      </Row>
      {searching ? <View style={{ marginBottom: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Search people and clans" /></View> : null}
      <Row style={{ gap: 6, marginBottom: 14 }}>
        {FILTERS.map((x) => (
          <Pressable key={x.key} onPress={() => setF(x.key)} style={{ flex: 1, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: f === x.key ? C.white : C.s2 }}>
            <Text style={{ fontFamily: F.semi, fontSize: 13, color: f === x.key ? '#000' : C.ink }}>{x.label}</Text>
          </Pressable>
        ))}
      </Row>

      {loading ? (
        <><Txt v="small" style={{ fontFamily: F.semi, fontSize: 11, letterSpacing: 0.6 }}>PINNED</Txt><SkeletonRows n={1} square /><View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} /><Txt v="small" style={{ fontFamily: F.semi, fontSize: 11, letterSpacing: 0.6 }}>RECENT</Txt><SkeletonRows n={4} /></>
      ) : chats.status !== 'ready' ? (
        <Pending art={ART.emptyChats} title="Setup required: chats" body={SOCIAL_SETUP} action="Practice a duel" onAction={() => router.push('/arena')} />
      ) : list.length === 0 ? (
        <Pending art={ART.emptyChats} title="No chats yet" body="Challenge someone or join a clan to start talking." />
      ) : (
        list.map((c) => (
          <Pressable key={c.id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id, name: c.name } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
            <Avatar name={c.name} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Row style={{ justifyContent: 'space-between' }}><Txt v="label">{c.name}</Txt><Txt v="small" style={{ fontSize: 11.5 }}>{new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Txt></Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 3 }}>
                <Txt v="small" lines={1} style={{ flex: 1 }}>{c.last}</Txt>
                {c.unread ? <View style={{ minWidth: 20, height: 20, borderRadius: R.pill, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><Txt v="small" color="#fff" style={{ fontSize: 11, fontFamily: F.bold }}>{c.unread}</Txt></View> : null}
              </Row>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
