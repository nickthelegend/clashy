// The replay of one clash: /match/<clash account address>. Who won (big), both players face to face, each call and
// its return, the coin's move from the opening price to the closing one, the pot and the payout after Clashy's fee,
// when it ran, and the proof (the account and its transactions on the explorer). Every number is read from the clash
// account on chain; a clash that is still open, still running or was cancelled says exactly that.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share as RNShare, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { COIN_SYMBOLS, IS_LOCAL_NET, NET, P, base, readDuel, type DuelView } from '@/chain/client';
import { reader } from '@/chain/reads';
import { explorer } from '@/chain/useChain';
import { ago, usePoll, useProfiles, type Profile } from '@/chain/social';
import { CoinToken, coinName } from '@/ui/clash';
import { ProfileAvatar } from '@/ui/feed';
import { Copy, Share, Shield } from '@/ui/icons';
import { ART, BackBtn, Bone, Btn, ErrorLine, IconBtn, LiveDot, Pending, Row, Txt } from '@/ui/kit';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { Sheet } from '@/ui/sheet';
import { C, FONT, S, fmtUsd } from '@/ui/tokens';

/** The winner's ring in the result moment (game art; nowhere else on this page). */
const GOLD = '#FFC94A';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const go = (to: string) => router.push(to as Href);
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const nameOf = (p: Profile | undefined, key: PublicKey) => p?.name ?? short(key.toBase58());
const fullTime = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
};
const length = (secs: number) => (secs >= 3600 ? `${secs / 3600 === 1 ? '1 hour' : `${(secs / 3600).toFixed(1)} hours`}` : secs >= 60 && secs % 60 === 0 && secs > 60 ? `${secs / 60} min` : `${secs} s`);
const price = (n: number) => (n >= 1000 ? fmtUsd(n) : `$${n.toFixed(n >= 100 ? 2 : n >= 1 ? 3 : 4)}`);
const pct = (bps: number) => `${bps >= 0 ? '+' : '−'}${Math.abs(bps / 100).toFixed(2)}%`;
/** The explorer page of an account, on the cluster it lives on right now (the rollup while a clash is live there). */
const explorerAddr = (key: string, onEr: boolean) => `https://explorer.solana.com/address/${key}${IS_LOCAL_NET || onEr
  ? `?cluster=custom&customUrl=${encodeURIComponent(onEr ? NET.er : NET.base)}`
  : /devnet/.test(NET.base) ? '?cluster=devnet' : ''}`;

type Match = DuelView & { endTs: number; rakeBps: number };
/** The clash from wherever it lives, plus the fields `readDuel` leaves out (its end time) and the program's fee. */
async function readMatch(key: PublicKey): Promise<Match | null> {
  const d = await readDuel(reader, key);
  if (!d) return null;
  const [raw, cfg] = await Promise.all([d.onEr ? Promise.resolve(null) : reader.account.duel.fetchNullable(key), reader.account.config.fetch(P.config)]);
  return { ...d, endTs: raw ? Number(raw.endTs) : 0, rakeBps: cfg.rakeBps };
}

/** Pot, fee and payout in base units, the way settle_duel splits the vault (a tie splits it with no fee). */
function money(m: Match) {
  const pot = m.stake * 2;
  const fee = m.winner === 1 || m.winner === 2 ? Math.floor((pot * m.rakeBps) / 10_000) : 0;
  return { pot: pot / 1e6, fee: fee / 1e6, payout: (pot - fee) / 1e6, stake: m.stake / 1e6 };
}

function Bar({ title, onShare }: { title: string; onShare?: () => void }) {
  return (
    <Row style={{ gap: 12, height: 48 }}>
      <BackBtn onPress={back} />
      <Txt v="h2" lines={1} style={{ flex: 1 }}>{title}</Txt>
      {onShare ? <IconBtn onPress={onShare} size={40}><Share size={18} color={C.ink} /></IconBtn> : null}
    </Row>
  );
}

