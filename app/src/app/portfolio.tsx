// Portfolio (/portfolio): everything you own, the way the best trading apps show it. Net worth is the same sum Home
// shows (wallet USDC + Stash cash + stocks bought through the Stash at the live on-chain price) plus your share of any
// squad chest. The chart is what you hold right now, valued at the prices Clashy's own crank recorded once a minute
// (GET /history on the sponsor relay); before the first recorded sample there is nothing, and the chart says so.
// Allocation, holdings with profit and loss, and the cash rows all come from chain reads. Nothing is invented.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChain } from '@/chain/useChain';
import { readPortfolio, readStash, usePoll, usePrices } from '@/chain/social';
import { readChestStakes, type ChestStake } from '@/chain/chest-stakes';
import { usePriceHistory, type PriceRange } from '@/chain/history-prices';
import { STOCK_ART } from '@/ui/feed';
import { Jar } from '@/ui/icons';
import { ART, BackBtn, Bone, Btn, CRESTS, ErrorLine, LiveChart, LiveDot, Money, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, FONT, S, fmtUsd } from '@/ui/tokens';

const CHART_H = 220;
const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const signed = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
const pctText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
const when = (secs: number) => new Date(secs * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const RANGES: { key: PriceRange; label: string; secs: number; past: string }[] = [
  { key: '1h', label: '1H', secs: 3_600, past: 'Past hour' },
  { key: '24h', label: '24H', secs: 86_400, past: 'Past 24 hours' },
  { key: '7d', label: '7D', secs: 7 * 86_400, past: 'Past 7 days' },
];

/** Allocation colours: one per kind of money (the accent, then white and greys). */
const SLICE = { wallet: C.brand, stash: C.ink, stocks: C.muted, chests: C.dim } as const;

const useHistory = (range: PriceRange) => usePriceHistory(range);

function Head({ title, right }: { title: string; right?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 10, gap: 10 }}>
      <Txt v="h2" lines={1} style={{ flexShrink: 1 }}>{title}</Txt>
      {right ? <Txt v="small" lines={1} style={{ flexShrink: 1 }}>{right}</Txt> : null}
    </Row>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: C.card, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Txt v="small" lines={1}>{label}</Txt>
      <Txt v="num" color={color} lines={1} style={{ marginTop: 2 }}>{value}</Txt>
    </View>
  );
}

/** A logo-sized image (stock logos and the USDC coin are round; squad crests keep their shape). */
const Logo = ({ src, round = true }: { src: number; round?: boolean }) => (
  <Image source={src} style={{ width: 38, height: 38, borderRadius: round ? 19 : 0 }} contentFit={round ? 'cover' : 'contain'} />
);

/** A holding row on black, like the watchlist's MarketRow: logo, a name over a detail line, a value over a coloured line. */
function HoldRow({ art, name, line, value, sub, subColor, onPress }: {
  art: ReactNode; name: string; line: string; value: string; sub?: string; subColor?: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, ${value}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      {art}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{name}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 1 }}>{line}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: '45%' }}>
        <Txt v="num" lines={1}>{value}</Txt>
        {sub ? <Txt v="small" color={subColor} lines={1} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>{sub}</Txt> : null}
      </View>
    </Pressable>
  );
}

