// A squad's public page (/squad/<squad address>), for anyone, member or not: the banner and crest, name, level, members,
// chest, squad P&L (the chest's trading score plus members' stock positions at live prices), the war record with
// recent wars, the captain and members, and a read-only peek at #general when that channel exists. One big button:
// Join squad (joined exactly like Discover does: sponsored player account if needed, then join_clan) or Open squad.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Share as RNShare, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { P, base, clanName } from '@/chain/client';
import { ago, clanLevel, readChannel, reader, usePoll, usePrices, useProfiles, type Profile } from '@/chain/social';
import { fmtPnl, pnlColor, readStockPnl, saveSelected } from '@/chain/squads';
import { errText, short, useChain } from '@/chain/useChain';
import { previewText } from '@/stickers';
import { ClayLoop } from '@/ui/clay';
import { ProfileAvatar } from '@/ui/feed';
import { ART, BackBtn, Bone, Btn, ErrorLine, IconBtn, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { Share, Swords } from '@/ui/icons';
import { useDeskColumn } from '@/ui/layout';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { Badge, CARD, GOLD, HAIR, LevelBar, MemberStack, SquadBanner } from '@/ui/squads/parts';
import { C, F, FONT, S } from '@/ui/tokens';

type Chain = ReturnType<typeof useChain>;
type MemberRow = { wallet: PublicKey; joinedAt: number; deposit: number };
type WarRow = { key: PublicKey; opp: PublicKey; oppName: string; status: number; result: 'won' | 'lost' | 'tie' | 'live' | 'declared'; mine: number; theirs: number; pot: number; endTs: number };
type SquadPage = {
  key: PublicKey; name: string; crest: number; captain: PublicKey; members: MemberRow[]; memberCount: number; chest: number; scorePnl: number;
  wins: number; losses: number; atWar: boolean; xp: number; level: number; levelFloor: number; levelNext: number; wars: WarRow[];
};

/** "3h", "12m": time until a unix timestamp. */
const left = (ts: number) => { const s = Math.max(0, ts - Date.now() / 1000); return s < 3600 ? `${Math.ceil(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`; };
const parseKey = (s?: string | string[]) => { try { return s ? new PublicKey(Array.isArray(s) ? s[0] : s) : null; } catch { return null; } };

/** The squad account, its Member accounts (captain first, then by join date) and its wars, from the Clashy program. */
async function readSquadPage(key: PublicKey): Promise<SquadPage | null> {
  const c = await reader.account.clan.fetchNullable(key);
  if (!c) return null;
  const [members, wars] = await Promise.all([
    reader.account.member.all([{ memcmp: { offset: 8, bytes: key.toBase58() } }]),
    reader.account.war.all(),
  ]);
  const ours = wars.filter((w) => (w.account.clanA.equals(key) || w.account.clanB.equals(key)) && w.account.status !== 3);
  const oppKeys = ours.map((w) => (w.account.clanA.equals(key) ? w.account.clanB : w.account.clanA));
  const opps = oppKeys.length ? await reader.account.clan.fetchMultiple(oppKeys) : [];
  const chest = Number(c.chest) / 1e6;
  return {
    key, name: clanName(c.name), crest: c.crest, captain: c.captain, memberCount: c.members, chest, scorePnl: Number(c.scorePnl) / 1e6,
    wins: c.wins, losses: c.losses, atWar: !c.war.equals(PublicKey.default), ...clanLevel(c.wins, c.members, chest),
    members: members.map((m) => ({ wallet: m.account.wallet, joinedAt: Number(m.account.joinedAt), deposit: Number(m.account.deposit) / 1e6 }))
      .sort((a, b) => Number(b.wallet.equals(c.captain)) - Number(a.wallet.equals(c.captain)) || a.joinedAt - b.joinedAt),
    wars: ours.map((w, i) => {
      const a = w.account.clanA.equals(key);
      const side = a ? 1 : 2;
      const { status, winner } = w.account;
      const result: WarRow['result'] = status === 0 ? 'declared' : status === 1 ? 'live' : winner === 3 ? 'tie' : winner === side ? 'won' : 'lost';
      const opp = opps[i];
      return {
        key: w.publicKey, opp: oppKeys[i], oppName: opp ? clanName(opp.name) : short(oppKeys[i].toBase58()), status, result,
        mine: Number(w.account.returnBps[a ? 0 : 1]) / 100, theirs: Number(w.account.returnBps[a ? 1 : 0]) / 100,
        pot: (Number(w.account.stake) * 2) / 1e6, endTs: Number(w.account.endTs),
      };
    }).sort((x, y) => Number(y.status === 1) - Number(x.status === 1) || y.endTs - x.endTs),
  };
}

/** join_clan needs the player account; make it first if this wallet has none (sponsored). Same as Discover. */
async function ensurePlayer(chain: Chain) {
  const { me, progs, sponsor, onBase } = chain;
  if (!me || !progs || !sponsor) throw new Error("Clashy's payment relay is offline, so nothing can be sent right now. Try again in a minute.");
  if (!(await base.getAccountInfo(P.player(me)))) await onBase('Create player account', () => progs.base.methods.initPlayer().accountsPartial({ owner: me, payer: sponsor }).rpc());
  return { me, progs, sponsor };
}

const Stat = ({ k, v, color = C.ink, sub }: { k: string; v: string; color?: string; sub?: string }) => (
  <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: '#17171D', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 }}>
    <Txt v="small" lines={1} style={{ fontSize: 12 }}>{k}</Txt>
    <Txt v="title" lines={1} color={color} style={{ fontSize: 22, marginTop: 2, fontVariant: ['tabular-nums'] }}>{v}</Txt>
    {sub ? <Txt v="small" lines={1} style={{ fontSize: 11, marginTop: 1 }}>{sub}</Txt> : null}
  </View>
);

