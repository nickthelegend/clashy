// A direct message thread: /dm/<their wallet>. Bubbles (yours on the right in lavender), day dividers, "Seen" under
// your last message once they've read it, a Clash shortcut and a profile link up top. A thread from someone you don't
// follow shows as a request until you reply. Messages live on Clashy's social server; it polls while open.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { useChain } from '@/chain/useChain';
import { readProfile, usePoll } from '@/chain/social';
import { social, useSocial, type Dm } from '@/chain/social-api';
import { ProfileAvatar } from '@/ui/feed';
import { ArrowUp, Swords } from '@/ui/icons';
import { ART, BackBtn, ErrorLine, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, FONT, S } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/chats' as Href));
const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default function DmRoute() {
  const { peer } = useLocalSearchParams<{ peer: string }>();
  const key = useMemo(() => { try { return new PublicKey(String(peer)); } catch { return null; } }, [peer]);
  if (!key) return <View style={{ flex: 1, backgroundColor: C.bg, padding: S.gutter, paddingTop: 60 }}><Pending art={ART.emptyChats} title="No player here" body="This chat link isn't a Solana address." action="Back to chats" onAction={back} /></View>;
  return <Thread peer={key} />;
}

function Thread({ peer }: { peer: PublicKey }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const chain = useChain();
  const id = peer.toBase58();
  const me = chain.me?.toBase58();
  const prof = usePoll(() => readProfile(peer), 30_000, [id]);
  const p = prof.status === 'ready' ? prof.data ?? undefined : undefined;
  const name = p?.name ?? `${id.slice(0, 4)}…${id.slice(-4)}`;
  const t = useSocial<{ messages: Dm[]; theirRead: number; request: boolean }>(me ? `/v1/dm/${id}` : null, 2500);
  const msgs = t.data?.messages ?? [];
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string>();
  const [extra, setExtra] = useState<Dm[]>([]);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const all = useMemo(() => [...msgs, ...extra.filter((x) => !msgs.some((m) => m.id === x.id))], [msgs, extra]);
  const lastTheirs = [...all].reverse().find((m) => m.sender !== me)?.id;

  // mark what you've seen as read
  useEffect(() => {
    if (!lastTheirs || !chain.wallet.signer) return;
    social(chain.wallet.signer, `/v1/dm/${id}/read`, { method: 'POST', body: { id: lastTheirs } }).catch(() => {});
  }, [lastTheirs, id, chain.wallet.signer]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60); }, [all.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setErr(undefined);
    try {
      const m = await social<Dm>(chain.wallet.signer, `/v1/dm/${id}`, { method: 'POST', body: { body } });
      setExtra((x) => [...x, m]); setText(''); Haptics.selectionAsync(); t.reload();
    } catch (e) { setErr((e as Error).message); } finally { setSending(false); }
  };
  const lastMine = [...all].reverse().find((m) => m.sender === me);
  const seen = !!lastMine && (t.data?.theirRead ?? 0) >= lastMine.id;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#15151A' }}>
        <Row style={[{ gap: 10 }, col]}>
          <BackBtn onPress={back} />
          <Pressable onPress={() => router.push(`/u/${id}` as Href)} accessibilityRole="button" accessibilityLabel={`${name}'s profile`} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ProfileAvatar p={p} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" lines={1}>{name}</Txt>
              <Txt v="small" lines={1} style={{ fontSize: 12 }}>View profile</Txt>
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/clash' as Href)} accessibilityRole="button" accessibilityLabel={`Clash ${name}`}
            style={({ pressed }) => ({ height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: C.s2, flexDirection: 'row', alignItems: 'center', gap: 6, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            <Swords size={15} color={C.ink} /><Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 13 }}>Clash</Txt>
          </Pressable>
        </Row>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingHorizontal: S.gutter, paddingTop: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        {!me ? <Pending art={ART.emptyChats} title="Sign in to chat" body="Sign in to message players." action="Sign in" onAction={() => chain.wallet.login?.()} />
          : t.error && !t.data ? <ErrorLine msg={t.error} onRetry={t.reload} />
            : t.loading && !t.data ? <SkeletonRows n={4} />
              : (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 18 }}>
                    <ProfileAvatar p={p} size={84} />
                    <Txt v="h2" style={{ marginTop: 8 }}>{name}</Txt>
                    <Txt v="small" style={{ marginTop: 2 }}>{all.length ? 'Messages are between you two.' : `Say gm to ${name}.`}</Txt>
                  </View>
                  {t.data?.request ? (
                    <View style={{ backgroundColor: 'rgba(171,159,242,0.12)', borderRadius: 16, padding: 12, marginBottom: 12 }}>
                      <Txt v="small" color={C.ink} style={{ lineHeight: 18 }}>{name} wants to message you. You don&apos;t follow them yet; reply to accept.</Txt>
                    </View>
                  ) : null}
                  {all.map((m, i) => {
                    const mine = m.sender === me;
                    const prev = all[i - 1];
                    const newDay = !prev || day(prev.at) !== day(m.at);
                    const joined = prev && !newDay && prev.sender === m.sender && m.at - prev.at < 5 * 60_000;
                    return (
                      <View key={m.id}>
                        {newDay ? <Txt v="small" style={{ textAlign: 'center', marginVertical: 10, fontSize: 12 }}>{day(m.at)}</Txt> : null}
                        <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: joined ? 3 : 10 }}>
                          <View style={{ maxWidth: '78%', backgroundColor: mine ? C.brand : '#1A1A21', borderRadius: 20, borderBottomRightRadius: mine ? 6 : 20, borderBottomLeftRadius: mine ? 20 : 6, paddingHorizontal: 14, paddingVertical: 9 }}>
                            <Txt v="body" color={mine ? C.onBrand : C.ink} style={{ fontSize: 15.5, lineHeight: 21 }}>{m.body}</Txt>
                          </View>
                        </View>
                        {!all[i + 1] || all[i + 1].sender !== m.sender || all[i + 1].at - m.at > 5 * 60_000 ? (
                          <Txt v="small" style={{ fontSize: 11, marginTop: 3, textAlign: mine ? 'right' : 'left', paddingHorizontal: 6 }}>
                            {clock(m.at)}{mine && lastMine?.id === m.id && seen ? ' · Seen' : ''}
                          </Txt>
                        ) : null}
                      </View>
                    );
                  })}
                </>
              )}
      </ScrollView>

      {me ? (
        <View style={{ paddingHorizontal: S.gutter, paddingTop: 8, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: '#15151A' }}>
          {err ? <ErrorLine msg={err} /> : null}
          <Row style={[{ gap: 8 }, col]}>
            <View style={{ flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: '#15151B', paddingHorizontal: 16, justifyContent: 'center' }}>
              <TextInput value={text} onChangeText={setText} placeholder={`Message ${name}`} placeholderTextColor={C.dim} maxLength={1000} multiline
                onSubmitEditing={send} blurOnSubmit={false} accessibilityLabel={`Message ${name}`}
                style={{ color: C.ink, fontFamily: F.regular, fontSize: 15.5, paddingVertical: 10, maxHeight: 120, outlineStyle: 'none' } as object} />
            </View>
            <Pressable onPress={send} disabled={!text.trim() || sending} accessibilityRole="button" accessibilityLabel="Send"
              style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: text.trim() ? C.brand : C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }] })}>
              <ArrowUp size={20} color={text.trim() ? C.onBrand : C.dim} />
            </Pressable>
          </Row>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
