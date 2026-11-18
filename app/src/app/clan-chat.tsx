// A squad's chat channel (#general, #trades), live on the MagicBlock rollup (members only, enforced by the program).
// Route: /clan-chat?clan=<squad pubkey>&ch=<0|1>; without a squad it opens your main squad's #general. Messages are
// read from the channel account on the rollup and shown as calm bubbles (yours lavender on the right, others grey with
// avatar, name and time, grouped by author, with day dividers).
// "Clash" opens a real 5 USDC duel on chain and posts it as a card anyone in the squad can accept; accepting takes you
// to the duel board where it is joined for real. Opening a channel the first time moves it onto the rollup.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { BN, CRYPTO_MASK, NET, P, PublicKey, USDC, USDC_MINT, random32, readDuel, sha256, usdcAta } from '@/chain/client';
import { errText, short, useChain } from '@/chain/useChain';
import { channelState, readChannel, readClanServer, readMyClan, reader, usePoll, useProfiles, type ChatMsg } from '@/chain/social';
import { CHANNELS, channelName, isMember, markSeen } from '@/chain/squads';
import { ProfileAvatar } from '@/ui/feed';
import { ART, BackBtn, Btn, ErrorLine, LiveDot, Pending, Row, Txt } from '@/ui/kit';
import { ArrowUp, Crown, Swords } from '@/ui/icons';
import { useDeskColumn } from '@/ui/layout';
import { crestSrc } from '@/ui/squads/parts';
import { C, FONT } from '@/ui/tokens';

