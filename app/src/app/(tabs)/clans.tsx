// Clans, laid out like a Discord server: a rail with your clan, Discover and Create; the clan's banner with its level
// and XP; quick actions; and channels. CHALLENGES lists your members' open duels, PORTFOLIO the chest and its open
// votes, LOBBY who is in a duel right now, CHAT the clan's #general on the MagicBlock rollup. Every row comes from
// program accounts; the level is computed from on-chain facts (wars won, members, chest).
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share as RNShare, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { COIN_SYMBOLS } from '@/chain/client';
import { useClansOnchain, useFeed } from '@/chain/reads';
import { readChannel, readClanServer, readMyClan, usePoll, useProfiles } from '@/chain/social';
import { useWallet } from '@/chain/wallet';
import { ClayLoop } from '@/ui/clay';
import { ProfileAvatar } from '@/ui/feed';
import { ART, Art, Btn, CRESTS, ErrorLine, Pending, Press, Row, SearchBar, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F } from '@/ui/tokens';

const RAIL = 62;
const Section = ({ title }: { title: string }) => <Txt v="small" style={{ fontFamily: F.semi, fontSize: 11, letterSpacing: 0.8, marginTop: 16, marginBottom: 4 }}>{title}</Txt>;
const ChannelRow = ({ name, hash = true, badge, live, sub, onPress }: { name: string; hash?: boolean; badge?: string; live?: boolean; sub?: string; onPress?: () => void }) => (
  <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, backgroundColor: pressed ? C.s2 : 'transparent' })}>
    <Txt v="label" color={C.muted} style={{ width: 16, textAlign: 'center' }}>{hash ? '#' : '◆'}</Txt>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt v="label" lines={1}>{name}</Txt>
      {sub ? <Txt v="small" lines={1} style={{ fontSize: 12 }}>{sub}</Txt> : null}
    </View>
    {live ? <View style={{ backgroundColor: C.opp, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}><Txt v="small" color="#fff" style={{ fontSize: 10, fontFamily: F.bold }}>LIVE</Txt></View> : null}
    {badge ? <View style={{ backgroundColor: C.brand, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}><Txt v="small" color="#fff" style={{ fontSize: 10, fontFamily: F.bold }}>{badge}</Txt></View> : null}
  </Pressable>
);

export default function Clans() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const wallet = useWallet();
  const me = wallet.signer?.publicKey ?? null;
  const [view, setView] = useState<'server' | 'discover'>('server');
  const [q, setQ] = useState('');
  const myClan = usePoll(() => (me ? readMyClan(me) : Promise.resolve(null)), 6000, [me?.toBase58()]);
  const clanKey = myClan.status === 'ready' ? myClan.data : null;
  const server = usePoll(() => (clanKey ? readClanServer(clanKey) : Promise.resolve(null)), 5000, [clanKey?.toBase58()]);
  const chat = usePoll(() => (clanKey ? readChannel(clanKey, 0) : Promise.resolve(null)), 4000, [clanKey?.toBase58()]);
  const clans = useClansOnchain();
  const profiles = useProfiles();
  const feed = useFeed();
  const prof = profiles.status === 'ready' ? profiles.data : new Map();
  const s = server.status === 'ready' ? server.data : null;
  const inClan = (k: { toBase58(): string }) => !!s?.members.some((m) => m.toBase58() === k.toBase58());
  const f = feed.status === 'ready' ? feed.data : null;
  const openDuels = f ? f.open.filter((d) => inClan(d.creator)) : [];
  const liveDuels = f ? f.live.filter((d) => inClan(d.creator) || inClan(d.joiner)) : [];
  const busyIn = new Set(liveDuels.flatMap((d) => [d.creator.toBase58(), d.joiner.toBase58()]));
  const last = chat.status === 'ready' && chat.data?.msgs.length ? chat.data.msgs[chat.data.msgs.length - 1] : null;
  const showServer = view === 'server' && !!s;
  const list = clans.status === 'ready' ? clans.data.filter((c) => c.key.toBase58() !== clanKey?.toBase58() && (!q || c.name.toLowerCase().includes(q.toLowerCase()))) : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={[{ flex: 1, flexDirection: 'row' }, col]}>
        {/* rail */}
        <View style={{ width: RAIL, alignItems: 'center', paddingTop: 10, gap: 10, borderRightWidth: 1, borderRightColor: C.line }}>
          {s ? (
            <Pressable onPress={() => setView('server')} style={{ borderRadius: view === 'server' ? 16 : 23, overflow: 'hidden', borderWidth: 2, borderColor: view === 'server' ? C.brand : 'transparent' }}>
              <Art src={CRESTS[s.crest % CRESTS.length]} size={44} radius={view === 'server' ? 14 : 22} />
            </Pressable>
          ) : null}
          <View style={{ width: 28, height: 2, borderRadius: 1, backgroundColor: C.s2 }} />
          <Pressable onPress={() => setView('discover')} style={{ width: 46, height: 46, borderRadius: view === 'discover' ? 16 : 23, backgroundColor: view === 'discover' ? C.brand : C.s2, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="label" color={view === 'discover' ? '#fff' : C.up} style={{ fontSize: 20 }}>✦</Txt>
          </Pressable>
          <Pressable onPress={() => (me ? router.push('/onchain-clan') : wallet.login?.())} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="label" color={C.up} style={{ fontSize: 24, marginTop: -2 }}>+</Txt>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          {showServer && s ? (
            <>
              <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: C.s1 }}>
                <ClayLoop name="clanCity" width="100%" height={118} cover />
                <View style={{ padding: 12 }}>
                  <Row style={{ gap: 8 }}>
                    <Txt v="h2" lines={1} style={{ flex: 1 }}>{s.name}</Txt>
                    {s.atWar ? <View style={{ backgroundColor: C.opp, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Txt v="small" color="#fff" style={{ fontFamily: F.bold, fontSize: 11 }}>AT WAR</Txt></View> : null}
                  </Row>
                  <Txt v="small" style={{ marginTop: 2 }}>{s.members.length} member{s.members.length === 1 ? '' : 's'} · {liveDuels.length ? `${busyIn.size} in a duel now` : 'nobody in a duel right now'} · {s.wins}W {s.losses}L</Txt>
                  <Row style={{ marginTop: 10, gap: 10 }}>
                    <Image source={ART.levelStar} style={{ width: 30, height: 30 }} contentFit="contain" />
                    <View style={{ flex: 1 }}>
                      <Row style={{ justifyContent: 'space-between' }}><Txt v="label" style={{ fontSize: 13 }}>Clan Lv {s.level}</Txt><Txt v="small" style={{ fontSize: 12 }}>{s.xp - s.levelFloor}/{s.levelNext - s.levelFloor} XP</Txt></Row>
                      <View style={{ height: 7, borderRadius: 4, backgroundColor: C.s2, marginTop: 4, overflow: 'hidden' }}>
                        <View style={{ width: `${Math.min(100, ((s.xp - s.levelFloor) / (s.levelNext - s.levelFloor)) * 100)}%`, height: 7, backgroundColor: C.brand }} />
                      </View>
                    </View>
                  </Row>
                  <Row style={{ gap: 8, marginTop: 12 }}>
                    {[
                      { label: 'Invite', art: ART.invite, on: () => RNShare.share({ message: `Join my clan "${s.name}" on Clashy: open Clans, tap ✦ and find ${s.name}.` }).catch(() => {}) },
                      { label: 'Chest', art: ART.stash, on: () => router.push('/onchain-clan') },
                      { label: 'War', art: ART.cupBig, on: () => router.push('/onchain-clan') },
                    ].map((a) => (
                      <Pressable key={a.label} onPress={a.on} style={{ flex: 1, backgroundColor: C.s2, borderRadius: 14, paddingVertical: 8, alignItems: 'center' }}>
                        <Image source={a.art} style={{ width: 30, height: 30 }} contentFit="contain" />
                        <Txt v="small" color={C.ink} style={{ fontFamily: F.semi, marginTop: 2 }}>{a.label}</Txt>
                      </Pressable>
                    ))}
                  </Row>
                </View>
              </View>

              <Section title="CHALLENGES" />
              <ChannelRow name="duels" badge={openDuels.length ? `${openDuels.length} OPEN` : undefined} live={liveDuels.length > 0}
                sub={openDuels.length ? `${openDuels.map((d) => prof.get(d.creator.toBase58())?.name ?? 'member').join(', ')} want a duel` : liveDuels.length ? `${liveDuels.length} live on the rollup` : 'Challenge your clan from #general'} onPress={() => router.push('/onchain')} />
              <ChannelRow name="weekly-cup" sub="This week's stock-picking cup" onPress={() => router.push('/cup' as Href)} />

              <Section title="PORTFOLIO" />
              <ChannelRow name="chest" badge={s.openVotes ? `${s.openVotes} VOTE${s.openVotes === 1 ? '' : 'S'}` : undefined} sub={`${s.chest.toFixed(2)} USDC · trade it together by vote`} onPress={() => router.push('/onchain-clan')} />

              <Section title="LOBBY" />
              {s.members.map((m) => {
                const p = prof.get(m.toBase58());
                const duel = liveDuels.find((d) => d.creator.equals(m) || d.joiner.equals(m));
                return (
                  <Row key={m.toBase58()} style={{ gap: 10, paddingVertical: 6, paddingHorizontal: 10 }}>
                    <View><ProfileAvatar p={p} size={30} />{duel ? <View style={{ position: 'absolute', right: -2, bottom: -2, width: 11, height: 11, borderRadius: 6, backgroundColor: C.up, borderWidth: 2, borderColor: C.bg }} /> : null}</View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt v="label" lines={1} style={{ fontSize: 14 }}>{p?.name ?? `${m.toBase58().slice(0, 4)}…`}{s.captain.equals(m) ? ' · captain' : ''}</Txt>
                      {duel ? <Txt v="small" style={{ fontSize: 12 }} color={C.up}>in a duel on {COIN_SYMBOLS[duel.coin] ?? '…'}</Txt> : p && p.dayStreak > 1 ? <Txt v="small" style={{ fontSize: 12 }}>{p.dayStreak}-day streak</Txt> : null}
                    </View>
                  </Row>
                );
              })}

              <Section title="CHAT" />
              <ChannelRow name="general" badge={chat.status === 'ready' && chat.data ? `${chat.data.count}` : undefined}
                sub={last ? `${prof.get(last.author.toBase58())?.name ?? 'member'}: ${last.kind === 1 ? 'posted a duel challenge' : last.text}` : chat.status === 'ready' && !chat.data ? 'Open the channel and say gm' : 'Live on the MagicBlock rollup'}
                onPress={() => router.push('/clan-chat' as Href)} />
            </>
          ) : (
            <>
              <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <Txt v="title" style={{ fontSize: 24 }}>{s ? 'Discover' : 'Clans'}</Txt>
                <Btn title={s ? 'My clan' : me ? 'Create' : 'Sign in'} h={34} onPress={() => (s ? setView('server') : me ? router.push('/onchain-clan') : wallet.login?.())} />
              </Row>
              {!s ? (
                <View style={{ backgroundColor: C.s1, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <ClayLoop name="clubhouse" size={72} style={{ borderRadius: 14 }} />
                  <View style={{ flex: 1 }}>
                    <Txt v="label">Your crew's clubhouse</Txt>
                    <Txt v="small" style={{ marginTop: 2 }}>A shared USDC chest you trade by vote, a chat on the rollup, duels and wars against other clans.</Txt>
                  </View>
                </View>
              ) : null}
              <SearchBar value={q} onChange={setQ} placeholder="Search clans" />
              <View style={{ height: 8 }} />
              {clans.status === 'loading' || myClan.status === 'loading' ? <SkeletonRows n={4} square /> : clans.status === 'error' ? <ErrorLine msg={clans.error} /> : list.length === 0 ? (
                <Pending art={ART.clan} title={q ? 'No clans match' : 'No other clans yet'} body="Start one and invite your friends." />
              ) : list.map((c) => (
                <Press key={c.key.toBase58()} onPress={() => router.push('/onchain-clan')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
                  <Art src={CRESTS[c.crest % CRESTS.length]} size={44} radius={13} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label" lines={1}>{c.name}</Txt>
                    <Txt v="small" lines={1}>{c.members} member{c.members === 1 ? '' : 's'} · chest {c.chest.toFixed(2)} USDC · {c.wins}W {c.losses}L{c.atWar ? ' · at war' : ''}</Txt>
                  </View>
                  {s ? null : <Btn title="Join" kind="ghost" h={32} onPress={() => router.push('/onchain-clan')} />}
                </Press>
              ))}
            </>
          )}
          {server.status === 'error' ? <ErrorLine msg={server.error} /> : null}
          <View style={{ height: 1 }} />
        </ScrollView>
      </View>
    </View>
  );
}
