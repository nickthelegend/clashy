// Chats, Instagram style: your squads' rooms in a strip up top, then three tabs. Messages are your direct messages,
// newest first, with unread counts. Notifications are who followed you or accepted your request, with Follow back,
// plus a link to game activity on your calls. Requests holds follow requests (Accept / Decline) and messages from
// people you don't follow yet. DMs and follows live on Clashy's social server (server/); squad rooms on the rollup.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChain } from '@/chain/useChain';
import { isTestAccount, usePoll, useProfiles, type Profile } from '@/chain/social';
import { CHANNELS, metaOf, readChannelMetas, readMySquads, readSeen, seenOf } from '@/chain/squads';
import { social, useInbox, type FollowState, type Note, type Thread } from '@/chain/social-api';
import { ProfileAvatar } from '@/ui/feed';
import { useCreate } from '@/ui/create';
import { Plus, Search } from '@/ui/icons';
import { ART, CRESTS, ErrorLine, IconBtn, Pending, Row, SearchBar, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { Sheet } from '@/ui/sheet';
import { C, FONT, S } from '@/ui/tokens';
import { previewText } from '@/stickers';
import { TourTarget } from '@/tour';

type Tab = 'messages' | 'notifications' | 'requests';
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
export const when = (ms: number) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : s < 7 * 86400 ? `${Math.floor(s / 86400)}d` : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const dm = (peer: string) => router.push(`/dm/${peer}` as Href);

export default function Chats() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const chain = useChain();
  const me = chain.me;
  const [tab, setTab] = useState<Tab>('messages');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [composing, setComposing] = useState(false);
  const inbox = useInbox();
  const profiles = useProfiles();
  const names = profiles.status === 'ready' ? profiles.data : null;
  const nameOf = (w: string) => names?.get(w)?.name ?? short(w);
  const c = inbox.data?.counts;
  const requests = (c?.followRequests ?? 0) + (c?.messageRequests ?? 0);

  const threads = (inbox.data?.threads ?? []).filter((t) => !t.request && (!q || nameOf(t.peer).toLowerCase().includes(q.toLowerCase())));
  const tabs: { key: Tab; label: string }[] = [
    { key: 'messages', label: c?.unreadThreads ? `Messages · ${c.unreadThreads}` : 'Messages' },
    { key: 'notifications', label: c?.unreadNotifications ? `Notifications · ${c.unreadNotifications}` : 'Notifications' },
    { key: 'requests', label: requests ? `Requests · ${requests}` : 'Requests' },
  ];
  const openTab = (k: Tab) => {
    setTab(k);
    if (k === 'notifications' && c?.unreadNotifications && chain.wallet.signer) social(chain.wallet.signer, '/v1/notifications/read', { method: 'POST' }).then(inbox.reload).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <Txt v="title">Chats</Txt>
          <Row style={{ gap: 8 }}>
            <IconBtn size={40} onPress={() => setSearching((s) => !s)}><Search size={18} color={C.ink} /></IconBtn>
            <TourTarget id="chats-new">
            <Pressable onPress={() => (me ? setComposing(true) : chain.wallet.login?.())} accessibilityRole="button" accessibilityLabel="New message"
              style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.brand, flexDirection: 'row', alignItems: 'center', gap: 6, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <Plus size={16} color={C.onBrand} /><Txt v="label" color={C.onBrand} style={{ fontSize: 14 }}>New</Txt>
            </Pressable>
            </TourTarget>
          </Row>
        </Row>
        {searching ? <View style={{ marginBottom: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Search your messages" /></View> : null}

        {!me ? (
          <TourTarget id="chats-signin"><Pending art={ART.emptyChats} title="Sign in to chat" body="Message any player, see who followed you, and answer follow requests." action="Sign in" onAction={() => chain.wallet.login?.()} /></TourTarget>
        ) : (
          <>
            <TourTarget id="chats-squads"><SquadStrip me={me} /></TourTarget>
            <TourTarget id="chats-tabs" style={{ marginTop: 16 }}><UnderTabsWide items={tabs} value={tab} onChange={openTab} /></TourTarget>
            {inbox.error && !inbox.data ? <ErrorLine msg={inbox.error} onRetry={inbox.reload} />
              : inbox.loading && !inbox.data ? <SkeletonRows n={5} />
                : tab === 'messages' ? (
                  threads.length === 0 ? (
                    <Pending art={ART.emptyChats} title={q ? 'No chats match' : 'No messages yet'} body={q ? 'Try another name.' : 'Message a player from their profile, or start one here.'}
                      action={q ? undefined : 'New message'} onAction={() => setComposing(true)} />
                  ) : threads.map((t) => <ThreadRow key={t.peer} t={t} me={me.toBase58()} p={names?.get(t.peer)} name={nameOf(t.peer)} />)
                ) : tab === 'notifications' ? (
                  <Notifications notes={inbox.data?.notifications ?? []} names={names} nameOf={nameOf} onChange={inbox.reload} />
                ) : (
                  <Requests follow={inbox.data?.followRequests ?? []} msgs={(inbox.data?.threads ?? []).filter((t) => t.request)} names={names} nameOf={nameOf} me={me.toBase58()} onChange={inbox.reload} />
                )}
            {inbox.error && inbox.data ? <ErrorLine msg={inbox.error} onRetry={inbox.reload} /> : null}
          </>
        )}
      </ScrollView>
      <NewMessage open={composing} onClose={() => setComposing(false)} names={names} me={me?.toBase58()} />
    </View>
  );
}

function UnderTabsWide({ items, value, onChange }: { items: { key: Tab; label: string }[]; value: Tab; onChange: (k: Tab) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: '#111116', borderRadius: 16, padding: 4, gap: 4, marginBottom: 12 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => { Haptics.selectionAsync(); onChange(it.key); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.s2 : 'transparent' }}>
            <Txt v="small" lines={1} color={on ? C.ink : C.dim} style={{ ...FONT.semi, fontSize: 13 }}>{it.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Your squads' rooms, like Instagram's notes row: one crest per squad, a dot when its #general has news. */
function SquadStrip({ me }: { me: import('@solana/web3.js').PublicKey }) {
  const { openSearch } = useCreate();
  const squads = usePoll(() => readMySquads(me), 10_000, [me.toBase58()]);
  const keys = squads.status === 'ready' ? squads.data.map((s) => s.key) : [];
  const sig = keys.map((k) => k.toBase58()).join(',');
  const metas = usePoll(() => readChannelMetas(keys), 6000, [sig]);
  const seen = usePoll(() => readSeen(keys), 6000, [sig]);
  if (squads.status !== 'ready') return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 8 }}>
      {squads.data.map((sq) => {
        const unread = CHANNELS.reduce((n, ch) => {
          const m = metaOf(metas.status === 'ready' ? metas.data : null, sq.key, ch.id);
          return n + (m ? Math.max(0, m.count - seenOf(seen.status === 'ready' ? seen.data : null, sq.key, ch.id)) : 0);
        }, 0);
        return (
          <Pressable key={sq.key.toBase58()} onPress={() => router.push({ pathname: '/clan-chat', params: { clan: sq.key.toBase58(), ch: '0' } } as unknown as Href)}
            accessibilityRole="button" accessibilityLabel={`${sq.name} squad chat${unread ? `, ${unread} new` : ''}`} style={{ width: 72, alignItems: 'center' }}>
            <View style={{ width: 66, height: 66, borderRadius: 33, padding: 3, borderWidth: 2.5, borderColor: unread ? C.brand : '#26262E', alignItems: 'center', justifyContent: 'center' }}>
              <Image source={CRESTS[sq.crest % CRESTS.length]} style={{ width: 52, height: 52 }} contentFit="contain" />
              {unread ? <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: C.brand, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Txt v="small" color={C.onBrand} style={{ fontSize: 10, ...FONT.bold }}>{unread > 99 ? '99+' : unread}</Txt></View> : null}
            </View>
            <Txt v="small" lines={1} color={C.ink} style={{ fontSize: 11.5, marginTop: 5 }}>{sq.name}</Txt>
          </Pressable>
        );
      })}
      <Pressable onPress={() => openSearch('squads')} accessibilityRole="button" accessibilityLabel="Find a squad" style={{ width: 72, alignItems: 'center' }}>
        <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: '#15151B', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={ART.clanCity} style={{ width: 46, height: 46 }} contentFit="contain" />
        </View>
        <Txt v="small" lines={1} style={{ fontSize: 11.5, marginTop: 5 }}>{squads.data.length ? 'More' : 'Squads'}</Txt>
      </Pressable>
    </ScrollView>
  );
}

function ThreadRow({ t, me, p, name }: { t: Thread; me: string; p?: Profile; name: string }) {
  const mine = t.last.sender === me;
  return (
    <Pressable onPress={() => dm(t.peer)} accessibilityRole="button" accessibilityLabel={`Chat with ${name}${t.unread ? `, ${t.unread} unread` : ''}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <ProfileAvatar p={p} size={54} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1} style={{ ...(t.unread ? FONT.bold : FONT.semi) }}>{name}</Txt>
        <Txt v="small" lines={1} color={t.unread ? C.ink : C.muted} style={{ marginTop: 2, ...(t.unread ? FONT.semi : {}) }}>{mine ? 'You: ' : ''}{previewText(t.last.body)} · {when(t.last.at)}</Txt>
      </View>
      {t.unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.brand }} /> : null}
    </Pressable>
  );
}

function FollowBtn({ who, state, onDone, small }: { who: string; state: FollowState; onDone: () => void; small?: boolean }) {
  const chain = useChain();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const go = async () => {
    setBusy(true); setErr(undefined);
    try { await social(chain.wallet.signer, `/v1/follow/${who}`, { method: state === 'none' ? 'POST' : 'DELETE' }); Haptics.selectionAsync(); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const on = state !== 'none';
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Pressable onPress={go} disabled={busy} accessibilityRole="button" accessibilityLabel={on ? 'Unfollow' : 'Follow back'}
        style={({ pressed }) => ({ height: small ? 34 : 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: on ? C.s2 : C.brand, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Txt v="small" color={on ? C.ink : C.onBrand} style={{ ...FONT.semi, fontSize: 13 }}>{state === 'accepted' ? 'Following' : state === 'pending' ? 'Requested' : 'Follow back'}</Txt>
      </Pressable>
      {err ? <Txt v="small" color={C.down} style={{ fontSize: 11, marginTop: 2 }} lines={2}>{err}</Txt> : null}
    </View>
  );
}

const NOTE_TEXT: Record<Note['kind'], string> = { follow: 'started following you.', follow_request: 'asked to follow you.', follow_accept: 'accepted your follow request.' };
function Notifications({ notes, names, nameOf, onChange }: { notes: Note[]; names: Map<string, Profile> | null; nameOf: (w: string) => string; onChange: () => void }) {
  return (
    <View>
      <Pressable onPress={() => router.push('/inbox' as Href)} accessibilityRole="button" accessibilityLabel="Game activity"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? '#17171D' : '#111116', borderRadius: 20, padding: 12, marginBottom: 8 })}>
        <Image source={ART.bellArt} style={{ width: 46, height: 46 }} contentFit="contain" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label">Game activity</Txt>
          <Txt v="small" lines={1} style={{ marginTop: 2 }}>Replies and likes on your calls, clash challenges, squad votes</Txt>
        </View>
        <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>
      </Pressable>
      {notes.length === 0 ? <Txt v="small" style={{ textAlign: 'center', marginTop: 18 }}>No notifications yet. Follows show up here.</Txt> : notes.map((n) => (
        <Row key={n.id} style={{ gap: 12, paddingVertical: 10 }}>
          <Pressable onPress={() => router.push(`/u/${n.actor}` as Href)} accessibilityLabel={`${nameOf(n.actor)}'s profile`}><ProfileAvatar p={names?.get(n.actor)} size={46} /></Pressable>
          <Txt v="small" color={C.ink} style={{ flex: 1, lineHeight: 19, fontSize: 14 }}>
            <Txt v="small" color={C.ink} style={{ ...FONT.bold, fontSize: 14 }}>{nameOf(n.actor)}</Txt> {NOTE_TEXT[n.kind]} <Txt v="small" color={C.dim} style={{ fontSize: 13 }}>{when(n.at)}</Txt>
          </Txt>
          {n.kind === 'follow' ? <FollowBtn who={n.actor} state={n.youFollow} onDone={onChange} small /> : !n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand }} /> : null}
        </Row>
      ))}
    </View>
  );
}

