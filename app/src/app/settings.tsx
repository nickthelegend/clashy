// Settings: one grouped page for everything about your account. Your profile up top (avatar, name, player number),
// then Money (wallet balance, Stash balance), Play safe (your daily limit and break, as the program holds them), Squads,
// Help, and Account (address, explorer, export key, sign out), with the app version at the foot. Every value is read
// from the chain; rows without a real value say so instead of guessing.
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { IS_LOCAL_NET, NET } from '@/chain/client';
import { readProfile, readStash, usePoll } from '@/chain/social';
import { readMySquads } from '@/chain/squads';
import { short, useChain } from '@/chain/useChain';
import { ProfileAvatar } from '@/ui/feed';
import { Heart, Jar, Search, Shield, WalletI } from '@/ui/icons';
import { BackBtn, Bone, Btn, ErrorLine, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, FONT, S, fmtUsd } from '@/ui/tokens';

/** Line icons in the ui/icons style for the rows that set has no glyph for. */
const ico = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none' as const, stroke: C.ink, strokeWidth: 2.1, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Lock = () => <Svg {...ico}><Rect x="5" y="10.5" width="14" height="10" rx="2.5" /><Path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></Svg>;
const Moon = () => <Svg {...ico}><Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>;
const Help = () => <Svg {...ico}><Circle cx="12" cy="12" r="8.5" /><Path d="M9.7 9.5a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2-2.3 3.4" /><Circle cx="12" cy="17" r="0.6" fill={C.ink} /></Svg>;
const Percent = () => <Svg {...ico}><Path d="M18 6 6 18" /><Circle cx="7.5" cy="7.5" r="2.2" /><Circle cx="16.5" cy="16.5" r="2.2" /></Svg>;
// app.json is the fallback when the native manifest has no version (some web builds)
const VERSION: string = Constants.expoConfig?.version ?? (require('../../app.json') as { expo: { version: string } }).expo.version;

const fmtWhen = (ts: number) => new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/* ---------- grouped rows ---------- */
function Group({ title, children, foot }: { title: string; children: ReactNode; foot?: string }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Txt v="h2" style={{ marginBottom: 10 }}>{title}</Txt>
      <View style={{ backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', paddingVertical: 4 }}>{children}</View>
      {foot ? <Txt v="small" color={C.dim} style={{ marginTop: 8, lineHeight: 17, fontSize: 12 }}>{foot}</Txt> : null}
    </View>
  );
}

function SettingRow({ icon, label, sub, value, onPress, danger, loading }: {
  icon?: ReactNode; label: string; sub?: string; value?: string; onPress: () => void; danger?: boolean; first?: boolean; loading?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: pressed ? C.s1 : 'transparent' })}>
      {icon ? (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1} color={danger ? C.down : C.ink}>{label}</Txt>
        {sub ? <Txt v="small" lines={1} style={{ marginTop: 1 }}>{sub}</Txt> : null}
      </View>
      {loading ? <Bone w={54} h={12} /> : value ? <Txt v="small" lines={1} style={{ maxWidth: 140, flexShrink: 1, textAlign: 'right' }}>{value}</Txt> : null}
      {!danger ? <Txt v="label" color={C.dim}>›</Txt> : null}
    </Pressable>
  );
}

