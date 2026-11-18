// A Practice market on an order-book venue (Phoenix or Pacifica): /practice/phoenix-SOL. The venue's live mark price
// and stats (funding, open interest, 24h volume), its own candles, the live L2 book and trade tape, your paper
// positions and resting orders here, and Long / Short. Market orders fill level by level against the real book at its
// real taker fee; limit orders rest post-only and fill at their price when the book trades through it. Paper money.
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errText } from '@/chain/useChain';
import {
  VENUES, fmtPrice, isFresh, levSteps, liqPrice, signedPct, signedUsd, useLiquidations, useOrderFills, usePractice, usePrices,
  type BookVenue, type Market, type Order, type Position, type Practice, type Px, type Quote, type Side,
} from '@/chain/practice';
import { TF_MS, bookFresh, fillUsd, mid, useBookFeed, useCandles, type BookFeed, type Timeframe } from '@/chain/venues';
import { BackBtn, Bone, ErrorLine, LiveDot, Money, Row, SkeletonRows, Txt } from './kit';
import { useDeskColumn } from './layout';
import { Keypad, editAmount, type Key } from './keypad';
import { CandleChart, OrderBookView, TapeView, VenueChip, decimalsFor, fmtP, fmtUsdC } from './orderbook';
import {
  BarBtn, CloseSheet, Head, Line, LiquidatedNotice, MarketLogo, OpenTrade, PaperBadge, SideTag,
} from './practice-kit';
import { Sheet } from './sheet';
import { C, FONT, S } from './tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/practice' as Href));
const usd2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, d = 4) => `${n.toLocaleString('en-US', { maximumFractionDigits: d })}%`;
const CLASS: Record<string, string> = { crypto: 'crypto', equity: 'stock', etf: 'ETF', commodity: 'commodity', fx: 'FX', 'pre-ipo': 'pre-IPO', index: 'index' };
const TFS: Timeframe[] = ['1m', '5m', '1h', '1d'];

/** A segmented control: the track is the card surface, the selected item white with black text (or its own colour:
 *  Long and Short keep green and red, they are the trade buttons). */
