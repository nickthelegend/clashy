// On-chain clan: a shared chest on Solana, trades proposed by any member, votes weighted by each member's
// deposit, and the captain executing passed votes at the live oracle price. Positions are scored at the
// oracle price (paper P&L on the chest's notional); the P&L is the clan's score in clan wars.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BN, COIN_SYMBOLS, LAMPORTS_PER_SOL, NET, P, PublicKey, base, byClan, clanName, pnlBps, priceOf,
} from '@/chain/client';
import { TxStrip, WalletCard, errText, short, useChain } from '@/chain/useChain';
import { Art, BackBtn, Btn, CRESTS, Card, Chips, ErrorLine, LiveDot, Row, Tag, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

type ClanView = { key: PublicKey; name: string; captain: PublicKey; crest: number; members: number; chest: number; score: number; proposals: number; war: PublicKey };
type PropView = { key: PublicKey; id: number; proposer: PublicKey; coin: number; side: number; lev: number; sizeBps: number; yes: number; no: number; deadline: number; status: number; myVote: boolean };
type PosView = { key: PublicKey; id: number; coin: number; side: number; lev: number; notional: number; entry: number; exit: number; pnl: number; open: boolean; closedAt: number };

const sol = (l: number) => (l / LAMPORTS_PER_SOL).toFixed(l % 1e7 === 0 ? 2 : 4);
const signed = (l: number) => `${l >= 0 ? '+' : '−'}${(Math.abs(l) / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
const VOTE_SECS = 60;

export default function OnchainClan() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const chain = useChain();
  const { kp, progs, hasPlayer, busy, guard, onBase, err, tick } = chain;

  const [clans, setClans] = useState<ClanView[]>([]);
  const [mine, setMine] = useState<ClanView | null>(null);
  const [myDeposit, setMyDeposit] = useState(0);
  const [props, setProps] = useState<PropView[]>([]);
  const [positions, setPositions] = useState<PosView[]>([]);
  const [prices, setPrices] = useState<(number | null)[]>([null, null, null]);
  const [now, setNow] = useState(Date.now() / 1000);
  const [loadErr, setLoadErr] = useState<string>();

  // create form
  const [name, setName] = useState('');
  const [crest, setCrest] = useState(0);
  // proposal form
  const [coin, setCoin] = useState<'0' | '1' | '2'>('0');
  const [dir, setDir] = useState<'1' | '2'>('1');
  const [lev, setLev] = useState<'2' | '5' | '10' | '20'>('5');
  const [size, setSize] = useState<'2500' | '5000' | '10000'>('5000');

  useEffect(() => {
    if (!progs || !kp) return;
    let alive = true;
    const load = async () => {
      try {
        const toView = (key: PublicKey, c: any): ClanView => ({
          key, name: clanName(c.name), captain: c.captain, crest: c.crest, members: c.members, chest: Number(c.chest),
          score: Number(c.scorePnl), proposals: Number(c.proposals), war: c.war,
        });
        const all = (await progs.base.account.clan.all()).map((a) => toView(a.publicKey, a.account));
        const player = hasPlayer ? await progs.base.account.player.fetch(P.player(kp.publicKey)).catch(() => null) : null;
        const myKey = player && !player.clan.equals(PublicKey.default) ? player.clan : null;
        const my = myKey ? all.find((c) => c.key.equals(myKey)) ?? null : null;
        const px = await Promise.all([0, 1, 2].map((i) => priceOf(progs.base, i).catch(() => null)));
        if (!alive) return;
        setClans(all.sort((a, b) => b.chest - a.chest));
        setMine(my);
        setPrices(px);
        setLoadErr(undefined);
        if (!my) { setProps([]); setPositions([]); setMyDeposit(0); return; }
        const [m, ps, pos] = await Promise.all([
          progs.base.account.member.fetch(P.member(my.key, kp.publicKey)).catch(() => null),
          progs.base.account.proposal.all(byClan(my.key)),
          progs.base.account.clanPosition.all(byClan(my.key)),
        ]);
        const votes = await base.getMultipleAccountsInfo(ps.map((p) => P.vote(p.publicKey, kp.publicKey)));
        if (!alive) return;
        setMyDeposit(m ? Number(m.deposit) : 0);
        setProps(ps.map((p, i) => ({
          key: p.publicKey, id: Number(p.account.id), proposer: p.account.proposer, coin: p.account.coin, side: p.account.side, lev: p.account.lev,
          sizeBps: p.account.sizeBps, yes: Number(p.account.yes), no: Number(p.account.no), deadline: Number(p.account.deadline), status: p.account.status, myVote: !!votes[i],
        })).sort((a, b) => b.id - a.id));
        setPositions(pos.map((p) => ({
          key: p.publicKey, id: Number(p.account.proposal), coin: p.account.coin, side: p.account.side, lev: p.account.lev, notional: Number(p.account.notional),
          entry: Number(p.account.entryPrice) / 1e6, exit: Number(p.account.exitPrice) / 1e6, pnl: Number(p.account.pnl), open: p.account.open, closedAt: Number(p.account.closedAt),
        })).sort((a, b) => Number(b.open) - Number(a.open) || b.id - a.id));
      } catch (e) { if (alive) setLoadErr(`Cannot read clans from ${NET.label}: ${errText(e)}`); }
    };
    load();
    const h = setInterval(load, 2000);
    const c = setInterval(() => setNow(Date.now() / 1000), 500);
    return () => { alive = false; clearInterval(h); clearInterval(c); };
  }, [progs, kp, hasPlayer, tick]);

  const captain = !!(mine && kp && mine.captain.equals(kp.publicKey));
  const warLocked = !!mine && !mine.war.equals(PublicKey.default);

  const create = guard('create', async () => {
    const n = name.trim();
    if (!n) throw new Error('Give your clan a name');
    if (new TextEncoder().encode(n).length > 24) throw new Error('Clan names are at most 24 bytes');
    if (clans.some((c) => c.name === n)) throw new Error(`“${n}” is taken on chain`);
    const clan = P.clan(n);
    await onBase(`Create clan ${n}`, () => progs!.base.methods.createClan(n, crest).accountsPartial({ founder: kp!.publicKey, clan, chest: P.chest(clan), member: P.member(clan, kp!.publicKey) }).rpc());
    setName('');
  });
  const join = (c: ClanView) => guard(`join-${c.name}`, () => onBase(`Join ${c.name}`, () => progs!.base.methods.joinClan().accountsPartial({ wallet: kp!.publicKey, clan: c.key, member: P.member(c.key, kp!.publicKey) }).rpc()))();
  const deposit = (amt: number) => guard(`dep-${amt}`, () => onBase(`Deposit ${amt} SOL to the chest`, () => progs!.base.methods.depositChest(new BN(amt * LAMPORTS_PER_SOL)).accountsPartial({ wallet: kp!.publicKey, clan: mine!.key, member: P.member(mine!.key, kp!.publicKey), chest: P.chest(mine!.key) }).rpc()))();
  const withdraw = guard('withdraw', () => onBase('Withdraw my deposit', () => progs!.base.methods.withdrawChest(new BN(myDeposit)).accountsPartial({ wallet: kp!.publicKey, clan: mine!.key, member: P.member(mine!.key, kp!.publicKey), chest: P.chest(mine!.key) }).rpc()));
  const leave = guard('leave', () => onBase(`Leave ${mine!.name}`, () => progs!.base.methods.leaveClan().accountsPartial({ wallet: kp!.publicKey, clan: mine!.key, member: P.member(mine!.key, kp!.publicKey) }).rpc()));
  const propose = guard('propose', async () => {
    const prop = P.proposal(mine!.key, mine!.proposals);
    const what = `${dir === '1' ? 'Long' : 'Short'} ${COIN_SYMBOLS[+coin]} ${lev}× · ${+size / 100}% of chest`;
    await onBase(`Propose ${what}`, () => progs!.base.methods.propose(+coin, +dir, +lev, +size, new BN(VOTE_SECS)).accountsPartial({ wallet: kp!.publicKey, clan: mine!.key, member: P.member(mine!.key, kp!.publicKey), proposal: prop }).rpc());
  });
  const vote = (p: PropView, yes: boolean) => guard(`vote-${p.id}`, () => onBase(`Vote ${yes ? 'yes' : 'no'} on #${p.id}`, () => progs!.base.methods.vote(yes).accountsPartial({ wallet: kp!.publicKey, clan: mine!.key, member: P.member(mine!.key, kp!.publicKey), proposal: p.key, vote: P.vote(p.key, kp!.publicKey) }).rpc()))();
  const execute = (p: PropView) => guard(`exec-${p.id}`, () => onBase(`Execute #${p.id} at the oracle price`, () => progs!.base.methods.executeProposal().accountsPartial({ captain: kp!.publicKey, clan: mine!.key, proposal: p.key, position: P.position(mine!.key, p.id), price: P.baseFeed(p.coin) }).rpc()))();
  const reject = (p: PropView) => guard(`rej-${p.id}`, () => onBase(`Close failed vote #${p.id}`, () => progs!.base.methods.rejectProposal().accountsPartial({ proposal: p.key }).rpc()))();
  const closePos = (p: PosView) => guard(`close-${p.id}`, () => onBase(`Close position #${p.id}`, () => progs!.base.methods.closePosition().accountsPartial({ captain: kp!.publicKey, clan: mine!.key, position: p.key, price: P.baseFeed(p.coin) }).rpc()))();

  const openProps = props.filter((p) => p.status === 0);
  const pastProps = props.filter((p) => p.status !== 0).slice(0, 4);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Clan chest</Txt><Txt v="small">{NET.label} · votes weighted by deposit</Txt></View>
        <Row style={{ gap: 6 }}><LiveDot color={C.up} /><Txt v="small" color={C.up}>On chain</Txt></Row>
      </Row>

      <WalletCard chain={chain} note="clan trades are scored at the oracle price" />
      {err ? <ErrorLine msg={err} /> : null}
      {loadErr ? <ErrorLine msg={loadErr} /> : null}

      {!mine ? (
        <>
          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Start a clan</Txt>
          <Card style={{ padding: 14 }}>
            <View style={{ backgroundColor: C.s2, borderRadius: 12, paddingHorizontal: 12, height: 46, justifyContent: 'center' }}>
              <TextInput value={name} onChangeText={setName} placeholder="Clan name (24 bytes max)" placeholderTextColor={C.muted} maxLength={24}
                autoCorrect={false} style={{ color: C.ink, fontFamily: F.medium, fontSize: 15 }} />
            </View>
            <Txt v="small" style={{ marginTop: 10, marginBottom: 6 }}>Crest</Txt>
            <Row style={{ gap: 6, flexWrap: 'wrap' }}>
              {CRESTS.map((src, i) => (
                <Pressable key={i} onPress={() => setCrest(i)} accessibilityLabel={`Crest ${i + 1}`} style={{ borderRadius: 14, borderWidth: 2, borderColor: crest === i ? C.brand : 'transparent', padding: 2 }}>
                  <Art src={src} size={44} radius={12} />
                </Pressable>
              ))}
            </Row>
            <Btn title={busy === 'create' ? 'Creating…' : 'Create clan · you are captain'} style={{ marginTop: 12 }} disabled={!hasPlayer || !!busy} onPress={create} />
          </Card>

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Clans on chain</Txt>
          {clans.length === 0 ? (
            <Card style={{ alignItems: 'center', padding: 16 }}><Txt v="small" style={{ textAlign: 'center' }}>No clans on {NET.label} yet. Start the first one.</Txt></Card>
          ) : clans.map((c) => (
            <Card key={c.key.toBase58()} style={{ marginBottom: 8, padding: 12 }}>
              <Row style={{ gap: 12 }}>
                <Art src={CRESTS[c.crest % CRESTS.length]} size={48} radius={12} />
                <View style={{ flex: 1 }}>
                  <Txt v="label">{c.name}</Txt>
                  <Txt v="small">{c.members} member{c.members === 1 ? '' : 's'} · chest {sol(c.chest)} SOL · score {signed(c.score)}</Txt>
                </View>
                <Btn title="Join" h={38} disabled={!hasPlayer || !!busy} onPress={() => join(c)} />
              </Row>
            </Card>
          ))}
        </>
      ) : (
        <>
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={{ marginTop: 12, padding: 16 }}>
              <Row style={{ gap: 14 }}>
                <Art src={CRESTS[mine.crest % CRESTS.length]} size={72} radius={18} />
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: 8 }}><Txt v="title">{mine.name}</Txt>{captain ? <Tag text="Captain" color={C.brand} /> : null}</Row>
                  <Txt v="small">{mine.members} member{mine.members === 1 ? '' : 's'} · captain {short(mine.captain.toBase58())}</Txt>
                  {warLocked ? <Txt v="small" color={C.opp}>At war · withdrawals locked until it settles</Txt> : null}
                </View>
              </Row>
              <Row style={{ marginTop: 14, gap: 8 }}>
                {[['Chest · SOL', sol(mine.chest), C.ink], ['Your share', mine.chest ? `${((myDeposit / mine.chest) * 100).toFixed(0)}%` : '0%', C.brandSoft], ['Score · SOL', `${mine.score >= 0 ? '+' : '−'}${(Math.abs(mine.score) / LAMPORTS_PER_SOL).toFixed(4)}`, mine.score >= 0 ? C.up : C.down]].map(([k, v, c]) => (
                  <View key={k} style={{ flex: 1, backgroundColor: C.s2, borderRadius: 12, padding: 10 }}>
                    <Txt v="small" lines={1}>{k}</Txt><Txt v="label" color={c} lines={1}>{v}</Txt>
                  </View>
                ))}
              </Row>
              <Row style={{ marginTop: 12, gap: 8 }}>
                <Btn title="Deposit 0.1" kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy} onPress={() => deposit(0.1)} />
                <Btn title="Deposit 0.5" kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy} onPress={() => deposit(0.5)} />
                {myDeposit > 0
                  ? <Btn title="Withdraw" kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy || warLocked} onPress={withdraw} />
                  : !captain ? <Btn title="Leave" kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy} onPress={leave} /> : null}
              </Row>
              <Txt v="small" style={{ marginTop: 8 }}>You put in {sol(myDeposit)} SOL. Your vote counts by that amount.</Txt>
            </Card>
          </Animated.View>

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Propose a trade</Txt>
          <Card style={{ padding: 14 }}>
            <Chips items={COIN_SYMBOLS.map((s, i) => ({ key: String(i) as '0' | '1' | '2', label: `${s}${prices[i] ? ` $${prices[i]!.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}` }))} value={coin} onChange={setCoin} />
            <Chips items={[{ key: '1', label: 'Long ▲' }, { key: '2', label: 'Short ▼' }]} value={dir} onChange={setDir} />
            <Chips items={(['2', '5', '10', '20'] as const).map((k) => ({ key: k, label: `${k}×` }))} value={lev} onChange={setLev} />
            <Chips items={[{ key: '2500', label: '25% of chest' }, { key: '5000', label: '50%' }, { key: '10000', label: '100%' }]} value={size} onChange={setSize} />
            <Btn title={busy === 'propose' ? 'Proposing…' : `Put it to a vote · ${VOTE_SECS} s`} kind={dir === '1' ? 'long' : 'short'} disabled={!!busy || mine.chest === 0} onPress={propose} />
            <Txt v="small" style={{ marginTop: 8 }}>{mine.chest === 0 ? 'Deposit first: an empty chest has nothing to trade.' : `Passes with more yes than no, early once yes holds over half the chest. Size: ${sol((mine.chest * +size) / 10_000)} SOL notional.`}</Txt>
          </Card>

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Votes</Txt>
          {openProps.length === 0 ? <Card style={{ padding: 14 }}><Txt v="small">No open votes. Propose a trade above.</Txt></Card> : openProps.map((p) => {
            const left = Math.max(0, Math.ceil(p.deadline - now));
            const total = p.yes + p.no;
            const passed = p.yes > p.no && (left === 0 || p.yes * 2 > mine.chest);
            const failed = left === 0 && p.yes <= p.no;
            return (
              <Card key={p.key.toBase58()} style={{ marginBottom: 8, padding: 14 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="label" color={p.side === 1 ? C.up : C.down}>#{p.id} {p.side === 1 ? 'Long' : 'Short'} {COIN_SYMBOLS[p.coin]} {p.lev}×</Txt>
                  <Txt v="small" color={left ? C.ink : C.muted}>{left ? `${left} s left` : 'Voting closed'}</Txt>
                </Row>
                <Txt v="small">{p.sizeBps / 100}% of the chest · proposed by {kp && p.proposer.equals(kp.publicKey) ? 'you' : short(p.proposer.toBase58())}</Txt>
                <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: C.s2, marginTop: 10 }}>
                  <View style={{ flex: total ? p.yes : 0, backgroundColor: C.up }} /><View style={{ flex: total ? p.no : 1, backgroundColor: total ? C.down : C.s2 }} />
                </View>
                <Txt v="small" style={{ marginTop: 6 }}>Yes {sol(p.yes)} SOL · No {sol(p.no)} SOL · chest {sol(mine.chest)} SOL</Txt>
                <Row style={{ gap: 8, marginTop: 10 }}>
                  {!p.myVote && left > 0 ? (
                    <>
                      <Btn title="Vote yes" kind="long" h={40} style={{ flex: 1 }} disabled={!!busy || myDeposit === 0} onPress={() => vote(p, true)} />
                      <Btn title="Vote no" kind="short" h={40} style={{ flex: 1 }} disabled={!!busy || myDeposit === 0} onPress={() => vote(p, false)} />
                    </>
                  ) : p.myVote ? <Txt v="small" color={C.brandSoft}>You voted.</Txt> : null}
                  {passed && captain ? <Btn title="Execute at oracle price" h={40} style={{ flex: 1 }} disabled={!!busy} onPress={() => execute(p)} /> : null}
                  {passed && !captain ? <Txt v="small" color={C.up}>Passed · waiting for the captain</Txt> : null}
                  {failed ? <Btn title="Close failed vote" kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy} onPress={() => reject(p)} /> : null}
                </Row>
                {myDeposit === 0 && !p.myVote && left > 0 ? <Txt v="small" style={{ marginTop: 6 }}>Deposit to get a vote.</Txt> : null}
              </Card>
            );
          })}

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Positions</Txt>
          {positions.length === 0 ? <Card style={{ padding: 14 }}><Txt v="small">No positions yet. A passed vote becomes one when the captain executes it.</Txt></Card> : positions.slice(0, 8).map((p) => {
            const px = prices[p.coin];
            const live = p.open && px ? (p.notional * pnlBps(p.entry, px, p.side, p.lev)) / 10_000 : p.pnl;
            return (
              <Card key={p.key.toBase58()} style={{ marginBottom: 8, padding: 14 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="label" color={p.side === 1 ? C.up : C.down}>{p.side === 1 ? 'Long' : 'Short'} {COIN_SYMBOLS[p.coin]} {p.lev}×</Txt>
                  {p.open ? <Row style={{ gap: 6 }}><LiveDot color={C.up} /><Txt v="small" color={C.up}>Open</Txt></Row> : <Txt v="small">Closed</Txt>}
                </Row>
                <Txt v="small">{sol(p.notional)} SOL notional · entry ${p.entry.toFixed(2)} → {p.open ? (px ? `now $${px.toFixed(2)}` : 'price loading') : `exit $${p.exit.toFixed(2)}`}</Txt>
                <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
                  <Txt v="title" color={live >= 0 ? C.up : C.down}>{signed(Math.round(live))}</Txt>
                  {p.open && captain ? <Btn title="Close at oracle price" kind="white" h={40} disabled={!!busy} onPress={() => closePos(p)} /> : null}
                </Row>
                {p.open ? <Txt v="small" style={{ marginTop: 4 }}>Live P&L at the rollup price; booked to the clan score at close.</Txt> : null}
              </Card>
            );
          })}
          {pastProps.length ? <Txt v="small" style={{ marginTop: 4 }}>Past votes: {pastProps.map((p) => `#${p.id} ${p.status === 1 ? 'executed' : 'failed'}`).join(' · ')}</Txt> : null}
        </>
      )}

      <TxStrip txs={chain.txs} />
    </ScrollView>
  );
}
