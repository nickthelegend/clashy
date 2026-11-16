// Discover: pump.fun-style search + feed. Paste any Solana mint to open its live market.
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { useTrending } from '@/data/markets';
import { Search } from '@/ui/icons';
import { BackBtn, CoinRow, ErrorLine, Row, Txt } from '@/ui/kit';
import { C, F, R, S, fmtUsd } from '@/ui/tokens';

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default function Discover() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const t = useTrending();
  const [q, setQ] = useState('');
  const list = (t.data ?? []).filter((m) => !q || m.symbol.toLowerCase().includes(q.toLowerCase()) || m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 30 }}
      data={list}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={
        <View>
          <Row style={{ gap: 10, marginBottom: 12 }}><BackBtn onPress={() => router.back()} /><Txt v="title">Discover</Txt></Row>
          <Row style={{ gap: 8, backgroundColor: C.s1, borderRadius: R.md, paddingHorizontal: 12, height: 44, marginBottom: 12 }}>
            <Search size={16} color={C.muted} />
            <TextInput
              value={q} onChangeText={setQ} placeholder="Search trending or paste a Solana mint" placeholderTextColor={C.muted}
              autoCapitalize="none" autoCorrect={false}
              onSubmitEditing={() => { if (MINT.test(q.trim())) router.push({ pathname: '/coin/[id]', params: { id: q.trim() } }); }}
              style={{ flex: 1, color: C.ink, fontFamily: F.medium, fontSize: 14 }}
            />
          </Row>
          {MINT.test(q.trim()) ? <Txt v="small" color={C.brandSoft} style={{ marginBottom: 8 }}>Press return to open this mint</Txt> : null}
          <Txt v="small" style={{ marginBottom: 4 }}>Trending on Solana · DexScreener</Txt>
          {t.error ? <ErrorLine msg={t.error} onRetry={t.refresh} /> : null}
        </View>
      }
      ListEmptyComponent={t.loading ? <Txt v="small">Loading…</Txt> : <Txt v="small">No matches.</Txt>}
      renderItem={({ item: m }) => (
        <CoinRow symbol={m.symbol} name={m.name} image={m.image} price={fmtUsd(m.price)} change={m.change24h}
          sub={`${m.marketCap ? `mcap ${fmtUsd(m.marketCap, { compact: true })} · ` : ''}vol ${fmtUsd(m.volume24h ?? 0, { compact: true })}`} hot={m.change24h > 50}
          onPress={() => router.push({ pathname: '/coin/[id]', params: { id: m.id } })}
          onDuel={() => router.push({ pathname: '/duel/amount', params: { id: m.id } })} />
      )}
    />
  );
}
