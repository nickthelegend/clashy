// The card under a call on any market (a token, a memecoin, a perp): its real logo, where it trades, the live price
// and 24h move, and a way into it. Stash-stock calls keep PositionCard (feed.tsx), which shows the author's real shares.
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { tradeShownPct, type TradeTag } from '@/chain/calls';
import { VENUES, fmtPrice, kindLabel, resolveMarket, signedPct, usePrices, type Market } from '@/chain/practice';
import { Row, Txt } from './kit';
import { MarketLogo } from './practice-kit';
import { C, FONT } from './tokens';

const cache = new Map<string, Market | null>();
export function useMarket(id: string | null) {
  const [m, setM] = useState<Market | null | undefined>(id ? cache.get(id) : undefined);
  useEffect(() => {
    if (!id) return;
    if (cache.has(id)) { setM(cache.get(id)); return; }
    let alive = true;
    resolveMarket(id).then((x) => { cache.set(id, x); if (alive) setM(x); }).catch(() => alive && setM(null));
    return () => { alive = false; };
  }, [id]);
  return m;
}

/** The trade a call carries: side and leverage, entry and exit (or the live price), and its move on the margin. */
export function TradeStrip({ t, m, now, hint }: { t: TradeTag; m?: Market; now?: number; hint?: boolean }) {
  const { pct, net } = tradeShownPct(t, now);
  const spot = m && m.kind !== 'perp' && t.lev === 1;
  const color = pct === undefined ? C.muted : pct >= 0 ? C.up : C.down;
  const what = spot ? (t.exit ? 'Sold' : 'Holding') : `${t.side === 'long' ? 'Long' : 'Short'} ${t.lev}x`;
  return (
    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1F1F26' }}>
      <Row style={{ gap: 8 }}>
        <View style={{ backgroundColor: spot ? C.s2 : t.side === 'long' ? C.upBg : C.downBg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Txt v="small" color={spot ? C.ink : t.side === 'long' ? C.up : C.down} style={{ ...FONT.semi, fontSize: 12 }}>{what}</Txt>
        </View>
        <Txt v="small" color={C.ink} style={{ fontSize: 12.5 }}>${t.margin.toLocaleString('en-US', { maximumFractionDigits: 2 })} in</Txt>
        <View style={{ flex: 1 }} />
        <Txt v="label" color={color} style={{ fontSize: 15, fontVariant: ['tabular-nums'] }}>{pct === undefined ? '…' : signedPct(pct)}</Txt>
      </Row>
      <Txt v="small" lines={1} style={{ fontSize: 12, marginTop: 5, fontVariant: ['tabular-nums'] }}>
        {t.exit ? `Entry ${fmtPrice(t.entry)} → exit ${fmtPrice(t.exit)}` : `Entry ${fmtPrice(t.entry)} · now ${now ? fmtPrice(now) : '…'}`} · {net ? 'after fees' : 'before fees'}
      </Txt>
      <Row style={{ marginTop: 2, gap: 8 }}>
        <Txt v="small" color={C.dim} style={{ fontSize: 11, flex: 1 }} lines={1}>Practice trade · paper money</Txt>
        {hint ? <Txt v="small" color={C.brandSoft} style={{ fontSize: 12, ...FONT.semi }}>Chart and details ›</Txt> : null}
      </Row>
    </View>
  );
}

export function MarketCallCard({ id, trade, seq }: { id: string; trade?: TradeTag | null; seq?: number }) {
  const m = useMarket(id);
  const { prices } = usePrices(m ? [m.mint] : [], 15_000);
  const px = m ? prices[m.mint] : undefined;
  const ch = px?.change24h ?? m?.change24h;
  if (m === null) return null;
  return (
    <Pressable onPress={() => m && router.push((trade && seq !== undefined ? `/trade/${seq}` : `/practice/${m.id}`) as Href)} disabled={!m} accessibilityRole="button" accessibilityLabel={m ? (trade && seq !== undefined ? `Open the ${m.symbol} trade` : `Open ${m.name}`) : 'Market'}
      style={({ pressed }) => ({ marginTop: 10, padding: 12, borderRadius: 18, backgroundColor: pressed ? '#1A1A20' : '#121216' })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {m ? <MarketLogo m={m} size={40} /> : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.s2 }} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{m ? (m.kind === 'perp' ? m.symbol : m.name) : '…'}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 1 }}>
          {!m ? 'Reading the market' : m.kind === 'perp' ? `${VENUES[m.venue ?? 'jupiter'].name} perp · up to ${m.maxLev}x` : `${m.symbol} · ${kindLabel[m.kind].toLowerCase()}`}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt v="num" lines={1}>{px ? fmtPrice(px.usdPrice) : m?.price !== undefined ? fmtPrice(m.price) : '…'}</Txt>
        {ch !== undefined ? <Txt v="small" color={ch >= 0 ? C.up : C.down} style={{ fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{signedPct(ch)} 24h</Txt> : null}
      </View>
      <Row><Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt></Row>
      </View>
      {trade ? <TradeStrip t={trade} m={m} now={px?.usdPrice} hint={seq !== undefined} /> : null}
    </Pressable>
  );
}
