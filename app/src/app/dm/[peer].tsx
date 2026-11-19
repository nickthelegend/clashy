// A direct message thread: /dm/<their wallet>. WhatsApp-style bubbles (yours lavender on the right) with the time
// and read ticks inside, swipe-to-reply, long-press reactions over a blurred chat, stickers and big emoji, and the
// WhatsApp-style composer (emoji key, 📎 shortcuts, a round send that is a quick 🔥 when empty). A Clash shortcut and
// a profile link up top. A thread from someone you don't follow shows as a request until you reply. Messages live on
// Clashy's social server and poll while open; replies and reactions are ordinary messages (see src/stickers).
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { useChain } from '@/chain/useChain';
import { readProfile, usePoll } from '@/chain/social';
import { social, useSocial, type Dm } from '@/chain/social-api';
import { reactBody, replyBody, stickerBody, type Sticker } from '@/stickers';
import { PackSheet } from '@/ui/chat-bits';
import { ChatComposer } from '@/ui/chat-composer';
import { ChatThread, type CMsg, type ReplyTo } from '@/ui/chat-thread';
import { ProfileAvatar } from '@/ui/feed';
import { Swords, User } from '@/ui/icons';
import { ART, BackBtn, ErrorLine, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, FONT, S } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/chats' as Href));

export default function DmRoute() {
  const { peer } = useLocalSearchParams<{ peer: string }>();
  const key = useMemo(() => { try { return new PublicKey(String(peer)); } catch { return null; } }, [peer]);
  if (!key) return <View style={{ flex: 1, backgroundColor: C.bg, padding: S.gutter, paddingTop: 60 }}><Pending art={ART.emptyChats} title="No player here" body="This chat link isn't a Solana address." action="Back to chats" onAction={back} /></View>;
  return <Thread peer={key} />;
}

