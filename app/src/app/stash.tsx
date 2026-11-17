// The Stash: the savings side of Clashy. A USDC jar only you can open, with a goal; round-ups on every payment you
// make; a share of every win; real tokenized stocks (xStocks) bought and sold through Orca from the Stash, with the
// cost kept on chain; and the limits you set on yourself, which the program enforces on every stake.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js';
import { Image } from 'expo-image';
import { BN, P, USDC, sendSponsored, usdcAta, usdcPayIxs } from '@/chain/client';
import { errText, short, useChain } from '@/chain/useChain';
import { readPortfolio, readProfile, readStash, usePoll, usePrices } from '@/chain/social';
import { SHARE, STOCKS, createStockAtaIx, minSharesFor, minUsdcFor, swapAccounts, type Stock } from '@/chain/stocks';
import { ClayLoop } from '@/ui/clay';
import { STOCK_ART } from '@/ui/feed';
import { BackBtn, Btn, Card, ErrorLine, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

const chip = (on: boolean) => ({ paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: 'center' as const, backgroundColor: on ? C.ink : C.s2 });
const field = { color: C.ink, fontFamily: F.medium, fontSize: 15, backgroundColor: C.s2, borderRadius: 12, paddingHorizontal: 12, height: 44 } as const;
const Section = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <View style={{ marginTop: 22 }}>
    <Txt v="h2">{title}</Txt>
    {sub ? <Txt v="small" style={{ marginTop: 3 }}>{sub}</Txt> : null}
    <View style={{ marginTop: 10 }}>{children}</View>
  </View>
);

