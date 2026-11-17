// The Stash: the savings side of Clashy. A USDC jar only you can open, with a goal; round-ups on every payment you
// make; a share of every win; real tokenized stocks (xStocks) bought and sold through Orca from the Stash, with the
// cost kept on chain; and the limits you set on yourself, which the program enforces on every stake.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
import { ART, BackBtn, Btn, Card, ErrorLine, Money, Row, Txt } from '@/ui/kit';
import { AmountSheet } from '@/ui/amount';
import { Sheet, SheetTile } from '@/ui/sheet';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

const field = { color: C.ink, fontFamily: F.medium, fontSize: 16, backgroundColor: C.s2, borderRadius: 16, paddingHorizontal: 14, height: 52 } as const;

/** One row of a settings group: art, title, the current value, a chevron; opens that setting's drawer. */
const SetRow = ({ art, title, value, onPress }: { art: number; title: string; value: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1F', backgroundColor: pressed ? C.s2 : 'transparent' })}>
    <Image source={art} style={{ width: 40, height: 40 }} contentFit="contain" />
    <Txt v="label" style={{ flex: 1 }}>{title}</Txt>
    <Txt v="small" color={C.muted}>{value}</Txt>
    <Txt v="label" color={C.dim}>›</Txt>
  </Pressable>
);
/** A selectable option row inside a drawer, with a check on the current choice. */
const Choice = ({ title, line, on, busy, onPress }: { title: string; line: string; on: boolean; busy?: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, marginBottom: 8, backgroundColor: on ? 'rgba(48,209,88,0.12)' : pressed ? '#22222A' : '#1B1B21', borderWidth: 1.5, borderColor: on ? C.up : '#26262E', opacity: busy ? 0.6 : 1 })}>
    <View style={{ flex: 1 }}><Txt v="label">{title}</Txt><Txt v="small">{line}</Txt></View>
    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? C.up : '#3A3A44', backgroundColor: on ? C.up : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Text style={{ color: '#04120A', fontFamily: F.bold, fontSize: 13 }}>✓</Text> : null}</View>
  </Pressable>
);
const Opt = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={{ flex: 1, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.ink : C.s2 }}><Txt v="small" color={on ? '#000' : C.ink} style={{ fontFamily: F.semi }}>{label}</Txt></Pressable>
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
  const [panel, setPanel] = useState<'goal' | 'roundup' | 'wins' | 'limit' | 'break' | 'pay' | null>(null);
  const [sell, setSell] = useState<Stock | null>(null);
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
    setGoalAmt(''); setGoalName(''); setPanel(null);
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
    setPayAmt(''); setPanel(null);
  });

  const goal = s?.goal ?? 0;
  const pct = goal > 0 ? Math.min(1, (s?.balance ?? 0) / goal) : 0;
  const invested = port.status === 'ready' ? port.data.reduce((a, x) => a + x.shares * (px[x.stock.symbol] ?? 0), 0) : 0;
  const stockProfit = port.status === 'ready' ? port.data.reduce((a, x) => a + (x.shares > 0 ? x.shares * (px[x.stock.symbol] ?? 0) - x.cost : 0), 0) : 0;
  const now = Date.now() / 1000;
  const stakedToday = prof && prof.day === Math.floor(now / 86_400) ? prof.stakedToday : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}>STASH</Text>
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

          {/* the goal */}
          <Pressable onPress={() => setPanel('goal')} style={({ pressed }) => ({ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 24, padding: 14, backgroundColor: '#0F1A12', borderWidth: 1, borderColor: '#1F3A26', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Image source={ART.goal} style={{ width: 64, height: 64 }} contentFit="contain" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="small" color="#8FD8A4" style={{ fontFamily: F.bold, letterSpacing: 0.6, fontSize: 11 }}>{goal > 0 ? 'YOUR GOAL' : 'SAVE FOR SOMETHING'}</Txt>
              <Text style={{ fontFamily: F.display, fontSize: 20, color: C.ink, marginTop: 2 }} numberOfLines={1}>{goal > 0 ? (s?.goalName || 'My goal') : 'Set a goal'}</Text>
              {goal > 0 ? (
                <>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: '#1D2B21', overflow: 'hidden', marginTop: 8 }}><View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: C.up, borderRadius: 4 }} /></View>
                  <Txt v="small" style={{ marginTop: 4 }}>{fmtUsd(s?.balance ?? 0)} of {fmtUsd(goal)} · {Math.round(pct * 100)}%</Txt>
                </>
              ) : <Txt v="small">A phone, a trip, a rainy day. Watch it fill up.</Txt>}
            </View>
            <Txt v="label" color={C.muted}>›</Txt>
          </Pressable>

          {/* stocks */}
          <Row style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 4 }}>
            <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink }}>STOCKS</Text>
            <Txt v="small">Real shares · via Orca</Txt>
          </Row>
          {STOCKS.map((st) => {
            const pos = port.status === 'ready' ? port.data.find((x) => x.stock.symbol === st.symbol) : undefined;
            const price = px[st.symbol];
            const held = !!pos && pos.shares > 0;
            const value = held && price ? pos!.shares * price : 0;
            const profit = held && pos!.cost > 0 ? value - pos!.cost : 0;
            return (
              <Row key={st.symbol} style={{ gap: 12, paddingVertical: 10 }}>
                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.s1, alignItems: 'center', justifyContent: 'center' }}><Image source={STOCK_ART[st.symbol]} style={{ width: 40, height: 40 }} contentFit="contain" /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>{st.name}</Txt>
                  <Txt v="small" lines={1}>{held ? `${pos!.shares.toFixed(4)} ${st.symbol}` : st.symbol} · {price ? fmtUsd(price) : '…'}</Txt>
                </View>
                {held ? (
                  <Pressable onPress={() => setSell(st)} style={{ alignItems: 'flex-end', marginRight: 4 }}>
                    <Txt v="label">{fmtUsd(value)}</Txt>
                    <Txt v="small" color={profit >= 0 ? C.up : C.down} style={{ fontFamily: F.semi }}>{profit >= 0 ? '+' : '−'}{fmtUsd(Math.abs(profit))}</Txt>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setAmt({ kind: 'buy', st })} disabled={!!busy} style={({ pressed }) => ({ paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: held ? C.s2 : C.ink, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                  <Txt v="small" color={held ? C.ink : '#000'} style={{ fontFamily: F.bold }}>Buy</Txt>
                </Pressable>
              </Row>
            );
          })}

          {/* automatic saving and your limits */}
          <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink, marginTop: 28, marginBottom: 10 }}>ON AUTOPILOT</Text>
          <View style={{ backgroundColor: C.s1, borderRadius: 22, overflow: 'hidden' }}>
            <SetRow art={ART.roundup} title="Round-ups" value={(prof?.roundupStep ?? 0) > 0 ? `To next $${prof!.roundupStep}` : 'Off'} onPress={() => setPanel('roundup')} />
            <SetRow art={ART.spend} title="Pay someone" value="Rounds up" onPress={() => setPanel('pay')} />
            <SetRow art={ART.gift} title="Save from wins" value={(prof?.saveBps ?? 0) > 0 ? `${prof!.saveBps / 100}% of each win` : 'Off'} onPress={() => setPanel('wins')} />
          </View>
          <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink, marginTop: 28, marginBottom: 4 }}>YOUR LIMITS</Text>
          <Txt v="small" style={{ marginBottom: 10 }}>Set by you, enforced by the Clashy program on every stake. No app can go past them, ours included.</Txt>
          <View style={{ backgroundColor: C.s1, borderRadius: 22, overflow: 'hidden' }}>
            <SetRow art={ART.limits} title="Daily stake limit" value={prof ? `${fmtUsd(prof.dailyLimit)} · ${fmtUsd(stakedToday)} used` : '…'} onPress={() => setPanel('limit')} />
            <SetRow art={ART.breakMoon} title="Take a break" value={prof && prof.breakUntil > now ? `Until ${new Date(prof.breakUntil * 1000).toLocaleDateString()}` : 'Off'} onPress={() => setPanel('break')} />
          </View>
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
      <Sheet open={panel === 'goal'} onClose={() => setPanel(null)} title={goal > 0 ? 'Change your goal' : 'Set a goal'}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}><Image source={ART.goal} style={{ width: 86, height: 86 }} contentFit="contain" /></View>
        <TextInput value={goalName} onChangeText={setGoalName} placeholder={s?.goalName || 'What for? A new phone'} placeholderTextColor={C.muted} maxLength={24} style={field} />
        <TextInput value={goalAmt} onChangeText={setGoalAmt} placeholder={goal > 0 ? `${goal} USDC` : 'How much? 200'} placeholderTextColor={C.muted} keyboardType="decimal-pad" style={[field, { marginTop: 8 }]} />
        <Row style={{ gap: 8, marginTop: 8 }}>{[50, 200, 500, 1000].map((n) => <Opt key={n} label={`$${n}`} on={goalAmt === String(n)} onPress={() => setGoalAmt(String(n))} />)}</Row>
        {err ? <ErrorLine msg={err} /> : null}
        <Btn title={busy === 'goal' ? 'Saving…' : 'Save goal'} style={{ marginTop: 14 }} disabled={!!busy || !goalAmt} onPress={async () => { await setGoal(); }} />
      </Sheet>
      <Sheet open={panel === 'roundup'} onClose={() => setPanel(null)} title="Round-ups">
        <Txt v="small" style={{ marginBottom: 12 }}>Pay anyone from Clashy and the change up to the next step lands in your Stash, in the same transaction.</Txt>
        {[0, 1, 5].map((n) => <Choice key={n} title={n === 0 ? 'Off' : `Round up to the next $${n}`} line={n === 0 ? 'Pay the exact amount' : `Pay $3.40 and $${(n - 3.4 % n).toFixed(2)} is saved`} on={(prof?.roundupStep ?? 0) === n} busy={busy === 'limits'} onPress={setControls({ roundup: n })} />)}
      </Sheet>
      <Sheet open={panel === 'wins'} onClose={() => setPanel(null)} title="Save from wins">
        <Txt v="small" style={{ marginBottom: 12 }}>When you win a clash, this share of the payout goes straight to your Stash.</Txt>
        {[0, 1000, 2500, 5000].map((b) => <Choice key={b} title={b === 0 ? 'Off' : `${b / 100}% of every win`} line={b === 0 ? 'Winnings stay in your wallet' : `Win $9.70 and $${(9.7 * b / 10_000).toFixed(2)} is saved`} on={(prof?.saveBps ?? 0) === b} busy={busy === 'limits'} onPress={setControls({ saveBps: b })} />)}
      </Sheet>
      <Sheet open={panel === 'limit'} onClose={() => setPanel(null)} title="Daily stake limit">
        <Txt v="small" style={{ marginBottom: 12 }}>The most you can put into games in a day. Lowering applies now; raising waits 24 hours.{prof?.pendingAt ? ` Raise to ${fmtUsd(prof.pendingLimit)} applies ${new Date(prof.pendingAt * 1000).toLocaleString()}.` : ''}</Txt>
        {[10, 25, 50, 100].map((n) => <Choice key={n} title={`$${n} a day`} line={prof && n < prof.dailyLimit ? 'Applies now' : prof && n > prof.dailyLimit ? 'Applies in 24 hours' : 'Your limit'} on={prof?.dailyLimit === n} busy={busy === 'limits'} onPress={setControls({ limit: n })} />)}
      </Sheet>
      <Sheet open={panel === 'break'} onClose={() => setPanel(null)} title="Take a break">
        <Txt v="small" style={{ marginBottom: 12 }}>A break stops every stake until it ends, and it cannot be shortened. Saving and stocks stay open.</Txt>
        {prof && prof.breakUntil > now ? <Txt v="label" color={C.up} style={{ marginBottom: 10 }}>On a break until {new Date(prof.breakUntil * 1000).toLocaleString()}</Txt> : null}
        {[1, 7, 30].map((d) => <Choice key={d} title={`${d} day${d > 1 ? 's' : ''}`} line={`No clashes or Royales until ${new Date((now + d * 86_400) * 1000).toLocaleDateString()}`} on={false} busy={busy === 'break'} onPress={takeBreak(d)} />)}
      </Sheet>
      <Sheet open={panel === 'pay'} onClose={() => setPanel(null)} title="Pay someone">
        <Txt v="small" style={{ marginBottom: 12 }}>Send USDC to any Solana address.{(prof?.roundupStep ?? 0) > 0 ? ` The change up to the next $${prof!.roundupStep} goes to your Stash.` : ' Turn on round-ups to save the change.'}</Txt>
        <TextInput value={payTo} onChangeText={setPayTo} placeholder="Solana address" placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false} style={field} />
        <TextInput value={payAmt} onChangeText={setPayAmt} placeholder="Amount in USDC" placeholderTextColor={C.muted} keyboardType="decimal-pad" style={[field, { marginTop: 8 }]} />
        {err ? <ErrorLine msg={err} /> : null}
        <Btn title={busy === 'pay' ? 'Paying…' : 'Pay'} style={{ marginTop: 14 }} disabled={!!busy || !payTo || !payAmt} onPress={pay} />
      </Sheet>
      <Sheet open={!!sell} onClose={() => setSell(null)} title={sell ? `Sell ${sell.name}` : 'Sell'}>
        {sell ? (() => {
          const pos = port.status === 'ready' ? port.data.find((x) => x.stock.symbol === sell.symbol) : undefined;
          const value = pos && px[sell.symbol] ? pos.shares * px[sell.symbol] : 0;
          return (
            <>
              <View style={{ alignItems: 'center' }}>
                <Image source={STOCK_ART[sell.symbol]} style={{ width: 80, height: 80 }} contentFit="contain" />
                <Money value={value} size={40} />
                <Txt v="small">{pos?.shares.toFixed(4)} {sell.symbol} · paid {fmtUsd(pos?.cost ?? 0)}</Txt>
              </View>
              {err ? <ErrorLine msg={err} /> : null}
              <Btn title={busy === `sell${sell.symbol}` ? 'Selling…' : 'Sell all into the Stash'} kind="white" style={{ marginTop: 16 }} disabled={!!busy || !pos} onPress={async () => { if (pos) { await sellAll(sell, pos.shares)(); setSell(null); } }} />
              <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Sold through Orca at the pool price. The USDC lands in your Stash.</Txt>
            </>
          );
        })() : null}
      </Sheet>
      <Sheet open={pickStock} onClose={() => setPickStock(false)} title="Invest in">
        {STOCKS.map((st) => (
          <SheetTile key={st.symbol} art={<Image source={STOCK_ART[st.symbol]} style={{ width: 50, height: 50 }} contentFit="contain" />} title={st.name} line={`${st.symbol} · ${px[st.symbol] ? fmtUsd(px[st.symbol]) : '…'}`}
            onPress={() => { setPickStock(false); setTimeout(() => setAmt({ kind: 'buy', st }), 260); }} />
        ))}
      </Sheet>
    </ScrollView>
  );
}
