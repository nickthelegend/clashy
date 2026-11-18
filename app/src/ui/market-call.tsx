// The card under a call on any market (a token, a memecoin, a perp): its real logo, where it trades, the live price
// and 24h move, and a way into it. Stash-stock calls keep PositionCard (feed.tsx), which shows the author's real shares.
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { VENUES, fmtPrice, kindLabel, resolveMarket, signedPct, usePrices, type Market } from '@/chain/practice';
import { Row, Txt } from './kit';
import { MarketLogo } from './practice-kit';
import { C } from './tokens';

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

export function MarketCallCard({ id }: { id: string }) {
  const m = useMarket(id);
  const { prices } = usePrices(m ? [m.mint] : [], 15_000);
  const px = m ? prices[m.mint] : undefined;
  const ch = px?.change24h ?? m?.change24h;
  if (m === null) return null;
  return (
    <Pressable onPress={() => m && router.push(`/practice/${m.id}` as Href)} disabled={!m} accessibilityRole="button" accessibilityLabel={m ? `Open ${m.name}` : 'Market'}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 12, borderRadius: 16, backgroundColor: pressed ? C.s1 : C.card })}>
      {m ? <MarketLogo m={m} size={38} /> : <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.s2 }} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{m ? (m.kind === 'perp' ? m.symbol : m.name) : '…'}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 1 }}>
          {!m ? 'Reading the market' : m.kind === 'perp' ? `${VENUES[m.venue ?? 'jupiter'].name} perp · up to ${m.maxLev}x` : `${m.symbol} · ${kindLabel[m.kind].toLowerCase()}`}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt v="num" lines={1}>{px ? fmtPrice(px.usdPrice) : m?.price !== undefined ? fmtPrice(m.price) : '…'}</Txt>
        {ch !== undefined ? <Txt v="small" color={ch >= 0 ? C.up : C.down} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>{signedPct(ch)} 24h</Txt> : null}
      </View>
      <Row><Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt></Row>
    </Pressable>
  );
}
