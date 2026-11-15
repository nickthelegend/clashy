// Shared on-chain plumbing for the clan and tournament screens: the device test wallet, the player account,
// Solana and rollup sends with latency, readable errors, and the transaction strip.
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { Transaction } from '@solana/web3.js';
import { NET, P, PROGRAM_ID, base, balance, er, fund, loadWallet, programs, type Keypair } from './client';
import { Btn, Card, Row, Txt } from '@/ui/kit';
import { C } from '@/ui/tokens';

export type Tx = { sig: string; layer: 'Solana' | 'Rollup'; label: string; ms: number; n?: number };
export const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
export const explorer = (sig: string, layer: Tx['layer']) =>
  `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(layer === 'Rollup' ? NET.er : NET.base)}`;

/** Readable error: the Anchor error message or the failing program log, not web3's generic wrapper. */
export function errText(e: unknown): string {
  const x = e as { error?: { errorMessage?: string }; logs?: string[]; transactionLogs?: string[]; transactionMessage?: string; message?: string };
  if (x?.error?.errorMessage) return x.error.errorMessage;
  const logs = x?.logs ?? x?.transactionLogs ?? [];
  const hit = logs.find((l) => /Error Message:|failed:|insufficient/i.test(l));
  if (hit) return hit.replace(/^Program log: (AnchorError.*?Error Message: )?/, '');
  if (x?.transactionMessage) return x.transactionMessage;
  return String(x?.message ?? e).split('\n')[0];
}

export function useChain(foldLabels: string[] = []) {
  const [kp, setKp] = useState<Keypair | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [hasPlayer, setHasPlayer] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const progs = useMemo(() => (kp ? programs(kp) : null), [kp]);

  // repeated labels (polling sends) fold into one row: latest signature, count, average latency
  const log = useCallback((t: Tx) => setTxs((x) => {
    const top = x[0];
    if (top && top.label === t.label && top.layer === t.layer && foldLabels.includes(t.label)) {
      const n = (top.n ?? 1) + 1;
      return [{ ...t, n, ms: Math.round((top.ms * (n - 1) + t.ms) / n) }, ...x.slice(1)];
    }
    return [t, ...x].slice(0, 30);
  }), [foldLabels.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBase = useCallback(async (label: string, run: () => Promise<string>) => {
    const t0 = Date.now();
    const sig = await run();
    log({ sig, layer: 'Solana', label, ms: Date.now() - t0 });
    setTick((n) => n + 1);
    return sig;
  }, [log]);

  /** Rollup transaction: sent raw and polled (its websocket confirmations are slow). */
  const onEr = useCallback(async (label: string, builder: { transaction(): Promise<Transaction> }) => {
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
    setTick((n) => n + 1);
    return sig;
  }, [kp, log]);

  const guard = (name: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(name); setErr(undefined);
    try { await fn(); Haptics.selectionAsync(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };

  useEffect(() => { loadWallet().then(setKp).catch((e) => setErr(String(e))); }, []);
  useEffect(() => {
    if (!kp) return;
    let alive = true;
    const run = async () => {
      try {
        const [b, p] = await Promise.all([balance(kp.publicKey), base.getAccountInfo(P.player(kp.publicKey))]);
        if (alive) { setBal(b); setHasPlayer(!!p); }
      } catch (e) { if (alive) setErr(`Cannot reach ${NET.label} (${NET.base}): ${(e as Error).message}`); }
    };
    run();
    const h = setInterval(run, 3000);
    return () => { alive = false; clearInterval(h); };
  }, [kp, tick]);

  const setup = guard('setup', async () => {
    if (!kp || !progs) return;
    if ((bal ?? 0) < 0.5) await onBase('Faucet (local stack)', () => fund(kp.publicKey, 5));
    if (!hasPlayer) await onBase('Create player account', () => progs.base.methods.initPlayer().accountsPartial({ owner: kp.publicKey }).rpc());
  });

  return { kp, progs, bal, hasPlayer, txs, err, setErr, busy, guard, onBase, onEr, setup, tick, refresh: () => setTick((n) => n + 1) };
}

export function WalletCard({ chain, note, need = 0.05 }: { chain: ReturnType<typeof useChain>; note: string; need?: number }) {
  const { kp, bal, hasPlayer, busy, setup } = chain;
  const ready = hasPlayer && (bal ?? 0) >= need;
  return (
    <Card style={{ padding: 14 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View><Txt v="small">Test wallet on this device</Txt><Txt v="label">{kp ? short(kp.publicKey.toBase58()) : 'Loading…'}</Txt></View>
        <View style={{ alignItems: 'flex-end' }}><Txt v="small">Balance</Txt><Txt v="label">{bal === null ? '…' : `${bal.toFixed(3)} SOL`}</Txt></View>
      </Row>
      <Txt v="small" style={{ marginTop: 8 }}>Program {short(PROGRAM_ID.toBase58())} · {note}</Txt>
      {!ready ? <Btn title={busy === 'setup' ? 'Setting up…' : NET.airdrop ? 'Fund wallet and create player' : 'Create player account'} kind="white" style={{ marginTop: 10 }} disabled={!!busy || !kp} onPress={setup} /> : null}
    </Card>
  );
}

export function TxStrip({ txs }: { txs: Tx[] }) {
  return (
    <>
      <Txt v="h2" style={{ marginTop: 22, marginBottom: 8 }}>Transactions</Txt>
      {txs.length === 0 ? <Txt v="small">Every action here is a real transaction. They show up here with their layer, latency and an explorer link.</Txt> : txs.map((t) => (
        <Pressable key={t.sig} onPress={() => Linking.openURL(explorer(t.sig, t.layer))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <View style={{ backgroundColor: t.layer === 'Rollup' ? 'rgba(91,108,255,0.18)' : C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" color={t.layer === 'Rollup' ? C.brandSoft : C.ink} style={{ fontSize: 11 }}>{t.layer}</Txt></View>
          <View style={{ flex: 1 }}><Txt v="small" color={C.ink}>{t.label}{t.n ? ` ×${t.n}` : ''}</Txt><Txt v="small" style={{ fontSize: 11 }}>{short(t.sig)}</Txt></View>
          <Txt v="small" color={t.ms < 200 ? C.up : C.muted}>{t.n ? 'avg ' : ''}{t.ms} ms</Txt>
        </Pressable>
      ))}
    </>
  );
}
