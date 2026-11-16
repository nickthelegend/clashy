// Clans: your on-chain clan as a hero card, then every clan on chain to join. The list, members, chests and scores
// are program accounts on Solana; creating, joining, the chest, votes and wars happen on the on-chain clan screen.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeskColumn } from '@/ui/layout';
import { readPlayer } from '@/chain/client';
import { useClansOnchain } from '@/chain/reads';
import { useWallet } from '@/chain/wallet';
import { Search } from '@/ui/icons';
import { ART, Art, Btn, CRESTS, ErrorLine, IconBtn, Pending, Press, Row, SearchBar, SkeletonRows, Txt } from '@/ui/kit';
import { C, F, R, S } from '@/ui/tokens';

export default function Clans() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn();
  const clans = useClansOnchain();
  const wallet = useWallet();
  const me = wallet.signer?.publicKey ?? null;
  const [myClan, setMyClan] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!me) { setMyClan(null); return; }
    readPlayer(me).then((p) => setMyClan(p && p.clan.toBase58() !== '11111111111111111111111111111111' ? p.clan.toBase58() : null)).catch(() => setMyClan(null));
  }, [me?.toBase58(), clans.status === 'ready' ? clans.data.length : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = clans.status === 'ready' ? clans.data : [];
  const mine = rows.find((c) => c.key.toBase58() === myClan);
  const list = rows.filter((c) => c !== mine && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  const open = () => router.push('/onchain-clan');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Txt v="title">Clans</Txt>
        <Row style={{ gap: 8 }}>
          <IconBtn size={36} onPress={() => setSearching((s) => !s)}><Search size={17} color={C.ink} /></IconBtn>
          <Btn title={mine ? 'My clan' : 'Create'} h={36} onPress={open} />
        </Row>
      </Row>
      {searching ? <View style={{ marginBottom: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Search clans" /></View> : null}

      {/* your clan hero */}
      <LinearGradient colors={['#2A33A8', '#5B6CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 16 }}>
        <Press onPress={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Art src={mine ? CRESTS[mine.crest % CRESTS.length] : ART.crestCreate} size={60} radius={16} />
          <View style={{ flex: 1 }}>
            <Txt v="small" color="#D6DBFF" style={{ fontFamily: F.semi, fontSize: 11, letterSpacing: 0.6 }}>YOUR CLAN</Txt>
            <Txt v="h2" color="#fff" style={{ marginTop: 2 }}>{mine ? mine.name : 'No clan yet'}</Txt>
            <Txt v="small" color="#DDE1FF" style={{ marginTop: 2 }}>
              {mine ? `${mine.members} member${mine.members === 1 ? '' : 's'} · chest ${mine.chest.toFixed(2)} USDC · ${mine.wins}W ${mine.losses}L${mine.atWar ? ' · at war' : ''}`
                : 'Pool USDC in a shared chest, vote on trades, fight other clans for their stake.'}
            </Txt>
          </View>
        </Press>
        <Row style={{ gap: 8, marginTop: 14 }}>
          <Btn title={mine ? 'Open clan' : me ? 'Start a clan' : 'Sign in to start one'} kind="white" style={{ flex: 1 }} onPress={me ? open : () => wallet.login?.()} />
          <Btn title="Find one" kind="ghost" style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.16)' }} onPress={() => setSearching(true)} />
        </Row>
        <Row style={{ gap: 8, marginTop: 8 }}>
          <Btn title="Practice chest" kind="ghost" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={() => router.push('/clan/chest')} />
          <Btn title="Skirmish" kind="ghost" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={() => router.push('/game/skirmish')} />
        </Row>
        <Txt v="small" color="#C9CEFF" style={{ marginTop: 8, textAlign: 'center' }}>Clans are on chain: a USDC chest, share-weighted votes, clan wars · practice modes are free</Txt>
      </LinearGradient>

      <Row style={{ justifyContent: 'space-between', marginTop: 20, marginBottom: 6 }}>
        <Txt v="h2">Discover</Txt>
        <Txt v="small">{clans.status === 'ready' ? `${rows.length} clan${rows.length === 1 ? '' : 's'} on chain` : ''}</Txt>
      </Row>
      {clans.status === 'loading' ? (
        <SkeletonRows n={4} square />
      ) : clans.status === 'error' ? (
        <ErrorLine msg={clans.error} />
      ) : list.length === 0 ? (
        <Pending art={q ? ART.emptySearch : ART.clan} title={q ? 'No clans match' : mine ? 'No other clans yet' : 'No clans yet'} body={q ? 'Try another name, or start your own clan.' : 'Be the first: start a clan and invite your friends.'} />
      ) : (
        list.map((c) => (
          <Press key={c.key.toBase58()} onPress={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
            <Art src={CRESTS[c.crest % CRESTS.length]} size={46} radius={13} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" lines={1}>{c.name}</Txt>
              <Txt v="small" style={{ marginTop: 2 }} lines={1}>{c.members} member{c.members === 1 ? '' : 's'} · chest {c.chest.toFixed(2)} USDC · {c.wins}W {c.losses}L{c.atWar ? ' · at war' : ''}</Txt>
            </View>
            {mine ? null : <Btn title="Join" kind="ghost" h={34} onPress={open} />}
          </Press>
        ))
      )}
      <View style={{ height: 1, marginTop: 4, borderRadius: R.sm }} />
    </ScrollView>
  );
}
