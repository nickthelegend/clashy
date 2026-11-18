// Chats (Nick's pick C2): filter pills, search and New, then every chat you are in: each channel of each squad, with
// its last message and what you have not read yet. Read from the squad channel accounts on chain; opening one goes
// to the full chat room.
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useChain } from '@/chain/useChain';
import { ago, usePoll, useProfiles } from '@/chain/social';
import { CHANNELS, metaOf, readChannelMetas, readMySquads, readSeen, seenOf } from '@/chain/squads';
import { useDeskColumn } from '@/ui/layout';
import { Search } from '@/ui/icons';
import { ART, Btn, CRESTS, ErrorLine, IconBtn, Pending, Row, SearchBar, SkeletonRows, Txt } from '@/ui/kit';
import { C, F, FONT, S } from '@/ui/tokens';

type Filter = 'all' | 'unread' | 'general' | 'trades';
const FILTERS: { key: Filter; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' }, { key: 'general', label: '#general' }, { key: 'trades', label: '#trades' }];

export default function Chats() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const chain = useChain();
  const me = chain.me;
  const [f, setF] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const squads = usePoll(() => (me ? readMySquads(me) : Promise.resolve([])), 8000, [me?.toBase58()]);
  const keys = squads.status === 'ready' ? squads.data.map((s) => s.key) : [];
  const sig = keys.map((k) => k.toBase58()).join(',');
  const metas = usePoll(() => readChannelMetas(keys), 4000, [sig]);
  const seen = usePoll(() => readSeen(keys), 4000, [sig]);
  const profiles = useProfiles();
  const names = profiles.status === 'ready' ? profiles.data : null;

  const rows = useMemo(() => {
    if (squads.status !== 'ready') return [];
    const m = metas.status === 'ready' ? metas.data : null;
    const s = seen.status === 'ready' ? seen.data : null;
    return squads.data.flatMap((sq) => CHANNELS.map((ch) => {
      const meta = metaOf(m, sq.key, ch.id);
      const unread = meta ? Math.max(0, meta.count - seenOf(s, sq.key, ch.id)) : 0;
      return { sq, ch, meta, unread, ts: meta?.last?.ts ?? 0 };
    })).sort((a, b) => b.ts - a.ts);
  }, [squads, metas, seen]);
  const list = rows.filter((r) => (f === 'all' || (f === 'unread' ? r.unread > 0 : r.ch.name === f))
    && (!q || `${r.sq.name} ${r.ch.name}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Txt v="title">Chats</Txt>
        <Row style={{ gap: 8 }}>
          <IconBtn size={36} onPress={() => setSearching((s) => !s)}><Search size={17} color={C.ink} /></IconBtn>
          <Btn title="New" h={36} onPress={() => router.push('/squads/discover' as Href)} />
        </Row>
      </Row>
      {searching ? <View style={{ marginBottom: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Search your squads" /></View> : null}
      <Row style={{ gap: 6, marginBottom: 14 }}>
        {FILTERS.map((x) => (
          <Pressable key={x.key} onPress={() => setF(x.key)} style={{ flex: 1, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: f === x.key ? C.white : C.s2 }}>
            <Text style={{ ...FONT.semi, fontSize: 13, color: f === x.key ? '#000' : C.ink }}>{x.label}</Text>
          </Pressable>
        ))}
      </Row>

      {!me ? (
        <Pending art={ART.emptyChats} title="Sign in to chat" body="Your squads' chats show here: #general, #trades and every challenge." action="Sign in" onAction={() => chain.wallet.login?.()} />
      ) : squads.status === 'loading' ? <SkeletonRows n={5} /> : squads.status === 'error' ? <ErrorLine msg={squads.error} /> : squads.data.length === 0 ? (
        <Pending art={ART.emptyChats} title="No chats yet" body="Join a squad and its #general and #trades show up here." action="Find a squad" onAction={() => router.push('/squads/discover' as Href)} />
      ) : list.length === 0 ? (
        <Txt v="small" style={{ textAlign: 'center', marginTop: 24 }}>{f === 'unread' ? 'You are all caught up.' : 'No chats match.'}</Txt>
      ) : list.map(({ sq, ch, meta, unread }) => {
        const last = meta?.last;
        const who = last ? (names?.get(last.author.toBase58())?.name ?? `${last.author.toBase58().slice(0, 4)}…`) : null;
        return (
          <Pressable key={`${sq.key.toBase58()}:${ch.id}`} onPress={() => router.push({ pathname: '/clan-chat', params: { clan: sq.key.toBase58(), ch: String(ch.id) } } as unknown as Href)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: pressed ? 0.6 : 1 })}>
            <View>
              <Image source={CRESTS[sq.crest % CRESTS.length]} style={{ width: 50, height: 50 }} contentFit="contain" />
              <View style={{ position: 'absolute', right: -4, bottom: -2, backgroundColor: C.s2, borderRadius: 8, paddingHorizontal: 4, borderWidth: 2, borderColor: C.bg }}><Txt v="small" color={C.ink} style={{ fontSize: 10, ...FONT.bold }}>#</Txt></View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Row style={{ gap: 6 }}>
                <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{sq.name}</Txt>
                <Txt v="small" color={C.muted}>#{ch.name}</Txt>
              </Row>
              <Txt v="small" lines={1} color={unread ? C.ink : C.muted} style={{ marginTop: 2 }}>
                {last ? `${who}: ${last.kind === 1 ? 'posted a clash challenge' : last.text}` : meta?.state === 'none' ? 'Not opened yet' : 'No messages yet'}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              <Txt v="small" style={{ fontSize: 12 }}>{last ? ago(last.ts) : ''}</Txt>
              {unread ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}><Txt v="small" color={C.onBrand} style={{ fontSize: 11.5, ...FONT.bold }}>{unread > 99 ? '99+' : unread}</Txt></View> : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
