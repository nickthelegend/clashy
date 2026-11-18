// A practice market: /practice/<mint> (or /practice/SOL-PERP). The live Jupiter price and a chart drawn only from the
// prices this page has seen since it opened; the market's real facts (perps: Jupiter Perps' borrow rates, open fee,
// liquidity and utilization; memecoins: market cap, liquidity, holders, age); your open paper trades on it; and a
// bottom bar (Long / Short for perps, Buy for spot) that opens the trade drawer. Paper money only.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errText } from '@/chain/useChain';
import {
  LEVERAGE, ago, fmtPrice, isBookVenue, isFresh, liqPrice, resolveMarket, signedPct, signedUsd, useLiquidations, usePoolInfo,
  usePractice, usePrices, type Market, type PoolInfo, type Position, type Practice, type Px, type Side,
} from '@/chain/practice';
import { BookMarketPage } from '@/ui/book-market';
import { Keypad, editAmount, type Key } from '@/ui/keypad';
import { ART, BackBtn, Bone, ErrorLine, LiveDot, Money, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { PriceChart } from '@/ui/price-chart';
import {
  BarBtn, CARD, CloseSheet, HAIR, Head, Line, LiquidatedNotice, MarketLogo, OpenTrade, PaperBadge, ShareTrade, SideTag, Stat, copyArgs, myTradeHref, CopyNote, type CopyArgs,
} from '@/ui/practice-kit';
import { Sheet } from '@/ui/sheet';
import { C, S, fmtUsd } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/practice' as Href));
/** At 4 s a sample, a little under an hour of live prices. */
const MAX_SAMPLES = 800;
const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
const KIND_SUB: Record<Market['kind'], string> = { stock: 'tokenized stock', crypto: 'crypto · spot', perp: 'Jupiter perp', meme: 'pump.fun memecoin' };
const usd2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctRate = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;

function Shell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ marginBottom: 14, gap: 12 }}><BackBtn onPress={back} /><Txt v="h2" style={{ flex: 1 }}>Practice</Txt><PaperBadge /></Row>
      {children}
    </ScrollView>
  );
}

export default function PracticeMarketRoute() {
  const q = useLocalSearchParams<{ market: string; copy?: string; lev?: string; amt?: string; who?: string }>();
  const id = String(q.market ?? '');
  const copy = useMemo(() => copyArgs(q), [q.copy, q.lev, q.amt, q.who]); // eslint-disable-line react-hooks/exhaustive-deps
  const [m, setM] = useState<Market | null | undefined>(undefined);
  const [err, setErr] = useState<string>();
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setErr(undefined);
    resolveMarket(id).then((x) => alive && setM(x)).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [id, n]);
  if (err && !m) return <Shell><View style={{ backgroundColor: CARD, borderRadius: 24, padding: 14 }}><ErrorLine msg={`${err} This market couldn't load.`} onRetry={() => setN((x) => x + 1)} /></View></Shell>;
  if (m === undefined) return <Shell><Row style={{ gap: 12 }}><Bone w={44} h={44} r={22} /><View style={{ gap: 8 }}><Bone w={140} h={14} /><Bone w={90} h={11} /></View></Row><Bone w={200} h={50} r={12} style={{ marginTop: 22 }} /><Bone w={'100%'} h={220} r={22} style={{ marginTop: 14 }} /></Shell>;
  if (m === null) {
    return (
      <Shell>
        <Pending art={ART.emptySearch} title="No market here" body={`Practice couldn't find "${id}" on Jupiter, Phoenix or Pacifica. Pick a stock, coin, perp or memecoin from the Practice list.`}
          action="See all markets" onAction={() => router.replace('/practice' as Href)} />
      </Shell>
    );
  }
  return isBookVenue(m.venue) ? <BookMarketPage key={m.id} m={m} copy={copy} /> : <MarketPage key={m.id} m={m} copy={copy} />;
}

