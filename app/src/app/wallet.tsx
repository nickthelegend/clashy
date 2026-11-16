// Wallet: the player's Privy wallet. It holds USDC only; Clashy's sponsor pays every network fee, so there is never
// SOL to buy. Balance, address, add or get USDC, send it out, export the key, and the wallet's real USDC history.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IS_LOCAL_NET, NET, PROGRAM_ID, USDC, base, faucetUsdc, usdcAta } from '@/chain/client';
import { SendUsdc, WalletCard, short, useChain } from '@/chain/useChain';
import { useDeskColumn } from '@/ui/layout';
import { BackBtn, Btn, Card, ErrorLine, Row, Txt } from '@/ui/kit';
import { C, F, S } from '@/ui/tokens';

type Move = { sig: string; at: number; delta: number; game: boolean };
const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${IS_LOCAL_NET ? `?cluster=custom&customUrl=${encodeURIComponent(NET.base)}` : ''}`;

/** The last USDC moves of this wallet's USDC account, from the chain (token balance before/after each transaction). */
async function history(owner: import('@solana/web3.js').PublicKey): Promise<Move[]> {
  const ata = usdcAta(owner);
  const sigs = await base.getSignaturesForAddress(ata, { limit: 12 });
  const txs = await Promise.all(sigs.map((s) => base.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null)));
  return txs.flatMap((tx, i) => {
    if (!tx?.meta) return [];
    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    const idx = keys.indexOf(ata.toBase58());
    const amt = (list: typeof tx.meta.preTokenBalances) => Number(list?.find((b) => b.accountIndex === idx)?.uiTokenAmount.amount ?? 0);
    const delta = (amt(tx.meta.postTokenBalances) - amt(tx.meta.preTokenBalances)) / USDC;
    if (!delta) return [];
    return [{ sig: sigs[i].signature, at: (sigs[i].blockTime ?? 0) * 1000, delta, game: keys.includes(PROGRAM_ID.toBase58()) }];
  });
}

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const chain = useChain();
  const { wallet, me, bal, busy, guard, faucet, err, tick, refresh } = chain;
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    history(me).then((m) => alive && setMoves(m)).catch(() => alive && setMoves([]));
    return () => { alive = false; };
  }, [me, tick, bal]);

  const copy = async () => {
    if (!me) return;
    if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(me.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const getTest = guard('faucet', async () => { await faucetUsdc(me!); refresh(); });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30, gap: 12 }}>
      <Row style={{ gap: 10 }}><BackBtn onPress={() => router.back()} /><Txt v="title">Wallet</Txt></Row>

      {!me ? <WalletCard chain={chain} note="USDC only" need={0} /> : (
        <>
          <Card style={{ padding: 18 }}>
            <Txt v="small">{wallet.signer?.kind === 'privy' ? `Privy · ${wallet.signer.label}` : wallet.signer?.label}</Txt>
            <Text style={{ fontFamily: F.bold, fontSize: 40, color: C.ink, marginTop: 6 }}>{bal === null ? '…' : bal.toFixed(2)}<Text style={{ fontSize: 18, color: C.muted }}> USDC</Text></Text>
            <Txt v="small" style={{ marginTop: 4 }}>{IS_LOCAL_NET ? 'Test USDC on the local Solana fork' : `USDC on ${NET.label}`} · 0 SOL needed: every fee is paid by Clashy</Txt>
            <Pressable onPress={copy} style={{ marginTop: 14, backgroundColor: C.s2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt v="small" color={C.ink} style={{ flex: 1, fontFamily: F.medium }} lines={1}>{me.toBase58()}</Txt>
              <Txt v="small" color={copied ? C.up : C.brandSoft}>{copied ? 'Copied' : 'Copy'}</Txt>
            </Pressable>
            <Txt v="small" style={{ marginTop: 6 }}>Send only USDC on Solana to this address.</Txt>
            <Row style={{ gap: 8, marginTop: 14 }}>
              {wallet.addFunds ? <Btn title="Add USDC" h={44} style={{ flex: 1 }} onPress={wallet.addFunds} /> : null}
              {faucet ? <Btn title={busy === 'faucet' ? 'Minting…' : 'Test USDC'} h={44} style={{ flex: 1 }} disabled={!!busy} onPress={getTest} /> : null}
              <Btn title={sending ? 'Close' : 'Send'} kind="ghost" h={44} style={{ flex: 1 }} disabled={!bal} onPress={() => setSending((v) => !v)} />
            </Row>
            {sending ? <SendUsdc chain={chain} onDone={() => setSending(false)} /> : null}
            <Row style={{ marginTop: 14, gap: 16, flexWrap: 'wrap' }}>
              <Pressable onPress={() => Linking.openURL(`https://explorer.solana.com/address/${me.toBase58()}${IS_LOCAL_NET ? `?cluster=custom&customUrl=${encodeURIComponent(NET.base)}` : ''}`)} hitSlop={8}><Txt v="small" color={C.muted}>Explorer</Txt></Pressable>
              {wallet.exportKey ? <Pressable onPress={wallet.exportKey} hitSlop={8}><Txt v="small" color={C.muted}>Export key</Txt></Pressable> : null}
              {wallet.logout ? <Pressable onPress={wallet.logout} hitSlop={8}><Txt v="small" color={C.muted}>Sign out</Txt></Pressable> : null}
            </Row>
          </Card>
          {err ? <ErrorLine msg={err} /> : null}

          <Txt v="h2" style={{ marginTop: 8 }}>Activity</Txt>
          {moves === null ? <Txt v="small">Loading…</Txt> : moves.length === 0 ? (
            <Card style={{ padding: 14 }}><Txt v="small">No USDC moves yet. Get USDC, then stake it in a duel, a Royale or your clan chest.</Txt></Card>
          ) : moves.map((m) => (
            <Pressable key={m.sig} onPress={() => Linking.openURL(explorerTx(m.sig))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Txt v="label">{m.game ? (m.delta < 0 ? 'Staked in a game' : 'Paid out by a game') : m.delta < 0 ? 'Sent' : 'Received'}</Txt>
                <Txt v="small">{m.at ? new Date(m.at).toLocaleString() : ''} · {short(m.sig)}</Txt>
              </View>
              <Txt v="label" color={m.delta >= 0 ? C.up : C.ink}>{m.delta >= 0 ? '+' : '−'}{Math.abs(m.delta).toFixed(2)} USDC</Txt>
            </Pressable>
          ))}
        </>
      )}

      <Card style={{ marginTop: 6 }}><Txt v="label">Where your money sits</Txt><Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>In your own wallet until you play. A stake moves into an escrow vault of the Clashy program on Solana; the duel runs on a MagicBlock Ephemeral Rollup and the result settles back to Solana. The rollup never holds your USDC. Your Privy wallet's key never reaches Clashy.</Txt></Card>
    </ScrollView>
  );
}
