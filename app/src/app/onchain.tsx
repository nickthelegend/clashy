// On-chain knockout duel: the real `clashy` program on Solana + a MagicBlock Ephemeral Rollup.
// Two devices (or two browser tabs) are two real players. Every step is a signed transaction; the strip at
// the bottom shows each signature, which layer it ran on, how long it took, and an explorer link.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BN, COIN_SYMBOLS, DUEL_STATUS, NET, P, USDC, USDC_MINT, fmtUsdc, openDuels, priceOf, random32, readDuel, sha256, usdcAta, type DuelView, PublicKey,
} from '@/chain/client';
import { TxStrip, WalletCard, errText, short, useChain } from '@/chain/useChain';
import { ClayLoop } from '@/ui/clay';
import { FX, Fill, Hit } from '@/ui/fx';
import { BackBtn, Btn, Card, ErrorLine, LiveDot, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

type Secrets = { seed: number[]; salt?: number[]; side?: number; lev?: number };
/** Each player's stake, in USDC. */
const STAKE_USDC = 5;
const secretKey = (duel: PublicKey) => `clashy:chain:secret:${duel.toBase58()}`;

export default function OnChainDuel() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const chain = useChain(['Check duel']);
  const { me: wallet, sponsor, progs, bal, hasPlayer, txs, err, setErr, busy, guard, onBase, onEr } = chain;
  const [board, setBoard] = useState<DuelView[]>([]);
  const [active, setActive] = useState<PublicKey | null>(null);
  const [duel, setDuel] = useState<DuelView | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const inflight = useRef(new Set<string>());
  /** When this device first saw the duel matched (for the VRF fallback timer). */
  const matchedAt = useRef<number | null>(null);
  /** When this device first saw the finished duel back on Solana (the joiner's settle backup timer). */
  const homeAt = useRef<number | null>(null);
  const [vrf, setVrf] = useState<{ queue: PublicKey; required: boolean } | null>(null);

  // the challenge board
  useEffect(() => {
    if (!progs) return;
    let alive = true;
    const tick = async () => { try { const b = await openDuels(progs.base); if (alive) setBoard(b); } catch { /* the wallet card shows network errors */ } };
    tick();
    const h = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(h); };
  }, [progs]);
  useEffect(() => { AsyncStorage.getItem('clashy:chain:active').then((v) => v && setActive(new PublicKey(v))).catch(() => {}); }, []);

  // the active duel's state machine, polled every second
  useEffect(() => {
    if (!active || !progs || !wallet || !sponsor) return;
    let alive = true;
    const step = async () => {
      const d = await readDuel(progs.base, active).catch(() => null);
      if (!alive || !d) return;
      setDuel(d);
      if (d.coin < 3) setPrice(await priceOf(progs.base, d.coin).catch(() => null));
      const me = d.creator.equals(wallet) ? 0 : d.joiner.equals(wallet) ? 1 : -1;
      if (me < 0) return;
      const raw = await AsyncStorage.getItem(secretKey(active));
      const sec: Secrets | null = raw ? JSON.parse(raw) : null;
      const once = async (tag: string, fn: () => Promise<unknown>) => {
        if (inflight.current.has(tag)) return;
        inflight.current.add(tag);
        try { await fn(); } catch (e) {
          inflight.current.delete(tag);
          // the other device often wins a race (both may settle); only a failure that left the duel where it was is real
          const now = await readDuel(progs.base, active).catch(() => null);
          if (now && (now.status !== d.status || now.onEr !== d.onEr || now.seedsRevealed !== d.seedsRevealed || now.picksRevealed !== d.picksRevealed)) return;
          setErr(errText(e));
        }
      };
      // MATCHED: the creator asks MagicBlock VRF to roll the coin; its oracle answers the callback.
      // Only if VRF is not required and no answer came within 15 s do both players reveal their seeds.
      if (d.status === 1) {
        matchedAt.current ??= Date.now();
        let cfg = vrf;
        if (!cfg) {
          const c = await progs.base.account.config.fetch(P.config);
          cfg = { queue: c.vrfQueue, required: c.vrfRequired };
          setVrf(cfg);
        }
        if (me === 0 && !d.vrfPending) {
          await once('vrf', () => onBase('Request VRF roll', () => progs.base.methods.requestCoinRoll([...random32()]).accountsPartial({ player: wallet, payer: sponsor, duel: active, oracleQueue: cfg.queue }).rpc()));
        }
        if (!cfg.required && sec && !(d.seedsRevealed & (1 << me)) && Date.now() - matchedAt.current > 15_000) {
          await once(`seed-${me}`, () => onBase('Reveal roll seed (VRF fallback)', () => progs.base.methods.revealSeed(sec.seed).accountsPartial({ signer: wallet, duel: active }).rpc()));
        }
      } else {
        matchedAt.current = null;
      }
      // ROLLED: once both picks are committed, reveal mine
      if (d.status === 2 && sec?.salt && d.picksCommitted === 0b11 && !(d.picksRevealed & (1 << me))) {
        await once(`reveal-${me}`, () => onBase('Reveal sealed pick', () => progs.base.methods.revealPick(sec.side!, sec.lev!, sec.salt!).accountsPartial({ signer: wallet, duel: active }).rpc()));
      }
      // both revealed: the creator hands the duel to the rollup, then starts it there
      if (d.status === 2 && d.picksRevealed === 0b11 && me === 0 && !d.onEr) {
        await once('delegate', () => onBase('Delegate duel to the rollup', () => progs.base.methods.delegateDuel(d.creator, new BN(d.nonce)).accountsPartial({ player: wallet, payer: sponsor, duel: active }).remainingAccounts([{ pubkey: NET.erValidator, isSigner: false, isWritable: false }]).rpc()));
      }
      if (d.status === 2 && d.picksRevealed === 0b11 && me === 0 && d.onEr) {
        await once('start', () => onEr('Start duel on the rollup', progs.er.methods.startDuel().accountsPartial({ signer: wallet, duel: active, price: P.feed(d.coin) })));
      }
      // LIVE: both devices ask for a check every 2 s (idempotent, signed by the sponsor alone); the finishing check commits and undelegates
      // the creator's device checks; the joiner's only steps in if the bell passed 6 s ago and nobody finished it
      const backup = me === 1 && Date.now() / 1000 > d.startTs + d.lenSecs + 6;
      if (d.status === 3 && d.onEr && (me === 0 || backup) && Date.now() % 2000 < 1000) {
        await onEr('Check duel', progs.er.methods.checkDuel().accountsPartial({ payer: sponsor, duel: active, price: P.feed(d.coin) })).catch(() => {});
      }
      // FINISHED and home on Solana: either player settles
      // FINISHED and home: the creator settles; the joiner settles only if it is still unsettled 6 s later
      if (d.status === 4 && !d.onEr) homeAt.current ??= Date.now(); else homeAt.current = null;
      if (d.status === 4 && !d.onEr && (me === 0 || Date.now() - (homeAt.current ?? Date.now()) > 6000)) {
        await once('settle', () => onBase('Settle on Solana', async () => {
          const cfg = await progs.base.account.config.fetch(P.config);
          return progs.base.methods.settleDuel().accountsPartial({ duel: active, vault: P.vault(active), creatorUsdc: usdcAta(d.creator), joinerUsdc: usdcAta(d.joiner), creatorPlayer: P.player(d.creator), joinerPlayer: P.player(d.joiner), treasury: cfg.treasury, rentPayer: sponsor }).rpc();
        }));
      }
    };
    step();
    const h = setInterval(step, 1000);
    return () => { alive = false; clearInterval(h); };
  }, [active, wallet, sponsor, progs]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveDuel = async (key: PublicKey | null) => {
    setActive(key); setDuel(null); inflight.current.clear();
    if (key) await AsyncStorage.setItem('clashy:chain:active', key.toBase58()); else await AsyncStorage.removeItem('clashy:chain:active');
  };

  const open = guard('open', async () => {
    if (!progs || !wallet || !sponsor) return;
    const nonce = Date.now();
    const key = P.duel(wallet, nonce);
    const seed = random32();
    await AsyncStorage.setItem(secretKey(key), JSON.stringify({ seed: [...seed] } satisfies Secrets));
    const seedHash = [...(await sha256(seed))];
    await onBase('Open duel · escrow USDC stake', () => progs.base.methods.openDuel(new BN(nonce), new BN(STAKE_USDC * USDC), 0b111, 60, new BN(900), seedHash)
      .accountsPartial({ creator: wallet, payer: sponsor, duel: key, vault: P.vault(key), creatorUsdc: usdcAta(wallet), usdcMint: USDC_MINT }).rpc());
    await setActiveDuel(key);
  });
  const join = (d: DuelView) => guard('join', async () => {
    if (!progs || !wallet) return;
    const seed = random32();
    await AsyncStorage.setItem(secretKey(d.key), JSON.stringify({ seed: [...seed] } satisfies Secrets));
    await onBase('Join duel · escrow USDC stake', async () => progs.base.methods.joinDuel([...(await sha256(seed))]).accountsPartial({ joiner: wallet, duel: d.key, vault: P.vault(d.key), joinerUsdc: usdcAta(wallet) }).rpc());
    await setActiveDuel(d.key);
  })();
  const pick = (side: 1 | 2, lev: number) => guard('pick', async () => {
    if (!progs || !wallet || !active) return;
    const raw = await AsyncStorage.getItem(secretKey(active));
    const sec: Secrets = raw ? JSON.parse(raw) : { seed: [] };
    const salt = random32();
    // the program binds the hash to this duel and this player, so a rival cannot copy it
    const hash = await sha256(active.toBytes(), wallet.toBytes(), new Uint8Array([side]), new Uint8Array(new Uint16Array([lev]).buffer), salt);
    await AsyncStorage.setItem(secretKey(active), JSON.stringify({ ...sec, salt: [...salt], side, lev } satisfies Secrets));
    await onBase('Commit sealed pick', () => progs.base.methods.commitPick([...hash]).accountsPartial({ signer: wallet, duel: active }).rpc());
  })();
  const cancel = guard('cancel', async () => {
    if (!progs || !wallet || !active || !sponsor) return;
    await onBase('Cancel · refund USDC stake', () => progs.base.methods.cancelDuel().accountsPartial({ signer: wallet, duel: active, vault: P.vault(active), creatorUsdc: usdcAta(wallet), rentPayer: sponsor }).rpc());
    await setActiveDuel(null);
  });
  const me = duel && wallet ? (duel.creator.equals(wallet) ? 0 : duel.joiner.equals(wallet) ? 1 : -1) : -1;
  const sym = duel && duel.coin < 3 ? COIN_SYMBOLS[duel.coin] : '…';
  const ready = hasPlayer && (bal ?? 0) >= STAKE_USDC;
  const myPnl = duel && me >= 0 ? duel.pnlBps[me] / 100 : 0;
  const theirPnl = duel && me >= 0 ? duel.pnlBps[1 - me] / 100 : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">On-chain duel</Txt><Txt v="small">{NET.label} · Solana + MagicBlock rollup</Txt></View>
        <Row style={{ gap: 6 }}><LiveDot color={C.up} /><Txt v="small" color={C.up}>On chain</Txt></Row>
      </Row>

      <WalletCard chain={chain} note={`${STAKE_USDC} USDC each · 3% rake`} need={STAKE_USDC} />
      {err ? <ErrorLine msg={err} /> : null}

      {!active || !duel || duel.status >= 5 ? (
        <>
          {duel && duel.status === 5 ? (
            <Animated.View entering={FadeInDown.springify()}>
              <Card style={{ alignItems: 'center', padding: 16, marginTop: 12 }}>
                <ClayLoop name={duel.winner === me + 1 ? 'win' : duel.winner === 3 ? 'duel' : 'ko'} size={150} loop={duel.winner === me + 1} style={{ borderRadius: 32 }} />
                <Txt v="title">{duel.winner === 3 ? `Dead heat · ${fmtUsdc(duel.stake)} back` : duel.winner === me + 1 ? `You won ${fmtUsdc(duel.stake * 2 - Math.floor((duel.stake * 2 * 300) / 10_000))}` : `You lost ${fmtUsdc(duel.stake)}`}</Txt>
                <Txt v="small" color={C.muted}>{duel.winner === me + 1 ? 'The pot minus the 3% rake is in your wallet.' : duel.winner === 3 ? 'Both stakes refunded in full.' : 'Your stake went to your rival.'}</Txt>
                <Txt v="small">Settled on Solana · {sym} {duel.entryPrice.toFixed(2)} → {duel.exitPrice.toFixed(2)} · you {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(1)}% · rival {theirPnl >= 0 ? '+' : ''}{theirPnl.toFixed(1)}%</Txt>
                <Btn title="New duel" kind="white" style={{ marginTop: 10, alignSelf: 'stretch' }} onPress={() => setActiveDuel(null)} />
              </Card>
            </Animated.View>
          ) : null}
          <Btn title={busy === 'open' ? 'Opening…' : `Open a duel · ${STAKE_USDC} USDC`} h={58} style={{ marginTop: 14, borderRadius: 18 }} disabled={!ready || !!busy} onPress={open} />
          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Challenge board</Txt>
          {board.filter((d) => !wallet || !d.creator.equals(wallet)).length === 0 ? (
            <Card style={{ alignItems: 'center', padding: 16 }}><Txt v="small" style={{ textAlign: 'center' }}>No open duels from other players right now. Open one, then join it from a second device or browser tab.</Txt></Card>
          ) : board.filter((d) => !wallet || !d.creator.equals(wallet)).map((d) => (
            <Card key={d.key.toBase58()} style={{ marginBottom: 8, padding: 12 }}>
              <Row style={{ gap: 10 }}>
                <View style={{ flex: 1 }}><Txt v="label">{short(d.creator.toBase58())} · {fmtUsdc(d.stake)}</Txt><Txt v="small">{d.lenSecs} s · coin rolled after you join · expires {new Date(d.expiresAt * 1000).toLocaleTimeString()}</Txt></View>
                <Btn title="Join" h={38} disabled={!ready || !!busy} onPress={() => join(d)} />
              </Row>
            </Card>
          ))}
        </>
      ) : (
        <Animated.View entering={FadeInDown.springify()} style={{ marginTop: 12 }}>
          <Card style={{ padding: 16 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label">Duel {short(duel.key.toBase58())}</Txt>
              <Txt v="small" color={duel.onEr ? C.brandSoft : C.muted}>{duel.onEr ? 'On the rollup' : 'On Solana'} · {DUEL_STATUS[duel.status]}</Txt>
            </Row>
            {duel.status === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 10 }}>
                <ClayLoop name="duel" size={120} />
                <Txt v="label">Waiting for an opponent</Txt>
                <Txt v="small" style={{ textAlign: 'center' }}>Your stake is in escrow. Join from a second device or tab.</Txt>
                {me === 0 ? <Btn title="Cancel and refund" kind="ghost" style={{ marginTop: 10 }} disabled={!!busy} onPress={cancel} /> : null}
              </View>
            ) : duel.status === 1 ? (
              <Txt v="small" style={{ marginTop: 10 }}>{duel.vrfPending ? 'Matched. MagicBlock VRF is rolling the coin for both of you…' : 'Matched. Asking MagicBlock VRF for the coin…'}</Txt>
            ) : duel.status === 2 ? (
              <View style={{ marginTop: 10 }}>
                <Txt v="title">{sym} rolled</Txt>
                <Txt v="small" color={C.brandSoft}>{duel.seedsRevealed === 0b11 ? 'Rolled from both players\' seeds (VRF fallback)' : 'Rolled by MagicBlock VRF'}</Txt>
                <Txt v="small">Pick a side. It stays sealed (commit-reveal) until both of you lock.</Txt>
                {me >= 0 && !(duel.picksCommitted & (1 << me)) ? (
                  <Row style={{ gap: 10, marginTop: 12 }}>
                    <Btn title="Long ▲ 50×" kind="long" h={60} style={{ flex: 1 }} disabled={!!busy} onPress={() => pick(1, 50)} />
                    <Btn title="Short ▼ 50×" kind="short" h={60} style={{ flex: 1 }} disabled={!!busy} onPress={() => pick(2, 50)} />
                  </Row>
                ) : (
                  <Txt v="small" style={{ marginTop: 10 }}>Locked. {duel.picksCommitted === 0b11 ? (duel.picksRevealed === 0b11 ? 'Handing the duel to the rollup…' : 'Revealing picks…') : 'Waiting for your rival to lock…'}</Txt>
                )}
              </View>
            ) : duel.status === 3 || duel.status === 4 ? (
              <View style={{ marginTop: 10 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View><Txt v="small">You · {duel.side[me] === 1 ? 'long' : 'short'} {duel.lev[me]}×</Txt><Text style={{ fontFamily: F.bold, fontSize: 32, color: myPnl >= 0 ? C.up : C.down }}>{myPnl >= 0 ? '+' : ''}{myPnl.toFixed(1)}%</Text></View>
                  <View style={{ alignItems: 'center' }}><Txt v="small">{sym}</Txt><Txt v="label">{price ? `$${price.toFixed(2)}` : '…'}</Txt><Txt v="small">entry ${duel.entryPrice.toFixed(2)}</Txt></View>
                  <View style={{ alignItems: 'flex-end' }}><Txt v="small">Rival · {duel.side[1 - me] === 1 ? 'long' : 'short'}</Txt><Text style={{ fontFamily: F.bold, fontSize: 32, color: theirPnl >= 0 ? C.up : C.down }}>{theirPnl >= 0 ? '+' : ''}{theirPnl.toFixed(1)}%</Text></View>
                </Row>
                <Row style={{ gap: 10, marginTop: 10 }}><Fill v={1 + myPnl / 100} color={C.brand} skew /><Fill v={1 + theirPnl / 100} color={C.opp} flip skew /></Row>
                <Txt v="small" style={{ marginTop: 8 }}>{duel.status === 3 ? `Scored on the rollup every check · bell at ${duel.lenSecs} s` : 'Finished on the rollup · committing to Solana and settling…'}</Txt>
              </View>
            ) : null}
          </Card>
          <Hit k={duel.status === 4 && duel.ko ? 1 : 0} src={FX.ko} />
        </Animated.View>
      )}

      <TxStrip txs={txs} />
    </ScrollView>
  );
}
