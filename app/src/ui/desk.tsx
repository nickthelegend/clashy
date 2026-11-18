import { Image } from 'expo-image';
// Desktop shell pieces: collapsible sidebar (D1 full ↔ D2 icon rail) and the right rail.
import { router } from 'expo-router';
import { TabTrigger } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFeed, useLiveCounts } from '@/chain/reads';
import { Chat, Collapse, Home, Shield, Swords, User, WalletI } from './icons';
import { ART, Art, Btn, LiveDot, Row, Txt, Wordmark } from './kit';
import { C, F, FONT, R } from './tokens';
import { Watchlist } from './watchlist';

type NavProps = Omit<TabTriggerSlotProps, 'ref'> & { label: string; icon: (c: string) => ReactNode; collapsed: boolean };
function NavItem({ label, icon, collapsed, isFocused, ref: _r, ...props }: NavProps & { ref?: unknown }) {
  return (
    <Pressable {...props} style={({ hovered }: { hovered?: boolean }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, borderRadius: R.md,
      paddingHorizontal: collapsed ? 0 : 12, justifyContent: collapsed ? 'center' : 'flex-start',
      backgroundColor: isFocused ? C.s2 : hovered ? '#0E0E10' : 'transparent',
    })}>
      {icon(isFocused ? C.ink : C.muted)}
      {collapsed ? null : <Text style={{ ...FONT.semi, fontSize: 15, color: isFocused ? C.ink : C.muted }}>{label}</Text>}
    </Pressable>
  );
}

const NAV: { name: string; label: string; icon: (c: string) => ReactNode }[] = [
  { name: 'index', label: 'Home', icon: (c) => <Home size={21} color={c} /> },
  { name: 'chats', label: 'Chats', icon: (c) => <Chat size={21} color={c} /> },
  { name: 'arena', label: 'Arena', icon: (c) => <Swords size={21} color={c} /> },
  { name: 'clans', label: 'Squads', icon: (c) => <Shield size={21} color={c} /> },
  { name: 'profile', label: 'Profile', icon: (c) => <User size={21} color={c} /> },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <View style={{ width: collapsed ? 76 : 236, borderRightWidth: 1, borderRightColor: C.line, paddingVertical: 16, paddingHorizontal: collapsed ? 12 : 14 }}>
      <Row style={{ justifyContent: collapsed ? 'center' : 'space-between', marginBottom: 18, paddingHorizontal: collapsed ? 0 : 6 }}>
        {collapsed ? null : <Wordmark height={22} />}
        <Pressable onPress={onToggle} hitSlop={8} accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Collapse size={20} color={C.muted} open={!collapsed} />
        </Pressable>
      </Row>
      <View style={{ gap: 4 }}>
        {NAV.map((n) => (
          <TabTrigger key={n.name} name={n.name} asChild>
            <NavItem label={n.label} icon={n.icon} collapsed={collapsed} />
          </TabTrigger>
        ))}
        <Pressable onPress={() => router.push('/wallet')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, borderRadius: R.md, paddingHorizontal: collapsed ? 0 : 12, justifyContent: collapsed ? 'center' : 'flex-start', marginTop: 10 }}>
          <WalletI size={21} color={C.muted} />
          {collapsed ? null : <Text style={{ ...FONT.semi, fontSize: 15, color: C.muted }}>Wallet</Text>}
        </Pressable>
      </View>
      <View style={{ flex: 1 }} />
      {collapsed ? (
        <Pressable onPress={() => router.push('/arena')} style={{ height: 48, borderRadius: 24, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Swords size={20} color={C.onBrand} />
        </Pressable>
      ) : (
        <Btn title="Play" h={48} icon={<Swords size={18} color={C.onBrand} />} onPress={() => router.push('/arena')} />
      )}
    </View>
  );
}

/** Right rail: what is live on chain right now, and your clan. Read from the Clashy program; nothing invented. */
export function RightRail() {
  const counts = useLiveCounts();
  const feed = useFeed();
  const live = feed.status === 'ready' ? feed.data.live : [];
  const c = counts.status === 'ready' ? counts.data : null;
  return (
    <ScrollView style={{ width: 340, flexGrow: 0, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: C.line }} contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
      {/* the markets, the way a trading app's side panel shows them */}
      <Watchlist title="Markets" more={{ label: 'All markets', href: '/practice' }} />

      <Row style={{ justifyContent: 'space-between', marginTop: 26, marginBottom: 8 }}>
        <Txt v="h2">Live clashes</Txt>
        <Row style={{ gap: 6 }}><LiveDot color={live.length ? C.up : C.dim} /><Txt v="small">{feed.status === 'ready' ? `${live.length} live` : '…'}</Txt></Row>
      </Row>
      <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 8 }}>
        {counts.status === 'error' ? <Txt v="small" color={C.down}>{counts.error}</Txt> : live.length ? live.slice(0, 4).map((d) => (
          <Row key={d.key.toBase58()} style={{ justifyContent: 'space-between' }}>
            <Txt v="small" color={C.ink}>{['SOL', 'BTC', 'ETH'][d.coin] ?? '…'} · {d.stake * 2} USDC pot</Txt><Txt v="small" color={C.up}>Live</Txt>
          </Row>
        )) : <Txt v="small">No clash is live right now.</Txt>}
        <Txt v="small">{c ? `${c.openDuels} open challenge${c.openDuels === 1 ? '' : 's'} · ${c.openRoyales} Royale lobb${c.openRoyales === 1 ? 'y' : 'ies'}` : ' '}</Txt>
        <Btn title="Clash for $5" h={40} style={{ marginTop: 4 }} onPress={() => router.push('/onchain')} />
      </View>

      <Pressable onPress={() => router.push('/clans')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Shield size={18} color={C.ink} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label">{c ? `${c.clans} squad${c.clans === 1 ? '' : 's'}` : 'Squads'}</Txt>
          <Txt v="small" lines={1}>USDC chests, votes and wars</Txt>
        </View>
        <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>
      </Pressable>
    </ScrollView>
  );
}
