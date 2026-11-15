import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { ART, Art, Btn, Card, Row, Txt } from '@/ui/kit';
import { C, S, fmtUsd } from '@/ui/tokens';

export default function Result() {
  const p = useLocalSearchParams<{ id: string; reason: string; pnl: string; symbol: string; side: string; lev: string; secs: string; entry: string; exit: string; rival?: string; rivalPct?: string; myPct?: string }>();
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const pnl = Number(p.pnl);
  const hasRival = p.rival !== undefined && p.rivalPct !== undefined && p.myPct !== undefined;
  const myPct = Number(p.myPct ?? 0), rPct = Number(p.rivalPct ?? 0);
  // practice duels are won against the rival coin's leveraged %, not just by being green
  const won = p.reason !== 'ko' && (hasRival ? myPct > rPct : pnl > 0);
  const flat = p.reason !== 'ko' && (hasRival ? Math.abs(myPct - rPct) < 0.05 : Math.abs(pnl) < 0.005);
  const title = p.reason === 'ko' ? 'Knocked out.' : flat ? 'Dead heat.' : won ? 'You won.' : 'You lost.';
  const s = useSharedValue(0.6);
  useEffect(() => { s.value = withSpring(1, { damping: 9, stiffness: 140 }); }, [s]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 40, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 10 }}>
      <Animated.View style={[{ alignItems: 'center' }, pop]}>
        <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
          {won ? <View style={{ position: 'absolute', top: -40 }}><Art src={ART.confetti} size={240} radius={0} /></View> : null}
          <View style={{ opacity: won || flat ? 1 : 0.8 }}><Art src={p.reason === 'ko' || (!won && !flat) ? ART.koSkull : flat ? ART.draw : ART.winTrophy} size={180} radius={0} /></View>
        </View>
        <Txt v="small" style={{ marginTop: 18 }}>{p.reason === 'ko' ? 'Knockout' : p.reason === 'cash' ? 'Cashed out' : 'Bell'} · {p.secs}s · practice</Txt>
        <Txt v="title" style={{ fontSize: 44, marginTop: 6 }}>{title}</Txt>
        {hasRival && p.reason !== 'ko' ? (
          <>
            <Txt v="title" color={flat ? C.muted : won ? C.up : C.down} style={{ fontSize: 40, marginTop: 4 }}>{myPct - rPct >= 0 ? '+' : '−'}{Math.abs(myPct - rPct).toFixed(1)}% vs {p.rival}</Txt>
            <Txt v="small" style={{ marginTop: 4 }}>Practice P&L {pnl >= 0 ? '+' : '−'}{fmtUsd(Math.abs(pnl))} · no money moved</Txt>
          </>
        ) : (
          <Txt v="title" color={flat ? C.muted : pnl > 0 ? C.up : C.down} style={{ fontSize: 40, marginTop: 4 }}>{flat ? '' : pnl > 0 ? '+' : '−'}{fmtUsd(Math.abs(pnl))}</Txt>
        )}
      </Animated.View>
      <Row style={{ gap: 8, marginTop: 26 }}>
        {[['Side', `${p.side} ${p.lev}×`], ['Entry', fmtUsd(Number(p.entry))], ['Exit', fmtUsd(Number(p.exit))]].map(([k, v]) => (
          <Card key={k} style={{ flex: 1, alignItems: 'center' }}><Txt v="num">{v}</Txt><Txt v="small">{k}</Txt></Card>
        ))}
      </Row>
      {hasRival ? (
        <Row style={{ gap: 8, marginTop: 10 }}>
          <Card style={{ flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: won ? C.brand : 'transparent' }}><Txt v="num" color={myPct >= 0 ? C.up : C.down}>{myPct >= 0 ? '+' : ''}{myPct.toFixed(1)}%</Txt><Txt v="small">You · {p.symbol}</Txt></Card>
          <Card style={{ flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: !won && !flat && p.reason !== 'ko' ? C.opp : 'transparent' }}><Txt v="num" color={rPct >= 0 ? C.up : C.down}>{rPct >= 0 ? '+' : ''}{rPct.toFixed(1)}%</Txt><Txt v="small">Rival coin · {p.rival}</Txt></Card>
        </Row>
      ) : null}
      <Card style={{ marginTop: 10 }}><Txt v="small" style={{ lineHeight: 18 }}>Practice duels race your pick against a rival coin on live prices, with no money. Real duels are against people and settle a pot between two players on Solana via a MagicBlock rollup.</Txt></Card>
      <View style={{ flex: 1 }} />
      <Btn title="Duel again" kind="white" onPress={() => router.replace({ pathname: '/duel/amount', params: { id: p.id ?? 'SOL' } })} />
      <Btn title="Back to home" kind="ghost" style={{ marginTop: 10 }} onPress={() => router.dismissTo('/')} />
    </View>
  );
}
