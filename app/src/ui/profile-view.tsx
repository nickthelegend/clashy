// A player's profile: game-profile header (banner, big avatar, badges) over a trader's track record (net worth, a
// real P&L line from settled duels plus open stock P&L) and four tabs (positions, calls, clashes, trophies).
// Every number is read from the Clashy program, the token accounts or the crank's price feeds; nothing is invented.
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share as RNShare, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { PublicKey } from '@solana/web3.js';
import { COIN_SYMBOLS, readPlayer, usdcBalance } from '@/chain/client';
import { duelPnl, duelPnlSince, pnlSeries, readPostsBy, type PnlPoint, type Range } from '@/chain/history';
import { readClans, useLeaderboardOnchain, useMyDuels, type DuelRow } from '@/chain/reads';
import { ago, readPortfolio, readProfile, readStash, usePoll, usePrices, useProfiles, type Post, type Profile } from '@/chain/social';
import { errText, useChain } from '@/chain/useChain';
import { ClayLoop } from './clay';
import { ProfileAvatar, PositionCard, STOCK_ART } from './feed';
import { MarketCallCard } from './market-call';
import { callTarget } from '@/chain/calls';
import { Back, Chat as ChatI, Gear, Heart, Reply, Share, Swords, WalletI } from './icons';
import { useWallet } from '@/chain/wallet';
import { social, useSocialProfile, type FollowState } from '@/chain/social-api';
import { ART, AVATARS, BADGES, Bone, Btn, ChangePill, Chips, ErrorLine, Money, Pending, RANKS, Row, SkeletonRows, Txt, rankFor } from './kit';
import { Sheet } from './sheet';
import { useDeskColumn } from './layout';
import { Scrub, fmtWhen } from './scrub';
import { C, F, FONT, S, fmtUsd } from './tokens';
import { TourScroll, TourTarget, useTourScroll } from '@/tour';

