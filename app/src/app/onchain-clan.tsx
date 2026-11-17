// On-chain clan: a shared chest on Solana, trades proposed by any member, votes weighted by each member's
// deposit, and the captain executing passed votes at the live oracle price. Positions are scored at the
// oracle price (paper P&L on the chest's notional); the P&L is the clan's score in clan wars.
// Wars: a captain stakes part of the chest against a rival clan; the rival captain accepts with the same
// stake; when the window ends the clan with the better return takes the pot (minus rake) into its chest.
import { Buffer } from 'buffer';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BN, COIN_SYMBOLS, NET, P, PROGRAM_ID, PublicKey, USDC, USDC_MINT, usdcAta, base, basePriceOf, byClan, clanName, pnlBps,
} from '@/chain/client';
import { reader } from '@/chain/reads';
import { TxStrip, WalletCard, errText, short, useChain } from '@/chain/useChain';
import { Art, BackBtn, Btn, CRESTS, Card, Chips, ErrorLine, LiveDot, Row, Tag, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

type ClanView = { key: PublicKey; name: string; captain: PublicKey; crest: number; members: number; chest: number; shares: number; openVotes: number; positionsOpen: number; score: number; proposals: number; war: PublicKey };
type PropView = { key: PublicKey; id: number; proposer: PublicKey; coin: number; side: number; lev: number; sizeBps: number; yes: number; no: number; deadline: number; status: number; myVote: boolean };
type WarView = { key: PublicKey; a: PublicKey; b: PublicKey; nonce: number; stake: number; startTs: number; endTs: number; baseA: number; baseB: number; chestA: number; chestB: number; returnBps: number[]; status: number; winner: number };
type PosView = { key: PublicKey; id: number; coin: number; side: number; lev: number; notional: number; entry: number; exit: number; pnl: number; open: boolean; closedAt: number };

/** Vote tallies are in chest shares, shown as a share of the whole chest. */
const pct = (part: number, total: number) => `${total ? Math.round((part / total) * 100) : 0}%`;
/** USDC base units as "12.50". */
const usdc = (u: number) => (u / USDC).toFixed(2);
const signed = (u: number) => `${u >= 0 ? '+' : '−'}${(Math.abs(u) / USDC).toFixed(2)} USDC`;
const VOTE_SECS = 60;
/** Each clan's war stake, in USDC (at most half its chest). */
const WAR_STAKE_USDC = 5;
/** Chest top-ups, in USDC. */
const TOP_UPS = [5, 20];
const WAR_LENGTHS = [{ key: '120', label: '2 min' }, { key: '3600', label: '1 hour' }, { key: '86400', label: '1 day' }] as const;
const retBps = (score: number, base: number, chest: number) => (chest ? ((score - base) * 10_000) / chest : 0);

export default function OnchainClan() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const chain = useChain();
  const { me: wallet, sponsor, progs, hasPlayer, busy, guard, onBase, err, tick } = chain;

  const [clans, setClans] = useState<ClanView[]>([]);
  const [mine, setMine] = useState<ClanView | null>(null);
  const [myDeposit, setMyDeposit] = useState(0);
  const [myShares, setMyShares] = useState(0);
  const [props, setProps] = useState<PropView[]>([]);
  const [positions, setPositions] = useState<PosView[]>([]);
  const [prices, setPrices] = useState<(number | null)[]>([null, null, null]);
  const [now, setNow] = useState(Date.now() / 1000);
  const [loadErr, setLoadErr] = useState<string>();
  const [wars, setWars] = useState<WarView[]>([]);
  const [rival, setRival] = useState<string>('');
  const [rivalQ, setRivalQ] = useState('');
  const [warLen, setWarLen] = useState<'120' | '3600' | '86400'>('120');

  // create form
  const [name, setName] = useState('');
  const [crest, setCrest] = useState(0);
  // proposal form
  const [coin, setCoin] = useState<'0' | '1' | '2'>('0');
  const [dir, setDir] = useState<'1' | '2'>('1');
  // clan trades are unleveraged: the chest moves 1:1 with the price, like owning it
  const lev = '1';
  const [size, setSize] = useState<'2500' | '5000' | '10000'>('5000');

  useEffect(() => {
    // clans are public: read them whether or not this device has signed in (signed out = browse only)
    const rp = progs?.base ?? reader;
    let alive = true;
    const load = async () => {
      try {
        const toView = (key: PublicKey, c: any): ClanView => ({
          key, name: clanName(c.name), captain: c.captain, crest: c.crest, members: c.members, chest: Number(c.chest), shares: Number(c.shares), openVotes: c.openVotes, positionsOpen: c.positionsOpen,
          score: Number(c.scorePnl), proposals: Number(c.proposals), war: c.war,
        });
        const all = (await rp.account.clan.all()).map((a) => toView(a.publicKey, a.account));
        const player = wallet && hasPlayer ? await rp.account.player.fetch(P.player(wallet)).catch(() => null) : null;
        const myKey = player && !player.clan.equals(PublicKey.default) ? player.clan : null;
        const my = myKey ? all.find((c) => c.key.equals(myKey)) ?? null : null;
        const px = await Promise.all([0, 1, 2].map((i) => basePriceOf(rp, i).catch(() => null)));
        if (!alive) return;
        setClans(all.sort((a, b) => b.chest - a.chest));
        setMine(my);
        setPrices(px);
        setLoadErr(undefined);
        if (!my || !wallet) { setProps([]); setPositions([]); setMyDeposit(0); setMyShares(0); return; }
        const [m, ps, pos, warsA, warsB] = await Promise.all([
          rp.account.member.fetch(P.member(my.key, wallet)).catch(() => null),
          rp.account.proposal.all(byClan(my.key)),
          rp.account.clanPosition.all(byClan(my.key)),
          rp.account.war.all([{ memcmp: { offset: 8, bytes: my.key.toBase58() } }]),
          rp.account.war.all([{ memcmp: { offset: 40, bytes: my.key.toBase58() } }]),
        ]);
        const votes = await base.getMultipleAccountsInfo(ps.map((p) => P.vote(p.publicKey, wallet)));
        if (!alive) return;
        setMyDeposit(m ? Number(m.deposit) : 0);
        setMyShares(m ? Number(m.shares) : 0);
        setWars([...warsA, ...warsB].map((w) => ({
          key: w.publicKey, a: w.account.clanA, b: w.account.clanB, nonce: Number(w.account.nonce), stake: Number(w.account.stake),
          startTs: Number(w.account.startTs), endTs: Number(w.account.endTs), baseA: Number(w.account.baseA), baseB: Number(w.account.baseB),
          chestA: Number(w.account.chestA), chestB: Number(w.account.chestB), returnBps: w.account.returnBps.map((x: BN) => Number(x)),
          status: w.account.status, winner: w.account.winner,
        })).sort((x, y) => y.nonce - x.nonce));
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
  }, [progs, wallet, hasPlayer, tick]);

  const captain = !!(mine && wallet && mine.captain.equals(wallet));
  const warLocked = !!mine && !mine.war.equals(PublicKey.default);

  const create = guard('create', async () => {
    const n = name.trim();
    if (!n) throw new Error('Give your clan a name');
    if (new TextEncoder().encode(n).length > 24) throw new Error('Clan names are at most 24 bytes');
    if (clans.some((c) => c.name === n)) throw new Error(`“${n}” is taken on chain`);
    const clan = P.clan(n);
    await onBase(`Create clan ${n}`, () => progs!.base.methods.createClan(n, crest).accountsPartial({ founder: wallet!, payer: sponsor!, clan, chest: P.chest(clan), member: P.member(clan, wallet!), usdcMint: USDC_MINT }).rpc());
    setName('');
  });
  const join = (c: ClanView) => guard(`join-${c.name}`, () => onBase(`Join ${c.name}`, () => progs!.base.methods.joinClan().accountsPartial({ wallet: wallet!, payer: sponsor!, clan: c.key, member: P.member(c.key, wallet!) }).rpc()))();
  const deposit = (amt: number) => guard(`dep-${amt}`, () => onBase(`Deposit ${amt} USDC to the chest`, () => progs!.base.methods.depositChest(new BN(amt * USDC)).accountsPartial({ wallet: wallet!, clan: mine!.key, member: P.member(mine!.key, wallet!), chest: P.chest(mine!.key), walletUsdc: usdcAta(wallet!) }).rpc()))();
  const withdraw = guard('withdraw', () => onBase('Cash out my shares', () => progs!.base.methods.withdrawChest(new BN(myShares)).accountsPartial({ wallet: wallet!, clan: mine!.key, member: P.member(mine!.key, wallet!), chest: P.chest(mine!.key), walletUsdc: usdcAta(wallet!) }).rpc()));
  const leave = guard('leave', () => onBase(`Leave ${mine!.name}`, () => progs!.base.methods.leaveClan().accountsPartial({ wallet: wallet!, clan: mine!.key, member: P.member(mine!.key, wallet!), rentPayer: sponsor! }).rpc()));
  const propose = guard('propose', async () => {
    const prop = P.proposal(mine!.key, mine!.proposals);
    const what = `${dir === '1' ? 'Long' : 'Short'} ${COIN_SYMBOLS[+coin]} · ${+size / 100}% of chest`;
    await onBase(`Propose ${what}`, () => progs!.base.methods.propose(+coin, +dir, +lev, +size, new BN(VOTE_SECS)).accountsPartial({ wallet: wallet!, payer: sponsor!, clan: mine!.key, member: P.member(mine!.key, wallet!), proposal: prop }).rpc());
  });
  const vote = (p: PropView, yes: boolean) => guard(`vote-${p.id}`, () => onBase(`Vote ${yes ? 'yes' : 'no'} on #${p.id}`, () => progs!.base.methods.vote(yes).accountsPartial({ wallet: wallet!, payer: sponsor!, clan: mine!.key, member: P.member(mine!.key, wallet!), proposal: p.key, vote: P.vote(p.key, wallet!) }).rpc()))();
  const execute = (p: PropView) => guard(`exec-${p.id}`, () => onBase(`Execute #${p.id} at the oracle price`, () => progs!.base.methods.executeProposal().accountsPartial({ captain: wallet!, payer: sponsor!, clan: mine!.key, proposal: p.key, position: P.position(mine!.key, p.id), price: P.baseFeed(p.coin), war: warLocked ? mine!.war : null }).rpc()))();
  const reject = (p: PropView) => guard(`rej-${p.id}`, () => onBase(`Close failed vote #${p.id}`, () => progs!.base.methods.rejectProposal().accountsPartial({ clan: mine!.key, proposal: p.key }).rpc()))();
  const closePos = (p: PosView) => guard(`close-${p.id}`, () => onBase(`Close position #${p.id}`, () => progs!.base.methods.closePosition().accountsPartial({ closer: wallet!, clan: mine!.key, position: p.key, price: P.baseFeed(p.coin), war: warLocked ? mine!.war : null }).rpc()))();

  const byKey = (k: PublicKey) => clans.find((c) => c.key.equals(k));
  const declare = guard('declare', async () => {
    const b = clans.find((c) => c.name === rival);
    if (!b) throw new Error('Pick a rival clan');
    const nonce = Date.now();
    const war = PublicKey.findProgramAddressSync([Buffer.from('war'), mine!.key.toBuffer(), b.key.toBuffer(), new BN(nonce).toArrayLike(Buffer, 'le', 8)], PROGRAM_ID)[0];
    await onBase(`Declare war on ${b.name}`, () => progs!.base.methods.declareWar(new BN(nonce), new BN(WAR_STAKE_USDC * USDC), new BN(+warLen))
      .accountsPartial({ captain: wallet!, payer: sponsor!, clanA: mine!.key, clanB: b.key, chestA: P.chest(mine!.key), war, vault: P.vault(war), usdcMint: USDC_MINT }).rpc());
  });
  const acceptWar = (w: WarView) => guard(`accept-${w.nonce}`, () => onBase(`Accept war from ${byKey(w.a)?.name ?? 'rival'}`, () => progs!.base.methods.acceptWar()
    .accountsPartial({ captain: wallet!, clanA: w.a, clanB: w.b, chestB: P.chest(w.b), war: w.key, vault: P.vault(w.key) }).rpc()))();
  const cancelWar = (w: WarView) => guard(`cancelwar-${w.nonce}`, () => onBase('Withdraw the declaration', () => progs!.base.methods.cancelWar()
    .accountsPartial({ captain: wallet!, clanA: w.a, chestA: P.chest(w.a), war: w.key, vault: P.vault(w.key), rentPayer: sponsor! }).rpc()))();
  const settleWar = (w: WarView) => guard(`settlewar-${w.nonce}`, async () => {
    const cfg = await progs!.base.account.config.fetch(P.config);
    await onBase('Settle the war', () => progs!.base.methods.settleWar()
      .accountsPartial({ clanA: w.a, clanB: w.b, chestA: P.chest(w.a), chestB: P.chest(w.b), war: w.key, vault: P.vault(w.key), treasury: cfg.treasury, rentPayer: sponsor! }).rpc());
  })();
  const activeWars = wars.filter((w) => w.status <= 1);
  const warOver = activeWars.some((w) => w.status === 1 && now >= w.endTs);
  const pastWars = wars.filter((w) => w.status === 2).slice(0, 3);
  const rivals = clans.filter((c) => mine && !c.key.equals(mine.key) && c.war.equals(PublicKey.default) && (!rivalQ.trim() || c.name.toLowerCase().includes(rivalQ.trim().toLowerCase()))).slice(0, 6);

  const openProps = props.filter((p) => p.status === 0);
  const pastProps = props.filter((p) => p.status !== 0).slice(0, 4);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Clan chest</Txt><Txt v="small">{NET.label} · votes weighted by chest shares</Txt></View>
        <Row style={{ gap: 6 }}><LiveDot color={C.up} /><Txt v="small" color={C.up}>On chain</Txt></Row>
      </Row>

      <WalletCard chain={chain} note="chests hold USDC · trades scored at the oracle price" need={5} />
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
                  <Txt v="small">{c.members} member{c.members === 1 ? '' : 's'} · chest {usdc(c.chest)} USDC · score {signed(c.score)}</Txt>
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
                  {warLocked ? <Txt v="small" color={C.opp}>At war · deposits and cash-outs wait until it settles</Txt> : mine.openVotes > 0 ? <Txt v="small" color={C.muted}>Cash-outs wait until open votes close</Txt> : null}
                </View>
              </Row>
              <Row style={{ marginTop: 14, gap: 8 }}>
                {[['Chest · USDC', usdc(mine.chest), C.ink], ['Your share', mine.shares ? `${((myShares / mine.shares) * 100).toFixed(0)}%` : '0%', C.brandSoft], ['Score · USDC', `${mine.score >= 0 ? '+' : '−'}${usdc(Math.abs(mine.score))}`, mine.score >= 0 ? C.up : C.down]].map(([k, v, c]) => (
                  <View key={k} style={{ flex: 1, backgroundColor: C.s2, borderRadius: 12, padding: 10 }}>
                    <Txt v="small" lines={1}>{k}</Txt><Txt v="label" color={c} lines={1}>{v}</Txt>
                  </View>
                ))}
              </Row>
              <Row style={{ marginTop: 12, gap: 8 }}>
                {TOP_UPS.map((a) => <Btn key={a} title={`+${a}`} kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy || warLocked} onPress={() => deposit(a)} />)}
                {myShares > 0
                  ? <Btn title="Cash out" kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy || warLocked || mine.openVotes > 0} onPress={withdraw} />
                  : !captain ? <Btn title="Leave" kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy} onPress={leave} /> : null}
              </Row>
              <Txt v="small" style={{ marginTop: 8 }}>{myShares ? `You put in ${usdc(myDeposit)} USDC; your shares are worth ${usdc(mine.shares ? Math.floor((myShares * mine.chest) / mine.shares) : 0)} USDC now. Votes count by shares.` : 'Deposit to get chest shares and a vote. Shares pay out pro rata, so war wins and losses are shared.'}</Txt>
            </Card>
          </Animated.View>

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Propose a trade</Txt>
          <Card style={{ padding: 14 }}>
            <Chips items={COIN_SYMBOLS.map((s, i) => ({ key: String(i) as '0' | '1' | '2', label: `${s}${prices[i] ? ` $${prices[i]!.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}` }))} value={coin} onChange={setCoin} />
            <Chips items={[{ key: '1', label: 'Long ▲' }, { key: '2', label: 'Short ▼' }]} value={dir} onChange={setDir} />
            <Chips items={[{ key: '2500', label: '25% of chest' }, { key: '5000', label: '50%' }, { key: '10000', label: '100%' }]} value={size} onChange={setSize} />
            <Btn title={busy === 'propose' ? 'Proposing…' : `Put it to a vote · ${VOTE_SECS} s`} kind={dir === '1' ? 'long' : 'short'} disabled={!!busy || mine.chest === 0} onPress={propose} />
            <Txt v="small" style={{ marginTop: 8 }}>{mine.chest === 0 ? 'Deposit first: an empty chest has nothing to trade.' : `Passes with more yes than no, early once yes holds over half of all shares. Size: ${usdc((mine.chest * +size) / 10_000)} USDC notional.`}</Txt>
          </Card>

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Votes</Txt>
          {openProps.length === 0 ? <Card style={{ padding: 14 }}><Txt v="small">No open votes. Propose a trade above.</Txt></Card> : openProps.map((p) => {
            const left = Math.max(0, Math.ceil(p.deadline - now));
            const total = p.yes + p.no;
            const passed = p.yes > p.no && (left === 0 || p.yes * 2 > mine.shares);
            const failed = (left === 0 && p.yes <= p.no) || now > p.deadline + 3600;
            return (
              <Card key={p.key.toBase58()} style={{ marginBottom: 8, padding: 14 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="label" color={p.side === 1 ? C.up : C.down}>#{p.id} {p.side === 1 ? 'Long' : 'Short'} {COIN_SYMBOLS[p.coin]} {p.lev}×</Txt>
                  <Txt v="small" color={left ? C.ink : C.muted}>{left ? `${left} s left` : 'Voting closed'}</Txt>
                </Row>
                <Txt v="small">{p.sizeBps / 100}% of the chest · proposed by {wallet && p.proposer.equals(wallet) ? 'you' : short(p.proposer.toBase58())}</Txt>
                <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: C.s2, marginTop: 10 }}>
                  <View style={{ flex: total ? p.yes : 0, backgroundColor: C.up }} /><View style={{ flex: total ? p.no : 1, backgroundColor: total ? C.down : C.s2 }} />
                </View>
                <Txt v="small" style={{ marginTop: 6 }}>Yes {pct(p.yes, mine.shares)} · No {pct(p.no, mine.shares)} of all chest shares · early pass over 50%</Txt>
                <Row style={{ gap: 8, marginTop: 10 }}>
                  {!p.myVote && left > 0 ? (
                    <>
                      <Btn title="Vote yes" kind="long" h={40} style={{ flex: 1 }} disabled={!!busy || myShares === 0} onPress={() => vote(p, true)} />
                      <Btn title="Vote no" kind="short" h={40} style={{ flex: 1 }} disabled={!!busy || myShares === 0} onPress={() => vote(p, false)} />
                    </>
                  ) : p.myVote ? <Txt v="small" color={C.brandSoft}>You voted.</Txt> : null}
                  {passed && captain && !failed ? <Btn title="Execute at oracle price" h={40} style={{ flex: 1 }} disabled={!!busy} onPress={() => execute(p)} /> : null}
                  {passed && !captain && !failed ? <Txt v="small" color={C.up}>Passed · waiting for the captain</Txt> : null}
                  {failed ? <Btn title={p.yes > p.no ? 'Close expired vote' : 'Close failed vote'} kind="ghost" h={40} style={{ flex: 1 }} disabled={!!busy} onPress={() => reject(p)} /> : null}
                </Row>
                {myShares === 0 && !p.myVote && left > 0 ? <Txt v="small" style={{ marginTop: 6 }}>Deposit to get a vote.</Txt> : null}
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
                <Txt v="small">{usdc(p.notional)} USDC notional · entry ${p.entry.toFixed(2)} → {p.open ? (px ? `now $${px.toFixed(2)}` : 'price loading') : `exit $${p.exit.toFixed(2)}`}</Txt>
                <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
                  <Txt v="title" color={live >= 0 ? C.up : C.down}>{signed(Math.round(live))}</Txt>
                  {p.open && (captain || warOver) ? <Btn title="Close at oracle price" kind="white" h={40} disabled={!!busy} onPress={() => closePos(p)} /> : null}
                </Row>
                {p.open ? <Txt v="small" style={{ marginTop: 4 }}>Live P&L at the Solana price; booked to the clan score at close.</Txt> : null}
              </Card>
            );
          })}
          {pastProps.length ? <Txt v="small" style={{ marginTop: 4 }}>Past votes: {pastProps.map((p) => `#${p.id} ${p.status === 1 ? 'executed' : 'failed'}`).join(' · ')}</Txt> : null}

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Clan war</Txt>
          {activeWars.map((w) => {
            const weA = w.a.equals(mine.key);
            const A = byKey(w.a); const B = byKey(w.b);
            const us = weA ? A : B; const them = weA ? B : A;
            const left = Math.max(0, Math.ceil(w.endTs - now));
            const rUs = us ? (weA ? retBps(us.score, w.baseA, w.chestA) : retBps(us.score, w.baseB, w.chestB)) : 0;
            const rThem = them ? (weA ? retBps(them.score, w.baseB, w.chestB) : retBps(them.score, w.baseA, w.chestA)) : 0;
            // our open trades are not booked yet; show what they would add if closed now
            const openPnl = positions.filter((p) => p.open).reduce((sum, p) => { const px = prices[p.coin]; return sum + (px ? (p.notional * pnlBps(p.entry, px, p.side, p.lev)) / 10_000 : 0); }, 0);
            const chestStart = weA ? w.chestA : w.chestB;
            const rUsLive = rUs + (chestStart ? (openPnl * 10_000) / chestStart : 0);
            return (
              <Card key={w.key.toBase58()} style={{ marginBottom: 8, padding: 14 }}>
                <Row style={{ gap: 12 }}>
                  {us ? <Art src={CRESTS[us.crest % CRESTS.length]} size={44} radius={12} /> : null}
                  <Txt v="label" style={{ flex: 1, textAlign: 'center' }} color={C.opp}>VS</Txt>
                  {them ? <Art src={CRESTS[them.crest % CRESTS.length]} size={44} radius={12} /> : null}
                </Row>
                <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <Txt v="small" color={C.ink}>{us?.name ?? 'us'}</Txt><Txt v="small" color={C.ink}>{them?.name ?? short((weA ? w.b : w.a).toBase58())}</Txt>
                </Row>
                {w.status === 0 ? (
                  <>
                    <Txt v="small" style={{ marginTop: 8 }}>{weA ? `Declared · ${usdc(w.stake)} USDC staked from our chest · waiting for ${them?.name ?? 'them'} to accept` : `${them?.name ?? 'A clan'} declared war · stake ${usdc(w.stake)} USDC from each chest`}</Txt>
                    {captain ? (weA
                      ? <Btn title="Withdraw the declaration" kind="ghost" h={40} style={{ marginTop: 10 }} disabled={!!busy} onPress={() => cancelWar(w)} />
                      : <Btn title={`Accept · stake ${usdc(w.stake)} USDC`} h={44} style={{ marginTop: 10 }} disabled={!!busy || mine.chest < 2 * w.stake || warLocked} onPress={() => acceptWar(w)} />)
                      : <Txt v="small" style={{ marginTop: 6 }}>Your captain decides.</Txt>}
                  </>
                ) : (
                  <>
                    <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                      <Txt v="title" color={rUs >= 0 ? C.up : C.down}>{rUs >= 0 ? '+' : ''}{(rUs / 100).toFixed(2)}%</Txt>
                      <Txt v="title" color={rThem >= 0 ? C.up : C.down}>{rThem >= 0 ? '+' : ''}{(rThem / 100).toFixed(2)}%</Txt>
                    </Row>
                    {Math.abs(rUsLive - rUs) >= 0.5 ? <Txt v="small" color={rUsLive >= 0 ? C.up : C.down}>{rUsLive >= 0 ? '+' : ''}{(rUsLive / 100).toFixed(2)}% if your open trades closed now</Txt> : null}
                    <Txt v="small" style={{ marginTop: 4 }}>Booked return on each starting chest from closed trades · pot {usdc(w.stake * 2)} USDC · {left ? `${left >= 3600 ? `${(left / 3600).toFixed(1)} h` : `${left} s`} left` : 'over'}</Txt>
                    {left === 0 ? (A && B && (A.positionsOpen > 0 || B.positionsOpen > 0)
                      ? <Txt v="small" color={C.opp} style={{ marginTop: 8 }}>Window over. Every open position must be closed (anyone can now) before the war settles.</Txt>
                      : <Btn title="Settle the war" kind="white" h={44} style={{ marginTop: 10 }} disabled={!!busy} onPress={() => settleWar(w)} />) : null}
                  </>
                )}
              </Card>
            );
          })}
          {activeWars.length === 0 ? (
            captain ? (
              <Card style={{ padding: 14 }}>
                <Txt v="small" style={{ marginBottom: 6 }}>Stake {WAR_STAKE_USDC} USDC from the chest against a rival (at most half the chest). Best return from closed trades over the window takes the pot.</Txt>
                <View style={{ backgroundColor: C.s2, borderRadius: 12, paddingHorizontal: 12, height: 42, justifyContent: 'center', marginBottom: 8 }}>
                  <TextInput value={rivalQ} onChangeText={setRivalQ} placeholder="Find a rival clan" placeholderTextColor={C.muted} autoCorrect={false} autoCapitalize="none"
                    style={{ color: C.ink, fontFamily: F.medium, fontSize: 14 }} />
                </View>
                {rivals.length ? <Chips items={rivals.map((c) => ({ key: c.name, label: c.name }))} value={rival} onChange={setRival} /> : <Txt v="small" style={{ marginBottom: 8 }}>{rivalQ ? 'No clan by that name is free to fight.' : `No other clans on ${NET.label} yet.`}</Txt>}
                <Chips items={WAR_LENGTHS.map((l) => ({ key: l.key, label: l.label }))} value={warLen} onChange={setWarLen} />
                <Btn title={busy === 'declare' ? 'Declaring…' : rival ? `Declare war on ${rival}` : 'Pick a rival'} kind="short" disabled={!!busy || !rival || mine.chest < 2 * WAR_STAKE_USDC * USDC} onPress={declare} />
              </Card>
            ) : <Card style={{ padding: 14 }}><Txt v="small">No war right now. Your captain can declare one.</Txt></Card>
          ) : null}
          {pastWars.map((w) => {
            const weA = w.a.equals(mine.key);
            const won = (w.winner === 1 && weA) || (w.winner === 2 && !weA);
            const them = byKey(weA ? w.b : w.a);
            return <Txt key={w.key.toBase58()} v="small" style={{ marginTop: 6 }} color={w.winner === 3 ? C.muted : won ? C.up : C.down}>{w.winner === 3 ? 'Tied' : won ? 'Won' : 'Lost'} vs {them?.name ?? 'rival'} · {(w.returnBps[weA ? 0 : 1] / 100).toFixed(2)}% vs {(w.returnBps[weA ? 1 : 0] / 100).toFixed(2)}%</Txt>;
          })}
        </>
      )}

      <TxStrip txs={chain.txs} />
    </ScrollView>
  );
}
