// One trade, opened up like an exchange's position page: the side and leverage, the profit and ROI big, the real
// candles over the time it was open with Open and Close pinned on them, every detail (entry, exit or the live price,
// size, margin, liquidation, when it opened and closed, how long it was held, fees), who posted it and what they said,
// and one tap to copy it into Practice. Your own trades close or share from here instead.
// Every trade here is a Practice trade, paper money: a posted one is what its author traded on their device.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tradeMovePct, type TradeTag } from '@/chain/calls';
import {
  VENUES, borrowCost, fmtPrice, isBookVenue, liqPrice, notional, pnlOf, signedPct, signedUsd, usePractice, usePrices,
  type Closed, type Market, type Position,
} from '@/chain/practice';
import { ago, type Post, type Profile } from '@/chain/social';
import { CHART_TF_MS, useTradeCandles } from '@/chain/trade-chart';
import { useCreate } from './create';
import { ProfileAvatar } from './feed';
import { BackBtn, Bone, ErrorLine, LiveDot, Row, STICKERS, Txt } from './kit';
import { useDeskColumn } from './layout';
import { VenueChip } from './orderbook';
import { BarBtn, CARD, CloseSheet, HAIR, MarketLogo, PaperBadge, tradeOf } from './practice-kit';
import { TradeChart } from './trade-chart';
import { C, FONT, S } from './tokens';

export type TradeView = {
  m: Market;
  t: TradeTag;
  /** The viewer's own Practice trade (open or closed): exact fees, and Close / Share instead of Copy. */
  mine?: Position | Closed;
  /** A trade someone posted, and who. */
  post?: Post; author?: Profile;
};

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const when = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const held = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString('en-US', { maximumSignificantDigits: n >= 1000 ? 7 : 5 });
const sticker = (key: string) => STICKERS.find((s) => s.key === key)!.src;
const STICKER_BY = (open: boolean, roi?: number, liq?: boolean) =>
  liq ? 'rekt' : roi === undefined ? null : open ? (roi >= 0 ? 'lfg' : 'fade-me') : roi >= 100 ? 'moon' : roi >= 0 ? 'gg' : 'crying';

