// The pieces every trading app's home is made of (OKX Wallet, Coinbase, Phantom): a row of round actions under the
// balance, and a watchlist of markets, each with its logo, a 24-hour sparkline, the price and the move.
// The watchlist is the eight prices Clashy's crank keeps on chain: the live price from the feed account, the
// sparkline and the 24h move from the crank's own recorded history (GET /history). Nothing is backfilled.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { HISTORY_SYMS, usePriceHistory } from '@/chain/history-prices';
import { usePrices } from '@/chain/social';
import { STOCKS } from '@/chain/stocks';
import { STOCK_ART } from './feed';
import { ART, Bone, ErrorLine, Press, Row, Sparkline, Txt } from './kit';
import { C, FONT } from './tokens';

/** One round action: a 52 px circle with an icon, its label underneath. */
export function RoundAction({ icon, label, onPress, primary }: { icon: ReactNode; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Press onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 7 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: primary ? C.brand : C.s2, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <Text numberOfLines={1} style={{ ...FONT.medium, fontSize: 12.5, color: C.ink }}>{label}</Text>
    </Press>
  );
}
export function ActionRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 4, marginTop: 18 }}>{children}</View>;
}

const CRYPTO: Record<string, { name: string; art: number }> = {
  SOL: { name: 'Solana', art: ART.logoSOL }, BTC: { name: 'Bitcoin', art: ART.logoBTC }, ETH: { name: 'Ethereum', art: ART.logoETH },
};
const nameOf = (sym: string) => CRYPTO[sym]?.name ?? STOCKS.find((s) => s.symbol === sym)?.name ?? sym;
const artOf = (sym: string) => CRYPTO[sym]?.art ?? STOCK_ART[sym];
const routeOf = (sym: string) => (CRYPTO[sym] ? `/practice/${sym}-PERP` : `/stock/${sym}`);
const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A market row, the way Coinbase's Prices list reads: logo, name over ticker, sparkline, price over move. */
export function MarketRow({ sym, price, series, index = 0 }: { sym: string; price?: number; series: number[]; index?: number }) {
  const first = series[0];
  const ch = first && price ? ((price - first) / first) * 100 : undefined;
  const line = price !== undefined && series.length ? [...series, price] : series;
  return (
    <Animated.View entering={FadeInDown.delay(index * 35).duration(300)}>
      <Pressable onPress={() => router.push(routeOf(sym) as Href)} accessibilityRole="button" accessibilityLabel={`${nameOf(sym)}${price ? `, ${fmt(price)}` : ''}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
        <Image source={artOf(sym)} style={{ width: 38, height: 38, borderRadius: 19 }} contentFit="cover" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1}>{nameOf(sym)}</Txt>
          <Txt v="small" lines={1} style={{ marginTop: 1 }}>{sym}{CRYPTO[sym] ? '' : ' · stock'}</Txt>
        </View>
        <View style={{ width: 64, alignItems: 'center' }}>{line.length > 1 ? <Sparkline data={line} w={60} h={24} /> : null}</View>
        <View style={{ alignItems: 'flex-end', minWidth: 86 }}>
          <Txt v="num" lines={1}>{price !== undefined ? fmt(price) : '…'}</Txt>
          <Txt v="small" lines={1} color={ch === undefined ? C.dim : ch >= 0 ? C.up : C.down} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>
            {ch === undefined ? '–' : `${ch >= 0 ? '+' : '−'}${Math.abs(ch).toFixed(2)}%`}
          </Txt>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** The home watchlist: the crank's eight markets (or the first n). */
export function Watchlist({ n = HISTORY_SYMS.length, title = 'Markets', more }: { n?: number; title?: string; more?: { label: string; href: string } }) {
  const prices = usePrices();
  const hist = usePriceHistory('24h');
  const px = prices.status === 'ready' ? prices.data : {};
  const syms = HISTORY_SYMS.slice(0, n);
  const seriesOf = (sym: string) => (hist.data ? hist.data.points.map((p) => p.p[sym]).filter((v): v is number => typeof v === 'number') : []);
  return (
    <View style={{ marginTop: 26 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <Txt v="h2">{title}</Txt>
        {more ? <Pressable onPress={() => router.push(more.href as Href)} hitSlop={8}><Txt v="small" color={C.brandSoft} style={{ ...FONT.medium }}>{more.label}</Txt></Pressable> : null}
      </Row>
      {prices.status === 'error' ? <ErrorLine msg={prices.error} onRetry={prices.reload} /> : null}
      {prices.status === 'loading' ? (
        <View style={{ gap: 18, paddingVertical: 10 }}>{syms.map((s) => <Row key={s} style={{ gap: 12 }}><Bone w={38} h={38} r={19} /><Bone w={'40%'} h={12} /></Row>)}</View>
      ) : syms.map((s, i) => <MarketRow key={s} sym={s} price={px[s]} series={seriesOf(s)} index={i} />)}
      {hist.error && !hist.data ? <Txt v="small" style={{ fontSize: 11.5 }}>Sparklines need the price history: {hist.error}</Txt> : null}
    </View>
  );
}
