// A stock page: /stock/<SYM> for one of the five tokenized stocks. The live price from the on-chain feed and a chart
// drawn only from the prices this screen has seen since it opened (there is no stored history, so none is shown);
// your own position from your Holding account; every player who holds it, from their Holding accounts; the calls
// posted on it; and Buy / Sell / Clash in a bar that stays at the bottom. Buying and selling go through the Stash
// exactly as the Stash screen does it.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js';
import { BN, FEED_BOARD, P, USDC, usdcAta } from '@/chain/client';
import { errText, useChain } from '@/chain/useChain';
import {
  holdingKey, isTestAccount, readHoldings, readPortfolio, readStash, useBoard, usePoll, usePrices, useProfiles,
  type Holding, type Post, type Profile,
} from '@/chain/social';
import { SHARE, STOCKS, createStockAtaIx, minSharesFor, minUsdcFor, stockBySymbol, swapAccounts, type Stock } from '@/chain/stocks';
import { AmountSheet } from '@/ui/amount';
import { PostItem, ProfileAvatar, STOCK_ART } from '@/ui/feed';
import { Search as SearchIcon, Swords } from '@/ui/icons';
import { ART, BackBtn, Bone, Btn, ErrorLine, IconBtn, LiveDot, Money, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { PriceChart } from '@/ui/price-chart';
import { useDeskColumn } from '@/ui/layout';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { Sheet } from '@/ui/sheet';
import { C, F, FONT, S, fmtUsd } from '@/ui/tokens';

const CARD = '#111116';
const HAIR = '#1F1F27';
const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
/** Profit and loss to the cent (fmtUsd shows tiny amounts to 4 significant digits, which reads as noise here). */
const signed = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
const pctText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
/** "42s", "3m", "1h 05m": how long this screen has been watching the price. */
/** At 5 s a sample, one hour of live prices. */
const MAX_SAMPLES = 720;

function Head({ title, right }: { title: string; right?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 10 }}>
      <Txt v="h2" lines={1} style={{ flexShrink: 1 }}>{title}</Txt>
      {right ? <Txt v="small">{right}</Txt> : null}
    </Row>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: CARD, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 12 }}>
      <Txt v="small" style={{ fontSize: 11.5 }} lines={1}>{label}</Txt>
      <Txt v="h2" lines={1} style={{ marginTop: 3, fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </View>
  );
}

/** One number in the position card: a small label over a value. */
function Cell({ label, value, color, align = 'left' }: { label: string; value: string; color?: string; align?: 'left' | 'right' }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <Txt v="small" style={{ fontSize: 11.5 }}>{label}</Txt>
      <Txt v="label" color={color} lines={1} style={{ marginTop: 2, fontSize: 16, fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </View>
  );
}

/** A pill in the bottom bar. */
function BarBtn({ title, bg, fg, onPress, icon, disabled }: { title: string; bg: string; fg: string; onPress: () => void; icon?: ReactNode; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flex: 1, height: 54, borderRadius: 27, backgroundColor: bg, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {icon}
      <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 16, color: fg }}>{title}</Text>
    </Pressable>
  );
}

