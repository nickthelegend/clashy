import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { CountUp, FX, Hit, Shake, WinBurst } from '@/ui/fx';
import { ART, Btn, Card, Row, Txt } from '@/ui/kit';
import { C, F, S, fmtUsd } from '@/ui/tokens';

export default function Result() {
  const p = useLocalSearchParams<{ id: string; reason: string; pnl: string; symbol: string; side: string; lev: string; secs: string; entry: string; exit: string; rival?: string; rivalPct?: string; myPct?: string; mode?: string; streak?: string; stake?: string }>();
  const quick = p.mode === 'quick';
  const streak = Number(p.streak ?? 0);
  const stake = Number(p.stake ?? 20);
  const [bestStreak, setBestStreak] = useState(0);
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const pnl = Number(p.pnl);
  const hasRival = p.rival !== undefined && p.rivalPct !== undefined && p.myPct !== undefined;
  const myPct = Number(p.myPct ?? 0), rPct = Number(p.rivalPct ?? 0);
  // practice duels are won against the rival coin's leveraged %, not just by being green
  const won = p.reason === 'theirko' || (p.reason !== 'ko' && (hasRival ? myPct > rPct : pnl > 0));
  const flat = p.reason !== 'ko' && p.reason !== 'theirko' && (hasRival ? Math.abs(myPct - rPct) < 0.05 : Math.abs(pnl) < 0.005);
  const title = p.reason === 'ko' ? 'Knocked out.' : p.reason === 'theirko' ? 'KO! You won.' : flat ? 'Dead heat.' : won ? 'You won.' : 'You lost.';
  const s = useSharedValue(0.6);
  useEffect(() => { s.value = withSpring(1, { damping: 9, stiffness: 140 }); }, [s]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  useEffect(() => {
    AsyncStorage.getItem('clashy:don:best').then((v) => {
      const b = Number(v ?? 0); setBestStreak(b);
      if (quick && won && streak + 1 > b) AsyncStorage.setItem('clashy:don:best', String(streak + 1)).catch(() => {});
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [hit, setHit] = useState(0); // shake the skull once it lands
  useEffect(() => { const h = setTimeout(() => setHit(1), 380); return () => clearTimeout(h); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 16, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 10 }}>
      <Animated.View style={[{ alignItems: 'center' }, pop]}>
        {won ? <WinBurst src={ART.winTrophy} size={180} /> : (
          <Shake trigger={hit} style={{ width: 252, height: 216, alignItems: 'center', justifyContent: 'center' }}>
            <WinBurst src={p.reason === 'ko' || !flat ? ART.koSkull : ART.draw} size={170} burst={false} />
          </Shake>
        )}
        <Txt v="small" style={{ marginTop: 6 }}>{p.reason === 'ko' ? 'Knockout' : p.reason === 'theirko' ? 'Rival knocked out' : p.reason === 'cash' ? 'Cashed out' : 'Bell'} · {p.secs}s · {quick ? `quick match on ${p.symbol}` : 'coin clash'} · practice</Txt>
        <Txt v="title" style={{ fontSize: 44, marginTop: 6 }}>{title}</Txt>
        {hasRival && p.reason !== 'ko' ? (
          <>
            <CountUp to={Math.abs(myPct - rPct)} ms={1100} format={(v) => `${myPct - rPct >= 0 ? '+' : '−'}${v.toFixed(1)}% ${quick ? 'vs your rival' : `vs ${p.rival}`}`} style={{ fontFamily: F.bold, fontSize: quick ? 32 : 40, letterSpacing: -1.2, textAlign: 'center', color: flat ? C.muted : won ? C.up : C.down, marginTop: 4 }} />
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
          <Card style={{ flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: !won && !flat && p.reason !== 'ko' ? C.opp : 'transparent' }}><Txt v="num" color={rPct >= 0 ? C.up : C.down}>{rPct >= 0 ? '+' : ''}{rPct.toFixed(1)}%</Txt><Txt v="small">{quick ? 'Practice rival' : `Rival coin · ${p.rival}`}</Txt></Card>
        </Row>
      ) : null}
      <Card style={{ marginTop: 10 }}><Txt v="small" style={{ lineHeight: 18 }}>{quick ? 'Practice quick match: one rolled coin, a practice rival on the other side, live prices, no money. Real quick matches pair you with a person, roll the coin with MagicBlock VRF and settle the pot on Solana.' : 'Practice coin clash: your coin races a rival coin on live prices, with no money. Real clashes are against people and settle the pot on Solana via a MagicBlock rollup.'}</Txt></Card>
      <View style={{ flex: 1 }} />
      {quick && won ? (
        <Animated.View entering={FadeInDown.delay(500).springify().damping(13)} style={{ borderRadius: 22, padding: 14, marginBottom: 10, backgroundColor: '#1A1206', borderWidth: 1.5, borderColor: 'rgba(255,201,74,0.5)' }}>
          <Row style={{ gap: 10 }}>
            <Image source={FX.fire} style={{ width: 40, height: 40 }} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Txt v="label" color="#FFC94A">Double or Nothing</Txt>
              <Txt v="small">Streak {streak + 1}. Roll the whole pot into the next duel: win and it doubles, lose and the streak is gone.</Txt>
            </View>
          </Row>
          <Row style={{ gap: 5, marginTop: 10 }}>
            {[1, 2, 3, 4, 5].map((k) => (
              <View key={k} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: k <= streak + 1 ? 'rgba(255,201,74,0.22)' : C.s1 }}>
                <Txt v="label" color={k <= streak + 1 ? '#FFC94A' : C.dim}>×{2 ** k}</Txt>
                <Txt v="small" style={{ fontSize: 10 }}>{'$' + stake * 2 ** k}</Txt>
              </View>
            ))}
          </Row>
          <Btn title={'Double or nothing · $' + stake * 2 + ' pot'} kind="white" style={{ marginTop: 10 }} onPress={() => router.replace({ pathname: '/duel/match', params: { stake: String(stake * 2), streak: String(streak + 1) } })} />
          <Txt v="small" style={{ textAlign: 'center', marginTop: 6 }}>Practice amounts · best streak {Math.max(bestStreak, streak + 1)}</Txt>
        </Animated.View>
      ) : null}
      <Btn title={quick && won ? 'Bank it · new duel' : 'Duel again'} kind={quick && won ? 'ghost' : 'white'} onPress={() => (quick ? router.replace('/duel/match') : router.replace({ pathname: '/duel/amount', params: { id: p.id ?? 'SOL' } }))} />
      <Btn title="Back to home" kind="ghost" style={{ marginTop: 10 }} onPress={() => router.dismissTo('/')} />
      <Hit k={p.reason === 'ko' || p.reason === 'theirko' ? 1 : 0} src={FX.ko} />
    </View>
  );
}
