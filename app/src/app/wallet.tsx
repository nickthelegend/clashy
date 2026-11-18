// Wallet: the player's Privy wallet. It holds USDC only; Clashy's sponsor pays every network fee, so there is never
// SOL to buy. One big balance, Add / Send / Receive as round actions that open bottom drawers, the wallet's real USDC
// history from the chain, and the account rows (explorer, export key, sign out).
import { router } from 'expo-router';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IS_LOCAL_NET, NET, PROGRAM_ID, USDC, base, faucetUsdc, usdcAta } from '@/chain/client';
import { SendUsdc, WalletCard, useChain } from '@/chain/useChain';
import { useDeskColumn } from '@/ui/layout';
import { ART, BackBtn, Btn, ErrorLine, Money, Row, SkeletonRows, Txt } from '@/ui/kit';
import { ArrowDown, ArrowUp, Copy, Plus } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { C, F, FONT, S } from '@/ui/tokens';

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

function Action({ label, icon, onPress, disabled, tint = C.s2 }: { label: string; icon: React.ReactNode; onPress: () => void; disabled?: boolean; tint?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 8, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{label}</Txt>
    </Pressable>
  );
}

function SettingRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 54, borderBottomWidth: 1, borderBottomColor: '#1A1A1F', backgroundColor: pressed ? C.s2 : 'transparent' })}>
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
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Txt v="small">{wallet.signer?.kind === 'privy' ? wallet.signer.label : 'Your wallet'}</Txt>
            <View style={{ marginTop: 4 }}>{bal == null ? <Txt v="title">…</Txt> : <Money value={bal} size={56} />}</View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: C.s1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Image source={ART.logoUSDC} style={{ width: 18, height: 18, borderRadius: 9 }} contentFit="cover" />
              <Txt v="small" color={C.ink}>USDC{IS_LOCAL_NET ? ' · test network' : ''} · no gas fees</Txt>
            </View>
          </View>

          <Row style={{ marginTop: 26, marginBottom: 6 }}>
            {wallet.addFunds ? <Action label="Add" tint={C.up} icon={<Plus color="#04120A" />} onPress={wallet.addFunds} />
              : faucet ? <Action label={busy === 'faucet' ? 'Adding…' : 'Test USDC'} tint={C.up} icon={<Plus color="#04120A" />} disabled={!!busy} onPress={getTest} /> : null}
            <Action label="Send" icon={<ArrowUp />} disabled={!bal} onPress={() => setSending(true)} />
            <Action label="Receive" icon={<ArrowDown />} onPress={() => setReceiving(true)} />
          </Row>
          {err ? <ErrorLine msg={err} /> : null}

          <Text style={{ ...FONT.semi, fontSize: 19, letterSpacing: -0.3, color: C.ink, marginTop: 26, marginBottom: 6 }}>Activity</Text>
          {moves === null ? <SkeletonRows n={3} /> : moves.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Image source={ART.coinsPile} style={{ width: 90, height: 90 }} contentFit="contain" />
              <Txt v="small" style={{ textAlign: 'center', marginTop: 6 }}>No money moves yet. Add USDC, then save it, invest it or play with it.</Txt>
            </View>
          ) : moves.map((m) => (
            <Pressable key={m.sig} onPress={() => Linking.openURL(explorerTx(m.sig))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: m.delta >= 0 ? C.upBg : C.s2, alignItems: 'center', justifyContent: 'center' }}>
                {m.delta >= 0 ? <ArrowDown size={18} color={C.up} /> : <ArrowUp size={18} color={C.ink} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label" lines={1}>{what(m)}</Txt>
                <Txt v="small">{m.at ? new Date(m.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</Txt>
              </View>
              <Txt v="label" color={m.delta >= 0 ? C.up : C.ink}>{m.delta >= 0 ? '+' : '−'}${Math.abs(m.delta).toFixed(2)}</Txt>
            </Pressable>
          ))}

          <Text style={{ ...FONT.semi, fontSize: 19, letterSpacing: -0.3, color: C.ink, marginTop: 26, marginBottom: 8 }}>Account</Text>
          <View style={{ backgroundColor: C.s1, borderRadius: 20, overflow: 'hidden' }}>
            <SettingRow label="View on Solana Explorer" onPress={explorer} />
            {wallet.exportKey ? <SettingRow label="Export your key" onPress={wallet.exportKey} /> : null}
            {wallet.logout ? <SettingRow label="Sign out" danger onPress={wallet.logout} /> : null}
          </View>
          <Txt v="small" style={{ marginTop: 14, lineHeight: 18 }}>Your money stays in your own wallet until you play. A stake waits in the Clashy program's escrow on Solana and comes back to you when the game settles. Clashy never sees your key.</Txt>
        </>
      )}

      <Sheet open={sending} onClose={() => setSending(false)} title="Send USDC">
        <Txt v="small">To any Solana address.{bal != null ? ` You have $${bal.toFixed(2)}.` : ''}</Txt>
        <SendUsdc chain={chain} onDone={() => setSending(false)} />
      </Sheet>
      <Sheet open={receiving} onClose={() => setReceiving(false)} title="Receive USDC">
        <View style={{ alignItems: 'center' }}>
          <Image source={ART.coinsPile} style={{ width: 96, height: 96 }} contentFit="contain" />
          <Txt v="small" style={{ textAlign: 'center', marginTop: 6 }}>Send only USDC on Solana to this address.</Txt>
        </View>
        <Pressable onPress={copy} style={{ marginTop: 14, backgroundColor: C.s2, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt v="label" style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', lineHeight: 22 } as object}>{me?.toBase58()}</Txt>
          {copied ? <Txt v="small" color={C.up}>Copied</Txt> : <Copy color={C.brandSoft} />}
        </Pressable>
        <Btn title={copied ? 'Copied' : 'Copy address'} style={{ marginTop: 12 }} onPress={copy} />
      </Sheet>
    </ScrollView>
  );
}