function Seg<T extends string>({ value, options, onChange, small }: { value: T; options: { k: T; label: string; color?: string; fg?: string }[]; onChange: (k: T) => void; small?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.k === value;
        return (
          <Pressable key={o.k} onPress={() => { Haptics.selectionAsync(); onChange(o.k); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, height: small ? 36 : 40, borderRadius: 13, backgroundColor: on ? (o.color ?? C.ink) : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="label" color={on ? (o.fg ?? '#000') : C.muted} style={{ fontSize: small ? 13.5 : 14.5 }}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text tabs with a white underline (Order book / Trades), like the kit's UnderTabs. */
function UnderTabs<T extends string>({ value, options, onChange }: { value: T; options: { k: T; label: string }[]; onChange: (k: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 18, marginBottom: 4 }}>
      {options.map((o) => {
        const on = o.k === value;
        return (
          <Pressable key={o.k} onPress={() => { Haptics.selectionAsync(); onChange(o.k); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ height: 40, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: on ? C.ink : 'transparent' }}>
            <Txt v="label" color={on ? C.ink : C.dim} style={{ fontSize: 14.5 }}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatCell({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt v="small" style={{ fontSize: 12 }} lines={1}>{k}</Txt>
      <Txt v="num" color={color} lines={1} style={{ marginTop: 2, fontSize: 14.5 }}>{v}</Txt>
    </View>
  );
}

/** A flat row on black for a resting order or a closed trade here. */
const rowStyle = { gap: 10, paddingVertical: 10 } as const;

export function BookMarketPage({ m }: { m: Market }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const venue = m.venue as BookVenue;
  const sym = m.venueSym!;
  const pr = usePractice();
  const openMints = [...(pr.book?.open.map((p) => p.mint) ?? []), ...(pr.book?.orders?.map((o) => o.mint) ?? [])].join(',');
  const mints = useMemo(() => [m.mint, ...(openMints ? openMints.split(',') : [])], [m.mint, openMints]);
  const { prices, error: pxErr } = usePrices(mints, 4000);
  const px = prices[m.mint];
  const feed = useBookFeed(venue, sym);
  const live = useMemo<Record<string, Quote> | undefined>(() => (feed.book && bookFresh(feed.book) ? { [m.mint]: { bid: feed.book.bids[0][0], ask: feed.book.asks[0][0], t: feed.book.t } } : undefined), [feed.book, m.mint]);
  const liq = useLiquidations(pr, prices);
  const fills = useOrderFills(pr, live);
  const [tf, setTf] = useState<Timeframe>('5m');
  const { candles, error: cErr, reload: cReload } = useCandles(venue, sym, tf);
  const [panel, setPanel] = useState<'book' | 'trades'>('book');
  const [chartW, setChartW] = useState(0);
  const [trade, setTrade] = useState<{ side: Side; limit?: number } | null>(null);
  const [closing, setClosing] = useState<Position | null>(null);
  const [cancelErr, setCancelErr] = useState<string>();

  const mark = px?.usdPrice ?? feed.stats.mark;
  const prev = feed.stats.prevDay;
  const ch = px?.change24h ?? (prev && mark ? (mark / prev - 1) * 100 : undefined);
  const funding = feed.stats.fundingPctHr ?? px?.fundingPctHr;
  const mine = pr.book?.open.filter((p) => p.marketId === m.id) ?? [];
  const orders = pr.book?.orders?.filter((o) => o.marketId === m.id) ?? [];
  const past = pr.book?.closed.filter((c) => c.marketId === m.id).slice(0, 5) ?? [];
  const barH = 50 + 10 + insets.bottom + 10;
  const d = decimalsFor(mark);

  const cancel = async (o: Order) => {
    setCancelErr(undefined);
    try { await pr.cancel(o.id); Haptics.selectionAsync(); } catch (e) { setCancelErr(errText(e)); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: barH + 24 }}>
        <Row style={{ gap: 10 }}>
          <BackBtn onPress={back} />
          <MarketLogo m={m} size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="label" lines={1}>{m.symbol}</Txt>
            <Row style={{ gap: 6, marginTop: 2 }}>
              <VenueChip venue={venue} small />
              <Txt v="small" lines={1} style={{ flexShrink: 1 }}>{m.name}{m.assetClass && CLASS[m.assetClass] ? ` · ${CLASS[m.assetClass]}` : ''}</Txt>
            </Row>
          </View>
          <PaperBadge />
        </Row>

        {/* the mark price: the one big number */}
        <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 20 }}>
          {mark === undefined ? (pxErr ? <Txt v="h2" color={C.muted}>No price yet</Txt> : <Bone w={180} h={36} r={10} />)
            : mark >= 1 ? <Money value={mark} size={34} />
              : <Txt v="num" style={{ fontSize: 34, letterSpacing: -1.2 }} lines={1}>{fmtPrice(mark)}</Txt>}
          <Row style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {ch !== undefined ? <Txt v="small" color={ch >= 0 ? C.up : C.down} style={{ ...FONT.medium, fontVariant: ['tabular-nums'] }}>{signedPct(ch)} 24h</Txt> : null}
            {ch !== undefined ? <Txt v="small" color={C.dim}>·</Txt> : null}
            <LiveDot color={px && isFresh(px) ? C.up : C.dim} />
            <Txt v="small" lines={1} style={{ flexShrink: 1 }}>{px && isFresh(px) ? `Mark price · live from ${VENUES[venue].name}` : px ? 'Mark price is stale' : 'Reading the mark price'}</Txt>
          </Row>
          {pxErr && !(px && isFresh(px)) ? <ErrorLine msg={pxErr} /> : null}
        </Animated.View>

        <Row style={{ marginTop: 16, gap: 10 }}>
          <StatCell k="Funding /hr" v={funding !== undefined ? `${funding >= 0 ? '' : '−'}${pct(Math.abs(funding))}` : '…'} color={funding === undefined ? undefined : funding >= 0 ? C.up : C.down} />
          <StatCell k="Open int." v={feed.stats.oi !== undefined ? fmtUsdC(feed.stats.oi) : '–'} />
          <StatCell k="24h vol." v={feed.stats.vol24h !== undefined ? fmtUsdC(feed.stats.vol24h) : '–'} />
          <StatCell k="Max" v={`${m.maxLev}x`} />
        </Row>

        {/* chart, full width, with Robinhood-style range tabs under it */}
        <View style={{ marginTop: 16 }}>
          <View onLayout={(e) => setChartW(Math.floor(e.nativeEvent.layout.width))} style={{ marginHorizontal: -4 }}>
            {chartW > 0 && candles && candles.length > 1 ? <CandleChart candles={candles} w={chartW} h={220} last={mark} />
              : cErr ? <View style={{ height: 200, justifyContent: 'center', paddingHorizontal: 8 }}><ErrorLine msg={cErr} onRetry={cReload} /></View>
                : candles && candles.length <= 1 ? <View style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">{VENUES[venue].name} has no {tf} candles for {sym} yet</Txt></View>
                  : <View style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}><Bone w={'94%'} h={160} r={18} /></View>}
          </View>
          <Row style={{ gap: 2, marginTop: 6, marginLeft: -8 }}>
            {TFS.map((t) => {
              const on = t === tf;
              return (
                <Pressable key={t} onPress={() => { Haptics.selectionAsync(); setTf(t); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ height: 36, minWidth: 44, paddingHorizontal: 10, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.s2 : 'transparent' }}>
                  <Txt v="small" color={on ? C.ink : C.dim} style={{ ...(on ? FONT.semi : FONT.medium), fontSize: 14 }}>{t}</Txt>
                </Pressable>
              );
            })}
          </Row>
          <Txt v="small" color={C.dim} lines={1} style={{ fontSize: 11.5, marginTop: 2 }}>
            {VENUES[venue].name} candles{candles && candles.length > 1 ? ` · last ${Math.min(60, candles.length)} ${tf} · ${span(Math.min(60, candles.length) * TF_MS[tf])}` : ''}
          </Txt>
        </View>

        {/* book + trades */}
        <View style={{ marginTop: 22 }}>
          <UnderTabs value={panel} onChange={setPanel} options={[{ k: 'book', label: 'Order book' }, { k: 'trades', label: 'Trades' }]} />
          {panel === 'book' ? <OrderBookView feed={feed} base={sym} onPick={(p) => setTrade({ side: mark !== undefined && p > mark ? 'short' : 'long', limit: p })} />
            : <TapeView trades={feed.trades} base={sym} />}
          <Row style={{ gap: 6, paddingTop: 8 }}>
            <LiveDot color={feed.mode === 'stream' ? C.up : feed.mode === 'snapshot' ? C.muted : C.dim} />
            <Txt v="small" color={C.dim} style={{ flex: 1, fontSize: 11.5 }} lines={2}>
              {feed.mode === 'stream' ? `Live stream from ${VENUES[venue].name}` : feed.mode === 'snapshot' ? `The stream is down: a fresh ${VENUES[venue].name} snapshot every 2 s` : 'Connecting'}
              {panel === 'book' ? ' · tap a price for a limit order' : ''}
            </Txt>
          </Row>
          {feed.error ? <ErrorLine msg={feed.error} /> : null}
        </View>

        {liq.last ? <LiquidatedNotice c={liq.last} onDismiss={liq.dismiss} /> : null}
        {fills.last ? (
          <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 12, marginTop: 14 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.up }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" color={C.up}>Limit order filled</Txt>
              <Txt v="small" style={{ marginTop: 2 }}>{fills.last.symbol} {fills.last.side} {fills.last.lev}x at {fmtPrice(fills.last.entry)}, as a maker.</Txt>
            </View>
            <Pressable onPress={fills.dismiss} hitSlop={8} style={{ height: 44, paddingHorizontal: 10, justifyContent: 'center' }}><Txt v="small" color={C.ink}>OK</Txt></Pressable>
          </Animated.View>
        ) : null}

        <Head title="Your positions" right={mine.length ? `${mine.length} open` : undefined} />
        {!pr.book ? <SkeletonRows n={1} square /> : mine.length === 0 ? (
          <Pressable onPress={() => setTrade({ side: 'long' })} accessibilityRole="button" accessibilityLabel={`Open a paper position on ${m.symbol}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
            <MarketLogo m={m} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" lines={1}>No paper position on {m.symbol}</Txt>
              <Txt v="small" lines={1} style={{ marginTop: 1 }}>Up to {m.maxLev}x · fills on {VENUES[venue].name}'s real book</Txt>
            </View>
            <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>
          </Pressable>
        ) : (
          <View style={{ gap: 10 }}>{mine.map((p) => <OpenTrade key={p.id} p={p} px={prices[p.mint]} onClose={() => setClosing(p)} />)}</View>
        )}

        {orders.length ? (
          <>
            <Head title="Open orders" right={`${orders.length} resting`} />
            {orders.map((o) => (
              <Row key={o.id} style={rowStyle}>
                <SideTag p={{ kind: 'perp', side: o.side, lev: o.lev }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="num" lines={1}>Limit {fmtP(o.limit, d)}</Txt>
                  <Txt v="small" lines={1} style={{ marginTop: 1 }}>{usd2(o.margin)} margin · {usd2(o.margin * o.lev)} size</Txt>
                </View>
                <Pressable onPress={() => cancel(o)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Cancel order"
                  style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                  <Txt v="small" color={C.ink} style={{ ...FONT.medium }}>Cancel</Txt>
                </Pressable>
              </Row>
            ))}
            {cancelErr ? <ErrorLine msg={cancelErr} /> : null}
          </>
        ) : null}

        {past.length ? (
          <>
            <Head title="Closed here" />
            {past.map((c) => (
              <Row key={c.id} style={rowStyle}>
                <SideTag p={c} />
                <Txt v="small" lines={1} style={{ flex: 1, fontVariant: ['tabular-nums'] }}>{fmtPrice(c.entry)} → {fmtPrice(c.exit)}{c.reason === 'liquidated' ? ' · liquidated' : ''}</Txt>
                <Txt v="num" color={c.pnl >= 0 ? C.up : C.down}>{signedUsd(c.pnl)}</Txt>
              </Row>
            ))}
          </>
        ) : null}

        <Txt v="small" color={C.dim} style={{ marginTop: 22, fontSize: 12, lineHeight: 16, textAlign: 'center' }}>
          Paper money · {VENUES[venue].name}'s live book, fees and funding · orders never reach {VENUES[venue].name}
        </Txt>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.94)', paddingTop: 10, paddingBottom: insets.bottom + 10, paddingHorizontal: S.gutter }}>
        <View style={[{ flexDirection: 'row', gap: 8 }, col]}>
          <BarBtn title="Long" bg={C.up} fg="#04120A" onPress={() => setTrade({ side: 'long' })} disabled={!pr.ready} />
          <BarBtn title="Short" bg={C.down} fg="#fff" onPress={() => setTrade({ side: 'short' })} disabled={!pr.ready} />
        </View>
      </View>

      <BookOrderSheet open={trade !== null} side={trade?.side ?? 'long'} limit0={trade?.limit} onClose={() => setTrade(null)} m={m} px={px} feed={feed} funding={funding} pr={pr} />
      <CloseSheet p={closing} px={closing ? prices[closing.mint] : undefined} pr={pr} onClose={() => setClosing(null)} feed={feed} />
    </View>
  );
}

const span = (ms: number) => {
  const m = Math.round(ms / 60_000);
  if (m < 120) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 72 ? `${h} hours` : `${Math.round(h / 24)} days`;
};

/* ---------- the order drawer ---------- */
const PRESETS = [100, 500, 1000];
/** What was typed, with thousands separators: "64,636.0". */
const typed = (s: string) => { const [w, f] = s.split('.'); return `${Number(w || '0').toLocaleString('en-US')}${s.includes('.') ? `.${f ?? ''}` : ''}`; };

function BookOrderSheet({ open, onClose, side: side0, limit0, m, px, feed, funding, pr }: {
  open: boolean; onClose: () => void; side: Side; limit0?: number; m: Market; px?: Px; feed: BookFeed; funding?: number; pr: Practice;
}) {
  const venue = m.venue as BookVenue;
  const steps = useMemo(() => levSteps(m.maxLev), [m.maxLev]);
  const [side, setSide] = useState<Side>(side0);
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [lev, setLev] = useState(() => Math.min(10, m.maxLev));
  const [v, setV] = useState('');
  const [lim, setLim] = useState('');
  const [field, setField] = useState<'margin' | 'price'>('margin');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ p?: Position; o?: Order } | null>(null);
  const b = feed.book;
  const d = decimalsFor(b ? mid(b) : px?.usdPrice);
  useEffect(() => {
    if (!open) return;
    setSide(side0); setV(''); setErr(undefined); setDone(null);
    if (limit0) { setType('limit'); setLim(fmtP(limit0, d).replace(/,/g, '')); setField('margin'); } else { setType('market'); setLim(''); setField('margin'); }
  }, [open, side0, limit0]); // eslint-disable-line react-hooks/exhaustive-deps

  const cash = pr.book?.balance ?? 0;
  const amt = Number(v || '0');
  const size = amt * lev;
  const limit = Number(lim || '0');
  const feePct = type === 'market' ? m.takerPct ?? 0 : m.makerPct ?? 0;
  const fee = (size * feePct) / 100;
  const fresh = bookFresh(b);
  const fill = type === 'market' && b && size > 0 ? fillUsd(side === 'long' ? b.asks : b.bids, size) : undefined;
  const m0 = b ? mid(b) : undefined;
  const entry = type === 'market' ? fill?.vwap : limit > 0 ? limit : undefined;
  const slip = fill && m0 ? Math.abs(fill.vwap / m0 - 1) * 100 : undefined;
  const sideFunding = funding !== undefined ? (side === 'long' ? funding : -funding) : undefined;
  const liq = entry && amt > 0 ? liqPrice({ kind: 'perp', side, lev, margin: amt, entry, borrowPctHr: sideFunding ?? 0, openedAt: Date.now() }) : null;
  const max = Math.floor((cash / (1 + (lev * feePct) / 100)) * 100) / 100;
  const bestBid = b?.bids[0]?.[0], bestAsk = b?.asks[0]?.[0];

  const tap = (k: Key) => {
    setErr(undefined);
    if (field === 'price') setLim((x) => editAmount(x, k, Math.max(d, 2), 100_000_000));
    else setV((x) => editAmount(x, k, 2, 1_000_000));
  };
  const go = async () => {
    if (!px || !isFresh(px)) { setErr('Waiting for a fresh mark price. Try again in a few seconds.'); return; }
    if (!fresh || !b) { setErr(`Waiting for ${VENUES[venue].name}'s live order book.`); return; }
    if (sideFunding === undefined) { setErr(`Waiting for ${VENUES[venue].name}'s funding rate.`); return; }
    if (!(amt >= 1)) { setErr('At least $1'); return; }
    if (amt + fee > cash + 1e-9) { setErr(`You have ${usd2(cash)} of paper cash (max ${usd2(max)} at ${lev}x with the fee)`); return; }
    setBusy(true); setErr(undefined);
    try {
      if (type === 'market') {
        const f = fillUsd(side === 'long' ? b.asks : b.bids, size);
        if (!f.complete) throw new Error(`${VENUES[venue].name}'s book only shows ${usd2(f.usd)} on the ${side === 'long' ? 'ask' : 'bid'} side right now. Try a smaller size.`);
        const p = await pr.open(m, { side, lev, margin: amt, price: px, openFeePct: m.takerPct ?? 0, borrowPctHr: sideFunding, fillPrice: f.vwap });
        setDone({ p });
      } else {
        const o = await pr.place(m, { side, lev, margin: amt, limit, fundingPctHr: funding ?? 0, bestBid, bestAsk });
        setDone({ o });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const actColor = side === 'long' ? C.up : C.down;
  const label = !v ? 'Enter a margin' : type === 'limit' && !(limit > 0) ? 'Set a limit price' : busy ? 'Placing…'
    : type === 'market' ? `${side === 'long' ? 'Long' : 'Short'} ${lev}x at market · ${usd2(amt)}` : `Place limit ${side === 'long' ? 'buy' : 'sell'} · ${usd2(amt)}`;
  const box = (k: 'margin' | 'price', title: string, val: string, hint: string) => {
    const on = field === k;
    return (
      <Pressable onPress={() => { Haptics.selectionAsync(); setField(k); }} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ flex: 1, minWidth: 0, borderRadius: 16, backgroundColor: on ? C.s2 : C.card, paddingHorizontal: 12, paddingVertical: 9 }}>
        <Txt v="small" color={on ? C.ink : C.muted} style={{ fontSize: 12 }}>{title}</Txt>
        <Txt v="num" color={val ? C.ink : C.dim} lines={1} style={{ fontSize: 20, letterSpacing: -0.5, marginTop: 1 }}>{val ? `$${typed(val)}` : hint}</Txt>
      </Pressable>
    );
  };

  return (
    <Sheet open={open} onClose={onClose}>
      {done ? (
        <View style={{ alignItems: 'center', paddingVertical: 14 }}>
          <Animated.View entering={ZoomIn.springify().damping(10)} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: actColor, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="title" color={side === 'long' ? '#04120A' : '#fff'} style={{ fontSize: 28 }}>✓</Txt>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(150)} style={{ alignItems: 'center' }}>
            <Txt v="h2" style={{ marginTop: 14 }}>{done.p ? 'Filled on the book' : 'Limit order resting'}</Txt>
            <Txt v="num" style={{ fontSize: 34, letterSpacing: -1.2, marginTop: 4 }}>{usd2((done.p ?? done.o)!.margin)}</Txt>
            <Row style={{ gap: 6, marginTop: 4 }}>
              <SideTag p={{ kind: 'perp', side, lev: (done.p ?? done.o)!.lev }} />
              <Txt v="small">{m.symbol} {done.p ? `at ${fmtPrice(done.p.entry)} avg` : `at ${fmtPrice(done.o!.limit)}`}</Txt>
            </Row>
            {done.p && liqPrice(done.p) !== null ? <Txt v="small" style={{ marginTop: 6 }}>Liquidation near <Txt v="small" color={C.down}>{fmtPrice(liqPrice(done.p)!)}</Txt></Txt> : null}
            <Txt v="small" style={{ marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
              {done.p ? `Priced from ${VENUES[venue].name}'s real book. Paper money; no order was sent.` : 'It fills at your price when the live book trades through it, while Practice is open. Paper money.'}
            </Txt>
          </Animated.View>
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', marginTop: 22 }}>
            <BarBtn title="Done" bg={C.brand} fg={C.onBrand} onPress={onClose} h={52} />
          </View>
        </View>
      ) : (
        <View>
          <Row style={{ gap: 12, marginTop: 2 }}>
            <MarketLogo m={m} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="h2" lines={1}>{side === 'long' ? 'Long' : 'Short'} {m.symbol}</Txt>
              <Txt v="small" lines={1} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>
                {bestBid && bestAsk ? `Bid ${fmtP(bestBid, d)} · Ask ${fmtP(bestAsk, d)}` : 'Reading the book'} · cash {usd2(cash)}
              </Txt>
            </View>
          </Row>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Seg value={side} onChange={(k) => { setSide(k); setErr(undefined); }} options={[{ k: 'long', label: 'Long', color: C.up, fg: '#04120A' }, { k: 'short', label: 'Short', color: C.down, fg: '#fff' }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Seg value={type} onChange={(k) => { setType(k); setErr(undefined); setField(k === 'limit' && !lim ? 'price' : 'margin'); }} options={[{ k: 'market', label: 'Market' }, { k: 'limit', label: 'Limit' }]} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, padding: 3, gap: 3, marginTop: 8 }}>
            {steps.map((x) => {
              const on = lev === x;
              return (
                <Pressable key={x} onPress={() => { Haptics.selectionAsync(); setLev(x); setErr(undefined); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${x}x leverage`}
                  style={({ pressed }) => ({ flex: 1, height: 36, borderRadius: 13, backgroundColor: on ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                  <Txt v="label" color={on ? '#000' : C.ink} style={{ fontSize: 13.5 }}>{x}x</Txt>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {type === 'limit' ? box('price', 'Limit price', lim, 'Tap to set') : null}
            {box('margin', 'Margin', v, '$0')}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {type === 'limit' && field === 'price' ? (
              ([['Best bid', bestBid], ['Mid', m0], ['Best ask', bestAsk]] as [string, number | undefined][]).map(([k, p]) => (
                <Pressable key={k} onPress={() => { if (p) { Haptics.selectionAsync(); setLim(fmtP(p, d).replace(/,/g, '')); setErr(undefined); } }} disabled={!p} hitSlop={4}
                  style={({ pressed }) => ({ flex: 1, height: 36, borderRadius: 18, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', opacity: p ? 1 : 0.4, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                  <Txt v="small" color={C.ink} style={{ ...FONT.medium }}>{k}</Txt>
                </Pressable>
              ))
            ) : (
              <>
                {PRESETS.map((p) => (
                  <Pressable key={p} onPress={() => { Haptics.selectionAsync(); setV(String(p)); setErr(undefined); }} hitSlop={4}
                    style={({ pressed }) => ({ flex: 1, height: 36, borderRadius: 18, backgroundColor: Number(v) === p ? C.ink : C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                    <Txt v="small" color={Number(v) === p ? '#000' : C.ink} style={{ ...FONT.medium }}>${p.toLocaleString('en-US')}</Txt>
                  </Pressable>
                ))}
                <Pressable onPress={() => { Haptics.selectionAsync(); setV(String(Math.max(0, max))); setErr(undefined); }} hitSlop={4}
                  style={({ pressed }) => ({ flex: 1, height: 36, borderRadius: 18, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                  <Txt v="small" color={C.ink} style={{ ...FONT.medium }}>Max</Txt>
                </Pressable>
              </>
            )}
          </View>

          <View style={{ marginTop: 12 }}>
            <Keypad compact onKey={tap} onClear={() => (field === 'price' ? setLim('') : setV(''))} onEnter={() => { if (v && !busy) go(); }} active={open && !done} />
          </View>

          <View style={{ backgroundColor: C.card, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12, gap: 7 }}>
            <Line k="Position size" v={usd2(size)} />
            {type === 'market'
              ? <Line k={`Average fill${slip !== undefined ? ` · ${slip.toFixed(slip < 0.1 ? 3 : 2)}% slippage` : ''}`} v={fill?.vwap ? fmtP(fill.vwap, d) : '–'} color={slip !== undefined && slip > 0.5 ? C.down : undefined} />
              : <Line k="Fills at (post-only)" v={limit > 0 ? fmtP(limit, d) : '–'} />}
            <Line k={`${type === 'market' ? 'Taker' : 'Maker'} fee · ${pct(feePct, 4)}`} v={usd2(fee)} />
            <Line k="Liquidation (approx.)" v={liq !== null ? fmtPrice(liq) : '–'} color={liq !== null ? C.down : undefined} />
            <Txt v="small" color={C.dim} style={{ fontSize: 11.5 }} lines={1}>
              {sideFunding === undefined ? 'Reading the funding rate…' : `Funding: ${sideFunding >= 0 ? 'you pay' : 'you get'} ${pct(Math.abs(sideFunding))}/hr · ${usd2((size * Math.abs(sideFunding)) / 100)}/hr at this size`}
            </Txt>
          </View>
          {fill && !fill.complete ? <ErrorLine msg={`The ${side === 'long' ? 'ask' : 'bid'} side only shows ${usd2(fill.usd)} right now. Try a smaller size.`} /> : null}
          {!fresh ? <ErrorLine msg={feed.error ?? `Waiting for ${VENUES[venue].name}'s live order book.`} /> : null}
          {err ? <ErrorLine msg={err} /> : null}

          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <BarBtn title={label} bg={v && (type === 'market' || limit > 0) ? actColor : C.s2} fg={v && (type === 'market' || limit > 0) ? (side === 'short' ? '#fff' : '#04120A') : C.muted}
              onPress={go} disabled={busy || !v || (type === 'limit' && !(limit > 0))} h={52} />
          </View>
          <Txt v="small" color={C.dim} style={{ textAlign: 'center', marginTop: 8, fontSize: 12 }}>Practice · paper money. Priced from {VENUES[venue].name}'s live book; nothing is sent.</Txt>
        </View>
      )}
    </Sheet>
  );
}
