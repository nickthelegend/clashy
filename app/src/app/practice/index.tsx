// Practice: /practice. Paper trading on real, live markets: tokenized stocks, crypto, Jupiter Perps up to 100x and
// pump.fun memecoins. A $10,000 paper balance on this device (per wallet when signed in), open trades with live P&L
// and liquidation prices, every market with its live Jupiter price, and the history of closed trades. No real USDC
// moves anywhere on this screen.
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  VENUES, ago, fmtPrice, signedUsd, summary, useCatalog, useLiquidations, useOrderFills, usePractice, usePrices,
  type Kind, type Market, type Position, type Px, type Venue,
} from '@/chain/practice';
import { VenueChip } from '@/ui/orderbook';
import { ART, BackBtn, Bone, ErrorLine, LiveDot, Money, Row, SearchBar, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import {
  BarBtn, BotPic, BotTag, CloseSheet, EmptyCard, Head, LiquidatedNotice, MarketLogo, OpenTrade, PaperBadge, SideTag,
} from '@/ui/practice-kit';
import { Sheet } from '@/ui/sheet';
import { C, FONT, S, fmtPct, fmtUsd } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const TABS: { key: Kind; label: string }[] = [
  { key: 'stock', label: 'Stocks' }, { key: 'crypto', label: 'Crypto' }, { key: 'perp', label: 'Perps' }, { key: 'meme', label: 'Memecoins' },
];
const count = (n: number) => n.toLocaleString('en-US');
const usd2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A flat list row on black, the way MarketRow in ui/watchlist.tsx reads. */
const flatRow = (pressed: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 });