const Head = ({ title, right }: { title: string; right?: string }) => (
  <Row style={{ marginTop: 26, marginBottom: 10, justifyContent: 'space-between' }}>
    <Txt v="h2" style={{ fontSize: 18 }}>{title}</Txt>
    {right ? <Txt v="small">{right}</Txt> : null}
  </Row>
);

export default function SquadPublic() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const { id } = useLocalSearchParams<{ id: string }>();
  const key = useMemo(() => parseKey(id), [id]);
  const chain = useChain();
  const { me } = chain;
  const squad = usePoll(() => (key ? readSquadPage(key) : Promise.resolve(null)), 8000, [key?.toBase58(), chain.tick]);
  const chat = usePoll(() => (key ? readChannel(key, 0) : Promise.resolve(null)), 6000, [key?.toBase58()]);
  const profiles = useProfiles();
  const prices = usePrices();
  const pricesReady = prices.status === 'ready';
  const px = useRef<Record<string, number>>({});
  if (prices.status === 'ready') px.current = prices.data;
  const s = squad.status === 'ready' ? squad.data : null;
  const memberSig = s ? s.members.map((m) => m.wallet.toBase58()).join(',') : '';
  const stocks = usePoll(() => (s && pricesReady ? readStockPnl(s.members.map((m) => m.wallet), px.current) : Promise.resolve(null)), 10_000, [memberSig, pricesReady]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const ts = useTourScroll<ComponentRef<typeof ScrollView>>();
  useScreenTour('squad', !!s);

  const prof = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();
  const nameOf = (k: PublicKey) => prof.get(k.toBase58())?.name ?? short(k.toBase58());
  const isMember = !!me && !!s && s.members.some((m) => m.wallet.equals(me));
  const stockPnl = stocks.status === 'ready' && stocks.data ? [...stocks.data.values()].reduce((a, r) => a + r.pnl, 0) : null;
  const priced = stocks.status === 'ready' && stocks.data ? [...stocks.data.values()].every((r) => r.priced) : true;
  const pnl = s && stockPnl !== null ? s.scorePnl + stockPnl : null;
  const capt = s ? prof.get(s.captain.toBase58()) : undefined;
  const liveWar = s?.wars.find((w) => w.status === 1);
  const pastWars = s ? s.wars.filter((w) => w.status === 2).slice(0, 4) : [];
  const msgs = chat.status === 'ready' && chat.data ? chat.data.msgs.slice(-4) : [];
  const shown = s ? (showAll ? s.members : s.members.slice(0, 6)) : [];

  const back = () => (router.canGoBack() ? router.back() : router.replace('/squads/discover' as Href));
  const openSquad = (k: PublicKey) => { saveSelected(k); router.dismissTo({ pathname: '/clans', params: { clan: k.toBase58() } } as unknown as Href); };
  const share = () => s && RNShare.share({ message: `Join my squad "${s.name}" on Clashy: open Squads, tap Discover and find ${s.name}.` }).catch(() => {});
  const join = async () => {
    if (!s || busy) return;
    if (!chain.me) { chain.wallet.login?.(); return; }
    setBusy(true); setErr(undefined);
    try {
      const { me: w, progs, sponsor } = await ensurePlayer(chain);
      await chain.onBase(`Join ${s.name}`, () => progs.base.methods.joinClan().accountsPartial({ wallet: w, payer: sponsor, clan: s.key, member: P.member(s.key, w) }).rpc());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await saveSelected(s.key);
      openSquad(s.key);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const top = (
    <Row style={{ gap: 10 }}>
      <BackBtn onPress={back} />
      <View style={{ flex: 1 }} />
      {s ? <IconBtn size={38} onPress={share}><Share size={17} color={C.ink} /></IconBtn> : null}
    </Row>
  );

  // bad link / not found / failed read
  if (!key || (squad.status === 'ready' && !s) || (squad.status === 'error' && !s)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
        {top}
        <View style={{ marginTop: 18 }}>
          {squad.status === 'error' && key ? (
            <Pending art={ART.offline} title="Can't load this squad" body={squad.error} action="Try again" onAction={squad.reload} />
          ) : (
            <Pending art={ART.emptySearch} title={key ? 'Squad not found' : "That isn't a squad link"} body={key ? 'No squad lives at this address. It may have been typed wrong.' : 'The link is missing or broken.'} action="Discover squads" onAction={() => router.replace('/squads/discover' as Href)} />
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 120 }}>
        <TourScroll value={ts.scroller}>
        {top}

        {!s ? (
          <View style={{ marginTop: 14 }}>
            <Bone w="100%" h={270} r={24} />
            <Row style={{ gap: 8, marginTop: 12 }}><Bone w="48%" h={76} r={18} /><Bone w="48%" h={76} r={18} /></Row>
            <View style={{ marginTop: 18 }}><SkeletonRows n={4} /></View>
          </View>
        ) : (
          <>
            {/* banner, crest, name */}
            <TourTarget id="squad-card" style={{ marginTop: 14 }}>
            <Animated.View entering={FadeInDown.duration(320)} style={{ borderRadius: 24, backgroundColor: CARD }}>
              <SquadBanner crest={s.crest} height={150}><ClayLoop name="clanCity" width="100%" height={150} cover /></SquadBanner>
              {s.atWar ? <View style={{ position: 'absolute', top: 12, right: 12 }}><Badge text="At war" color={C.opp} /></View> : null}
              <View style={{ paddingHorizontal: 16, paddingTop: 36, paddingBottom: 16 }}>
                <Row style={{ gap: 8 }}>
                  <Txt v="title" lines={1} style={{ flexShrink: 1, fontSize: 26 }}>{s.name}</Txt>
                  {isMember ? <Badge text="You're in" color="rgba(171,159,242,0.25)" fg={C.brandSoft} /> : null}
                </Row>
                <Row style={{ gap: 6, marginTop: 6 }}>
                  <Image source={ART.crown} style={{ width: 16, height: 16 }} contentFit="contain" />
                  <Txt v="small" lines={1} color="#B9B9C3" style={{ flex: 1 }}>
                    Captain <Txt v="small" color={GOLD} style={{ ...FONT.semi }}>{capt?.name ? `@${capt.name}` : short(s.captain.toBase58())}</Txt> · {s.memberCount} member{s.memberCount === 1 ? '' : 's'}
                  </Txt>
                </Row>
                <View style={{ marginTop: 14 }}><LevelBar level={s.level} xp={s.xp} floor={s.levelFloor} next={s.levelNext} /></View>
                {s.members.length ? (
                  <Row style={{ gap: 10, marginTop: 14 }}>
                    <MemberStack profiles={s.members.map((m) => prof.get(m.wallet.toBase58()))} total={s.members.length} size={30} />
                    <Txt v="small" lines={1} style={{ flex: 1, fontSize: 12.5 }} color="#C9C9D1">
                      {s.members.slice(0, 2).map((m) => nameOf(m.wallet)).join(', ')}{s.members.length > 2 ? ` and ${s.members.length - 2} more` : ''}
                    </Txt>
                  </Row>
                ) : null}
              </View>
            </Animated.View>
            </TourTarget>

            {/* numbers */}
            <TourTarget id="squad-stats" style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Stat k="Squad P&L" v={pnl === null ? '…' : fmtPnl(pnl)} color={pnl === null ? C.muted : pnlColor(pnl, C.up, C.down, C.ink)} sub={priced ? 'Chest trades + members’ stocks' : 'Some prices still loading'} />
              <Stat k="Chest" v={`$${s.chest.toFixed(2)}`} sub="Shared USDC" />
              <Stat k="Members" v={String(s.memberCount)} sub={`Level ${s.level}`} />
              <Stat k="War record" v={`${s.wins}W ${s.losses}L`} sub={s.wins + s.losses ? `${Math.round((s.wins / (s.wins + s.losses)) * 100)}% won` : 'No wars yet'} />
            </View>
            </TourTarget>
            {stocks.status === 'error' ? <ErrorLine msg={stocks.error} onRetry={stocks.reload} /> : null}

            {/* wars */}
            <Head title="Squad wars" right={s.wins + s.losses ? `${s.wins + s.losses} fought` : undefined} />
            <TourTarget id="squad-wars">
            {liveWar ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14, backgroundColor: 'rgba(240,70,140,0.10)', borderWidth: 1, borderColor: 'rgba(240,70,140,0.4)', marginBottom: 8 }}>
                <ClayLoop name="war" size={52} style={{ borderRadius: 14 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>At war with {liveWar.oppName}</Txt>
                  <Txt v="small" lines={1}>${liveWar.pot.toFixed(2)} pot · {liveWar.endTs > Date.now() / 1000 ? `ends in ${left(liveWar.endTs)}` : 'settling'}</Txt>
                </View>
                <Badge text="Live" color={C.opp} />
              </View>
            ) : null}
            {pastWars.length ? pastWars.map((w) => (
              <View key={w.key.toBase58()} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingHorizontal: 14, minHeight: 60, paddingVertical: 10, backgroundColor: CARD, marginBottom: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: w.result === 'won' ? C.upBg : w.result === 'lost' ? C.downBg : C.s2, alignItems: 'center', justifyContent: 'center' }}>
                  <Swords size={16} color={w.result === 'won' ? C.up : w.result === 'lost' ? C.down : C.muted} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>vs {w.oppName}</Txt>
                  <Txt v="small" lines={1}>{w.mine >= 0 ? '+' : ''}{w.mine.toFixed(1)}% vs {w.theirs >= 0 ? '+' : ''}{w.theirs.toFixed(1)}% · {w.endTs ? `${ago(w.endTs)} ago` : ''}</Txt>
                </View>
                <Txt v="label" color={w.result === 'won' ? C.up : w.result === 'lost' ? C.down : C.muted}>{w.result === 'won' ? 'Won' : w.result === 'lost' ? 'Lost' : 'Tie'}</Txt>
              </View>
            )) : !liveWar ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, backgroundColor: '#0E0E12' }}>
                <Image source={ART.tileWar} style={{ width: 44, height: 44 }} contentFit="contain" />
                <Txt v="small" style={{ flex: 1, lineHeight: 18 }}>No wars fought yet. The captain can challenge another squad, chest against chest.</Txt>
              </View>
            ) : null}
            </TourTarget>

            {/* members */}
            <Head title="Members" right={`${s.members.length}`} />
            <View style={{ backgroundColor: CARD, borderRadius: 22, overflow: 'hidden' }}>
              {shown.map((m, i) => {
                const p = prof.get(m.wallet.toBase58());
                const isCapt = m.wallet.equals(s.captain);
                const isMe = !!me && m.wallet.equals(me);
                return (
                  <Pressable key={m.wallet.toBase58()} onPress={() => router.push(`/u/${m.wallet.toBase58()}` as Href)}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: HAIR, backgroundColor: pressed ? '#1A1A21' : 'transparent' })}>
                    <ProfileAvatar p={p} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Row style={{ gap: 6 }}>
                        <Txt v="label" lines={1} color={isCapt ? GOLD : C.ink} style={{ flexShrink: 1 }}>{p?.name ?? short(m.wallet.toBase58())}</Txt>
                        {isCapt ? <Image source={ART.crown} style={{ width: 15, height: 15 }} contentFit="contain" /> : null}
                        {isMe ? <Txt v="small" color={C.dim} style={{ fontSize: 11 }}>you</Txt> : null}
                      </Row>
                      <Txt v="small" lines={1} style={{ fontSize: 12 }}>{isCapt ? 'Captain' : 'Member'}{m.joinedAt ? ` · joined ${ago(m.joinedAt)} ago` : ''}</Txt>
                    </View>
                    {m.deposit > 0 ? <Txt v="small" color="#C9C9D1" style={{ fontVariant: ['tabular-nums'] }}>${m.deposit.toFixed(2)} in</Txt> : null}
                    <Txt v="label" color={C.dim}>›</Txt>
                  </Pressable>
                );
              })}
              {s.members.length > 6 ? (
                <Pressable onPress={() => setShowAll((v) => !v)} style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: HAIR, backgroundColor: pressed ? '#1A1A21' : 'transparent' })}>
                  <Txt v="label" color={C.brandSoft} style={{ fontSize: 13.5 }}>{showAll ? 'Show fewer' : `Show all ${s.members.length}`}</Txt>
                </Pressable>
              ) : null}
            </View>

            {/* #general preview, read only */}
            {chat.status === 'ready' && chat.data ? (
              <>
                <Head title="#general" right={chat.data.count ? `${chat.data.count} message${chat.data.count === 1 ? '' : 's'}` : undefined} />
                <View style={{ backgroundColor: CARD, borderRadius: 22, padding: 14, gap: 12 }}>
                  {msgs.length === 0 ? (
                    <Row style={{ gap: 12 }}>
                      <Image source={ART.emptyChats} style={{ width: 44, height: 44 }} contentFit="contain" />
                      <Txt v="small" style={{ flex: 1 }}>Quiet so far. Nobody has said gm yet.</Txt>
                    </Row>
                  ) : msgs.map((m) => (
                    <Row key={m.i} style={{ gap: 10, alignItems: 'flex-start' }}>
                      <ProfileAvatar p={prof.get(m.author.toBase58())} size={30} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Row style={{ gap: 6 }}>
                          <Txt v="label" lines={1} color={m.author.equals(s.captain) ? GOLD : C.ink} style={{ fontSize: 13.5, flexShrink: 1 }}>{nameOf(m.author)}</Txt>
                          <Txt v="small" color={C.dim} style={{ fontSize: 11 }}>{ago(m.ts)}</Txt>
                        </Row>
                        <Txt v="body" lines={2} color="#C9C9D1" style={{ fontSize: 14, lineHeight: 19, marginTop: 1 }}>{m.kind === 1 ? 'Posted a clash challenge' : previewText(m.text)}</Txt>
                      </View>
                    </Row>
                  ))}
                  {isMember ? (
                    <Btn title="Open chat" kind="ghost" h={44} onPress={() => router.push({ pathname: '/clan-chat', params: { clan: s.key.toBase58(), ch: '0' } } as unknown as Href)} />
                  ) : <Txt v="small" style={{ textAlign: 'center', fontSize: 12 }}>Join the squad to chat</Txt>}
                </View>
              </>
            ) : chat.status === 'error' ? <ErrorLine msg={chat.error} onRetry={chat.reload} /> : null}
            {squad.status === 'error' ? <ErrorLine msg={squad.error} onRetry={squad.reload} /> : null}
          </>
        )}
        </TourScroll>
      </ScrollView>

      {/* the one action */}
      {s ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)', '#000']} locations={[0, 0.45, 1]} style={{ position: 'absolute', left: 0, right: 0, top: -24, bottom: 0 }} />
          <View style={[col, { paddingHorizontal: S.gutter, paddingTop: 8, paddingBottom: insets.bottom + 12 }]}>
            {err ? <ErrorLine msg={err} /> : null}
            {isMember
              ? <TourTarget id="squad-open"><Btn title="Open squad" h={56} onPress={() => openSquad(s.key)} /></TourTarget>
              : <TourTarget id="squad-join"><Btn title={busy ? 'Joining…' : me ? 'Join squad' : 'Sign in to join'} kind="white" h={56} disabled={busy} onPress={join} /></TourTarget>}
            {!isMember ? <Txt v="small" style={{ textAlign: 'center', marginTop: 6, fontSize: 11.5 }}>Free to join · be in as many squads as you like</Txt> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
