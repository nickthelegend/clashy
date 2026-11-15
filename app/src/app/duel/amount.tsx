// Duel amount: pump.fun's buy screen. Huge amount, presets, keypad, one white button.
// Real-money duels need the on-chain program; until then this starts a free practice duel on the live price.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMarket } from '@/data/markets';
import { Del } from '@/ui/icons';
import { BackBtn, Btn, Row, TokenArt, Txt } from '@/ui/kit';
import { C, F, R, S, fmtUsd } from '@/ui/tokens';

const PRESETS = [5, 10, 20, 50];
const LEVS = [25, 50, 100];

export default function Amount() {
  const p = useLocalSearchParams<{ id: string; side?: string }>();
  const id = p.id ?? 'SOL';
  const insets = useSafeAreaInsets();
  const m = useMarket(id);
  const [side, setSide] = useState<'long' | 'short'>(p.side === 'short' ? 'short' : 'long');
  const [amt, setAmt] = useState('20');
  const [lev, setLev] = useState(100);
  const stake = Number(amt || 0);
  const price = m.data?.price;
  const ko = price ? (side === 'long' ? price * (1 - 1 / lev) : price * (1 + 1 / lev)) : undefined;

  const key = (k: string) => {
    Haptics.selectionAsync();
    setAmt((a) => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.' && a.includes('.')) return a;
      const n = (a === '0' ? '' : a) + k;
      return Number(n) > 10000 ? a : n;
    });
  };
  const start = () => {
    if (!price || !stake) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace({ pathname: '/duel/live', params: { id, side, stake: String(stake), lev: String(lev), entry: String(price), symbol: m.data?.symbol ?? id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 10 }}>
      <Row style={{ gap: 10 }}>
        <BackBtn onPress={() => router.back()} />
        <Txt v="small" style={{ flex: 1 }}>{m.data?.symbol ?? id} · Knockout · 60s</Txt>
        <View style={{ backgroundColor: C.s2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}><Txt v="small" color={C.ink}>Practice · free</Txt></View>
      </Row>
      <Row style={{ gap: 10, marginTop: 12 }}>
        <TokenArt symbol={m.data?.symbol ?? id} uri={m.data?.image} size={34} />
        <View>
          <Txt v="label">Duel {m.data?.symbol ?? id}</Txt>
          <Txt v="small">{price ? `Now ${fmtUsd(price)} · knockout at ${fmtUsd(ko!)}` : 'Loading live price…'}</Txt>
        </View>
      </Row>
      <View style={{ flexDirection: 'row', backgroundColor: C.s1, borderRadius: R.md, padding: 3, marginTop: 14 }}>
        {(['long', 'short'] as const).map((s) => (
          <Pressable key={s} onPress={() => setSide(s)} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: side === s ? (s === 'long' ? C.up : C.down) : 'transparent' }}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: side === s ? (s === 'long' ? '#03140A' : '#fff') : C.muted }}>{s === 'long' ? 'Long' : 'Short'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ alignItems: 'center', marginTop: 30 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 60, letterSpacing: -2.4, color: C.ink, fontVariant: ['tabular-nums'] }}>${amt || '0'}</Text>
        <Txt v="small">Practice stake · {lev}× · no real money</Txt>
      </View>
      <Row style={{ gap: 8, marginTop: 22 }}>
        {PRESETS.map((v) => (
          <Pressable key={v} onPress={() => setAmt(String(v))} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: stake === v ? C.white : C.s2 }}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: stake === v ? '#000' : C.ink }}>${v}</Text>
          </Pressable>
        ))}
      </Row>
      <Row style={{ gap: 8, marginTop: 8 }}>
        {LEVS.map((v) => (
          <Pressable key={v} onPress={() => setLev(v)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: lev === v ? C.brand : C.line }}>
            <Text style={{ fontFamily: F.semi, fontSize: 13, color: lev === v ? C.brandSoft : C.muted }}>{v}×</Text>
          </Pressable>
        ))}
      </Row>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'del']].map((r) => (
          <Row key={r.join()} style={{ justifyContent: 'space-around' }}>
            {r.map((k) => (
              <Pressable key={k} onPress={() => key(k)} style={{ width: 90, height: 50, alignItems: 'center', justifyContent: 'center' }}>
                {k === 'del' ? <Del size={24} color={C.ink} /> : <Text style={{ fontFamily: F.medium, fontSize: 26, color: C.ink }}>{k}</Text>}
              </Pressable>
            ))}
          </Row>
        ))}
      </View>
      <Txt v="small" style={{ textAlign: 'center', marginBottom: 10 }}>Real-money duels open with the on-chain program at the Blitz kickoff.</Txt>
      <Btn title={price ? 'Start practice duel' : 'Waiting for price…'} kind="white" onPress={start} disabled={!price || !stake} />
    </View>
  );
}
