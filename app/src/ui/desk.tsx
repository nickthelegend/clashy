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
import { C, F, R } from './tokens';

type NavProps = Omit<TabTriggerSlotProps, 'ref'> & { label: string; icon: (c: string) => ReactNode; collapsed: boolean };
function NavItem({ label, icon, collapsed, isFocused, ref: _r, ...props }: NavProps & { ref?: unknown }) {
  return (
    <Pressable {...props} style={({ hovered }: { hovered?: boolean }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, borderRadius: R.md,
      paddingHorizontal: collapsed ? 0 : 12, justifyContent: collapsed ? 'center' : 'flex-start',
      backgroundColor: isFocused ? C.s2 : hovered ? '#0E0E10' : 'transparent',
    })}>
      {icon(isFocused ? C.ink : C.muted)}
      {collapsed ? null : <Text style={{ fontFamily: F.semi, fontSize: 15, color: isFocused ? C.ink : C.muted }}>{label}</Text>}
    </Pressable>
  );
}

const NAV: { name: string; label: string; icon: (c: string) => ReactNode }[] = [
  { name: 'index', label: 'Home', icon: (c) => <Home size={21} color={c} /> },
  { name: 'chats', label: 'Chats', icon: (c) => <Chat size={21} color={c} /> },
  { name: 'arena', label: 'Arena', icon: (c) => <Swords size={21} color={c} /> },
  { name: 'clans', label: 'Clans', icon: (c) => <Shield size={21} color={c} /> },
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
          {collapsed ? null : <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.muted }}>Wallet</Text>}
        </Pressable>
      </View>
      <View style={{ flex: 1 }} />
      {collapsed ? (
        <Pressable onPress={() => router.push('/arena')} style={{ height: 52, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={ART.sidebarBattle} style={{ width: 30, height: 30 }} contentFit="contain" />
        </Pressable>
      ) : (
        <Btn title="Battle" h={52} icon={<Swords size={18} color="#fff" />} onPress={() => router.push('/arena')} />
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
    <ScrollView style={{ width: 340, flexGrow: 0, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: C.line }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 8 }}><Txt v="h2">Live duels</Txt><Image source={ART.railLive} style={{ width: 54, height: 24 }} contentFit="contain" /></Row>
        <Row style={{ gap: 6 }}><LiveDot color={live.length ? C.down : C.dim} /><Txt v="small">{feed.status === 'ready' ? `${live.length} live` : '…'}</Txt></Row>
      </Row>
      <View style={{ backgroundColor: C.s1, borderRadius: R.lg, padding: 14, gap: 8 }}>
        {counts.status === 'error' ? <Txt v="small" color={C.down}>{counts.error}</Txt> : live.length ? live.slice(0, 4).map((d) => (
          <Row key={d.key.toBase58()} style={{ justifyContent: 'space-between' }}>
            <Txt v="small" color={C.ink}>{['SOL', 'BTC', 'ETH'][d.coin] ?? '…'} · {d.stake * 2} USDC pot</Txt><Txt v="small">on the rollup</Txt>
          </Row>
        )) : (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Art src={ART.radar} size={64} radius={0} />
            <Txt v="small" style={{ textAlign: 'center', lineHeight: 18 }}>No duel is on the rollup right now.</Txt>
          </View>
        )}
        <Txt v="small" style={{ textAlign: 'center' }}>{c ? `${c.openDuels} open challenge${c.openDuels === 1 ? '' : 's'} · ${c.openRoyales} Royale lobb${c.openRoyales === 1 ? 'y' : 'ies'}` : ' '}</Txt>
        <Btn title="Duel for 5 USDC" kind="ghost" h={36} onPress={() => router.push('/onchain')} />
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <Txt v="h2">Clans</Txt>
        <Pressable onPress={() => router.push('/clans')}><Txt v="small">All clans</Txt></Pressable>
      </Row>
      <View style={{ backgroundColor: C.s1, borderRadius: R.lg, padding: 14, gap: 10 }}>
        <Row style={{ gap: 10 }}><Art src={ART.crestCreate} size={40} radius={0} /><View style={{ flex: 1 }}><Txt v="label">{c ? `${c.clans} clan${c.clans === 1 ? '' : 's'} on chain` : 'Clans'}</Txt><Txt v="small">USDC chests, votes and wars</Txt></View></Row>
        <Btn title="Open your clan" kind="ghost" h={36} onPress={() => router.push('/onchain-clan')} />
      </View>
    </ScrollView>
  );
}
