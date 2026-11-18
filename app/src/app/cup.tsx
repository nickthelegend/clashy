// Weekly Cup: who is calling it best. Standing = the profit on stock positions bought through the Stash (live value
// minus cost plus realized, from on-chain Holdings marked to the crank's prices; Holdings keep no buy dates, so this
// part is not limited to the week) plus duel winnings settled this week. Resets Monday 00:00 UTC. Read from the chain; nothing is entered by hand.
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/chain/wallet';
import { isTestAccount, readHoldings, reader, usePoll, usePrices, useProfiles, type Profile } from '@/chain/social';
import { STOCKS } from '@/chain/stocks';
import { ClayLoop } from '@/ui/clay';
import { ProfileAvatar } from '@/ui/feed';
import { ART, BackBtn, Btn, ErrorLine, Row, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, FONT, fmtUsd } from '@/ui/tokens';

const WEEK = 7 * 86_400;
/** Monday 00:00 UTC of the current week. */
const weekStart = (now = Date.now() / 1000) => { const d = Math.floor(now / 86_400); const dow = (d + 3) % 7; return (d - dow) * 86_400; };

type Row_ = { owner: PublicKey; profile?: Profile; stocks: number; duels: number; total: number };
async function standings(prices: Record<string, number>, profiles: Map<string, Profile>): Promise<Row_[]> {
  const start = weekStart();
  // duel winnings settled this week: pot minus rake to the winner, minus the stake each side put in
  const duels = (await reader.account.duel.all()).filter((d) => d.account.status === 5 && Number(d.account.endTs) >= start);
  const score = new Map<string, Row_>();
  const get = (k: PublicKey) => score.get(k.toBase58()) ?? score.set(k.toBase58(), { owner: k, profile: profiles.get(k.toBase58()), stocks: 0, duels: 0, total: 0 }).get(k.toBase58())!;
  for (const { account: d } of duels) {
    if (d.winner !== 1 && d.winner !== 2) continue;
    const stake = Number(d.stake) / 1e6;
    const [w, l] = d.winner === 1 ? [d.creator, d.joiner] : [d.joiner, d.creator];
    get(w).duels += stake * 2 * 0.97 - stake;
    get(l).duels -= stake;
  }
  // stock calls: every player with a profile, each stock they hold through the Stash, marked to market
  const owners = [...profiles.values()].filter((p) => !isTestAccount(p)).map((p) => p.owner);
  const pairs = owners.flatMap((owner) => STOCKS.map((s) => ({ owner, mint: new PublicKey(s.mint) })));
  const hold = await readHoldings(pairs);
  for (const h of hold.values()) {
    const px = prices[h.stock.symbol];
    if (!px || h.shares <= 0) continue;
    get(h.owner).stocks += h.shares * px - h.cost + h.realized;
  }
  return [...score.values()].filter((r) => !isTestAccount(r.profile) && !!r.profile).map((r) => ({ ...r, total: r.stocks + r.duels })).filter((r) => Math.abs(r.total) > 0.0001).sort((a, b) => b.total - a.total);
}

