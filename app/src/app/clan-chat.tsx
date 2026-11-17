// #general: your clan's chat, live on the MagicBlock rollup (members only, enforced by the program). Messages are
// read from the channel account on the rollup. "Challenge" opens a real 5 USDC duel on chain and posts it as a card
// anyone in the clan can accept; accepting takes you to the duel board where it is joined for real.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { BN, CRYPTO_MASK, NET, P, PublicKey, USDC, USDC_MINT, random32, readDuel, sha256, usdcAta } from '@/chain/client';
import { errText, useChain } from '@/chain/useChain';
import { channelState, readChannel, readClanServer, readMyClan, reader, usePoll, useProfiles, type ChatMsg } from '@/chain/social';
import { ProfileAvatar } from '@/ui/feed';
import { ART, BackBtn, Btn, ErrorLine, Row, Txt } from '@/ui/kit';
import { Swords } from '@/ui/icons';
import { useDeskColumn } from '@/ui/layout';
import { C, F } from '@/ui/tokens';

const STAKE = 5;
const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function ChallengeCard({ m, mine, onAccept }: { m: ChatMsg; mine: boolean; onAccept: () => void }) {
  const duel = usePoll(() => readDuel(reader, m.refkey), 4000, [m.refkey.toBase58()]);
  const d = duel.status === 'ready' ? duel.data : null;
  const state = !d ? 'Loading…' : d.status === 0 ? (d.expiresAt < Date.now() / 1000 ? 'Expired' : 'Open') : d.status === 6 ? 'Cancelled' : d.status === 5 ? 'Settled' : 'Accepted';
  return (
    <View style={{ marginTop: 6, backgroundColor: '#0D0D10', borderRadius: 14, borderWidth: 1, borderColor: C.s2, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Image source={ART.tileDuel} style={{ width: 44, height: 44 }} contentFit="contain" />
      <View style={{ flex: 1 }}>
        <Txt v="label">Duel challenge</Txt>
        <Txt v="small">{STAKE} USDC each · VRF rolls one coin · {state}</Txt>
      </View>
      {d && d.status === 0 && !mine && d.expiresAt > Date.now() / 1000 ? <Btn title="Accept" h={34} onPress={onAccept} /> : null}
    </View>
  );
}

export default function ClanChat() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const chain = useChain();
  const { me, progs, sponsor, onBase, onEr } = chain;
  const myClan = usePoll(() => (me ? readMyClan(me) : Promise.resolve(null)), 8000, [me?.toBase58()]);
  const clan = myClan.status === 'ready' ? myClan.data : null;
  const server = usePoll(() => (clan ? readClanServer(clan) : Promise.resolve(null)), 10000, [clan?.toBase58()]);
  const chat = usePoll(() => (clan ? readChannel(clan, 0) : Promise.resolve(null)), 1500, [clan?.toBase58()]);
  const state = usePoll(() => (clan ? channelState(clan, 0) : Promise.resolve('none' as const)), 4000, [clan?.toBase58()]);
  const profiles = useProfiles();
  const prof = profiles.status === 'ready' ? profiles.data : new Map();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string>();
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  const msgs = chat.status === 'ready' && chat.data ? chat.data.msgs : [];
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [msgs.length]);
  const st = state.status === 'ready' ? state.data : 'none';

  const run = (name: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(name); setErr(undefined);
    try { await fn(); chat.reload(); state.reload(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const openChannel = run('open', async () => {
    if (!me || !progs || !sponsor || !clan) throw new Error('Join a clan first');
    if (st === 'none') await onBase('Open #general', () => progs.base.methods.openChannel(0).accountsPartial({ wallet: me, payer: sponsor, clan, channel: P.channel(clan, 0) }).rpc());
    await onBase('Move #general to the rollup', () => progs.base.methods.delegateChannel(clan, 0).accountsPartial({ wallet: me, payer: sponsor, channel: P.channel(clan, 0) })
      .remainingAccounts([{ pubkey: NET.erValidator, isSigner: false, isWritable: false }]).rpc());
  });
  const say = (body: string, kind = 0, ref = PublicKey.default) => onEr(kind === 1 ? 'Post a challenge' : 'Message', progs!.er.methods.postMessage(body, kind, ref)
    .accountsPartial({ author: me!, channel: P.channel(clan!, 0), member: P.member(clan!, me!) }));
  const send = run('send', async () => {
    const body = text.trim();
    if (!body) return;
    if (new TextEncoder().encode(body).length > 120) throw new Error('120 bytes at most');
    await say(body);
    setText('');
  });
  const challenge = run('challenge', async () => {
    if (!me || !progs || !sponsor) return;
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
  const accept = (_m: ChatMsg) => () => router.push('/onchain');

  const s = server.status === 'ready' ? server.data : null;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[{ flex: 1, paddingTop: insets.top + 8 }, col]}>
        <Row style={{ gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/clans'))} />
          <View style={{ flex: 1 }}>
            <Txt v="label"># general</Txt>
            <Txt v="small" style={{ fontSize: 12 }} lines={1}>{s ? `${s.name} · ${s.members.length} members · live on the MagicBlock rollup` : 'Loading…'}</Txt>
          </View>
        </Row>
        <ScrollView ref={scroll as never} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 12 }}>
          {myClan.status === 'ready' && !clan ? (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Image source={ART.chat} style={{ width: 120, height: 120 }} contentFit="contain" />
              <Txt v="h2" style={{ marginTop: 10 }}>Join a clan to chat</Txt>
              <Btn title="Find a clan" style={{ marginTop: 12 }} onPress={() => router.replace('/clans')} />
            </View>
          ) : st !== 'live' ? (
            <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
              <Image source={ART.chat} style={{ width: 120, height: 120 }} contentFit="contain" />
              <Txt v="h2" style={{ marginTop: 10 }}>#general isn't open yet</Txt>
              <Txt v="small" style={{ marginTop: 4, textAlign: 'center' }}>Open it once for the clan: it moves onto the MagicBlock rollup, where every message is instant and free.</Txt>
              <Btn title={busy === 'open' ? 'Opening…' : 'Open #general'} style={{ marginTop: 12 }} disabled={!!busy || state.status !== 'ready'} onPress={openChannel} />
            </View>
          ) : msgs.length === 0 ? (
            <Txt v="small" style={{ textAlign: 'center', marginTop: 30 }}>No messages yet. Say gm, or challenge your clan to a duel.</Txt>
          ) : msgs.map((m, i) => {
            const p = prof.get(m.author.toBase58());
            const grouped = i > 0 && msgs[i - 1].author.equals(m.author) && m.ts - msgs[i - 1].ts < 300;
            return (
              <Row key={m.i} style={{ gap: 10, alignItems: 'flex-start', marginTop: grouped ? -6 : 0 }}>
                {grouped ? <View style={{ width: 36 }} /> : <ProfileAvatar p={p} size={36} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {grouped ? null : (
                    <Row style={{ gap: 6 }}>
                      <Txt v="label" style={{ fontSize: 14 }}>{p?.name ?? `${m.author.toBase58().slice(0, 4)}…`}</Txt>
                      {s?.captain.equals(m.author) ? <Txt v="small" style={{ fontSize: 11 }} color={C.brandSoft}>captain</Txt> : null}
                      <Txt v="small" style={{ fontSize: 11 }}>{time(m.ts)}</Txt>
                    </Row>
                  )}
                  <Txt v="body" style={{ fontSize: 15, lineHeight: 20, marginTop: 1 }}>{m.text}</Txt>
                  {m.kind === 1 ? <ChallengeCard m={m} mine={!!me && m.author.equals(me)} onAccept={accept(m)} /> : null}
                </View>
              </Row>
            );
          })}
        </ScrollView>
        {err ? <View style={{ paddingHorizontal: 14 }}><ErrorLine msg={err} /></View> : null}
        {st === 'live' ? (
          <Row style={{ gap: 8, padding: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <Pressable onPress={challenge} disabled={!!busy} style={{ height: 42, paddingHorizontal: 12, borderRadius: 21, backgroundColor: C.s2, justifyContent: 'center' }}>
              {busy === 'challenge' ? <Txt v="small" color={C.ink}>…</Txt> : <Row style={{ gap: 6 }}><Swords size={15} color={C.ink} /><Txt v="small" color={C.ink} style={{ fontFamily: F.semi }}>Duel</Txt></Row>}
            </Pressable>
            <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="Message #general" placeholderTextColor={C.muted} maxLength={120}
              style={{ flex: 1, height: 42, borderRadius: 21, backgroundColor: C.s2, color: C.ink, fontFamily: F.medium, fontSize: 15, paddingHorizontal: 14 }} />
            <Btn title={busy === 'send' ? '…' : 'Send'} h={42} disabled={!!busy || !text.trim()} onPress={send} />
          </Row>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

