// Home: the calls feed. Players post calls on tokenized stocks with their real position attached (shares bought
// through the Stash and what they cost, both on chain, marked to the live price), reply in threads and like once.
// Posts live on the MagicBlock rollup; profiles, positions and prices are read from Solana. Nothing is invented.
import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { BN, COIN_SYMBOLS, P, FEED_BOARD } from '@/chain/client';
import { useFeed, type FeedDuel } from '@/chain/reads';
import { errText, useChain } from '@/chain/useChain';
import { readHoldings, readPortfolio, readStash, useBoard, usePoll, usePrices, useProfiles, type Post } from '@/chain/social';
import { STOCKS } from '@/chain/stocks';
import { ClayLoop } from '@/ui/clay';
import { ProfileAvatar, Thread } from '@/ui/feed';
import { useCreate } from '@/ui/create';
import { TopCallCard } from '@/ui/top-call';
import { PullSearchHint, usePullSearch } from '@/ui/pull-search';
import { Bell, Jar, Plus, Search as SearchI } from '@/ui/icons';
import { Avatar, Btn, Card, ErrorLine, Money, Pending, Row, SkeletonRows, Txt, UnderTabs, Wordmark, ART } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { C, F, FONT, S } from '@/ui/tokens';

type Tab = 'calls' | 'duels';
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

