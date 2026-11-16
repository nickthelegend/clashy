import { Image } from 'expo-image';
// Home (Nick's pick, Nov 15): H2 live stories on top, H4 one-time "Play now" card, H5 feed. Everything in the stories
// and the feed is read from the Clashy program on chain: duels live on the rollup, open challenges you can take in one
// tap, settled results and clan wars. Nothing here is invented.
import { ClayLoop } from '@/ui/clay';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COIN_SYMBOLS, usdcBalance } from '@/chain/client';
import { useFeed, type FeedDuel } from '@/chain/reads';
import { useWallet } from '@/chain/wallet';
import { useDeskColumn, useLayout } from '@/ui/layout';
import { Bolt } from '@/ui/icons';
import { ART, Avatar, Btn, Card, ErrorLine, Pending, Row, SkeletonRows, Txt, UnderTabs, Wordmark } from '@/ui/kit';
import { C, F, S } from '@/ui/tokens';

type Tab = 'foryou' | 'clans';
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const ago = (ts: number) => {
  const s = Math.max(0, Date.now() / 1000 - ts);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
};

/** A story bubble: one duel live on the rollup right now. */
const Story = ({ d }: { d: FeedDuel }) => (
  <Pressable onPress={() => router.push('/onchain')} style={{ width: 66, alignItems: 'center' }}>
    <View style={{ width: 64, height: 64, borderRadius: 32, padding: 2.5, backgroundColor: C.brand }}>
      <View style={{ flex: 1, borderRadius: 30, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="label" color="#fff" style={{ fontSize: 13 }}>{COIN_SYMBOLS[d.coin] ?? '…'}</Txt>
      </View>
    </View>
    <Txt v="small" color={C.ink} style={{ marginTop: 6, fontSize: 12 }} lines={1}>{d.stake * 2} USDC</Txt>
  </Pressable>
);

function Result({ d, me }: { d: FeedDuel; me?: string }) {
  const [a, b] = [d.creator.toBase58(), d.joiner.toBase58()];
  const name = (k: string) => (k === me ? 'You' : short(k));
  const tie = d.winner === 3;
  const w = d.winner === 1 ? a : b;
  const l = d.winner === 1 ? b : a;
  const wi = d.winner === 1 ? 0 : 1;
  const koed = !tie && !!(d.ko & (1 << (1 - wi)));
  return (
    <Card style={{ padding: 14, marginBottom: 8 }}>
      <Row style={{ gap: 10 }}>
        <Avatar name={tie ? a : w} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={2}>{tie ? `${name(a)} and ${name(b)} drew` : `${name(w)} ${koed ? 'knocked out' : 'beat'} ${name(l)}`} on {COIN_SYMBOLS[d.coin] ?? '?'}</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>{d.entry.toFixed(2)} → {d.exit.toFixed(2)} · {tie ? 'both refunded' : `won ${(d.stake * 2 - (d.stake * 2 * 300) / 10_000).toFixed(2)} USDC`} · {ago(d.ts)}</Txt>
        </View>
        {!tie ? <Txt v="label" color={C.up}>{(d.pnlBps[wi] / 100 >= 0 ? '+' : '') + (d.pnlBps[wi] / 100).toFixed(1)}%</Txt> : null}
      </Row>
    </Card>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const [tab, setTab] = useState<Tab>('foryou');
  const { desk } = useLayout();
  const [showPlay, setShowPlay] = useState(true); // one-time card; dismissing hides it for this session
  const feed = useFeed();
  const wallet = useWallet();
  const me = wallet.signer?.publicKey;
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => {
    if (!me) { setBal(null); return; }
    let alive = true;
    const run = () => usdcBalance(me).then((b) => alive && setBal(b)).catch(() => {});
    run();
    const h = setInterval(run, 5000);
    return () => { alive = false; clearInterval(h); };
  }, [me?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = feed.status === 'ready' ? feed.data : null;
  const open = f ? f.open.filter((d) => d.creator.toBase58() !== me?.toBase58()) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        {desk ? <Txt v="title">Home</Txt> : <Wordmark height={24} />}
        {wallet.status === 'out' ? <Btn title="Sign in" h={36} onPress={() => wallet.login?.()} />
          : <Btn title={me ? (bal === null ? 'Wallet' : `${bal.toFixed(2)} USDC`) : 'Wallet'} kind={me ? 'ghost' : 'brand'} h={36} onPress={() => router.push('/wallet')} />}
      </Row>

      {/* H2: live now. Each bubble is a duel being scored on the MagicBlock rollup right now. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.gutter, marginBottom: 14 }} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 10, alignItems: 'center' }}>
        {f && f.live.length ? f.live.map((d) => <Story key={d.key.toBase58()} d={d} />) : (
          <View style={{ justifyContent: 'center', paddingVertical: 8, maxWidth: 320 }}>
            <Txt v="small" style={{ lineHeight: 17 }}>{f ? 'No duels live right now. Open one and it shows here while it plays on the rollup.' : 'Loading what is live…'}</Txt>
          </View>
        )}
      </ScrollView>

      {/* H4: one-time Play now card */}
      {showPlay ? (
        <View style={{ borderRadius: 22, padding: 16, backgroundColor: C.brand, marginBottom: 18, overflow: 'hidden' }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Txt v="small" color="#D6DBFF" style={{ fontFamily: F.semi, letterSpacing: 0.6, fontSize: 11 }}>QUICK MATCH</Txt>
              <Txt v="title" color="#fff" style={{ marginTop: 4, fontSize: desk ? 34 : undefined }}>Play now</Txt>
              <Txt v="small" color="#DDE1FF" style={{ marginTop: 2 }}>Duel a rival for 5 USDC: one coin for both of you, long or short, best % in 60 s.</Txt>
            </View>
            {desk ? <ClayLoop name="hero" width={260} height={146} style={{ borderRadius: 14 }} /> : <ClayLoop name="duel" size={78} style={{ borderRadius: 18 }} />}
          </Row>
          <Row style={{ gap: 8, marginTop: 14 }}>
            <Btn title="Find a duel" kind="white" style={{ flex: 1 }} icon={<Bolt size={16} color="#000" />} onPress={() => router.push('/onchain')} />
            <Btn title="Practice" kind="ghost" style={{ flex: 0.7, backgroundColor: 'rgba(255,255,255,0.16)' }} onPress={() => router.push('/duel/match')} />
            <Btn title="Not now" kind="ghost" style={{ flex: 0.6, backgroundColor: 'rgba(0,0,0,0.2)' }} onPress={() => setShowPlay(false)} />
          </Row>
        </View>
      ) : null}

      <Pressable onPress={() => router.push('/discover')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.s1, borderRadius: 18, padding: 14, marginBottom: 18 }}>
        <Image source={ART.radar} style={{ width: 40, height: 40 }} contentFit="contain" />
        <View style={{ flex: 1 }}><Txt v="label">Trending on Solana</Txt><Txt v="small" style={{ marginTop: 2 }}>Live coins from DexScreener. Open one, or practice a duel on it.</Txt></View>
        <Txt v="small" style={{ fontFamily: F.semi, fontSize: 18 }}>›</Txt>
      </Pressable>

      {/* H5: the feed, from the chain */}
      <UnderTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'foryou', label: 'For you' }, { key: 'clans', label: 'Clans' }]} />
      {feed.status === 'loading' ? <SkeletonRows n={3} /> : feed.status === 'error' ? <ErrorLine msg={feed.error} /> : tab === 'foryou' ? (
        <>
          {open.map((d) => (
            <Card key={d.key.toBase58()} style={{ padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(91,108,255,0.45)' }}>
              <Row style={{ gap: 10 }}>
                <Avatar name={d.creator.toBase58()} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>{short(d.creator.toBase58())} wants a duel</Txt>
                  <Txt v="small" style={{ marginTop: 2 }}>{d.stake} USDC each · coin rolled by VRF when you join</Txt>
                </View>
                <Btn title="Join" h={36} onPress={() => router.push('/onchain')} />
              </Row>
            </Card>
          ))}
          {f!.settled.map((d) => <Result key={d.key.toBase58()} d={d} me={me?.toBase58()} />)}
          {open.length === 0 && f!.settled.length === 0 ? (
            <Pending art={ART.bell} title="Nothing on chain yet" body="Open challenges and settled duels show here, live from the Clashy program." action="Open a duel" onAction={() => router.push('/onchain')} />
          ) : null}
        </>
      ) : f!.wars.length === 0 ? (
        <Pending art={ART.clan} title="No clan wars settled yet" body="When a clan war settles, its result shows here." action="Open clans" onAction={() => router.push('/clans')} />
      ) : f!.wars.map((w, i) => (
        <Card key={i} style={{ padding: 14, marginBottom: 8 }}>
          <Txt v="label">{w.winner === 3 ? `${w.a} and ${w.b} tied` : `${w.winner === 1 ? w.a : w.b} beat ${w.winner === 1 ? w.b : w.a}`}</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>{w.a} {(w.returns[0] / 100).toFixed(2)}% vs {w.b} {(w.returns[1] / 100).toFixed(2)}% · pot {w.pot.toFixed(2)} USDC · {ago(w.ts)}</Txt>
        </Card>
      ))}
    </ScrollView>
  );
}
