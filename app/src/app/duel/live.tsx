// Live practice duel (style K5 race + K2 HP bars). Both lines race from 0% on the same clock.
// Practice has no human opponent yet: your pick races a rival coin on its live price, same side and leverage.
// Real 1v1 duels against people open with the on-chain program at the Blitz kickoff.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { MAJORS, fetchLastPrice, isMajor } from '@/data/markets';
import { Avatar, BackBtn, Btn, ErrorLine, LiveDot, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

const LEN = 60;
const pick = (id: string) => (id === 'BTC' ? 'ETH' : 'BTC');

/** One HP bar, skewed like a fighting game. Fills from the outside in. */
const Hp = ({ v, color, flip }: { v: number; color: string; flip?: boolean }) => (
  <View style={{ flex: 1, height: 16, borderRadius: 4, backgroundColor: C.s2, overflow: 'hidden', transform: [{ skewX: flip ? '14deg' : '-14deg' }], flexDirection: flip ? 'row-reverse' : 'row' }}>
    <View style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, backgroundColor: v < 0.25 ? C.down : color }} />
  </View>
);

export default function Live() {
  const p = useLocalSearchParams<{ id: string; side: string; stake: string; lev: string; entry: string; symbol: string }>();
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(980);
  const { desk } = useLayout();
  const { width, height } = useWindowDimensions();
  const side = p.side === 'short' ? 'short' : 'long';
  const dir = side === 'long' ? 1 : -1;
  const stake = Number(p.stake), lev = Number(p.lev), entry = Number(p.entry);
  const rivalId = pick(p.id);
  const rival = MAJORS.find((m) => m.id === rivalId)!;
  const me = MAJORS.find((m) => m.id === p.id);

  const [mine, setMine] = useState<number[]>([entry]);
  const [theirs, setTheirs] = useState<number[]>([]);
  const [left, setLeft] = useState(LEN);
  const [err, setErr] = useState<string>();
  const done = useRef(false);

  const last = mine[mine.length - 1];
  const myPct = ((last - entry) / entry) * dir * lev * 100; // leveraged % on stake
  const rEntry = theirs[0], rLast = theirs[theirs.length - 1];
  const rPct = rEntry ? ((rLast - rEntry) / rEntry) * dir * lev * 100 : 0;
  const myHp = 1 + myPct / 100; // 0 = knocked out (−100% of stake)
  const rHp = 1 + rPct / 100;
  const pnl = (stake * myPct) / 100;

  const finish = (reason: 'ko' | 'bell' | 'cash') => {
    if (done.current) return;
    done.current = true;
    Haptics.notificationAsync(reason === 'ko' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
    const final = reason === 'ko' ? -stake : Math.max(-stake, pnl);
    router.replace({ pathname: '/duel/result', params: { reason, pnl: String(final), id: p.id, symbol: p.symbol, side, lev: String(lev), secs: String(LEN - left), entry: String(entry), exit: String(last), rival: rivalId, rivalPct: rPct.toFixed(2), myPct: myPct.toFixed(2) } });
  };

  useEffect(() => {
    const poll = async () => {
      try {
        const [a, b] = await Promise.all([fetchLastPrice(p.id), fetchLastPrice(rivalId)]);
        setErr(undefined);
        setMine((t) => [...t.slice(-150), a]);
        setTheirs((t) => (t.length ? [...t.slice(-150), b] : [b]));
      } catch (e) { setErr((e as Error).message); }
    };
    poll();
    const iv = setInterval(poll, isMajor(p.id) ? 1000 : 3000);
    const clock = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => { clearInterval(iv); clearInterval(clock); };
  }, [p.id, rivalId]);

  useEffect(() => { if (myHp <= 0) finish('ko'); });
  useEffect(() => { if (left <= 0) finish('bell'); });

  // race chart: both series as leveraged % from 0, same scale
  const W = Math.min(width, desk ? 980 : 560) - S.gutter * 2 - (desk ? 340 : 0);
  const H = Math.max(260, Math.min(desk ? 460 : 420, height - 430));
  const a = mine.map((v) => ((v - entry) / entry) * dir * lev * 100);
  const b = theirs.map((v) => ((v - rEntry) / rEntry) * dir * lev * 100);
  // auto-scale around both lines (at least ±2% so a quiet market still reads), x fills over the 60 s clock
  const mn = Math.min(0, ...a, ...b), mx = Math.max(0, ...a, ...b), span = Math.max(4, mx - mn);
  const lo = mn - span * 0.35, hi = mx + span * 0.25;
  const n = Math.max(a.length, b.length, (LEN * 1000) / (isMajor(p.id) ? 1000 : 3000) + 1);
  const X = (i: number) => 8 + (i / (n - 1)) * (W - 56);
  const Y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (H - 20);
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const tip = (s: number[]) => ({ x: X(Math.max(0, s.length - 1)), y: Y(s[s.length - 1] ?? 0) });
  const ta = tip(a), tb = tip(b);
  const lead = myPct - rPct;

  const head = (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <BackBtn onPress={() => finish('cash')} />
        <Row style={{ gap: 6 }}><LiveDot /><Txt v="small" color={C.ink}>Practice · {lev}× {side}</Txt></Row>
        <Txt v="small">${stake} stake</Txt>
      </Row>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Avatar name="you" size={50} ring={C.brand} />
          <Txt v="label" style={{ marginTop: 6 }}>You</Txt>
          <Row style={{ gap: 5 }}><TokenArt symbol={p.symbol} uri={me?.image} size={14} /><Txt v="small">{p.symbol}</Txt></Row>
        </View>
        <View style={{ alignItems: 'center', paddingTop: 2 }}>
          <Txt v="hero" color={left <= 10 ? C.down : C.ink} style={{ fontSize: 46, lineHeight: 50 }}>{Math.max(0, left)}</Txt>
          <Txt v="small" style={{ fontSize: 10.5, letterSpacing: 1 }}>SEC</Txt>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <View style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 2.5, borderColor: C.opp, alignItems: 'center', justifyContent: 'center', backgroundColor: C.s1 }}><TokenArt symbol={rivalId} uri={rival.image} size={36} /></View>
          <Txt v="label" style={{ marginTop: 6 }}>Rival coin</Txt>
          <Txt v="small">{rivalId} · same {side}</Txt>
        </View>
      </Row>
      <Row style={{ gap: 10, marginTop: 12 }}><Hp v={myHp} color={C.brand} /><Hp v={rHp} color={C.opp} flip /></Row>
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <Txt v="small" color={myPct >= 0 ? C.up : C.down}>{myPct >= 0 ? '+' : ''}{myPct.toFixed(1)}%</Txt>
        <Txt v="small" color={C.muted}>HP = distance to your knockout</Txt>
        <Txt v="small" color={rPct >= 0 ? C.up : C.down}>{rPct >= 0 ? '+' : ''}{rPct.toFixed(1)}%</Txt>
      </Row>
    </View>
  );

  const race = (
    <View style={{ width: W, height: H, marginTop: 14, borderRadius: 18, backgroundColor: C.s1, overflow: 'hidden' }}>
      <Svg width={W} height={H}>
        <Defs><LinearGradient id="koz" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={C.down} stopOpacity={0} /><Stop offset="1" stopColor={C.down} stopOpacity={0.22} /></LinearGradient></Defs>
        <Rect x={0} y={H * 0.68} width={W} height={H * 0.32} fill="url(#koz)" />
        <Line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="#2A2A30" strokeDasharray="3 5" />
        <SvgText x={W - 30} y={Y(0) - 6} fill={C.dim} fontSize={10} fontFamily={F.medium}>0%</SvgText>
        {b.length > 1 ? <><Path d={path(b)} stroke={C.opp} strokeOpacity={0.25} strokeWidth={9} fill="none" strokeLinejoin="round" /><Path d={path(b)} stroke={C.opp} strokeWidth={3} fill="none" strokeLinejoin="round" /></> : null}
        {a.length > 1 ? <><Path d={path(a)} stroke={C.brand} strokeOpacity={0.3} strokeWidth={10} fill="none" strokeLinejoin="round" /><Path d={path(a)} stroke={C.brand} strokeWidth={3.2} fill="none" strokeLinejoin="round" /></> : null}
      </Svg>
      <Txt v="small" color="#FF6B60" style={{ position: 'absolute', left: 10, bottom: 8, fontFamily: F.bold, fontSize: 10.5, letterSpacing: 1 }}>KO ZONE</Txt>
      {b.length ? <View style={{ position: 'absolute', left: tb.x - 15, top: tb.y - 15, width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, borderColor: C.opp, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><TokenArt symbol={rivalId} uri={rival.image} size={20} /></View> : null}
      <View style={{ position: 'absolute', left: ta.x - 17, top: ta.y - 17 }}><Avatar name="you" size={34} ring={C.brand} /></View>
    </View>
  );

  const actions = (
    <View style={{ gap: 10, width: desk ? 320 : undefined }}>
      <View style={{ backgroundColor: C.s1, borderRadius: 18, padding: 14, alignItems: 'center' }}>
        <Txt v="small">{lead >= 0 ? 'You lead by' : 'You trail by'}</Txt>
        <Txt v="hero" color={lead >= 0 ? C.up : C.down} style={{ fontSize: 40 }}>{lead >= 0 ? '+' : '−'}{Math.abs(lead).toFixed(1)}%</Txt>
        <Txt v="small" style={{ textAlign: 'center' }}>Best % at the bell wins. Hit your knockout and you are out.</Txt>
      </View>
      {err ? <ErrorLine msg={`Price feed: ${err}`} /> : null}
      <Btn title={`Cash out · ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(2)}`} kind="white" h={56} onPress={() => finish('cash')} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 12 }}>
      {head}
      <View style={{ flexDirection: desk ? 'row' : 'column', gap: 14, flex: 1, alignItems: desk ? 'flex-start' : undefined }}>
        {race}
        <View style={{ flex: desk ? undefined : 1, justifyContent: 'flex-end', marginTop: desk ? 14 : 12 }}>{actions}</View>
      </View>
    </View>
  );
}
