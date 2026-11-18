// A squad's public page (/squad/<squad address>), for anyone, member or not: the crest, name, captain, level, squad
// P&L (the chest's trading score plus members' stock positions at live prices) as the one big number, chest and
// members, the war record with recent wars, the members, and a read-only peek at #general when that channel exists.
// One big button: Join squad (joined exactly like Discover does: sponsored player account if needed, then join_clan)
// or Open squad.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share as RNShare, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { P, base, clanName } from '@/chain/client';
import { ago, clanLevel, readChannel, reader, usePoll, usePrices, useProfiles, type Profile } from '@/chain/social';
import { fmtPnl, pnlColor, readStockPnl, saveSelected } from '@/chain/squads';
import { errText, short, useChain } from '@/chain/useChain';
import { ProfileAvatar } from '@/ui/feed';
import { ART, BackBtn, Bone, Btn, ErrorLine, IconBtn, LiveDot, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { Crown, Share, Swords } from '@/ui/icons';
import { useDeskColumn } from '@/ui/layout';
import { Badge, LevelBar, MemberStack, crestSrc } from '@/ui/squads/parts';
import { C, FONT, S } from '@/ui/tokens';

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

/** A stat tile: a small label over the value, one more grey line under it. */
const Stat = ({ k, v, color = C.ink, sub }: { k: string; v: string; color?: string; sub?: string }) => (
  <View style={{ flex: 1, minWidth: 0, backgroundColor: C.card, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12 }}>
    <Txt v="small" lines={1} style={{ fontSize: 12 }}>{k}</Txt>
    <Txt v="num" lines={1} color={color} style={{ marginTop: 2 }}>{v}</Txt>
    {sub ? <Txt v="small" lines={1} style={{ fontSize: 11.5, marginTop: 1 }}>{sub}</Txt> : null}
  </View>
);

const Head = ({ title, right }: { title: string; right?: string }) => (
  <Row style={{ marginTop: 28, marginBottom: 4, justifyContent: 'space-between' }}>
    <Txt v="h2">{title}</Txt>
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
      <ScrollView contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 120 }}>
        {top}

        {!s ? (
          <View style={{ marginTop: 14 }}>
            <Row style={{ gap: 12 }}><Bone w={48} h={48} r={16} /><View style={{ flex: 1, gap: 8 }}><Bone w="55%" h={18} /><Bone w="70%" h={11} /></View></Row>
            <Bone w="45%" h={34} r={10} style={{ marginTop: 24 }} />
            <Row style={{ gap: 8, marginTop: 16 }}><Bone w="31%" h={70} r={16} /><Bone w="31%" h={70} r={16} /><Bone w="31%" h={70} r={16} /></Row>
            <View style={{ marginTop: 18 }}><SkeletonRows n={4} /></View>
          </View>
        ) : (
          <>
            {/* crest, name, captain and members */}
            <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 10 }}>
              <Row style={{ gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={crestSrc(s.crest)} style={{ width: 40, height: 40 }} contentFit="contain" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Row style={{ gap: 8 }}>
                    <Txt v="title" lines={1} style={{ flexShrink: 1 }}>{s.name}</Txt>
                    {isMember ? <Badge text="You're in" /> : null}
                    {s.atWar ? <Badge text="At war" color={C.s2} fg={C.ink} /> : null}
                  </Row>
                  <Row style={{ gap: 5, marginTop: 2 }}>
                    <Crown size={13} color={C.brandSoft} />
                    <Txt v="small" lines={1} style={{ flex: 1 }}>
                      <Txt v="small" color={C.ink} style={{ ...FONT.medium }}>{capt?.name ? `@${capt.name}` : short(s.captain.toBase58())}</Txt> · {s.memberCount} member{s.memberCount === 1 ? '' : 's'} · LV {s.level}
                    </Txt>
                  </Row>
                </View>
              </Row>
              <View style={{ marginTop: 14 }}><LevelBar level={s.level} xp={s.xp} floor={s.levelFloor} next={s.levelNext} /></View>

              {/* the one big number: squad P&L */}
              <Txt v="small" style={{ marginTop: 20 }}>Squad P&L</Txt>
              <Text style={{ ...FONT.semi, fontSize: 34, letterSpacing: -1.2, marginTop: 2, color: pnl === null ? C.muted : pnlColor(pnl, C.up, C.down, C.ink), fontVariant: ['tabular-nums'] }}>{pnl === null ? '…' : fmtPnl(pnl)}</Text>
              <Txt v="small" style={{ marginTop: 2 }}>{priced ? 'Chest trades + members’ stocks' : 'Some prices still loading'}</Txt>

              <Row style={{ gap: 8, marginTop: 16 }}>
                <Stat k="Chest" v={`$${s.chest.toFixed(2)}`} sub="Shared USDC" />
                <Stat k="Members" v={String(s.memberCount)} sub={`Level ${s.level}`} />
                <Stat k="War record" v={`${s.wins}W ${s.losses}L`} sub={s.wins + s.losses ? `${Math.round((s.wins / (s.wins + s.losses)) * 100)}% won` : 'No wars yet'} />
              </Row>
              {s.members.length ? (
                <Row style={{ gap: 10, marginTop: 14 }}>
                  <MemberStack profiles={s.members.map((m) => prof.get(m.wallet.toBase58()))} total={s.members.length} size={28} />
                  <Txt v="small" lines={1} style={{ flex: 1 }}>
                    {s.members.slice(0, 2).map((m) => nameOf(m.wallet)).join(', ')}{s.members.length > 2 ? ` and ${s.members.length - 2} more` : ''}
                  </Txt>
                </Row>
              ) : null}
            </Animated.View>
            {stocks.status === 'error' ? <ErrorLine msg={stocks.error} onRetry={stocks.reload} /> : null}

            {/* wars */}
            <Head title="Squad wars" right={s.wins + s.losses ? `${s.wins + s.losses} fought` : undefined} />
            {liveWar ? (
              <Row style={{ gap: 12, paddingVertical: 10 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
                  <Swords size={19} color={C.ink} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>At war with {liveWar.oppName}</Txt>
                  <Txt v="small" lines={1} style={{ marginTop: 1 }}>${liveWar.pot.toFixed(2)} pot · {liveWar.endTs > Date.now() / 1000 ? `ends in ${left(liveWar.endTs)}` : 'settling'}</Txt>
                </View>
                <Row style={{ gap: 5 }}><LiveDot color={C.up} /><Txt v="small" color={C.up} style={{ ...FONT.medium }}>Live</Txt></Row>
              </Row>
            ) : null}
            {pastWars.length ? pastWars.map((w) => (
              <Row key={w.key.toBase58()} style={{ gap: 12, paddingVertical: 10 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
                  <Swords size={19} color={C.muted} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>vs {w.oppName}</Txt>
                  <Txt v="small" lines={1} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>{w.mine >= 0 ? '+' : ''}{w.mine.toFixed(1)}% vs {w.theirs >= 0 ? '+' : ''}{w.theirs.toFixed(1)}% · {w.endTs ? `${ago(w.endTs)} ago` : ''}</Txt>
                </View>
                <Txt v="label" color={w.result === 'won' ? C.up : w.result === 'lost' ? C.down : C.muted}>{w.result === 'won' ? 'Won' : w.result === 'lost' ? 'Lost' : 'Tie'}</Txt>
              </Row>
            )) : !liveWar ? (
              <Txt v="small" style={{ paddingVertical: 8, lineHeight: 18 }}>No wars fought yet. The captain can challenge another squad, chest against chest.</Txt>
            ) : null}

            {/* members */}
            <Head title="Members" right={`${s.members.length}`} />
            {shown.map((m) => {
              const p = prof.get(m.wallet.toBase58());
              const isCapt = m.wallet.equals(s.captain);
              const isMe = !!me && m.wallet.equals(me);
              return (
                <Pressable key={m.wallet.toBase58()} onPress={() => router.push(`/u/${m.wallet.toBase58()}` as Href)} accessibilityRole="button" accessibilityLabel={p?.name ?? short(m.wallet.toBase58())}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
                  <ProfileAvatar p={p} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Row style={{ gap: 6 }}>
                      <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{p?.name ?? short(m.wallet.toBase58())}</Txt>
                      {isCapt ? <Crown size={14} color={C.brandSoft} /> : null}
                      {isMe ? <Txt v="small" color={C.dim} style={{ fontSize: 12 }}>you</Txt> : null}
                    </Row>
                    <Txt v="small" lines={1} style={{ marginTop: 1 }}>{isCapt ? 'Captain' : 'Member'}{m.joinedAt ? ` · joined ${ago(m.joinedAt)} ago` : ''}</Txt>
                  </View>
                  {m.deposit > 0 ? <Txt v="num" style={{ fontSize: 14 }}>${m.deposit.toFixed(2)} <Txt v="small">in</Txt></Txt> : null}
                  <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>
                </Pressable>
              );
            })}
            {s.members.length > 6 ? (
              <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                <Txt v="small" color={C.brandSoft} style={{ ...FONT.medium }}>{showAll ? 'Show fewer' : `Show all ${s.members.length}`}</Txt>
              </Pressable>
            ) : null}

            {/* #general preview, read only */}
            {chat.status === 'ready' && chat.data ? (
              <>
                <Head title="#general" right={chat.data.count ? `${chat.data.count} message${chat.data.count === 1 ? '' : 's'}` : undefined} />
                <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 12, marginTop: 6 }}>
                  {msgs.length === 0 ? (
                    <Txt v="small">Quiet so far. Nobody has said gm yet.</Txt>
                  ) : msgs.map((m) => (
                    <Row key={m.i} style={{ gap: 10, alignItems: 'flex-start' }}>
                      <ProfileAvatar p={prof.get(m.author.toBase58())} size={30} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Row style={{ gap: 6 }}>
                          <Txt v="label" lines={1} style={{ fontSize: 14, flexShrink: 1 }}>{nameOf(m.author)}</Txt>
                          {m.author.equals(s.captain) ? <Crown size={12} color={C.brandSoft} /> : null}
                          <Txt v="small" color={C.dim} style={{ fontSize: 12 }}>{ago(m.ts)}</Txt>
                        </Row>
                        <Txt v="body" lines={2} style={{ fontSize: 14, lineHeight: 19, marginTop: 1 }}>{m.kind === 1 ? 'Posted a clash challenge' : m.text}</Txt>
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
      </ScrollView>

      {/* the one action */}
      {s ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)', '#000']} locations={[0, 0.45, 1]} style={{ position: 'absolute', left: 0, right: 0, top: -24, bottom: 0 }} />
          <View style={[col, { paddingHorizontal: S.gutter, paddingTop: 8, paddingBottom: insets.bottom + 12 }]}>
            {err ? <ErrorLine msg={err} /> : null}
            {isMember
              ? <Btn title="Open squad" h={52} onPress={() => openSquad(s.key)} />
              : <Btn title={busy ? 'Joining…' : me ? 'Join squad' : 'Sign in to join'} h={52} disabled={busy} onPress={join} />}
            {!isMember ? <Txt v="small" style={{ textAlign: 'center', marginTop: 6, fontSize: 12 }}>Free to join · be in as many squads as you like</Txt> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