function NotFound({ sym }: { sym: string }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ marginBottom: 14 }}><BackBtn onPress={back} /></Row>
      <Pending art={ART.emptySearch} title={`No stock called ${sym || '…'}`} body="Clashy has five real tokenized stocks. Pick one of them." />
      <View style={{ marginTop: 12, gap: 8 }}>
        {STOCKS.map((st) => (
          <Pressable key={st.symbol} onPress={() => router.replace(`/stock/${st.symbol}` as Href)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: CARD, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Image source={STOCK_ART[st.symbol]} style={{ width: 40, height: 40 }} contentFit="contain" />
            <View style={{ flex: 1 }}><Txt v="label">{st.name}</Txt><Txt v="small">{st.symbol}</Txt></View>
            <Txt v="label" color={C.dim}>›</Txt>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export default function StockRoute() {
  const { sym } = useLocalSearchParams<{ sym: string }>();
  const key = String(sym ?? '').toUpperCase();
  const st = stockBySymbol(key);
  if (!st) return <NotFound sym={key} />;
  return <StockPage key={st.symbol} st={st} />;
}

function StockPage({ st }: { st: Stock }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const chain = useChain();
  const { me, progs, sponsor, bal, onBase, onEr, wallet, hasProfile } = chain;
  const mint = useMemo(() => new PublicKey(st.mint), [st.mint]);

  const prices = usePrices();
  const profiles = useProfiles();
  const board = useBoard();
  const port = usePoll(() => (me ? readPortfolio(me) : Promise.resolve([])), 5000, [me?.toBase58(), chain.tick]);
  const stash = usePoll(() => (me ? readStash(me) : Promise.resolve(null)), 5000, [me?.toBase58(), chain.tick]);

  const profMap = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();
  const myProfile = me ? profMap.get(me.toBase58()) : undefined;
  const px = prices.status === 'ready' ? prices.data : {};
  const price = px[st.symbol] as number | undefined;

  // the chart: only the prices seen while this screen is open, one sample per on-chain read
  const priceData = prices.status === 'ready' ? prices.data : null;
  const [samples, setSamples] = useState<{ t: number; p: number }[]>([]);
  useEffect(() => {
    const p = priceData?.[st.symbol];
    if (!p) return;
    setSamples((s) => [...s, { t: Date.now(), p }].slice(-MAX_SAMPLES));
  }, [priceData, st.symbol]);

  // calls on this stock: top-level posts that carry this stock
  const posts = board.status === 'ready' ? board.data : [];
  const calls = posts.filter((p) => p.kind === 1 && p.refkey.equals(mint));

  // every real player (and every caller) × this stock → their Holding
  const owners = useMemo(() => {
    const seen = new Set<string>();
    const out: PublicKey[] = [];
    const add = (k: PublicKey) => { const s = k.toBase58(); if (!seen.has(s)) { seen.add(s); out.push(k); } };
    profMap.forEach((p) => { if (!isTestAccount(p)) add(p.owner); });
    calls.forEach((p) => add(p.author));
    if (me) add(me);
    return out;
  }, [profiles.status === 'ready' ? [...profMap.keys()].join(',') : '', calls.map((c) => c.author.toBase58()).join(','), me?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps
  const holdings = usePoll(() => readHoldings(owners.map((owner) => ({ owner, mint }))), 6000, [owners.map((o) => o.toBase58()).join(','), chain.tick]);
  const holdMap = holdings.status === 'ready' ? holdings.data : new Map<string, Holding>();
  const holders = [...holdMap.values()]
    .filter((h) => h.shares > 0 && profMap.has(h.owner.toBase58()) && !isTestAccount(profMap.get(h.owner.toBase58())))
    .map((h) => ({ h, value: price ? h.shares * price : 0, pnl: price ? h.shares * price - h.cost : 0 }))
    .sort((a, b) => b.value - a.value || b.h.shares - a.h.shares);
  const heldValue = holders.reduce((a, x) => a + x.value, 0);
  const [allHolders, setAllHolders] = useState(false);

  // your position
  const pos = port.status === 'ready' ? port.data.find((x) => x.stock.symbol === st.symbol) : undefined;
  const held = !!pos && pos.shares > 0;
  const value = held && price ? pos!.shares * price : 0;
  const pnl = held && price ? value - pos!.cost : 0;
  const pnlPct = held && pos!.cost > 0 ? (pnl / pos!.cost) * 100 : 0;
  const s = stash.status === 'ready' ? stash.data : null;

  // actions
  const [buying, setBuying] = useState(false);
  const [selling, setSelling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string>();
  const [liking, setLiking] = useState<number | null>(null);
  const after = () => { chain.refresh(); port.reload(); stash.reload(); holdings.reload(); };
  const needSignIn = () => {
    if (!me) { if (wallet.login) wallet.login(); else setErr('Sign in from Home to trade'); return true; }
    if (hasProfile === false) { router.push('/welcome?step=name' as Href); return true; }
    return false;
  };
  const openBuy = () => { setErr(undefined); if (!needSignIn()) setBuying(true); };

  // the same buy as the Stash: top the Stash up from the wallet if needed, then stash_invest through the Orca pool
  const buyNow = async (usdc: number) => {
    if (!me || !progs || !sponsor) throw new Error('The relay is offline; try again in a minute');
    const raw = Math.round(usdc * USDC);
    const pre = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), createStockAtaIx(sponsor, me, st)];
    const inStash = Math.round((s?.balance ?? 0) * USDC);
    if (inStash < raw) {
      if ((bal ?? 0) * USDC < raw - inStash) throw new Error(`Add ${((raw - inStash) / USDC).toFixed(2)} USDC first`);
      pre.push(await progs.base.methods.stashSave(new BN(raw - inStash), 0).accountsPartial({ owner: me, ownerUsdc: usdcAta(me) }).instruction());
    }
    const min = await minSharesFor(st, raw);
    const sw = await swapAccounts(me, st, true);
    await onBase(`Buy ${usdc} USDC of ${st.symbol}`, () => progs.base.methods.stashInvest(new BN(raw), new BN(min))
      .accountsPartial({ owner: me, payer: sponsor, holding: P.holding(me, mint), sw }).preInstructions(pre).rpc());
  };
  // the same sell-all as the Stash: every share back to USDC, into the Stash
  const sellAll = async () => {
    if (!me || !progs || !sponsor || !pos || busy) return;
    setBusy('sell'); setErr(undefined);
    try {
      const raw = Math.floor(pos.shares * SHARE);
      const min = await minUsdcFor(st, raw);
      const sw = await swapAccounts(me, st, false);
      await onBase(`Sell ${st.symbol}`, () => progs.base.methods.stashSell(new BN(raw), new BN(min))
        .accountsPartial({ owner: me, payer: sponsor, holding: P.holding(me, mint), sw })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })]).rpc());
      after();
      setSelling(false);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const like = async (p: Post) => {
    if (!progs || !me) { wallet.login?.(); return; }
    setLiking(p.seq); setErr(undefined);
    try {
      await onEr('Like', progs.er.methods.like(new BN(p.seq)).accountsPartial({ liker: me, board: P.board(FEED_BOARD) }));
      board.reload();
    } catch (e) { setErr(errText(e)); } finally { setLiking(null); }
  };

  const shownHolders = allHolders ? holders : holders.slice(0, 8);
  const barH = 54 + 12 + insets.bottom + 10;
  const ts = useTourScroll<ComponentRef<typeof ScrollView>>();
  useScreenTour('stock', prices.status !== 'loading' && profiles.status !== 'loading' && holdings.status !== 'loading');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: barH + 24 }}>
        <TourScroll value={ts.scroller}>
        {/* header */}
        <Row style={{ gap: 12 }}>
          <BackBtn onPress={back} />
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={STOCK_ART[st.symbol]} style={{ width: 38, height: 38 }} contentFit="contain" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="h2" lines={1}>{st.name}</Txt>
            <Txt v="small" lines={1}>{st.symbol} · tokenized stock</Txt>
          </View>
          <IconBtn onPress={() => router.push('/search' as Href)} size={44}><SearchIcon size={18} color={C.ink} /></IconBtn>
        </Row>

        {/* price */}
        <TourTarget id="stock-price" style={{ marginTop: 22 }}>
        <Animated.View entering={FadeInDown.duration(320)}>
          {prices.status === 'loading' ? <Bone w={190} h={50} r={12} /> : price ? <Money value={price} size={52} /> : (
            <Txt v="title" color={C.muted}>No price yet</Txt>
          )}
          <Row style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <Row style={{ gap: 6 }}>
              <LiveDot color={C.up} />
              <Txt v="small">Live on-chain price · updates every few seconds</Txt>
            </Row>
          </Row>
          {prices.status === 'error' ? <ErrorLine msg={prices.error} onRetry={prices.reload} /> : null}
        </Animated.View>

        <PriceChart sym={st.symbol} samples={samples} price={price} source="On-chain feed" />
        </TourTarget>

        {/* quick facts, all read live */}
        <Row style={{ gap: 8, marginTop: 14 }}>
          <Stat label="Holders" value={holdings.status === 'ready' && profiles.status === 'ready' ? String(holders.length) : '…'} />
          <Stat label="Held value" value={holdings.status === 'ready' && price ? fmtUsd(heldValue, { compact: true }) : '…'} />
          <Stat label="Calls" value={board.status === 'ready' ? String(calls.length) : '…'} />
        </Row>

        {/* your position */}
        <Head title="Your position" />
        {!me ? (
          <View style={{ backgroundColor: CARD, borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Image source={STOCK_ART[st.symbol]} style={{ width: 56, height: 56 }} contentFit="contain" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label">Sign in to buy {st.symbol}</Txt>
              <Txt v="small" style={{ marginTop: 3, lineHeight: 18 }}>Real tokenized shares from $1, in your own wallet. No fees to pay.</Txt>
            </View>
            <Btn title="Sign in" kind="white" h={44} onPress={() => (wallet.login ? wallet.login() : setErr('Sign in from Home to trade'))} />
          </View>
        ) : port.status === 'loading' ? <SkeletonRows n={1} square /> : port.status === 'error' ? <ErrorLine msg={port.error} onRetry={port.reload} /> : held ? (
          <Animated.View entering={FadeIn.duration(260)} style={{ backgroundColor: CARD, borderRadius: 24, padding: 16 }}>
            <Row style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flexShrink: 1 }}>
                <Txt v="small">Value</Txt>
                {price ? <Money value={value} size={34} /> : <Txt v="title">…</Txt>}
              </View>
              <View style={{ alignItems: 'flex-end', backgroundColor: pnl >= 0 ? C.upBg : C.downBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Txt v="label" color={pnl >= 0 ? C.up : C.down} style={{ fontVariant: ['tabular-nums'] }}>{price ? signed(pnl) : '…'}</Txt>
                <Txt v="small" color={pnl >= 0 ? C.up : C.down} style={{ fontSize: 11.5 }}>{pos!.cost > 0 && price ? pctText(pnlPct) : 'profit'}</Txt>
              </View>
            </Row>
            <View style={{ height: 1, backgroundColor: HAIR, marginVertical: 14 }} />
            <Row style={{ gap: 10 }}>
              <Cell label="Shares" value={pos!.shares.toFixed(4)} />
              <Cell label="You paid" value={fmtUsd(pos!.cost)} />
              <Cell label="Avg. price" value={pos!.shares > 0 ? fmtUsd(pos!.cost / pos!.shares) : '–'} align="right" />
            </Row>
            {pos!.realized !== 0 ? <Txt v="small" style={{ marginTop: 10 }}>Already taken off the table: <Txt v="small" color={pos!.realized >= 0 ? C.up : C.down} style={{ ...FONT.semi }}>{signed(pos!.realized)}</Txt></Txt> : null}
          </Animated.View>
        ) : (
          <Pressable onPress={openBuy} style={({ pressed }) => ({ backgroundColor: '#0E0E12', borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Image source={ART.coinsPile} style={{ width: 56, height: 56 }} contentFit="contain" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label">You don't own {st.symbol} yet</Txt>
              <Txt v="small" style={{ marginTop: 3, lineHeight: 18 }}>
                {pos && pos.realized !== 0 ? `You sold out with ${signed(pos.realized)}. ` : ''}Buy from $1 out of your Stash. Your calls on {st.symbol} will show your position.
              </Txt>
            </View>
            <Txt v="label" color={C.dim}>›</Txt>
          </Pressable>
        )}
        {err ? <ErrorLine msg={err} /> : null}

        {/* who holds it */}
        <Head title="Who holds it" right={holders.length ? `${holders.length} player${holders.length === 1 ? '' : 's'}` : undefined} />
        <TourTarget id="stock-holders">
        {holdings.status === 'loading' || profiles.status === 'loading' ? <SkeletonRows n={3} /> : holdings.status === 'error' ? <ErrorLine msg={holdings.error} onRetry={holdings.reload} /> : profiles.status === 'error' ? <ErrorLine msg={profiles.error} onRetry={profiles.reload} /> : holders.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20, borderRadius: 24, backgroundColor: '#0E0E12' }}>
            <Image source={STOCK_ART[st.symbol]} style={{ width: 72, height: 72 }} contentFit="contain" />
            <Txt v="label" style={{ marginTop: 6 }}>Nobody holds {st.symbol} yet</Txt>
            <Txt v="small" style={{ marginTop: 3, textAlign: 'center', lineHeight: 18 }}>Be the first. Everyone who buys shows up here with what they paid and how it's doing.</Txt>
          </View>
        ) : (
          <View style={{ backgroundColor: CARD, borderRadius: 24, overflow: 'hidden' }}>
            {shownHolders.map(({ h, value: v, pnl: g }, i) => {
              const p = profMap.get(h.owner.toBase58());
              const isMe = !!me && h.owner.equals(me);
              return (
                <Pressable key={h.owner.toBase58()} onPress={() => router.push(`/u/${h.owner.toBase58()}` as Href)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 64, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#18181E', backgroundColor: pressed ? '#17171D' : isMe ? 'rgba(171,159,242,0.10)' : 'transparent' })}>
                  <Txt v="label" color={i === 0 ? '#FFD66B' : C.dim} style={{ width: 24, fontVariant: ['tabular-nums'] }}>{i + 1}</Txt>
                  <ProfileAvatar p={p} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label" lines={1} color={isMe ? C.brandSoft : C.ink}>{isMe ? 'You' : p?.name}</Txt>
                    <Txt v="small" lines={1}>{h.shares.toFixed(4)} {st.symbol} · paid {fmtUsd(h.cost)}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt v="label" style={{ fontVariant: ['tabular-nums'] }}>{price ? fmtUsd(v) : '…'}</Txt>
                    <Txt v="small" color={g >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>{price ? signed(g) : ''}</Txt>
                  </View>
                </Pressable>
              );
            })}
            {holders.length > 8 ? (
              <Pressable onPress={() => setAllHolders((x) => !x)} style={{ height: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#18181E' }}>
                <Txt v="small" color={C.brandSoft} style={{ ...FONT.semi }}>{allHolders ? 'Show fewer' : `Show all ${holders.length}`}</Txt>
              </Pressable>
            ) : null}
          </View>
        )}
        </TourTarget>

        {/* calls */}
        <Head title={`Calls on ${st.symbol}`} right={calls.length ? `${calls.length} call${calls.length === 1 ? '' : 's'}` : undefined} />
        {board.status === 'loading' ? <SkeletonRows n={2} /> : board.status === 'error' ? <ErrorLine msg={board.error} onRetry={board.reload} /> : calls.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20, borderRadius: 24, backgroundColor: '#0E0E12' }}>
            <Image source={ART.megaphone} style={{ width: 72, height: 72 }} contentFit="contain" />
            <Txt v="label" style={{ marginTop: 6 }}>No calls on {st.symbol} yet</Txt>
            <Txt v="small" style={{ marginTop: 3, textAlign: 'center', lineHeight: 18 }}>Post one from Home and attach {st.symbol}. Your real position rides along with it.</Txt>
          </View>
        ) : (
          <View style={{ backgroundColor: CARD, borderRadius: 24, paddingHorizontal: 14 }}>
            {calls.slice(0, 20).map((p, i) => (
              <Pressable key={p.seq} onPress={() => router.push(`/post/${p.seq}` as Href)} style={({ pressed }) => ({ borderTopWidth: i ? 1 : 0, borderTopColor: '#18181E', opacity: pressed ? 0.85 : 1 })}>
                <PostItem post={p} profiles={profMap} holdings={holdMap} prices={px} me={myProfile}
                  onReply={(x) => router.push(`/post/${x.seq}` as Href)} onLike={like} liking={liking} />
              </Pressable>
            ))}
            {calls.length > 20 ? <Txt v="small" style={{ textAlign: 'center', paddingVertical: 12 }}>The 20 newest of {calls.length} calls</Txt> : null}
          </View>
        )}

        <Txt v="small" style={{ marginTop: 22, lineHeight: 18, textAlign: 'center' }}>
          {st.name} as a real tokenized share. Prices, positions and calls are read live from Solana. Clashy pays every fee.
        </Txt>
        </TourScroll>
      </ScrollView>

      {/* the bar that stays at the bottom */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.94)', borderTopWidth: 1, borderTopColor: HAIR, paddingTop: 12, paddingBottom: insets.bottom + 10, paddingHorizontal: S.gutter }}>
        <TourTarget id="stock-bar" style={col}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <BarBtn title={held ? 'Buy more' : `Buy ${st.symbol}`} bg={C.up} fg="#04120A" onPress={openBuy} disabled={!!busy} />
          {held ? <BarBtn title="Sell" bg="#1F1F26" fg={C.ink} onPress={() => { setErr(undefined); setSelling(true); }} disabled={!!busy} /> : null}
          <BarBtn title="Clash" bg={C.opp} fg="#fff" icon={<Swords size={17} color="#fff" />} onPress={() => router.push('/clash' as Href)} />
        </View>
        </TourTarget>
      </View>

      <AmountSheet open={buying} onClose={() => setBuying(false)} title={`Buy ${st.name}`}
        sub={`${st.symbol} at ${price ? fmtUsd(price) : '…'} · from your Stash, topped up from your wallet`}
        art={<Image source={STOCK_ART[st.symbol]} style={{ width: 80, height: 80 }} contentFit="contain" />}
        min={1} max={(s?.balance ?? 0) + (bal ?? 0)} presets={[5, 10, 25]}
        confirm={(n) => `Buy $${n.toFixed(2)} of ${st.symbol}`} success={`You own more ${st.name}`}
        successSub="Real tokenized shares, bought through Orca, now in your own wallet."
        onConfirm={async (n) => { await buyNow(n); after(); }} />

      <Sheet open={selling} onClose={() => setSelling(false)} title={`Sell ${st.name}`}>
        <View style={{ alignItems: 'center' }}>
          <Image source={STOCK_ART[st.symbol]} style={{ width: 80, height: 80 }} contentFit="contain" />
          {price && pos ? <Money value={pos.shares * price} size={40} /> : <Txt v="title">…</Txt>}
          <Txt v="small">{pos ? `${pos.shares.toFixed(4)} ${st.symbol} · paid ${fmtUsd(pos.cost)}` : ''}</Txt>
          {held && price ? <Txt v="small" color={pnl >= 0 ? C.up : C.down} style={{ ...FONT.semi, marginTop: 4 }}>{signed(pnl)} if you sell now</Txt> : null}
        </View>
        {err ? <ErrorLine msg={err} /> : null}
        <Btn title={busy === 'sell' ? 'Selling…' : 'Sell all into the Stash'} kind="white" h={52} style={{ marginTop: 16 }} disabled={!!busy || !held} onPress={sellAll} />
        <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Sold at the pool price. The USDC lands in your Stash.</Txt>
      </Sheet>
    </View>
  );
}
