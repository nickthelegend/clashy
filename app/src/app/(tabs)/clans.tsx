// Squads, laid out like a Discord server list. The rail holds every squad you are in (one Member account each), with
// an unread badge from chat activity, then Discover (✦) and Start a squad (+). The selected squad shows its server:
// banner, members and who is in a clash right now, level and XP (from wars won, members and chest), quick tiles, and
// channel groups: CHALLENGES (members' open duels, the Weekly Cup), PORTFOLIO (the chest and its votes), LOBBY
// (members with live presence from duels on the rollup) and CHAT (#general, #trades on the MagicBlock rollup).
// Every number is read from program accounts; nothing is invented.
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share as RNShare, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { PublicKey } from '@solana/web3.js';
import { COIN_SYMBOLS, P } from '@/chain/client';
import { useClansOnchain, useFeed } from '@/chain/reads';
import { readClanServer, reader, usePoll, usePrices, useProfiles, isTestAccount } from '@/chain/social';
import {
  CHANNELS, fmtPnl, loadSelected, metaOf, pnlColor, readChannelMetas, readMySquads, readSeen, readStockPnl, saveSelected, seenOf,
} from '@/chain/squads';
import { errText, short, useChain } from '@/chain/useChain';
import { ClayLoop } from '@/ui/clay';
import { ProfileAvatar } from '@/ui/feed';
import { ART, Btn, ErrorLine, Row, SkeletonRows, Txt, Bone } from '@/ui/kit';
import { Crown, Swords } from '@/ui/icons';
import { useDeskColumn } from '@/ui/layout';
import { Sheet, SheetTile } from '@/ui/sheet';
import { Badge, CARD, Channel, GOLD, Group, HAIR, LevelBar, RailButton, RailIcon, SquadBanner, Tile, crestSrc } from '@/ui/squads/parts';
import { CreateSquadSheet } from '@/ui/squads/sheets';
import { C, F } from '@/ui/tokens';

const RAIL = 72;
/** Monday 00:00 UTC of the current week (the Weekly Cup resets then). */
const cupLeft = () => {
  const now = Date.now() / 1000;
  const d = Math.floor(now / 86_400);
  const end = (d - ((d + 3) % 7)) * 86_400 + 7 * 86_400;
  const left = Math.max(0, end - now);
  const days = Math.floor(left / 86_400), hrs = Math.floor((left % 86_400) / 3600);
  return days ? `${days}d ${hrs}h` : `${hrs}h ${Math.floor((left % 3600) / 60)}m`;
};