const CARD = '#15151B';
const HAIR = '#23232B';
const GOLD = '#FFC94A';
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtUsd(Math.abs(n))}`;
const tone = (n: number) => (Math.abs(n) < 0.005 ? C.muted : n > 0 ? C.up : C.down);

type Tab = 'positions' | 'calls' | 'clashes' | 'trophies';

export function ProfileView({ owner, isMe, onBack }: { owner: PublicKey; isMe: boolean; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const id = owner.toBase58();
  const [tab, setTab] = useState<Tab>('positions');
  const [range, setRange] = useState<Range>('all');
  const wallet = useWallet();
  const soc = useSocialProfile(id);
  const [toast, setToast] = useState<string>();

  const prof = usePoll(() => readProfile(owner), 10_000, [id]);
  const rec = usePoll(() => readPlayer(owner), 8000, [id]);
  const usdc = usePoll(() => usdcBalance(owner), 8000, [id]);
  const stash = usePoll(() => readStash(owner), 8000, [id]);
  const port = usePoll(() => readPortfolio(owner), 8000, [id]);
  const posts = usePoll(() => readPostsBy(owner), 8000, [id]);
  const clans = usePoll(readClans, 20_000);
  const prices = usePrices();
  const profiles = useProfiles();
  const duels = useMyDuels(owner);
  const board = useLeaderboardOnchain();

  const p = prof.status === 'ready' ? prof.data : null;
  const r = rec.status === 'ready' ? rec.data : null;
  const px: Record<string, number> = prices.status === 'ready' ? prices.data : {};
  const positions = port.status === 'ready' ? port.data.filter((h) => h.shares > 0 || h.wallet > 0) : [];
  const history: DuelRow[] = duels.status === 'ready' ? duels.data : [];
  const pmap = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();

  // net worth: wallet USDC + Stash vault + the stock tokens actually held, at live prices
  const stockValue = positions.reduce((a, h) => a + Math.max(h.wallet, h.shares) * (px[h.stock.symbol] ?? 0), 0);
  const openStockPnl = positions.reduce((a, h) => a + (h.shares > 0 && px[h.stock.symbol] ? h.shares * px[h.stock.symbol] - h.cost : 0), 0);
  const realized = positions.reduce((a, h) => a + h.realized, 0);
  const worthReady = usdc.status === 'ready' && stash.status === 'ready' && port.status === 'ready' && (positions.length === 0 || prices.status === 'ready');
  const stashBal = stash.status === 'ready' && stash.data ? stash.data.balance : 0;
  const worth = (usdc.status === 'ready' ? usdc.data : 0) + stashBal + stockValue;
  const now = Date.now() / 1000;
  const today = duelPnlSince(history, now - 86_400);
  const allTime = history.reduce((a, d) => a + duelPnl(d), 0) + openStockPnl + realized;
  const series = useMemo(() => pnlSeries(history, openStockPnl, range), [history, openStockPnl, range]);
  const delta = series.length ? series[series.length - 1].v - series[0].v : 0;

  const decided = r ? r.wins + r.losses : history.filter((d) => d.won !== null).length;
  const games = Math.max(decided, history.length);
  const wins = r ? r.wins : history.filter((d) => d.won).length;
  const lb = board.status === 'ready' ? board.data : [];
  const place = lb.findIndex((x) => x.owner.equals(owner));
  const top = lb[0]?.owner;
  const clanList = clans.status === 'ready' ? clans.data : [];
  const clan = r ? clanList.find((c) => c.key.equals(r.clan)) : undefined;
  const earned: Record<string, boolean> = {
    top10: place >= 0 && place < 10,
    streak: (r?.bestStreak ?? 0) >= 9,
    500: games >= 500,
    captain: !!clan && clan.captain.equals(owner),
    'first-ko': history.some((d) => d.won && d.koRival),
    'giant-slayer': !!top && history.some((d) => d.won && d.rival.equals(top)),
  };
  const how: Record<string, string> = {
    top10: 'Reach the top 10 on the leaderboard', streak: 'Win 9 clashes in a row', 500: 'Play 500 clashes', captain: 'Captain a squad',
    'first-ko': 'Win a clash by knockout', 'giant-slayer': 'Beat the #1 player',
  };
  const progress: Record<string, string> = {
    top10: place >= 0 ? `#${place + 1} now · reach the top 10` : how.top10,
    streak: `Best run ${r?.bestStreak ?? 0} / 9 wins`,
    500: `${games} / 500 clashes`,
  };
  const trophies = BADGES.filter((b) => earned[b.key]).length;
  const rank = rankFor(r?.rp ?? 0);
  const next = RANKS.find((x) => x.n === rank.n + 1);
  const handle = p ? `@${p.name}` : short(id);

  const share = async () => {
    Haptics.selectionAsync();
    const url = Platform.OS === 'web' && typeof location !== 'undefined' ? `${location.origin}/u/${id}` : undefined;
    const msg = `${handle} on Clashy: ${games} clashes, ${decided ? Math.round((wins / decided) * 100) : 0}% win rate.`;
    try {
      if (Platform.OS === 'web') {
        const nav = globalThis.navigator as Navigator | undefined;
        if (nav?.share) { await nav.share({ title: `${handle} on Clashy`, text: msg, url }); return; }
        if (nav?.clipboard && url) { await nav.clipboard.writeText(url); setToast('Profile link copied'); return; }
        setToast('Sharing is not available in this browser');
        return;
      }
      await RNShare.share({ message: url ? `${msg} ${url}` : msg });
    } catch { /* the person closed the share sheet */ }
  };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(undefined), 2200); return () => clearTimeout(t); }, [toast]);

  const readErr = [prof, rec, usdc, stash, port].find((x) => x.status === 'error') as { error: string } | undefined;
  const ts = useTourScroll<React.ComponentRef<typeof ScrollView>>();

  return (
    <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 40 }}>
      <TourScroll value={ts.scroller}>
      {/* ---------- header ---------- */}
      <View style={{ height: 150, borderRadius: 24, overflow: 'hidden', backgroundColor: CARD }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}><ClayLoop name="journey" width="100%" height={150} cover /></View>
        <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} locations={[0, 0.4, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Row style={{ position: 'absolute', top: 12, left: 12, right: 12, justifyContent: 'space-between' }}>
          {onBack ? <RoundBtn label="Back" onPress={onBack}><Back size={18} color={C.ink} /></RoundBtn> : <View />}
          {isMe ? <TourTarget id="you-settings"><Row style={{ gap: 8 }}><RoundBtn label="Wallet" onPress={() => router.push('/wallet')}><WalletI size={18} color={C.ink} /></RoundBtn><RoundBtn label="Settings" onPress={() => router.push('/settings' as never)}><Gear size={18} color={C.ink} /></RoundBtn></Row></TourTarget>
            : <RoundBtn label="Share profile" onPress={share}><Share size={18} color={C.ink} /></RoundBtn>}
        </Row>
      </View>

      <Row style={{ marginTop: -52, paddingLeft: 10, alignItems: 'flex-end', gap: 10 }}>
        <View>
          <View style={{ padding: 4, borderRadius: 60, backgroundColor: C.bg }}>
            <View style={{ padding: 3, borderRadius: 56, borderWidth: 2.5, borderColor: C.brand }}>
              {prof.status === 'loading' ? <Bone w={96} h={96} r={48} /> : <ProfileAvatar p={p ?? undefined} size={96} />}
            </View>
          </View>
          <Image source={rank.src} style={{ position: 'absolute', right: -2, bottom: 2, width: 38, height: 38 }} contentFit="contain" />
        </View>
        <Row style={{ flex: 1, justifyContent: 'flex-end', gap: 8, paddingBottom: 6 }}>
          {isMe ? (
            <>
              <Pill title="Edit profile" kind="white" onPress={() => router.push('/edit-profile' as never)} disabled={!p} />
              <RoundBtn label="Share profile" onPress={share} size={44}><Share size={18} color={C.ink} /></RoundBtn>
            </>
          ) : (
            <>
              <FollowPill owner={id} soc={soc} />
              <RoundBtn label="Message" onPress={() => (wallet.signer ? router.push(`/dm/${id}` as never) : wallet.login?.())} size={44}><ChatI size={18} color={C.ink} /></RoundBtn>
              <RoundBtn label="Clash" onPress={() => router.push('/clash' as never)} size={44}><Swords size={18} color={C.ink} /></RoundBtn>
            </>
          )}
        </Row>
      </Row>

      <View style={{ marginTop: 12, paddingHorizontal: 4 }}>
        {prof.status === 'loading' ? <Bone w={180} h={28} r={8} /> : (
          <Txt v="title" lines={1} style={{ ...FONT.display, fontSize: 30, letterSpacing: -0.6, lineHeight: 36 }}>{handle}</Txt>
        )}
        <Txt v="small" lines={1} style={{ marginTop: 2 }}>
          {[p ? `Player #${p.number + 1}` : null, clan ? clan.name : null, short(id)].filter(Boolean).join(' · ')}
        </Txt>
        {soc.data?.bio ? <Txt v="body" style={{ marginTop: 8, lineHeight: 21 }}>{soc.data.bio}</Txt> : null}
        {soc.data?.link ? <Txt v="small" color={C.brandSoft} lines={1} style={{ marginTop: 4, ...FONT.semi }} >{soc.data.link.replace(/^https:\/\//, '')}</Txt> : null}
        <Row style={{ gap: 16, marginTop: 8 }}>
          <Txt v="small" color={C.muted}><Txt v="small" color={C.ink} style={{ ...FONT.bold }}>{soc.data ? soc.data.followers.toLocaleString('en-US') : '–'}</Txt> followers</Txt>
          <Txt v="small" color={C.muted}><Txt v="small" color={C.ink} style={{ ...FONT.bold }}>{soc.data ? soc.data.following.toLocaleString('en-US') : '–'}</Txt> following</Txt>
          {soc.data?.you?.followsYou ? <View style={{ backgroundColor: C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 1 }}><Txt v="small" color={C.ink} style={{ fontSize: 11.5 }}>Follows you</Txt></View> : null}
          {soc.data?.private ? <Txt v="small" color={C.dim}>Private</Txt> : null}
        </Row>
        <Row style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <Chip art={ART.streak} text={p && p.dayStreak > 0 ? `${p.dayStreak}-day streak` : 'No streak'} color={p && p.dayStreak > 0 ? '#FF9F45' : C.muted} />
          <Chip art={rank.src} text={rank.label} color={rank.color} />
          {place >= 0 && place < 10 ? <Chip art={ART.crown} text="Top 10" color={GOLD} /> : place >= 0 ? <Chip text={`#${place + 1} on the board`} color={C.brandSoft} /> : null}
        </Row>
        {isMe && prof.status === 'ready' && !p ? (
          <Btn title="Pick your name" style={{ marginTop: 12 }} onPress={() => router.push('/welcome')} />
        ) : null}
        {toast ? <Txt v="small" color={C.brandSoft} style={{ marginTop: 8 }}>{toast}</Txt> : null}
        {readErr ? <ErrorLine msg={readErr.error} /> : null}
      </View>

      {/* ---------- track record ---------- */}
      <View style={{ marginTop: 24 }}>
        <TourTarget id="you-record">
        <Txt v="small" style={{ ...FONT.semi, letterSpacing: 0.2 }}>Net worth</Txt>
        <View style={{ marginTop: 2, minHeight: 56, justifyContent: 'center' }}>
          {worthReady ? <Money value={worth} size={48} /> : <Bone w={190} h={40} r={10} />}
        </View>
        <Row style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: Math.abs(today) < 0.005 ? C.s2 : today > 0 ? C.upBg : C.downBg, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Txt v="label" color={tone(today)} style={{ fontSize: 13 }}>{signed(today)}</Txt>
          </View>
          <Txt v="small">today</Txt>
          <Txt v="small" color={C.dim}>·</Txt>
          <Txt v="small" color={tone(allTime)} style={{ ...FONT.semi }}>{signed(allTime)}</Txt>
          <Txt v="small">all time</Txt>
        </Row>
        <Row style={{ gap: 8, marginTop: 14 }}>
          <Part label="Wallet" value={usdc.status === 'ready' ? usdc.data : null} onPress={isMe ? () => router.push('/wallet') : undefined} />
          <Part label="Stash" value={stash.status === 'ready' ? stashBal : null} onPress={isMe ? () => router.push('/stash' as never) : undefined} />
          <Part label="Stocks" value={port.status === 'ready' && (positions.length === 0 || prices.status === 'ready') ? stockValue : null} onPress={isMe ? () => router.push('/stash' as never) : undefined} />
        </Row>
        </TourTarget>

        <View style={{ marginTop: 16, backgroundColor: CARD, borderRadius: 22, paddingTop: 14, paddingBottom: 10, overflow: 'hidden' }}>
          <Row style={{ paddingHorizontal: 14, justifyContent: 'space-between' }}>
            <Txt v="label">P&amp;L</Txt>
            {series.length ? <Txt v="label" color={tone(delta)}>{signed(delta)} <Txt v="small">{range === 'all' ? 'all time' : `past ${range}`}</Txt></Txt> : null}
          </Row>
          {duels.status === 'loading' || (port.status === 'loading') ? (
            <View style={{ height: 170, padding: 14, justifyContent: 'flex-end' }}><Bone w="100%" h={120} r={12} /></View>
          ) : duels.status === 'error' ? (
            <View style={{ height: 170, padding: 14, justifyContent: 'center' }}><ErrorLine msg={duels.error} /></View>
          ) : series.length ? (
            <PnlChart points={series} h={170} />
          ) : (
            <EmptyChart isMe={isMe} />
          )}
          <Row style={{ paddingHorizontal: 10, marginTop: 6, justifyContent: 'space-between' }}>
            <Chips<Range> value={range} onChange={setRange} items={[{ key: '24h', label: '24h' }, { key: '7d', label: '7d' }, { key: '30d', label: '30d' }, { key: 'all', label: 'All' }]} />
          </Row>
          <Txt v="small" color={C.dim} style={{ paddingHorizontal: 14, fontSize: 11.5 }}>Settled clashes, then open stock P&amp;L at live prices</Txt>
        </View>
      </View>

      {/* ---------- stats ---------- */}
      <Row style={{ gap: 8, marginTop: 14 }}>
        <Stat value={rec.status === 'loading' ? null : String(games)} label="Clashes played" />
        <Stat value={rec.status === 'loading' ? null : decided ? `${Math.round((wins / decided) * 100)}%` : '–'} label="Win rate" />
        <Stat value={prof.status === 'loading' ? null : String(p?.dayStreak ?? 0)} label="Day streak" />
      </Row>
      <Pressable onPress={() => router.push('/leaderboard')} style={({ pressed }) => ({ marginTop: 8, backgroundColor: pressed ? '#1A1A21' : CARD, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
        <Image source={rank.src} style={{ width: 44, height: 44 }} contentFit="contain" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="label" style={{ ...FONT.semi, fontSize: 16 }} color={rank.color}>{rank.label}</Txt>
            <Txt v="small" lines={1}>{next ? `${r?.rp ?? 0} / ${next.pts} RP to ${next.label}` : `${r?.rp ?? 0} RP · top tier`}</Txt>
          </Row>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: C.s2, marginTop: 8, overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: rank.color, width: `${next ? Math.min(100, Math.max(3, (((r?.rp ?? 0) - rank.pts) / (next.pts - rank.pts)) * 100)) : 100}%` }} />
          </View>
        </View>
        <Txt v="small" style={{ ...FONT.semi, fontSize: 18 }}>›</Txt>
      </Pressable>

      {/* ---------- tabs ---------- */}
      <View style={{ flexDirection: 'row', marginTop: 22, borderBottomWidth: 1, borderBottomColor: HAIR }}>
        {([
          ['positions', 'Positions', positions.length],
          ['calls', 'Calls', posts.status === 'ready' ? posts.data.length : 0],
          ['clashes', 'Clashes', history.length],
          ['trophies', 'Trophies', trophies],
        ] as [Tab, string, number][]).map(([k, label, n]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => { Haptics.selectionAsync(); setTab(k); }} style={{ flex: 1, alignItems: 'center', paddingTop: 6, minHeight: 44, justifyContent: 'flex-end' }}>
              <Row style={{ gap: 4, paddingBottom: 9 }}>
                <Txt v="label" color={on ? C.ink : C.dim} style={{ fontSize: 14 }}>{label}</Txt>
                {n ? <Txt v="small" color={on ? C.brandSoft : C.dim} style={{ fontSize: 11, ...FONT.semi }}>{n}</Txt> : null}
              </Row>
              <View style={{ height: 2.5, width: '70%', borderRadius: 2, backgroundColor: on ? C.brand : 'transparent', marginBottom: -1 }} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 12 }}>
        {tab === 'positions' ? (
          port.status === 'loading' ? <SkeletonRows n={3} square /> : port.status === 'error' ? <ErrorLine msg={port.error} /> : positions.length === 0 ? (
            <Pending art={ART.stash} title="No positions yet" body={isMe ? 'Buy a real stock from your Stash, from $5. Your positions show here and on your calls.' : `${handle} has not bought a stock yet.`}
              action={isMe ? 'Open Stash' : undefined} onAction={() => router.push('/stash' as never)} />
          ) : (
            <>
              {positions.map((h) => {
                const price = px[h.stock.symbol];
                const sh = h.shares > 0 ? h.shares : h.wallet;
                const v = price ? sh * price : null;
                const pl = v !== null && h.shares > 0 ? v - h.cost : null;
                return (
                  <Row key={h.stock.symbol} style={{ gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
                      <Image source={STOCK_ART[h.stock.symbol]} style={{ width: 42, height: 42 }} contentFit="contain" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Row style={{ gap: 6 }}><Txt v="label" lines={1} style={{ flexShrink: 1 }}>{h.stock.name}</Txt><Txt v="small" style={{ ...FONT.semi, fontSize: 11 }} color={C.brandSoft}>{h.stock.symbol}</Txt></Row>
                      <Txt v="small" lines={1} style={{ marginTop: 2 }}>{sh.toFixed(4)} sh{h.shares > 0 ? ` · paid ${fmtUsd(h.cost)}` : ' · in wallet'}</Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt v="num">{v === null ? '…' : fmtUsd(v)}</Txt>
                      {pl !== null && h.cost > 0 ? <ChangePill pct={(pl / h.cost) * 100} /> : null}
                    </View>
                  </Row>
                );
              })}
              <Txt v="small" style={{ marginTop: 10 }}>{fmtUsd(stockValue)} at live prices · open P&amp;L <Txt v="small" color={tone(openStockPnl)}>{signed(openStockPnl)}</Txt></Txt>
            </>
          )
        ) : tab === 'calls' ? (
          posts.status === 'loading' ? <SkeletonRows n={2} /> : posts.status === 'error' ? <ErrorLine msg={posts.error} /> : posts.data.length === 0 ? (
            <Pending art={ART.megaphone} title="No calls yet" body={isMe ? 'Post a call on a stock you hold: your real position rides along with it.' : `${handle} has not posted a call yet.`}
              action={isMe ? 'Post a call' : undefined} onAction={() => router.push('/')} />
          ) : posts.data.map((post) => <CallCard key={post.seq} post={post} positions={positions} prices={px} duels={history} owner={owner} />)
        ) : tab === 'clashes' ? (
          duels.status === 'loading' ? <SkeletonRows n={3} /> : duels.status === 'error' ? <ErrorLine msg={duels.error} /> : history.length === 0 ? (
            <Pending art={ART.duels} title="No clashes yet" body={isMe ? 'Open or join a clash. Every settled one lands here with what you won or lost.' : `${handle} has not settled a clash yet.`}
              action={isMe ? 'Start a clash' : undefined} onAction={() => router.push('/clash' as never)} />
          ) : history.map((d) => <ClashRow key={d.key.toBase58()} d={d} rival={pmap.get(d.rival.toBase58())} />)
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
            {BADGES.map((b) => {
              const got = earned[b.key];
              return (
                <View key={b.key} style={{ width: '48.5%', backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: got ? GOLD + '55' : 'transparent', padding: 12, alignItems: 'center', overflow: 'hidden' }}>
                  {got ? <LinearGradient colors={[GOLD + '26', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 110 }} /> : null}
                  <Image source={b.src} style={{ width: 96, height: 96, opacity: got ? 1 : 0.25 }} contentFit="contain" />
                  {!got ? <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: C.s2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Txt v="small" style={{ fontSize: 9.5, ...FONT.bold, letterSpacing: 0.6 }}>Locked</Txt></View> : null}
                  <Txt v="label" style={{ marginTop: 6, ...FONT.semi, fontSize: 15, textAlign: 'center' }} lines={1}>{b.label}</Txt>
                  <View style={{ marginTop: 6, minHeight: 32, justifyContent: 'center' }}>
                    {got ? (
                      <View style={{ backgroundColor: C.upBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Txt v="small" color={C.up} style={{ ...FONT.semi, fontSize: 11.5 }}>Earned</Txt></View>
                    ) : <Txt v="small" style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 15 }}>{progress[b.key] ?? how[b.key]}</Txt>}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      </TourScroll>
    </ScrollView>
  );
}

/* ---------- pieces ---------- */
function RoundBtn({ children, onPress, size = 38, label }: { children: React.ReactNode; onPress: () => void; size?: number; label: string }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: pressed ? '#2A2A33' : 'rgba(28,28,31,0.86)', borderWidth: 1, borderColor: '#2C2C35', alignItems: 'center', justifyContent: 'center' })}>
      {children}
    </Pressable>
  );
}

function Pill({ title, kind, onPress, icon, disabled }: { title: string; kind: 'white' | 'brand'; onPress: () => void; icon?: React.ReactNode; disabled?: boolean }) {
  const bg = kind === 'white' ? C.white : C.brand;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} disabled={disabled} style={({ pressed }) => ({
      height: 44, borderRadius: 22, paddingHorizontal: 20, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: disabled ? 0.4 : 1,
      transform: [{ scale: pressed ? 0.97 : 1 }], ...(kind === 'brand' ? { shadowColor: C.brand, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } } : null),
    })}>
      {icon}
      <Txt v="label" color={kind === 'white' ? '#000' : '#fff'} style={{ fontSize: 15 }} lines={1}>{title}</Txt>
    </Pressable>
  );
}

function Chip({ text, color, art }: { text: string; color: string; art?: number }) {
  return (
    <Row style={{ gap: 4, height: 26, paddingLeft: art ? 4 : 9, paddingRight: 9, borderRadius: 13, backgroundColor: C.s1 }}>
      {art ? <Image source={art} style={{ width: 18, height: 18 }} contentFit="contain" /> : null}
      <Txt v="small" color={color} style={{ ...FONT.semi, fontSize: 12 }}>{text}</Txt>
    </Row>
  );
}

function Part({ label, value, onPress }: { label: string; value: number | null; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flex: 1, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 14, backgroundColor: pressed ? '#1A1A21' : C.s1 })}>
      <Txt v="small" style={{ fontSize: 11.5 }}>{label}</Txt>
      {value === null ? <Bone w={54} h={14} style={{ marginTop: 4 }} /> : <Txt v="num" style={{ marginTop: 2, fontSize: 14.5 }} lines={1}>{fmtUsd(value)}</Txt>}
    </Pressable>
  );
}

function Stat({ value, label }: { value: string | null; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: CARD, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 12 }}>
      {value === null ? <Bone w={40} h={26} r={6} /> : <Txt v="title" style={{ ...FONT.display, fontSize: 28, letterSpacing: -0.5, lineHeight: 32 }} color={value === '–' ? C.dim : C.ink}>{value}</Txt>}
      <Txt v="small" style={{ marginTop: 4, fontSize: 11.5 }} lines={1}>{label}</Txt>
    </View>
  );
}

