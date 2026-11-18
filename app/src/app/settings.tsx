// Settings: one grouped page for everything about your account. Your profile up top (avatar, name, player number),
// then Money (wallet balance, Stash balance), Play safe (your daily limit and break, as the program holds them), Squads,
// Help, and Account (address, explorer, export key, sign out), with the app version at the foot. Every value is read
// from the chain; rows without a real value say so instead of guessing.
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IS_LOCAL_NET, NET } from '@/chain/client';
import { readProfile, readStash, usePoll } from '@/chain/social';
import { readMySquads } from '@/chain/squads';
import { short, useChain } from '@/chain/useChain';
import { ClayLoop } from '@/ui/clay';
import { ProfileAvatar } from '@/ui/feed';
import { ART, BackBtn, Bone, Btn, ErrorLine, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, FONT, S, fmtUsd } from '@/ui/tokens';

const CARD = '#111116';
const HAIR = '#1F1F27';
// app.json is the fallback when the native manifest has no version (some web builds)
const VERSION: string = Constants.expoConfig?.version ?? (require('../../app.json') as { expo: { version: string } }).expo.version;

const fmtWhen = (ts: number) => new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/* ---------- grouped rows ---------- */
function Group({ title, children, foot }: { title: string; children: ReactNode; foot?: string }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Txt v="small" color={C.muted} style={{ ...FONT.bold, fontSize: 11.5, letterSpacing: 1.3, marginBottom: 8, marginLeft: 8 }}>{title.toUpperCase()}</Txt>
      <View style={{ backgroundColor: CARD, borderRadius: 22, overflow: 'hidden' }}>{children}</View>
      {foot ? <Txt v="small" style={{ marginTop: 8, marginHorizontal: 4, lineHeight: 17, fontSize: 12 }}>{foot}</Txt> : null}
    </View>
  );
}