function Thread({ peer }: { peer: PublicKey }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(760);
  const chain = useChain();
  const id = peer.toBase58();
  const me = chain.me?.toBase58();
  const prof = usePoll(() => readProfile(peer), 30_000, [id]);
  const p = prof.status === 'ready' ? prof.data ?? undefined : undefined;
  const myProf = usePoll(() => (chain.me ? readProfile(chain.me) : Promise.resolve(null)), 60_000, [me]);
  const mp = myProf.status === 'ready' ? myProf.data ?? undefined : undefined;
  const name = p?.name ?? `${id.slice(0, 4)}…${id.slice(-4)}`;
  const t = useSocial<{ messages: Dm[]; theirRead: number; request: boolean }>(me ? `/v1/dm/${id}` : null, 2500);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string>();
  const [extra, setExtra] = useState<Dm[]>([]);
  const [reply, setReply] = useState<ReplyTo | null>(null);
  const [pack, setPack] = useState<string | null>(null);
  const all = useMemo(() => {
    const msgs = t.data?.messages ?? [];
    return [...msgs, ...extra.filter((x) => !msgs.some((m) => m.id === x.id))].sort((a, b) => a.id - b.id);
  }, [t.data, extra]);
  const lastTheirs = [...all].reverse().find((m) => m.sender !== me)?.id;

  // mark what you've seen as read
  useEffect(() => {
    if (!lastTheirs || !chain.wallet.signer) return;
    social(chain.wallet.signer, `/v1/dm/${id}/read`, { method: 'POST', body: { id: lastTheirs } }).catch(() => {});
  }, [lastTheirs, id, chain.wallet.signer]);

  const post = async (body: string, after?: () => void) => {
    if (!body || sending) return;
    setSending(true); setErr(undefined);
    try {
      const m = await social<Dm>(chain.wallet.signer, `/v1/dm/${id}`, { method: 'POST', body: { body } });
      setExtra((x) => [...x, m]); after?.(); Haptics.selectionAsync(); t.reload();
    } catch (e) { setErr((e as Error).message); } finally { setSending(false); }
  };
  const withReply = (body: string) => (reply ? replyBody(reply.id, body) : body);
  const send = () => post(withReply(text.trim()), () => { setText(''); setReply(null); });
  const sendSticker = (s: Sticker) => post(withReply(stickerBody(s)), () => setReply(null));
  const quick = () => post(withReply('🔥'), () => setReply(null));
  const react = (to: number, emoji: string) => post(reactBody(to, emoji));
  const items: CMsg[] = useMemo(() => all.map((m) => ({ id: m.id, author: m.sender, at: m.at, body: m.body })), [all]);
  const who = (a: string) => (a === me
    ? { name: mp?.name ?? 'You', avatar: <ProfileAvatar p={mp} size={30} /> }
    : { name, avatar: <ProfileAvatar p={p} size={30} />, onPress: () => router.push(`/u/${id}` as Href) });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 9, backgroundColor: '#0B0B0F', borderBottomWidth: 1, borderBottomColor: '#17171D' }}>
        <Row style={[{ gap: 8 }, col]}>
          <BackBtn onPress={back} />
          <Pressable onPress={() => router.push(`/u/${id}` as Href)} accessibilityRole="button" accessibilityLabel={`${name}'s profile`} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ProfileAvatar p={p} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" lines={1} style={{ fontSize: 16.5 }}>{name}</Txt>
              <Txt v="small" lines={1} style={{ fontSize: 12 }}>{t.data?.request ? 'Message request' : 'Tap for profile'}</Txt>
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/clash' as Href)} accessibilityRole="button" accessibilityLabel={`Clash ${name}`}
            style={({ pressed }) => ({ height: 38, paddingHorizontal: 13, borderRadius: 19, backgroundColor: 'rgba(240,70,140,0.16)', flexDirection: 'row', alignItems: 'center', gap: 6, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            <Swords size={15} color={C.opp} /><Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 13 }}>Clash</Txt>
          </Pressable>
        </Row>
      </View>

      {!me ? (
        <View style={{ flex: 1, padding: S.gutter }}><Pending art={ART.emptyChats} title="Sign in to chat" body="Sign in to message players." action="Sign in" onAction={() => chain.wallet.login?.()} /></View>
      ) : t.error && !t.data ? (
        <View style={{ flex: 1, padding: S.gutter }}><ErrorLine msg={t.error} onRetry={t.reload} /></View>
      ) : t.loading && !t.data ? (
        <View style={{ flex: 1, padding: S.gutter }}><SkeletonRows n={4} /></View>
      ) : (
        <ChatThread msgs={items} me={me} who={who} seenUpTo={t.data?.theirRead} onReply={setReply} onReact={react} onPack={setPack} contentStyle={col}
          top={(
            <>
              <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 10 }}>
                <ProfileAvatar p={p} size={84} />
                <Txt v="h2" style={{ marginTop: 8 }}>{name}</Txt>
                <View style={{ marginTop: 8, backgroundColor: 'rgba(28,27,36,0.92)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 320 }}>
                  <Txt v="small" style={{ textAlign: 'center', fontSize: 12.5, lineHeight: 17 }}>{all.length ? 'Messages are between you two. Swipe one to reply, hold it to react.' : `Say gm to ${name}, or send a sticker.`}</Txt>
                </View>
              </View>
              {t.data?.request ? (
                <View style={{ backgroundColor: 'rgba(171,159,242,0.12)', borderRadius: 16, padding: 12, marginBottom: 6 }}>
                  <Txt v="small" color={C.ink} style={{ lineHeight: 18 }}>{name} wants to message you. You don&apos;t follow them yet; reply to accept.</Txt>
                </View>
              ) : null}
            </>
          )} />
      )}

      {me ? (
        <View style={col}>
          {err ? <View style={{ paddingHorizontal: S.gutter }}><ErrorLine msg={err} /></View> : null}
          <ChatComposer value={text} onChange={setText} onSend={send} onSticker={sendSticker} onQuick={quick} placeholder="Message" busy={sending}
            reply={reply} onCancelReply={() => setReply(null)}
            attach={[
              { key: 'clash', label: 'Clash', color: '#F0468C', icon: <Swords size={24} color="#fff" />, onPress: () => router.push('/clash' as Href) },
              { key: 'profile', label: 'Profile', color: '#3A8DFF', icon: <User size={24} color="#fff" />, onPress: () => router.push(`/u/${id}` as Href) },
            ]} />
        </View>
      ) : null}
      <PackSheet packId={pack} onClose={() => setPack(null)} onSend={me ? sendSticker : undefined} />
    </KeyboardAvoidingView>
  );
}