const Panel = ({ children, style }: { children: ReactNode; style?: object }) => (
  <View style={[{ backgroundColor: C.card, borderRadius: 18, padding: 14, marginTop: 12 }, style]}>{children}</View>
);
const Label = ({ children }: { children: ReactNode }) => <Txt v="small" style={{ ...FONT.semi, color: C.dim }}>{children}</Txt>;
const Line = ({ k, v, color, strong }: { k: string; v: string; color?: string; strong?: boolean }) => (
  <Row style={{ justifyContent: 'space-between', paddingVertical: 8, gap: 12 }}>
    <Txt v="small" lines={1} style={{ flexShrink: 1 }}>{k}</Txt>
    <Txt v="num" lines={1} color={color} style={strong ? { fontSize: 16 } : null}>{v}</Txt>
  </Row>
);

/** Both players face to face (Inter type; the shared FaceOff uses the display face). The winner's ring turns gold. */
function Duo({ a, b, aLabel, bLabel, win }: { a?: Profile; b?: Profile | null; aLabel: string; bLabel: string; win: number }) {
  const face = (p: Profile | undefined | null, label: string, ring: string, delay: number) => (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
      <View style={{ borderRadius: 40, borderWidth: 2.5, borderColor: ring, padding: 2 }}>
        {p === null ? (
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Txt v="h2" color={C.dim}>?</Txt></View>
        ) : <ProfileAvatar p={p} size={56} />}
      </View>
      <Txt v="label" lines={1} color={p === null ? C.muted : C.ink} style={{ marginTop: 6, maxWidth: '100%' }}>{label}</Txt>
    </Animated.View>
  );
  return (
    <Row style={{ gap: 8 }}>
      {face(a, aLabel, win === 0 ? C.up : 'transparent', 0)}
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
        <Txt v="small" color={C.muted}>vs</Txt>
      </View>
      {face(b, bLabel, win === 1 ? C.up : 'transparent', 120)}
    </Row>
  );
}

/** One player's side of the clash: their call, the return it made, the result. Tap for their profile. */
function Side({ owner, p, side, lev, bps, tag }: { owner: PublicKey; p?: Profile; side: number; lev: number; bps: number | null; tag: 'win' | 'lose' | 'ko' | 'tie' | null }) {
  const up = side === 1;
  const call = side === 1 || side === 2;
  const tint = up ? C.up : C.down;
  return (
    <Pressable onPress={() => go(`/u/${owner.toBase58()}`)} accessibilityLabel={`Open ${nameOf(p, owner)}'s profile`}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
      <Row style={{ gap: 6 }}>
        <View style={{ height: 24, paddingHorizontal: 8, borderRadius: 12, justifyContent: 'center', backgroundColor: call ? (up ? C.upBg : C.downBg) : C.s2 }}>
          <Text style={{ ...FONT.semi, fontSize: 12.5, color: call ? tint : C.muted }}>{call ? (up ? '▲ Up' : '▼ Down') : 'Sealed'}</Text>
        </View>
        {call && lev > 1 ? <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>×{lev}</Txt> : null}
      </Row>
      <Txt v="num" lines={1} color={bps === null ? C.muted : bps >= 0 ? C.up : C.down} style={{ fontSize: 20, marginTop: 8 }}>{bps === null ? '…' : pct(bps)}</Txt>
      <Txt v="small" lines={1}>{tag === 'ko' ? 'Knocked out' : 'Return on the stake'}</Txt>
      <Row style={{ marginTop: 8, justifyContent: 'space-between', gap: 6 }}>
        {tag === 'win' ? <Badge text="Winner" color={C.up} /> : tag === 'ko' ? <Badge text="KO" color={C.down} /> : tag === 'tie' ? <Badge text="Tie" color={C.muted} /> : <View />}
        <Txt v="small" color={C.brandSoft} style={{ ...FONT.medium }}>Profile ›</Txt>
      </Row>
    </Pressable>
  );
}
const Badge = ({ text, color }: { text: string; color: string }) => (
  <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: color + '26' }}><Txt v="small" color={color} style={{ ...FONT.semi, fontSize: 11 }}>{text}</Txt></View>
);