/** Range picker: three 44 px segments. */
function RangePicker({ value, onChange }: { value: PriceRange; onChange: (r: PriceRange) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 3, gap: 3 }}>
      {RANGES.map((r) => {
        const on = r.key === value;
        return (
          <Pressable key={r.key} onPress={() => onChange(r.key)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={r.past}
            style={{ flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.s2 : 'transparent' }}>
            <Txt v="label" color={on ? C.ink : C.muted} style={{ fontSize: 13.5 }}>{r.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function SignedOut({ onSignIn, status, error }: { onSignIn?: () => void; status: string; error?: string }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Pending art={ART.coinsPile} title={status === 'out' ? 'Sign in to see your portfolio' : 'Your wallet is not ready'}
        body={status === 'out' ? 'Your USDC, Stash and real stocks, read from Solana.' : error ?? 'Setup required: the wallet could not start.'} />
      {status === 'out' && onSignIn ? <Btn title="Sign in" h={50} onPress={onSignIn} /> : null}
    </View>
  );
}

function Loading() {
  return (
    <View style={{ marginTop: 18 }}>
      <Bone w={70} h={12} />
      <Bone w={210} h={48} r={12} style={{ marginTop: 8 }} />
      <Bone w={150} h={18} r={8} style={{ marginTop: 8 }} />
      <Bone w="100%" h={CHART_H} r={22} style={{ marginTop: 18 }} />
      <Bone w="100%" h={50} r={14} style={{ marginTop: 12 }} />
      <View style={{ marginTop: 20 }}><SkeletonRows n={3} square /></View>
    </View>
  );
}

export default function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const chain = useChain();
  const { me, bal, wallet, tick } = chain;
  const key = me?.toBase58();

  const prices = usePrices();
  const stash = usePoll(() => (me ? readStash(me) : Promise.resolve(null)), 6000, [key, tick]);
  const port = usePoll(() => (me ? readPortfolio(me) : Promise.resolve([])), 6000, [key, tick]);
  const chests = usePoll(() => (me ? readChestStakes(me) : Promise.resolve([] as ChestStake[])), 15_000, [key, tick]);
  const [range, setRange] = useState<PriceRange>('24h');
  const hist = useHistory(range);
  const [chartW, setChartW] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  const px = prices.status === 'ready' ? prices.data : {};
  const walletCash = bal ?? 0;
  const stashCash = stash.status === 'ready' && stash.data ? stash.data.balance : 0;
  const chestList = chests.status === 'ready' ? chests.data : [];
  const chestVal = chestList.reduce((a, c) => a + c.value, 0);
  // stocks: the shares in your Holding accounts (bought through the Stash), marked to the live on-chain price
  const held = (port.status === 'ready' ? port.data : []).filter((x) => x.shares > 0).map((x) => {
    const price = px[x.stock.symbol];
    const value = price ? x.shares * price : 0;
    const pnl = price ? value - x.cost : 0;
    return { ...x, price, value, pnl, pnlPct: price && x.cost > 0 ? (pnl / x.cost) * 100 : 0 };
  }).sort((a, b) => b.value - a.value);
  const unpriced = held.filter((h) => !h.price);
  const stockVal = held.reduce((a, h) => a + h.value, 0);
  const stockCost = held.reduce((a, h) => a + (h.price ? h.cost : 0), 0);
  const stockPnl = held.reduce((a, h) => a + h.pnl, 0);
  const cash = walletCash + stashCash + chestVal;
  const worth = cash + stockVal;

  // the chart: today's holdings × each recorded price, + today's cash; a sample missing a held stock is skipped
  const rangeDef = RANGES.find((r) => r.key === range)!;
  const series = useMemo(() => {
    const pts = (hist.data?.points ?? []).flatMap((pt) => {
      let v = cash;
      for (const h of held) {
        const p = pt.p[h.stock.symbol];
        if (!p) return [];
        v += h.shares * p;
      }
      return [{ t: pt.t, v }];
    });
    return pts;
  }, [hist.data, cash, held.map((h) => `${h.stock.symbol}:${h.shares}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const nowSecs = Math.floor(Date.now() / 1000);
  // the line ends on the live value (live on-chain prices), so it meets the big number
  const line = series.length >= 2 && !unpriced.length ? [...series, { t: nowSecs, v: worth }] : series;
  const recording = series.length < 2;
  const startV = line[0]?.v ?? worth;
  const shown = scrub !== null && line[scrub] ? line[scrub] : null;
  const headV = shown ? shown.v : worth;
  const change = headV - startV;
  const changePct = startV > 0 ? (change / startV) * 100 : 0;
  const coversRange = !!line[0] && line[0].t <= nowSecs - rangeDef.secs + 5 * 60;
  const changeLabel = shown ? when(shown.t) : coversRange ? rangeDef.past : line[0] ? `Since ${when(line[0].t)}` : rangeDef.past;
  const up = change >= 0;
  const lineColor = held.length === 0 ? C.brand : up ? C.up : C.down;

  // scrubbing: same x mapping as LiveChart (4 px left inset, 74 px right gutter for its price tag)
  const scrubAt = (x: number) => {
    if (line.length < 2 || chartW <= 0) return;
    const i = Math.round(((x - 4) / (chartW - 74)) * (line.length - 1));
    setScrub(Math.max(0, Math.min(line.length - 1, i)));
  };
  const scrubX = scrub !== null && line.length >= 2 ? 4 + (scrub / (line.length - 1)) * (chartW - 74) : null;
  const touchX = (e: GestureResponderEvent) => e.nativeEvent.locationX;
  const hover = Platform.OS === 'web' ? {
    onPointerMove: (e: { nativeEvent: { offsetX?: number } }) => { if (typeof e.nativeEvent.offsetX === 'number') scrubAt(e.nativeEvent.offsetX); },
    onPointerLeave: () => setScrub(null),
  } : {};

  // the wallet balance comes from useChain; when Solana cannot be read there is no honest net worth to show
  const balErr = bal == null ? chain.err : undefined;
  const loading = !!me && ((bal == null && !balErr) || stash.status === 'loading' || port.status === 'loading' || prices.status === 'loading' || chests.status === 'loading');
  const nothing = !loading && port.status === 'ready' && stash.status === 'ready' && worth < 0.005 && held.length === 0 && chestList.length === 0;
  const slices = [
    { key: 'wallet', label: 'Cash in wallet', value: walletCash, color: SLICE.wallet },
    { key: 'stash', label: 'Stash cash', value: stashCash, color: SLICE.stash },
    { key: 'stocks', label: 'Stocks', value: stockVal, color: SLICE.stocks },
    ...(chestList.length ? [{ key: 'chests', label: 'Squad chests', value: chestVal, color: SLICE.chests }] : []),
  ].filter((s) => s.value > 0.004);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 36 }}>
      <Row style={{ gap: 10 }}>
        <BackBtn onPress={back} />
        <Txt v="title">Portfolio</Txt>
      </Row>

      {!me ? (
        wallet.status === 'loading' || wallet.status === 'creating' ? <Loading /> : <SignedOut onSignIn={wallet.login} status={wallet.status} error={wallet.error} />
      ) : balErr ? (
        <View style={{ marginTop: 18, backgroundColor: C.card, borderRadius: 18, padding: 16 }}>
          <Txt v="label">Cannot read your wallet</Txt>
          <ErrorLine msg={balErr} onRetry={chain.refresh} />
        </View>
      ) : loading ? <Loading /> : (
        <>
          {/* net worth: one big number, cents dimmed; scrubbing the chart shows that moment instead */}
          <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 14 }}>
            <Txt v="small">{shown ? 'Value then' : 'Net worth'}</Txt>
            <View style={{ marginTop: 2 }}><Money value={headV} size={40} /></View>
            <Txt v="small" lines={1} style={{ marginTop: 2 }}>
              {!recording ? <Txt v="small" color={up ? C.up : C.down} style={{ ...FONT.medium, fontVariant: ['tabular-nums'] }}>{signed(change)} ({pctText(changePct)}) </Txt> : null}
              {recording ? 'Change shows once prices are recorded' : changeLabel}
            </Txt>
            {held.length && !shown ? (
              <Txt v="small" lines={1} style={{ marginTop: 2 }}>
                <Txt v="small" color={stockPnl >= 0 ? C.up : C.down} style={{ ...FONT.medium, fontVariant: ['tabular-nums'] }}>{signed(stockPnl)}</Txt> on your stocks since you bought
              </Txt>
            ) : null}
          </Animated.View>

          {nothing ? (
            <View style={{ marginTop: 18 }}>
              <Pending art={ART.coinsPile} title="Nothing here yet" body="Add USDC, save in your Stash or buy a real stock." />
              <Row style={{ gap: 8 }}>
                <Btn title="Add USDC" h={50} style={{ flex: 1 }} onPress={() => router.push('/wallet' as Href)} />
                <Btn title="Buy a stock" kind="ghost" h={50} style={{ flex: 1 }} onPress={() => router.push('/stash' as Href)} />
              </Row>
            </View>
          ) : (
            <>
              {/* chart */}
              <View onLayout={(e) => setChartW(Math.floor(e.nativeEvent.layout.width))} style={{ marginTop: 16, marginHorizontal: -4 }}>
                {chartW <= 0 ? <View style={{ height: CHART_H }} /> : hist.error && !hist.data ? (
                  <View style={{ width: chartW, height: CHART_H, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                    <Txt v="label" style={{ textAlign: 'center' }}>Price history is not available</Txt>
                    <View style={{ alignSelf: 'stretch', marginTop: 6 }}><ErrorLine msg={hist.error} onRetry={hist.reload} /></View>
                  </View>
                ) : !hist.data ? <Bone w={chartW} h={CHART_H} r={22} /> : recording ? (
                  <View style={{ width: chartW, height: CHART_H, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                    <LiveDot color={C.brandSoft} />
                    <Txt v="label" style={{ marginTop: 10, textAlign: 'center' }}>Recording prices…</Txt>
                    <Txt v="small" style={{ marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                      {hist.data.first
                        ? `Prices since ${when(hist.data.first)}, not enough in this range yet. Try ${range === '1h' ? '24H' : 'a shorter range'}.`
                        : 'Clashy records prices once a minute; the chart starts at the second sample.'}
                    </Txt>
                  </View>
                ) : (
                  <Animated.View entering={FadeIn.duration(260)} style={{ width: chartW, height: CHART_H }}>
                    <LiveChart data={line.map((x) => x.v)} w={chartW} h={CHART_H} color={lineColor} minSpan={0.002} />
                    <View
                      style={{ position: 'absolute', left: 0, top: 0, width: chartW, height: CHART_H }}
                      onStartShouldSetResponder={() => true}
                      onResponderGrant={(e) => scrubAt(touchX(e))}
                      onResponderMove={(e) => scrubAt(touchX(e))}
                      onResponderRelease={() => setScrub(null)}
                      onResponderTerminate={() => setScrub(null)}
                      {...hover}>
                      {scrubX !== null ? <View pointerEvents="none" style={{ position: 'absolute', left: scrubX, top: 0, bottom: 0, width: 1, backgroundColor: C.muted }} /> : null}
                    </View>
                  </Animated.View>
                )}
              </View>
              <View style={{ marginTop: 10 }}><RangePicker value={range} onChange={(r) => { setScrub(null); setRange(r); }} /></View>
              <Txt v="small" style={{ marginTop: 8, fontSize: 12, color: C.dim, lineHeight: 17 }}>
                What you hold now, at past prices · recorded by Clashy{hist.data?.first ? ` since ${when(hist.data.first)}` : ''}
                {held.length === 0 ? ' · all cash, so the line stays flat' : ''}
              </Txt>
              {hist.error && hist.data ? <ErrorLine msg={hist.error} onRetry={hist.reload} /> : null}
              {unpriced.length ? <ErrorLine msg={`No live price for ${unpriced.map((h) => h.stock.symbol).join(', ')} yet, so ${unpriced.length === 1 ? 'it is' : 'they are'} left out of the total.`} /> : null}

              {/* quick numbers */}
              <Row style={{ gap: 8, marginTop: 16 }}>
                <Stat label="Cash" value={fmtUsd(walletCash + stashCash)} />
                <Stat label="In stocks" value={fmtUsd(stockVal)} />
                <Stat label="Stock profit" value={held.length ? signed(stockPnl) : '–'} color={held.length ? (stockPnl >= 0 ? C.up : C.down) : undefined} />
              </Row>

              {/* allocation */}
              {slices.length ? (
                <>
                  <Head title="Allocation" />
                  <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 14 }}>
                    <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
                      {slices.map((s) => <View key={s.key} style={{ flexGrow: s.value, flexBasis: 0, minWidth: 4, backgroundColor: s.color }} />)}
                    </View>
                    <View style={{ marginTop: 12, gap: 10 }}>
                      {slices.map((s) => (
                        <Row key={s.key} style={{ gap: 10 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                          <Txt v="body" lines={1} style={{ flex: 1 }}>{s.label}</Txt>
                          <Txt v="num">{fmtUsd(s.value)}</Txt>
                          <Txt v="small" style={{ width: 48, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{worth > 0 ? `${((s.value / worth) * 100).toFixed(s.value / worth < 0.1 ? 1 : 0)}%` : '–'}</Txt>
                        </Row>
                      ))}
                    </View>
                  </View>
                </>
              ) : null}

              {/* stocks */}
              <Head title="Stocks" right={held.length ? `${held.length} held · ${fmtUsd(stockCost)} paid` : undefined} />
              {port.status === 'error' ? <ErrorLine msg={port.error} onRetry={port.reload} /> : held.length === 0 ? (
                <Pressable onPress={() => router.push('/stash' as Href)} accessibilityRole="button" accessibilityLabel="No stocks yet, buy from your Stash"
                  style={({ pressed }) => ({ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 })}>
                  <Row>
                    {['NVDA', 'TSLA', 'AAPL'].map((k, i) => <Image key={k} source={STOCK_ART[k]} style={{ width: 28, height: 28, borderRadius: 14, marginLeft: i ? -9 : 0, borderWidth: 2, borderColor: C.bg }} contentFit="cover" />)}
                  </Row>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label">No stocks yet</Txt>
                    <Txt v="small" lines={1} style={{ marginTop: 1 }}>Real tokenized shares from $1, out of your Stash</Txt>
                  </View>
                  <Txt v="label" color={C.dim}>›</Txt>
                </Pressable>
              ) : (
                <View>
                  {held.map((h) => (
                    <HoldRow key={h.stock.symbol} art={<Logo src={STOCK_ART[h.stock.symbol]} />} name={h.stock.name}
                      line={`${h.shares.toFixed(4)} ${h.stock.symbol}${h.price ? ` · ${fmtUsd(h.price)}` : ''}`}
                      value={h.price ? fmtUsd(h.value) : 'No price'}
                      sub={h.price ? `${signed(h.pnl)}${h.cost > 0 ? ` (${pctText(h.pnlPct)})` : ''}` : undefined}
                      subColor={h.pnl >= 0 ? C.up : C.down}
                      onPress={() => router.push(`/stock/${h.stock.symbol}` as Href)} />
                  ))}
                </View>
              )}

              {/* cash */}
              <Head title="Cash" right="USDC" />
              <View>
                <HoldRow art={<Logo src={ART.logoUSDC} />} name="Wallet" line="Ready to play, send or save" value={fmtUsd(walletCash)} onPress={() => router.push('/wallet' as Href)} />
                <HoldRow art={<View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Jar size={18} color={C.ink} /></View>}
                  name="Stash" line={stash.status === 'ready' && !stash.data ? 'Not opened yet' : 'Savings only you can open'} value={fmtUsd(stashCash)} onPress={() => router.push('/stash' as Href)} />
              </View>
              {stash.status === 'error' ? <ErrorLine msg={stash.error} onRetry={stash.reload} /> : null}

              {/* squad chests: your pro-rata share of each chest you put money in */}
              {chestList.length ? (
                <>
                  <Head title="Squad chests" right="Your share" />
                  <View>
                    {chestList.map((c) => {
                      const pnl = c.value - c.deposit;
                      return (
                        <HoldRow key={c.clan.toBase58()} art={<Logo round={false} src={CRESTS[((c.crest % CRESTS.length) + CRESTS.length) % CRESTS.length]} />} name={c.name || 'Squad'}
                          line={`You put in ${fmtUsd(c.deposit)}`} value={fmtUsd(c.value)}
                          sub={Math.abs(pnl) >= 0.005 ? signed(pnl) : undefined} subColor={pnl >= 0 ? C.up : C.down}
                          onPress={() => router.push(`/squad/${c.clan.toBase58()}` as Href)} />
                      );
                    })}
                  </View>
                </>
              ) : null}
              {chests.status === 'error' ? <ErrorLine msg={`Squad chests: ${chests.error}`} onRetry={chests.reload} /> : null}
              {prices.status === 'error' ? <ErrorLine msg={prices.error} onRetry={prices.reload} /> : null}

              <Txt v="small" style={{ marginTop: 18, fontSize: 12, color: C.dim, lineHeight: 17, textAlign: 'center' }}>
                Read from Solana: your USDC, Stash vault, Holding accounts and the crank's prices.
              </Txt>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