function EmptyChart({ isMe }: { isMe: boolean }) {
  return (
    <View style={{ height: 170, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
      <Svg width="100%" height={40} style={{ position: 'absolute', top: 90 }}>
        <Line x1="0" x2="100%" y1="20" y2="20" stroke="#2A2A33" strokeWidth={1.5} strokeDasharray="5 6" />
      </Svg>
      <Image source={ART.duels} style={{ width: 70, height: 70 }} contentFit="contain" />
      <Txt v="h2" style={{ marginTop: 4, fontSize: 15 }}>No track record yet</Txt>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 2 }}>{isMe ? 'Settle a clash or buy a stock and your P&L line starts here.' : 'This line starts with their first settled clash.'}</Txt>
    </View>
  );
}

/** Cumulative P&L, time-scaled: straight segments between settlements (no smoothing overshoot), a $0 line, a dot per
 *  settled duel and a pulsing dot on today's value. */
function PnlChart({ points, h }: { points: PnlPoint[]; h: number }) {
  const [w, setW] = useState(0);
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withTiming(2.4, { duration: 1100 }), -1, false); }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 1.4 - pulse.value / 2 }));
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const vals = points.map((p) => p.v);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
  const pad = (hi - lo) * 0.16; lo -= pad; hi += pad;
  const t0 = points[0].ts, t1 = points[points.length - 1].ts;
  const L = 36, RG = 18, T = 14, B = 10;
  const X = (ts: number) => L + ((ts - t0) / Math.max(1, t1 - t0)) * (w - L - RG);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
  const last = points[points.length - 1];
  const col = last.v >= 0 ? C.up : C.down;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const ex = X(last.ts), ey = Y(last.v), zy = Y(0);
  return (
    <View onLayout={onLayout} style={{ height: h, width: '100%' }}>
      {w > 0 ? (
        <>
          <Svg width={w} height={h}>
            <Defs><SvgGradient id="pnlg" x1="0" y1={last.v >= 0 ? '0' : '1'} x2="0" y2={last.v >= 0 ? '1' : '0'}><Stop offset="0" stopColor={col} stopOpacity={0.32} /><Stop offset="1" stopColor={col} stopOpacity={0.02} /></SvgGradient></Defs>
            <Line x1={L - 4} x2={w} y1={zy} y2={zy} stroke="#2E2E38" strokeWidth={1} strokeDasharray="4 5" />
            <Path d={`${d} L${ex},${zy} L${X(points[0].ts)},${zy}Z`} fill="url(#pnlg)" />
            <Path d={d} stroke={col} strokeOpacity={0.22} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} stroke={col} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {points.slice(1, -1).map((p, i) => <Circle key={i} cx={X(p.ts)} cy={Y(p.v)} r={2.6} fill="#0B0B0F" stroke={col} strokeWidth={1.6} />)}
          </Svg>
          <Txt v="small" color={C.dim} style={{ position: 'absolute', left: 12, top: Math.max(0, Math.min(h - 14, zy - 7)), fontSize: 10.5, lineHeight: 14 }}>$0</Txt>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: ex - 6, top: ey - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: col }, ring]} />
          <View pointerEvents="none" style={{ position: 'absolute', left: ex - 5, top: ey - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: col, borderWidth: 2, borderColor: '#000' }} />
          <Scrub w={w} h={h} n={points.length} xAt={(i) => X(points[i].ts)} yAt={(i) => Y(points[i].v)}
            label={(i) => ({ value: `${points[i].v >= 0 ? '+' : '−'}$${Math.abs(points[i].v).toFixed(2)}`, color: points[i].v >= 0 ? C.up : C.down, sub: `P&L · ${fmtWhen(points[i].ts * 1000)}` })} />
        </>
      ) : null}
    </View>
  );
}

