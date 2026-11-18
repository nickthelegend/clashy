// Shared on-chain plumbing for the duel, clan and tournament screens: the player's wallet (Privy on web), the player
// account, sponsored Solana and rollup sends with latency, readable errors, and the transaction strip.
// Players hold USDC only; the sponsor relay pays every fee and rent.
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { PublicKey, type Transaction } from '@solana/web3.js';
import { BN, IS_LOCAL_NET, NET, P, PROGRAM_ID, USDC_MINT, base, faucetUsdc, getSponsor, programs, sendSponsored, sendUsdc, usdcBalance } from './client';
import { useWallet } from './wallet';
import { Btn, Card, Row, Txt } from '@/ui/kit';
import { C, F, FONT } from '@/ui/tokens';

export type Tx = { sig: string; layer: 'Solana' | 'Rollup'; label: string; ms: number; n?: number };
export const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
export const explorer = (sig: string, layer: Tx['layer']) => (IS_LOCAL_NET || layer === 'Rollup'
  ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(layer === 'Rollup' ? NET.er : NET.base)}`
  : `https://explorer.solana.com/tx/${sig}${/devnet/.test(NET.base) ? '?cluster=devnet' : ''}`);

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
  const wallet = useWallet();
  const signer = wallet.signer;
  const me: PublicKey | null = signer?.publicKey ?? null;
  const [sponsor, setSponsor] = useState<{ sponsor: PublicKey; faucet: boolean } | null>(null);
  /** USDC in the player's wallet (whole USDC). */
  const [bal, setBal] = useState<number | null>(null);
  const [hasPlayer, setHasPlayer] = useState(false);
  /** null until the first read: whether this wallet has picked a name (profile) and opened a Stash. */
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [hasStash, setHasStash] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const progs = useMemo(() => (signer && sponsor ? programs(signer, sponsor.sponsor) : null), [signer, sponsor]);

  // the relay pays every fee: keep asking until it answers (it may come back after being offline)
  useEffect(() => {
    if (sponsor) return;
    let alive = true;
    const ask = () => getSponsor().then((s) => { if (alive) { setSponsor(s); setErr(undefined); } }).catch((e) => alive && setErr((e as Error).message));
    ask();
    const h = setInterval(ask, 5000);
    return () => { alive = false; clearInterval(h); };
  }, [sponsor]);

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

  /** Rollup transaction, sponsored like every other one. */
  const onEr = useCallback(async (label: string, builder: { transaction(): Promise<Transaction> }) => {
    if (!signer) throw new Error('Sign in first');
    const t0 = Date.now();
    const sig = await sendSponsored(await builder.transaction(), 'er', signer);
    log({ sig, layer: 'Rollup', label, ms: Date.now() - t0 });
    setTick((n) => n + 1);
    return sig;
  }, [signer, log]);

  const guard = (name: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(name); setErr(undefined);
    try { await fn(); Haptics.selectionAsync(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };

  useEffect(() => {
    if (!me) return;
    let alive = true;
    const run = async () => {
      try {
        const [b, p, prof, st] = await Promise.all([usdcBalance(me), base.getAccountInfo(P.player(me)), base.getAccountInfo(P.profile(me)), base.getAccountInfo(P.stash(me))]);
        if (alive) { setBal(b); setHasPlayer(!!p); setHasProfile(!!prof); setHasStash(!!st); }
      } catch (e) { if (alive) setErr(`Cannot reach ${NET.label} (${NET.base}): ${(e as Error).message}`); }
    };
    run();
    const h = setInterval(run, 3000);
    return () => { alive = false; clearInterval(h); };
  }, [me, tick]);

  /** Get started: test USDC from the local faucet (local fork only) and the player account (sponsored). */
  const setup = (need: number) => guard('setup', async () => {
    if (!me || !progs || !sponsor) return;
    if ((bal ?? 0) < need) {
      if (!sponsor.faucet) throw new Error(`Add at least ${need} USDC to ${me.toBase58()} to play`);
      await faucetUsdc(me);
    }
    if (!hasPlayer) await onBase('Create player account', () => progs.base.methods.initPlayer().accountsPartial({ owner: me, payer: sponsor.sponsor }).rpc());
    setTick((n) => n + 1);
  });

  /** Joining Clashy: test USDC (local fork), then the player account, the name and avatar, and the Stash. Sponsored. */
  const join = (name: string, avatar: number) => guard('join', async () => {
    if (!me || !progs || !sponsor) throw new Error('The relay is offline; try again in a minute');
    const handle = name.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(handle)) throw new Error('Names are 3 to 16 characters: a-z, 0-9 and _');
    if (await base.getAccountInfo(P.handle(handle))) throw new Error(`@${handle} is taken`);
    if ((bal ?? 0) < 1 && sponsor.faucet) await faucetUsdc(me);
    const pay = { payer: sponsor.sponsor };
    if (!hasPlayer) await onBase('Create player account', () => progs.base.methods.initPlayer().accountsPartial({ owner: me, ...pay }).rpc());
    if (!hasProfile) await onBase(`Claim @${handle}`, () => progs.base.methods.createProfile(handle, avatar).accountsPartial({ owner: me, ...pay, handle: P.handle(handle) }).rpc());
    if (!hasStash) await onBase('Open your Stash', () => progs.base.methods.openStash(new BN(0), '').accountsPartial({ owner: me, ...pay, usdcMint: USDC_MINT }).rpc());
    setTick((n) => n + 1);
  });

  return {
    wallet, me, signer, sponsor: sponsor?.sponsor ?? null, faucet: !!sponsor?.faucet, progs, bal, hasPlayer, hasProfile, hasStash, txs, err, setErr, busy, guard,
    onBase, onEr, setup, join, tick, refresh: () => setTick((n) => n + 1),
  };
}

