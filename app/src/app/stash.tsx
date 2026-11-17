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
import { Lottie } from '@/ui/lottie';
import { STOCK_ART } from '@/ui/feed';
import { BackBtn, Btn, Card, ErrorLine, Money, Row, Txt } from '@/ui/kit';
import { AmountSheet } from '@/ui/amount';
import { Sheet, SheetTile } from '@/ui/sheet';
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
  const [coin, setCoin] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [amt, setAmt] = useState<{ kind: 'add' | 'out' | 'buy'; st?: Stock } | null>(null);
  const [pickStock, setPickStock] = useState(false);
  const after = () => { setCoin((c) => c + 1); setDropping(true); chain.refresh(); stash.reload(); port.reload(); };
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
    try { await fn(); if (/^(save|buy|pay)/.test(name)) { setCoin((n) => n + 1); setDropping(true); } chain.refresh(); stash.reload(); port.reload(); profile.reload(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const save = (usdc: number) => run(`save${usdc}`, async () => {
    if ((bal ?? 0) < usdc) throw new Error(`Your wallet has ${(bal ?? 0).toFixed(2)} USDC`);
    await onBase(`Save ${usdc} USDC`, () => progs!.base.methods.stashSave(new BN(usdc * USDC), 0).accountsPartial({ owner: me!, ownerUsdc: usdcAta(me!) }).rpc());
  });
  const takeOut = (usdc: number) => run(`out${usdc}`, async () => {
    await onBase(`Take ${usdc.toFixed(2)} USDC out`, () => progs!.base.methods.stashWithdraw(new BN(Math.round(usdc * USDC))).accountsPartial({ owner: me!, ownerUsdc: usdcAta(me!) }).rpc());
  });
  const buyNow = async (st: Stock, usdc: number) => {
    const raw = Math.round(usdc * USDC);
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
  };
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
  const stockProfit = port.status === 'ready' ? port.data.reduce((a, x) => a + (x.shares > 0 ? x.shares * (px[x.stock.symbol] ?? 0) - x.cost : 0), 0) : 0;
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
          {/* the total, the way the best money apps lead: one big number, cents dimmed */}
          <Row style={{ alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Txt v="small">Stash + stocks</Txt>
              <Money value={(s?.balance ?? 0) + invested} size={46} />
              <Row style={{ gap: 8, marginTop: 2 }}>
                <View style={{ backgroundColor: stockProfit >= 0 ? C.upBg : C.downBg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Txt v="small" color={stockProfit >= 0 ? C.up : C.down} style={{ fontFamily: F.semi }}>{stockProfit >= 0 ? '+' : '−'}${Math.abs(stockProfit).toFixed(2)}</Txt>
                </View>
                <Txt v="small">on stocks · ${(s?.balance ?? 0).toFixed(2)} cash</Txt>
              </Row>
            </View>
            {dropping ? <View style={{ width: 96, height: 96, borderRadius: 20, backgroundColor: '#000' }}><Lottie key={coin} name="coin" size={96} onDone={() => setDropping(false)} /></View>
              : <ClayLoop name="stash" size={96} style={{ borderRadius: 20 }} />}
          </Row>
          {goal > 0 ? (
            <View style={{ marginTop: 12 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: C.s2, overflow: 'hidden' }}><View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: C.up }} /></View>
              <Txt v="small" style={{ marginTop: 4 }}>{Math.round(pct * 100)}% of {fmtUsd(goal)}{s?.goalName ? ` · ${s.goalName}` : ''}</Txt>
            </View>
          ) : null}
          <Row style={{ gap: 8, marginTop: 16 }}>
            <Pressable onPress={() => setAmt({ kind: 'add' })} style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 26, backgroundColor: C.up, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}><Txt v="label" color="#04120A">Add</Txt></Pressable>
            <Pressable onPress={() => setAmt({ kind: 'out' })} disabled={!s || s.balance <= 0} style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 26, backgroundColor: '#1F1F26', alignItems: 'center', justifyContent: 'center', opacity: !s || s.balance <= 0 ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}><Txt v="label">Take out</Txt></Pressable>
            <Pressable onPress={() => setPickStock(true)} style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 26, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}><Txt v="label" color="#000">Invest</Txt></Pressable>
          </Row>
          {s ? (
            <Row style={{ gap: 8, marginTop: 10 }}>
              {[['Put in', s.savedManual], ['Round-ups', s.savedRoundup], ['From wins', s.savedWins]].map(([k, v]) => (
                <Card key={k as string} style={{ flex: 1, padding: 10 }}><Txt v="small" style={{ fontSize: 11 }}>{k}</Txt><Txt v="label">{fmtUsd(v as number)}</Txt></Card>
              ))}
            </Row>
          ) : null}
          {err ? <ErrorLine msg={err} /> : null}

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
                  <Pressable onPress={() => setAmt({ kind: 'buy', st })} disabled={!!busy} style={chip(false)}><Txt v="small" color={C.ink} style={{ fontFamily: F.semi }}>Buy</Txt></Pressable>
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
      <AmountSheet open={amt?.kind === 'add'} onClose={() => setAmt(null)} title="Add to your Stash" sub={`From your wallet · ${(bal ?? 0).toFixed(2)} USDC`} max={bal ?? 0} presets={[5, 10, 25]}
        confirm={(n) => `Save $${n.toFixed(2)}`} success="Saved to your Stash" successSub="It can't be staked. Take it out any time."
        onConfirm={async (n) => { await onBase(`Save ${n} USDC`, () => progs!.base.methods.stashSave(new BN(Math.round(n * USDC)), 0).accountsPartial({ owner: me!, ownerUsdc: usdcAta(me!) }).rpc()); after(); }} />
      <AmountSheet open={amt?.kind === 'out'} onClose={() => setAmt(null)} title="Take out" sub={`To your wallet · ${(s?.balance ?? 0).toFixed(2)} USDC in the Stash`} max={s?.balance ?? 0} presets={[5, 10]}
        confirm={(n) => `Take out $${n.toFixed(2)}`} success="Back in your wallet" successSub="Your Stash is yours: no lockups, no fees."
        onConfirm={async (n) => { await onBase(`Take ${n} USDC out`, () => progs!.base.methods.stashWithdraw(new BN(Math.round(n * USDC))).accountsPartial({ owner: me!, ownerUsdc: usdcAta(me!) }).rpc()); after(); }} />
      <AmountSheet open={amt?.kind === 'buy'} onClose={() => setAmt(null)} title={amt?.st ? `Buy ${amt.st.name}` : 'Buy'} sub={amt?.st ? `${amt.st.symbol} at ${px[amt.st.symbol] ? fmtUsd(px[amt.st.symbol]) : '…'} · from your Stash, topped up from your wallet` : undefined}
        art={amt?.st ? <Image source={STOCK_ART[amt.st.symbol]} style={{ width: 80, height: 80 }} contentFit="contain" /> : undefined} min={1} max={(s?.balance ?? 0) + (bal ?? 0)} presets={[5, 10, 25]}
        confirm={(n) => `Buy $${n.toFixed(2)} of ${amt?.st?.symbol ?? ''}`} success={`You own more ${amt?.st?.name ?? ''}`} successSub="Real tokenized shares, bought through Orca, now in your own wallet."
        onConfirm={async (n) => { if (amt?.st) { await buyNow(amt.st, n); after(); } }} />
      <Sheet open={pickStock} onClose={() => setPickStock(false)} title="Invest in">
        {STOCKS.map((st) => (
          <SheetTile key={st.symbol} art={<Image source={STOCK_ART[st.symbol]} style={{ width: 50, height: 50 }} contentFit="contain" />} title={st.name} line={`${st.symbol} · ${px[st.symbol] ? fmtUsd(px[st.symbol]) : '…'}`}
            onPress={() => { setPickStock(false); setTimeout(() => setAmt({ kind: 'buy', st }), 260); }} />
        ))}
      </Sheet>
    </ScrollView>
  );
}