/* ---------- screen ---------- */
export default function Settings() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(640);
  const chain = useChain();
  const { wallet, me, bal } = chain;
  const key = me?.toBase58();
  const prof = usePoll(() => (me ? readProfile(me) : Promise.resolve(null)), 6000, [key, chain.tick]);
  const stash = usePoll(() => (me ? readStash(me) : Promise.resolve(null)), 8000, [key, chain.tick]);
  const squads = usePoll(() => (me ? readMySquads(me) : Promise.resolve([])), 10_000, [key, chain.tick]);
  const [copied, setCopied] = useState(false);

  const go = (to: string) => () => router.push(to as Href);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));
  const explorer = () => key && Linking.openURL(`https://explorer.solana.com/address/${key}${IS_LOCAL_NET ? `?cluster=custom&customUrl=${encodeURIComponent(NET.base)}` : ''}`);
  const copy = async () => {
    if (!key) return;
    try { if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(key); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const p = prof.status === 'ready' ? prof.data : null;
  const now = Date.now() / 1000;
  const usedToday = p && p.day === Math.floor(now / 86_400) ? p.stakedToday : 0;
  const onBreak = !!p && p.breakUntil > now;
  const st = stash.status === 'ready' ? stash.data : undefined;
  const n = squads.status === 'ready' ? squads.data.length : null;
  const errs = [prof, stash, squads].flatMap((x) => (x.status === 'error' ? [x] : []));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
      <Row style={{ gap: 12 }}>
        <BackBtn onPress={back} />
        <Txt v="title" style={{ flex: 1 }}>Settings</Txt>
      </Row>

      {wallet.status === 'setup' || wallet.status === 'error' ? (
        <View style={{ marginTop: 18, backgroundColor: C.card, borderRadius: 18, padding: 16 }}>
          <Txt v="h2">Setup required</Txt>
          <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>{wallet.error ?? 'The wallet could not start.'}</Txt>
        </View>
      ) : wallet.status === 'out' ? (
        <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 18, borderRadius: 18, backgroundColor: C.card, padding: 16 }}>
          <Txt v="h2">Sign in to Clashy</Txt>
          <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>Email or Google. Your own USDC wallet, no seed phrase, no network fees.</Txt>
          <Btn title="Sign in" h={50} style={{ marginTop: 14 }} onPress={() => wallet.login?.()} />
        </Animated.View>
      ) : !me ? (
        <View style={{ marginTop: 18, backgroundColor: C.card, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Bone w={52} h={52} r={26} />
          <View style={{ flex: 1, gap: 8 }}><Bone w="55%" h={14} /><Bone w="35%" h={11} /></View>
          <Txt v="small">{wallet.status === 'creating' ? 'Making your wallet…' : 'Loading…'}</Txt>
        </View>
      ) : (
        <>
          {/* profile */}
          <Animated.View entering={FadeInDown.duration(300)}>
            <Pressable onPress={go('/profile')} accessibilityRole="button" accessibilityLabel="Edit profile"
              style={({ pressed }) => ({ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: pressed ? C.s1 : C.card, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
              {prof.status === 'loading' ? <Bone w={52} h={52} r={26} /> : <ProfileAvatar p={p ?? undefined} size={52} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                {prof.status === 'loading' ? <View style={{ gap: 8 }}><Bone w="60%" h={16} /><Bone w="40%" h={11} /></View> : p ? (
                  <>
                    <Txt v="h2" lines={1}>@{p.name}</Txt>
                    <Txt v="small" lines={1} style={{ marginTop: 2 }}>Player #{p.number + 1}{p.dayStreak > 1 ? ` · ${p.dayStreak}-day streak` : ''}</Txt>
                  </>
                ) : (
                  <>
                    <Txt v="h2" lines={1}>No name yet</Txt>
                    <Txt v="small" lines={1} style={{ marginTop: 2 }}>{short(key!)} · pick a name to play</Txt>
                  </>
                )}
              </View>
              <View style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: C.s2, justifyContent: 'center' }}>
                <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{p ? 'Edit profile' : 'Pick a name'}</Txt>
              </View>
            </Pressable>
          </Animated.View>

          <Group title="Money">
            <SettingRow first icon={<WalletI size={19} color={C.ink} />} label="Wallet" sub="Add, send and receive USDC" value={bal == null ? undefined : fmtUsd(bal)} loading={bal == null} onPress={go('/wallet')} />
            <SettingRow icon={<Jar size={19} color={C.ink} />} label="Stash" sub={st?.goalName ? `Saving for ${st.goalName}` : 'Your savings jar and stocks'}
              value={st === undefined ? undefined : st === null ? 'Not opened' : fmtUsd(st.balance)} loading={stash.status === 'loading'} onPress={go('/stash')} />
          </Group>

          <Group title="Play safe" foot="Enforced by the Clashy program on every stake. Lowering applies now, raising waits 24 hours; a break can't be shortened.">
            <SettingRow first icon={<Lock />} label="Daily stake limit"
              sub={p?.pendingAt ? `Rises to ${fmtUsd(p.pendingLimit)} on ${fmtWhen(p.pendingAt)}` : p ? `${fmtUsd(usedToday)} used today` : undefined}
              value={p ? `${fmtUsd(p.dailyLimit)} a day` : prof.status === 'ready' ? 'Pick a name first' : undefined} loading={prof.status === 'loading'} onPress={go('/stash')} />
            <SettingRow icon={<Moon />} label="Take a break" sub={onBreak ? 'No clashes or Royales until it ends' : '1, 7 or 30 days off games'}
              value={p ? (onBreak ? `Until ${fmtWhen(p.breakUntil)}` : 'Off') : undefined} loading={prof.status === 'loading'} onPress={go('/stash')} />
          </Group>

          <Group title="Squads">
            <SettingRow first icon={<Shield size={19} color={C.ink} />} label="Your squads" value={n === null ? undefined : n ? `${n} squad${n === 1 ? '' : 's'}` : 'None yet'} loading={squads.status === 'loading'} onPress={go('/clans')} />
            <SettingRow icon={<Search size={18} color={C.ink} />} label="Discover squads" sub="Find a crew or start your own" onPress={go('/squads/discover')} />
          </Group>

          <Group title="Help">
            <SettingRow first icon={<Help />} label="How Clashy works" sub="Clash, Royale, squads, the Stash, the Cup" onPress={go('/help')} />
            <SettingRow icon={<Percent />} label="Fees" sub="One small cut of each pot, network fees on us" onPress={go('/help?topic=fees')} />
            <SettingRow icon={<Heart size={19} color={C.ink} />} label="Responsible play" sub="Limits, breaks and playing within your means" onPress={go('/help?topic=safe')} />
          </Group>

          <Group title="Account" foot="Your money stays in your own wallet. Clashy never sees your key.">
            <SettingRow first label="Wallet address" sub={wallet.signer?.kind === 'privy' ? wallet.signer.label : wallet.signer?.label} value={copied ? 'Copied' : short(key!)} onPress={copy} />
            <SettingRow label="View on Solana Explorer" onPress={explorer} />
            {wallet.exportKey ? <SettingRow label="Export your key" sub="Opens in Privy's secure window" onPress={wallet.exportKey} /> : null}
            {wallet.logout ? <SettingRow label="Sign out" danger onPress={wallet.logout} /> : null}
          </Group>
          {errs.map((e, i) => <ErrorLine key={i} msg={e.error} onRetry={e.reload} />)}
        </>
      )}

      <View style={{ alignItems: 'center', marginTop: 30, gap: 4 }}>
        <Txt v="small" color={C.dim} style={{ ...FONT.semi }}>Clashy {VERSION}</Txt>
        <Txt v="small" color={C.dim} style={{ fontSize: 11.5 }}>{IS_LOCAL_NET ? 'Test network · test USDC' : 'Solana · USDC'} · network fees paid by Clashy</Txt>
      </View>
    </ScrollView>
  );
}
