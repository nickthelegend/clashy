// Coin page: pump.fun's information layout, live data only.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { isMajor, useCandles, useMarket } from '@/data/markets';
import { ART, Avatar, BackBtn, Btn, Card, ChangePill, ErrorLine, Pending, PriceChart, Row, TokenArt, Txt } from '@/ui/kit';
import { COIN_SYMBOLS } from '@/chain/client';
import { useCoinDuelists } from '@/chain/reads';
import { C, S, fmtUsd } from '@/ui/tokens';

const Stat = ({ k, v }: { k: string; v: string }) => (
  <Card style={{ flex: 1, padding: 9 }}><Txt v="small" style={{ fontSize: 11 }}>{k}</Txt><Txt v="num" style={{ fontSize: 13.5, marginTop: 2 }}>{v}</Txt></Card>
);

export default function Coin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const { width } = useWindowDimensions();
  const m = useMarket(id);
  const candles = useCandles(id);
  const major = isMajor(id);
  const top = useCoinDuelists(major ? COIN_SYMBOLS.indexOf(id) : -1);
  const d = m.data;
  const duel = (side: 'long' | 'short') => router.push({ pathname: '/duel/amount', params: { id, side } });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: 120 }}>
        <Row style={{ gap: 10, marginBottom: 12 }}>
          <BackBtn onPress={() => router.back()} />
          <TokenArt symbol={d?.symbol ?? '?'} uri={d?.image} size={42} />
          <View style={{ flex: 1 }}>
            <Txt v="h2" lines={1}>{d?.symbol ?? '…'}</Txt>
            <Txt v="small" lines={1}>{d?.name ?? ''}{major ? '' : ` · ${id.slice(0, 4)}…${id.slice(-4)}`}</Txt>
          </View>
        </Row>
        {m.error ? <ErrorLine msg={`Market unavailable: ${m.error}`} onRetry={m.refresh} /> : null}
        <Row style={{ alignItems: 'flex-end', gap: 10, marginBottom: 10 }}>
          <Txt v="title" style={{ fontSize: 34 }}>{d ? fmtUsd(d.price) : '…'}</Txt>
          {d ? <View style={{ marginBottom: 6 }}><ChangePill pct={d.change24h} /></View> : null}
        </Row>
        <Row style={{ gap: 6, marginBottom: 12 }}>
          <Stat k="Market cap" v={d?.marketCap ? fmtUsd(d.marketCap, { compact: true }) : '–'} />
          <Stat k="24h vol" v={d?.volume24h ? fmtUsd(d.volume24h, { compact: true }) : '–'} />
          <Stat k="24h" v={d ? `${d.change24h >= 0 ? '+' : ''}${d.change24h.toFixed(1)}%` : '–'} />
        </Row>
        {major ? (
          <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <PriceChart data={candles.data ?? []} w={Math.min(width, 760) - S.gutter * 2} h={230} />
            <Txt v="small" color={candles.error ? C.down : C.muted} style={{ padding: 10, paddingTop: 0 }}>{candles.error ? `Chart unavailable: ${candles.error}` : 'Last 2 hours · 1m candles · Coinbase'}</Txt>
          </Card>
        ) : (
          <View style={{ marginBottom: 12 }}><Pending title="No chart for this coin" body="Live price and stats come from DexScreener, which has no candle history to show here. Charts are for SOL, BTC and ETH." /></View>
        )}
        {major ? (
          <>
            <Txt v="h2" style={{ marginBottom: 8 }}>Top duelists on {id}</Txt>
            {top.status === 'loading' ? <Txt v="small">Loading…</Txt> : top.status === 'error' ? <ErrorLine msg={top.error} /> : top.data.length === 0 ? (
              <Pending art={ART.duels} title={`No on-chain duels won on ${id} yet`} body={`Win a USDC duel when MagicBlock VRF rolls ${id} and you rank here.`} />
            ) : top.data.map((p, i) => (
              <Row key={p.owner.toBase58()} style={{ gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Txt v="label" color={C.muted} style={{ width: 20 }}>{i + 1}</Txt>
                <Avatar name={p.owner.toBase58()} size={34} />
                <Txt v="label" style={{ flex: 1 }} lines={1}>{p.owner.toBase58().slice(0, 4)}…{p.owner.toBase58().slice(-4)}</Txt>
                <Txt v="small">{p.wins}W {p.losses}L · +{p.won.toFixed(2)} USDC</Txt>
              </Row>
            ))}
          </>
        ) : null}
      </ScrollView>
      <Row style={{ position: 'absolute', left: S.gutter, right: S.gutter, bottom: insets.bottom + 12, gap: 10 }}>
        <Btn title="Duel with it · long" kind="long" style={{ flex: 1 }} onPress={() => duel('long')} disabled={!d} />
        <Btn title="Duel with it · short" kind="short" style={{ flex: 1 }} onPress={() => duel('short')} disabled={!d} />
      </Row>
    </View>
  );
}
