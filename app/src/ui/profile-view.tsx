// A player's profile, the way wallet and brokerage apps show an account: avatar, name, handle and a few small badges,
// then a trader's track record (net worth, a real P&L line from settled duels plus open stock P&L) and four tabs
// (positions, calls, clashes, trophies).
// Every number is read from the Clashy program, the token accounts or the crank's price feeds; nothing is invented.
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share as RNShare, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { PublicKey } from '@solana/web3.js';
import { COIN_SYMBOLS, readPlayer, usdcBalance } from '@/chain/client';
import { duelPnl, duelPnlSince, pnlSeries, readPostsBy, type PnlPoint, type Range } from '@/chain/history';
import { readClans, useLeaderboardOnchain, useMyDuels, type DuelRow } from '@/chain/reads';
import { ago, readPortfolio, readProfile, readStash, usePoll, usePrices, useProfiles, type Post, type Profile } from '@/chain/social';
import { errText, useChain } from '@/chain/useChain';
import { ProfileAvatar, PositionCard, STOCK_ART } from './feed';
import { MarketCallCard } from './market-call';
import { callTarget } from '@/chain/calls';
import { Back, Crown, Gear, Heart, Reply, Share, Swords, WalletI } from './icons';
import { ART, AVATARS, BADGES, Bone, Btn, Chips, ErrorLine, Money, Pending, RANKS, Row, SkeletonRows, Txt, rankFor } from './kit';
import { Sheet } from './sheet';
import { useDeskColumn } from './layout';
import { C, FONT, S, fmtUsd } from './tokens';

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtUsd(Math.abs(n))}`;
const tone = (n: number) => (Math.abs(n) < 0.005 ? C.muted : n > 0 ? C.up : C.down);

type Tab = 'positions' | 'calls' | 'clashes' | 'trophies';

export function ProfileView({ owner, isMe, onBack }: { owner: PublicKey; isMe: boolean; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const id = owner.toBase58();
  const [tab, setTab] = useState<Tab>('positions');
  const [range, setRange] = useState<Range>('all');
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string>();

  const prof = usePoll(() => readProfile(owner), 10_000, [id]);
  const rec = usePoll(() => readPlayer(owner), 8000, [id]);
  const usdc = usePoll(() => usdcBalance(owner), 8000, [id]);
  const stash = usePoll(() => readStash(owner), 8000, [id]);
  const port = usePoll(() => readPortfolio(owner), 8000, [id]);
  const posts = usePoll(() => readPostsBy(owner), 8000, [id]);
  const clans = usePoll(readClans, 20_000);
  const prices = usePrices();
  const profiles = useProfiles();
  const duels = useMyDuels(owner);
  const board = useLeaderboardOnchain();

  const p = prof.status === 'ready' ? prof.data : null;
  const r = rec.status === 'ready' ? rec.data : null;
  const px: Record<string, number> = prices.status === 'ready' ? prices.data : {};
  const positions = port.status === 'ready' ? port.data.filter((h) => h.shares > 0 || h.wallet > 0) : [];
  const history: DuelRow[] = duels.status === 'ready' ? duels.data : [];
  const pmap = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();

  // net worth: wallet USDC + Stash vault + the stock tokens actually held, at live prices
  const stockValue = positions.reduce((a, h) => a + Math.max(h.wallet, h.shares) * (px[h.stock.symbol] ?? 0), 0);
  const openStockPnl = positions.reduce((a, h) => a + (h.shares > 0 && px[h.stock.symbol] ? h.shares * px[h.stock.symbol] - h.cost : 0), 0);
  const realized = positions.reduce((a, h) => a + h.realized, 0);
  const worthReady = usdc.status === 'ready' && stash.status === 'ready' && port.status === 'ready' && (positions.length === 0 || prices.status === 'ready');
  const stashBal = stash.status === 'ready' && stash.data ? stash.data.balance : 0;
  const worth = (usdc.status === 'ready' ? usdc.data : 0) + stashBal + stockValue;
  const now = Date.now() / 1000;
  const today = duelPnlSince(history, now - 86_400);
  const allTime = history.reduce((a, d) => a + duelPnl(d), 0) + openStockPnl + realized;
  const series = useMemo(() => pnlSeries(history, openStockPnl, range), [history, openStockPnl, range]);
  const delta = series.length ? series[series.length - 1].v - series[0].v : 0;

  const decided = r ? r.wins + r.losses : history.filter((d) => d.won !== null).length;
  const games = Math.max(decided, history.length);
  const wins = r ? r.wins : history.filter((d) => d.won).length;
  const lb = board.status === 'ready' ? board.data : [];
  const place = lb.findIndex((x) => x.owner.equals(owner));
  const top = lb[0]?.owner;
  const clanList = clans.status === 'ready' ? clans.data : [];
  const clan = r ? clanList.find((c) => c.key.equals(r.clan)) : undefined;
  const earned: Record<string, boolean> = {
    top10: place >= 0 && place < 10,
    streak: (r?.bestStreak ?? 0) >= 9,
    500: games >= 500,
    captain: !!clan && clan.captain.equals(owner),
    'first-ko': history.some((d) => d.won && d.koRival),
    'giant-slayer': !!top && history.some((d) => d.won && d.rival.equals(top)),
  };
  const how: Record<string, string> = {
    top10: 'Reach the top 10 on the leaderboard', streak: 'Win 9 clashes in a row', 500: 'Play 500 clashes', captain: 'Captain a squad',
    'first-ko': 'Win a clash by knockout', 'giant-slayer': 'Beat the #1 player',
  };
  const progress: Record<string, string> = {
    top10: place >= 0 ? `#${place + 1} now · reach the top 10` : how.top10,
    streak: `Best run ${r?.bestStreak ?? 0} / 9 wins`,
    500: `${games} / 500 clashes`,
  };
  const trophies = BADGES.filter((b) => earned[b.key]).length;
  const rank = rankFor(r?.rp ?? 0);
  const next = RANKS.find((x) => x.n === rank.n + 1);
  const handle = p ? `@${p.name}` : short(id);

  const share = async () => {
    Haptics.selectionAsync();
    const url = Platform.OS === 'web' && typeof location !== 'undefined' ? `${location.origin}/u/${id}` : undefined;
    const msg = `${handle} on Clashy: ${games} clashes, ${decided ? Math.round((wins / decided) * 100) : 0}% win rate.`;
    try {
      if (Platform.OS === 'web') {
        const nav = globalThis.navigator as Navigator | undefined;
        if (nav?.share) { await nav.share({ title: `${handle} on Clashy`, text: msg, url }); return; }
        if (nav?.clipboard && url) { await nav.clipboard.writeText(url); setToast('Profile link copied'); return; }
        setToast('Sharing is not available in this browser');
        return;
      }
      await RNShare.share({ message: url ? `${msg} ${url}` : msg });
    } catch { /* the person closed the share sheet */ }
  };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(undefined), 2200); return () => clearTimeout(t); }, [toast]);

  const readErr = [prof, rec, usdc, stash, port].find((x) => x.status === 'error') as { error: string } | undefined;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 40 }}>
      {/* ---------- header: avatar, name, handle, small badges ---------- */}
      <Row style={{ justifyContent: 'space-between', minHeight: 40 }}>
        {onBack ? <RoundBtn label="Back" onPress={onBack}><Back size={18} color={C.ink} /></RoundBtn> : <View />}
        <Row style={{ gap: 8 }}>
          {isMe ? <RoundBtn label="Wallet" onPress={() => router.push('/wallet')}><WalletI size={18} color={C.ink} /></RoundBtn> : null}
          {isMe ? <RoundBtn label="Settings" onPress={() => router.push('/settings' as never)}><Gear size={18} color={C.ink} /></RoundBtn> : null}
          <RoundBtn label="Share profile" onPress={share}><Share size={18} color={C.ink} /></RoundBtn>
        </Row>
      </Row>

      <Row style={{ marginTop: 12, gap: 14 }}>
        {prof.status === 'loading' ? <Bone w={64} h={64} r={32} /> : <ProfileAvatar p={p ?? undefined} size={64} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          {prof.status === 'loading' ? <Bone w={150} h={22} r={7} /> : <Txt v="title" lines={1}>{handle}</Txt>}
          <Txt v="small" lines={1} style={{ marginTop: 2 }}>
            {[p ? `Player #${p.number + 1}` : null, clan ? clan.name : null, short(id)].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      </Row>
      <Row style={{ gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <Chip text={p && p.dayStreak > 0 ? `${p.dayStreak}-day streak` : 'No streak'} dim={!(p && p.dayStreak > 0)} />
        <Chip text={rank.label} />
        {place >= 0 && place < 10 ? <Chip text="Top 10" /> : place >= 0 ? <Chip text={`#${place + 1} on the board`} /> : null}
      </Row>
      <Row style={{ gap: 8, marginTop: 14 }}>
        {isMe ? (
          <Btn title="Edit profile" kind="ghost" h={40} style={{ flex: 1 }} onPress={() => setEditing(true)} disabled={!p} />
        ) : (
          <Btn title="Clash" h={40} style={{ flex: 1 }} icon={<Swords size={16} color={C.onBrand} />} onPress={() => router.push('/clash' as never)} />
        )}
      </Row>
      {isMe && prof.status === 'ready' && !p ? (
        <Btn title="Pick your name" style={{ marginTop: 10 }} onPress={() => router.push('/welcome')} />
      ) : null}
      {toast ? <Txt v="small" color={C.brandSoft} style={{ marginTop: 8 }}>{toast}</Txt> : null}
      {readErr ? <ErrorLine msg={readErr.error} /> : null}

      {/* ---------- track record ---------- */}
      <View style={{ marginTop: 24 }}>
        <Txt v="small">Net worth</Txt>
        <View style={{ marginTop: 2, minHeight: 48, justifyContent: 'center' }}>
          {worthReady ? <Money value={worth} size={40} /> : <Bone w={170} h={36} r={10} />}
        </View>
        <Txt v="small" lines={1} style={{ marginTop: 2 }}>
          <Txt v="small" color={tone(today)} style={{ ...FONT.medium, fontVariant: ['tabular-nums'] }}>{signed(today)}</Txt> today
          <Txt v="small" color={C.dim}>  ·  </Txt>
          <Txt v="small" color={tone(allTime)} style={{ ...FONT.medium, fontVariant: ['tabular-nums'] }}>{signed(allTime)}</Txt> all time
        </Txt>
        <Row style={{ gap: 8, marginTop: 16 }}>
          <Part label="Wallet" value={usdc.status === 'ready' ? usdc.data : null} onPress={isMe ? () => router.push('/wallet') : undefined} />
          <Part label="Stash" value={stash.status === 'ready' ? stashBal : null} onPress={isMe ? () => router.push('/stash' as never) : undefined} />
          <Part label="Stocks" value={port.status === 'ready' && (positions.length === 0 || prices.status === 'ready') ? stockValue : null} onPress={isMe ? () => router.push('/stash' as never) : undefined} />
        </Row>

        <View style={{ marginTop: 12, backgroundColor: C.card, borderRadius: 18, paddingTop: 14, paddingBottom: 10, overflow: 'hidden' }}>
          <Row style={{ paddingHorizontal: 14, justifyContent: 'space-between' }}>
            <Txt v="label">P&amp;L</Txt>
            {series.length ? <Txt v="num" color={tone(delta)}>{signed(delta)} <Txt v="small">{range === 'all' ? 'all time' : `past ${range}`}</Txt></Txt> : null}
          </Row>
          {duels.status === 'loading' || (port.status === 'loading') ? (
            <View style={{ height: 170, padding: 14, justifyContent: 'flex-end' }}><Bone w="100%" h={120} r={12} /></View>
          ) : duels.status === 'error' ? (
            <View style={{ height: 170, padding: 14, justifyContent: 'center' }}><ErrorLine msg={duels.error} /></View>
          ) : series.length ? (
            <PnlChart points={series} h={170} />
          ) : (
            <EmptyChart isMe={isMe} />
          )}
          <Row style={{ paddingHorizontal: 10, marginTop: 6, justifyContent: 'space-between' }}>
            <Chips<Range> value={range} onChange={setRange} items={[{ key: '24h', label: '24h' }, { key: '7d', label: '7d' }, { key: '30d', label: '30d' }, { key: 'all', label: 'All' }]} />
          </Row>
          <Txt v="small" color={C.dim} style={{ paddingHorizontal: 14, fontSize: 12 }}>Settled clashes, then open stock P&amp;L at live prices</Txt>
        </View>
      </View>

      {/* ---------- stats ---------- */}
      <Row style={{ gap: 8, marginTop: 12 }}>
        <Stat value={rec.status === 'loading' ? null : String(games)} label="Clashes" />
        <Stat value={rec.status === 'loading' ? null : decided ? `${Math.round((wins / decided) * 100)}%` : '–'} label="Win rate" />
        <Stat value={prof.status === 'loading' ? null : String(p?.dayStreak ?? 0)} label="Day streak" />
      </Row>
      <Pressable onPress={() => router.push('/leaderboard')} accessibilityRole="button" accessibilityLabel={`Rank ${rank.label}, open the leaderboard`}
        style={({ pressed }) => ({ marginTop: 6, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Crown size={19} color={C.ink} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ justifyContent: 'space-between', gap: 8 }}>
            <Txt v="label" lines={1}>{rank.label}</Txt>
            <Txt v="small" lines={1} style={{ flexShrink: 1 }}>{next ? `${r?.rp ?? 0} / ${next.pts} RP to ${next.label}` : `${r?.rp ?? 0} RP · top tier`}</Txt>
          </Row>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: C.s2, marginTop: 8, overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.brand, width: `${next ? Math.min(100, Math.max(3, (((r?.rp ?? 0) - rank.pts) / (next.pts - rank.pts)) * 100)) : 100}%` }} />
          </View>
        </View>
        <Txt v="label" color={C.dim}>›</Txt>
      </Pressable>

      {/* ---------- tabs ---------- */}
      <View style={{ flexDirection: 'row', marginTop: 18 }}>
        {([
          ['positions', 'Positions', positions.length],
          ['calls', 'Calls', posts.status === 'ready' ? posts.data.length : 0],
          ['clashes', 'Clashes', history.length],
          ['trophies', 'Trophies', trophies],
        ] as [Tab, string, number][]).map(([k, label, n]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => { Haptics.selectionAsync(); setTab(k); }} style={{ flex: 1, alignItems: 'center', paddingTop: 6, minHeight: 44, justifyContent: 'flex-end' }}>
              <Row style={{ gap: 4, paddingBottom: 9 }}>
                <Txt v="label" color={on ? C.ink : C.dim} style={{ fontSize: 14 }}>{label}</Txt>
                {n ? <Txt v="small" color={on ? C.muted : C.dim} style={{ fontSize: 12, ...FONT.medium }}>{n}</Txt> : null}
              </Row>
              <View style={{ height: 2, width: '70%', borderRadius: 1, backgroundColor: on ? C.ink : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 12 }}>
        {tab === 'positions' ? (
          port.status === 'loading' ? <SkeletonRows n={3} square /> : port.status === 'error' ? <ErrorLine msg={port.error} /> : positions.length === 0 ? (
            <Pending art={ART.stash} title="No positions yet" body={isMe ? 'Buy a real stock from your Stash, from $5.' : `${handle} has not bought a stock yet.`}
              action={isMe ? 'Open Stash' : undefined} onAction={() => router.push('/stash' as never)} />
          ) : (
            <>
              {positions.map((h) => {
                const price = px[h.stock.symbol];
                const sh = h.shares > 0 ? h.shares : h.wallet;
                const v = price ? sh * price : null;
                const pl = v !== null && h.shares > 0 ? v - h.cost : null;
                const pct = pl !== null && h.cost > 0 ? (pl / h.cost) * 100 : null;
                return (
                  <Row key={h.stock.symbol} style={{ gap: 12, paddingVertical: 10 }}>
                    <Image source={STOCK_ART[h.stock.symbol]} style={{ width: 38, height: 38, borderRadius: 19 }} contentFit="cover" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt v="label" lines={1}>{h.stock.name}</Txt>
                      <Txt v="small" lines={1} style={{ marginTop: 1 }}>{sh.toFixed(4)} {h.stock.symbol}{h.shares > 0 ? ` · paid ${fmtUsd(h.cost)}` : ' · in wallet'}</Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt v="num">{v === null ? '…' : fmtUsd(v)}</Txt>
                      {pct !== null ? <Txt v="small" color={pct >= 0 ? C.up : C.down} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>{pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%</Txt> : null}
                    </View>
                  </Row>
                );
              })}
              <Txt v="small" style={{ marginTop: 8 }}>{fmtUsd(stockValue)} at live prices · open P&amp;L <Txt v="small" color={tone(openStockPnl)}>{signed(openStockPnl)}</Txt></Txt>
            </>
          )
        ) : tab === 'calls' ? (
          posts.status === 'loading' ? <SkeletonRows n={2} /> : posts.status === 'error' ? <ErrorLine msg={posts.error} /> : posts.data.length === 0 ? (
            <Pending art={ART.megaphone} title="No calls yet" body={isMe ? 'Post a call on a stock you hold.' : `${handle} has not posted a call yet.`}
              action={isMe ? 'Post a call' : undefined} onAction={() => router.push('/')} />
          ) : posts.data.map((post, i) => <CallCard key={post.seq} post={post} positions={positions} prices={px} duels={history} owner={owner} first={i === 0} />)
        ) : tab === 'clashes' ? (
          duels.status === 'loading' ? <SkeletonRows n={3} /> : duels.status === 'error' ? <ErrorLine msg={duels.error} /> : history.length === 0 ? (
            <Pending art={ART.duels} title="No clashes yet" body={isMe ? 'Every settled clash lands here with what you won or lost.' : `${handle} has not settled a clash yet.`}
              action={isMe ? 'Start a clash' : undefined} onAction={() => router.push('/clash' as never)} />
          ) : history.map((d) => <ClashRow key={d.key.toBase58()} d={d} rival={pmap.get(d.rival.toBase58())} />)
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
            {BADGES.map((b) => {
              const got = earned[b.key];
              return (
                <View key={b.key} style={{ width: '48.8%', backgroundColor: C.card, borderRadius: 16, padding: 12, alignItems: 'center' }}>
                  <Image source={b.src} style={{ width: 56, height: 56, opacity: got ? 1 : 0.25 }} contentFit="contain" />
                  {!got ? <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: C.s2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Txt v="small" style={{ fontSize: 11, ...FONT.medium }}>Locked</Txt></View> : null}
                  <Txt v="label" style={{ marginTop: 6, textAlign: 'center' }} lines={1}>{b.label}</Txt>
                  <View style={{ marginTop: 2, minHeight: 34, justifyContent: 'center' }}>
                    {got ? <Txt v="small" color={C.brandSoft} style={{ ...FONT.medium }}>Earned</Txt>
                      : <Txt v="small" lines={2} style={{ textAlign: 'center', fontSize: 12, lineHeight: 16 }}>{progress[b.key] ?? how[b.key]}</Txt>}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {isMe && p ? <EditProfileSheet open={editing} onClose={() => setEditing(false)} profile={p} onSaved={() => { prof.reload(); profiles.reload(); setToast('Avatar saved on Solana'); }} /> : null}
    </ScrollView>
  );
}

/* ---------- pieces ---------- */
function RoundBtn({ children, onPress, size = 40, label }: { children: React.ReactNode; onPress: () => void; size?: number; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: pressed ? C.s1 : C.s2, alignItems: 'center', justifyContent: 'center' })}>
      {children}
    </Pressable>
  );
}

/** A small badge pill under the name. */
function Chip({ text, dim }: { text: string; dim?: boolean }) {
  return (
    <Row style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: C.s2 }}>
      <Txt v="small" color={dim ? C.muted : C.ink} style={{ ...FONT.medium, fontSize: 12 }} lines={1}>{text}</Txt>
    </Row>
  );
}

function Part({ label, value, onPress }: { label: string; value: number | null; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: pressed ? C.s1 : C.card })}>
      <Txt v="small" lines={1}>{label}</Txt>
      {value === null ? <Bone w={54} h={14} style={{ marginTop: 4 }} /> : <Txt v="num" style={{ marginTop: 2 }} lines={1}>{fmtUsd(value)}</Txt>}
    </Pressable>
  );
}

function Stat({ value, label }: { value: string | null; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: C.card, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Txt v="small" lines={1}>{label}</Txt>
      {value === null ? <Bone w={40} h={14} style={{ marginTop: 4 }} /> : <Txt v="num" style={{ marginTop: 2 }} color={value === '–' ? C.dim : C.ink} lines={1}>{value}</Txt>}
    </View>
  );
}

function EmptyChart({ isMe }: { isMe: boolean }) {
  return (
    <View style={{ height: 170, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
      <Svg width="100%" height={40} style={{ position: 'absolute', top: 120 }}>
        <Line x1="0" x2="100%" y1="20" y2="20" stroke={C.s2} strokeWidth={1.5} strokeDasharray="5 6" />
      </Svg>
      <Txt v="label">No track record yet</Txt>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 2 }}>{isMe ? 'Settle a clash or buy a stock to start the line.' : 'This line starts with their first settled clash.'}</Txt>
    </View>
  );
}

/** Cumulative P&L, time-scaled: straight segments between settlements (no smoothing overshoot), a $0 line, a dot per
 *  settled duel and a pulsing dot on today's value. */
function PnlChart({ points, h }: { points: PnlPoint[]; h: number }) {
  const [w, setW] = useState(0);
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withTiming(2.4, { duration: 1100 }), -1, false); }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 1.4 - pulse.value / 2 }));
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const vals = points.map((p) => p.v);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
  const pad = (hi - lo) * 0.16; lo -= pad; hi += pad;
  const t0 = points[0].ts, t1 = points[points.length - 1].ts;
  const L = 36, RG = 18, T = 14, B = 10;
  const X = (ts: number) => L + ((ts - t0) / Math.max(1, t1 - t0)) * (w - L - RG);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
  const last = points[points.length - 1];
  const col = last.v >= 0 ? C.up : C.down;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const ex = X(last.ts), ey = Y(last.v), zy = Y(0);
  return (
    <View onLayout={onLayout} style={{ height: h, width: '100%' }}>
      {w > 0 ? (
        <>
          <Svg width={w} height={h}>
            <Defs><SvgGradient id="pnlg" x1="0" y1={last.v >= 0 ? '0' : '1'} x2="0" y2={last.v >= 0 ? '1' : '0'}><Stop offset="0" stopColor={col} stopOpacity={0.16} /><Stop offset="1" stopColor={col} stopOpacity={0} /></SvgGradient></Defs>
            <Line x1={L - 4} x2={w} y1={zy} y2={zy} stroke={C.s2} strokeWidth={1} strokeDasharray="4 5" />
            <Path d={`${d} L${ex},${zy} L${X(points[0].ts)},${zy}Z`} fill="url(#pnlg)" />
            <Path d={d} stroke={col} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {points.slice(1, -1).map((p, i) => <Circle key={i} cx={X(p.ts)} cy={Y(p.v)} r={2.4} fill={C.card} stroke={col} strokeWidth={1.5} />)}
          </Svg>
          <Txt v="small" color={C.dim} style={{ position: 'absolute', left: 12, top: Math.max(0, Math.min(h - 14, zy - 7)), fontSize: 10.5, lineHeight: 14 }}>$0</Txt>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: ex - 6, top: ey - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: col }, ring]} />
          <View pointerEvents="none" style={{ position: 'absolute', left: ex - 5, top: ey - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: col, borderWidth: 2, borderColor: C.card }} />
        </>
      ) : null}
    </View>
  );
}