function SettingRow({ art, label, sub, value, onPress, danger, first, loading, logo }: {
  art?: number; label: string; sub?: string; value?: string; onPress: () => void; danger?: boolean; first?: boolean; loading?: boolean; /** A real brand logo (USDC, Solana) sits smaller and round. */ logo?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: pressed ? '#1A1A21' : 'transparent' })}>
      {!first ? <View style={{ position: 'absolute', top: 0, right: 0, left: art ? 72 : 14, height: 1, backgroundColor: HAIR }} /> : null}
      {art ? (
        <LinearGradient colors={danger ? ['rgba(255,69,58,0.22)', 'rgba(255,69,58,0.06)'] : ['rgba(171,159,242,0.20)', 'rgba(171,159,242,0.04)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={art} style={{ width: logo ? 28 : 40, height: logo ? 28 : 40, borderRadius: logo ? 14 : 0 }} contentFit="contain" />
        </LinearGradient>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1} color={danger ? C.down : C.ink} style={{ fontSize: 15 }}>{label}</Txt>
        {sub ? <Txt v="small" lines={2} style={{ marginTop: 2, fontSize: 12 }}>{sub}</Txt> : null}
      </View>
      {loading ? <Bone w={54} h={12} /> : value ? <Txt v="small" lines={1} color={C.muted} style={{ maxWidth: 150, fontSize: 13.5, textAlign: 'right' }}>{value}</Txt> : null}
      {!danger ? <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt> : null}
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
        <View style={{ marginTop: 18, backgroundColor: CARD, borderRadius: 22, padding: 16 }}>
          <Txt v="h2">Setup required</Txt>
          <Txt v="small" style={{ marginTop: 6, lineHeight: 18 }}>{wallet.error ?? 'The wallet could not start.'}</Txt>
        </View>
      ) : wallet.status === 'out' ? (
        <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 18, borderRadius: 26, overflow: 'hidden', backgroundColor: CARD }}>
          <ClayLoop name="onSquad" width="100%" height={170} cover />
          <View style={{ padding: 18, paddingTop: 14 }}>
            <Txt v="title" style={{ fontSize: 24 }}>Sign in to Clashy</Txt>
            <Txt v="small" color="#B9B9C3" style={{ marginTop: 6, lineHeight: 18, fontSize: 13 }}>Email or Google. You get your own wallet that holds USDC, with no seed phrase and no network fees. Your profile, limits and squads live here.</Txt>
            <Btn title="Sign in" kind="white" h={52} style={{ marginTop: 14 }} onPress={() => wallet.login?.()} />
          </View>
        </Animated.View>
      ) : !me ? (
        <View style={{ marginTop: 18, backgroundColor: CARD, borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Bone w={64} h={64} r={32} />
          <View style={{ flex: 1, gap: 8 }}><Bone w="55%" h={14} /><Bone w="35%" h={11} /></View>
          <Txt v="small">{wallet.status === 'creating' ? 'Making your wallet…' : 'Loading…'}</Txt>
        </View>
      ) : (
        <>
          {/* profile */}
          <Animated.View entering={FadeInDown.duration(300)}>
            <Pressable onPress={go(p ? '/edit-profile' : '/welcome?step=name')} accessibilityRole="button" accessibilityLabel={p ? 'Edit profile' : 'Pick a name'}
              style={({ pressed }) => ({ marginTop: 18, borderRadius: 26, overflow: 'hidden', transform: [{ scale: pressed ? 0.985 : 1 }] })}>
              <LinearGradient colors={['#2A2245', '#131219']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
              {prof.status === 'loading' ? <Bone w={64} h={64} r={32} /> : (
                <View style={{ borderRadius: 40, borderWidth: 2.5, borderColor: C.brand, padding: 2 }}><ProfileAvatar p={p ?? undefined} size={60} /></View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                {prof.status === 'loading' ? <View style={{ gap: 8 }}><Bone w="60%" h={16} /><Bone w="40%" h={11} /></View> : p ? (
                  <>
                    <Txt v="h2" lines={1} style={{ fontSize: 19 }}>@{p.name}</Txt>
                    <Txt v="small" lines={1} style={{ marginTop: 3 }}>Player #{p.number + 1}{p.dayStreak > 1 ? ` · ${p.dayStreak}-day streak` : ''}</Txt>
                  </>
                ) : (
                  <>
                    <Txt v="h2" lines={1} style={{ fontSize: 18 }}>No name yet</Txt>
                    <Txt v="small" lines={1} style={{ marginTop: 3 }}>{short(key!)} · pick a name to play</Txt>
                  </>
                )}
              </View>
              <View style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: C.brand, justifyContent: 'center' }}>
                <Txt v="label" color={C.onBrand} style={{ fontSize: 13 }}>{p ? 'Edit profile' : 'Pick a name'}</Txt>
              </View>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Group title="Money">
            <SettingRow first art={ART.logoUSDC} logo label="Wallet" sub="Add, send and receive USDC" value={bal == null ? undefined : fmtUsd(bal)} loading={bal == null} onPress={go('/wallet')} />
            <SettingRow art={ART.stash} label="Stash" sub={st?.goalName ? `Saving for ${st.goalName}` : 'Your savings jar and stocks'}
              value={st === undefined ? undefined : st === null ? 'Not opened' : fmtUsd(st.balance)} loading={stash.status === 'loading'} onPress={go('/stash')} />
          </Group>

          <Group title="Play safe" foot="Limits are enforced by the Clashy program on every stake. Lowering applies now, raising waits 24 hours, and a break can't be shortened.">
            <SettingRow first art={ART.limits} label="Daily stake limit"
              sub={p?.pendingAt ? `Rises to ${fmtUsd(p.pendingLimit)} on ${fmtWhen(p.pendingAt)}` : p ? `${fmtUsd(usedToday)} used today` : undefined}
              value={p ? `${fmtUsd(p.dailyLimit)} a day` : prof.status === 'ready' ? 'Pick a name first' : undefined} loading={prof.status === 'loading'} onPress={go('/stash')} />
            <SettingRow art={ART.breakMoon} label="Take a break" sub={onBreak ? 'No clashes or Royales until it ends' : '1, 7 or 30 days off games'}
              value={p ? (onBreak ? `Until ${fmtWhen(p.breakUntil)}` : 'Off') : undefined} loading={prof.status === 'loading'} onPress={go('/stash')} />
          </Group>

          <Group title="Social">
            <SettingRow first art={ART.chat} label="Messages and requests" sub="Direct messages, follow requests, notifications" onPress={go('/chats')} />
            <SettingRow art={ART.invite} label="Profile and privacy" sub="Avatar, bio, link, private account" onPress={go('/edit-profile')} />
          </Group>

          <Group title="Squads">
            <SettingRow first art={ART.clubhouse} label="Your squads" value={n === null ? undefined : n ? `${n} squad${n === 1 ? '' : 's'}` : 'None yet'} loading={squads.status === 'loading'} onPress={go('/clans')} />
            <SettingRow art={ART.crestCreate} label="Squad leaderboard" sub="Top squads, or start your own" onPress={go('/squads/discover')} />
          </Group>

          <Group title="Help">
            <SettingRow first art={ART.onboarding} label="How Clashy works" sub="Clash, Royale, squads, the Stash, the Cup" onPress={go('/help')} />
            <SettingRow art={ART.spend} label="Fees" sub="One small cut of each pot, network fees on us" onPress={go('/help?topic=fees')} />
            <SettingRow art={ART.goal} label="Responsible play" sub="Limits, breaks and playing within your means" onPress={go('/help?topic=safe')} />
          </Group>

          <Group title="Account" foot="Your money stays in your own wallet. Clashy never sees your key.">
            <SettingRow first art={ART.coinsPile} label="Wallet address" sub={wallet.signer?.kind === 'privy' ? wallet.signer.label : wallet.signer?.label} value={copied ? 'Copied' : short(key!)} onPress={copy} />
            <SettingRow art={ART.logoSOL} logo label="View on Solana Explorer" sub="Every clash, chest and payout is public" onPress={explorer} />
            {wallet.exportKey ? <SettingRow art={ART.limits} label="Export your key" sub="Opens in Privy's secure window" onPress={wallet.exportKey} /> : null}
            {wallet.logout ? <SettingRow label="Sign out" danger onPress={wallet.logout} /> : null}
          </Group>
          {errs.map((e, i) => <ErrorLine key={i} msg={e.error} onRetry={e.reload} />)}
        </>
      )}

      <View style={{ alignItems: 'center', marginTop: 30, gap: 4 }}>
        <Txt v="label" color={C.dim} style={{ ...FONT.semi, fontSize: 13 }}>Clashy {VERSION}</Txt>
        <Txt v="small" color={C.dim} style={{ fontSize: 11.5 }}>{IS_LOCAL_NET ? 'Test network · test USDC' : 'Solana · USDC'} · network fees paid by Clashy</Txt>
      </View>
    </ScrollView>
  );
}
