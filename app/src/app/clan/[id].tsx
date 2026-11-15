// Clan chat room: its own full screen (outside the tabs, so no tab bar). Join, then talk.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SETUP_REASON, useClan } from '@/data/clans';
import { ART, Art, Avatar, BackBtn, Btn, Pending, Row, Txt } from '@/ui/kit';
import { C, F, R, S } from '@/ui/tokens';

export default function ClanRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const room = useClan(id);
  const [draft, setDraft] = useState('');
  const ready = room.status === 'ready';
  const joined = ready && room.data.joined;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* room header */}
      <Row style={{ gap: 10, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <BackBtn onPress={() => router.back()} />
        <Art src={ART.crest} size={40} radius={12} />
        <View style={{ flex: 1 }}>
          <Txt v="label" lines={1}>{ready ? room.data.clan.name : 'Clan room'}</Txt>
          <Txt v="small" lines={1}>{ready ? `${room.data.clan.members} members · ${room.data.clan.online} online` : 'Not live yet'}</Txt>
        </View>
        {!joined ? <Btn title="Join" h={34} disabled={!ready} /> : null}
      </Row>

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.gutter, gap: 12, flexGrow: 1, justifyContent: ready ? 'flex-end' : 'center' }}
        data={ready ? room.data.messages : []}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={<Pending art={ART.bell} title={ready ? 'Say hi to your clan' : 'Setup required: clan chat'} body={ready ? 'Messages land on a MagicBlock rollup the moment you send them.' : SETUP_REASON} />}
        renderItem={({ item: m }) => (
          <Row style={{ gap: 10, alignItems: 'flex-start' }}>
            <Avatar name={m.author} size={32} />
            <View style={{ flex: 1 }}>
              <Txt v="label">{m.author}</Txt>
              <Txt v="body" color="#C9C9D1" style={{ marginTop: 2, lineHeight: 19 }}>{m.text}</Txt>
            </View>
          </Row>
        )}
      />

      {/* composer: only usable once you've joined a live clan */}
      <Row style={{ gap: 8, paddingHorizontal: S.gutter, paddingTop: 8, paddingBottom: insets.bottom + 8, borderTopWidth: 1, borderTopColor: C.line }}>
        <TextInput
          value={draft} onChangeText={setDraft} editable={joined}
          placeholder={joined ? 'Message your clan' : ready ? 'Join to chat' : 'Chat opens when clans go live'}
          placeholderTextColor={C.muted}
          style={{ flex: 1, height: 44, borderRadius: R.md, backgroundColor: C.s1, paddingHorizontal: 14, color: C.ink, fontFamily: F.medium, fontSize: 14 }}
        />
        <Btn title="Send" h={44} disabled={!joined || !draft.trim()} />
      </Row>
    </KeyboardAvoidingView>
  );
}
