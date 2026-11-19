// A squad's chat channel (#general, #trades), live on the MagicBlock rollup (members only, enforced by the program).
// Route: /clan-chat?clan=<squad pubkey>&ch=<0|1>; without a squad it opens your main squad's #general. Messages are
// read from the channel account on the rollup, Discord style (grouped by author, avatar, name, time, day dividers).
// "Clash" opens a real 5 USDC duel on chain and posts it as a card anyone in the squad can accept; accepting takes you
// to the duel board where it is joined for real. Opening a channel the first time moves it onto the rollup.
// Stickers travel as a 16-byte token in an ordinary channel message, so they're on chain like everything else; they
// and 1-3 emoji show big without a bubble. Tap a sticker to open its pack.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { BN, CRYPTO_MASK, NET, P, PublicKey, USDC, USDC_MINT, random32, readDuel, sha256, usdcAta } from '@/chain/client';
import { errText, short, useChain } from '@/chain/useChain';
import { channelState, readChannel, readClanServer, readMyClan, reader, usePoll, useProfiles, type ChatMsg } from '@/chain/social';
import { CHANNELS, channelName, isMember, markSeen } from '@/chain/squads';
import { ClayLoop } from '@/ui/clay';
import { ProfileAvatar } from '@/ui/feed';
import { ART, BackBtn, Btn, ErrorLine, Row, Txt } from '@/ui/kit';
import { Swords } from '@/ui/icons';
import { ChatComposer } from '@/ui/chat-composer';
import { JumboEmoji, PackSheet, StickerMsg, useFreshSince } from '@/ui/chat-bits';
import { jumboCount, stickerBody, stickerOf, type Sticker } from '@/stickers';
import { useDeskColumn } from '@/ui/layout';
import { CARD, GOLD, HAIR, crestSrc } from '@/ui/squads/parts';
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
    <View style={{ marginTop: 6, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: open ? 'rgba(240,70,140,0.45)' : HAIR, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center', maxWidth: 420 }}>
      <Image source={ART.tileDuel} style={{ width: 46, height: 46 }} contentFit="contain" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" style={{ ...FONT.semi, fontSize: 15 }}>Clash me</Txt>
        <Txt v="small" lines={1}>{STAKE} USDC each · one coin · 60 s</Txt>
        <Row style={{ gap: 5, marginTop: 3 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: open ? C.opp : C.dim }} />
          <Txt v="small" color={open ? C.opp : C.muted} style={{ fontSize: 11.5, ...FONT.semi }}>{state}</Txt>
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
  const [pack, setPack] = useState<string | null>(null);
  const fresh = useFreshSince();
  const sendSticker = (s: Sticker) => run('send', async () => {
    if (!progs || !me || !clan) throw new Error("Clashy's payment relay is offline, so nothing can be sent right now. Try again in a minute.");
    await say(stickerBody(s));
  })();
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
    <View style={{ alignItems: 'center', marginTop: 36, paddingHorizontal: 20 }}>
      <ClayLoop name="chat" size={140} style={{ borderRadius: 28 }} />
      <Txt v="title" style={{ marginTop: 10, ...FONT.semi, fontSize: 19, letterSpacing: -0.3, textAlign: 'center' }}>{title}</Txt>
      <Txt v="small" style={{ marginTop: 6, textAlign: 'center', lineHeight: 18 }}>{body}</Txt>
      {action ? <Btn title={action} h={50} style={{ marginTop: 14, alignSelf: 'stretch' }} disabled={disabled} onPress={onAction} /> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[{ flex: 1, paddingTop: insets.top + 8 }, col]}>
        {/* header: the squad's banner with its crest, name, members and the rollup light */}
        <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <LinearGradient colors={['#221C3A', '#121218']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 10, paddingRight: 14 }}>
            <Row style={{ gap: 10 }}>
              <BackBtn onPress={back} />
              {s ? <Image source={crestSrc(s.crest)} style={{ width: 46, height: 46 }} contentFit="contain" /> : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1} style={{ fontSize: 17, ...FONT.bold }}>{s ? s.name : myClan.status === 'ready' && !clan ? 'No squad' : 'Loading…'}</Txt>
                <Txt v="small" style={{ fontSize: 12 }} lines={1}>{s ? `${s.members.length} member${s.members.length === 1 ? '' : 's'} · #${chName}` : ' '}</Txt>
              </View>
              {st === 'live' ? (
                <Row style={{ gap: 5, backgroundColor: 'rgba(48,209,88,0.14)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.up }} /><Txt v="small" color={C.up} style={{ fontSize: 11.5, ...FONT.semi }}>Live</Txt>
                </Row>
              ) : null}
            </Row>
            {clan ? (
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 14, padding: 3, gap: 3, marginTop: 10 }}>
                {CHANNELS.map((c) => (
                  <Pressable key={c.id} onPress={() => switchTo(c.id)} accessibilityRole="tab" accessibilityState={{ selected: c.id === ch }}
                    style={{ flex: 1, height: 34, borderRadius: 11, backgroundColor: c.id === ch ? C.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    <Txt v="small" color={c.id === ch ? C.onBrand : C.muted} style={{ ...FONT.semi, fontSize: 13 }}>#{c.name}</Txt>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </LinearGradient>
        </View>

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
              <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 14 }}>
                {s ? <Image source={crestSrc(s.crest)} style={{ width: 72, height: 72 }} contentFit="contain" /> : null}
                <Txt v="title" style={{ ...FONT.display, fontSize: 21, marginTop: 6, textAlign: 'center' }}>Welcome to #{chName}</Txt>
                <Txt v="small" style={{ marginTop: 3, lineHeight: 18, textAlign: 'center' }}>{CHANNELS.find((c) => c.id === ch)?.blurb ?? ''}. Live on the MagicBlock rollup.{count > msgs.length ? ` Latest ${msgs.length} of ${count}.` : ''}</Txt>
              </View>
              {msgs.length === 0 ? <Txt v="small" style={{ marginTop: 8 }}>No messages yet. Say gm, or tap Clash to challenge the squad.</Txt> : msgs.map((m, i) => {
                const p = prof.get(m.author.toBase58());
                const prev = msgs[i - 1];
                const newDay = !prev || dayKey(prev.ts) !== dayKey(m.ts);
                const grouped = !newDay && !!prev && prev.author.equals(m.author) && m.ts - prev.ts < 300 && prev.kind === 0 && m.kind === 0;
                const capt = !!s?.captain.equals(m.author);
                return (
                  <View key={m.i}>
                    {newDay ? (
                      <Row style={{ gap: 10, marginVertical: 12 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: '#1C1C23' }} />
                        <Txt v="small" color={C.dim} style={{ fontSize: 11, ...FONT.semi }}>{dayLabel(m.ts)}</Txt>
                        <View style={{ flex: 1, height: 1, backgroundColor: '#1C1C23' }} />
                      </Row>
                    ) : null}
                    {m.kind === 1 ? (
                      <Row style={{ gap: 8, marginTop: 10, paddingLeft: 6 }}>
                        <Swords size={13} color={C.opp} />
                        <Txt v="small" style={{ flex: 1, fontSize: 12.5 }}><Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 12.5 }}>{p?.name ?? short(m.author.toBase58())}</Txt> posted a clash challenge · {time(m.ts)}</Txt>
                      </Row>
                    ) : null}
                    {(() => {
                      const mine = !!me && m.author.equals(me);
                      if (m.kind === 1) return <View style={{ marginTop: 6, alignSelf: mine ? 'flex-end' : 'flex-start', width: '86%' }}><ChallengeCard m={m} mine={mine} onAccept={accept} /></View>;
                      const stk = stickerOf(m.text);
                      const jumbo = stk ? 0 : jumboCount(m.text);
                      return (
                        <Row style={{ gap: 8, alignItems: 'flex-end', marginTop: grouped ? 3 : 12, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                          {mine ? null : grouped ? <View style={{ width: 34 }} /> : <Pressable onPress={() => router.push(`/u/${m.author.toBase58()}` as Href)}><ProfileAvatar p={p} size={34} /></Pressable>}
                          <View style={{ maxWidth: '78%' }}>
                            {grouped || mine ? null : (
                              <Row style={{ gap: 5, marginBottom: 3, marginLeft: 4 }}>
                                <Txt v="small" color={capt ? GOLD : C.brandSoft} style={{ fontSize: 12.5, ...FONT.semi }}>{p?.name ?? short(m.author.toBase58())}</Txt>
                                {capt ? <Image source={ART.crown} style={{ width: 13, height: 13 }} contentFit="contain" /> : null}
                              </Row>
                            )}
                            {stk ? <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}><StickerMsg s={stk} mine={mine} fresh={fresh(m.ts * 1000)} onPress={() => setPack(stk.pack)} /></View>
                              : jumbo ? <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}><JumboEmoji text={m.text.trim()} n={jumbo} fresh={fresh(m.ts * 1000)} /></View>
                                : (
                                  <View style={{ backgroundColor: mine ? C.brand : '#1A1A22', borderRadius: 20, borderBottomRightRadius: mine ? 6 : 20, borderBottomLeftRadius: mine ? 20 : 6, paddingHorizontal: 14, paddingVertical: 9 }}>
                                    <Txt v="body" color={mine ? C.onBrand : '#E6E6EC'} style={{ fontSize: 15, lineHeight: 21 }}>{m.text}</Txt>
                                  </View>
                                )}
                            {i === msgs.length - 1 || !msgs[i + 1].author.equals(m.author) || msgs[i + 1].ts - m.ts >= 300 ? (
                              <Txt v="small" color={C.dim} style={{ fontSize: 10.5, marginTop: 3, textAlign: mine ? 'right' : 'left', marginHorizontal: 6 }}>{time(m.ts)}</Txt>
                            ) : null}
                          </View>
                        </Row>
                      );
                    })()}
                  </View>
                );
              })}
            </>
          )}
          {chat.status === 'error' ? <ErrorLine msg={chat.error} onRetry={chat.reload} /> : null}
        </ScrollView>
        {err ? <View style={{ paddingHorizontal: 14 }}><ErrorLine msg={err} /></View> : null}
        {st === 'live' && !notMember && clan ? (
          <ChatComposer value={text} onChange={setText} onSend={send} onSticker={sendSticker} placeholder={`Message #${chName}`} maxLength={120} busy={!!busy}
            left={(
              <Pressable onPress={challenge} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Post a ${STAKE} USDC clash challenge`}
                style={({ pressed }) => ({ height: 46, paddingHorizontal: 12, borderRadius: 23, backgroundColor: pressed ? '#2A2A33' : '#1C1C23', flexDirection: 'row', alignItems: 'center', gap: 6, opacity: busy && busy !== 'challenge' ? 0.5 : 1 })}>
                <Swords size={15} color={C.opp} />
                <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 13 }}>{busy === 'challenge' ? '…' : 'Clash'}</Txt>
              </Pressable>
            )} />
        ) : null}
      </View>
      <PackSheet packId={pack} onClose={() => setPack(null)} onSend={st === 'live' && !notMember && clan ? sendSticker : undefined} />
    </KeyboardAvoidingView>
  );
}
