// On-chain Royale: entries escrowed on Solana, the tournament handed to a MagicBlock rollup, every round each
// player calls up or down on one coin, wrong or missing calls cost a life, and the survivors split the pot on
// Solana. Any player's device resolves a round once its timer runs out (resolve_round is permissionless).
// The look lives in ui/royale.tsx; wallet and transaction proof live in the bottom drawer.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BN, COIN_SYMBOLS, NET, P, PublicKey, USDC, USDC_MINT, priceOf, random32, readTour, usdcAta, type TourView, ensureSession, feedOf, feeVault, hasKeeper,
} from '@/chain/client';
import { reader } from '@/chain/reads';
import { useProfiles, type Profile } from '@/chain/social';
import { TxStrip, WalletCard, errText, short, useChain } from '@/chain/useChain';
import { CallButtons, coinName } from '@/ui/clash';
import { ClayLoop } from '@/ui/clay';
import { FX, Hit, RoundBanner } from '@/ui/fx';
import { ART, BackBtn, ErrorLine, LiveChart, LiveDot, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { Lottie } from '@/ui/lottie';
import { BigCta, EDGE, GOLD, Hearts, HowItWorks, OpenRoyale, RoundRing, SURFACE, Segmented, StatusPill, Table, TableRoll, type Seat } from '@/ui/royale';
import { Sheet } from '@/ui/sheet';
import { C, F, FONT, S, fmtUsd } from '@/ui/tokens';
import { Sprite } from '@/ui/sprite';

const ACTIVE = 'clashy:chain:tour';
const NO_COIN = 255;
/** A coin the VRF oracle has rolled: any of the config's markets (crypto or a tokenized stock), never NO_COIN. */
const rolled = (coin: number) => coin !== NO_COIN && coin < COIN_SYMBOLS.length;
/** Royale entry, in USDC. */
const ENTRY_USDC = 2;
const ROUND_SECS = 10;
const MAX_ROUNDS = 10;
/** The program's rake, in basis points. */
const RAKE_BPS = 300;
/** Lobbies older than this go under "Older": they are real and still open, but most likely abandoned. */
const STALE_MIN = 30;
/** The Royale coin is rolled from the three cryptos. */
const POOL = COIN_SYMBOLS.slice(0, 3);
const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return 'opened just now';
  if (m < 60) return `opened ${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `opened ${h} h ago` : `opened ${Math.round(h / 24)} days ago`;
};
/** What the survivors share once a table is full: every entry minus the rake, as the program computes it. */
const potAfterRake = (entryBase: number, n: number) => (entryBase * n - Math.floor((entryBase * n * RAKE_BPS) / 10_000)) / USDC;

export default function OnchainRoyale() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const chain = useChain(['Resolve round']);
  const { me: wallet, sponsor, progs, hasPlayer, bal, busy, guard, onBase, onEr, err, setErr } = chain;
  const profiles = useProfiles();
  const names: Map<string, Profile> = profiles.status === 'ready' ? profiles.data : new Map();

  const [active, setActive] = useState<PublicKey | null>(null);
  const [tour, setTour] = useState<TourView | null>(null);
  const [lobby, setLobby] = useState<TourView[]>([]);
  const [lobbyErr, setLobbyErr] = useState<string>();
  const [price, setPrice] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now() / 1000);
  const [proof, setProof] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const inflight = useRef(new Set<string>());
  /** My hearts as last seen, to flash a broken heart the moment I lose one. */
  const myLives = useRef<number | null>(null);
  const [lostK, setLostK] = useState(0);

  // host form (the coin is rolled by MagicBlock VRF once the Royale is created)
  const [seats, setSeats] = useState<'2' | '4' | '8' | '16'>('4');
  const [lives, setLives] = useState<'1' | '2' | '3'>('2');

  const setActiveTour = async (k: PublicKey | null) => {
    setActive(k); setTour(null); myLives.current = null;
    if (k) await AsyncStorage.setItem(ACTIVE, k.toBase58()); else await AsyncStorage.removeItem(ACTIVE);
  };
  useEffect(() => { AsyncStorage.getItem(ACTIVE).then((v) => v && setActive(new PublicKey(v))).catch(() => {}); }, []);
  useEffect(() => { const h = setInterval(() => setNow(Date.now() / 1000), 250); return () => clearInterval(h); }, []);

  // lobby: open tournaments on Solana
  // the lobby is public: shown whether or not this device has signed in
  useEffect(() => {
    const rp = progs?.base ?? reader;
    let alive = true;
    const load = async () => {
      try {
        const all = await rp.account.tournament.all();
        const open = await Promise.all(all.filter((a) => a.account.status === 0).map((a) => readTour(rp, a.publicKey)));
        if (alive) {
          setLobby((open.filter(Boolean) as TourView[]).filter((t) => t.status === 0 && !t.onEr).sort((a, b) => b.nonce - a.nonce));
          setLobbyErr(undefined);
        }
      } catch (e) { if (alive) setLobbyErr(`Cannot read open Royales from ${NET.label}: ${errText(e)}`); }
    };
    load();
    const h = setInterval(load, 3000);
    return () => { alive = false; clearInterval(h); };
  }, [progs]);

  /** When this device first saw the finished Royale back on Solana (the settle Magic Action normally pays at once). */
  const homeAt = useRef<number | null>(null);
  // the active tournament's state machine, polled every second
  useEffect(() => {
    if (!active || !progs || !wallet || !sponsor) return;
    let alive = true;
    const step = async () => {
      const t = await readTour(progs.base, active).catch(() => null);
      if (!alive || !t) return;
      setTour(t);
      if (rolled(t.coin)) setPrice(await priceOf(progs.base, t.coin).catch(() => null));
      const host = t.creator.equals(wallet);
      const me = t.players.findIndex((p) => p.equals(wallet));
      const once = async (tag: string, fn: () => Promise<unknown>) => {
        if (inflight.current.has(tag)) return;
        inflight.current.add(tag);
        try { await fn(); } catch (e) {
          inflight.current.delete(tag);
          const again = await readTour(progs.base, active).catch(() => null);
          if (again && (again.status !== t.status || again.round !== t.round || again.onEr !== t.onEr)) return; // another device got there first
          setErr(errText(e));
        }
      };
      const cranked = await hasKeeper();
      // host: once delegated, start on the rollup. With MagicBlock cranks the start also schedules tick_round every
      // second: the rollup resolves each round at its bell and the keeper sends the Royale home with the payout.
      if (t.status === 0 && t.onEr && host) {
        const price = await feedOf(progs.base, t.coin);
        await once('start', () => cranked
          ? onEr('Start · MagicBlock crank resolves every round', progs.er.methods.startTournamentCranked().accountsPartial({ signer: wallet, game: active, price, magicFeeVault: feeVault() }))
          : onEr('Start on the rollup', progs.er.methods.startTournament().accountsPartial({ signer: wallet, tournament: active, price })));
      }
      // any player resolves a round whose timer is up (with cranks only as a backup, 8 s after a bell the crank missed)
      if (t.status === 1 && t.onEr && (me >= 0 || host) && Date.now() / 1000 >= t.roundStartedAt + t.roundSecs + (cranked ? 8 : 0.5)) {
        const price = await feedOf(progs.base, t.coin);
        await once(`resolve-${t.round}`, () => onEr('Resolve round', progs.er.methods.resolveRound().accountsPartial({ payer: sponsor, tournament: active, price })));
      }
      // finished and home on Solana: the settle Magic Action pays out as it lands; by hand only if it is still unsettled
      if (t.status === 2 && !t.onEr) homeAt.current ??= Date.now(); else homeAt.current = null;
      if (t.status === 2 && !t.onEr && (me >= 0 || host) && Date.now() - (homeAt.current ?? Date.now()) > (host ? 8000 : 14000)) {
        await once('settle', () => onBase('Settle · pay the survivors', async () => {
          const cfg = await progs.base.account.config.fetch(P.config);
          return progs.base.methods.settleTournament().accountsPartial({ tournament: active, vault: P.vault(active), treasury: cfg.treasury, rentPayer: sponsor })
            .remainingAccounts(t.players.map((p) => ({ pubkey: usdcAta(p), isSigner: false, isWritable: true }))).rpc();
        }));
      }
    };
    step();
    const h = setInterval(step, 1000);
    return () => { alive = false; clearInterval(h); };
  }, [active, progs, wallet, sponsor]); // eslint-disable-line react-hooks/exhaustive-deps

  const host = guard('host', async () => {
    const nonce = Date.now();
    const key = P.tour(wallet!, nonce);
    await onBase('Host a Royale', () => progs!.base.methods
      .createTournament(new BN(nonce), new BN(ENTRY_USDC * USDC), +seats, NO_COIN, +lives, MAX_ROUNDS, ROUND_SECS)
      .accountsPartial({ creator: wallet!, payer: sponsor!, tournament: key, vault: P.vault(key), usdcMint: USDC_MINT }).rpc());
    await onBase('Join · escrow USDC entry', () => progs!.base.methods.joinTournament().accountsPartial({ player: wallet!, tournament: key, vault: P.vault(key), playerUsdc: usdcAta(wallet!) }).rpc());
    const cfg = await progs!.base.account.config.fetch(P.config);
    await onBase('Request VRF coin', () => progs!.base.methods.requestTournamentCoin([...random32()]).accountsPartial({ creator: wallet!, payer: sponsor!, tournament: key, oracleQueue: cfg.vrfQueue }).rpc());
    await setActiveTour(key);
  });
  const join = (t: TourView) => guard(`join-${t.nonce}`, async () => {
    await onBase('Join · escrow USDC entry', () => progs!.base.methods.joinTournament().accountsPartial({ player: wallet!, tournament: t.key, vault: P.vault(t.key), playerUsdc: usdcAta(wallet!) }).rpc());
    await setActiveTour(t.key);
  })();
  const goLive = guard('live', () => onBase('Hand it to the rollup', () => progs!.base.methods.delegateTournament(tour!.creator, new BN(tour!.nonce))
    .accountsPartial({ host: wallet!, payer: sponsor!, tournament: active! }).remainingAccounts([{ pubkey: NET.erValidator, isSigner: false, isWritable: false }]).rpc()));
  const cancel = guard('cancel', async () => {
    await onBase('Cancel · refund every entry', () => progs!.base.methods.cancelTournament().accountsPartial({ signer: wallet!, tournament: active!, vault: P.vault(active!), rentPayer: sponsor! })
      .remainingAccounts(tour!.players.map((p) => ({ pubkey: usdcAta(p), isSigner: false, isWritable: true }))).rpc());
    await setActiveTour(null);
  });
  // each round's call is signed by this device's MagicBlock session key (one wallet signature for the session, none per round)
  const call = (dir: 1 | 2) => guard(`call-${dir}`, async () => {
    let created: string | undefined;
    const sess = await ensureSession(chain.signer!, (sig) => { created = sig; });
    if (created) await onBase('Create a MagicBlock session key (one signature)', async () => created!);
    await onEr(`Call ${dir === 1 ? 'up ▲' : 'down ▼'} · session key`, progs!.er.methods.callRoundSession(dir).accountsPartial({ signer: sess.kp.publicKey, player: wallet!, sessionToken: sess.token, tournament: active! }), [sess.kp]);
  })();

  const me = tour && wallet ? tour.players.findIndex((p) => p.equals(wallet)) : -1;
  const isHost = !!(tour && wallet && tour.creator.equals(wallet));
  const sym = tour && rolled(tour.coin) ? COIN_SYMBOLS[tour.coin] : null;
  const left = tour ? Math.max(0, tour.roundStartedAt + tour.roundSecs - now) : 0;
  const move = tour && price ? price - tour.roundPrice : 0;
  // this round's price line, so you read the chart before you call it
  const [roundLine, setRoundLine] = useState<{ round: number; p: number[] }>({ round: 0, p: [] });
  useEffect(() => {
    if (!tour || tour.status !== 1 || !price) return;
    setRoundLine((r) => (r.round !== tour.round ? { round: tour.round, p: [tour.roundPrice, price] } : r.p[r.p.length - 1] === price ? r : { round: r.round, p: [...r.p, price].slice(-120) }));
  }, [price, tour?.round, tour?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lineW, setLineW] = useState(0);
  const movePct = tour && price && tour.roundPrice ? (move / tour.roundPrice) * 100 : 0;
  const ready = hasPlayer && (bal ?? 0) >= ENTRY_USDC;
  /** The pot in USDC. */
  const pot = tour ? (tour.entry * tour.count) / USDC : 0;
  const top = tour ? Math.max(0, ...tour.lives) : 0;
  // payout exactly as the program does it: rake = floor(pot * 300 bps), survivors split the rest
  const survivors = tour && top > 0 ? tour.lives.filter((l) => l === top).length : 0;
  const payout = tour ? potAfterRake(tour.entry, tour.count) : 0;
  const survived = !!tour && top > 0 && me >= 0 && tour.lives[me] === top;
  const share = survivors ? payout / survivors : 0;
  const aliveNow = tour ? tour.lives.filter((l) => l > 0).length : 0;

  // a broken heart flashes the moment a resolved round takes one of mine
  useEffect(() => {
    if (!tour || me < 0) return;
    const l = tour.lives[me];
    if (myLives.current !== null && l < myLives.current) setLostK((k) => k + 1);
    myLives.current = l;
  }, [tour?.lives.join(','), me]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (k: PublicKey) => (wallet && k.equals(wallet) ? 'You' : names.get(k.toBase58())?.name ?? `Player ${k.toBase58().slice(0, 4)}`);
  const seatsOf = (t: TourView, winnersOnly = false): Seat[] => t.players.map((p, i) => ({
    key: p.toBase58(), profile: names.get(p.toBase58()), name: nameOf(p), lives: t.lives[i], you: !!wallet && p.equals(wallet), host: p.equals(t.creator),
    called: t.calls[i] !== 0, winner: winnersOnly && top > 0 && t.lives[i] === top,
  }));

  const fresh = lobby.filter((t) => Date.now() - t.nonce < STALE_MIN * 60_000);
  const older = lobby.filter((t) => Date.now() - t.nonce >= STALE_MIN * 60_000);
  const lobbyCard = (t: TourView, stale: boolean) => {
    const mine = !!wallet && t.players.some((p) => p.equals(wallet));
    return (
      <OpenRoyale key={t.key.toBase58()} host={names.get(t.creator.toBase58())} hostName={nameOf(t.creator)} taken={t.count} max={t.maxPlayers} lives={t.startLives}
        pot={(t.entry * t.count) / USDC} age={`${(t.entry / USDC).toFixed(0)} USDC in · ${ago(Date.now() - t.nonce)}`} mine={mine} stale={stale}
        disabled={!!busy} onOpen={() => setActiveTour(t.key)} onJoin={() => (ready ? join(t) : setProof(true))} />
    );
  };

  const inGame = !!active && !!tour && tour.status < 3;
  const over = !!active && !!tour && tour.status >= 3;
  const ts = useTourScroll<ComponentRef<typeof ScrollView>>();
  // the lobby only: no tour while a Royale is open on this device (or still being looked up)
  useScreenTour('royale', !active);

  return (
    <View style={{ flex: 1, backgroundColor: '#07070A' }}>
      <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
        <TourScroll value={ts.scroller}>
        <Row style={{ gap: 10, marginBottom: 6 }}>
          <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <View style={{ flex: 1 }} />
          <TourTarget id="royale-wallet">
          <Pressable onPress={() => setProof(true)} accessibilityRole="button" accessibilityLabel="Wallet and on-chain proof"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SURFACE, borderRadius: 16, paddingHorizontal: 12, height: 44 }}>
            <LiveDot color={C.up} /><Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{bal === null ? 'Wallet' : `${bal.toFixed(2)} USDC`}</Txt>
          </Pressable>
          </TourTarget>
        </Row>
        {err ? <ErrorLine msg={err} /> : null}

        {over && tour ? (
          tour.status === 3 ? (
            /* ---------- results ---------- */
            <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', paddingTop: 6 }}>
              <View>
                <ClayLoop name={survived ? 'win' : me >= 0 ? 'ko' : 'royale'} size={170} loop={survived} style={{ borderRadius: 36 }} />
                {me >= 0 ? <Lottie name={survived ? 'win' : 'knockout'} size={300} style={{ position: 'absolute', left: -65, top: -70 }} /> : null}
                {me >= 0 ? <Sprite name={survived ? 'bo-trophy' : 'bo-ko'} size={96} style={{ position: 'absolute', left: -104, bottom: -6 }} /> : null}
              </View>
              <Text style={{ ...FONT.display, fontSize: 38, color: me < 0 ? C.ink : survived ? C.up : C.down, marginTop: 8, letterSpacing: -1, textAlign: 'center' }}>
                {me < 0 ? 'Royale over' : survived ? 'You survived' : 'Knocked out'}
              </Text>
              {me >= 0 ? (
                <Text style={{ ...FONT.display, fontSize: 30, color: survived ? GOLD : C.ink }}>{survived ? `+${share.toFixed(2)} USDC` : `−${(tour.entry / USDC).toFixed(2)} USDC`}</Text>
              ) : null}
              <Txt v="small" style={{ textAlign: 'center', marginTop: 6 }}>
                {survivors === 0 ? 'Nobody had a heart left.' : survivors === 1 ? 'Last one standing took the pot.' : `${survivors} survivors split ${payout.toFixed(2)} USDC.`}
                {' '}{tour.round} round{tour.round === 1 ? '' : 's'} on {sym ? coinName(sym) : 'the coin'}.
              </Txt>
              <View style={{ alignSelf: 'stretch', marginTop: 20, backgroundColor: '#0E0E13', borderRadius: 26, paddingVertical: 18, paddingHorizontal: 10 }}>
                <Text style={{ ...FONT.semi, fontSize: 18, color: C.ink, textAlign: 'center', marginBottom: 14 }}>The table</Text>
                <Table seats={seatsOf(tour, true)} startLives={tour.startLives} />
              </View>
              <BigCta title="Back to the lobby" color={C.ink} onPress={() => setActiveTour(null)} />
            </Animated.View>
          ) : (
            /* ---------- cancelled ---------- */
            <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', backgroundColor: SURFACE, borderRadius: 26, padding: 18, marginTop: 6 }}>
              <Image source={ART.stash} style={{ width: 90, height: 90 }} contentFit="contain" />
              <Text style={{ ...FONT.display, fontSize: 26, color: C.ink, marginTop: 6, textAlign: 'center' }}>{(tour.entry / USDC).toFixed(2)} USDC IS BACK</Text>
              <Txt v="small" style={{ textAlign: 'center', marginTop: 4 }}>The Royale was cancelled before round 1, so every entry went straight back to its player.</Txt>
              <BigCta title="Back to the lobby" color={C.ink} onPress={() => setActiveTour(null)} />
            </Animated.View>
          )
        ) : inGame && tour ? (
          <Animated.View entering={FadeInDown.springify()} style={{ marginTop: 6 }}>
            {tour.status === 0 ? (
              /* ---------- waiting room ---------- */
              <View style={{ alignItems: 'center' }}>
                <TableRoll pool={POOL} landed={sym} />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' }}>
                  {[['Pot', fmtUsd(pot)], ['Seats', `${tour.count}/${tour.maxPlayers}`], ['Hearts', `${tour.startLives}`]].map(([k, v]) => (
                    <View key={k} style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 20, paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ ...FONT.bold, fontSize: 10.5, color: C.muted, letterSpacing: 1 }}>{k}</Text>
                      <Text style={{ ...FONT.semi, fontSize: 19, letterSpacing: -0.3, color: k === 'Pot' ? GOLD : C.ink, marginTop: 2 }} numberOfLines={1}>{v}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ alignSelf: 'stretch', marginTop: 14, backgroundColor: '#0E0E13', borderRadius: 26, paddingVertical: 18, paddingHorizontal: 10 }}>
                  <Table seats={seatsOf(tour)} startLives={tour.startLives} empty={Math.max(0, tour.maxPlayers - tour.count)} />
                </View>
                {isHost && !tour.onEr ? (
                  <View style={{ alignSelf: 'stretch' }}>
                    <BigCta
                      title={busy === 'live' ? 'Starting…' : tour.count < 2 ? 'Waiting for players' : !rolled(tour.coin) ? 'Rolling the coin…' : `Start · ${tour.count} Players`}
                      disabled={!!busy || tour.count < 2 || !rolled(tour.coin)} onPress={goLive} />
                    <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>{tour.count < 2 ? 'Share the table: anyone with a Clashy wallet can join from the lobby.' : 'Start whenever you like. Empty seats just stay empty.'}</Txt>
                    <Pressable onPress={cancel} disabled={!!busy} style={{ marginTop: 10, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                      <Txt v="label" color={C.muted}>{busy === 'cancel' ? 'Refunding…' : 'Cancel and refund everyone'}</Txt>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', marginTop: 18 }}>
                    <Text style={{ ...FONT.display, fontSize: 24, color: C.ink, textAlign: 'center' }}>{tour.onEr ? 'Starting round 1…' : 'Waiting for the host'}</Text>
                    <Txt v="small" style={{ textAlign: 'center', marginTop: 4 }}>{tour.onEr ? 'Get ready to call it.' : `${nameOf(tour.creator)} starts the Royale. Your ${(tour.entry / USDC).toFixed(2)} USDC is held safely until then.`}</Txt>
                  </View>
                )}
              </View>
            ) : tour.status === 1 ? (
              /* ---------- live round ---------- */
              <View style={{ alignItems: 'center' }}>
                <RoundBanner round={tour.round} />
                <Row style={{ gap: 8 }}>
                  <StatusPill text={`Round ${tour.round} / ${tour.maxRounds}`} color={GOLD} dot={false} />
                  <StatusPill text={`${aliveNow} Left`} color={C.opp} />
                </Row>
                <View style={{ marginTop: 16, alignSelf: 'stretch', alignItems: 'center' }}>
                  <RoundRing sym={sym ?? 'SOL'} left={left} total={tour.roundSecs} />
                  {/* your clay fighter: takes a hit when a round costs you a heart, knocked out when you're out */}
                  {me >= 0 ? <Sprite key={`me-${lostK}-${tour.lives[me] > 0}`} name={tour.lives[me] === 0 ? 'bo-ko' : lostK > 0 ? 'bo-hit' : 'bo-idle'} size={84} style={{ position: 'absolute', left: 0, bottom: 0 }} /> : null}
                </View>
                <Text style={{ ...FONT.bold, fontSize: 38, letterSpacing: -1.2, color: move > 0 ? C.up : move < 0 ? C.down : C.ink, marginTop: 10 }}>{price ? fmtUsd(price) : '…'}</Text>
                <Txt v="small">{sym ? coinName(sym) : 'Coin'} from {fmtUsd(tour.roundPrice)} · {movePct >= 0 ? '+' : ''}{movePct.toFixed(3)}%</Txt>
                <View onLayout={(e) => setLineW(Math.floor(e.nativeEvent.layout.width))} style={{ alignSelf: 'stretch', marginTop: 12, backgroundColor: SURFACE, borderRadius: 22, paddingVertical: 6, overflow: 'hidden' }}>
                  {lineW > 0 && roundLine.round === tour.round && roundLine.p.length > 1
                    ? <LiveChart data={roundLine.p} w={lineW} h={110} refLine={tour.roundPrice} refLabel="round start" color={move >= 0 ? C.up : C.down} minSpan={0.0004} />
                    : <View style={{ height: 110, alignItems: 'center', justifyContent: 'center' }}><LiveDot color={C.brandSoft} /><Txt v="small" style={{ marginTop: 6 }}>Drawing this round's price…</Txt></View>}
                </View>
                <Text style={{ ...FONT.semi, fontSize: 20, color: left > 0 && left < 3 ? C.opp : C.muted, marginTop: 8 }}>{left > 0 ? `${Math.ceil(left)} S to call` : 'Calling it…'}</Text>
                <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
                  {me >= 0 && tour.lives[me] > 0 ? (
                    tour.calls[me] ? (
                      <View style={{ alignItems: 'center', backgroundColor: SURFACE, borderRadius: 24, padding: 18, borderWidth: 2, borderColor: tour.calls[me] === 1 ? C.up : C.down }}>
                        <Text style={{ ...FONT.display, fontSize: 24, color: tour.calls[me] === 1 ? C.up : C.down, textAlign: 'center' }}>{tour.calls[me] === 1 ? '▲ You called up' : '▼ You called down'}</Text>
                        <Txt v="small" style={{ marginTop: 4, textAlign: 'center' }}>Locked in. Wrong call costs a heart when the clock hits zero.</Txt>
                      </View>
                    ) : <CallButtons onUp={() => call(1)} onDown={() => call(2)} disabled={!!busy || left <= 0} />
                  ) : me >= 0 ? (
                    <View style={{ alignItems: 'center', backgroundColor: SURFACE, borderRadius: 24, padding: 18 }}>
                      <Text style={{ ...FONT.display, fontSize: 30, color: C.down }}>You're out</Text>
                      <Txt v="small" style={{ marginTop: 4, textAlign: 'center' }}>No hearts left. Watch who outlasts the table.</Txt>
                    </View>
                  ) : null}
                </View>
                {me >= 0 && tour.lives[me] > 0 ? (
                  <Row style={{ gap: 8, marginTop: 14 }}><Txt v="small">Your hearts</Txt><Hearts lives={tour.lives[me]} max={tour.startLives} size={22} /></Row>
                ) : null}
                <View style={{ alignSelf: 'stretch', marginTop: 20, backgroundColor: '#0E0E13', borderRadius: 26, paddingVertical: 18, paddingHorizontal: 10 }}>
                  <Text style={{ ...FONT.semi, fontSize: 18, color: C.ink, textAlign: 'center', marginBottom: 14 }}>STILL STANDING · {aliveNow}</Text>
                  <Table seats={seatsOf(tour)} startLives={tour.startLives} showCalls />
                </View>
              </View>
            ) : (
              /* ---------- final round resolved, paying out ---------- */
              <View style={{ alignItems: 'center' }}>
                <ClayLoop name="royale" size={150} style={{ borderRadius: 34 }} />
                <Text style={{ ...FONT.display, fontSize: 34, color: C.ink, marginTop: 8, textAlign: 'center' }}>Final bell</Text>
                <Txt v="small" style={{ textAlign: 'center' }}>{tour.onEr ? 'Locking in the last round…' : `Paying ${fmtUsd(payout)} to the survivors…`}</Txt>
                <View style={{ alignSelf: 'stretch', marginTop: 20, backgroundColor: '#0E0E13', borderRadius: 26, paddingVertical: 18, paddingHorizontal: 10 }}>
                  <Table seats={seatsOf(tour, true)} startLives={tour.startLives} />
                </View>
              </View>
            )}
            <Hit k={lostK} src={FX.heartBroken} />
          </Animated.View>
        ) : (
          /* ---------- lobby ---------- */
          <>
            <TourTarget id="royale-intro" style={{ marginTop: 4 }}>
            <View style={{ alignItems: 'center' }}>
              <ClayLoop name="royale" size={150} style={{ borderRadius: 34 }} />
              <Text style={{ ...FONT.bold, fontSize: 42, letterSpacing: -1.4, color: C.ink, marginTop: -4 }}>Royale</Text>
              <Txt v="small" style={{ textAlign: 'center' }}>{ENTRY_USDC} USDC in. Last one standing takes the pot.</Txt>
            </View>
            <HowItWorks secs={ROUND_SECS} />
            </TourTarget>
            <Segmented label="Seats" value={seats} onChange={setSeats} items={(['2', '4', '8', '16'] as const).map((k) => ({ key: k, label: k }))} />
            <Segmented label="Hearts each" value={lives} onChange={setLives} items={(['1', '2', '3'] as const).map((k) => ({
              key: k,
              label: (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ ...FONT.semi, fontSize: 18, color: lives === k ? '#000' : C.ink }}>{k}</Text>
                  <Image source={FX.heart} style={{ width: 18, height: 18 }} contentFit="contain" />
                </View>
              ),
            }))} />
            <TourTarget id="royale-host" style={{ marginTop: 12 }}>
            <Txt v="small" style={{ textAlign: 'center' }}>
              A full table of {seats} pays <Text style={{ ...FONT.bold, color: GOLD }}>{fmtUsd(potAfterRake(ENTRY_USDC * USDC, +seats))}</Text> to whoever is left.
            </Txt>
            <BigCta title={busy === 'host' ? 'Hosting…' : ready ? `Host · ${ENTRY_USDC} USDC` : 'Set up your wallet'} disabled={!!busy} onPress={ready ? host : () => setProof(true)} />
            </TourTarget>

            <TourTarget id="royale-open" style={{ marginTop: 28 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ ...FONT.display, fontSize: 24, color: C.ink }}>Open royales</Text>
              <Txt v="small">{fresh.length} open</Txt>
            </Row>
            {lobbyErr ? <ErrorLine msg={lobbyErr} /> : null}
            {fresh.length === 0 ? (
              <View style={{ alignItems: 'center', backgroundColor: SURFACE, borderRadius: 22, padding: 18 }}>
                <Image source={ART.bellArt} style={{ width: 70, height: 70 }} contentFit="contain" />
                <Txt v="small" style={{ textAlign: 'center', marginTop: 6 }}>No fresh tables right now. Host one and players can jump in from here.</Txt>
              </View>
            ) : fresh.map((t) => lobbyCard(t, false))}
            </TourTarget>

            {older.length ? (
              <>
                <Pressable onPress={() => setShowOld((s) => !s)} accessibilityRole="button" style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <Txt v="label" color={C.muted}>Older tables · {older.length}</Txt>
                  <Txt v="small" color={C.muted}>{showOld ? 'Hide ▲' : 'Show ▼'}</Txt>
                </Pressable>
                {showOld ? (
                  <>
                    <Txt v="small" style={{ marginBottom: 8 }}>Opened over {STALE_MIN} minutes ago. Still open on chain, but the host may be gone.</Txt>
                    {older.map((t) => lobbyCard(t, true))}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        )}
        </TourScroll>
      </ScrollView>

      <Sheet open={proof} onClose={() => setProof(false)} title="Wallet and on-chain proof">
        <WalletCard chain={chain} note={`entry ${ENTRY_USDC} USDC · ${ROUND_SECS} s rounds · 3% rake · fees and rent paid by Clashy`} need={ENTRY_USDC} />
        <Txt v="small" style={{ marginTop: 10 }}>
          Every step of a Royale is a real transaction on {NET.label}: entries in a Solana escrow, the coin rolled by MagicBlock VRF, every round called and resolved on a MagicBlock rollup, the survivors paid back on Solana.
          {active ? ` This Royale: ${short(active.toBase58())}.` : ''}
        </Txt>
        <TxStrip txs={chain.txs} />
      </Sheet>
    </View>
  );
}
