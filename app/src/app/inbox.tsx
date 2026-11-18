// Inbox: your 7-day streak and what needs you, all derived from the chain: replies and likes on your calls (the
// rollup board), duel challenges posted in your clan's #general, clan votes still open, your Weekly Cup place and
// your Stash goal. Nothing is stored or invented: each row links to the real thing.
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/chain/wallet';
import { readBoard, readChannel, readClanServer, readMyClan, readProfile, readStash, usePoll, useProfiles, ago } from '@/chain/social';
import { ProfileAvatar } from '@/ui/feed';
import { Lottie } from '@/ui/lottie';
import { ART, BackBtn, Btn, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, FONT, fmtUsd } from '@/ui/tokens';

type Item = { key: string; ts: number; who?: PublicKey; art?: number; title: string; body: string; action?: { label: string; to: Href } };

async function readInbox(me: PublicKey) {
  const [board, clan, stash] = await Promise.all([readBoard(), readMyClan(me), readStash(me)]);
  const items: Item[] = [];
  const mine = board.filter((p) => p.author.equals(me));
  for (const p of board) {
    if (p.replyTo === null || p.author.equals(me)) continue;
    const parent = mine.find((m) => m.seq === p.replyTo);
    if (parent) items.push({ key: `r${p.seq}`, ts: p.ts, who: p.author, title: 'replied to your call', body: p.text, action: { label: 'View', to: '/' } });
  }
  for (const m of mine) if (m.likes > 0) items.push({ key: `l${m.seq}`, ts: m.ts, art: ART.megaphone, title: `${m.likes} like${m.likes === 1 ? '' : 's'} on your call`, body: m.text });
  if (clan) {
    const [server, chat] = await Promise.all([readClanServer(clan), readChannel(clan, 0)]);
    for (const msg of chat?.msgs ?? []) {
      if (msg.kind === 1 && !msg.author.equals(me) && Date.now() / 1000 - msg.ts < 3600) {
        items.push({ key: `c${msg.i}`, ts: msg.ts, who: msg.author, title: 'wants a clash in your squad', body: msg.text, action: { label: 'Play', to: '/onchain' } });
      }
    }
    if (server && server.openVotes > 0) {
      items.push({ key: 'votes', ts: Date.now() / 1000, art: ART.stash, title: `${server.openVotes} squad vote${server.openVotes === 1 ? '' : 's'} open`, body: `${server.name}'s chest is waiting on your vote.`, action: { label: 'Vote', to: '/clans' } });
    }
  }
  if (stash && stash.goal > 0) {
    const pct = Math.min(100, Math.round((stash.balance / stash.goal) * 100));
    items.push({ key: 'goal', ts: 0, art: ART.goal, title: `${pct}% of your goal`, body: `${fmtUsd(stash.balance)} of ${fmtUsd(stash.goal)}${stash.goalName ? ` for ${stash.goalName}` : ''}.`, action: { label: 'Stash', to: '/stash' as Href } });
  }
  return items.sort((a, b) => b.ts - a.ts);
}

export default function Inbox() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const wallet = useWallet();
  const me = wallet.signer?.publicKey ?? null;
  const prof = usePoll(() => (me ? readProfile(me) : Promise.resolve(null)), 10000, [me?.toBase58()]);
  const inbox = usePoll(() => (me ? readInbox(me) : Promise.resolve([])), 6000, [me?.toBase58()]);
  const profiles = useProfiles();
  const names = profiles.status === 'ready' ? profiles.data : new Map();
  const p = prof.status === 'ready' ? prof.data : null;
  const today = Math.floor(Date.now() / 86_400_000);
  // the on-chain streak only updates on activity: it is still alive if the last active day was today or yesterday
  const streak = p && today - p.lastActiveDay <= 1 ? p.dayStreak : 0;
  const doneToday = !!p && p.lastActiveDay === today;
  const filled = Math.min(7, streak);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 40 }}>
      <Row style={{ gap: 10, marginBottom: 14 }}>
        <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Txt v="title" style={{ flex: 1 }}>Inbox</Txt>
      </Row>
      <View style={{ borderRadius: 22, padding: 16, backgroundColor: '#F0468C' }}>
        <Row style={{ gap: 12 }}>
          <Lottie name="flame" size={58} loop />
          <View style={{ flex: 1 }}>
            <Txt v="title" color="#fff" style={{ fontSize: 26, ...FONT.display }}>{streak > 0 ? `${streak}-day streak` : 'Start a streak'}</Txt>
            <Txt v="small" color="#FFE3EE">Save, invest or play once a day to keep it. {p?.bestDayStreak ? `Best ${p.bestDayStreak}.` : ''}</Txt>
          </View>
        </Row>
        <Row style={{ gap: 6, marginTop: 14 }}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={{ flex: 1, aspectRatio: 1, borderRadius: 10, backgroundColor: i < filled ? '#fff' : 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <Txt v="label" color={i < filled ? '#F0468C' : '#fff'} style={{ ...FONT.bold }}>{i < filled ? '✓' : i + 1}</Txt>
            </View>
          ))}
        </Row>
      </View>
      <Txt v="small" style={{ marginTop: 8 }}>{doneToday ? 'Today counts. Come back tomorrow to keep it going.' : streak > 0 ? 'Not yet today: save, invest or play to keep your streak.' : 'Save, invest or play today to start one.'}</Txt>

      <Txt v="small" style={{ ...FONT.semi, fontSize: 11, letterSpacing: 0.8, marginTop: 20, marginBottom: 6 }}>New</Txt>
      {!me ? <Pending art={ART.bellArt} title="Sign in" body="Replies, likes, squad challenges and votes show here." action="Sign in" onAction={() => wallet.login?.()} />
        : inbox.status === 'loading' ? <SkeletonRows n={4} /> : inbox.status === 'error' ? <Txt v="small">{inbox.error}</Txt> : inbox.data.length === 0 ? (
          <Pending art={ART.bellArt} title="All caught up" body="Post a call or join a squad: replies, likes, challenges and votes land here." />
        ) : inbox.data.map((it) => (
          <Row key={it.key} style={{ gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            {it.who ? <ProfileAvatar p={names.get(it.who.toBase58())} size={40} /> : <Image source={it.art} style={{ width: 40, height: 40 }} contentFit="contain" />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" lines={2}>{it.who ? <Txt v="label" style={{ ...FONT.bold }}>{names.get(it.who.toBase58())?.name ?? 'someone'} </Txt> : null}{it.title}</Txt>
              <Txt v="small" lines={2}>{it.body}{it.ts > 1e9 && it.ts < Date.now() / 1000 - 1 ? ` · ${ago(it.ts)} ago` : ''}</Txt>
            </View>
            {it.action ? <Btn title={it.action.label} h={32} onPress={() => router.push(it.action!.to)} /> : null}
          </Row>
        ))}
      <Pressable onPress={() => router.push('/cup' as Href)} style={{ marginTop: 16, backgroundColor: C.s1, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Image source={ART.cupBig} style={{ width: 44, height: 44 }} contentFit="contain" />
        <View style={{ flex: 1 }}><Txt v="label">Weekly Cup</Txt><Txt v="small">See where you stand this week</Txt></View>
        <Txt v="small" style={{ fontSize: 18 }}>›</Txt>
      </Pressable>
    </ScrollView>
  );
}