const STAKE = 5;
const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayKey = (ts: number) => new Date(ts * 1000).toDateString();
const dayLabel = (ts: number) => {
  const d = new Date(ts * 1000);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  return d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

function ChallengeCard({ m, mine, onAccept }: { m: ChatMsg; mine: boolean; onAccept: () => void }) {
  const duel = usePoll(() => readDuel(reader, m.refkey), 4000, [m.refkey.toBase58()]);
  const d = duel.status === 'ready' ? duel.data : null;
  const open = !!d && d.status === 0 && d.expiresAt > Date.now() / 1000;
  const state = !d ? (duel.status === 'error' ? 'Cannot read the duel' : 'Loading…') : d.status === 0 ? (open ? 'Open' : 'Expired') : d.status === 6 ? 'Cancelled' : d.status === 5 ? 'Settled' : 'Accepted';
  return (
    <View style={{ marginTop: 4, backgroundColor: C.card, borderRadius: 18, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center', width: '100%', maxWidth: 360 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
        <Swords size={18} color={C.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label">Clash me</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 1 }}>{STAKE} USDC each · one coin · 60 s</Txt>
        <Row style={{ gap: 5, marginTop: 3 }}>
          {open ? <LiveDot color={C.up} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.dim }} />}
          <Txt v="small" color={open ? C.up : C.muted} style={{ fontSize: 12, ...FONT.medium }}>{state}</Txt>
        </Row>
      </View>
      {open && !mine ? <Btn title="Accept" h={38} onPress={onAccept} /> : null}
    </View>
  );
}

export default function ClanChat() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const chain = useChain();
  const { me, progs, sponsor, onBase, onEr } = chain;
  const params = useLocalSearchParams<{ clan?: string; ch?: string }>();
  const ch = Math.max(0, Math.min(3, Math.floor(Number(params.ch ?? 0)) || 0));
  const paramClan = useMemo(() => { try { return params.clan ? new PublicKey(params.clan) : null; } catch { return null; } }, [params.clan]);
  const myClan = usePoll(() => (paramClan ? Promise.resolve(paramClan) : me ? readMyClan(me) : Promise.resolve(null)), 8000, [me?.toBase58(), paramClan?.toBase58()]);
  const clan = myClan.status === 'ready' ? myClan.data : null;
  const ck = clan?.toBase58();
  const member = usePoll(() => (clan && me ? isMember(clan, me) : Promise.resolve(false)), 8000, [ck, me?.toBase58()]);
  const server = usePoll(() => (clan ? readClanServer(clan) : Promise.resolve(null)), 10000, [ck]);
  const chat = usePoll(() => (clan ? readChannel(clan, ch) : Promise.resolve(null)), 1500, [ck, ch]);
  const state = usePoll(() => (clan ? channelState(clan, ch) : Promise.resolve('none' as const)), 4000, [ck, ch]);
  const profiles = useProfiles();
  const prof = profiles.status === 'ready' ? profiles.data : new Map();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string>();
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  const msgs = chat.status === 'ready' && chat.data ? chat.data.msgs : [];
  const count = chat.status === 'ready' && chat.data ? chat.data.count : 0;
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60); }, [msgs.length, ch]);
  // this device has now seen every message in the channel (drives the unread badges in the Squads rail)
  useEffect(() => { if (clan && chat.status === 'ready') markSeen(clan, ch, count); }, [ck, ch, count, chat.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = state.status === 'ready' ? state.data : 'none';
  const chName = channelName(ch);
  const s = server.status === 'ready' ? server.data : null;
  const notMember = member.status === 'ready' && !member.data && !!me;

  const run = (name: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(name); setErr(undefined);
    try { await fn(); chat.reload(); state.reload(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const openChannel = run('open', async () => {
    if (!me || !progs || !sponsor || !clan) throw new Error("Clashy's payment relay is offline, so nothing can be sent right now. Try again in a minute.");
    if (st === 'none') await onBase(`Open #${chName}`, () => progs.base.methods.openChannel(ch).accountsPartial({ wallet: me, payer: sponsor, clan, channel: P.channel(clan, ch) }).rpc());
    await onBase(`Move #${chName} to the rollup`, () => progs.base.methods.delegateChannel(clan, ch).accountsPartial({ wallet: me, payer: sponsor, channel: P.channel(clan, ch) })
      .remainingAccounts([{ pubkey: NET.erValidator, isSigner: false, isWritable: false }]).rpc());
  });
  const say = (body: string, kind = 0, ref = PublicKey.default) => onEr(kind === 1 ? 'Post a challenge' : 'Message', progs!.er.methods.postMessage(body, kind, ref)
    .accountsPartial({ author: me!, channel: P.channel(clan!, ch), member: P.member(clan!, me!) }));
  const send = run('send', async () => {
    const body = text.trim();
    if (!body) return;
    if (!progs || !me || !clan) throw new Error("Clashy's payment relay is offline, so nothing can be sent right now. Try again in a minute.");
    if (new TextEncoder().encode(body).length > 120) throw new Error('120 bytes at most');
    await say(body);
    setText('');
  });
  const challenge = run('challenge', async () => {
    if (!me || !progs || !sponsor) throw new Error("Clashy's payment relay is offline, so nothing can be sent right now. Try again in a minute.");
    const nonce = Date.now();
    const duel = P.duel(me, nonce);
    const seed = random32();
    await AsyncStorage.setItem(`clashy:chain:secret:${duel.toBase58()}`, JSON.stringify({ seed: [...seed] }));
    const seedHash = [...(await sha256(seed))];
    await onBase(`Open a ${STAKE} USDC duel`, () => progs.base.methods.openDuel(new BN(nonce), new BN(STAKE * USDC), CRYPTO_MASK, 60, new BN(1800), seedHash)
      .accountsPartial({ creator: me, payer: sponsor, duel, vault: P.vault(duel), creatorUsdc: usdcAta(me), usdcMint: USDC_MINT }).rpc());
    await AsyncStorage.setItem('clashy:chain:active', duel.toBase58());
    await say(`Duel me: ${STAKE} USDC, one coin, 60 s`, 1, duel);
  });
  // the duel board lists every open challenge with Join; the joiner's own seed is made there
  const accept = () => router.push('/onchain' as Href);
  const switchTo = (id: number) => id !== ch && router.setParams({ ch: String(id) });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/clans' as Href));

  const Empty = ({ title, body, action, onAction, disabled }: { title: string; body: string; action?: string; onAction?: () => void; disabled?: boolean }) => (
    <View style={{ marginTop: 20 }}>
      <Pending art={ART.chat} title={title} body={body} />
      {action ? <Btn title={action} h={48} disabled={disabled} onPress={onAction} /> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[{ flex: 1, paddingTop: insets.top + 8 }, col]}>
        {/* header: back, squad crest, # channel, squad name */}
        <Row style={{ gap: 10, paddingHorizontal: 14, paddingBottom: 8 }}>
          <BackBtn onPress={back} />
          {s ? <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Image source={crestSrc(s.crest)} style={{ width: 30, height: 30 }} contentFit="contain" /></View> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="label" lines={1} style={{ fontSize: 16 }}>#{chName}</Txt>
            <Txt v="small" style={{ fontSize: 12 }} lines={1}>{s ? `${s.name} · ${s.members.length} member${s.members.length === 1 ? '' : 's'}` : myClan.status === 'ready' && !clan ? 'No squad' : 'Loading…'}</Txt>
          </View>
          {st === 'live' ? <Row style={{ gap: 5 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.up }} /><Txt v="small" color={C.up} style={{ fontSize: 12 }}>Rollup</Txt></Row> : null}
        </Row>
        {/* channel switcher */}
        {clan ? (
          <Row style={{ gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}>
            {CHANNELS.map((c) => (
              <Pressable key={c.id} onPress={() => switchTo(c.id)} accessibilityRole="tab" accessibilityState={{ selected: c.id === ch }} hitSlop={4}
                style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: c.id === ch ? C.s2 : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="small" color={c.id === ch ? C.ink : C.muted} style={{ ...FONT.medium }}>#{c.name}</Txt>
              </Pressable>
            ))}
          </Row>
        ) : null}

        <ScrollView ref={scroll as never} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12 }} keyboardShouldPersistTaps="handled">
          {myClan.status === 'ready' && !clan ? (
            <Empty title="Join a squad to chat" body="Every squad has #general and #trades, live on the MagicBlock rollup." action="Find a squad" onAction={() => router.replace('/squads/discover' as Href)} />
          ) : notMember ? (
            <Empty title="You're not in this squad" body="Only members can read and post here. Join it from Discover: it's free." action="Open Discover" onAction={() => router.replace('/squads/discover' as Href)} />
          ) : state.status === 'loading' || myClan.status === 'loading' ? (
            <Txt v="small" style={{ textAlign: 'center', marginTop: 30 }}>Loading #{chName}…</Txt>
          ) : st !== 'live' ? (
            <Empty title={`#${chName} isn't open yet`} body="Open it once for the squad: it moves onto the MagicBlock rollup, where every message is instant and free."
              action={busy === 'open' ? 'Opening…' : `Open #${chName}`} disabled={!!busy || state.status !== 'ready' || !me} onAction={openChannel} />
          ) : (
            <>
              <Row style={{ gap: 12, paddingTop: 4, paddingBottom: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="h2">#</Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>Welcome to #{chName}</Txt>
                  <Txt v="small" lines={2} style={{ marginTop: 1, lineHeight: 17 }}>{CHANNELS.find((c) => c.id === ch)?.blurb ?? `The start of ${s?.name ?? 'the squad'}'s #${chName}`}.{count > msgs.length ? ` Showing the latest ${msgs.length} of ${count}.` : ''}</Txt>
                </View>
              </Row>
              {msgs.length === 0 ? <Txt v="small" style={{ marginTop: 8 }}>No messages yet. Say gm, or tap Clash to challenge the squad.</Txt> : msgs.map((m, i) => {
                const p = prof.get(m.author.toBase58());
                const prev = msgs[i - 1];
                const newDay = !prev || dayKey(prev.ts) !== dayKey(m.ts);
                const grouped = !newDay && !!prev && prev.author.equals(m.author) && m.ts - prev.ts < 300 && prev.kind === 0 && m.kind === 0;
                const capt = !!s?.captain.equals(m.author);
                const mineMsg = !!me && m.author.equals(me);
                return (
                  <View key={m.i}>
                    {newDay ? (
                      <Row style={{ gap: 10, marginVertical: 12 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
                        <Txt v="small" color={C.dim} style={{ fontSize: 12, ...FONT.medium }}>{dayLabel(m.ts)}</Txt>
                        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
                      </Row>
                    ) : null}
                    {m.kind === 1 ? (
                      <Row style={{ gap: 6, marginTop: 10, justifyContent: mineMsg ? 'flex-end' : 'flex-start' }}>
                        <Swords size={13} color={C.muted} />
                        <Txt v="small" lines={1} style={{ fontSize: 12, flexShrink: 1 }}><Txt v="small" color={C.ink} style={{ ...FONT.medium, fontSize: 12 }}>{mineMsg ? 'You' : p?.name ?? short(m.author.toBase58())}</Txt> posted a clash challenge · {time(m.ts)}</Txt>
                      </Row>
                    ) : null}
                    {mineMsg ? (
                      // my own message: a lavender bubble on the right
                      <View style={{ alignItems: 'flex-end', marginTop: grouped ? 3 : m.kind === 1 ? 4 : 12 }}>
                        {grouped || m.kind === 1 ? null : <Txt v="small" color={C.dim} style={{ fontSize: 11.5, marginBottom: 3 }}>{time(m.ts)}</Txt>}
                        {m.kind === 1 ? <ChallengeCard m={m} mine onAccept={accept} />
                          : <View style={{ maxWidth: '82%', backgroundColor: C.brand, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 }}>
                              <Txt v="body" color={C.onBrand}>{m.text}</Txt>
                            </View>}
                      </View>
                    ) : (
                      <Row style={{ gap: 10, alignItems: 'flex-end', marginTop: grouped ? 3 : m.kind === 1 ? 4 : 12 }}>
                        {grouped ? <View style={{ width: 32 }} /> : <ProfileAvatar p={p} size={32} />}
                        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
                          {grouped || m.kind === 1 ? null : (
                            <Row style={{ gap: 5, marginBottom: 3, paddingLeft: 4 }}>
                              <Txt v="small" color={C.ink} lines={1} style={{ ...FONT.semi, flexShrink: 1 }}>{p?.name ?? short(m.author.toBase58())}</Txt>
                              {capt ? <Crown size={12} color={C.brandSoft} /> : null}
                              <Txt v="small" color={C.dim} style={{ fontSize: 11.5 }}>{time(m.ts)}</Txt>
                            </Row>
                          )}
                          {m.kind === 1 ? <ChallengeCard m={m} mine={false} onAccept={accept} />
                            : <View style={{ maxWidth: '88%', backgroundColor: C.s2, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 }}>
                                <Txt v="body">{m.text}</Txt>
                              </View>}
                        </View>
                      </Row>
                    )}
                  </View>
                );
              })}
            </>
          )}
          {chat.status === 'error' ? <ErrorLine msg={chat.error} onRetry={chat.reload} /> : null}
        </ScrollView>
        {err ? <View style={{ paddingHorizontal: 14 }}><ErrorLine msg={err} /></View> : null}
        {st === 'live' && !notMember && clan ? (
          <Row style={{ gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 10 }}>
            <Pressable onPress={challenge} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Post a ${STAKE} USDC clash challenge`}
              style={({ pressed }) => ({ height: 46, paddingHorizontal: 14, borderRadius: 23, backgroundColor: pressed ? C.s1 : C.s2, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: busy && busy !== 'challenge' ? 0.5 : 1 })}>
              <Swords size={16} color={C.ink} />
              <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{busy === 'challenge' ? '…' : 'Clash'}</Txt>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0, height: 46, borderRadius: 23, backgroundColor: C.s2, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4 }}>
              <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder={`Message #${chName}`} placeholderTextColor={C.dim} maxLength={120} returnKeyType="send"
                style={{ flex: 1, height: 44, color: C.ink, ...FONT.regular, fontSize: 15, minWidth: 0 }} />
              <Pressable onPress={send} disabled={!!busy || !text.trim()} accessibilityRole="button" accessibilityLabel="Send"
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: text.trim() ? C.brand : C.s1, alignItems: 'center', justifyContent: 'center' }}>
                {busy === 'send' ? <Txt v="label" color={C.onBrand}>…</Txt> : <ArrowUp size={18} color={text.trim() ? C.onBrand : C.muted} />}
              </Pressable>
            </View>
          </Row>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