const field = { color: C.ink, ...FONT.medium, fontSize: 15, backgroundColor: C.s2, borderRadius: 12, paddingHorizontal: 12, height: 44 } as const;

/** Withdraw USDC to any Solana address (the sponsor pays the fee and the receiver's account rent). */
export function SendUsdc({ chain, onDone }: { chain: ReturnType<typeof useChain>; onDone: () => void }) {
  const { signer, bal, busy, guard, onBase, refresh } = chain;
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const send = guard('send', async () => {
    let dest: PublicKey;
    try { dest = new PublicKey(to.trim()); } catch { throw new Error('That is not a Solana address'); }
    const n = Number(amt);
    if (!(n > 0)) throw new Error('Enter an amount above 0');
    if (n > (bal ?? 0)) throw new Error(`You have ${(bal ?? 0).toFixed(2)} USDC`);
    await onBase(`Send ${n} USDC to ${short(dest.toBase58())}`, () => sendUsdc(signer!, dest, n));
    setTo(''); setAmt(''); refresh(); onDone();
  });
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <TextInput value={to} onChangeText={setTo} placeholder="Solana address" placeholderTextColor={C.muted} autoCorrect={false} autoCapitalize="none" style={field} />
      <Row style={{ gap: 8 }}>
        <TextInput value={amt} onChangeText={setAmt} placeholder="USDC" placeholderTextColor={C.muted} keyboardType="decimal-pad" style={[field, { flex: 1 }]} />
        <Btn title="Max" kind="ghost" h={44} onPress={() => setAmt(String(Math.floor((bal ?? 0) * 100) / 100))} />
        <Btn title={busy === 'send' ? 'Sending…' : 'Send'} h={44} disabled={!!busy || !to || !amt} onPress={send} />
      </Row>
      <Txt v="small">USDC on Solana only. Fees are on Clashy.</Txt>
    </View>
  );
}

