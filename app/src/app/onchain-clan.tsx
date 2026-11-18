// Squad chest: a shared USDC chest on Solana, trades proposed by any member, votes weighted by each member's
// chest shares, and the captain executing passed votes at the live oracle price. Positions are scored at the
// oracle price (paper P&L on the chest's notional); that P&L is the squad's score in squad wars.
// Wars: a captain stakes part of the chest against a rival squad; the rival captain accepts with the same
// stake; when the window ends the squad with the better return takes the pot (minus rake) into its chest.
// Opened from the Squads tab with ?clan=<pubkey>. Creating and joining squads lives in /squads/discover.
import { Buffer } from 'buffer';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BN, COIN_SYMBOLS, NET, P, PROGRAM_ID, PublicKey, USDC, USDC_MINT, usdcAta, base, basePriceOf, byClan, clanName, pnlBps,
} from '@/chain/client';
import { reader } from '@/chain/reads';
import { clanLevel, readClanServer, usePoll, useProfiles, type Profile } from '@/chain/social';
import { TxStrip, WalletCard, errText, short, useChain } from '@/chain/useChain';
import { AmountSheet } from '@/ui/amount';
import {
  CoinTile, DirPick, HeadAction, PastWar, Pills, PnlPill, PositionCard, RivalRow, SquadVersus, TradeCard, fmtLeft,
} from '@/ui/chest';
import { ProfileAvatar } from '@/ui/feed';
import { Crown, Jar } from '@/ui/icons';
import { ART, BackBtn, Btn, ErrorLine, LiveDot, Money, Pending, Row, SearchBar, SkeletonRows, Bone, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { Sheet } from '@/ui/sheet';
import { crestSrc } from '@/ui/squads/parts';
import { C, FONT, S, fmtUsd } from '@/ui/tokens';

type ClanView = { key: PublicKey; name: string; captain: PublicKey; crest: number; members: number; chest: number; shares: number; openVotes: number; positionsOpen: number; score: number; proposals: number; war: PublicKey; wins: number; losses: number };
type PropView = { key: PublicKey; id: number; proposer: PublicKey; coin: number; side: number; lev: number; sizeBps: number; yes: number; no: number; deadline: number; status: number; myVote: boolean };
type WarView = { key: PublicKey; a: PublicKey; b: PublicKey; nonce: number; stake: number; startTs: number; endTs: number; baseA: number; baseB: number; chestA: number; chestB: number; returnBps: number[]; status: number; winner: number };
type PosView = { key: PublicKey; id: number; coin: number; side: number; lev: number; notional: number; entry: number; exit: number; pnl: number; open: boolean; closedAt: number };
/** Where an action's error is shown: next to the thing that was tapped. */
type Spot = 'chest' | 'trades' | 'war' | 'leave';

/** USDC base units to dollars. */
const usd = (u: number) => u / USDC;
const VOTE_SECS = 60;
/** Each squad's war stake, in USDC (at most half its chest). */
const WAR_STAKE_USDC = 5;
const WAR_LENGTHS = [{ key: '120', label: '2 min' }, { key: '3600', label: '1 hour' }, { key: '86400', label: '1 day' }] as const;
const SIZES = [{ key: '2500', label: '25%' }, { key: '5000', label: '50%' }, { key: '10000', label: '100%' }] as const;
const retBps = (score: number, base: number, chest: number) => (chest ? ((score - base) * 10_000) / chest : 0);
const pctTxt = (bps: number) => `${bps > 0.5 ? '+' : bps < -0.5 ? '−' : ''}${(Math.abs(bps) / 100).toFixed(2)}%`;

export default function OnchainClan() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const chain = useChain();
  const { me: wallet, sponsor, progs, bal, busy, guard, onBase, err, setErr, tick, txs } = chain;
  // ?clan=<pubkey>: act on that squad (players can be in many); otherwise the main squad (Player.clan)
  const { clan: wantClan } = useLocalSearchParams<{ clan?: string }>();

  const [clans, setClans] = useState<ClanView[]>([]);
  const [mine, setMine] = useState<ClanView | null>(null);
  const [myDeposit, setMyDeposit] = useState(0);
  const [myShares, setMyShares] = useState(0);
  const [props, setProps] = useState<PropView[]>([]);
  const [positions, setPositions] = useState<PosView[]>([]);
  const [prices, setPrices] = useState<(number | null)[]>([null, null, null]);
  const [now, setNow] = useState(Date.now() / 1000);
  const [loadErr, setLoadErr] = useState<string>();
  /** Which wallet + squad the last completed read was for (so the empty state never flashes before the first read). */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [wars, setWars] = useState<WarView[]>([]);
  const [rival, setRival] = useState<string>('');
  const [rivalQ, setRivalQ] = useState('');
  const [warLen, setWarLen] = useState<'120' | '3600' | '86400'>('120');
  const [spot, setSpot] = useState<Spot | null>(null);
  // drawers
  const [proof, setProof] = useState(false);
  const [amt, setAmt] = useState<'add' | 'out' | null>(null);
  const [proposing, setProposing] = useState(false);
  const [challenging, setChallenging] = useState(false);

  // proposal form
  const [coin, setCoin] = useState<'0' | '1' | '2'>('0');
  const [dir, setDir] = useState<1 | 2>(1);
  // squad trades are unleveraged: the chest moves 1:1 with the price, like owning it
  const lev = '1';
  const [size, setSize] = useState<'2500' | '5000' | '10000'>('5000');

  const profiles = useProfiles();
  const names: Map<string, Profile> = profiles.status === 'ready' ? profiles.data : new Map();
  const loadKey = `${wallet?.toBase58() ?? 'none'}:${wantClan ?? ''}`;

  useEffect(() => {
    // squads are public: read them whether or not this device has signed in
    const rp = progs?.base ?? reader;
    let alive = true;
    const load = async () => {
      try {
        const toView = (key: PublicKey, c: any): ClanView => ({
          key, name: clanName(c.name), captain: c.captain, crest: c.crest, members: c.members, chest: Number(c.chest), shares: Number(c.shares), openVotes: c.openVotes, positionsOpen: c.positionsOpen,
          score: Number(c.scorePnl), proposals: Number(c.proposals), war: c.war, wins: c.wins, losses: c.losses,
        });
        const all = (await rp.account.clan.all()).map((a) => toView(a.publicKey, a.account));
        const player = wallet ? await rp.account.player.fetch(P.player(wallet)).catch(() => null) : null;
        let myKey = player && !player.clan.equals(PublicKey.default) ? player.clan : null;
        if (wantClan && wallet) {
          let want: PublicKey | null = null;
          try { want = new PublicKey(wantClan); } catch { want = null; }
          if (want && (await base.getAccountInfo(P.member(want, wallet)))) myKey = want;
        }
        const my = myKey ? all.find((c) => c.key.equals(myKey)) ?? null : null;
        const px = await Promise.all([0, 1, 2].map((i) => basePriceOf(rp, i).catch(() => null)));
        if (!alive) return;
        setClans(all.sort((a, b) => b.chest - a.chest));
        setMine(my);
        setPrices(px);
        setLoadErr(undefined);
        if (!my || !wallet) { setProps([]); setPositions([]); setMyDeposit(0); setMyShares(0); setWars([]); setLoadedFor(loadKey); return; }
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
        setLoadedFor(loadKey);
      } catch (e) { if (alive) { setLoadErr(`Cannot read squads from ${NET.label}: ${errText(e)}`); setLoadedFor(loadKey); } }
    };
    load();
    const h = setInterval(load, 2000);
    const c = setInterval(() => setNow(Date.now() / 1000), 500);
    return () => { alive = false; clearInterval(h); clearInterval(c); };
  }, [progs, wallet, tick, wantClan]); // eslint-disable-line react-hooks/exhaustive-deps

  // members (and their names) for the avatar row
  const server = usePoll(() => (mine ? readClanServer(mine.key) : Promise.resolve(null)), 6000, [mine?.key.toBase58(), tick]);

  const captain = !!(mine && wallet && mine.captain.equals(wallet));
  const warLocked = !!mine && !mine.war.equals(PublicKey.default);

  /** Runs a guarded action and remembers where its error belongs. */
  const at = (s: Spot, fn: () => Promise<void>) => { setSpot(s); return fn(); };

  const leave = guard('leave', () => onBase(`Leave ${mine!.name}`, () => progs!.base.methods.leaveClan().accountsPartial({ wallet: wallet!, clan: mine!.key, member: P.member(mine!.key, wallet!), rentPayer: sponsor! }).rpc()));
  const propose = guard('propose', async () => {
    const prop = P.proposal(mine!.key, mine!.proposals);
    const what = `${dir === 1 ? 'Long' : 'Short'} ${COIN_SYMBOLS[+coin]} · ${+size / 100}% of chest`;
    await onBase(`Propose ${what}`, () => progs!.base.methods.propose(+coin, dir, +lev, +size, new BN(VOTE_SECS)).accountsPartial({ wallet: wallet!, payer: sponsor!, clan: mine!.key, member: P.member(mine!.key, wallet!), proposal: prop }).rpc());
    setProposing(false);
  });
  const vote = (p: PropView, yes: boolean) => guard(`vote-${p.id}`, () => onBase(`Vote ${yes ? 'yes' : 'no'} on #${p.id}`, () => progs!.base.methods.vote(yes).accountsPartial({ wallet: wallet!, payer: sponsor!, clan: mine!.key, member: P.member(mine!.key, wallet!), proposal: p.key, vote: P.vote(p.key, wallet!) }).rpc()))();
  const execute = (p: PropView) => guard(`exec-${p.id}`, () => onBase(`Execute #${p.id} at the oracle price`, () => progs!.base.methods.executeProposal().accountsPartial({ captain: wallet!, payer: sponsor!, clan: mine!.key, proposal: p.key, position: P.position(mine!.key, p.id), price: P.baseFeed(p.coin), war: warLocked ? mine!.war : null }).rpc()))();
  const reject = (p: PropView) => guard(`rej-${p.id}`, () => onBase(`Close failed vote #${p.id}`, () => progs!.base.methods.rejectProposal().accountsPartial({ clan: mine!.key, proposal: p.key }).rpc()))();
  const closePos = (p: PosView) => guard(`close-${p.id}`, () => onBase(`Close position #${p.id}`, () => progs!.base.methods.closePosition().accountsPartial({ closer: wallet!, clan: mine!.key, position: p.key, price: P.baseFeed(p.coin), war: warLocked ? mine!.war : null }).rpc()))();

  const byKey = (k: PublicKey) => clans.find((c) => c.key.equals(k));
  const declare = guard('declare', async () => {
    const b = clans.find((c) => c.name === rival);
    if (!b) throw new Error('Pick a rival squad');
    const nonce = Date.now();
    const war = PublicKey.findProgramAddressSync([Buffer.from('war'), mine!.key.toBuffer(), b.key.toBuffer(), new BN(nonce).toArrayLike(Buffer, 'le', 8)], PROGRAM_ID)[0];
    await onBase(`Declare war on ${b.name}`, () => progs!.base.methods.declareWar(new BN(nonce), new BN(WAR_STAKE_USDC * USDC), new BN(+warLen))
      .accountsPartial({ captain: wallet!, payer: sponsor!, clanA: mine!.key, clanB: b.key, chestA: P.chest(mine!.key), war, vault: P.vault(war), usdcMint: USDC_MINT }).rpc());
    setChallenging(false);
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

  // chest moves from the number pad: the drawer shows the program's error itself, so these throw instead of guarding
  const addToChest = async (n: number) => {
    if (!progs || !wallet || !mine) throw new Error('Sign in first');
    if (warLocked) throw new Error('The chest is locked while your squad is at war. Add once it settles.');
    await onBase(`Deposit ${n} USDC to the chest`, () => progs.base.methods.depositChest(new BN(Math.round(n * USDC))).accountsPartial({ wallet, clan: mine.key, member: P.member(mine.key, wallet), chest: P.chest(mine.key), walletUsdc: usdcAta(wallet) }).rpc());
  };
  const myWorth = mine && mine.shares ? Math.floor((myShares * mine.chest) / mine.shares) : 0;
  const takeOut = async (n: number) => {
    if (!progs || !wallet || !mine) throw new Error('Sign in first');
    if (warLocked) throw new Error('The chest is locked while your squad is at war. Take out once it settles.');
    if (mine.openVotes > 0) throw new Error('Take-outs wait until every open vote is closed.');
    const want = Math.round(n * USDC);
    // shares are redeemed pro rata; within a cent of everything means all of them (no dust left behind)
    const shares = want >= myWorth - 10_000 ? myShares : Math.min(myShares, Math.floor((want * mine.shares) / mine.chest));
    if (shares <= 0) throw new Error('That is less than one share of the chest. Try a bigger amount.');
    await onBase(shares === myShares ? 'Cash out my shares' : `Cash out ${n} USDC of my shares`, () => progs.base.methods.withdrawChest(new BN(shares)).accountsPartial({ wallet, clan: mine.key, member: P.member(mine.key, wallet), chest: P.chest(mine.key), walletUsdc: usdcAta(wallet) }).rpc());
  };

  const activeWars = wars.filter((w) => w.status <= 1);
  const warOver = activeWars.some((w) => w.status === 1 && now >= w.endTs);
  const pastWars = wars.filter((w) => w.status === 2).slice(0, 3);
  const rivals = clans.filter((c) => mine && !c.key.equals(mine.key) && c.war.equals(PublicKey.default) && (!rivalQ.trim() || c.name.toLowerCase().includes(rivalQ.trim().toLowerCase()))).slice(0, 8);

  const openProps = props.filter((p) => p.status === 0);
  const pastProps = props.filter((p) => p.status !== 0).slice(0, 4);
  const nameOf = (k: PublicKey) => (wallet && k.equals(wallet) ? 'you' : names.get(k.toBase58())?.name ?? short(k.toBase58()));

  const status = chain.wallet.status;
  const loading = status === 'loading' || status === 'creating' || (status === 'in' && (!wallet || loadedFor !== loadKey));
  const level = mine ? clanLevel(mine.wins, mine.members, usd(mine.chest)) : null;
  const memberKeys = server.status === 'ready' && server.data && mine && server.data.key.equals(mine.key) ? server.data.members : null;
  const sharePct = mine && mine.shares ? (myShares / mine.shares) * 100 : 0;
  const errHere = (s: Spot) => (err && spot === s ? <ErrorLine msg={err} /> : null);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* header: back, crest + name + level, wallet pill */}
        <Row style={{ gap: 10, marginBottom: 16, minHeight: 44 }}>
          <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/clans' as Href))} />
          {mine ? (
            <Row style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Image source={crestSrc(mine.crest)} style={{ width: 34, height: 34 }} contentFit="contain" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1} style={{ fontSize: 16 }}>{mine.name}</Txt>
                <Txt v="small" lines={1} style={{ fontSize: 12 }}>LV {level?.level ?? 1} · {mine.members} member{mine.members === 1 ? '' : 's'}{captain ? ' · you lead' : ''}</Txt>
              </View>
            </Row>
          ) : <View style={{ flex: 1 }} />}
          <Pressable onPress={() => setProof(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Wallet and transactions"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: pressed ? C.s1 : C.s2, borderRadius: 18, paddingHorizontal: 12, height: 36 })}>
            <LiveDot color={C.up} /><Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{bal === null ? 'Wallet' : fmtUsd(bal)}</Txt>
          </Pressable>
        </Row>
        {err && !spot ? <ErrorLine msg={err} /> : null}
        {loadErr ? <ErrorLine msg={loadErr} /> : null}

        {loading ? (
          <View>
            <Bone w="100%" h={230} r={18} />
            <View style={{ height: 18 }} />
            <SkeletonRows n={3} />
          </View>
        ) : status === 'setup' || status === 'error' ? (
          <Pending art={ART.stash} title="Setup required" body={chain.wallet.error ?? 'The wallet could not start on this device.'} />
        ) : status === 'out' ? (
          <View>
            <Pending art={ART.clubhouse} title="Sign in to see your squad" body="Your squad's chest, its trade votes and its wars live on Solana. Sign in with email or Google; every fee is on Clashy." />
            <Btn title="Sign in" h={50} onPress={() => chain.wallet.login?.()} />
          </View>
        ) : !mine ? (
          <View>
            <Pending art={ART.clubhouse}
              title={wantClan ? "You're not in this squad" : 'No squad yet'}
              body={wantClan ? 'Only members see the chest and vote on its trades. Find it in Discover and join to get a share.' : 'Join a squad to pool a chest with friends, vote on trades together and fight other squads.'} />
            <Btn title="Discover squads" h={50} onPress={() => router.push('/squads/discover' as Href)} />
          </View>
        ) : (
          <>
            {/* the chest: one card, one big number */}
            <Animated.View entering={FadeInDown.duration(300)} style={{ borderRadius: 18, backgroundColor: C.card, padding: 16 }}>
              <Row style={{ gap: 8 }}>
                <Txt v="small" style={{ flex: 1 }}>Squad chest</Txt>
                {warLocked ? <View style={{ backgroundColor: C.s2, borderRadius: 6, paddingHorizontal: 7, height: 24, justifyContent: 'center' }}><Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 12 }}>At war</Txt></View> : null}
                <PnlPill label="Trades" usd={usd(mine.score)} />
              </Row>
              <View style={{ marginTop: 6 }}><Money value={usd(mine.chest)} size={34} /></View>
              <Row style={{ gap: 8, marginTop: 14 }}>
                <Stat k="Your share" v={`${sharePct.toFixed(sharePct > 0 && sharePct < 1 ? 1 : 0)}%`} />
                <Stat k="Worth now" v={fmtUsd(usd(myWorth))} />
                <Stat k="You put in" v={fmtUsd(usd(myDeposit))} />
              </Row>
              <Row style={{ gap: 10, marginTop: 16 }}>
                <Btn title="Add to chest" h={48} style={{ flex: 1 }} disabled={!!busy || warLocked} onPress={() => { setErr(undefined); setAmt('add'); }} />
                <Btn title="Take out" kind="ghost" h={48} style={{ flex: 1 }} disabled={!!busy || warLocked || mine.openVotes > 0 || myShares === 0} onPress={() => { setErr(undefined); setAmt('out'); }} />
              </Row>
              <Txt v="small" style={{ marginTop: 10, lineHeight: 17, fontSize: 12.5 }}>
                {warLocked ? 'At war: the chest is locked until the war settles.'
                  : myShares === 0 ? 'Add to the chest to get a share and a vote. Shares pay out pro rata, so wins and losses are shared.'
                  : mine.openVotes > 0 ? 'Take-outs wait until the open votes close. Your vote counts by your share.'
                  : 'Your vote counts by your share. Take out any time no vote is open.'}
              </Txt>
              {errHere('chest')}
            </Animated.View>

            {/* trades */}
            <Head title="Trades" sub={openProps.length ? `${openProps.length} vote${openProps.length === 1 ? '' : 's'} open` : 'Proposed and voted by the squad'}
              right={<HeadAction label="Propose" color={C.ink} disabled={!!busy} onPress={() => { setErr(undefined); setProposing(true); }} />} />
            {errHere('trades')}
            {openProps.length === 0 ? (
              <View>
                <Pending art={ART.coinsPile} title="No open votes" body={mine.chest === 0 ? 'Add to the chest first: an empty chest has nothing to trade.' : 'Call a move on SOL, BTC or ETH and the squad votes on it for 60 seconds.'} />
                <Btn title="Propose a trade" kind="ghost" h={44} style={{ alignSelf: 'center', marginTop: -14 }} disabled={!!busy || mine.chest === 0} onPress={() => { setErr(undefined); setProposing(true); }} />
              </View>
            ) : openProps.map((p) => {
              const left = Math.max(0, Math.ceil(p.deadline - now));
              const passed = p.yes > p.no && (left === 0 || p.yes * 2 > mine.shares);
              const failed = (left === 0 && p.yes <= p.no) || now > p.deadline + 3600;
              const sym = COIN_SYMBOLS[p.coin] ?? '…';
              return (
                <TradeCard key={p.key.toBase58()} sym={sym} side={p.side} sizePct={p.sizeBps / 100} notional={usd((mine.chest * p.sizeBps) / 10_000)}
                  proposer={names.get(p.proposer.toBase58())} proposerName={nameOf(p.proposer)}
                  yes={mine.shares ? p.yes / mine.shares : 0} no={mine.shares ? p.no / mine.shares : 0} left={left}>
                  {!p.myVote && left > 0 ? (
                    <Row style={{ gap: 8 }}>
                      <Btn title={busy === `vote-${p.id}` ? 'Voting…' : 'Vote yes'} kind="long" h={46} style={{ flex: 1 }} disabled={!!busy || myShares === 0} onPress={() => at('trades', () => vote(p, true))} />
                      <Btn title="Vote no" kind="short" h={46} style={{ flex: 1 }} disabled={!!busy || myShares === 0} onPress={() => at('trades', () => vote(p, false))} />
                    </Row>
                  ) : null}
                  {myShares === 0 && !p.myVote && left > 0 ? <Txt v="small" style={{ textAlign: 'center' }}>Add to the chest to get a vote.</Txt> : null}
                  {p.myVote ? <Txt v="small" color={C.brandSoft} style={{ ...FONT.semi }}>✓ You voted</Txt> : null}
                  {passed && captain && !failed ? <Btn title={busy === `exec-${p.id}` ? 'Placing…' : 'Passed · place the trade'} h={46} disabled={!!busy} onPress={() => at('trades', () => execute(p))} /> : null}
                  {passed && !captain && !failed ? <Txt v="small" color={C.up} style={{ ...FONT.semi }}>Passed · waiting for the captain to place it</Txt> : null}
                  {failed ? <Btn title={p.yes > p.no ? 'Close expired vote' : 'Close failed vote'} kind="ghost" h={44} disabled={!!busy} onPress={() => at('trades', () => reject(p))} /> : null}
                </TradeCard>
              );
            })}

            {positions.length ? (
              <>
                <Head title="In play" sub="Live P&L at the current price; booked to the squad score at close" />
                {positions.slice(0, 8).map((p) => {
                  const px = prices[p.coin] ?? null;
                  const live = p.open && px ? (p.notional * pnlBps(p.entry, px, p.side, p.lev)) / 10_000 : p.pnl;
                  return (
                    <PositionCard key={p.key.toBase58()} sym={COIN_SYMBOLS[p.coin] ?? '…'} side={p.side} notional={usd(p.notional)} entry={p.entry} now={p.open ? px : p.exit} open={p.open} pnl={usd(Math.round(live))}
                      action={p.open && (captain || warOver) ? <Btn title={busy === `close-${p.id}` ? 'Closing…' : 'Close at the current price'} kind="ghost" h={44} disabled={!!busy} onPress={() => at('trades', () => closePos(p))} /> : undefined} />
                  );
                })}
              </>
            ) : null}
            {pastProps.length ? (
              <Row style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                <Txt v="small" style={{ fontSize: 12 }}>Past votes</Txt>
                {pastProps.map((p) => (
                  <View key={p.key.toBase58()} style={{ borderRadius: 8, paddingHorizontal: 8, height: 24, justifyContent: 'center', backgroundColor: p.status === 1 ? C.upBg : C.s2 }}>
                    <Txt v="small" color={p.status === 1 ? C.up : C.muted} style={{ fontSize: 11.5, ...FONT.semi }}>{p.side === 1 ? '▲' : '▼'} {COIN_SYMBOLS[p.coin] ?? '…'} {p.status === 1 ? 'placed' : 'failed'}</Txt>
                  </View>
                ))}
              </Row>
            ) : null}

            {/* squad war */}
            <Head title="Squad war" sub={activeWars.length ? undefined : `Stake ${fmtUsd(WAR_STAKE_USDC)} from the chest · best return takes the pot`}
              right={captain && activeWars.length === 0 ? <HeadAction label="Challenge" color={C.ink} disabled={!!busy} onPress={() => { setErr(undefined); setChallenging(true); }} /> : undefined} />
            {errHere('war')}
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
              const themName = them?.name ?? short((weA ? w.b : w.a).toBase58());
              const live = w.status === 1;
              return (
                <Animated.View key={w.key.toBase58()} entering={FadeInDown.duration(300)} style={{ borderRadius: 18, backgroundColor: C.card, padding: 16, marginBottom: 10 }}>
                  <View style={{ alignItems: 'center', marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.s2, borderRadius: 14, paddingHorizontal: 12, height: 28 }}>
                      {live && left ? <LiveDot color={C.opp} /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.muted }} />}
                      <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 12.5 }}>{!live ? (weA ? `Waiting for ${themName}` : 'Challenge received') : left ? 'War is live' : 'Final bell'}</Txt>
                    </View>
                    {live ? <Text style={{ ...FONT.bold, fontSize: 38, letterSpacing: -1.2, color: C.ink, marginTop: 6, fontVariant: ['tabular-nums'] }}>{left ? fmtLeft(left) : '0:00'}</Text> : null}
                    <Txt v="small" style={{ marginTop: live ? 0 : 6 }}>Pot {fmtUsd(usd(w.stake * 2))} · {fmtUsd(usd(w.stake))} from each chest</Txt>
                  </View>
                  <SquadVersus us={us?.crest ?? null} them={them?.crest ?? null} usName={us?.name ?? 'Us'} themName={themName}
                    usScore={live ? pctTxt(rUs) : undefined} themScore={live ? pctTxt(rThem) : undefined}
                    usSub={live ? 'booked return' : undefined} themSub={live ? 'booked return' : undefined} />
                  {live && Math.abs(rUsLive - rUs) >= 0.5 ? <Txt v="small" color={rUsLive >= 0 ? C.up : C.down} style={{ textAlign: 'center', marginTop: 10 }}>{pctTxt(rUsLive)} for you if your open trades closed now</Txt> : null}
                  <View style={{ marginTop: 14 }}>
                    {!live ? (
                      <>
                        <Txt v="small" style={{ textAlign: 'center' }}>{weA ? `${fmtUsd(usd(w.stake))} is staked from your chest. The war starts when ${themName} accepts.` : `${themName} challenged your squad. Accepting stakes ${fmtUsd(usd(w.stake))} from your chest.`}</Txt>
                        {captain ? (weA
                          ? <Btn title={busy === `cancelwar-${w.nonce}` ? 'Withdrawing…' : 'Withdraw the challenge'} kind="ghost" h={46} style={{ marginTop: 12 }} disabled={!!busy} onPress={() => at('war', () => cancelWar(w))} />
                          : <Btn title={busy === `accept-${w.nonce}` ? 'Accepting…' : `Accept · stake ${fmtUsd(usd(w.stake))}`} h={52} style={{ marginTop: 12 }} disabled={!!busy || mine.chest < 2 * w.stake || warLocked} onPress={() => at('war', () => acceptWar(w))} />)
                          : <Txt v="small" style={{ textAlign: 'center', marginTop: 6 }}>Your captain decides.</Txt>}
                        {captain && !weA && mine.chest < 2 * w.stake ? <Txt v="small" style={{ textAlign: 'center', marginTop: 6 }}>The chest needs at least {fmtUsd(usd(2 * w.stake))} to accept.</Txt> : null}
                      </>
                    ) : left === 0 ? (A && B && (A.positionsOpen > 0 || B.positionsOpen > 0)
                      ? <Txt v="small" color={C.ink} style={{ textAlign: 'center' }}>Time is up. Every open trade must be closed (anyone can now) before the war settles.</Txt>
                      : <Btn title={busy === `settlewar-${w.nonce}` ? 'Settling…' : 'Settle the war'} kind="white" h={52} disabled={!!busy} onPress={() => at('war', () => settleWar(w))} />)
                      : <Txt v="small" style={{ textAlign: 'center' }}>Return on each starting chest from closed trades. Best return when the clock hits zero takes the pot.</Txt>}
                  </View>
                </Animated.View>
              );
            })}
            {activeWars.length === 0 ? (
              <View>
                <Pending art={ART.tileWar} title={captain ? 'Pick a fight' : 'No war right now'}
                  body={captain ? `Stake ${fmtUsd(WAR_STAKE_USDC)} of the chest against a rival squad. Whoever trades the better return over the window takes both stakes.` : 'Your captain can challenge a rival squad. Whoever trades the better return takes both stakes.'} />
                {captain ? <Btn title="Challenge a squad" kind="ghost" h={44} style={{ alignSelf: 'center', marginTop: -14 }} disabled={!!busy} onPress={() => { setErr(undefined); setChallenging(true); }} /> : null}
              </View>
            ) : null}
            {pastWars.length ? (
              <View style={{ marginTop: 8 }}>
                {pastWars.map((w) => {
                  const weA = w.a.equals(mine.key);
                  const won = (w.winner === 1 && weA) || (w.winner === 2 && !weA);
                  const them = byKey(weA ? w.b : w.a);
                  return <PastWar key={w.key.toBase58()} result={w.winner === 3 ? 'tied' : won ? 'won' : 'lost'} rival={them?.name ?? 'rival'} us={pctTxt(w.returnBps[weA ? 0 : 1])} them={pctTxt(w.returnBps[weA ? 1 : 0])} />;
                })}
              </View>
            ) : null}

            {/* members */}
            <Head title="Members" sub={`${mine.members} in the squad · ${mine.wins}W ${mine.losses}L in wars`} />
            {memberKeys ? (
              [...memberKeys].sort((a, b) => Number(mine.captain.equals(b)) - Number(mine.captain.equals(a))).map((k) => {
                const p = names.get(k.toBase58());
                const isCapt = mine.captain.equals(k);
                const isMe = !!wallet && k.equals(wallet);
                return (
                  <Row key={k.toBase58()} style={{ gap: 12, paddingVertical: 8, minHeight: 52 }}>
                    <ProfileAvatar p={p} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Row style={{ gap: 6 }}>
                        <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{p?.name ?? short(k.toBase58())}</Txt>
                        {isCapt ? <Crown size={14} color={C.brandSoft} /> : null}
                        {isMe ? <Txt v="small" color={C.dim} style={{ fontSize: 12 }}>you</Txt> : null}
                      </Row>
                      <Txt v="small" lines={1} style={{ marginTop: 1 }}>{isCapt ? 'Captain' : 'Member'}</Txt>
                    </View>
                  </Row>
                );
              })
            ) : server.status === 'error' ? <ErrorLine msg={server.error} onRetry={server.reload} /> : (
              <View style={{ gap: 12, paddingVertical: 8 }}>{[0, 1, 2].map((i) => <Row key={i} style={{ gap: 12 }}><Bone w={36} h={36} r={18} /><Bone w="40%" h={12} /></Row>)}</View>
            )}

            {/* quiet destructive row */}
            {!captain ? (
              <View style={{ marginTop: 26 }}>
                <Pressable onPress={() => at('leave', leave)} disabled={!!busy || myShares > 0} accessibilityRole="button"
                  style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, opacity: myShares > 0 ? 0.5 : pressed ? 0.7 : 1 })}>
                  <Txt v="label" color={C.down} lines={1} style={{ flexShrink: 1 }}>{busy === 'leave' ? 'Leaving…' : `Leave ${mine.name}`}</Txt>
                  <Txt v="small" style={{ fontSize: 12 }}>{myShares > 0 ? 'Take out your share first' : ''}</Txt>
                </Pressable>
                {errHere('leave')}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* wallet and on-chain proof */}
      <Sheet open={proof} onClose={() => setProof(false)} title="Wallet and proof">
        <WalletCard chain={chain} note="chests hold USDC · trades scored at the oracle price" need={5} />
        <Txt v="small" style={{ marginTop: 10, lineHeight: 18 }}>
          Every action here is a real Solana transaction on {NET.label}: chest deposits and take-outs, share-weighted votes, trades placed and closed at the on-chain oracle price, and war stakes held in a program escrow.
          {mine ? ` Squad account ${short(mine.key.toBase58())}.` : ''}
        </Txt>
        <TxStrip txs={txs} />
      </Sheet>

      {/* chest number pads */}
      <AmountSheet open={amt === 'add'} onClose={() => setAmt(null)} title="Add to the chest" sub={`From your wallet · ${(bal ?? 0).toFixed(2)} USDC`} max={bal ?? 0} presets={[5, 10, 25]}
        art={<View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Jar size={21} color={C.ink} /></View>}
        confirm={(n) => `Add $${n.toFixed(2)}`} success="Added to the chest" successSub="You got chest shares: your vote and your cut of every win."
        onConfirm={addToChest} />
      <AmountSheet open={amt === 'out'} onClose={() => setAmt(null)} title="Take out" sub={`To your wallet · your share is worth ${fmtUsd(usd(myWorth))}`} max={usd(myWorth)} presets={[5, 10]}
        confirm={(n) => `Take out $${n.toFixed(2)}`} success="Back in your wallet" successSub="Paid from the chest pro rata to your shares."
        onConfirm={takeOut} />

      {/* propose a trade */}
      <Sheet open={proposing} onClose={() => setProposing(false)} title="Propose a trade">
        <Txt v="small" style={{ textAlign: 'center', marginBottom: 12 }}>The squad votes for {VOTE_SECS} seconds. More yes than no passes; over half of all shares passes early.</Txt>
        <Row style={{ gap: 8 }}>
          {(['0', '1', '2'] as const).map((k) => <CoinTile key={k} sym={COIN_SYMBOLS[+k]} price={prices[+k] ?? null} on={coin === k} onPress={() => setCoin(k)} />)}
        </Row>
        <View style={{ marginTop: 12 }}><DirPick dir={dir} onChange={setDir} /></View>
        <Txt v="small" style={{ marginTop: 14, marginBottom: 6 }}>How much of the chest</Txt>
        {mine ? <Pills items={SIZES.map((s) => ({ key: s.key, label: s.label, sub: fmtUsd(usd((mine.chest * +s.key) / 10_000)) }))} value={size} onChange={setSize} /> : null}
        {err && spot === 'trades' ? <ErrorLine msg={err} /> : null}
        <View style={{ marginTop: 16 }}>
          <Btn title={busy === 'propose' ? 'Proposing…' : `Propose ${dir === 1 ? '▲ UP' : '▼ DOWN'} on ${COIN_SYMBOLS[+coin]}`} kind={dir === 1 ? 'long' : 'short'} h={54}
            disabled={!!busy || !mine || mine.chest === 0} onPress={() => at('trades', propose)} />
        </View>
        {mine && mine.chest === 0 ? <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Add to the chest first: an empty chest has nothing to trade.</Txt> : null}
      </Sheet>

      {/* challenge a rival squad */}
      <Sheet open={challenging} onClose={() => setChallenging(false)} title="Challenge a squad">
        <Txt v="small" style={{ textAlign: 'center', marginBottom: 12 }}>Stake {fmtUsd(WAR_STAKE_USDC)} from the chest. If they accept with the same stake, the better trading return over the window takes the pot.</Txt>
        <SearchBar value={rivalQ} onChange={setRivalQ} placeholder="Find a rival squad" />
        <View style={{ marginTop: 10 }}>
          {rivals.length ? rivals.map((c) => (
            <RivalRow key={c.key.toBase58()} crest={c.crest} name={c.name} on={rival === c.name} onPress={() => setRival(c.name)}
              line={`${c.members} member${c.members === 1 ? '' : 's'} · chest ${fmtUsd(usd(c.chest))} · trades ${usd(c.score) >= 0 ? '+' : '−'}${fmtUsd(Math.abs(usd(c.score)))}`} />
          )) : <Txt v="small" style={{ textAlign: 'center', paddingVertical: 14 }}>{rivalQ ? 'No squad by that name is free to fight.' : `No other squads are free to fight on ${NET.label} yet.`}</Txt>}
        </View>
        <Txt v="small" style={{ marginTop: 8, marginBottom: 6 }}>How long</Txt>
        <Pills items={WAR_LENGTHS.map((l) => ({ key: l.key, label: l.label }))} value={warLen} onChange={setWarLen} />
        {err && spot === 'war' ? <ErrorLine msg={err} /> : null}
        <View style={{ marginTop: 16 }}>
          <Btn title={busy === 'declare' ? 'Sending…' : rival ? `Challenge ${rival}` : 'Pick a rival'} h={54} disabled={!!busy || !rival || !mine || mine.chest < 2 * WAR_STAKE_USDC * USDC} onPress={() => at('war', declare)} />
        </View>
        {mine && mine.chest < 2 * WAR_STAKE_USDC * USDC ? <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>The chest needs at least {fmtUsd(2 * WAR_STAKE_USDC)} to stake {fmtUsd(WAR_STAKE_USDC)}.</Txt> : null}
      </Sheet>
    </View>
  );
}

/** Section head: an h2 with one grey line under it and an optional action on the right. */
function Head({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <Row style={{ marginTop: 28, marginBottom: 10, gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="h2" lines={1}>{title}</Txt>
        {sub ? <Txt v="small" lines={1} style={{ marginTop: 1 }}>{sub}</Txt> : null}
      </View>
      {right}
    </Row>
  );
}

/** A number in the chest card: a small label over the value (no tile: the card is the one surface). */
function Stat({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt v="small" lines={1} style={{ fontSize: 12 }}>{k}</Txt>
      <Txt v="num" lines={1} style={{ marginTop: 1 }}>{v}</Txt>
    </View>
  );
}