/** The coin: what it was, where it opened and where it closed. */
function CoinPanel({ m, sym }: { m: Match; sym: string }) {
  const settled = m.status >= 4 && m.exitPrice > 0;
  const move = settled && m.entryPrice ? ((m.exitPrice - m.entryPrice) / m.entryPrice) * 100 : null;
  return (
    <Panel>
      <Row style={{ gap: 14 }}>
        <CoinToken sym={sym} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1}>{coinName(sym)}</Txt>
          <Txt v="small" lines={1}>{sym} · a {length(m.lenSecs)} clash</Txt>
        </View>
        {move !== null ? (
          <View style={{ backgroundColor: move >= 0 ? C.upBg : C.downBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Txt v="small" color={move >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>{move >= 0 ? '▲' : '▼'} {Math.abs(move).toFixed(3)}%</Txt>
          </View>
        ) : null}
      </Row>
      <Row style={{ marginTop: 14, gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label>Opened at</Label>
          <Txt v="num" lines={1} style={{ fontSize: 17, marginTop: 2 }}>{m.entryPrice ? price(m.entryPrice) : '—'}</Txt>
        </View>
        <Txt v="label" color={C.dim}>→</Txt>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
          <Label>Closed at</Label>
          <Txt v="num" lines={1} color={move === null ? C.muted : move >= 0 ? C.up : C.down} style={{ fontSize: 17, marginTop: 2 }}>{settled ? price(m.exitPrice) : '…'}</Txt>
        </View>
      </Row>
    </Panel>
  );
}

/** The proof drawer: the clash account and its transactions, each one opening on the Solana explorer. */
function Proof({ open, onClose, m }: { open: boolean; onClose: () => void; m: Match }) {
  const key = m.key.toBase58();
  const sigs = usePoll(() => (open ? base.getSignaturesForAddress(m.key, { limit: 12 }) : Promise.resolve(null)), 20_000, [open, key]);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const nav = Platform.OS === 'web' ? (globalThis.navigator as Navigator | undefined) : undefined;
    if (nav?.clipboard) { await nav.clipboard.writeText(key).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1600); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Proof">
      <Txt v="small" style={{ lineHeight: 18 }}>This clash is an account of the Clashy program. The stakes sat in its escrow, and the result and the payout were written by the program, not by us.</Txt>
      <View style={{ marginTop: 14, backgroundColor: C.card, borderRadius: 14, padding: 12 }}>
        <Label>Clash address</Label>
        <Text selectable style={{ ...FONT.medium, fontSize: 13.5, color: C.ink, marginTop: 4, lineHeight: 19 }}>{key}</Text>
        {Platform.OS === 'web' ? (
          <Pressable onPress={copy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, height: 32, alignSelf: 'flex-start' }}>
            <Copy size={15} color={C.brandSoft} /><Txt v="small" color={C.brandSoft} style={{ ...FONT.semi }}>{copied ? 'Copied' : 'Copy address'}</Txt>
          </Pressable>
        ) : null}
      </View>
      <Btn title="Open on Solana Explorer" h={48} style={{ marginTop: 12 }} onPress={() => Linking.openURL(explorerAddr(key, m.onEr))} />
      <Txt v="h2" style={{ marginTop: 20 }}>Transactions</Txt>
      {sigs.status === 'loading' ? <View style={{ gap: 8, marginTop: 10 }}><Bone w="100%" h={40} r={10} /><Bone w="100%" h={40} r={10} /></View>
        : sigs.status === 'error' ? <ErrorLine msg={sigs.error} onRetry={sigs.reload} />
        : !sigs.data || sigs.data.length === 0 ? <Txt v="small" style={{ marginTop: 6 }}>No transactions found for this account on {NET.label}.</Txt>
        : sigs.data.map((s) => (
          <Pressable key={s.signature} onPress={() => Linking.openURL(explorer(s.signature, 'Solana'))}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.line, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.err ? C.down : C.up }} />
            <Txt v="label" style={{ flex: 1, fontSize: 13.5 }} lines={1}>{short(s.signature)}{s.err ? ' · failed' : ''}</Txt>
            <Txt v="small">{s.blockTime ? `${ago(s.blockTime)} ago` : ''}</Txt>
            <Txt v="small" color={C.brandSoft}>›</Txt>
          </Pressable>
        ))}
      <Txt v="small" style={{ marginTop: 10, lineHeight: 17 }}>The live seconds of a clash run on a fast rollup and are written back to Solana when it ends, so the list above is the Solana side: escrow, calls, result and payout.</Txt>
    </Sheet>
  );
}

function Gone({ title, body, top }: { title: string; body: string; top: number }) {
  const col = useDeskColumn(680);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: top + 6, paddingHorizontal: S.gutter, paddingBottom: 40 }}>
      <Bar title="Clash" />
      <View style={{ marginTop: 24 }}>
        <Pending art={ART.duels} title={title} body={body} />
        <Btn title="Start a clash" h={50} style={{ marginTop: 4 }} onPress={() => go('/clash')} />
      </View>
    </ScrollView>
  );
}

