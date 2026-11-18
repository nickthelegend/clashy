// Wallet: the player's Privy wallet. It holds USDC only; Clashy's sponsor pays every network fee, so there is never
// SOL to buy. One big balance, Add / Send / Receive as round actions that open bottom drawers, the wallet's real USDC
// history from the chain, and the account rows (explorer, export key, sign out).
import { router } from 'expo-router';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IS_LOCAL_NET, NET, PROGRAM_ID, USDC, base, faucetUsdc, usdcAta } from '@/chain/client';
import { SendUsdc, WalletCard, useChain } from '@/chain/useChain';
import { useDeskColumn } from '@/ui/layout';
import { ART, BackBtn, Btn, ErrorLine, Money, Pending, Row, SkeletonRows, Txt } from '@/ui/kit';
import { ArrowDown, ArrowUp, Copy, Plus } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { ActionRow, RoundAction } from '@/ui/watchlist';
import { C, S } from '@/ui/tokens';

type Move = { sig: string; at: number; delta: number; game: boolean; what: string | null };
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
    const logs = (tx.meta.logMessages ?? []).join('\n');
    const what = /Instruction: StashInvest/.test(logs) ? 'Invested from the Stash' : /Instruction: StashSave/.test(logs) ? (/Instruction: TransferChecked/.test(logs) ? 'Paid · round-up saved' : 'Saved to the Stash')
      : /Instruction: StashWithdraw/.test(logs) ? 'Taken out of the Stash' : /Instruction: (DepositChest|WithdrawChest)/.test(logs) ? (delta < 0 ? 'Into the squad chest' : 'Out of the squad chest') : null;
    return [{ sig: sigs[i].signature, at: (sigs[i].blockTime ?? 0) * 1000, delta, game: keys.includes(PROGRAM_ID.toBase58()), what }];
  });
}

/** A round action that can be switched off (dimmed, not pressable) while it has nothing to act on. */
function Action({ disabled, ...p }: React.ComponentProps<typeof RoundAction> & { disabled?: boolean }) {
  return (
    <View style={{ flex: 1, opacity: disabled ? 0.4 : 1 }} pointerEvents={disabled ? 'none' : 'auto'} accessibilityState={{ disabled: !!disabled }}>
      <RoundAction {...p} />
    </View>
  );
}

function SettingRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 50, backgroundColor: pressed ? C.s1 : 'transparent' })}>
      <Txt v="label" color={danger ? C.down : C.ink} style={{ flex: 1 }}>{label}</Txt>
      <Txt v="label" color={C.dim}>›</Txt>
    </Pressable>
  );
}

