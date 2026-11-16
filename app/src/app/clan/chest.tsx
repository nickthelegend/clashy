// Clan Chest: trading as a group. Members propose a trade on the clan pot, the clan votes, a captain executes it on
// the live price, and everyone watches the chest move together. Practice now (on this device, you are the only
// voter and captain); on chain it is the clan vault with proposals voted on a MagicBlock rollup.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pnlOf, useChest, type Side } from '@/data/chest';
import { MAJORS, useMajors } from '@/data/markets';
import { Bob, CountUp, Fill } from '@/ui/fx';
import { ART, Art, BackBtn, Btn, Card, Chips, Row, TokenArt, Txt, UnderTabs } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

type Tab = 'votes' | 'open' | 'history';
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ClanChest() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(900);
  const { desk } = useLayout();
  const majors = useMajors();
  const price = (id: string) => majors.data?.find((m) => m.id === id)?.price;
  const { chest, propose, vote, execute, drop, close, reset } = useChest();
  const [confirmReset, setConfirmReset] = useState(false);
  const [tab, setTab] = useState<Tab>('votes');
  const [coin, setCoin] = useState('SOL');
  const [side, setSide] = useState<Side>('long');
  const [pct, setPct] = useState(25);
  const [lev, setLev] = useState(5);
  const [composing, setComposing] = useState(false);

  if (!chest) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const openPnl = chest.open.reduce((s, p) => s + (price(p.coin) ? pnlOf(p, price(p.coin)!) : 0), 0);
  const inPositions = chest.open.reduce((s, p) => s + p.margin, 0);
  const value = chest.cash + inPositions + openPnl;
  const ret = ((value - chest.start) / chest.start) * 100;

  const composer = (
    <Animated.View entering={FadeInDown.springify().damping(14)} exiting={FadeOut.duration(150)}>
      <Card style={{ padding: 14, gap: 10 }}>
        <Txt v="label">New proposal</Txt>
        <Row style={{ gap: 8 }}>{MAJORS.map((m) => <Btn key={m.id} title={m.id} h={36} kind={coin === m.id ? 'white' : 'ghost'} style={{ flex: 1 }} icon={<TokenArt symbol={m.id} uri={m.image} size={16} />} onPress={() => setCoin(m.id)} />)}</Row>
        <Row style={{ gap: 8 }}>
          <Btn title="Long ▲" kind={side === 'long' ? 'long' : 'ghost'} h={40} style={{ flex: 1 }} onPress={() => setSide('long')} />
          <Btn title="Short ▼" kind={side === 'short' ? 'short' : 'ghost'} h={40} style={{ flex: 1 }} onPress={() => setSide('short')} />
        </Row>
        <View><Txt v="small" style={{ marginBottom: 6 }}>Size · share of the chest</Txt><Chips items={[10, 25, 50].map((v) => ({ key: String(v), label: `${v}%` }))} value={String(pct)} onChange={(k) => setPct(Number(k))} /></View>
        <View><Txt v="small" style={{ marginBottom: 6 }}>Leverage</Txt><Chips items={[2, 5, 10].map((v) => ({ key: String(v), label: `${v}×` }))} value={String(lev)} onChange={(k) => setLev(Number(k))} /></View>
        <Btn title={`Propose ${side} ${coin} · ${pct}% · ${lev}×`} kind="white" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); propose(coin, side, pct, lev); setComposing(false); setTab('votes'); }} />
      </Card>
    </Animated.View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 28 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Practice chest</Txt><Txt v="small">Trade together · no money · the pot only moves by vote</Txt></View>
        <Btn title={confirmReset ? 'Tap again to wipe' : 'Reset'} kind={confirmReset ? 'short' : 'ghost'} h={32} onPress={() => {
          if (confirmReset) { reset(); setConfirmReset(false); return; }
          setConfirmReset(true);
          setTimeout(() => setConfirmReset(false), 3000);
        }} />
      </Row>

      {/* the chest */}
      <View style={{ borderRadius: 26, padding: 18, backgroundColor: '#12100A', borderWidth: 1.5, borderColor: 'rgba(255,201,74,0.35)', flexDirection: desk ? 'row' : 'column', alignItems: 'center', gap: 16 }}>
        <Bob amp={6} ms={1500}><Art src={ART.tileWar} size={desk ? 150 : 130} radius={0} /></Bob>
        <View style={{ flex: 1, alignItems: desk ? 'flex-start' : 'center' }}>
          <Txt v="small" style={{ fontFamily: F.semi, letterSpacing: 1, fontSize: 11 }}>PRACTICE CLAN CHEST</Txt>
          <CountUp to={value} ms={700} format={(v) => money(v)} style={{ fontFamily: F.bold, fontSize: 42, letterSpacing: -1.5, color: C.ink }} />
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: ret >= 0 ? C.up : C.down }}>{ret >= 0 ? '+' : ''}{ret.toFixed(2)}% since the chest opened</Text>
          <Row style={{ gap: 16, marginTop: 10 }}>
            <View><Txt v="small">Cash</Txt><Txt v="label">{money(chest.cash)}</Txt></View>
            <View><Txt v="small">In trades</Txt><Txt v="label">{money(inPositions)}</Txt></View>
            <View><Txt v="small">Open P&L</Txt><Txt v="label" color={openPnl >= 0 ? C.up : C.down}>{money(openPnl)}</Txt></View>
          </Row>
        </View>
      </View>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Practice money on live Coinbase prices · just you on this device · the real USDC clan chest is in Clans</Txt>

      <View style={{ marginTop: 16 }}>
        {composing ? composer : <Btn title="Propose a trade" h={52} onPress={() => setComposing(true)} />}
      </View>

      <View style={{ marginTop: 16, marginBottom: 10 }}>
        <UnderTabs items={[{ key: 'votes', label: `Votes · ${chest.proposals.length}` }, { key: 'open', label: `Open · ${chest.open.length}` }, { key: 'history', label: 'History' }]} value={tab} onChange={setTab} />
      </View>

      {tab === 'votes' ? (
        chest.proposals.length === 0 ? <Card style={{ alignItems: 'center', padding: 18 }}><Art src={ART.emptyChats} size={80} radius={0} /><Txt v="label" style={{ marginTop: 6 }}>No proposals yet</Txt><Txt v="small" style={{ textAlign: 'center', marginTop: 2 }}>Any member can propose a trade on the chest. It needs more yes than no, then a captain executes it.</Txt></Card> : (
          chest.proposals.map((p) => {
            const passed = p.yes > p.no;
            const px = price(p.coin);
            return (
              <Animated.View key={p.id} layout={LinearTransition} entering={FadeInDown.springify().damping(14)} exiting={FadeOut.duration(150)}>
                <Card style={{ padding: 14, marginBottom: 10 }}>
                  <Row style={{ gap: 10 }}>
                    <TokenArt symbol={p.coin} uri={MAJORS.find((m) => m.id === p.coin)?.image} size={34} />
                    <View style={{ flex: 1 }}><Txt v="label">{p.side === 'long' ? 'Long' : 'Short'} {p.coin} · {p.pct}% · {p.lev}×</Txt><Txt v="small">Proposed by {p.by} · {px ? `now ${fmtUsd(px)}` : 'loading price'}</Txt></View>
                    <Txt v="small" color={passed ? C.up : C.muted}>{passed ? 'Passed' : 'Voting'}</Txt>
                  </Row>
                  <View style={{ marginTop: 10 }}><Fill v={p.yes + p.no ? p.yes / (p.yes + p.no) : 0} color={C.up} height={10} /></View>
                  <Row style={{ justifyContent: 'space-between', marginTop: 4 }}><Txt v="small" color={C.up}>Yes {p.yes}</Txt><Txt v="small" color={C.down}>No {p.no}</Txt></Row>
                  <Row style={{ gap: 8, marginTop: 10 }}>
                    {p.myVote ? (
                      <>
                        <Btn title={passed ? 'Execute as captain' : 'Did not pass'} kind={passed ? 'white' : 'ghost'} disabled={!passed || !px} style={{ flex: 2 }} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); execute(p.id, px!); setTab('open'); }} />
                        <Btn title="Drop" kind="ghost" style={{ flex: 1 }} onPress={() => drop(p.id)} />
                      </>
                    ) : (
                      <>
                        <Btn title="Vote yes" kind="long" style={{ flex: 1 }} onPress={() => { Haptics.selectionAsync(); vote(p.id, 'yes'); }} />
                        <Btn title="Vote no" kind="short" style={{ flex: 1 }} onPress={() => { Haptics.selectionAsync(); vote(p.id, 'no'); }} />
                      </>
                    )}
                  </Row>
                </Card>
              </Animated.View>
            );
          })
        )
      ) : tab === 'open' ? (
        chest.open.length === 0 ? <Card style={{ alignItems: 'center', padding: 18 }}><Txt v="label">No open trades</Txt><Txt v="small" style={{ textAlign: 'center', marginTop: 2 }}>Executed proposals show here with live P&L.</Txt></Card> : (
          chest.open.map((p) => {
            const px = price(p.coin);
            const pnl = px ? pnlOf(p, px) : 0;
            return (
              <Animated.View key={p.id} layout={LinearTransition} entering={FadeInDown.springify().damping(14)} exiting={FadeOut.duration(150)}>
                <Card style={{ padding: 14, marginBottom: 10 }}>
                  <Row style={{ gap: 10 }}>
                    <TokenArt symbol={p.coin} uri={MAJORS.find((m) => m.id === p.coin)?.image} size={34} />
                    <View style={{ flex: 1 }}><Txt v="label">{p.side === 'long' ? 'Long' : 'Short'} {p.coin} {p.lev}× · {money(p.margin)}</Txt><Txt v="small">Entry {fmtUsd(p.entry)} · now {px ? fmtUsd(px) : '…'}</Txt></View>
                    <View style={{ alignItems: 'flex-end' }}><Txt v="label" color={pnl >= 0 ? C.up : C.down}>{money(pnl)}</Txt><Txt v="small" color={pnl >= 0 ? C.up : C.down}>{((pnl / p.margin) * 100).toFixed(1)}%</Txt></View>
                  </Row>
                  <Btn title="Close for the clan" kind="ghost" style={{ marginTop: 10 }} disabled={!px} onPress={() => { Haptics.notificationAsync(pnl >= 0 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning); close(p.id, px!); }} />
                </Card>
              </Animated.View>
            );
          })
        )
      ) : chest.closed.length === 0 ? <Card style={{ alignItems: 'center', padding: 18 }}><Txt v="label">No closed trades</Txt></Card> : (
        chest.closed.map((p) => (
          <Row key={p.id} style={{ gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <TokenArt symbol={p.coin} uri={MAJORS.find((m) => m.id === p.coin)?.image} size={28} />
            <View style={{ flex: 1 }}><Txt v="small" color={C.ink}>{p.side} {p.coin} {p.lev}× · {money(p.margin)}</Txt><Txt v="small">{fmtUsd(p.entry)} → {fmtUsd(p.exit)}</Txt></View>
            <Txt v="label" color={p.pnl >= 0 ? C.up : C.down}>{money(p.pnl)}</Txt>
          </Row>
        ))
      )}
    </ScrollView>
  );
}
