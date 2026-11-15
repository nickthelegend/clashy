import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { ART, Art, Btn, Card, Row, Txt } from '@/ui/kit';
import { C, S, fmtUsd } from '@/ui/tokens';

export default function Result() {
  const p = useLocalSearchParams<{ id: string; reason: string; pnl: string; symbol: string; side: string; lev: string; secs: string; entry: string; exit: string }>();
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const pnl = Number(p.pnl);
  const won = pnl > 0 && p.reason !== 'ko';
  const flat = Math.abs(pnl) < 0.005 && p.reason !== 'ko';
  const title = p.reason === 'ko' ? 'Knocked out.' : flat ? 'Break even.' : won ? 'You won.' : 'You lost.';
  const s = useSharedValue(0.6);
  useEffect(() => { s.value = withSpring(1, { damping: 9, stiffness: 140 }); }, [s]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 40, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 10 }}>
      <Animated.View style={[{ alignItems: 'center' }, pop]}>
        <View style={{ opacity: won ? 1 : 0.55 }}><Art src={p.reason === 'ko' ? ART.ko : ART.crown} size={180} radius={36} /></View>
        <Txt v="small" style={{ marginTop: 18 }}>{p.reason === 'ko' ? 'Knockout' : p.reason === 'cash' ? 'Cashed out' : 'Bell'} · {p.secs}s · practice</Txt>
        <Txt v="title" style={{ fontSize: 44, marginTop: 6 }}>{title}</Txt>
        <Txt v="title" color={flat ? C.muted : pnl > 0 ? C.up : C.down} style={{ fontSize: 40, marginTop: 4 }}>{flat ? '' : pnl > 0 ? '+' : '−'}{fmtUsd(Math.abs(pnl))}</Txt>
      </Animated.View>
      <Row style={{ gap: 8, marginTop: 26 }}>
        {[['Side', `${p.side} ${p.lev}×`], ['Entry', fmtUsd(Number(p.entry))], ['Exit', fmtUsd(Number(p.exit))]].map(([k, v]) => (
          <Card key={k} style={{ flex: 1, alignItems: 'center' }}><Txt v="num">{v}</Txt><Txt v="small">{k}</Txt></Card>
        ))}
      </Row>
      <Card style={{ marginTop: 10 }}><Txt v="small" style={{ lineHeight: 18 }}>Practice duels use the live {p.symbol} price and no money. Real duels settle a pot between two players on Solana via a MagicBlock rollup.</Txt></Card>
      <View style={{ flex: 1 }} />
      <Btn title="Duel again" kind="white" onPress={() => router.replace({ pathname: '/duel/amount', params: { id: p.id ?? 'SOL' } })} />
      <Btn title="Back to home" kind="ghost" style={{ marginTop: 10 }} onPress={() => router.dismissTo('/')} />
    </View>
  );
}