function ClashRow({ d, rival }: { d: DuelRow; rival?: Profile }) {
  const pnl = duelPnl(d);
  const res = d.won === null ? 'Dead heat' : d.won ? (d.koRival ? 'Won by KO' : 'Won') : 'Lost';
  const col = d.won === null ? C.muted : d.won ? C.up : C.down;
  return (
    <Pressable onPress={() => router.push(`/u/${d.rival.toBase58()}` as never)} accessibilityRole="button" accessibilityLabel={`${res} against ${rival ? rival.name : 'a rival'}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <View>
        <ProfileAvatar p={rival} size={38} />
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: col, borderWidth: 2, borderColor: C.bg }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>vs {rival ? `@${rival.name}` : short(d.rival.toBase58())}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 1 }}><Txt v="small" color={col} style={{ ...FONT.medium }}>{res}</Txt> · {COIN_SYMBOLS[d.coin] ?? '?'} · {ago(d.endTs)} ago</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt v="num" color={col}>{d.won === null ? '±$0.00' : signed(pnl)}</Txt>
        <Txt v="small" style={{ marginTop: 1, fontVariant: ['tabular-nums'] }} color={d.myPnlBps >= 0 ? C.up : C.down}>{d.myPnlBps >= 0 ? '+' : '−'}{Math.abs(d.myPnlBps / 100).toFixed(2)}% call</Txt>
      </View>
    </Pressable>
  );
}

type Pos = Awaited<ReturnType<typeof readPortfolio>>[number];
function CallCard({ post, positions, prices, duels, owner, first }: { post: Post; positions: Pos[]; prices: Record<string, number>; duels: DuelRow[]; owner: PublicKey; first?: boolean }) {
  const pos = post.kind === 1 ? positions.find((x) => x.stock.mint === post.refkey.toBase58()) : undefined;
  const stock = post.kind === 1 ? (pos?.stock ?? undefined) : undefined;
  const duel = post.kind === 2 ? duels.find((d) => d.key.equals(post.refkey)) : undefined;
  const target = callTarget(post);
  const tag = post.replyTo !== null ? { t: 'Reply', c: C.muted } : target ? { t: 'Call', c: C.brandSoft } : post.kind === 2 ? { t: 'Clash', c: C.ink } : { t: 'Post', c: C.muted };
  return (
    <View style={{ paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <Row style={{ gap: 8 }}>
        <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: C.s2 }}>
          <Txt v="small" color={tag.c} style={{ ...FONT.semi, fontSize: 11 }}>{tag.t}</Txt>
        </View>
        <Txt v="small">{ago(post.ts)} ago</Txt>
        <View style={{ flex: 1 }} />
        <Row style={{ gap: 4 }}><Reply size={14} color={C.dim} /><Txt v="small" style={{ fontSize: 12 }}>{post.replies}</Txt></Row>
        <Row style={{ gap: 4, marginLeft: 8 }}><Heart size={14} color={C.dim} /><Txt v="small" style={{ fontSize: 12 }}>{post.likes}</Txt></Row>
      </Row>
      <Txt v="body" style={{ marginTop: 8, lineHeight: 21 }}>{post.text}</Txt>
      {stock ? (
        <PositionCard stock={stock} price={prices[stock.symbol]}
          holding={pos ? { owner, stock, shares: pos.shares, cost: pos.cost, realized: pos.realized, soldUsdc: 0 } : undefined} />
      ) : null}
      {target?.kind === 'market' ? <MarketCallCard id={target.id} /> : null}
      {duel ? (
        <Row style={{ marginTop: 10, gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Swords size={17} color={C.ink} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="label" lines={1}>Clash on {COIN_SYMBOLS[duel.coin] ?? '?'}</Txt>
            <Txt v="small" lines={1} style={{ marginTop: 1 }}>{duel.won === null ? 'Dead heat' : duel.won ? 'Won' : 'Lost'} · settled on Solana</Txt>
          </View>
          <Txt v="num" color={duel.won === null ? C.muted : duel.won ? C.up : C.down}>{duel.won === null ? '±$0.00' : signed(duelPnl(duel))}</Txt>
        </Row>
      ) : null}
    </View>
  );
}

/** Edit profile: pick one of the 20 clay avatars and save it on chain (set_avatar; the sponsor relay pays). */
function EditProfileSheet({ open, onClose, profile, onSaved }: { open: boolean; onClose: () => void; profile: Profile; onSaved: () => void }) {
  const chain = useChain();
  const [pick, setPick] = useState(profile.avatar);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  useEffect(() => { if (open) { setPick(profile.avatar); setErr(undefined); } }, [open, profile.avatar]);
  const save = async () => {
    if (!chain.progs || !chain.me) { setErr('The relay is offline; try again in a minute'); return; }
    setSaving(true); setErr(undefined);
    try {
      await chain.onBase('Change avatar', () => chain.progs!.base.methods.setAvatar(pick).accountsPartial({ owner: chain.me! }).rpc());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      onClose();
    } catch (e) { setErr(errText(e)); } finally { setSaving(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit profile">
      <Row style={{ gap: 12, marginTop: 6, marginBottom: 14, backgroundColor: C.card, borderRadius: 18, padding: 12 }}>
        <Image source={AVATARS[pick % AVATARS.length]} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.bg }} contentFit="cover" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1}>@{profile.name}</Txt>
          <Txt v="small" style={{ marginTop: 1 }}>Your name is yours for good. Avatars save on Solana; Clashy pays the fee.</Txt>
        </View>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
        {AVATARS.map((src, i) => {
          const on = pick === i;
          return (
            <Pressable key={i} accessibilityLabel={`Avatar ${i + 1}`} onPress={() => { Haptics.selectionAsync(); setPick(i); }}
              style={{ width: '23%', aspectRatio: 1, borderRadius: 999, padding: 3, borderWidth: 3, borderColor: on ? C.brand : 'transparent' }}>
              <Image source={src} style={{ width: '100%', height: '100%', borderRadius: 999, backgroundColor: C.bg }} contentFit="cover" />
              {profile.avatar === i ? (
                <View style={{ position: 'absolute', bottom: -2, alignSelf: 'center', backgroundColor: C.s2, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Txt v="small" style={{ fontSize: 10, ...FONT.semi }} color={C.ink}>Now</Txt>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {err ? <ErrorLine msg={err} /> : null}
      <Btn title={saving ? 'Saving on Solana…' : pick === profile.avatar ? 'Pick a new avatar' : 'Save avatar'} disabled={saving || pick === profile.avatar} onPress={save} style={{ marginTop: 16 }} />
    </Sheet>
  );
}

/** Signed-out or wallet-not-ready state for the Profile tab. */
export function ProfileSignedOut({ onSignIn, error, loading }: { onSignIn?: () => void; error?: string; loading?: boolean }) {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 40 }}>
      <Txt v="title" style={{ marginTop: 6 }}>Profile</Txt>
      <View style={{ marginTop: 18 }}>
        <Pending art={ART.emptyProfile} title="Your track record" body="Sign in for your Clashy wallet. Clashes, stocks and calls build your profile on chain." />
      </View>
      {loading ? <Bone w="100%" h={52} r={26} /> : error ? <ErrorLine msg={error} /> : (
        <Btn title="Sign in" onPress={onSignIn} h={52} />
      )}
    </ScrollView>
  );
}

