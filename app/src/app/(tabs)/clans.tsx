// Clans: how many clans exist, then the list. Tapping one opens its chat room full screen.
import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SETUP_REASON, useClans } from '@/data/clans';
import { ART, Art, Btn, Pending, Press, Row, Txt } from '@/ui/kit';
import { C, R, S } from '@/ui/tokens';

export default function Clans() {
  const insets = useSafeAreaInsets();
  const clans = useClans();
  const list = clans.status === 'ready' ? clans.data : [];
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }}
      data={list}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="title">Clans</Txt>
            <Btn title="Create" kind="ghost" h={34} disabled={clans.status !== 'ready'} />
          </Row>
          <Txt v="small" style={{ marginTop: 4 }}>
            {clans.status === 'ready' ? `${list.length} clan${list.length === 1 ? '' : 's'} · tap one to open its chat room` : 'Clan count appears when clans go live'}
          </Txt>
        </View>
      }
      ListEmptyComponent={<Pending art={ART.clan} title={clans.status === 'ready' ? 'No clans yet' : 'Setup required: clans'} body={SETUP_REASON} />}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item: c }) => (
        <Press onPress={() => router.push({ pathname: '/clan/[id]', params: { id: c.id } })} style={{ backgroundColor: C.s1, borderRadius: R.lg, padding: 10 }}>
          <Row style={{ gap: 12 }}>
            <Art src={ART.crest} size={52} radius={14} />
            <View style={{ flex: 1 }}>
              <Txt v="label">{c.name}</Txt>
              <Txt v="small" style={{ marginTop: 2 }}>{c.members} members · {c.online} online{c.warRecord ? ` · ${c.warRecord}` : ''}</Txt>
            </View>
            <Txt v="small" color={C.brandSoft}>Open</Txt>
          </Row>
        </Press>
      )}
    />
  );
}