/** A story bubble: one duel live on the rollup right now. */
const Story = ({ d }: { d: FeedDuel }) => (
  <Pressable onPress={() => router.push('/onchain')} style={{ width: 62, alignItems: 'center' }}>
    <View style={{ width: 58, height: 58, borderRadius: 29, padding: 2.5, backgroundColor: C.brand }}>
      <View style={{ flex: 1, borderRadius: 27, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="label" color="#fff" style={{ fontSize: 12 }}>{COIN_SYMBOLS[d.coin] ?? '…'}</Txt>
      </View>
    </View>
    <Txt v="small" color={C.ink} style={{ marginTop: 5, fontSize: 11 }} lines={1}>{d.stake * 2} USDC</Txt>
  </Pressable>
);

function DuelResult({ d, name }: { d: FeedDuel; name: (k: PublicKey) => string }) {
  const tie = d.winner === 3;
  const [w, l] = d.winner === 1 ? [d.creator, d.joiner] : [d.joiner, d.creator];
  const wi = d.winner === 1 ? 0 : 1;
  const koed = !tie && !!(d.ko & (1 << (1 - wi)));
  return (
    <Pressable onPress={() => router.push(`/match/${d.key.toBase58()}` as Href)}><Card style={{ padding: 14, marginBottom: 8 }}>
      <Row style={{ gap: 10 }}>
        <Avatar name={(tie ? d.creator : w).toBase58()} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={2}>{tie ? `${name(d.creator)} and ${name(d.joiner)} drew` : `${name(w)} ${koed ? 'knocked out' : 'beat'} ${name(l)}`} on {COIN_SYMBOLS[d.coin] ?? '?'}</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>{d.entry.toFixed(2)} → {d.exit.toFixed(2)} · {tie ? 'both refunded' : `won ${(d.stake * 2 * 0.97).toFixed(2)} USDC`}</Txt>
        </View>
        {!tie ? <Txt v="label" color={C.up}>{(d.pnlBps[wi] / 100 >= 0 ? '+' : '') + (d.pnlBps[wi] / 100).toFixed(1)}%</Txt> : null}
      </Row>
    </Card></Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const { desk } = useLayout();
  const [tab, setTab] = useState<Tab>('calls');
  const { openCall, openSave, openSearch } = useCreate();
  // pull down past the top and hold: search opens
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const pullSearch = usePullSearch(openSearch, scrollRef);
  const tourScroll = useTourScroll(scrollRef);
  const [liking, setLiking] = useState<number | null>(null);
  const [likeErr, setLikeErr] = useState<string>();
  const chain = useChain();
  const { me, wallet, bal, hasProfile, progs, onEr } = chain;
  const board = useBoard();
  const profiles = useProfiles();
  const prices = usePrices();
  const feed = useFeed();
  const posts = board.status === 'ready' ? board.data : [];
  const profMap = profiles.status === 'ready' ? profiles.data : new Map();
  const myProfile = me ? profMap.get(me.toBase58()) : undefined;

  // every (author, stock) on a call, plus my own positions for the composer
  const pairs = useMemo(() => {
    const seen = new Set<string>();
    const out: { owner: PublicKey; mint: PublicKey }[] = [];
    const add = (owner: PublicKey, mint: PublicKey) => { const k = `${owner.toBase58()}:${mint.toBase58()}`; if (!seen.has(k)) { seen.add(k); out.push({ owner, mint }); } };
    posts.filter((p) => p.kind === 1).forEach((p) => add(p.author, p.refkey));
    if (me) STOCKS.forEach((s) => add(me, new PublicKey(s.mint)));
    return out;
  }, [posts.map((p) => p.seq).join(','), me?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps
  const holdings = usePoll(() => readHoldings(pairs), 6000, [pairs.map((x) => `${x.owner.toBase58()}${x.mint.toBase58()}`).join(',')]);
  const stash = usePoll(() => (me ? readStash(me) : Promise.resolve(null)), 6000, [me?.toBase58()]);
  const holdMap = holdings.status === 'ready' ? holdings.data : new Map();
  const px = prices.status === 'ready' ? prices.data : {};

  // net worth: wallet USDC + Stash + stocks at the live price (all read from chain)
  const portfolio = usePoll(() => (me ? readPortfolio(me) : Promise.resolve([])), 6000, [me?.toBase58()]);
  const stashBal = stash.status === 'ready' && stash.data ? stash.data.balance : 0;
  const pos = portfolio.status === 'ready' ? portfolio.data : [];
  const stockVal = pos.reduce((a, x) => a + x.shares * (px[x.stock.symbol] ?? 0), 0);
  const stockPnl = pos.reduce((a, x) => a + (x.shares > 0 ? x.shares * (px[x.stock.symbol] ?? 0) - x.cost : 0), 0);
  const worth = (bal ?? 0) + stashBal + stockVal;
  // the strongest real positions behind recent calls
  const topCalls = (() => {
    const seen = new Set<string>();
    const rows: { key: string; owner: string; sym: string; pnl: number; cost: number }[] = [];
    for (const p of posts) {
      if (p.kind !== 1) continue;
      const h = holdMap.get(`${p.author.toBase58()}:${p.refkey.toBase58()}`);
      const k = `${p.author.toBase58()}:${p.refkey.toBase58()}`;
      if (!h || h.shares <= 0 || seen.has(k) || !px[h.stock.symbol]) continue;
      seen.add(k);
      rows.push({ key: k, owner: p.author.toBase58(), sym: h.stock.symbol, pnl: h.shares * px[h.stock.symbol] - h.cost, cost: h.cost });
    }
    return rows.sort((a, b) => b.pnl - a.pnl).slice(0, 8);
  })();
  const top = posts.filter((p) => p.replyTo === null || !posts.some((q) => q.seq === p.replyTo));
  const repliesOf = (seq: number) => posts.filter((p) => p.replyTo === seq).sort((a, b) => a.seq - b.seq);
  const nameOf = (k: PublicKey) => profMap.get(k.toBase58())?.name ?? short(k.toBase58());

  const like = async (p: Post) => {
    if (!progs || !me) { wallet.login?.(); return; }
    setLiking(p.seq); setLikeErr(undefined);
    try {
      await onEr('Like', progs.er.methods.like(new BN(p.seq)).accountsPartial({ liker: me, board: P.board(FEED_BOARD) }));
      board.reload();
    } catch (e) { setLikeErr(errText(e)); } finally { setLiking(null); }
  };
  // signed in without a name: finish onboarding first
  useEffect(() => { if (me && hasProfile === false) router.replace('/welcome?step=name' as Href); }, [me?.toBase58(), hasProfile]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = feed.status === 'ready' ? feed.data : null;
  // first run: the guided tour, once onboarding is done (signed out, or signed in with a name)
  const path = usePathname();
  useScreenTour('main', path === '/' && wallet.status !== 'loading' && !(me && hasProfile !== true));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <ScrollView ref={scrollRef} {...pullSearch.scrollProps} onScroll={(e) => { pullSearch.scrollProps.onScroll(e); tourScroll.onScroll(e); }} style={{ flex: 1, backgroundColor: C.bg, transform: [{ translateY: pullSearch.slide }] }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <TourScroll value={tourScroll.scroller}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        {myProfile ? (
          <Pressable onPress={() => router.push('/profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ProfileAvatar p={myProfile} size={38} />
            <View><Txt v="small" style={{ fontSize: 12 }}>gm,</Txt><Txt v="label">@{myProfile.name}</Txt></View>
          </Pressable>
        ) : desk ? <Txt v="title">Home</Txt> : <Wordmark height={24} />}
        {wallet.status === 'out' ? (
          <Row style={{ gap: 8 }}>
            <TourTarget id="home-search">
            <Pressable onPress={() => openSearch()} accessibilityRole="button" accessibilityLabel="Search" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#15151B', alignItems: 'center', justifyContent: 'center' }}>
              <SearchI size={18} color={C.ink} />
            </Pressable>
            </TourTarget>
            <TourTarget id="home-signin"><Btn title="Sign in" h={36} onPress={() => wallet.login?.()} /></TourTarget>
          </Row>
        ) : (
          <Row style={{ gap: 8 }}>
            <TourTarget id="home-search">
            <Pressable onPress={() => openSearch()} accessibilityRole="button" accessibilityLabel="Search" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#15151B', alignItems: 'center', justifyContent: 'center' }}>
              <SearchI size={18} color={C.ink} />
            </Pressable>
            </TourTarget>
            <TourTarget id="home-bell">
            <Pressable onPress={() => router.push('/inbox' as Href)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#15151B', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={18} color={C.ink} />
            </Pressable>
            </TourTarget>
            <TourTarget id="home-add">
            <Pressable onPress={openSave} style={({ pressed }) => ({ height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: C.up, justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Txt v="label" color="#04120A">Add</Txt>
            </Pressable>
            </TourTarget>
          </Row>
        )}
      </Row>

      {me ? (
        // net worth, the way the best trading apps lead: one big number, cents dimmed, what moved it
        <TourTarget id="home-worth" style={{ marginBottom: 16, alignSelf: 'flex-start' }}>
        <Pressable onPress={() => router.push('/portfolio' as Href)}>
          <Txt v="small">Net worth ›</Txt>
          <Money value={worth} size={46} />
          <Row style={{ gap: 8, marginTop: 4 }}>
            <View style={{ backgroundColor: stockPnl >= 0 ? C.upBg : C.downBg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Txt v="small" color={stockPnl >= 0 ? C.up : C.down} style={{ ...FONT.semi }}>{stockPnl >= 0 ? '+' : '−'}${Math.abs(stockPnl).toFixed(2)}</Txt>
            </View>
            <Txt v="small">on your stocks</Txt>
          </Row>
          <Txt v="small" style={{ marginTop: 4 }}>Wallet ${(bal ?? 0).toFixed(2)} · Stash ${stashBal.toFixed(2)} · Stocks ${stockVal.toFixed(2)}</Txt>
        </Pressable>
        </TourTarget>
      ) : null}

      {topCalls.length ? (
        <TourTarget id="home-topcalls" style={{ marginBottom: 14 }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <Txt v="label">Top calls right now</Txt>
            <Pressable onPress={() => router.push('/cup' as Href)}><Txt v="small" color={C.brandSoft}>Weekly Cup ›</Txt></Pressable>
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.gutter }} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 10, alignItems: 'flex-end' }}>
            {topCalls.map((t, i) => <TopCallCard key={t.key} t={t} rank={i + 1} profile={profMap.get(t.owner)} />)}
          </ScrollView>
        </TourTarget>
      ) : null}

      {f && f.live.length ? (
        <TourTarget id="home-live" style={{ marginBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.gutter }} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 10 }}>
          {f.live.map((d) => <Story key={d.key.toBase58()} d={d} />)}
        </ScrollView>
        </TourTarget>
      ) : null}

      {wallet.status === 'out' ? (
        <TourTarget id="home-pitch" style={{ borderRadius: 22, backgroundColor: C.s1, padding: 16, marginBottom: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <ClayLoop name="stocks" size={84} style={{ borderRadius: 16 }} />
          <View style={{ flex: 1 }}>
            <Txt v="h2">Calls with skin in the game</Txt>
            <Txt v="small" style={{ marginTop: 4 }}>Every position here is real: shares of real stocks, bought on chain, at the price they paid.</Txt>
            <Btn title="Sign in to post" h={36} style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => wallet.login?.()} />
          </View>
        </TourTarget>
      ) : null}

      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <TourTarget id="home-tabs"><UnderTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'calls', label: 'Calls' }, { key: 'duels', label: 'Clash results' }]} /></TourTarget>
        {/* post a new call: opens the call drawer */}
        <TourTarget id="home-call">
        <Pressable onPress={() => (myProfile ? openCall(null) : wallet.login?.())} accessibilityRole="button" accessibilityLabel="Post a call" hitSlop={8}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.brand, opacity: pressed ? 0.85 : 1 })}>
          <Plus size={14} color={C.onBrand} />
          <Txt v="small" color={C.onBrand} style={{ ...FONT.semi, fontSize: 13 }}>Call</Txt>
        </Pressable>
        </TourTarget>
      </View>
      {likeErr ? <ErrorLine msg={likeErr} /> : null}

      {tab === 'calls' ? (
        board.status === 'loading' ? <SkeletonRows n={4} /> : board.status === 'error' ? <ErrorLine msg={board.error} onRetry={board.reload} /> : top.length === 0 ? (
          <Pending art={ART.chat} title="No calls yet" body="Post the first call: pick a stock, say why, and back it from your Stash so your position shows." />
        ) : top.map((p, i) => {
          const thread = <Thread key={p.seq} post={p} replies={repliesOf(p.seq)} profiles={profMap} holdings={holdMap} prices={px} me={myProfile}
            onReply={(x) => (myProfile ? openCall(x) : wallet.login?.())} onLike={like} liking={liking} />;
          return i === 0 ? <TourTarget key={p.seq} id="home-feed">{thread}</TourTarget> : thread;
        })
      ) : feed.status === 'loading' ? <SkeletonRows n={3} /> : feed.status === 'error' ? <ErrorLine msg={feed.error} /> : (
        <>
          {f!.settled.length === 0 ? <Pending art={ART.duels} title="No clashes settled yet" body="Clash results show here, live from the Clashy program." action="Start a clash" onAction={() => router.push('/onchain')} />
            : f!.settled.map((d) => <DuelResult key={d.key.toBase58()} d={d} name={nameOf} />)}
        </>
      )}
      </TourScroll>
    </ScrollView>
    <PullSearchHint pull={pullSearch.pull} top={insets.top} />
    </View>
  );
}