export default function MatchReplay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(680);
  const { width } = useLayout();
  const key = useMemo(() => { try { return id ? new PublicKey(id) : null; } catch { return null; } }, [id]);
  // settled and cancelled clashes never change; running ones are polled fast
  const [ms, setMs] = useState(3000);
  const match = usePoll(() => (key ? readMatch(key) : Promise.resolve(null)), ms, [id, ms]);
  const profiles = useProfiles();
  const names: Map<string, Profile> = profiles.status === 'ready' ? profiles.data : new Map();
  const [proof, setProof] = useState(false);
  const m = match.status === 'ready' ? match.data : null;
  useEffect(() => {
    if (!m) return;
    setMs(m.status >= 5 ? 60_000 : m.status === 0 ? 5000 : 2000);
  }, [m?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // a one-second clock for the countdown while the clash is live
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!m || m.status !== 3) return;
    const h = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(h);
  }, [m?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!key) return <Gone top={insets.top} title="No clash here" body={`"${id ?? ''}" is not a clash address. Open a result from Home or Play to see its replay.`} />;
  if (match.status === 'ready' && !m) return <Gone top={insets.top} title="No clash at this address" body={`Nothing on ${NET.label} is a Clashy clash at ${short(key.toBase58())}. It may be on another network, or the link is wrong.`} />;

  const pa = m ? names.get(m.creator.toBase58()) : undefined;
  const hasJoiner = !!m && !m.joiner.equals(PublicKey.default);
  const pb = m && hasJoiner ? names.get(m.joiner.toBase58()) : undefined;
  const sym = m ? (COIN_SYMBOLS[m.coin] ?? '?') : '?';
  const rolled = !!m && m.status >= 2 && m.status !== 6;
  const settled = m?.status === 5;
  const tie = settled && m!.winner === 3;
  const wi = settled && !tie ? m!.winner - 1 : -1;
  const koed = (i: number) => !!m && !!(m.ko & (1 << i));
  const cash = m ? money(m) : null;
  const names2 = m ? [nameOf(pa, m.creator), hasJoiner ? nameOf(pb, m.joiner) : 'a rival'] : ['', ''];

  const share = () => {
    if (!m || !cash) return;
    const msg = !settled ? `A ${cash.stake.toFixed(2)} USDC clash on Clashy: ${names2[0]} vs ${names2[1]}.`
      : tie ? `${names2[0]} and ${names2[1]} tied a clash on ${coinName(sym)} (${price(m.entryPrice)} → ${price(m.exitPrice)}). Both got their ${fmtUsd(cash.stake)} back. On Clashy.`
      : `${names2[wi]} ${koed(1 - wi) ? 'knocked out' : 'beat'} ${names2[1 - wi]} on ${coinName(sym)}: called ${m.side[wi] === 1 ? 'UP' : 'DOWN'}, ${pct(m.pnlBps[wi])}, took home ${fmtUsd(cash.payout)}. On Clashy.`;
    RNShare.share({ message: msg }).catch(() => {});
  };

  const winnerName = wi >= 0 ? names2[wi] : '';
  const heroLen = winnerName.length + 5;
  const heroSize = Math.max(24, Math.min(34, (Math.min(width, 680) - 2 * S.gutter) / (heroLen * 0.6)));
  const left = m && m.status === 3 && m.startTs ? Math.max(0, m.startTs + m.lenSecs - Date.now() / 1000) : null;
  /** Big type only for the result and a running clock; other states read at title size. */
  const heroFont = settled && !tie ? heroSize : tie || (m?.status === 3 && left !== null) ? 34 : 24;
  const expired = !!m && m.status === 0 && m.expiresAt < Date.now() / 1000;
  const tagOf = (i: number): 'win' | 'lose' | 'ko' | 'tie' | null => (!settled ? null : tie ? 'tie' : i === wi ? 'win' : koed(i) ? 'ko' : 'lose');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 36 }}>
        <Bar title={settled ? 'Clash result' : 'Clash'} onShare={m ? share : undefined} />
        {match.status === 'error' ? <ErrorLine msg={match.error} onRetry={match.reload} /> : null}

        {match.status === 'loading' ? (
          <View style={{ alignItems: 'center', marginTop: 20, gap: 14 }}>
            <Bone w={120} h={120} r={60} />
            <Bone w="70%" h={38} r={10} />
            <Bone w="45%" h={14} />
            <Bone w="100%" h={220} r={24} style={{ marginTop: 10 }} />
            <Bone w="100%" h={140} r={24} />
          </View>
        ) : m && cash ? (
          <>
            {/* the result, or the honest state of a clash that has no result */}
            <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: 'center', paddingTop: 10 }}>
              {settled && !tie ? (
                <View style={{ alignItems: 'center', paddingTop: 20 }}>
                  <Image source={ART.crown} style={{ position: 'absolute', top: -2, width: 40, height: 40, zIndex: 2 }} contentFit="contain" />
                  <View style={{ borderRadius: 60, borderWidth: 3, borderColor: GOLD, padding: 3 }}>
                    <ProfileAvatar p={wi === 0 ? pa : pb} size={96} />
                  </View>
                  {koed(1 - wi) ? <Image source={ART.ko} style={{ position: 'absolute', right: -24, bottom: -6, width: 56, height: 56 }} contentFit="contain" /> : null}
                </View>
              ) : settled && tie ? (
                <View style={{ alignItems: 'center' }}>
                  <Image source={ART.draw} style={{ width: 120, height: 120 }} contentFit="contain" />
                </View>
              ) : m.status === 6 ? (
                <Image source={ART.stash} style={{ width: 96, height: 96 }} contentFit="contain" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.s2, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 5 }}>
                  {m.status === 0 ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.muted }} /> : <LiveDot color={C.up} />}
                  <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 12 }}>{m.status === 0 ? (expired ? 'Nobody took it' : 'Waiting for a rival') : 'Still running'}</Txt>
                </View>
              )}

              <Text numberOfLines={2} style={{ ...FONT.semi, fontSize: heroFont, lineHeight: heroFont * 1.15, color: C.ink, textAlign: 'center', marginTop: 14, letterSpacing: heroFont > 26 ? -1 : -0.6 }}>
                {settled && !tie ? <>@{winnerName} <Text style={{ color: C.up }}>won</Text></>
                  : tie ? 'Tie'
                  : m.status === 6 ? 'Cancelled · refunded'
                  : m.status === 0 ? (expired ? 'Not taken' : 'Open clash')
                  : m.status === 4 ? 'Final bell' : left !== null ? (left >= 60 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left` : `${Math.ceil(left)} s left`) : 'Getting ready'}
              </Text>
              <Txt v="small" style={{ textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
                {settled && !tie ? `${koed(1 - wi) ? 'Knocked out' : 'Beat'} @${names2[1 - wi]} on ${coinName(sym)}${m.endTs ? ` · ${ago(m.endTs)} ago` : ''}`
                  : tie ? `@${names2[0]} and @${names2[1]} finished level on ${coinName(sym)}. Both stakes went back, no fee.`
                  : m.status === 6 ? (hasJoiner ? 'It never got going, so both stakes went straight back. Nobody lost a cent.' : 'Nobody took this clash in time, so the stake went straight back.')
                  : m.status === 0 ? (expired ? `Nobody joined before it expired. The ${fmtUsd(cash.stake)} stake goes back when it is cancelled.` : `@${names2[0]} put up ${fmtUsd(cash.stake)}. The first rival in takes them on.`)
                  : m.status === 1 ? 'Matched. The coin is being rolled.'
                  : m.status === 2 ? `Rolled ${coinName(sym)}. Both calls are sealed until they lock.`
                  : m.status === 3 ? `Live on ${coinName(sym)}. The result lands here when it ends.`
                  : 'Time is up. The result is being written to Solana.'}
              </Txt>
              {settled ? (
                <View style={{ marginTop: 14, alignItems: 'center', backgroundColor: tie ? C.card : C.upBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 }}>
                  <Text style={{ ...FONT.semi, fontSize: 30, color: tie ? C.ink : C.up, letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{tie ? `${fmtUsd(cash.stake)} back` : `+${fmtUsd(cash.payout - cash.stake)}`}</Text>
                  <Txt v="small" color={tie ? C.muted : C.up}>{tie ? 'to each player' : `took home ${fmtUsd(cash.payout)}`}</Txt>
                </View>
              ) : null}
            </Animated.View>

            {/* both players, face to face, with their calls */}
            <Panel style={{ marginTop: 22, paddingTop: 16 }}>
              <Duo a={pa} b={hasJoiner ? pb : null} aLabel={names2[0]} bLabel={hasJoiner ? names2[1] : 'Nobody yet'} win={wi} />
              {hasJoiner ? (
                <Row style={{ gap: 16, marginTop: 14, alignItems: 'stretch', paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                  {[0, 1].map((i) => {
                    const revealed = !!(m.picksRevealed & (1 << i));
                    return <Side key={i} owner={i === 0 ? m.creator : m.joiner} p={i === 0 ? pa : pb} side={revealed ? m.side[i] : 0} lev={m.lev[i]}
                      bps={m.status >= 3 && m.status !== 6 ? m.pnlBps[i] : null} tag={tagOf(i)} />;
                  })}
                </Row>
              ) : (
                <Pressable onPress={() => go(`/u/${m.creator.toBase58()}`)} style={{ alignSelf: 'center', marginTop: 12, height: 44, justifyContent: 'center' }}>
                  <Txt v="small" color={C.brandSoft} style={{ ...FONT.medium }}>@{names2[0]}'s profile ›</Txt>
                </Pressable>
              )}
            </Panel>

            {rolled ? <CoinPanel m={m} sym={sym} /> : null}

            {/* the money */}
            <Panel>
              <Label>The pot</Label>
              <Line k="Stakes" v={hasJoiner ? `${fmtUsd(cash.stake)} × 2` : `${fmtUsd(cash.stake)} (waiting for a second)`} />
              {settled && !tie ? (
                <>
                  <Line k="Pot" v={fmtUsd(cash.pot)} />
                  <Line k={`Clashy fee (${(m.rakeBps / 100).toFixed(m.rakeBps % 100 ? 1 : 0)}%)`} v={`−${fmtUsd(cash.fee)}`} color={C.muted} />
                  <View style={{ height: 1, backgroundColor: C.line, marginVertical: 2 }} />
                  <Line k={`@${winnerName} took home`} v={fmtUsd(cash.payout)} color={C.up} strong />
                </>
              ) : tie ? (
                <Line k="Back to each player" v={fmtUsd(cash.stake)} strong />
              ) : m.status === 6 ? (
                <Line k="Refunded" v={hasJoiner ? `${fmtUsd(cash.stake)} to each` : fmtUsd(cash.stake)} strong />
              ) : (
                <Line k="Winner takes" v={fmtUsd(cash.stake * 2 * (1 - m.rakeBps / 10_000))} color={C.up} strong />
              )}
            </Panel>

            {/* when */}
            <Panel>
              <Label>When</Label>
              <Line k="Started" v={m.startTs ? fullTime(m.startTs) : m.status === 0 ? 'Not yet' : '—'} />
              <Line k={settled || m.status === 4 ? 'Ended' : 'Ends'} v={m.endTs ? fullTime(m.endTs) : m.startTs ? fullTime(m.startTs + m.lenSecs) : '—'} />
              <Line k="Length" v={length(m.lenSecs)} />
              {m.status === 0 ? <Line k={expired ? 'Expired' : 'Open until'} v={fullTime(m.expiresAt)} /> : null}
            </Panel>

            {/* proof */}
            <Pressable onPress={() => setProof(true)} accessibilityRole="button" accessibilityLabel="Proof on Solana"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Shield size={19} color={C.ink} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label">Proof</Txt>
                <Txt v="small" lines={1} style={{ marginTop: 1 }}>{settled || m.status === 6 ? 'Settled on Solana' : m.onEr ? 'Live on the rollup' : 'On Solana'} · {short(m.key.toBase58())}</Txt>
              </View>
              <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>
            </Pressable>

            {/* what next */}
            <Row style={{ gap: 10, marginTop: 14 }}>
              <Btn title={settled ? 'Rematch' : m.status === 0 && !expired ? 'Take it on' : 'Start a clash'} h={52} style={{ flex: 1 }} onPress={() => go('/clash')} />
              <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share this clash" style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <Share size={19} color={C.ink} />
              </Pressable>
            </Row>
          </>
        ) : null}
      </ScrollView>
      {m ? <Proof open={proof} onClose={() => setProof(false)} m={m} /> : null}
    </View>
  );
}