/** Stocks / Crypto / Perps / Memecoins: a segmented control on the card surface, the selected item raised. */
function Tabs({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 3, gap: 3 }}>
      {TABS.map((t) => {
        const on = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 38, borderRadius: 11, backgroundColor: on ? C.s2 : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="small" color={on ? C.ink : C.muted} lines={1} style={{ ...(on ? FONT.semi : FONT.medium), fontSize: 13 }}>{t.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One compact stat under the balance: a small label over the value. */
function Mini({ label, value, color, extra }: { label: string; value: string; color?: string; extra?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt v="small" lines={1} style={{ fontSize: 12 }}>{label}</Txt>
      <Txt v="num" color={color} lines={1} style={{ marginTop: 2 }}>
        {value}{extra ? <Txt v="small" color={C.dim} style={{ fontSize: 12 }}>{`  ${extra}`}</Txt> : null}
      </Txt>
    </View>
  );
}

function sub(m: Market) {
  if (m.kind === 'stock') return `${m.ticker ?? `${m.symbol}x`} · tokenized stock`;
  if (m.kind === 'perp') return m.symbol;
  if (m.kind === 'meme') return [m.symbol, m.holders !== undefined ? `${count(m.holders)} holders` : null].filter(Boolean).join(' · ');
  return m.symbol;
}

function MarketRow({ m, px, index }: { m: Market; px?: Px; index: number }) {
  const ch = px?.change24h ?? m.change24h;
  const mcap = m.kind === 'meme' ? (m.circSupply && px ? m.circSupply * px.usdPrice : m.mcap) : undefined;
  const chColor = ch === undefined ? C.dim : ch >= 0 ? C.up : C.down;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 30).duration(300)}>
      <Pressable onPress={() => router.push(`/practice/${m.id}` as Href)} accessibilityRole="button" accessibilityLabel={`Practice ${m.name}`}
        style={({ pressed }) => flatRow(pressed)}>
        <MarketLogo m={m} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1}>{m.name}</Txt>
          {m.kind === 'perp' && m.venue ? (
            <Row style={{ gap: 6, marginTop: 2 }}>
              <VenueChip venue={m.venue} small />
              <Txt v="small" lines={1} style={{ flexShrink: 1 }}>{sub(m)} · up to {m.maxLev}x</Txt>
            </Row>
          ) : <Txt v="small" lines={1} style={{ marginTop: 1 }}>{sub(m)}</Txt>}
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '42%' }}>
          {px ? <Txt v="num" lines={1}>{fmtPrice(px.usdPrice)}</Txt> : <Bone w={64} h={13} />}
          {m.kind === 'meme' && mcap !== undefined ? (
            <Txt v="small" lines={1} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>
              <Txt v="small" color={C.dim}>{fmtUsd(mcap, { compact: true })}</Txt>
              {ch !== undefined ? <Txt v="small" color={chColor}>{`  ${fmtPct(ch)}`}</Txt> : null}
            </Txt>
          ) : ch !== undefined ? <Txt v="small" lines={1} color={chColor} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>{fmtPct(ch)}</Txt> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function HistoryRow({ c }: { c: import('@/chain/practice').Closed }) {
  const liq = c.reason === 'liquidated';
  return (
    <Pressable onPress={() => router.push(`/practice/${c.marketId}` as Href)} accessibilityRole="button" accessibilityLabel={`${c.symbol}, ${signedUsd(c.pnl)}`}
      style={({ pressed }) => flatRow(pressed)}>
      <MarketLogo m={c} size={38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row style={{ gap: 6 }}>
          <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{c.symbol}</Txt>
          <SideTag p={c} />
          {liq ? <Txt v="small" color={C.down} style={{ ...FONT.medium, fontSize: 12 }}>Liquidated</Txt> : null}
        </Row>
        <Txt v="small" lines={1} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>{fmtPrice(c.entry)} → {fmtPrice(c.exit)} · {ago(c.closedAt)}</Txt>
      </View>
      <Txt v="num" color={c.pnl >= 0 ? C.up : C.down}>{signedUsd(c.pnl)}</Txt>
    </Pressable>
  );
}

export default function PracticeHome() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const pr = usePractice();
  const { cat, error: catErr, reload } = useCatalog();
  const [tab, setTab] = useState<Kind>('stock');
  const [q, setQ] = useState('');
  const [closing, setClosing] = useState<Position | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetErr, setResetErr] = useState<string>();
  const [allHistory, setAllHistory] = useState(false);
  const [venue, setVenue] = useState<Venue | 'all'>('all');
  const [cancelErr, setCancelErr] = useState<string>();

  const all = useMemo(() => (cat ? [...cat.stocks, ...cat.crypto, ...cat.perps, ...cat.memes] : []), [cat]);
  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    if (!cat) return [];
    if (query) return all.filter((m) => m.name.toLowerCase().includes(query) || m.symbol.toLowerCase().includes(query) || (m.ticker ?? '').toLowerCase().includes(query) || m.mint === q.trim()).slice(0, 40);
    const perps = venue === 'all' ? cat.perps : cat.perps.filter((m) => m.venue === venue);
    return { stock: cat.stocks, crypto: cat.crypto, perp: perps, meme: cat.memes }[tab].slice(0, 60);
  }, [cat, all, tab, query, q, venue]);
  const perpTotal = cat ? (venue === 'all' ? cat.perps.length : cat.perps.filter((m) => m.venue === venue).length) : 0;

  const openMints = [...(pr.book?.open.map((p) => p.mint) ?? []), ...(pr.book?.orders?.map((o) => o.mint) ?? [])].join(',');
  const mints = useMemo(() => [...list.map((m) => m.mint), ...(openMints ? openMints.split(',') : [])], [list, openMints]);
  const { prices, error: pxErr, at } = usePrices(mints);
  const liq = useLiquidations(pr, prices);
  const fills = useOrderFills(pr);
  const orders = pr.book?.orders ?? [];
  const s = pr.book ? summary(pr.book, prices) : null;
  const closed = pr.book?.closed ?? [];
  const shownHistory = allHistory ? closed : closed.slice(0, 10);

  const doReset = async () => {
    setResetErr(undefined);
    try { await pr.reset(); setResetting(false); } catch (e) { setResetErr((e as Error).message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
        {/* header */}
        <Row style={{ gap: 10 }}>
          <BackBtn onPress={back} />
          <Txt v="title" lines={1} style={{ flex: 1 }}>Practice</Txt>
          <PaperBadge />
        </Row>

        {/* paper balance: the one big number */}
        <Animated.View entering={FadeIn.duration(260)} style={{ marginTop: 16 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Txt v="small">Paper balance</Txt>
              <View style={{ marginTop: 2 }}>{s ? <Money value={s.value} size={40} /> : <Bone w={180} h={40} r={10} style={{ marginTop: 4 }} />}</View>
              {s ? (
                <Txt v="small" style={{ marginTop: 2, fontVariant: ['tabular-nums'] }} lines={1}>
                  {`${usd2(pr.book!.balance)} cash`}
                  {pr.book!.open.length ? ` · ${usd2(s.inTrades)} in trades` : ''}
                  {s.priced ? '' : ' · waiting for prices'}
                </Txt>
              ) : null}
            </View>
            <Pressable onPress={() => { setResetErr(undefined); setResetting(true); }} disabled={!pr.ready} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reset to $10,000"
              style={({ pressed }) => ({ height: 32, paddingHorizontal: 13, borderRadius: 16, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', marginTop: 2, opacity: pr.ready ? 1 : 0.5, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Txt v="small" color={C.ink} style={{ ...FONT.medium }}>Reset</Txt>
            </Pressable>
          </Row>
          <Row style={{ gap: 10, marginTop: 16 }}>
            <Mini label="All time" value={s ? signedUsd(s.allTime) : '…'} color={s ? (s.allTime >= 0 ? C.up : C.down) : undefined} />
            <Mini label="Closed today" value={s ? signedUsd(s.today) : '…'} color={s && s.today !== 0 ? (s.today > 0 ? C.up : C.down) : undefined} />
            <Mini label="Win rate" value={s && s.winRate !== null ? `${Math.round(s.winRate)}%` : '–'} extra={s && s.trades ? `${s.wins} of ${s.trades}` : undefined} />
          </Row>
        </Animated.View>
        <Row style={{ gap: 8, marginTop: 14 }}>
          <LiveDot color={at ? C.up : C.dim} />
          <Txt v="small" color={C.dim} lines={1} style={{ flex: 1, fontSize: 12 }}>Practice · paper money · live prices, no real USDC</Txt>
        </Row>
        {liq.last ? <LiquidatedNotice c={liq.last} onDismiss={liq.dismiss} /> : null}

        {/* the practice clash against the bot */}
        <Pressable onPress={() => router.push('/practice/clash' as Href)} accessibilityRole="button" accessibilityLabel="Practice clash against Clashy Bot"
          style={({ pressed }) => ({ ...flatRow(pressed), marginTop: 14 })}>
          <BotPic size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Row style={{ gap: 6 }}><Txt v="label" lines={1} style={{ flexShrink: 1 }}>Clash Clashy Bot</Txt><BotTag /></Row>
            <Txt v="small" lines={1} style={{ marginTop: 1 }}>
              {(() => {
                const done = (pr.book?.clashes ?? []).filter((c) => c.result === 'won' || c.result === 'lost');
                const won = done.filter((c) => c.result === 'won').length;
                return done.length ? `You ${won}–${done.length - won} vs the bot` : '60-second rounds · live prices';
              })()}
            </Txt>
          </View>
          <View style={{ height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: C.brand, justifyContent: 'center' }}>
            <Txt v="label" color={C.onBrand} style={{ fontSize: 14 }}>{pr.book?.liveClash ? 'Resume' : 'Play'}</Txt>
          </View>
        </Pressable>

        {/* open trades */}
        <Head title="Open trades" right={pr.book?.open.length ? `${pr.book.open.length} open` : undefined} />
        {!pr.book ? <SkeletonRows n={1} square /> : pr.book.open.length === 0 ? (
          <EmptyCard art={ART.coinsPile} title="No open trades" body="Pick a market below: long or short perps up to 100x, or buy stocks, crypto and memecoins." />
        ) : (
          <View style={{ gap: 10, marginTop: 4 }}>
            {pr.book.open.map((p) => (
              <OpenTrade key={p.id} p={p} px={prices[p.mint]} onClose={() => setClosing(p)} onPress={() => router.push(`/practice/${p.marketId}` as Href)} />
            ))}
          </View>
        )}

        {fills.last ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 12, marginTop: 14 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.up }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" color={C.up}>Limit order filled</Txt>
              <Txt v="small" style={{ marginTop: 2 }}>{fills.last.symbol} {fills.last.side} {fills.last.lev}x at {fmtPrice(fills.last.entry)}, as a maker.</Txt>
            </View>
            <Pressable onPress={fills.dismiss} hitSlop={8} style={{ height: 44, paddingHorizontal: 10, justifyContent: 'center' }}><Txt v="small" color={C.ink}>OK</Txt></Pressable>
          </View>
        ) : null}

        {orders.length ? (
          <>
            <Head title="Open orders" right={`${orders.length} resting`} />
            {orders.map((o) => (
              <Pressable key={o.id} onPress={() => router.push(`/practice/${o.marketId}` as Href)} accessibilityRole="button" accessibilityLabel={`${o.symbol} limit order`}
                style={({ pressed }) => flatRow(pressed)}>
                <MarketLogo m={o as unknown as Market} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Row style={{ gap: 6 }}><Txt v="label" lines={1} style={{ flexShrink: 1 }}>{o.symbol}</Txt><SideTag p={{ kind: 'perp', side: o.side, lev: o.lev }} /></Row>
                  <Txt v="small" lines={1} style={{ marginTop: 1 }}>Limit {fmtPrice(o.limit)} · {usd2(o.margin)} margin · {VENUES[o.venue].name}</Txt>
                </View>
                <Pressable onPress={() => { setCancelErr(undefined); pr.cancel(o.id).catch((e) => setCancelErr((e as Error).message)); }} hitSlop={6} accessibilityRole="button" accessibilityLabel="Cancel order"
                  style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                  <Txt v="small" color={C.ink} style={{ ...FONT.medium }}>Cancel</Txt>
                </Pressable>
              </Pressable>
            ))}
            {cancelErr ? <ErrorLine msg={cancelErr} /> : null}
          </>
        ) : null}

        {/* markets */}
        <Head title="Markets" right={!cat ? undefined : query ? `${list.length} across all markets` : 'Live prices'} />
        <View style={{ marginTop: 4 }}>
          <Tabs value={tab} onChange={(k) => { setTab(k); setQ(''); }} />
        </View>
        <View style={{ marginTop: 10 }}>
          <SearchBar value={q} onChange={setQ} placeholder="Search stocks, coins, perps, memecoins" />
        </View>
        {tab === 'perp' && !query && cat ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -S.gutter }} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 6 }}>
            {(['all', 'phoenix', 'pacifica', 'jupiter'] as const).map((v) => {
              const on = venue === v;
              const n = v === 'all' ? cat.perps.length : cat.perps.filter((m) => m.venue === v).length;
              return (
                <Pressable key={v} onPress={() => setVenue(v)} hitSlop={5} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: on ? C.ink : C.s2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Txt v="small" color={on ? '#000' : C.ink} style={{ ...FONT.medium }}>{v === 'all' ? 'All venues' : VENUES[v].name}</Txt>
                  <Txt v="small" color={on ? '#444' : C.muted} style={{ fontVariant: ['tabular-nums'] }}>{n}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {tab === 'perp' && cat && Object.keys(cat.venueErrors).length ? (
          <ErrorLine msg={Object.entries(cat.venueErrors).map(([v, e]) => `${VENUES[v as Venue].name}: ${e}`).join(' ')} onRetry={reload} />
        ) : null}
        {pxErr ? <ErrorLine msg={pxErr} /> : null}
        <View style={{ marginTop: 6 }}>
          {catErr && !cat ? (
            <ErrorLine msg={catErr} onRetry={reload} />
          ) : !cat ? (
            <SkeletonRows n={6} />
          ) : list.length === 0 ? (
            query ? (
              <EmptyCard art={ART.emptySearch} title={`Nothing called "${q.trim()}"`} body="Try a ticker like NVDA, SOL or a memecoin's name. Practice lists the markets live on Jupiter right now." />
            ) : (
              <EmptyCard art={ART.emptySearch} title="No markets here right now" body={tab === 'meme' ? 'No pump.fun launch is trending on Jupiter at the moment. Check back in a minute.' : 'Jupiter returned no markets for this list.'} />
            )
          ) : (
            list.map((m, i) => <MarketRow key={m.id} m={m} px={prices[m.mint]} index={i} />)
          )}
        </View>
        {cat && !query && tab === 'meme' ? <Txt v="small" color={C.dim} style={{ marginTop: 6, fontSize: 12, lineHeight: 16 }}>pump.fun launches trending on Jupiter in the last hour and day · spot only, no leverage · memecoins can go to zero</Txt> : null}
        {cat && !query && tab === 'perp' ? (
          <Txt v="small" color={C.dim} style={{ marginTop: 6, fontSize: 12, lineHeight: 16 }}>
            {perpTotal > list.length ? `Showing ${list.length} of ${perpTotal}; search to find any of them. ` : ''}
            Phoenix and Pacifica are order books: paper orders fill against their real, live book at their real fees and funding. Jupiter Perps is an oracle-priced pool, up to 100x.
          </Txt>
        ) : null}

        {/* history */}
        <Head title="History" right={closed.length ? `${closed.length} closed` : undefined} />
        {!pr.book ? <SkeletonRows n={2} /> : closed.length === 0 ? (
          <EmptyCard art={ART.emptyLeaderboard} title="No closed trades yet" body="Every trade you close lands here with its profit or loss, and counts towards your win rate." />
        ) : (
          <View>
            {shownHistory.map((c) => <HistoryRow key={c.id} c={c} />)}
            {closed.length > 10 ? (
              <Pressable onPress={() => setAllHistory((x) => !x)} accessibilityRole="button" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="small" color={C.brandSoft} style={{ ...FONT.medium }}>{allHistory ? 'Show fewer' : `Show all ${closed.length}`}</Txt>
              </Pressable>
            ) : null}
          </View>
        )}

        <Txt v="small" color={C.dim} style={{ marginTop: 22, fontSize: 12, lineHeight: 16, textAlign: 'center' }}>
          Prices come live from Jupiter, Phoenix and Pacifica. Order-book perps fill against the venue's real book at its taker or maker fee and pay or earn its funding; Jupiter perps use Jupiter's open fee and hourly borrow (both approximated by the hour).
          Liquidations are checked only while Practice is open, against the live price. Your paper book is saved on this device{pr.signedIn ? ' for this wallet' : ''}.
        </Txt>
      </ScrollView>

      <CloseSheet p={closing} px={closing ? prices[closing.mint] : undefined} pr={pr} onClose={() => setClosing(null)} />

      <Sheet open={resetting} onClose={() => setResetting(false)}>
        <View style={{ alignItems: 'center', paddingTop: 4 }}>
          <Txt v="h2" style={{ textAlign: 'center' }}>Reset to $10,000?</Txt>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
            Every open paper trade and your history are wiped, and the balance goes back to $10,000. Paper money only; nothing real changes.
          </Txt>
        </View>
        {resetErr ? <ErrorLine msg={resetErr} /> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          <BarBtn title="Keep my trades" bg={C.s2} fg={C.ink} onPress={() => setResetting(false)} />
          <BarBtn title="Reset" bg={C.brand} fg={C.onBrand} onPress={doReset} />
        </View>
      </Sheet>
    </View>
  );
}