export default function Squads() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const chain = useChain();
  const { me, wallet } = chain;
  const params = useLocalSearchParams<{ clan?: string }>();
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string>();
  const [leaving, setLeaving] = useState(false);

  const mine = usePoll(() => (me ? readMySquads(me) : Promise.resolve([])), 6000, [me?.toBase58(), chain.tick]);
  const squads = mine.status === 'ready' ? mine.data : [];
  const keysSig = squads.map((s) => s.key.toBase58()).join(',');

  useFocusEffect(useCallback(() => {
    loadSelected().then((v) => { if (v) setSel(v); });
    mine.reload();
  }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (params.clan) setSel(params.clan); }, [params.clan]);

  const current = squads.find((s) => s.key.toBase58() === sel) ?? squads[0] ?? null;
  const clanKey = current?.key ?? null;
  const pick = (k: PublicKey) => { setSel(k.toBase58()); saveSelected(k); };

  const server = usePoll(() => (clanKey ? readClanServer(clanKey) : Promise.resolve(null)), 5000, [clanKey?.toBase58(), chain.tick]);
  const metas = usePoll(() => readChannelMetas(squads.map((s) => s.key)), 4000, [keysSig]);
  const seen = usePoll(() => readSeen(squads.map((s) => s.key)), 2500, [keysSig]);
  const profiles = useProfiles();
  const prices = usePrices();
  const feed = useFeed();
  const prof = profiles.status === 'ready' ? profiles.data : new Map();
  const s = server.status === 'ready' && server.data && clanKey && server.data.key.equals(clanKey) ? server.data : null;
  const memberSig = s ? s.members.map((m) => m.toBase58()).join(',') : '';
  const pricesReady = prices.status === 'ready';
  const px = useRef<Record<string, number>>({});
  if (prices.status === 'ready') px.current = prices.data;
  const stocks = usePoll(() => (s && pricesReady ? readStockPnl(s.members, px.current) : Promise.resolve(null)), 10000, [memberSig, pricesReady]);
  const chestScore = current && s ? current.scorePnl : 0;
  const stockPnl = stocks.status === 'ready' && stocks.data ? [...stocks.data.values()].reduce((a, r) => a + r.pnl, 0) : null;
  const squadPnl = stockPnl === null ? null : chestScore + stockPnl;

  const m = metas.status === 'ready' ? metas.data : null;
  const sn = seen.status === 'ready' ? seen.data : null;
  const unreadOf = (k: PublicKey) => CHANNELS.reduce((a, c) => a + Math.max(0, (metaOf(m, k, c.id)?.count ?? 0) - seenOf(sn, k, c.id)), 0);

  const inSquad = useMemo(() => new Set(s?.members.map((x) => x.toBase58()) ?? []), [memberSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = feed.status === 'ready' ? feed.data : null;
  const openDuels = f ? f.open.filter((d) => inSquad.has(d.creator.toBase58())) : [];
  const liveDuels = f ? f.live.filter((d) => inSquad.has(d.creator.toBase58()) || inSquad.has(d.joiner.toBase58())) : [];
  const busyIn = new Set(liveDuels.flatMap((d) => [d.creator.toBase58(), d.joiner.toBase58()]).filter((k) => inSquad.has(k)));
  const nameOf = (k: PublicKey) => prof.get(k.toBase58())?.name ?? short(k.toBase58());

  const openChat = (id: number) => clanKey && router.push({ pathname: '/clan-chat', params: { clan: clanKey.toBase58(), ch: String(id) } } as unknown as Href);
  const openChest = () => clanKey && router.push({ pathname: '/onchain-clan', params: { clan: clanKey.toBase58() } } as unknown as Href);
  const invite = () => s && RNShare.share({ message: `Join my squad "${s.name}" on Clashy: open Squads, tap ✦ Discover and find ${s.name}.` }).catch(() => {});
  const leave = async () => {
    if (!s || !me || !chain.progs) return;
    setLeaving(true); setLeaveErr(undefined);
    try {
      const mem = await reader.account.member.fetch(P.member(s.key, me));
      if (Number(mem.shares) > 0) throw new Error('Cash out your chest shares first: Chest → Cash out, then leave.');
      await chain.onBase(`Leave ${s.name}`, () => chain.progs!.base.methods.leaveClan().accountsPartial({ wallet: me, clan: s.key, member: P.member(s.key, me), rentPayer: mem.rentPayer }).rpc());
      setMenu(false); setSel(null); mine.reload();
    } catch (e) { setLeaveErr(errText(e)); } finally { setLeaving(false); }
  };

  const loading = wallet.status === 'loading' || (me && mine.status === 'loading');
  const none = !loading && (!me || (mine.status === 'ready' && squads.length === 0));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={[{ flex: 1, flexDirection: 'row' }, col]}>
        {/* rail: every squad I'm in, then discover and create */}
        <View style={{ width: RAIL, backgroundColor: '#07070A', borderRightWidth: 1, borderRightColor: '#16161C' }}>
          <ScrollView contentContainerStyle={{ alignItems: 'center', paddingTop: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            {loading ? [0, 1].map((i) => <Bone key={i} w={48} h={48} r={24} style={{ marginVertical: 3 }} />) : null}
            {squads.map((q) => (
              <RailIcon key={q.key.toBase58()} crest={q.crest} label={q.name} selected={!!clanKey && q.key.equals(clanKey)} unread={unreadOf(q.key)} onPress={() => pick(q.key)} />
            ))}
            {squads.length ? <View style={{ width: 30, height: 2, borderRadius: 1, backgroundColor: '#24242C', marginVertical: 8 }} /> : null}
            <RailButton glyph="✦" label="Discover squads" onPress={() => router.push('/squads/discover' as Href)} />
            <RailButton glyph="+" label="Start a squad" onPress={() => (me ? setCreating(true) : wallet.login?.())} />
          </ScrollView>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {loading ? (
            <View><Bone w="100%" h={240} r={20} /><View style={{ height: 14 }} /><SkeletonRows n={4} square /></View>
          ) : none ? (
            <EmptySquads signedOut={!me} onLogin={() => wallet.login?.()} onCreate={() => setCreating(true)} />
          ) : current ? (
            <>
              {/* server banner */}
              <View style={{ borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR }}>
                <SquadBanner crest={current.crest} height={120}><ClayLoop name="clanCity" width="100%" height={120} cover /></SquadBanner>
                <View style={{ paddingHorizontal: 14, paddingTop: 32, paddingBottom: 14 }}>
                  <Row style={{ gap: 8 }}>
                    <Txt v="title" lines={1} style={{ flex: 1, fontFamily: F.display, fontSize: 24, letterSpacing: -0.4 }}>{current.name}</Txt>
                    {current.atWar ? <Badge text="AT WAR" color={C.opp} /> : null}
                    <Pressable onPress={() => setMenu(true)} accessibilityLabel="Squad menu" hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#1F1F27', alignItems: 'center', justifyContent: 'center' }}>
                      <Txt v="label" color={C.ink} style={{ fontSize: 16, marginTop: -4 }}>⋯</Txt>
                    </Pressable>
                  </Row>
                  <Row style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: busyIn.size ? C.up : C.dim }} />
                    <Txt v="small" color="#B9B9C3">{current.members} member{current.members === 1 ? '' : 's'} · {busyIn.size} in a clash now</Txt>
                  </Row>
                  <Row style={{ gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}><LevelBar level={current.level} xp={current.xp} floor={current.levelFloor} next={current.levelNext} /></View>
                  </Row>
                  <Row style={{ marginTop: 12, gap: 8, alignItems: 'flex-end' }}>
                    <View style={{ flex: 1 }}>
                      <Txt v="small" style={{ fontSize: 11 }}>Squad P&L</Txt>
                      <Txt v="title" color={squadPnl === null ? C.muted : pnlColor(squadPnl, C.up, C.down, C.ink)} style={{ fontSize: 26, fontVariant: ['tabular-nums'] }}>{squadPnl === null ? '…' : fmtPnl(squadPnl)}</Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt v="small" style={{ fontSize: 11 }}>Chest</Txt>
                      <Txt v="label" style={{ fontSize: 16, fontVariant: ['tabular-nums'] }}>${current.chest.toFixed(2)}</Txt>
                    </View>
                  </Row>
                  <Row style={{ gap: 8, marginTop: 12 }}>
                    <Tile art={ART.invite} label="Invite" onPress={invite} />
                    <Tile art={ART.stash} label="Chest" sub={current.openVotes ? `${current.openVotes} vote${current.openVotes === 1 ? '' : 's'}` : undefined} onPress={openChest} />
                    <Tile art={ART.cupBig} label="Cup" sub={cupLeft()} onPress={() => router.push('/cup' as Href)} />
                  </Row>
                </View>
              </View>

              <Group title="CHALLENGES" />
              <Channel name="clashes" glyph={(c) => <Swords size={14} color={c} />} badge={openDuels.length ? `${openDuels.length} open` : undefined} live={liveDuels.length > 0} unread={openDuels.length > 0}
                sub={openDuels.length ? `${[...new Set(openDuels.map((d) => nameOf(d.creator)))].join(', ')} want${openDuels.length === 1 ? 's' : ''} a clash` : liveDuels.length ? `${liveDuels.length} live now` : 'No open clashes right now'}
                onPress={() => router.push('/onchain' as Href)} />
              <Channel name="weekly-cup" glyph={(c) => <Crown size={15} color={c} />} live sub={`Ends in ${cupLeft()} · best calls win`} onPress={() => router.push('/cup' as Href)} />

              <Group title="PORTFOLIO" />
              <Channel name="chest" glyph="$" badge={current.openVotes ? `${current.openVotes} vote${current.openVotes === 1 ? '' : 's'}` : undefined} badgeColor={GOLD} unread={current.openVotes > 0}
                sub={`$${current.chest.toFixed(2)} USDC · trades ${fmtPnl(current.scorePnl)}`} onPress={openChest} />

              <Group title={`Lobby — ${s ? s.members.length : current.members}`} right={busyIn.size ? <Txt v="small" color={C.up} style={{ fontSize: 11, fontFamily: F.semi }}>{busyIn.size} clashing</Txt> : null} />
              {!s ? <SkeletonRows n={2} /> : [...s.members].sort((a, b) => Number(busyIn.has(b.toBase58())) - Number(busyIn.has(a.toBase58())) || Number(s.captain.equals(b)) - Number(s.captain.equals(a))).map((mk) => {
                const p = prof.get(mk.toBase58());
                const duel = liveDuels.find((d) => d.creator.equals(mk) || d.joiner.equals(mk));
                const open = openDuels.find((d) => d.creator.equals(mk));
                const isMe = !!me && mk.equals(me);
                return (
                  <Row key={mk.toBase58()} style={{ gap: 10, paddingVertical: 6, paddingHorizontal: 8, minHeight: 46 }}>
                    <View style={{ opacity: duel || isMe ? 1 : 0.75 }}>
                      <ProfileAvatar p={p} size={34} />
                      <View style={{ position: 'absolute', right: -2, bottom: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: duel ? C.up : open ? GOLD : '#3A3A44', borderWidth: 2.5, borderColor: C.bg }} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Row style={{ gap: 6 }}>
                        <Txt v="label" lines={1} color={s.captain.equals(mk) ? GOLD : C.ink} style={{ fontSize: 14, flexShrink: 1 }}>{p?.name ?? short(mk.toBase58())}</Txt>
                        {s.captain.equals(mk) ? <Image source={ART.crown} style={{ width: 15, height: 15 }} contentFit="contain" /> : null}
                        {isMe ? <Txt v="small" color={C.dim} style={{ fontSize: 11 }}>you</Txt> : null}
                      </Row>
                      {duel ? <Txt v="small" lines={1} style={{ fontSize: 12 }} color={C.up}>in a clash on {COIN_SYMBOLS[duel.coin] ?? 'a coin'} · {duel.stake.toFixed(0)} USDC</Txt>
                        : open ? <Txt v="small" lines={1} style={{ fontSize: 12 }} color={GOLD}>waiting for a rival · {open.stake.toFixed(0)} USDC</Txt>
                        : p && p.dayStreak > 1 ? <Txt v="small" lines={1} style={{ fontSize: 12 }}>{p.dayStreak}-day streak</Txt> : null}
                    </View>
                  </Row>
                );
              })}

              <Group title="CHAT" />
              {CHANNELS.map((c) => {
                const meta = metaOf(m, current.key, c.id);
                const unread = Math.max(0, (meta?.count ?? 0) - seenOf(sn, current.key, c.id));
                const last = meta?.last;
                return (
                  <Channel key={c.id} name={c.name} unread={unread > 0} badge={unread ? `${unread > 99 ? '99+' : unread} new` : undefined} badgeColor={C.opp} count={unread ? undefined : meta?.count}
                    sub={!meta ? 'Loading…' : last ? `${nameOf(last.author)}: ${last.kind === 1 ? 'posted a clash challenge' : last.text}` : meta.state === 'none' ? 'Not opened yet · tap to open' : 'No messages yet · say gm'}
                    onPress={() => openChat(c.id)} />
                );
              })}
              {server.status === 'error' ? <ErrorLine msg={server.error} onRetry={server.reload} /> : null}
              {metas.status === 'error' ? <ErrorLine msg={metas.error} /> : null}
            </>
          ) : null}
          {mine.status === 'error' ? <ErrorLine msg={mine.error} onRetry={mine.reload} /> : null}
        </ScrollView>
      </View>

      <CreateSquadSheet open={creating} onClose={() => setCreating(false)} chain={chain} onCreated={(k) => { setCreating(false); pick(k); mine.reload(); }} />
      <Sheet open={menu} onClose={() => { setMenu(false); setLeaveErr(undefined); }} title={current?.name}>
        <SheetTile art={<Image source={ART.invite} style={{ width: 48, height: 48 }} contentFit="contain" />} title="Invite friends" line="Share the squad's name; they join from Discover" onPress={() => { setMenu(false); setTimeout(invite, 260); }} />
        <SheetTile art={<Image source={ART.stash} style={{ width: 48, height: 48 }} contentFit="contain" />} title="Chest and wars" line="Deposit, vote on trades, declare a war" accent={C.up} onPress={() => { setMenu(false); setTimeout(openChest, 260); }} />
        <SheetTile art={<Image source={ART.chat} style={{ width: 48, height: 48 }} contentFit="contain" />} title="Open #general" line="Live chat on the MagicBlock rollup" accent={C.opp} onPress={() => { setMenu(false); setTimeout(() => openChat(0), 260); }} />
        {leaveErr ? <ErrorLine msg={leaveErr} /> : null}
        <Btn title={leaving ? 'Leaving…' : `Leave ${current?.name ?? 'squad'}`} kind="ghost" h={48} style={{ marginTop: 4 }} disabled={leaving} onPress={leave} />
      </Sheet>
    </View>
  );
}

/** No squads yet: the clubhouse, two ways in, and the top real squads to peek at. */
function EmptySquads({ signedOut, onLogin, onCreate }: { signedOut: boolean; onLogin: () => void; onCreate: () => void }) {
  const clans = useClansOnchain();
  const profiles = useProfiles();
  const prof = profiles.status === 'ready' ? profiles.data : null;
  const top = clans.status === 'ready' && prof ? clans.data.filter((c) => !isTestAccount(prof.get(c.captain.toBase58()))).slice(0, 3) : [];
  return (
    <View>
      <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: CARD, borderWidth: 1, borderColor: HAIR }}>
        <ClayLoop name="clubhouse" width="100%" height={210} cover />
        <View style={{ padding: 16, paddingTop: 12 }}>
          <Txt v="title" style={{ fontFamily: F.display, fontSize: 26, letterSpacing: -0.4, lineHeight: 30 }}>Join your first squad</Txt>
          <Txt v="small" style={{ marginTop: 6, lineHeight: 18 }} color="#B9B9C3">A crew with a shared USDC chest you trade by vote, live chat, clashes and squad wars. Join as many as you like.</Txt>
          {signedOut ? <Btn title="Sign in" kind="white" h={52} style={{ marginTop: 14 }} onPress={onLogin} /> : (
            <>
              <Btn title="Discover squads" h={52} style={{ marginTop: 14 }} onPress={() => router.push('/squads/discover' as Href)} />
              <Btn title="Start a squad" kind="ghost" h={48} style={{ marginTop: 8 }} onPress={onCreate} />
            </>
          )}
        </View>
      </View>
      {top.length ? (
        <>
          <Group title="POPULAR RIGHT NOW" />
          {top.map((c) => (
            <Pressable key={c.key.toBase58()} onPress={() => router.push('/squads/discover' as Href)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14, backgroundColor: pressed ? '#1A1A21' : 'transparent' })}>
              <Image source={crestSrc(c.crest)} style={{ width: 42, height: 42 }} contentFit="contain" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1}>{c.name}</Txt>
                <Txt v="small" lines={1}>{c.members} member{c.members === 1 ? '' : 's'} · chest ${c.chest.toFixed(2)}</Txt>
              </View>
              <Txt v="label" color={C.muted}>›</Txt>
            </Pressable>
          ))}
        </>
      ) : null}
    </View>
  );
}
