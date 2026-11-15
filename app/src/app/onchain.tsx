// On-chain knockout duel: the real `clashy` program on Solana + a MagicBlock Ephemeral Rollup.
// Two devices (or two browser tabs) are two real players. Every step is a signed transaction; the strip at
// the bottom shows each signature, which layer it ran on, how long it took, and an explorer link.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BN, COIN_SYMBOLS, DUEL_STATUS, LAMPORTS_PER_SOL, NET, P, PROGRAM_ID, base, balance, er, fund, loadWallet, openDuels, priceOf, programs,
  random32, readDuel, sha256, type DuelView, type Keypair, PublicKey,
} from '@/chain/client';
import { ClayLoop } from '@/ui/clay';
import { FX, Fill, Hit } from '@/ui/fx';
import { BackBtn, Btn, Card, ErrorLine, LiveDot, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S } from '@/ui/tokens';

type Tx = { sig: string; layer: 'Solana' | 'Rollup'; label: string; ms: number; n?: number };
type Secrets = { seed: number[]; salt?: number[]; side?: number; lev?: number };
const STAKE_SOL = 0.1;
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const explorer = (sig: string, layer: Tx['layer']) =>
  `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(layer === 'Rollup' ? NET.er : NET.base)}`;
const secretKey = (duel: PublicKey) => `clashy:chain:secret:${duel.toBase58()}`;

/** Readable error: the Anchor error message or the failing program log, not web3's generic wrapper. */
function errText(e: unknown): string {
  const x = e as { error?: { errorMessage?: string }; logs?: string[]; transactionLogs?: string[]; transactionMessage?: string; message?: string };
  if (x?.error?.errorMessage) return x.error.errorMessage;
  const logs = x?.logs ?? x?.transactionLogs ?? [];
  const hit = logs.find((l) => /Error Message:|failed:|insufficient/i.test(l));
  if (hit) return hit.replace(/^Program log: (AnchorError.*?Error Message: )?/, '');
  if (x?.transactionMessage) return x.transactionMessage;
  return String(x?.message ?? e).split('\n')[0];
}