export default function StashScreen() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const chain = useChain();
  const { me, progs, sponsor, bal, onBase, signer, wallet, hasProfile } = chain;
  const stash = usePoll(() => (me ? readStash(me) : Promise.resolve(null)), 4000, [me?.toBase58(), chain.tick]);
  const profile = usePoll(() => (me ? readProfile(me) : Promise.resolve(null)), 5000, [me?.toBase58(), chain.tick]);
  const port = usePoll(() => (me ? readPortfolio(me) : Promise.resolve([])), 5000, [me?.toBase58(), chain.tick]);
  const prices = usePrices();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string>();
  const [payTo, setPayTo] = useState('');
  const [payAmt, setPayAmt] = useState('');
  const [goalAmt, setGoalAmt] = useState('');
  const [goalName, setGoalName] = useState('');
  const s = stash.status === 'ready' ? stash.data : null;
  const prof = profile.status === 'ready' ? profile.data : null;
  const px = prices.status === 'ready' ? prices.data : {};
  const run = (name: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(name); setErr(undefined);
    try { await fn(); chain.refresh(); stash.reload(); port.reload(); profile.reload(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const save = (usdc: number) => run(`save${usdc}`, async () => {
    if ((bal ?? 0) < usdc) throw new Error(`Your wallet has ${(bal ?? 0).toFixed(2)} USDC`);
    await onBase(`Save ${usdc} USDC`, () => progs!.base.methods.stashSave(new BN(usdc * USDC), 0).accountsPartial({ owner: me!, ownerUsdc: usdcAta(me!) }).rpc());
  });
  const takeOut = (usdc: number) => run(`out${usdc}`, async () => {
    await onBase(`Take ${usdc.toFixed(2)} USDC out`, () => progs!.base.methods.stashWithdraw(new BN(Math.round(usdc * USDC))).accountsPartial({ owner: me!, ownerUsdc: usdcAta(me!) }).rpc());
  });
  const buy = (st: Stock, usdc: number) => run(`buy${st.symbol}${usdc}`, async () => {
    const raw = usdc * USDC;
    const pre = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), createStockAtaIx(sponsor!, me!, st)];
    const inStash = Math.round((s?.balance ?? 0) * USDC);
    if (inStash < raw) {
      if ((bal ?? 0) * USDC < raw - inStash) throw new Error(`Add ${((raw - inStash) / USDC).toFixed(2)} USDC first`);
      pre.push(await progs!.base.methods.stashSave(new BN(raw - inStash), 0).accountsPartial({ owner: me!, ownerUsdc: usdcAta(me!) }).instruction());
    }
    const min = await minSharesFor(st, raw);
    const sw = await swapAccounts(me!, st, true);
    await onBase(`Buy ${usdc} USDC of ${st.symbol}`, () => progs!.base.methods.stashInvest(new BN(raw), new BN(min))
      .accountsPartial({ owner: me!, payer: sponsor!, holding: P.holding(me!, new PublicKey(st.mint)), sw }).preInstructions(pre).rpc());
  });
  const sellAll = (st: Stock, shares: number) => run(`sell${st.symbol}`, async () => {
    const raw = Math.floor(shares * SHARE);
    const min = await minUsdcFor(st, raw);
    const sw = await swapAccounts(me!, st, false);
    await onBase(`Sell ${st.symbol}`, () => progs!.base.methods.stashSell(new BN(raw), new BN(min))
      .accountsPartial({ owner: me!, payer: sponsor!, holding: P.holding(me!, new PublicKey(st.mint)), sw })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })]).rpc());
  });
  const setControls = (patch: { limit?: number; saveBps?: number; roundup?: number }) => run('limits', async () => {
    await onBase('Update your limits', () => progs!.base.methods.setLimits(new BN(Math.round((patch.limit ?? (prof!.pendingAt ? prof!.pendingLimit : prof!.dailyLimit)) * USDC)), patch.saveBps ?? prof!.saveBps, new BN(Math.round((patch.roundup ?? prof!.roundupStep) * USDC)))
      .accountsPartial({ owner: me! }).rpc());
  });
  const takeBreak = (days: number) => run('break', async () => {
    await onBase(`Take a ${days}-day break`, () => progs!.base.methods.takeBreak(new BN(days * 86_400)).accountsPartial({ owner: me! }).rpc());
  });
  const setGoal = run('goal', async () => {
    const g = Number(goalAmt);
    if (!(g > 0)) throw new Error('Enter a goal in USDC');
    await onBase('Set your goal', () => progs!.base.methods.setGoal(new BN(Math.round(g * USDC)), goalName.trim().slice(0, 24)).accountsPartial({ owner: me! }).rpc());
    setGoalAmt(''); setGoalName('');
  });
  /** Pay anyone in USDC; the change up to your round-up step goes to the Stash in the same transaction. */
  const pay = run('pay', async () => {
    let to: PublicKey;
    try { to = new PublicKey(payTo.trim()); } catch { throw new Error('That is not a Solana address'); }
    const amt = Number(payAmt);
    if (!(amt > 0)) throw new Error('Enter an amount');
    const units = Math.round(amt * USDC);
    const step = Math.round((prof?.roundupStep ?? 0) * USDC);
    const roundup = step > 0 && units % step !== 0 ? step - (units % step) : 0;
    if ((units + roundup) / USDC > (bal ?? 0)) throw new Error(`You have ${(bal ?? 0).toFixed(2)} USDC`);
    const tx = new Transaction().add(...usdcPayIxs(sponsor!, me!, to, units));
    if (roundup > 0) tx.add(await progs!.base.methods.stashSave(new BN(roundup), 1).accountsPartial({ owner: me!, ownerUsdc: usdcAta(me!) }).instruction());
    await onBase(`Pay ${amt} USDC to ${short(to.toBase58())}${roundup ? ` · ${(roundup / USDC).toFixed(2)} round-up saved` : ''}`, () => sendSponsored(tx, 'base', signer!));
    setPayAmt('');
  });

  const goal = s?.goal ?? 0;
  const pct = goal > 0 ? Math.min(1, (s?.balance ?? 0) / goal) : 0;
  const invested = port.status === 'ready' ? port.data.reduce((a, x) => a + x.shares * (px[x.stock.symbol] ?? 0), 0) : 0;
  const now = Date.now() / 1000;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Txt v="title" style={{ fontSize: 26 }}>Stash</Txt>
      </Row>

      {!me || hasProfile === false ? (
        <Card style={{ padding: 16 }}>
          <Txt v="label">{wallet.status === 'out' ? 'Sign in to open your Stash' : 'Pick your name on Home first'}</Txt>
          <Txt v="small" style={{ marginTop: 4 }}>Your Stash is a savings jar on Solana that only you can open: round-ups, a slice of your wins, and real stocks.</Txt>
          <Btn title={wallet.status === 'out' ? 'Sign in' : 'Go to Home'} kind="white" style={{ marginTop: 12 }} onPress={() => (wallet.status === 'out' ? wallet.login?.() : router.replace('/'))} />
        </Card>
      ) : (
        <>
          <View style={{ backgroundColor: C.s1, borderRadius: 24, padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <ClayLoop name="stash" size={112} style={{ borderRadius: 20 }} />
            <View style={{ flex: 1 }}>
              <Txt v="small">In your Stash</Txt>
              <Txt v="title" style={{ fontSize: 34 }}>{s ? fmtUsd(s.balance) : '…'}</Txt>
              <Txt v="small">{invested > 0 ? `+ ${fmtUsd(invested)} in stocks` : 'USDC, yours to take out any time'}</Txt>
              {goal > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: C.s2, overflow: 'hidden' }}><View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: C.up }} /></View>
                  <Txt v="small" style={{ marginTop: 4 }}>{Math.round(pct * 100)}% of {fmtUsd(goal)}{s?.goalName ? ` · ${s.goalName}` : ''}</Txt>
                </View>
              ) : null}
            </View>
          </View>
          {s ? (
            <Row style={{ gap: 8, marginTop: 10 }}>
              {[['Put in', s.savedManual], ['Round-ups', s.savedRoundup], ['From wins', s.savedWins]].map(([k, v]) => (
                <Card key={k as string} style={{ flex: 1, padding: 10 }}><Txt v="small" style={{ fontSize: 11 }}>{k}</Txt><Txt v="label">{fmtUsd(v as number)}</Txt></Card>
              ))}
            </Row>
          ) : null}
          {err ? <ErrorLine msg={err} /> : null}

          <Section title="Add or take out" sub={`Wallet ${bal === null ? '…' : `${bal.toFixed(2)} USDC`} · moves are instant and free`}>
            <Row style={{ gap: 6, flexWrap: 'wrap' }}>
              {[5, 10, 25].map((n) => <Pressable key={n} onPress={save(n)} disabled={!!busy} style={chip(false)}><Txt v="small" color={C.ink} style={{ fontFamily: F.semi }}>{busy === `save${n}` ? '…' : `+ $${n}`}</Txt></Pressable>)}
              {s && s.balance > 0 ? <Pressable onPress={takeOut(s.balance)} disabled={!!busy} style={chip(false)}><Txt v="small" color={C.ink} style={{ fontFamily: F.semi }}>{busy?.startsWith('out') ? '…' : 'Take it all out'}</Txt></Pressable> : null}
            </Row>
          </Section>

          <Section title="Goal" sub={goal > 0 ? `${fmtUsd(goal)}${s?.goalName ? ` for ${s.goalName}` : ''}` : 'Save toward something'}>
            <Row style={{ gap: 8 }}>
              <TextInput value={goalName} onChangeText={setGoalName} placeholder="New phone" placeholderTextColor={C.muted} maxLength={24} style={[field, { flex: 1.4, minWidth: 0 }]} />
              <TextInput value={goalAmt} onChangeText={setGoalAmt} placeholder="USDC" placeholderTextColor={C.muted} keyboardType="decimal-pad" style={[field, { flex: 1, minWidth: 0 }]} />
              <Btn title={busy === 'goal' ? '…' : 'Set'} h={44} disabled={!!busy || !goalAmt} onPress={setGoal} />
            </Row>
          </Section>

          <Section title="Stocks" sub="Real tokenized stocks (xStocks), bought through Orca from your Stash. The shares sit in your own wallet; what you paid is on chain.">
            {STOCKS.map((st) => {
              const pos = port.status === 'ready' ? port.data.find((x) => x.stock.symbol === st.symbol) : undefined;
              const price = px[st.symbol];
              const value = pos && price ? pos.shares * price : 0;
              const profit = pos && pos.cost > 0 ? value - pos.cost : 0;
              return (
                <Row key={st.symbol} style={{ gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Image source={STOCK_ART[st.symbol]} style={{ width: 42, height: 42 }} contentFit="contain" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label" lines={1}>{st.name} <Txt v="small">{st.symbol}</Txt></Txt>
                    <Txt v="small" lines={1}>{price ? fmtUsd(price) : '…'}{pos && pos.shares > 0 ? ` · ${pos.shares.toFixed(4)} sh · ${fmtUsd(value)}` : ''}</Txt>
                    {pos && pos.shares > 0 ? <Txt v="small" color={profit >= 0 ? C.up : C.down}>{profit >= 0 ? '+' : '−'}{fmtUsd(Math.abs(profit))} on {fmtUsd(pos.cost)}</Txt> : null}
                  </View>
                  <Pressable onPress={buy(st, 5)} disabled={!!busy} style={chip(false)}><Txt v="small" color={C.ink} style={{ fontFamily: F.semi }}>{busy === `buy${st.symbol}5` ? '…' : 'Buy $5'}</Txt></Pressable>
                  {pos && pos.shares > 0 ? <Pressable onPress={sellAll(st, pos.shares)} disabled={!!busy} style={chip(false)}><Txt v="small" color={C.ink} style={{ fontFamily: F.semi }}>{busy === `sell${st.symbol}` ? '…' : 'Sell'}</Txt></Pressable> : null}
                </Row>
              );
            })}
          </Section>

          <Section title="Round-ups" sub="Pay anyone in USDC from Clashy and the change up to the next step lands in your Stash, in the same transaction.">
            <Row style={{ gap: 6 }}>
              {[0, 1, 5].map((n) => (
                <Pressable key={n} onPress={setControls({ roundup: n })} disabled={!!busy || !prof} style={chip((prof?.roundupStep ?? 0) === n)}>
                  <Txt v="small" color={(prof?.roundupStep ?? 0) === n ? '#000' : C.ink} style={{ fontFamily: F.semi }}>{n === 0 ? 'Off' : `To next $${n}`}</Txt>
                </Pressable>
              ))}
            </Row>
            <View style={{ marginTop: 10, gap: 8 }}>
              <TextInput value={payTo} onChangeText={setPayTo} placeholder="Pay to (Solana address)" placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false} style={field} />
              <Row style={{ gap: 8 }}>
                <TextInput value={payAmt} onChangeText={setPayAmt} placeholder="USDC" placeholderTextColor={C.muted} keyboardType="decimal-pad" style={[field, { flex: 1 }]} />
                <Btn title={busy === 'pay' ? 'Paying…' : 'Pay'} h={44} disabled={!!busy || !payTo || !payAmt} onPress={pay} />
              </Row>
            </View>
          </Section>

          <Section title="Save from wins" sub="When you win a duel, this share of the payout moves to your Stash.">
            <Row style={{ gap: 6 }}>
              {[0, 1000, 2500, 5000].map((b) => (
                <Pressable key={b} onPress={setControls({ saveBps: b })} disabled={!!busy || !prof} style={chip((prof?.saveBps ?? 0) === b)}>
                  <Txt v="small" color={(prof?.saveBps ?? 0) === b ? '#000' : C.ink} style={{ fontFamily: F.semi }}>{b === 0 ? 'Off' : `${b / 100}%`}</Txt>
                </Pressable>
              ))}
            </Row>
          </Section>

          <Section title="Your limits" sub="Set by you, enforced by the Clashy program on every stake. No app can go past them, ours included.">
            {prof ? (
              <Card style={{ padding: 14 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="label">Daily stake limit</Txt><Txt v="label">{fmtUsd(prof.dailyLimit)}</Txt>
                </Row>
                <Txt v="small" style={{ marginTop: 4 }}>
                  Staked today {fmtUsd(prof.day === Math.floor(now / 86_400) ? prof.stakedToday : 0)}
                  {prof.pendingAt ? ` · raise to ${fmtUsd(prof.pendingLimit)} applies ${new Date(prof.pendingAt * 1000).toLocaleString()}` : ''}
                </Txt>
                <Row style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {[10, 25, 50, 100].map((n) => (
                    <Pressable key={n} onPress={setControls({ limit: n })} disabled={!!busy} style={chip(prof.dailyLimit === n)}>
                      <Txt v="small" color={prof.dailyLimit === n ? '#000' : C.ink} style={{ fontFamily: F.semi }}>${n}/day</Txt>
                    </Pressable>
                  ))}
                </Row>
                <Txt v="small" style={{ marginTop: 8 }}>Lowering applies now; raising waits 24 hours.</Txt>
                <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
                  <Txt v="label">{prof.breakUntil > now ? `On a break until ${new Date(prof.breakUntil * 1000).toLocaleString()}` : 'Take a break'}</Txt>
                </Row>
                <Row style={{ gap: 6, marginTop: 8 }}>
                  {[1, 7, 30].map((d) => (
                    <Pressable key={d} onPress={takeBreak(d)} disabled={!!busy} style={chip(false)}><Txt v="small" color={C.ink} style={{ fontFamily: F.semi }}>{d} day{d > 1 ? 's' : ''}</Txt></Pressable>
                  ))}
                </Row>
                <Txt v="small" style={{ marginTop: 8 }}>A break stops every stake until it ends. It cannot be shortened. Saving and stocks stay open.</Txt>
              </Card>
            ) : <Txt v="small">Loading your limits…</Txt>}
          </Section>
        </>
      )}
    </ScrollView>
  );
}