const what = (m: Move) => m.what ?? (m.game ? (m.delta < 0 ? 'Played a game' : 'Back from a game') : m.delta < 0 ? 'Sent' : 'Received');

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const chain = useChain();
  const { wallet, me, bal, busy, guard, faucet, err, tick, refresh } = chain;
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState(false);

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
  const explorer = () => me && Linking.openURL(`https://explorer.solana.com/address/${me.toBase58()}${IS_LOCAL_NET ? `?cluster=custom&customUrl=${encodeURIComponent(NET.base)}` : ''}`);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 30 }}>
      <Row style={{ gap: 10 }}><BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /></Row>

      {!me ? <View style={{ marginTop: 16 }}><WalletCard chain={chain} note="USDC only" need={0} /></View> : (
        <>
          <View style={{ marginTop: 6 }}>
            <Txt v="small">{wallet.signer?.kind === 'privy' ? wallet.signer.label : 'Your wallet'}</Txt>
            <View style={{ marginTop: 2 }}>{bal == null ? <Txt v="title">…</Txt> : <Money value={bal} size={40} />}</View>
            <Row style={{ gap: 6, marginTop: 4 }}>
              <Image source={ART.logoUSDC} style={{ width: 16, height: 16, borderRadius: 8 }} contentFit="cover" />
              <Txt v="small" lines={1} style={{ flexShrink: 1 }}>USDC{IS_LOCAL_NET ? ' · test network' : ''} · no gas fees</Txt>
            </Row>
          </View>

          <ActionRow>
            {wallet.addFunds ? <Action primary label="Add" icon={<Plus size={22} color={C.onBrand} />} onPress={wallet.addFunds} />
              : faucet ? <Action primary label={busy === 'faucet' ? 'Adding…' : 'Test USDC'} icon={<Plus size={22} color={C.onBrand} />} disabled={!!busy} onPress={getTest} /> : null}
            <Action label="Send" icon={<ArrowUp size={21} color={C.ink} />} disabled={!bal} onPress={() => setSending(true)} />
            <Action label="Receive" icon={<ArrowDown size={21} color={C.ink} />} onPress={() => setReceiving(true)} />
          </ActionRow>
          {err ? <ErrorLine msg={err} /> : null}

          <Txt v="h2" style={{ marginTop: 28, marginBottom: 4 }}>Activity</Txt>
          {moves === null ? <SkeletonRows n={3} /> : moves.length === 0 ? (
            <Pending art={ART.coinsPile} title="No money moves yet" body="Add USDC, then save it, invest it or play with it." />
          ) : moves.map((m) => (
            <Pressable key={m.sig} onPress={() => Linking.openURL(explorerTx(m.sig))} accessibilityRole="link" accessibilityLabel={`${what(m)}, open on the explorer`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
                {m.delta >= 0 ? <ArrowDown size={18} color={C.ink} /> : <ArrowUp size={18} color={C.ink} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1}>{what(m)}</Txt>
                <Txt v="small" lines={1} style={{ marginTop: 1 }}>{m.at ? new Date(m.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</Txt>
              </View>
              <Txt v="num" color={m.delta >= 0 ? C.up : C.ink}>{m.delta >= 0 ? '+' : '−'}${Math.abs(m.delta).toFixed(2)}</Txt>
            </Pressable>
          ))}

          <Txt v="h2" style={{ marginTop: 28, marginBottom: 10 }}>Account</Txt>
          <View style={{ backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', paddingVertical: 4 }}>
            <SettingRow label="View on Solana Explorer" onPress={explorer} />
            {wallet.exportKey ? <SettingRow label="Export your key" onPress={wallet.exportKey} /> : null}
            {wallet.logout ? <SettingRow label="Sign out" danger onPress={wallet.logout} /> : null}
          </View>
          <Txt v="small" style={{ marginTop: 14, fontSize: 12, color: C.dim, lineHeight: 17 }}>Your key stays with you. Stakes wait in the Clashy program's escrow on Solana until the game settles.</Txt>
        </>
      )}

      <Sheet open={sending} onClose={() => setSending(false)} title="Send USDC">
        <Txt v="small">To any Solana address.{bal != null ? ` You have $${bal.toFixed(2)}.` : ''}</Txt>
        <SendUsdc chain={chain} onDone={() => setSending(false)} />
      </Sheet>
      <Sheet open={receiving} onClose={() => setReceiving(false)} title="Receive USDC">
        <Row style={{ gap: 10 }}>
          <Image source={ART.logoUSDC} style={{ width: 28, height: 28, borderRadius: 14 }} contentFit="cover" />
          <Txt v="small" style={{ flex: 1 }}>Send only USDC on Solana to this address.</Txt>
        </Row>
        <Pressable onPress={copy} style={{ marginTop: 14, backgroundColor: C.s2, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt v="label" style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', lineHeight: 22 } as object}>{me?.toBase58()}</Txt>
          {copied ? <Txt v="small" color={C.up}>Copied</Txt> : <Copy color={C.brandSoft} />}
        </Pressable>
        <Btn title={copied ? 'Copied' : 'Copy address'} style={{ marginTop: 12 }} onPress={copy} />
      </Sheet>
    </ScrollView>
  );
}
