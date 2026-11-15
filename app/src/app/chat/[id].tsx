// A conversation: its own full screen (outside the tabs, no tab bar). Header, messages, duel cards, composer.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { SOCIAL_LIVE, SOCIAL_SETUP } from '@/data/social';
import { Swords } from '@/ui/icons';
import { ART, Art, Avatar, BackBtn, Btn, IconBtn, Pending, Row, STICKERS, Txt } from '@/ui/kit';
import { C, F, R, S } from '@/ui/tokens';

export default function Conversation() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const [draft, setDraft] = useState('');
  const title = name ?? 'Chat';
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg, ...col }}>
      <Row style={{ gap: 10, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <BackBtn onPress={() => router.back()} />
        <Avatar name={title} size={38} />
        <View style={{ flex: 1 }}>
          <Txt v="label" lines={1}>{title}</Txt>
          <Txt v="small">{SOCIAL_LIVE ? 'Online' : 'Not live yet'}</Txt>
        </View>
        {/* challenge from inside the conversation */}
        <IconBtn size={36} onPress={() => router.push({ pathname: '/duel/amount', params: { id: 'SOL' } })}><Swords size={17} color={C.brandSoft} /></IconBtn>
      </Row>
      <FlatList
        style={{ flex: 1 }}
        data={[] as { id: string }[]}
        keyExtractor={(m) => m.id}
        renderItem={() => null}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: S.gutter }}
        ListEmptyComponent={<Pending art={ART.bell} title={SOCIAL_LIVE ? 'Say hi' : 'Setup required: messages'} body={SOCIAL_LIVE ? 'Messages land on a MagicBlock rollup the moment you send them.' : SOCIAL_SETUP} />}
      />
      {/* reaction stickers: send-able once messages are live */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderTopWidth: 1, borderTopColor: C.line, opacity: SOCIAL_LIVE ? 1 : 0.45 }} contentContainerStyle={{ gap: 6, paddingHorizontal: S.gutter, paddingVertical: 8 }}>
        {STICKERS.map((st) => <Pressable key={st.key} disabled={!SOCIAL_LIVE} accessibilityLabel={`Send ${st.key} sticker`}><Art src={st.src} size={52} radius={0} /></Pressable>)}
      </ScrollView>
      <Row style={{ gap: 8, paddingHorizontal: S.gutter, paddingTop: 4, paddingBottom: insets.bottom + 8 }}>
        <TextInput value={draft} onChangeText={setDraft} editable={SOCIAL_LIVE} placeholder={SOCIAL_LIVE ? `Message ${title}` : 'Messages open at the Blitz kickoff'} placeholderTextColor={C.muted}
          style={{ flex: 1, height: 44, borderRadius: R.md, backgroundColor: C.s1, paddingHorizontal: 14, color: C.ink, fontFamily: F.medium, fontSize: 14 }} />
        <Btn title="Send" h={44} disabled={!SOCIAL_LIVE || !draft.trim()} />
      </Row>
    </KeyboardAvoidingView>
  );
}