function ClashRow({ d, rival }: { d: DuelRow; rival?: Profile }) {
  const pnl = duelPnl(d);
  const res = d.won === null ? 'Dead heat' : d.won ? (d.koRival ? 'Won by KO' : 'Won') : 'Lost';
  const col = d.won === null ? C.muted : d.won ? C.up : C.down;
  return (
    <Pressable onPress={() => router.push(`/u/${d.rival.toBase58()}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line, opacity: pressed ? 0.7 : 1 })}>
      <View>
        <ProfileAvatar p={rival} size={44} />
        <View style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: col, borderWidth: 2.5, borderColor: C.bg }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>vs {rival ? `@${rival.name}` : short(d.rival.toBase58())}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 2 }}><Txt v="small" color={col} style={{ ...FONT.semi }}>{res}</Txt> · {COIN_SYMBOLS[d.coin] ?? '?'} · {ago(d.endTs)} ago</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt v="num" color={col}>{d.won === null ? '±$0.00' : signed(pnl)}</Txt>
        <Txt v="small" style={{ marginTop: 2, fontSize: 11.5 }} color={d.myPnlBps >= 0 ? C.up : C.down}>{d.myPnlBps >= 0 ? '+' : '−'}{Math.abs(d.myPnlBps / 100).toFixed(2)}% call</Txt>
      </View>
    </Pressable>
  );
}

type Pos = Awaited<ReturnType<typeof readPortfolio>>[number];
function CallCard({ post, positions, prices, duels, owner }: { post: Post; positions: Pos[]; prices: Record<string, number>; duels: DuelRow[]; owner: PublicKey }) {
  const pos = post.kind === 1 ? positions.find((x) => x.stock.mint === post.refkey.toBase58()) : undefined;
  const stock = post.kind === 1 ? (pos?.stock ?? undefined) : undefined;
  const duel = post.kind === 2 ? duels.find((d) => d.key.equals(post.refkey)) : undefined;
  const target = callTarget(post);
  const tag = post.replyTo !== null ? { t: 'Reply', c: C.muted } : target ? { t: 'Call', c: C.brandSoft } : post.kind === 2 ? { t: 'Clash', c: C.opp } : { t: 'Post', c: C.muted };
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 14, marginBottom: 10 }}>
      <Row style={{ gap: 8 }}>
        <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: tag.c + '22' }}>
          <Txt v="small" color={tag.c} style={{ ...FONT.bold, fontSize: 10, letterSpacing: 0.6 }}>{tag.t}</Txt>
        </View>
        <Txt v="small">{ago(post.ts)} ago</Txt>
        <View style={{ flex: 1 }} />
        <Row style={{ gap: 4 }}><Reply size={14} color={C.dim} /><Txt v="small" style={{ fontSize: 12 }}>{post.replies}</Txt></Row>
        <Row style={{ gap: 4, marginLeft: 8 }}><Heart size={14} color={C.dim} /><Txt v="small" style={{ fontSize: 12 }}>{post.likes}</Txt></Row>
      </Row>
      <Txt v="body" style={{ marginTop: 8, fontSize: 15, lineHeight: 21 }}>{post.text}</Txt>
      {stock ? (
        <PositionCard stock={stock} price={prices[stock.symbol]}
          holding={pos ? { owner, stock, shares: pos.shares, cost: pos.cost, realized: pos.realized, soldUsdc: 0 } : undefined} />
      ) : null}
      {target?.kind === 'market' ? <MarketCallCard id={target.id} trade={post.trade} seq={post.seq} /> : null}
      {duel ? (
        <Row style={{ marginTop: 10, gap: 12, backgroundColor: '#0D0D10', borderRadius: 14, padding: 12 }}>
          <Image source={ART.tileDuel} style={{ width: 40, height: 40 }} contentFit="contain" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="label" lines={1}>Clash on {COIN_SYMBOLS[duel.coin] ?? '?'}</Txt>
            <Txt v="small" lines={1}>{duel.won === null ? 'Dead heat' : duel.won ? 'Won' : 'Lost'} · settled on Solana</Txt>
          </View>
          <Txt v="label" color={duel.won === null ? C.muted : duel.won ? C.up : C.down}>{duel.won === null ? '±$0.00' : signed(duelPnl(duel))}</Txt>
        </Row>
      ) : null}
    </View>
  );
}

/** Follow / Following / Requested on another player's profile (Clashy's social server). */
function FollowPill({ owner, soc }: { owner: string; soc: ReturnType<typeof useSocialProfile> }) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const state: FollowState = soc.data?.you?.follow ?? 'none';
  const go = async () => {
    if (!wallet.signer) { wallet.login?.(); return; }
    setBusy(true); setErr(undefined);
    try { await social(wallet.signer, `/v1/follow/${owner}`, { method: state === 'none' ? 'POST' : 'DELETE' }); Haptics.selectionAsync(); soc.reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <View>
      <Pill title={busy ? '…' : state === 'accepted' ? 'Following' : state === 'pending' ? 'Requested' : soc.data?.you?.followsYou ? 'Follow back' : 'Follow'}
        kind={state === 'none' ? 'brand' : 'white'} onPress={go} disabled={busy || (!!wallet.signer && !soc.data && !soc.error)} />
      {err || (soc.error && !soc.data) ? <Txt v="small" color={C.down} lines={2} style={{ fontSize: 11, maxWidth: 160, marginTop: 2 }}>{err ?? soc.error}</Txt> : null}
    </View>
  );
}

/** Signed-out or wallet-not-ready state for the Profile tab. */
export function ProfileSignedOut({ onSignIn, error, loading }: { onSignIn?: () => void; error?: string; loading?: boolean }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 40 }}>
      <View style={{ height: 150, borderRadius: 24, overflow: 'hidden' }}>
        <Image source={ART.banner} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 }} contentFit="cover" />
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      </View>
      <View style={{ marginTop: -52, paddingLeft: 10 }}>
        <View style={{ alignSelf: 'flex-start', padding: 4, borderRadius: 60, backgroundColor: C.bg }}>
          <View style={{ width: 106, height: 106, borderRadius: 53, borderWidth: 2.5, borderColor: C.s2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.s1 }}>
            <Image source={ART.emptyProfile} style={{ width: 78, height: 78 }} contentFit="contain" />
          </View>
        </View>
      </View>
      <Txt v="title" style={{ ...FONT.display, fontSize: 30, marginTop: 14, lineHeight: 36 }}>Your track record</Txt>
      <Txt v="body" color={C.muted} style={{ marginTop: 6, lineHeight: 20 }}>
        Sign in to get your Clashy wallet. Every clash you settle, every stock you buy and every call you post builds your profile, on chain.
      </Txt>
      {loading ? <Bone w="100%" h={52} r={16} style={{ marginTop: 18 }} /> : error ? <ErrorLine msg={error} /> : (
        <TourTarget id="you-signin" style={{ marginTop: 18 }}><Btn title="Sign in" onPress={onSignIn} h={52} /></TourTarget>
      )}
      <Row style={{ gap: 8, marginTop: 18 }}>
        {[['Net worth', ART.coinsPile], ['P&L line', ART.tileLine], ['Trophies', ART.winTrophy]].map(([t, a]) => (
          <View key={t as string} style={{ flex: 1, backgroundColor: CARD, borderRadius: 18, padding: 12, alignItems: 'center' }}>
            <Image source={a as number} style={{ width: 56, height: 56 }} contentFit="contain" />
            <Txt v="small" style={{ marginTop: 6, ...FONT.semi }} color={C.ink}>{t as string}</Txt>
          </View>
        ))}
      </Row>
    </ScrollView>
  );
}

