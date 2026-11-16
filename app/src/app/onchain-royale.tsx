// On-chain Royale: entries escrowed on Solana, the tournament handed to a MagicBlock rollup, every round each
// player calls up or down on one coin, wrong or missing calls cost a life, and the survivors split the pot on
// Solana. Any player's device resolves a round once its timer runs out (resolve_round is permissionless).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BN, COIN_SYMBOLS, NET, P, PublicKey, TOUR_STATUS, USDC, USDC_MINT, priceOf, random32, readTour, usdcAta, type TourView,
} from '@/chain/client';
import { TxStrip, WalletCard, errText, short, useChain } from '@/chain/useChain';
import { ClayLoop } from '@/ui/clay';
import { FX } from '@/ui/fx';
import { Art, ART, BackBtn, Btn, Card, Chips, ErrorLine, LiveDot, Row, Tag, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, S } from '@/ui/tokens';

const ACTIVE = 'clashy:chain:tour';
const NO_COIN = 255;
/** Royale entry, in USDC. */
const ENTRY_USDC = 2;
const ROUND_SECS = 10;
const MAX_ROUNDS = 10;
const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Heart = ({ on }: { on: boolean }) => <Image source={on ? FX.heart : FX.heartBroken} style={{ width: 20, height: 20, opacity: on ? 1 : 0.5 }} contentFit="contain" />;