function Requests({ follow, msgs, names, nameOf, me, onChange }: { follow: { who: string; at: number }[]; msgs: Thread[]; names: Map<string, Profile> | null; nameOf: (w: string) => string; me: string; onChange: () => void }) {
  const chain = useChain();
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();
  const act = async (who: string, d: 'accept' | 'decline') => {
    setBusy(who); setErr(undefined);
    try { await social(chain.wallet.signer, `/v1/requests/${who}/${d}`, { method: 'POST' }); Haptics.selectionAsync(); onChange(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(undefined); }
  };
  if (!follow.length && !msgs.length) return <Pending art={ART.invite} title="No requests" body="Follow requests (when your account is private) and messages from people you don't follow wait here." />;
  return (
    <View>
      {follow.length ? <Txt v="label" style={{ marginTop: 4, marginBottom: 4 }}>Follow requests</Txt> : null}
      {follow.map((r) => (
        <Row key={r.who} style={{ gap: 12, paddingVertical: 10 }}>
          <Pressable onPress={() => router.push(`/u/${r.who}` as Href)}><ProfileAvatar p={names?.get(r.who)} size={46} /></Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="label" lines={1}>{nameOf(r.who)}</Txt>
            <Txt v="small">wants to follow you · {when(r.at)}</Txt>
          </View>
          <Pressable onPress={() => act(r.who, 'accept')} disabled={busy === r.who} accessibilityRole="button" accessibilityLabel={`Accept ${nameOf(r.who)}`}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.brand, justifyContent: 'center', opacity: busy === r.who ? 0.6 : 1 }}>
            <Txt v="small" color={C.onBrand} style={{ ...FONT.semi, fontSize: 13 }}>Accept</Txt>
          </Pressable>
          <Pressable onPress={() => act(r.who, 'decline')} disabled={busy === r.who} accessibilityRole="button" accessibilityLabel={`Decline ${nameOf(r.who)}`}
            style={{ height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.s2, justifyContent: 'center' }}>
            <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 13 }}>Decline</Txt>
          </Pressable>
        </Row>
      ))}
      {err ? <ErrorLine msg={err} /> : null}
      {msgs.length ? <Txt v="label" style={{ marginTop: 14, marginBottom: 2 }}>Message requests</Txt> : null}
      {msgs.length ? <Txt v="small" style={{ marginBottom: 4 }}>From people you don&apos;t follow. Reply to move them to Messages.</Txt> : null}
      {msgs.map((t) => <ThreadRow key={t.peer} t={t} me={me} p={names?.get(t.peer)} name={nameOf(t.peer)} />)}
    </View>
  );
}

/** Start a chat with any player on Clashy. */
function NewMessage({ open, onClose, names, me }: { open: boolean; onClose: () => void; names: Map<string, Profile> | null; me?: string }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => [...(names?.values() ?? [])]
    .filter((p) => p.owner.toBase58() !== me && !isTestAccount(p) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    .slice(0, 40), [names, q, me]);
  return (
    <Sheet open={open} onClose={onClose} title="New message" sub="Message any player. If they don't follow you, it lands in their requests.">
      <SearchBar value={q} onChange={setQ} placeholder="Search players" />
      <View style={{ marginTop: 8 }}>
        {!names ? <SkeletonRows n={4} /> : list.length === 0 ? <Txt v="small" style={{ textAlign: 'center', marginTop: 16 }}>No players match.</Txt> : list.map((p) => (
          <Pressable key={p.owner.toBase58()} onPress={() => { onClose(); dm(p.owner.toBase58()); }} accessibilityRole="button" accessibilityLabel={`Message ${p.name}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
            <ProfileAvatar p={p} size={42} />
            <Txt v="label" lines={1} style={{ flex: 1 }}>{p.name}</Txt>
            <Txt v="small" color={C.brandSoft} style={{ ...FONT.semi }}>Message</Txt>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