export function TradeDetail({ v }: { v: TradeView }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const { m, t, mine, post, author } = v;
  const open = t.exit === undefined;
  const perp = m.kind === 'perp';
  const { prices, error: pxErr } = usePrices(open ? [m.mint] : [], 5000);
  const px = prices[m.mint];
  const now = px?.usdPrice;
  const pr = usePractice();
  const { openCall } = useCreate();
  const [closing, setClosing] = useState<Position | null>(null);
  const [cw, setCw] = useState(0);

  // the profit: your own trade exactly (net of the open fee, borrow or funding and the closing fee); a posted trade at
  // the profit its author's book recorded once closed, else from its prices (before fees)
  const myClosed = mine && 'exit' in mine ? (mine as Closed) : undefined;
  const myOpen = mine && !myClosed ? (mine as Position) : undefined;
  let pnl: number | undefined;
  let net = true;
  if (myClosed) pnl = myClosed.pnl;
  else if (myOpen) pnl = now !== undefined ? pnlOf(myOpen, now) : undefined;
  else if (!open && t.pnl !== undefined) pnl = t.pnl;
  else { const pct = tradeMovePct(t, now); pnl = pct === undefined ? undefined : (t.margin * pct) / 100; net = false; }
  const roi = pnl !== undefined ? (pnl / t.margin) * 100 : undefined;
  const win = pnl === undefined ? undefined : pnl >= 0;
  const pnlCol = pnl === undefined ? C.muted : pnl >= 0 ? C.up : C.down;
  const liquidated = myClosed ? myClosed.reason === 'liquidated' : !!t.liquidated;
  const liq = open && perp && t.lev > 1
    ? myOpen ? liqPrice(myOpen) : liqPrice({ kind: 'perp', side: t.side, lev: t.lev, margin: t.margin, entry: t.entry, borrowPctHr: 0, openedAt: t.openedAt ?? Date.now() })
    : null;
  const size = notional(t);
  const sideText = perp ? `${t.side === 'long' ? 'Long' : 'Short'} ${t.lev}x` : open ? 'Holding' : 'Sold';
  const sideCol = !perp ? C.ink : t.side === 'long' ? C.up : C.down;
  const venue = m.venue ?? 'jupiter';
  const stick = STICKER_BY(open, roi, liquidated);

  const chart = useTradeCandles(m, t.openedAt, t.closedAt);
  const name = author?.name ?? (post ? `${post.author.toBase58().slice(0, 4)}…` : undefined);
  const copyHref = `/practice/${m.id}?copy=${t.side}&lev=${t.lev}&amt=${t.margin}${name && !mine ? `&who=${encodeURIComponent(name)}` : ''}` as Href;
  const share = () => mine && openCall(null, { marketId: m.id, trade: tradeOf(mine) });
  const barH = 54 + 12 + insets.bottom + 10;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: barH + 24 }}>
        {/* the market */}
        <Row style={{ gap: 12 }}>
          <BackBtn onPress={back} />
          <Pressable onPress={() => router.push(`/practice/${m.id}` as Href)} accessibilityRole="button" accessibilityLabel={`Open ${m.symbol}`} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MarketLogo m={m} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="h2" lines={1}>{perp ? m.symbol : m.name}</Txt>
              <Row style={{ gap: 6, marginTop: 2 }}>
                {perp ? <VenueChip venue={venue} small /> : <Txt v="small" lines={1}>{m.symbol} · spot</Txt>}
              </Row>
            </View>
          </Pressable>
          <PaperBadge />
        </Row>

        {/* the result */}
        <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 16 }}>
          <LinearGradient colors={[pnl === undefined ? '#15151B' : pnl >= 0 ? 'rgba(48,209,88,0.16)' : 'rgba(255,69,58,0.15)', '#0E0E12']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
            style={{ borderRadius: 26, padding: 16, overflow: 'hidden' }}>
            <Row style={{ gap: 8 }}>
              <View style={{ backgroundColor: !perp ? C.s2 : t.side === 'long' ? C.upBg : C.downBg, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Txt v="small" color={sideCol} style={{ ...FONT.semi, fontSize: 13 }}>{sideText}</Txt>
              </View>
              <Row style={{ gap: 6, backgroundColor: liquidated ? C.downBg : C.s2, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 3 }}>
                {open ? <LiveDot color={C.up} /> : null}
                <Txt v="small" color={liquidated ? C.down : C.ink} style={{ ...FONT.semi, fontSize: 13 }}>{liquidated ? 'Liquidated' : open ? 'Open' : 'Closed'}</Txt>
              </Row>
            </Row>
            <Txt v="small" style={{ marginTop: 14 }}>{open ? (mine ? 'Profit if you close now' : 'Profit now') : 'Closed profit'}</Txt>
            <Row style={{ gap: 10, alignItems: 'flex-end', marginTop: 2 }}>
              <Txt v="hero" color={pnlCol} lines={1} style={{ fontSize: 42, letterSpacing: -1.5, fontVariant: ['tabular-nums'], flexShrink: 1 }}>{pnl === undefined ? '…' : signedUsd(pnl)}</Txt>
            </Row>
            <Row style={{ gap: 8, marginTop: 4 }}>
              <Txt v="label" color={pnlCol} style={{ fontVariant: ['tabular-nums'] }}>{roi === undefined ? 'waiting for the price' : `${signedPct(roi)} ROI`}</Txt>
              <Txt v="small" style={{ flexShrink: 1 }} lines={1}>· {net ? 'after fees' : 'before fees'}{open ? ' · live' : ''}</Txt>
            </Row>
            {stick ? <Image source={sticker(stick)} style={{ position: 'absolute', right: 10, top: 10, width: 74, height: 74, transform: [{ rotate: '8deg' }] }} contentFit="contain" accessibilityLabel={stick} /> : null}
          </LinearGradient>
        </Animated.View>
        {pxErr && open ? <ErrorLine msg={pxErr} /> : null}

        {/* the chart */}
        <View style={{ backgroundColor: CARD, borderRadius: 24, padding: 12, paddingTop: 14, marginTop: 12 }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 }}>
            <Txt v="label">On the chart</Txt>
            {chart.data ? <Txt v="small" style={{ fontSize: 12 }}>{chart.data.tf} candles · {held((chart.data.to - chart.data.from) + CHART_TF_MS[chart.data.tf])}</Txt> : null}
          </Row>
          <View onLayout={(e) => setCw(Math.floor(e.nativeEvent.layout.width))}>
            {!t.openedAt ? (
              <Empty title="No open time on this trade" body="It was posted before Clashy saved when trades open and close, so there's no window to chart. Newer trades show it." />
            ) : cw === 0 ? <View style={{ height: 250 }} />
              : chart.data && chart.data.candles.length > 1 ? (
                <TradeChart data={chart.data} w={cw} t={{ side: t.side, entry: t.entry, exit: t.exit, openedAt: t.openedAt, closedAt: t.closedAt, now, liq, liquidated, win }} />
              ) : chart.error ? <View style={{ height: 250, justifyContent: 'center' }}><ErrorLine msg={chart.error} onRetry={chart.reload} /></View>
                : chart.data ? <Empty title="No candles for this window" body={`${chart.data.source.split(' · ').slice(-1)[0]} has no trades recorded for the time this trade was open.`} />
                  : <Bone w={'100%'} h={250} r={16} />}
          </View>
          {t.openedAt ? (
            <Row style={{ gap: 14, flexWrap: 'wrap', marginTop: 10, paddingHorizontal: 2 }}>
              <Key color={C.brandSoft} label={`Entry ${fmtPrice(t.entry)}`} />
              {t.exit ? <Key color={liquidated ? C.down : win ? C.up : C.down} label={`${liquidated ? 'Liquidated' : 'Exit'} ${fmtPrice(t.exit)}`} />
                : now !== undefined ? <Key color={C.ink} label={`Now ${fmtPrice(now)}`} /> : null}
              {liq ? <Key color={C.down} label={`Liq. ${fmtPrice(liq)}${myOpen ? '' : ' (about)'}`} dashed /> : null}
            </Row>
          ) : null}
          {chart.data ? <Txt v="small" color={C.dim} style={{ fontSize: 11, marginTop: 6, paddingHorizontal: 2 }} lines={2}>{chart.data.source}</Txt> : null}
        </View>

        {/* the details */}
        <View style={{ backgroundColor: CARD, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 4, marginTop: 12 }}>
          <Item k="Entry price" v={fmtPrice(t.entry)} />
          {t.exit ? <Item k={liquidated ? 'Liquidated at' : 'Exit price'} v={fmtPrice(t.exit)} color={liquidated ? C.down : undefined} />
            : <Item k={isBookVenue(venue) ? 'Mark price' : 'Live price'} v={now !== undefined ? fmtPrice(now) : '…'} />}
          <Item k="Size" v={`${usd(size)} · ${qty(size / t.entry)} ${m.venueSym ?? m.symbol.replace(/-PERP$/, '')}`} />
          <Item k={perp ? 'Margin' : 'Put in'} v={usd(t.margin)} />
          <Item k="Leverage" v={perp ? `${t.lev}x ${t.side}` : 'None (spot)'} color={perp ? sideCol : undefined} />
          {open && perp ? <Item k={myOpen ? 'Liquidation price' : 'Liquidation, about'} v={liq ? fmtPrice(liq) : 'None'} color={liq ? C.down : undefined} /> : null}
          {t.openedAt ? <Item k="Opened" v={when(t.openedAt)} /> : null}
          {t.closedAt ? <Item k="Closed" v={when(t.closedAt)} /> : null}
          {t.openedAt ? <Item k={open ? 'Open for' : 'Held for'} v={held((t.closedAt ?? Date.now()) - t.openedAt)} /> : null}
          {mine ? <Item k="Fees" v={feesOf(mine)} /> : <Item k="Fees" v={net ? 'In the profit (author’s book)' : 'Not included'} />}
          <Item k="Where" v={perp ? VENUES[venue].name : 'Jupiter price, spot'} last />
        </View>

        {/* who posted it */}
        {post ? (
          <Pressable onPress={() => router.push(`/post/${post.seq}` as Href)} accessibilityRole="button" accessibilityLabel="Open the post"
            style={({ pressed }) => ({ backgroundColor: pressed ? '#15151B' : CARD, borderRadius: 24, padding: 14, marginTop: 12 })}>
            <Row style={{ gap: 10 }}>
              <Pressable onPress={() => router.push(`/u/${post.author.toBase58()}` as Href)} accessibilityRole="button" accessibilityLabel={`${name}'s profile`}>
                <ProfileAvatar p={author} size={38} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1}>@{name}</Txt>
                <Txt v="small" lines={1}>Posted {ago(post.ts)} ago · {post.likes} likes · {post.replies} replies</Txt>
              </View>
              <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>
            </Row>
            {post.text ? <Txt v="body" style={{ marginTop: 10, lineHeight: 21 }}>{post.text}</Txt> : null}
          </Pressable>
        ) : null}

        <Txt v="small" style={{ marginTop: 18, lineHeight: 18, textAlign: 'center' }}>
          Practice trade · paper money.{post && !mine ? ' Posted from its author’s Practice book on their device, not checked on chain.' : ''}{myOpen ? '' : ' Copying opens the same side and leverage at today’s price.'}
        </Txt>
      </ScrollView>

      {/* actions */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.94)', borderTopWidth: 1, borderTopColor: HAIR, paddingTop: 12, paddingBottom: insets.bottom + 10, paddingHorizontal: S.gutter }}>
        <View style={[{ flexDirection: 'row', gap: 8 }, col]}>
          {myOpen ? (
            <>
              <BarBtn title="Share" bg={C.brand} fg={C.onBrand} onPress={share} />
              <BarBtn title="Close" bg={C.ink} fg="#000" onPress={() => setClosing(myOpen)} disabled={!pr.ready} />
            </>
          ) : myClosed ? (
            <>
              <BarBtn title="Share" bg={C.brand} fg={C.onBrand} onPress={share} />
              <BarBtn title="Trade again" bg={C.s2} fg={C.ink} onPress={() => router.push(copyHref)} />
            </>
          ) : (
            <>
              <BarBtn title="Copy trade" bg={C.brand} fg={C.onBrand} onPress={() => router.push(copyHref)} />
              <BarBtn title={`Trade ${perp ? m.symbol.replace(/-PERP$/, '') : m.symbol}`} bg={C.s2} fg={C.ink} onPress={() => router.push(`/practice/${m.id}` as Href)} />
            </>
          )}
        </View>
      </View>
      {myOpen ? <CloseSheet p={closing} px={closing ? px : undefined} pr={pr} onClose={() => setClosing(null)} /> : null}
    </View>
  );
}