function MarketPage({ m, copy }: { m: Market; copy?: CopyArgs }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const pr = usePractice();
  const perp = m.kind === 'perp';
  const openMints = pr.book?.open.map((p) => p.mint).join(',') ?? '';
  const mints = useMemo(() => [m.mint, ...(openMints ? openMints.split(',') : [])], [m.mint, openMints]);
  const { prices, error: pxErr } = usePrices(mints);
  const liq = useLiquidations(pr, prices);
  const pool = usePoolInfo(perp ? m.mint : undefined);
  const px = prices[m.mint];
  const price = px?.usdPrice;

  // the chart: only the prices seen while this page is open
  const [samples, setSamples] = useState<{ t: number; p: number }[]>([]);
  useEffect(() => {
    if (!px) return;
    setSamples((s) => (s.length && s[s.length - 1].t === px.t ? s : [...s, { t: px.t, p: px.usdPrice }].slice(-MAX_SAMPLES)));
  }, [px]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  const ch = px?.change24h ?? m.change24h;

  const mine = pr.book?.open.filter((p) => p.marketId === m.id) ?? [];
  const past = pr.book?.closed.filter((c) => c.marketId === m.id).slice(0, 5) ?? [];
  // a copied trade opens the drawer straight away, with its side, leverage and amount
  const [trade, setTrade] = useState<Side | null>(copy ? (m.kind === 'perp' ? copy.side : 'long') : null);
  const [preset, setPreset] = useState<CopyArgs | undefined>(copy);
  const [closing, setClosing] = useState<Position | null>(null);
  const barH = 54 + 12 + insets.bottom + 10;
  const mcap = m.circSupply && price ? m.circSupply * price : m.mcap;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: barH + 24 }}>
        {/* header */}
        <Row style={{ gap: 12 }}>
          <BackBtn onPress={back} />
          <MarketLogo m={m} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="h2" lines={1}>{m.name}</Txt>
            <Txt v="small" lines={1}>{m.kind === 'stock' ? (m.ticker ?? m.symbol) : m.symbol} · {KIND_SUB[m.kind]}</Txt>
          </View>
          <PaperBadge />
        </Row>

        {/* price */}
        <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 22 }}>
          {price === undefined ? (pxErr ? <Txt v="title" color={C.muted}>No price yet</Txt> : <Bone w={190} h={50} r={12} />)
            : price >= 1 ? <Money value={price} size={52} />
              : <Txt v="hero" style={{ fontSize: 44, fontVariant: ['tabular-nums'] }} lines={1}>{fmtPrice(price)}</Txt>}
          <Row style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {ch !== undefined ? (
              <View style={{ backgroundColor: ch >= 0 ? C.upBg : C.downBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Txt v="small" color={ch >= 0 ? C.up : C.down} style={{ fontVariant: ['tabular-nums'] }}>{signedPct(ch)} 24h</Txt>
              </View>
            ) : null}
            <Row style={{ gap: 6 }}>
              <LiveDot color={px && isFresh(px) ? C.up : C.dim} />
              <Txt v="small">{px ? (isFresh(px) ? 'Live Jupiter price' : `Last price ${span(now - px.t)} ago`) : 'Reading the live price'}</Txt>
            </Row>
          </Row>
          {pxErr ? <ErrorLine msg={pxErr} /> : null}
        </Animated.View>

        <PriceChart sym={m.kind === 'stock' ? (m.ticker ?? m.symbol) : m.symbol} samples={samples} price={price} minSpan={perp || m.kind === 'crypto' ? 0.0006 : 0.001} source="Jupiter price" />
        {liq.last ? <LiquidatedNotice c={liq.last} onDismiss={liq.dismiss} /> : null}

        {/* facts */}
        <Head title={perp ? 'Jupiter Perps pool' : 'Market facts'} right={perp && pool.info ? 'Live from Jupiter' : undefined} />
        {perp ? <PerpFacts info={pool.info} error={pool.error} onRetry={pool.reload} /> : (
          <View style={{ gap: 8 }}>
            <Row style={{ gap: 8 }}>
              <Stat label="Market cap" value={mcap !== undefined ? fmtUsd(mcap, { compact: true }) : '–'} />
              <Stat label="Liquidity" value={(px?.liquidity ?? m.liquidity) !== undefined ? fmtUsd((px?.liquidity ?? m.liquidity)!, { compact: true }) : '–'} />
            </Row>
            <Row style={{ gap: 8 }}>
              <Stat label="Holders" value={m.holders !== undefined ? m.holders.toLocaleString('en-US') : '–'} />
              {m.kind === 'meme' ? <Stat label="Created" value={ago(m.createdAt)} sub={m.organic ? `Organic score: ${m.organic}` : undefined} />
                : <Stat label="Trading" value="Spot · 1x" sub="No leverage, long only" />}
            </Row>
            {m.kind === 'meme' ? <Txt v="small" style={{ lineHeight: 17, marginTop: 2 }}>A pump.fun launch. Spot only, no leverage. Memecoins can lose most of their value in minutes.</Txt> : null}
          </View>
        )}

        {/* your trades */}
        <Head title="Your paper trades" right={mine.length ? `${mine.length} open` : undefined} />
        {!pr.book ? <SkeletonRows n={1} square /> : mine.length === 0 ? (
          <Pressable onPress={() => setTrade('long')} accessibilityRole="button"
            style={({ pressed }) => ({ backgroundColor: '#0E0E12', borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <MarketLogo m={m} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label">No paper trade on {m.symbol} yet</Txt>
              <Txt v="small" style={{ marginTop: 3, lineHeight: 18 }}>
                {perp ? `Go long or short up to ${m.maxLev}x with paper money, at the live price.` : 'Buy with paper money at the live price and watch your P&L move.'}
              </Txt>
            </View>
            <Txt v="label" color={C.dim}>›</Txt>
          </Pressable>
        ) : (
          <View style={{ gap: 10 }}>
            {mine.map((p) => <OpenTrade key={p.id} p={p} px={prices[p.mint]} onClose={() => setClosing(p)} onPress={() => router.push(myTradeHref(p))} />)}
          </View>
        )}

        {past.length ? (
          <>
            <Head title="Closed here" />
            <View style={{ backgroundColor: CARD, borderRadius: 24, overflow: 'hidden' }}>
              {past.map((c, i) => (
                <Pressable key={c.id} onPress={() => router.push(myTradeHref(c))} accessibilityRole="button" accessibilityLabel={`${c.symbol} trade, ${signedUsd(c.pnl)}`}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#18181E', backgroundColor: pressed ? '#17171D' : 'transparent' })}>
                  <SideTag p={c} />
                  <Txt v="small" lines={1} style={{ flex: 1 }}>{fmtPrice(c.entry)} → {fmtPrice(c.exit)} · {c.reason === 'liquidated' ? 'liquidated' : ago(c.closedAt)}</Txt>
                  <Txt v="label" color={c.pnl >= 0 ? C.up : C.down} style={{ fontVariant: ['tabular-nums'] }}>{signedUsd(c.pnl)}</Txt>
                  <ShareTrade p={c} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Txt v="small" style={{ marginTop: 22, lineHeight: 18, textAlign: 'center' }}>
          Practice · paper money. The price is live from Jupiter{perp ? ', and the fee and borrow rate are Jupiter Perps\' own' : ''}. Liquidations are checked only while Practice is open. No real USDC moves.
        </Txt>
      </ScrollView>

      {/* the bar that stays at the bottom */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.94)', borderTopWidth: 1, borderTopColor: HAIR, paddingTop: 12, paddingBottom: insets.bottom + 10, paddingHorizontal: S.gutter }}>
        <View style={[{ flexDirection: 'row', gap: 8 }, col]}>
          {perp ? (
            <>
              <BarBtn title="Long" bg={C.up} fg="#04120A" onPress={() => setTrade('long')} disabled={!pr.ready} />
              <BarBtn title="Short" bg={C.down} fg="#fff" onPress={() => setTrade('short')} disabled={!pr.ready} />
            </>
          ) : <BarBtn title={`Buy ${m.symbol}`} bg={C.up} fg="#04120A" onPress={() => setTrade('long')} disabled={!pr.ready} />}
        </View>
      </View>

      <TradeSheet open={trade !== null} side={trade ?? 'long'} preset={preset} onClose={() => { setTrade(null); setPreset(undefined); }} m={m} px={px} pool={pool.info} poolErr={pool.error} pr={pr} />
      <CloseSheet p={closing} px={closing ? prices[closing.mint] : undefined} pr={pr} onClose={() => setClosing(null)} />
    </View>
  );
}

function PerpFacts({ info, error, onRetry }: { info?: PoolInfo; error?: string; onRetry: () => void }) {
  if (!info) return error ? <View style={{ backgroundColor: CARD, borderRadius: 24, padding: 14 }}><ErrorLine msg={error} onRetry={onRetry} /></View> : <SkeletonRows n={2} square />;
  return (
    <View style={{ gap: 8 }}>
      <Row style={{ gap: 8 }}>
        <Stat label="Borrow, longs" value={`${pctRate(info.longBorrowPctHr)}/hr`} />
        <Stat label="Borrow, shorts" value={`${pctRate(info.shortBorrowPctHr)}/hr`} />
      </Row>
      <Row style={{ gap: 8 }}>
        <Stat label="Open fee" value={pctRate(info.openFeePct)} sub="of position size" />
        <Stat label="Utilization" value={`${Math.round(info.longUtilPct)}% · ${Math.round(info.shortUtilPct)}%`} sub="longs · shorts" />
      </Row>
      <Row style={{ gap: 8 }}>
        <Stat label="Available to longs" value={fmtUsd(info.longLiquidity, { compact: true })} />
        <Stat label="Available to shorts" value={fmtUsd(info.shortLiquidity, { compact: true })} />
      </Row>
      {error ? <ErrorLine msg={error} onRetry={onRetry} /> : null}
    </View>
  );
}

/* ---------- the trade drawer ---------- */
const PRESETS = [100, 500, 1000];

function TradeSheet({ open, onClose, side: side0, preset, m, px, pool, poolErr, pr }: {
  open: boolean; onClose: () => void; side: Side; preset?: CopyArgs; m: Market; px?: Px; pool?: PoolInfo; poolErr?: string; pr: Practice;
}) {
  const perp = m.kind === 'perp';
  const copyLev = preset ? Math.max(1, Math.min(preset.lev, m.maxLev)) : undefined;
  const levs = useMemo(() => [...new Set<number>([...LEVERAGE, ...(perp && copyLev ? [copyLev] : [])])].sort((a, b) => a - b), [perp, copyLev]);
  const [side, setSide] = useState<Side>(side0);
  const [lev, setLev] = useState(10);
  const [v, setV] = useState('');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Position | null>(null);
  useEffect(() => {
    if (!open) return;
    setSide(side0); setErr(undefined); setDone(null);
    setV(preset ? String(preset.margin) : '');
    if (preset && perp && copyLev) setLev(copyLev);
  }, [open, side0]); // eslint-disable-line react-hooks/exhaustive-deps

  const cash = pr.book?.balance ?? 0;
  const price = px?.usdPrice;
  const L = perp ? lev : 1;
  const amt = Number(v || '0');
  const size = amt * L;
  const feePct = perp ? pool?.openFeePct : 0;
  const fee = feePct !== undefined ? (size * feePct) / 100 : undefined;
  const rate = perp && pool ? (side === 'long' ? pool.longBorrowPctHr : pool.shortBorrowPctHr) : 0;
  const liq = price && amt > 0 ? liqPrice({ kind: m.kind, side, lev: L, margin: amt, entry: price, borrowPctHr: rate, openedAt: Date.now() }) : null;
  const max = feePct !== undefined ? Math.floor((cash / (1 + (L * feePct) / 100)) * 100) / 100 : cash;
  const waitingPool = perp && !pool;

  const tap = (k: Key) => { setErr(undefined); setV((x) => editAmount(x, k, 2, 1_000_000)); };
  const go = async () => {
    if (!px || !isFresh(px)) { setErr('Waiting for a fresh live price. Try again in a few seconds.'); return; }
    if (waitingPool) { setErr(poolErr ?? "Jupiter Perps' fee and borrow rate haven't loaded yet."); return; }
    if (!(amt >= 1)) { setErr('At least $1'); return; }
    if (amt + (fee ?? 0) > cash + 1e-9) { setErr(`You have ${usd2(cash)} of paper cash${perp ? ` (max ${usd2(max)} at ${L}x with the fee)` : ''}`); return; }
    setBusy(true); setErr(undefined);
    try {
      const p = await pr.open(m, { side, lev: L, margin: amt, price: px, openFeePct: feePct ?? 0, borrowPctHr: rate });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(p);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const [whole, cents] = (v || '0').split('.');
  const actColor = side === 'long' ? C.up : C.down;
  const label = !v ? 'Enter an amount' : busy ? 'Opening…' : perp ? `Open ${L}x ${side} · ${usd2(amt)}` : `Buy ${usd2(amt)} of ${m.symbol}`;

  return (
    <Sheet open={open} onClose={onClose}>
      {done ? (
        <View style={{ alignItems: 'center', paddingVertical: 14 }}>
          <Animated.View entering={ZoomIn.springify().damping(10)} style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: C.up, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="title" color="#04120A" style={{ fontSize: 38 }}>✓</Txt>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(150)} style={{ alignItems: 'center' }}>
            <Txt v="h2" style={{ marginTop: 16 }}>Paper trade opened</Txt>
            <Txt v="hero" style={{ fontSize: 50, marginTop: 2, fontVariant: ['tabular-nums'] }}>{usd2(done.margin)}</Txt>
            <Row style={{ gap: 6, marginTop: 2 }}><SideTag p={done} /><Txt v="small">{done.symbol} at {fmtPrice(done.entry)}</Txt></Row>
            {liqPrice(done) !== null ? <Txt v="small" style={{ marginTop: 6 }}>Liquidation at <Txt v="small" color={C.down}>{fmtPrice(liqPrice(done)!)}</Txt></Txt> : null}
            <Txt v="small" style={{ marginTop: 6, textAlign: 'center' }}>Practice · paper money. No real USDC moved.</Txt>
          </Animated.View>
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', marginTop: 22 }}>
            <BarBtn title="Done" bg={C.up} fg="#04120A" onPress={onClose} h={56} />
          </View>
        </View>
      ) : (
        <View>
          <Row style={{ gap: 12, marginTop: 2 }}>
            <MarketLogo m={m} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="title" lines={1} style={{ fontSize: 22 }}>{perp ? `${side === 'long' ? 'Long' : 'Short'} ${m.symbol}` : `Buy ${m.name}`}</Txt>
              <Txt v="small" lines={1}>{price !== undefined ? `${fmtPrice(price)} live` : 'Reading the live price'} · paper cash {usd2(cash)}</Txt>
            </View>
          </Row>
          {preset ? <CopyNote c={preset} maxLev={perp ? m.maxLev : undefined} spot={!perp} /> : null}

          {perp ? (
            <>
              <View style={{ flexDirection: 'row', backgroundColor: '#1B1B21', borderRadius: 16, padding: 3, gap: 3, marginTop: 14 }}>
                {(['long', 'short'] as Side[]).map((sd) => {
                  const on = side === sd;
                  return (
                    <Pressable key={sd} onPress={() => { Haptics.selectionAsync(); setSide(sd); setErr(undefined); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ flex: 1, height: 44, borderRadius: 13, backgroundColor: on ? (sd === 'long' ? C.up : C.down) : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      <Txt v="label" color={on ? (sd === 'long' ? '#04120A' : '#fff') : C.muted}>{sd === 'long' ? 'Long' : 'Short'}</Txt>
                    </Pressable>
                  );
                })}
              </View>
              <Txt v="small" style={{ marginTop: 12 }}>Leverage</Txt>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                {levs.map((x) => {
                  const on = lev === x;
                  return (
                    <Pressable key={x} onPress={() => { Haptics.selectionAsync(); setLev(x); setErr(undefined); }} accessibilityRole="button" accessibilityLabel={`${x}x leverage`}
                      style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 12, backgroundColor: on ? C.ink : '#1F1F26', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                      <Txt v="label" color={on ? '#000' : C.ink} style={{ fontSize: 13.5 }}>{x}x</Txt>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Txt v="small" style={{ textAlign: 'center', marginTop: 14 }}>{perp ? 'Margin, from your paper cash' : 'Amount, from your paper cash'}</Txt>
          <Txt v="hero" color={v ? C.ink : C.dim} style={{ textAlign: 'center', fontSize: 56, letterSpacing: -2.5 }} lines={1}>
            ${whole}<Txt v="hero" color={C.dim} style={{ fontSize: 56, letterSpacing: -2.5 }}>{v.includes('.') ? `.${cents ?? ''}` : ''}</Txt>
          </Txt>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {PRESETS.map((p) => (
              <Pressable key={p} onPress={() => { Haptics.selectionAsync(); setV(String(p)); setErr(undefined); }}
                style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 22, backgroundColor: Number(v) === p ? C.ink : '#1F1F26', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                <Txt v="label" color={Number(v) === p ? '#000' : C.ink}>${p.toLocaleString('en-US')}</Txt>
              </Pressable>
            ))}
            <Pressable onPress={() => { Haptics.selectionAsync(); setV(String(Math.max(0, max))); setErr(undefined); }} disabled={waitingPool}
              style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 22, backgroundColor: '#1F1F26', alignItems: 'center', justifyContent: 'center', opacity: waitingPool ? 0.4 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <Txt v="label">Max</Txt>
            </Pressable>
          </View>

          <View style={{ marginTop: 12 }}>
            <Keypad compact={perp} onKey={tap} onClear={() => setV('')} onEnter={() => { if (v && !busy) go(); }} active={open && !done} />
          </View>

          <View style={{ backgroundColor: '#1B1B21', borderRadius: 18, padding: 14, marginTop: 12, gap: 9 }}>
            {perp ? (
              <>
                <Line k="Position size" v={usd2(size)} />
                <Line k="Liquidation price" v={liq !== null ? fmtPrice(liq) : '–'} color={liq !== null ? C.down : undefined} />
                <Line k={`Open fee${pool ? ` (${pctRate(pool.openFeePct)})` : ''}`} v={fee !== undefined ? usd2(fee) : '…'} />
                <Line k={`Borrow${pool ? ` (${pctRate(rate)}/hr)` : ''}, approx.`} v={pool ? `${usd2((size * rate) / 100)}/hr` : '…'} />
              </>
            ) : (
              <>
                <Line k="You get" v={price && amt > 0 ? `${(amt / price).toLocaleString('en-US', { maximumSignificantDigits: 6 })} ${m.symbol}` : '–'} />
                <Line k="Fee" v="None in practice" />
                <Line k="Liquidation" v="None (spot)" />
              </>
            )}
          </View>
          {perp && poolErr && !pool ? <ErrorLine msg={poolErr} /> : null}
          {err ? <ErrorLine msg={err} /> : null}

          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <BarBtn title={label} bg={v ? (perp ? actColor : C.up) : '#2A2A31'} fg={v ? (perp && side === 'short' ? '#fff' : '#04120A') : C.muted} onPress={go} disabled={busy || !v} h={56} />
          </View>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Practice · paper money. Opens at the live price; no real USDC moves.</Txt>
        </View>
      )}
    </Sheet>
  );
}