/** The player's wallet: sign in (Privy), USDC balance, get started. `need` is the USDC this screen needs. */
export function WalletCard({ chain, note, need = 1 }: { chain: ReturnType<typeof useChain>; note: string; need?: number }) {
  const { wallet, me, bal, hasPlayer, busy, setup, faucet, sponsor } = chain;
  const [sending, setSending] = useState(false);
  const ready = hasPlayer && (bal ?? 0) >= need;
  if (wallet.status === 'setup' || wallet.status === 'error') {
    return <Card style={{ padding: 14 }}><Txt v="label">Setup required</Txt><Txt v="small" style={{ marginTop: 4 }}>{wallet.error}</Txt></Card>;
  }
  if (wallet.status === 'out') {
    return (
      <Card style={{ padding: 16 }}>
        <Txt v="label">Sign in to play for USDC</Txt>
        <Txt v="small" style={{ marginTop: 4 }}>Email or Google. Privy makes your Clashy wallet: it holds USDC only, with no seed phrase and no SOL. Every fee is on us.</Txt>
        <Btn title="Sign in" kind="white" style={{ marginTop: 12 }} onPress={() => wallet.login?.()} />
      </Card>
    );
  }
  if (!me) {
    return <Card style={{ padding: 14 }}><Txt v="small">{wallet.status === 'creating' ? 'Making your Clashy wallet…' : 'Loading your wallet…'}</Txt></Card>;
  }
  return (
    <Card style={{ padding: 14 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="small" lines={1}>{wallet.signer?.kind === 'privy' ? `Privy · ${wallet.signer.label}` : wallet.signer?.label}</Txt>
          <Txt v="label">{short(me.toBase58())}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}><Txt v="small">Balance</Txt><Txt v="label">{bal === null ? '…' : `${bal.toFixed(2)} USDC`}</Txt></View>
      </Row>
      <Txt v="small" style={{ marginTop: 8 }}>{note} · fees and rent paid by Clashy{sponsor ? '' : ' (relay offline)'} · program {short(PROGRAM_ID.toBase58())}</Txt>
      {!ready ? (
        <Btn
          title={busy === 'setup' ? 'Setting up…' : (bal ?? 0) < need ? (faucet ? 'Get 100 test USDC and start' : `Add ${need} USDC to start`) : 'Create player account'}
          kind="white" style={{ marginTop: 10 }} disabled={!!busy || !sponsor || (!faucet && (bal ?? 0) < need)} onPress={setup(need)}
        />
      ) : null}
      {sending ? <SendUsdc chain={chain} onDone={() => setSending(false)} /> : null}
      <Row style={{ marginTop: 12, gap: 16, flexWrap: 'wrap' }}>
        {wallet.addFunds ? <Pressable onPress={wallet.addFunds} hitSlop={8}><Txt v="small" color={C.brandSoft}>Add USDC</Txt></Pressable> : null}
        {(bal ?? 0) > 0 ? <Pressable onPress={() => setSending((v) => !v)} hitSlop={8}><Txt v="small" color={C.brandSoft}>{sending ? 'Close' : 'Send USDC'}</Txt></Pressable> : null}
        <Pressable onPress={() => Linking.openURL(`https://explorer.solana.com/address/${me.toBase58()}${IS_LOCAL_NET ? `?cluster=custom&customUrl=${encodeURIComponent(NET.base)}` : ''}`)} hitSlop={8}><Txt v="small" color={C.muted}>Explorer</Txt></Pressable>
        {wallet.exportKey ? <Pressable onPress={wallet.exportKey} hitSlop={8}><Txt v="small" color={C.muted}>Export key</Txt></Pressable> : null}
        {wallet.logout ? <Pressable onPress={wallet.logout} hitSlop={8}><Txt v="small" color={C.muted}>Sign out</Txt></Pressable> : null}
      </Row>
    </Card>
  );
}

export function TxStrip({ txs }: { txs: Tx[] }) {
  return (
    <>
      <Txt v="h2" style={{ marginTop: 22, marginBottom: 8 }}>Transactions</Txt>
      {txs.length === 0 ? <Txt v="small">Every action here is a real transaction, paid for by Clashy's sponsor. They show up here with their layer, latency and an explorer link.</Txt> : txs.map((t) => (
        <Pressable key={t.sig} onPress={() => Linking.openURL(explorer(t.sig, t.layer))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <View style={{ backgroundColor: t.layer === 'Rollup' ? 'rgba(171,159,242,0.18)' : C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }}><Txt v="small" color={t.layer === 'Rollup' ? C.brandSoft : C.ink} style={{ fontSize: 11 }}>{t.layer}</Txt></View>
          <View style={{ flex: 1 }}><Txt v="small" color={C.ink}>{t.label}{t.n ? ` ×${t.n}` : ''}</Txt><Txt v="small" style={{ fontSize: 11 }}>{short(t.sig)}</Txt></View>
          <Txt v="small" color={t.ms < 200 ? C.up : C.muted}>{t.n ? 'avg ' : ''}{t.ms} ms</Txt>
        </Pressable>
      ))}
    </>
  );
}
