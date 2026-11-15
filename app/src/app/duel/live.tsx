// Live practice duel vs the market: real price ticks, a real knockout line, a 60 s bell.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLastPrice, isMajor } from '@/data/markets';
import { Btn, Card, ErrorLine, LiveDot, PriceChart, Row, Txt } from '@/ui/kit';
import { C, S, fmtUsd } from '@/ui/tokens';

const LEN = 60;

export default function Live() {
  const p = useLocalSearchParams<{ id: string; side: string; stake: string; lev: string; entry: string; symbol: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const side = p.side === 'short' ? 'short' : 'long';
  const stake = Number(p.stake), lev = Number(p.lev), entry = Number(p.entry);
  const ko = side === 'long' ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev);
  const [ticks, setTicks] = useState<number[]>([entry]);
  const [left, setLeft] = useState(LEN);
  const [err, setErr] = useState<string>();
  const done = useRef(false);

  const last = ticks[ticks.length - 1];
  const move = (last - entry) / entry;
  const pnlPct = (side === 'long' ? move : -move) * lev * 100;
  const pnl = (stake * pnlPct) / 100;
  const room = side === 'long' ? (last - ko) / last : (ko - last) / last;

  const finish = (reason: 'ko' | 'bell' | 'cash') => {
    if (done.current) return;
    done.current = true;
    Haptics.notificationAsync(reason === 'ko' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
    const final = reason === 'ko' ? -stake : Math.max(-stake, pnl);
    router.replace({ pathname: '/duel/result', params: { reason, pnl: String(final), id: p.id, symbol: p.symbol, side, lev: String(lev), secs: String(LEN - left), entry: String(entry), exit: String(last) } });
  };

  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const px = await fetchLastPrice(p.id);
        setErr(undefined);
        setTicks((t) => [...t.slice(-120), px]);
      } catch (e) { setErr((e as Error).message); }
    }, isMajor(p.id) ? 1000 : 3000);
    const clock = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => { clearInterval(iv); clearInterval(clock); };
  }, [p.id]);

  useEffect(() => { if ((side === 'long' && last <= ko) || (side === 'short' && last >= ko)) finish('ko'); });
  useEffect(() => { if (left <= 0) finish('bell'); });

  const up = pnl >= 0;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 6 }}><LiveDot /><Txt v="small" color={C.ink}>Practice · {p.symbol} · {lev}×</Txt></Row>
        <Txt v="small">vs the market</Txt>
      </Row>
      <View style={{ alignItems: 'center', marginTop: 18 }}>
        <Txt v="hero" color={left <= 10 ? C.down : C.ink} style={{ fontSize: 64 }}>0:{String(Math.max(0, left)).padStart(2, '0')}</Txt>
        <Txt v="small">until the bell</Txt>
      </View>
      <Card style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        <PriceChart data={ticks} w={width - S.gutter * 2} h={260} koYou={ko} />
        <Row style={{ justifyContent: 'space-between', padding: 10, paddingTop: 2 }}>
          <Txt v="small" color={C.brandSoft}>Your knockout {fmtUsd(ko)}</Txt>
          <Txt v="small" color={C.ink}>Now {fmtUsd(last)}</Txt>
        </Row>
      </Card>
      {err ? <ErrorLine msg={`Price feed: ${err}`} /> : null}
      <Row style={{ gap: 10, marginTop: 12 }}>
        <Card style={{ flex: 1 }}>
          <Txt v="small">You · {side}</Txt>
          <Txt v="title" color={up ? C.up : C.down} style={{ marginTop: 4 }}>{up ? '+' : '−'}{fmtUsd(Math.abs(pnl))}</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</Txt>
        </Card>
        <Card style={{ flex: 1 }}>
          <Txt v="small">Room to knockout</Txt>
          <Txt v="title" style={{ marginTop: 4 }}>{(Math.max(0, room) * 100).toFixed(2)}%</Txt>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: C.s2, marginTop: 8, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, Math.max(0, (room * lev) * 100))}%`, height: 6, backgroundColor: room * lev < 0.25 ? C.down : C.brand }} />
          </View>
        </Card>
      </Row>
      <View style={{ flex: 1 }} />
      <Btn title={`Cash out · ${up ? '+' : '−'}${fmtUsd(Math.abs(pnl))}`} kind="ghost" onPress={() => finish('cash')} />
    </View>
  );
}
