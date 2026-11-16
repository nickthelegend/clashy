// Profile (last tab): your on-chain record. Everything here is read from the Clashy program on Solana: the player
// account (Elo, rank points, wins, losses, streaks), your settled duels, your clan, and your place on the leaderboard.
// Badges unlock only when their condition is true on chain.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { COIN_SYMBOLS, readPlayer, usdcBalance, type PlayerRecord } from '@/chain/client';
import { readClans, useLeaderboardOnchain, useMyDuels } from '@/chain/reads';
import { useWallet } from '@/chain/wallet';
import { Crown } from '@/ui/icons';
import { ART, Art, Avatar, BADGES, Btn, Card, ErrorLine, Pending, Row, SkeletonRows, Txt, UnderTabs, rankFor } from '@/ui/kit';
import { C, F, S } from '@/ui/tokens';

type Tab = 'duels' | 'badges';
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const Stat = ({ k, v }: { k: string; v: string }) => (
  <Card style={{ flex: 1, padding: 12 }}><Txt v="small">{k}</Txt><Txt v="h2" color={v === '–' ? C.dim : C.ink} style={{ marginTop: 4, fontSize: 20 }}>{v}</Txt></Card>
);

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const [tab, setTab] = useState<Tab>('duels');
  const wallet = useWallet();
  const addr = wallet.signer?.publicKey ?? null;
  const [rec, setRec] = useState<PlayerRecord | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [captain, setCaptain] = useState(false);
  const [readErr, setReadErr] = useState<string>();
  const board = useLeaderboardOnchain();
  const duels = useMyDuels(addr);
  useEffect(() => {
    if (!addr) { setRec(null); setUsdc(null); return; }
    let alive = true;
    const run = () => Promise.all([readPlayer(addr), usdcBalance(addr), readClans()])
      .then(([r, b, clans]) => {
        if (!alive) return;
        setRec(r); setUsdc(b); setReadErr(undefined);
        setCaptain(!!r && clans.some((c) => c.key.equals(r.clan) && c.captain.equals(addr)));
      })
      .catch((e) => alive && setReadErr(`Cannot read your record: ${(e as Error).message}`));
    run();
    const h = setInterval(run, 5000);
    return () => { alive = false; clearInterval(h); };
  }, [addr?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = addr?.toBase58();
  const games = rec ? rec.wins + rec.losses : 0;
  const place = board.status === 'ready' ? board.data.findIndex((p) => p.owner.toBase58() === me) : -1;
  const history = duels.status === 'ready' ? duels.data : [];
  const top = board.status === 'ready' ? board.data[0]?.owner.toBase58() : undefined;
  const earned: Record<string, boolean> = {
    top10: place >= 0 && place < 10,
    streak: (rec?.bestStreak ?? 0) >= 9,
    500: games >= 500,
    captain,
    'first-ko': history.some((d) => d.won && d.koRival),
    'giant-slayer': history.some((d) => d.won && d.rival.toBase58() === top),
  };
  const how: Record<string, string> = {
    top10: 'Top 10 on the leaderboard', streak: 'Win 9 duels in a row', 500: 'Play 500 on-chain duels', captain: 'Captain an on-chain clan',
    'first-ko': 'Win a duel by knockout', 'giant-slayer': 'Beat the #1 player',
  };
  const name = wallet.signer?.kind === 'privy' ? wallet.signer.label.split('@')[0] : me ? short(me) : 'Your profile';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }}>
      <Image source={ART.banner} style={{ height: 112, borderRadius: 20, marginBottom: -36 }} contentFit="cover" />
      <Row style={{ gap: 14, paddingLeft: 12, alignItems: 'flex-start' }}>
        <View style={{ borderRadius: 40, borderWidth: 4, borderColor: C.bg }}>
          <Avatar name={me ?? 'you'} size={72} />
        </View>
        <View style={{ flex: 1, paddingTop: 42, minWidth: 0 }}>
          <Txt v="title" style={{ fontSize: 24 }} lines={1}>{name}</Txt>
          <Txt v="small" style={{ marginTop: 2 }} lines={1}>
            {!me ? 'Sign in to play for USDC' : rec ? `${rankFor(rec.rp).label} · Elo ${rec.rating} · ${short(me)}` : `${short(me)} · no on-chain duels yet`}
          </Txt>
        </View>
      </Row>
      {wallet.status === 'out' ? <Btn title="Sign in" style={{ marginTop: 14 }} onPress={() => wallet.login?.()} />
        : me ? (
          <Pressable onPress={() => router.push('/wallet')} style={{ marginTop: 14, backgroundColor: C.s1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}><Txt v="label">Wallet</Txt><Txt v="small" style={{ marginTop: 2 }}>{usdc === null ? '…' : `${usdc.toFixed(2)} USDC`} · fees paid by Clashy</Txt></View>
            <Txt v="small" style={{ fontFamily: F.semi, fontSize: 18 }}>›</Txt>
          </Pressable>
        ) : wallet.status === 'setup' ? <ErrorLine msg={wallet.error ?? 'Setup required'} /> : null}
      {readErr ? <ErrorLine msg={readErr} /> : null}

      <Row style={{ gap: 8, marginTop: 16 }}>
        <Stat k="Win rate" v={games ? `${Math.round((rec!.wins / games) * 100)}%` : '–'} />
        <Stat k="Wins – losses" v={rec ? `${rec.wins}–${rec.losses}` : '–'} />
      </Row>
      <Row style={{ gap: 8, marginTop: 8 }}>
        <Stat k="Elo · RP" v={rec ? `${rec.rating} · ${rec.rp}` : '–'} />
        <Stat k="Best streak" v={rec ? String(rec.bestStreak) : '–'} />
      </Row>

      {/* rank card → leaderboard */}
      <Pressable onPress={() => router.push('/leaderboard')} style={{ marginTop: 12, backgroundColor: C.s1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(91,108,255,0.16)', alignItems: 'center', justifyContent: 'center' }}><Crown size={22} color={C.brandSoft} /></View>
        <View style={{ flex: 1 }}>
          <Txt v="label">Leaderboard</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>{place >= 0 ? `You are #${place + 1} of ${board.status === 'ready' ? board.data.length : '…'}` : 'Settle an on-chain duel to get ranked'}</Txt>
        </View>
        <Txt v="small" style={{ fontFamily: F.semi, fontSize: 18 }}>›</Txt>
      </Pressable>

      <View style={{ marginTop: 18 }}>
        <UnderTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'duels', label: 'Duels' }, { key: 'badges', label: 'Badges' }]} />
      </View>
      {tab === 'badges' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {BADGES.map((b) => (
            <View key={b.key} style={{ width: '47%', backgroundColor: C.s1, borderRadius: 18, padding: 12, alignItems: 'center' }}>
              <View style={{ opacity: earned[b.key] ? 1 : 0.35 }}><Art src={b.src} size={96} radius={20} /></View>
              <Txt v="label" style={{ marginTop: 8 }}>{b.label}</Txt>
              <Txt v="small" style={{ marginTop: 2, textAlign: 'center' }} color={earned[b.key] ? C.up : C.muted}>{earned[b.key] ? 'Earned' : how[b.key]}</Txt>
            </View>
          ))}
        </View>
      ) : !me ? (
        <Pending art={ART.emptyProfile} title="No duels yet" body="Sign in and play an on-chain duel: every settled duel shows here." />
      ) : duels.status === 'loading' ? <SkeletonRows n={3} /> : duels.status === 'error' ? <ErrorLine msg={duels.error} /> : history.length === 0 ? (
        <Pending art={ART.emptyProfile} title="No duels yet" body="Open or join an on-chain duel in the Arena. Every settled duel shows here." action="Find a duel" onAction={() => router.push('/onchain')} />
      ) : history.map((d) => (
        <Row key={d.key.toBase58()} style={{ gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <View style={{ width: 8, height: 36, borderRadius: 4, backgroundColor: d.won === null ? C.muted : d.won ? C.up : C.down }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="label" lines={1}>{d.won === null ? 'Dead heat' : d.won ? (d.koRival ? 'Won by knockout' : 'Won') : 'Lost'} · {COIN_SYMBOLS[d.coin] ?? '?'}</Txt>
            <Txt v="small" lines={1}>vs {short(d.rival.toBase58())} · {new Date(d.endTs * 1000).toLocaleString()}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt v="label" color={d.won === null ? C.muted : d.won ? C.up : C.down}>{d.won === null ? '±0' : d.won ? `+${(d.stake - Math.floor(d.stake * 2 * 300) / 10_000).toFixed(2)}` : `−${d.stake.toFixed(2)}`} USDC</Txt>
            <Txt v="small">{d.myPnlBps >= 0 ? '+' : ''}{(d.myPnlBps / 100).toFixed(1)}%</Txt>
          </View>
        </Row>
      ))}
    </ScrollView>
  );
}