function feesOf(p: Position | Closed) {
  if (p.kind !== 'perp') return 'None in practice';
  const funding = isBookVenue(p.venue);
  const c = 'exit' in p ? (p as Closed) : undefined;
  const run = c ? c.borrow : borrowCost(p);
  const close = c?.closeFee ?? 0;
  const paid = p.openFee + close + Math.max(0, run);
  return `${usd(paid)}${run < 0 ? ` · ${usd(-run)} funding received` : ''}${funding ? '' : ' incl. borrow'}`;
}

function Item({ k, v, color, last }: { k: string; v: string; color?: string; last?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', gap: 12, minHeight: 46, borderBottomWidth: last ? 0 : 1, borderBottomColor: HAIR }}>
      <Txt v="small" style={{ fontSize: 13.5 }}>{k}</Txt>
      <Txt v="label" color={color} lines={1} style={{ flexShrink: 1, textAlign: 'right', fontSize: 14.5, fontVariant: ['tabular-nums'] }}>{v}</Txt>
    </Row>
  );
}

function Key({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Row style={{ gap: 6 }}>
      <View style={{ width: 14, height: 0, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Txt v="small" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{label}</Txt>
    </Row>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ height: 200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 }}>
      <Txt v="label" style={{ textAlign: 'center' }}>{title}</Txt>
      <Txt v="small" style={{ marginTop: 4, textAlign: 'center', lineHeight: 18 }}>{body}</Txt>
    </View>
  );
}

/** A plain page around a state (loading, not found) with a way back. */
export function TradeShell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ marginBottom: 16, gap: 12 }}><BackBtn onPress={back} /><Txt v="h2" style={{ flex: 1 }}>Trade</Txt><PaperBadge /></Row>
      {children}
    </ScrollView>
  );
}