export default function Cup() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const wallet = useWallet();
  const me = wallet.signer?.publicKey?.toBase58();
  const prices = usePrices();
  const profiles = useProfiles();
  const ready = prices.status === 'ready' && profiles.status === 'ready';
  const board = usePoll(() => (ready ? standings(prices.data, profiles.data) : Promise.resolve([])), 8000, [ready]);
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => { const h = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(h); }, []);
  const left = Math.max(0, weekStart(now) + WEEK - now);
  const parts = [Math.floor(left / 86_400), Math.floor((left % 86_400) / 3600), Math.floor((left % 3600) / 60), Math.floor(left % 60)];
  const rows = board.status === 'ready' ? board.data : [];
  const top = [rows[1], rows[0], rows[2]];
  const myIdx = rows.findIndex((r) => r.owner.toBase58() === me);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 40 }}>
      <Row style={{ gap: 10 }}>
        <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1 }} />
      </Row>
      <View style={{ alignItems: 'center', marginTop: -6 }}>
        <ClayLoop name="cupBig" size={170} style={{ borderRadius: 24 }} />
        <View style={{ backgroundColor: C.opp, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 }}>
          <Txt v="small" color="#fff" style={{ ...FONT.bold, fontSize: 11, letterSpacing: 0.6 }}>Live · ends Monday 00:00 UTC</Txt>
        </View>
        <Txt v="title" style={{ fontSize: 44, marginTop: 8, ...FONT.display, letterSpacing: -1 }}>Weekly Cup</Txt>
        <Txt v="small" style={{ textAlign: 'center', marginTop: 2 }}>Profit on the stocks in your Stash, plus clash winnings this week.</Txt>
      </View>
      <Row style={{ gap: 8, marginTop: 14 }}>
        {['Days', 'Hrs', 'Min', 'Sec'].map((k, i) => (
          <View key={k} style={{ flex: 1, backgroundColor: i === 3 ? C.brand : C.s1, borderRadius: 14, paddingVertical: 10, alignItems: 'center' }}>
            <Txt v="title" style={{ fontSize: 26 }} color={i === 3 ? C.onBrand : C.ink}>{String(parts[i]).padStart(2, '0')}</Txt>
            <Txt v="small" color={i === 3 ? 'rgba(22,15,51,0.72)' : C.muted} style={{ fontSize: 10, ...FONT.semi }}>{k}</Txt>
          </View>
        ))}
      </Row>

      {board.status === 'error' ? <ErrorLine msg={board.error} /> : board.status === 'loading' || !ready ? <SkeletonRows n={5} /> : rows.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Image source={ART.podium} style={{ width: 120, height: 120 }} contentFit="contain" />
          <Txt v="h2" style={{ marginTop: 8 }}>Nobody on the board yet</Txt>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 4 }}>Buy a stock from your Stash or win a clash to get ranked.</Txt>
        </View>
      ) : (
        <>
          <Row style={{ alignItems: 'flex-end', gap: 8, marginTop: 22 }}>
            {top.map((r, i) => {
              const place = i === 1 ? 1 : i === 0 ? 2 : 3;
              if (!r) return <View key={i} style={{ flex: 1 }} />;
              return (
                <View key={r.owner.toBase58()} style={{ flex: 1, alignItems: 'center' }}>
                  {place === 1 ? <Image source={ART.crown} style={{ width: 28, height: 28, marginBottom: -4 }} contentFit="contain" /> : null}
                  <ProfileAvatar p={r.profile} size={place === 1 ? 64 : 50} />
                  <Txt v="label" lines={1} style={{ marginTop: 4 }}>{r.profile?.name ?? 'player'}</Txt>
                  <Txt v="small" color={r.total >= 0 ? C.up : C.down}>{r.total >= 0 ? '+' : '−'}{fmtUsd(Math.abs(r.total))}</Txt>
                  <View style={{ width: '100%', height: place === 1 ? 70 : place === 2 ? 50 : 36, marginTop: 6, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: place === 1 ? C.brand : C.s1, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt v="h2" color={place === 1 ? C.onBrand : C.ink} style={{ ...FONT.display, fontSize: 22 }}>{place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'}</Txt>
                  </View>
                </View>
              );
            })}
          </Row>
          <View style={{ backgroundColor: C.s1, borderRadius: 18, paddingVertical: 4, marginTop: 0 }}>
            {rows.slice(3).map((r, i) => (
              <Row key={r.owner.toBase58()} style={{ gap: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: r.owner.toBase58() === me ? 'rgba(171,159,242,0.15)' : 'transparent' }}>
                <Txt v="label" style={{ width: 28 }}>{i + 4}</Txt>
                <ProfileAvatar p={r.profile} size={30} />
                <Txt v="label" style={{ flex: 1 }} lines={1}>{r.profile?.name ?? 'player'}</Txt>
                <Txt v="label" color={r.total >= 0 ? C.up : C.down}>{r.total >= 0 ? '+' : '−'}{fmtUsd(Math.abs(r.total))}</Txt>
              </Row>
            ))}
          </View>
          <View style={{ marginTop: 14, backgroundColor: C.s1, borderRadius: 18, padding: 12, borderWidth: 1.5, borderColor: myIdx >= 0 ? C.opp : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt v="label" style={{ width: 34 }}>{myIdx >= 0 ? `#${myIdx + 1}` : '–'}</Txt>
            <View style={{ flex: 1 }}>
              <Txt v="label">{myIdx >= 0 ? 'You' : 'Not ranked yet'}</Txt>
              <Txt v="small">{myIdx >= 0 ? `${rows[myIdx].total >= 0 ? '+' : '−'}${fmtUsd(Math.abs(rows[myIdx].total))} this week` : 'Buy a stock or win a clash'}</Txt>
            </View>
            <Btn title="Play" h={40} onPress={() => router.push('/arena')} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