export default function OnChainDuel() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const [kp, setKp] = useState<Keypair | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [hasPlayer, setHasPlayer] = useState<boolean | null>(null);
  const [board, setBoard] = useState<DuelView[]>([]);
  const [active, setActive] = useState<PublicKey | null>(null);
  const [duel, setDuel] = useState<DuelView | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const progs = kp ? programs(kp) : null;
  const inflight = useRef(new Set<string>());
  /** When this device first saw the duel matched (for the VRF fallback timer). */
  const matchedAt = useRef<number | null>(null);
  const [vrf, setVrf] = useState<{ queue: PublicKey; required: boolean } | null>(null);

  // repeated rollup checks fold into one row (latest signature, count, average latency)
  const log = (t: Tx) => setTxs((x) => {
    const top = x[0];
    if (top && top.label === t.label && top.layer === t.layer && t.label === 'Check duel') {
      const n = (top.n ?? 1) + 1;
      return [{ ...t, n, ms: Math.round((top.ms * (n - 1) + t.ms) / n) }, ...x.slice(1)];
    }
    return [t, ...x].slice(0, 30);
  });
  /** Solana transaction via Anchor; latency measured to confirmation. */
  const onBase = useCallback(async (label: string, run: () => Promise<string>) => {
    const t0 = Date.now();
    const sig = await run();
    log({ sig, layer: 'Solana', label, ms: Date.now() - t0 });
    return sig;
  }, []);
  /** Rollup transaction: sent raw and polled (its websocket confirmations are slow). */
  const onEr = useCallback(async (label: string, builder: { transaction(): Promise<import('@solana/web3.js').Transaction> }) => {
    if (!kp) throw new Error('no wallet');
    const t0 = Date.now();
    const tx = await builder.transaction();
    tx.feePayer = kp.publicKey;
    tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
    tx.sign(kp);
    const sig = await er.sendRawTransaction(tx.serialize());
    for (let i = 0; i < 100; i++) {
      const [st] = (await er.getSignatureStatuses([sig])).value;
      if (st?.err) throw new Error(`rollup tx failed: ${JSON.stringify(st.err)}`);
      if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    log({ sig, layer: 'Rollup', label, ms: Date.now() - t0 });
    return sig;
  }, [kp]);

  const guard = (name: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(name); setErr(undefined);
    try { await fn(); Haptics.selectionAsync(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };

  // wallet + player account
  useEffect(() => { loadWallet().then(setKp).catch((e) => setErr(String(e))); }, []);
  useEffect(() => {
    if (!kp) return;
    let alive = true;
    const tick = async () => {
      try {
        const [b, p] = await Promise.all([balance(kp.publicKey), base.getAccountInfo(P.player(kp.publicKey))]);
        if (!alive) return;
        setBal(b); setHasPlayer(!!p);
        if (progs) setBoard(await openDuels(progs.base));
      } catch (e) { if (alive) setErr(`Cannot reach ${NET.label} (${NET.base}): ${(e as Error).message}`); }
    };
    tick();
    const h = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(h); };
  }, [kp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { AsyncStorage.getItem('clashy:chain:active').then((v) => v && setActive(new PublicKey(v))).catch(() => {}); }, []);

  // the active duel's state machine, polled every second
  useEffect(() => {
    if (!active || !progs || !kp) return;
    let alive = true;
    const step = async () => {
      const d = await readDuel(progs.base, active).catch(() => null);
      if (!alive || !d) return;
      setDuel(d);
      if (d.coin < 3) setPrice(await priceOf(progs.base, d.coin).catch(() => null));
      const me = d.creator.equals(kp.publicKey) ? 0 : d.joiner.equals(kp.publicKey) ? 1 : -1;
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
          await once('vrf', () => onBase('Request VRF roll', () => progs.base.methods.requestCoinRoll([...random32()]).accountsPartial({ payer: kp.publicKey, duel: active, oracleQueue: cfg.queue }).rpc()));
        }
        if (!cfg.required && sec && !(d.seedsRevealed & (1 << me)) && Date.now() - matchedAt.current > 15_000) {
          await once(`seed-${me}`, () => onBase('Reveal roll seed (VRF fallback)', () => progs.base.methods.revealSeed(sec.seed).accountsPartial({ signer: kp.publicKey, duel: active }).rpc()));
        }
      } else {
        matchedAt.current = null;
      }
      // ROLLED: once both picks are committed, reveal mine
      if (d.status === 2 && sec?.salt && d.picksCommitted === 0b11 && !(d.picksRevealed & (1 << me))) {
        await once(`reveal-${me}`, () => onBase('Reveal sealed pick', () => progs.base.methods.revealPick(sec.side!, sec.lev!, sec.salt!).accountsPartial({ signer: kp.publicKey, duel: active }).rpc()));
      }
      // both revealed: the creator hands the duel to the rollup, then starts it there
      if (d.status === 2 && d.picksRevealed === 0b11 && me === 0 && !d.onEr) {
        await once('delegate', () => onBase('Delegate duel to the rollup', () => progs.base.methods.delegateDuel(d.creator, new BN(d.nonce)).accountsPartial({ payer: kp.publicKey, duel: active }).remainingAccounts([{ pubkey: NET.erValidator, isSigner: false, isWritable: false }]).rpc()));
      }
      if (d.status === 2 && d.picksRevealed === 0b11 && me === 0 && d.onEr) {
        await once('start', () => onEr('Start duel on the rollup', progs.er.methods.startDuel().accountsPartial({ signer: kp.publicKey, duel: active, price: P.feed(d.coin) })));
      }
      // LIVE: both devices check every 2 s (idempotent); the finishing check commits and undelegates
      if (d.status === 3 && d.onEr && Date.now() % 2000 < 1000) {
        await onEr('Check duel', progs.er.methods.checkDuel().accountsPartial({ payer: kp.publicKey, duel: active, price: P.feed(d.coin) })).catch(() => {});
      }
      // FINISHED and home on Solana: either player settles
      if (d.status === 4 && !d.onEr) {
        await once('settle', () => onBase('Settle on Solana', async () => {
          const cfg = await progs.base.account.config.fetch(P.config);
          return progs.base.methods.settleDuel().accountsPartial({ duel: active, vault: P.vault(active), creator: d.creator, joiner: d.joiner, creatorPlayer: P.player(d.creator), joinerPlayer: P.player(d.joiner), treasury: cfg.treasury }).rpc();
        }));
      }
    };
    step();
    const h = setInterval(step, 1000);
    return () => { alive = false; clearInterval(h); };
  }, [active, kp]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveDuel = async (key: PublicKey | null) => {
    setActive(key); setDuel(null); inflight.current.clear();
    if (key) await AsyncStorage.setItem('clashy:chain:active', key.toBase58()); else await AsyncStorage.removeItem('clashy:chain:active');
  };

  const open = guard('open', async () => {
    if (!progs || !kp) return;
    const nonce = Date.now();
    const key = P.duel(kp.publicKey, nonce);
    const seed = random32();
    await AsyncStorage.setItem(secretKey(key), JSON.stringify({ seed: [...seed] } satisfies Secrets));
    const seedHash = [...(await sha256(seed))];
    await onBase('Open duel · escrow stake', () => progs.base.methods.openDuel(new BN(nonce), new BN(STAKE_SOL * LAMPORTS_PER_SOL), 0b111, 60, new BN(900), seedHash)
      .accountsPartial({ creator: kp.publicKey, duel: key, vault: P.vault(key) }).rpc());
    await setActiveDuel(key);
  });
  const join = (d: DuelView) => guard('join', async () => {
    if (!progs || !kp) return;
    const seed = random32();
    await AsyncStorage.setItem(secretKey(d.key), JSON.stringify({ seed: [...seed] } satisfies Secrets));
    await onBase('Join duel · escrow stake', async () => progs.base.methods.joinDuel([...(await sha256(seed))]).accountsPartial({ joiner: kp.publicKey, duel: d.key, vault: P.vault(d.key) }).rpc());
    await setActiveDuel(d.key);
  })();
  const pick = (side: 1 | 2, lev: number) => guard('pick', async () => {
    if (!progs || !kp || !active) return;
    const raw = await AsyncStorage.getItem(secretKey(active));
    const sec: Secrets = raw ? JSON.parse(raw) : { seed: [] };
    const salt = random32();
    const hash = await sha256(new Uint8Array([side]), new Uint8Array(new Uint16Array([lev]).buffer), salt);
    await AsyncStorage.setItem(secretKey(active), JSON.stringify({ ...sec, salt: [...salt], side, lev } satisfies Secrets));
    await onBase('Commit sealed pick', () => progs.base.methods.commitPick([...hash]).accountsPartial({ signer: kp.publicKey, duel: active }).rpc());
  })();
  const cancel = guard('cancel', async () => {
    if (!progs || !kp || !active) return;
    await onBase('Cancel · refund stake', () => progs.base.methods.cancelDuel().accountsPartial({ signer: kp.publicKey, duel: active, vault: P.vault(active), creator: kp.publicKey }).rpc());
    await setActiveDuel(null);
  });
  const setup = guard('setup', async () => {
    if (!kp || !progs) return;
    if ((bal ?? 0) < 0.5) await onBase('Faucet (local stack)', () => fund(kp.publicKey, 5));
    if (!hasPlayer) await onBase('Create player account', () => progs.base.methods.initPlayer().accountsPartial({ owner: kp.publicKey }).rpc());
  });

  const me = duel && kp ? (duel.creator.equals(kp.publicKey) ? 0 : duel.joiner.equals(kp.publicKey) ? 1 : -1) : -1;
  const sym = duel && duel.coin < 3 ? COIN_SYMBOLS[duel.coin] : '…';
  const ready = hasPlayer && (bal ?? 0) >= STAKE_SOL + 0.01;
  const myPnl = duel && me >= 0 ? duel.pnlBps[me] / 100 : 0;
  const theirPnl = duel && me >= 0 ? duel.pnlBps[1 - me] / 100 : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">On-chain duel</Txt><Txt v="small">{NET.label} · Solana + MagicBlock rollup</Txt></View>
        <Row style={{ gap: 6 }}><LiveDot color={C.up} /><Txt v="small" color={C.up}>On chain</Txt></Row>
      </Row>

      <Card style={{ padding: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View><Txt v="small">Test wallet on this device</Txt><Txt v="label">{kp ? short(kp.publicKey.toBase58()) : 'Loading…'}</Txt></View>
          <View style={{ alignItems: 'flex-end' }}><Txt v="small">Balance</Txt><Txt v="label">{bal === null ? '…' : `${bal.toFixed(3)} SOL`}</Txt></View>
        </Row>
        <Txt v="small" style={{ marginTop: 8 }}>Program {short(PROGRAM_ID.toBase58())} · stake {STAKE_SOL} SOL each · 3% rake</Txt>
        {!ready ? <Btn title={busy === 'setup' ? 'Setting up…' : NET.airdrop ? 'Fund wallet and create player' : 'Create player account'} kind="white" style={{ marginTop: 10 }} disabled={!!busy || !kp} onPress={setup} /> : null}
      </Card>
      {err ? <ErrorLine msg={err} /> : null}

      {!active || !duel || duel.status >= 5 ? (
        <>
          {duel && duel.status === 5 ? (
            <Animated.View entering={FadeInDown.springify()}>
              <Card style={{ alignItems: 'center', padding: 16, marginTop: 12 }}>
                <ClayLoop name={duel.winner === me + 1 ? 'win' : duel.winner === 3 ? 'duel' : 'ko'} size={150} loop={duel.winner === me + 1} />
                <Txt v="title">{duel.winner === 3 ? 'Dead heat · refunded' : duel.winner === me + 1 ? 'You won the pot.' : 'You lost.'}</Txt>
                <Txt v="small">Settled on Solana · {sym} {duel.entryPrice.toFixed(2)} → {duel.exitPrice.toFixed(2)} · you {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(1)}% · rival {theirPnl >= 0 ? '+' : ''}{theirPnl.toFixed(1)}%</Txt>
                <Btn title="New duel" kind="white" style={{ marginTop: 10, alignSelf: 'stretch' }} onPress={() => setActiveDuel(null)} />
              </Card>
            </Animated.View>
          ) : null}
          <Btn title={busy === 'open' ? 'Opening…' : `Open a duel · ${STAKE_SOL} SOL`} h={58} style={{ marginTop: 14, borderRadius: 18 }} disabled={!ready || !!busy} onPress={open} />
          <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Challenge board</Txt>
          {board.filter((d) => !kp || !d.creator.equals(kp.publicKey)).length === 0 ? (
            <Card style={{ alignItems: 'center', padding: 16 }}><Txt v="small" style={{ textAlign: 'center' }}>No open duels from other players right now. Open one, then join it from a second device or browser tab.</Txt></Card>
          ) : board.filter((d) => !kp || !d.creator.equals(kp.publicKey)).map((d) => (
            <Card key={d.key.toBase58()} style={{ marginBottom: 8, padding: 12 }}>
              <Row style={{ gap: 10 }}>
                <View style={{ flex: 1 }}><Txt v="label">{short(d.creator.toBase58())} · {(d.stake / LAMPORTS_PER_SOL).toFixed(2)} SOL</Txt><Txt v="small">{d.lenSecs} s · coin rolled after you join · expires {new Date(d.expiresAt * 1000).toLocaleTimeString()}</Txt></View>
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

      <Txt v="h2" style={{ marginTop: 22, marginBottom: 8 }}>Transactions</Txt>
      {txs.length === 0 ? <Txt v="small">Every action here is a real transaction. They show up here with their layer, latency and an explorer link.</Txt> : txs.map((t) => (
        <Pressable key={t.sig} onPress={() => Linking.openURL(explorer(t.sig, t.layer))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <View style={{ backgroundColor: t.layer === 'Rollup' ? 'rgba(91,108,255,0.18)' : C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" color={t.layer === 'Rollup' ? C.brandSoft : C.ink} style={{ fontSize: 11 }}>{t.layer}</Txt></View>
          <View style={{ flex: 1 }}><Txt v="small" color={C.ink}>{t.label}{t.n ? ` ×${t.n}` : ''}</Txt><Txt v="small" style={{ fontSize: 11 }}>{short(t.sig)}</Txt></View>
          <Txt v="small" color={t.ms < 200 ? C.up : C.muted}>{t.n ? 'avg ' : ''}{t.ms} ms</Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}