export default function OnchainRoyale() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const chain = useChain(['Resolve round']);
  const { me: wallet, sponsor, progs, hasPlayer, bal, busy, guard, onBase, onEr, err, setErr } = chain;

  const [active, setActive] = useState<PublicKey | null>(null);
  const [tour, setTour] = useState<TourView | null>(null);
  const [lobby, setLobby] = useState<TourView[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now() / 1000);
  const inflight = useRef(new Set<string>());

  // host form (the coin is rolled by MagicBlock VRF once the Royale is created)
  const [seats, setSeats] = useState<'2' | '4' | '8' | '16'>('4');
  const [lives, setLives] = useState<'1' | '2' | '3'>('2');

  const setActiveTour = async (k: PublicKey | null) => {
    setActive(k); setTour(null);
    if (k) await AsyncStorage.setItem(ACTIVE, k.toBase58()); else await AsyncStorage.removeItem(ACTIVE);
  };
  useEffect(() => { AsyncStorage.getItem(ACTIVE).then((v) => v && setActive(new PublicKey(v))).catch(() => {}); }, []);
  useEffect(() => { const h = setInterval(() => setNow(Date.now() / 1000), 250); return () => clearInterval(h); }, []);

  // lobby: open tournaments on Solana
  useEffect(() => {
    if (!progs) return;
    let alive = true;
    const load = async () => {
      try {
        const all = await progs.base.account.tournament.all();
        const open = await Promise.all(all.filter((a) => a.account.status === 0).map((a) => readTour(progs.base, a.publicKey)));
        if (alive) setLobby((open.filter(Boolean) as TourView[]).filter((t) => t.status === 0 && !t.onEr).sort((a, b) => b.nonce - a.nonce));
      } catch (e) { if (alive) setErr(`Cannot read tournaments from ${NET.label}: ${errText(e)}`); }
    };
    load();
    const h = setInterval(load, 3000);
    return () => { alive = false; clearInterval(h); };
  }, [progs]); // eslint-disable-line react-hooks/exhaustive-deps

  // the active tournament's state machine, polled every second
  useEffect(() => {
    if (!active || !progs || !wallet || !sponsor) return;
    let alive = true;
    const step = async () => {
      const t = await readTour(progs.base, active).catch(() => null);
      if (!alive || !t) return;
      setTour(t);
      if (t.coin < 3) setPrice(await priceOf(progs.base, t.coin).catch(() => null));
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
      // host: once delegated, start on the rollup
      if (t.status === 0 && t.onEr && host) {
        await once('start', () => onEr('Start on the rollup', progs.er.methods.startTournament().accountsPartial({ signer: wallet, tournament: active, price: P.feed(t.coin) })));
      }
      // any player: resolve the round when its timer is up
      if (t.status === 1 && t.onEr && (me >= 0 || host) && Date.now() / 1000 >= t.roundStartedAt + t.roundSecs + 0.5) {
        await once(`resolve-${t.round}`, () => onEr('Resolve round', progs.er.methods.resolveRound().accountsPartial({ payer: sponsor, tournament: active, price: P.feed(t.coin) })));
      }
      // finished and home on Solana: anyone settles
      if (t.status === 2 && !t.onEr && (me >= 0 || host)) {
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
  const call = (dir: 1 | 2) => guard(`call-${dir}`, () => onEr(`Call ${dir === 1 ? 'up ▲' : 'down ▼'}`, progs!.er.methods.callRound(dir).accountsPartial({ player: wallet!, tournament: active! })))();

  const me = tour && wallet ? tour.players.findIndex((p) => p.equals(wallet)) : -1;
  const isHost = !!(tour && wallet && tour.creator.equals(wallet));
  const sym = tour && tour.coin < 3 ? COIN_SYMBOLS[tour.coin] : 'VRF…';
  const left = tour ? Math.max(0, tour.roundStartedAt + tour.roundSecs - now) : 0;
  const move = tour && price ? price - tour.roundPrice : 0;
  const ready = hasPlayer && (bal ?? 0) >= ENTRY_USDC;
  /** The pot in USDC. */
  const pot = tour ? (tour.entry * tour.count) / USDC : 0;
  const top = tour ? Math.max(0, ...tour.lives) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">On-chain Royale</Txt><Txt v="small">{NET.label} · rounds on the MagicBlock rollup</Txt></View>
        <Row style={{ gap: 6 }}><LiveDot color={C.up} /><Txt v="small" color={C.up}>On chain</Txt></Row>
      </Row>

      <WalletCard chain={chain} note={`entry ${ENTRY_USDC} USDC · ${ROUND_SECS} s rounds · 3% rake`} need={ENTRY_USDC} />
      {err ? <ErrorLine msg={err} /> : null}

      {!active || !tour || tour.status >= 3 ? (
        <>
          {tour && tour.status === 3 ? (
            <Animated.View entering={FadeInDown.springify()}>
              <Card style={{ alignItems: 'center', padding: 16, marginTop: 12 }}>
                <ClayLoop name={me >= 0 && tour.lives[me] === top && top > 0 ? 'win' : 'royale'} size={150} loop style={{ borderRadius: 32 }} />
                <Txt v="title">{me >= 0 && tour.lives[me] === top && top > 0 ? 'Last one standing.' : 'Knocked out.'}</Txt>
                <Txt v="small" style={{ textAlign: 'center' }}>Settled on Solana · {tour.round} round{tour.round === 1 ? '' : 's'} on {sym} · {tour.lives.filter((l) => l === top && top > 0).length} survivor(s) split {(pot * 0.97).toFixed(2)} USDC</Txt>
                <Btn title="Back to the lobby" kind="white" style={{ marginTop: 10, alignSelf: 'stretch' }} onPress={() => setActiveTour(null)} />
              </Card>
            </Animated.View>
          ) : null}

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Host a Royale</Txt>
          <Card style={{ padding: 14 }}>
            <Row style={{ gap: 12, marginBottom: 10 }}>
              <Art src={ART.tileRoyale} size={64} radius={16} />
              <Txt v="small" style={{ flex: 1 }}>MagicBlock VRF rolls one coin for everyone. Every {ROUND_SECS} s, call it up or down. A wrong call or no call costs a life. Up to {MAX_ROUNDS} rounds; whoever has the most lives left splits the pot.</Txt>
            </Row>
            <Txt v="small" style={{ marginBottom: 4 }}>Seats</Txt>
            <Chips items={(['2', '4', '8', '16'] as const).map((k) => ({ key: k, label: k }))} value={seats} onChange={setSeats} />
            <Txt v="small" style={{ marginBottom: 4 }}>Lives</Txt>
            <Chips items={(['1', '2', '3'] as const).map((k) => ({ key: k, label: `${k} ♥` }))} value={lives} onChange={setLives} />
            <Btn title={busy === 'host' ? 'Hosting…' : `Host and join · ${ENTRY_USDC} USDC`} disabled={!ready || !!busy} onPress={host} />
          </Card>

          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Open lobbies</Txt>
          {lobby.length === 0 ? (
            <Card style={{ alignItems: 'center', padding: 16 }}><Txt v="small" style={{ textAlign: 'center' }}>No open Royales on {NET.label}. Host one, then join it from a second device or browser tab.</Txt></Card>
          ) : lobby.map((t) => (
            <Card key={t.key.toBase58()} style={{ marginBottom: 8, padding: 12 }}>
              <Row style={{ gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Txt v="label">{t.coin < 3 ? COIN_SYMBOLS[t.coin] : 'Coin rolling'} · {t.count}/{t.maxPlayers} seats · {t.startLives} ♥</Txt>
                  <Txt v="small">Entry {(t.entry / USDC).toFixed(2)} USDC · host {short(t.creator.toBase58())}</Txt>
                </View>
                {wallet && t.players.some((p) => p.equals(wallet))
                  ? <Btn title="Open" kind="ghost" h={38} onPress={() => setActiveTour(t.key)} />
                  : <Btn title="Join" h={38} disabled={!ready || !!busy || t.count >= t.maxPlayers} onPress={() => join(t)} />}
              </Row>
            </Card>
          ))}
        </>
      ) : (
        <Animated.View entering={FadeInDown.springify()}>
          <Card style={{ marginTop: 12, padding: 16 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label">Royale {short(active.toBase58())}</Txt>
              <Txt v="small" color={tour.onEr ? C.brandSoft : C.muted}>{tour.onEr ? 'On the rollup' : 'On Solana'} · {TOUR_STATUS[tour.status]}</Txt>
            </Row>
            <Row style={{ marginTop: 12, gap: 8 }}>
              {[['Pot · USDC', pot.toFixed(2)], ['Coin', sym], tour.status === 1 ? ['Round', `${tour.round}/${tour.maxRounds}`] : ['Seats', `${tour.count}/${tour.maxPlayers}`]].map(([k, v]) => (
                <View key={k} style={{ flex: 1, backgroundColor: C.s2, borderRadius: 12, padding: 10 }}><Txt v="small" lines={1}>{k}</Txt><Txt v="label" lines={1}>{v}</Txt></View>
              ))}
            </Row>

            {tour.status === 0 ? (
              <>
                <Txt v="small" style={{ marginTop: 12 }}>{tour.coin >= 3 ? 'MagicBlock VRF is rolling the coin…' : `Rolled by MagicBlock VRF: ${sym}. `}{tour.onEr ? 'On the rollup · starting…' : isHost ? (tour.count >= 2 ? 'Everyone in? Hand it to the rollup to start round 1.' : 'Waiting for at least one more player. Join from a second device or tab.') : 'Waiting for the host to start.'}</Txt>
                {isHost && !tour.onEr ? (
                  <Row style={{ gap: 8, marginTop: 10 }}>
                    <Btn title={busy === 'live' ? 'Starting…' : 'Start on the rollup'} style={{ flex: 1 }} disabled={!!busy || tour.count < 2 || tour.coin >= 3} onPress={goLive} />
                    <Btn title="Cancel" kind="ghost" style={{ flex: 0.6 }} disabled={!!busy} onPress={cancel} />
                  </Row>
                ) : null}
              </>
            ) : null}

            {tour.status === 1 ? (
              <View style={{ marginTop: 14, alignItems: 'center' }}>
                <Txt v="small">Round {tour.round} · {sym} from {usd(tour.roundPrice)}</Txt>
                <Txt v="title" style={{ fontSize: 40, lineHeight: 46, marginTop: 4 }} color={move > 0 ? C.up : move < 0 ? C.down : C.ink}>{price ? usd(price) : '…'}</Txt>
                <Txt v="small" color={left < 3 ? C.opp : C.muted}>{left > 0 ? `${left.toFixed(1)} s to call` : 'Resolving on the rollup…'}</Txt>
                {me >= 0 && tour.lives[me] > 0 ? (
                  tour.calls[me] ? <View style={{ marginTop: 10 }}><Tag text={`You called ${tour.calls[me] === 1 ? 'up ▲' : 'down ▼'}`} color={tour.calls[me] === 1 ? C.up : C.down} /></View>
                    : (
                      <Row style={{ gap: 10, marginTop: 12, alignSelf: 'stretch' }}>
                        <Btn title="Up ▲" kind="long" h={60} style={{ flex: 1 }} disabled={!!busy || left <= 0} onPress={() => call(1)} />
                        <Btn title="Down ▼" kind="short" h={60} style={{ flex: 1 }} disabled={!!busy || left <= 0} onPress={() => call(2)} />
                      </Row>
                    )
                ) : me >= 0 ? <Txt v="small" color={C.down} style={{ marginTop: 8 }}>You are out. Watch the rest.</Txt> : null}
              </View>
            ) : null}

            {tour.status === 2 ? <Txt v="small" style={{ marginTop: 12 }}>{tour.onEr ? 'Final round done · committing to Solana…' : 'Back on Solana · paying the survivors…'}</Txt> : null}
          </Card>

          <Txt v="h2" style={{ marginTop: 18, marginBottom: 8 }}>Players</Txt>
          <Card style={{ padding: 6 }}>
            {tour.players.map((p, i) => (
              <Row key={p.toBase58()} style={{ gap: 10, padding: 8 }}>
                <Txt v="label" style={{ flex: 1 }} color={tour.lives[i] ? C.ink : C.dim}>{wallet && p.equals(wallet) ? 'You' : short(p.toBase58())}{p.equals(tour.creator) ? ' · host' : ''}</Txt>
                {tour.status === 1 && tour.lives[i] ? <Txt v="small" color={tour.calls[i] ? C.brandSoft : C.muted}>{tour.calls[i] ? 'called' : 'thinking'}</Txt> : null}
                <Row style={{ gap: 2 }}>{Array.from({ length: tour.startLives }, (_, h) => <Heart key={h} on={h < tour.lives[i]} />)}</Row>
              </Row>
            ))}
          </Card>
          {tour.status !== 1 ? <Btn title="Back to the lobby" kind="ghost" style={{ marginTop: 10 }} onPress={() => setActiveTour(null)} /> : null}
        </Animated.View>
      )}

      <TxStrip txs={chain.txs} />
    </ScrollView>
  );
}
