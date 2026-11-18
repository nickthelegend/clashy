// The Stash: the savings side of Clashy. A USDC jar only you can open, with a goal; round-ups on every payment you
// make; a share of every win; real tokenized stocks (xStocks) bought and sold through Orca from the Stash, with the
// cost kept on chain; and the limits you set on yourself, which the program enforces on every stake.
import { router } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js';
import { Image } from 'expo-image';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { BN, P, USDC, sendSponsored, usdcAta, usdcPayIxs } from '@/chain/client';
import { errText, short, useChain } from '@/chain/useChain';
import { readPortfolio, readProfile, readStash, usePoll, usePrices } from '@/chain/social';
import { SHARE, STOCKS, createStockAtaIx, minSharesFor, minUsdcFor, swapAccounts, type Stock } from '@/chain/stocks';
import { Lottie } from '@/ui/lottie';
import { STOCK_ART } from '@/ui/feed';
import { ArrowUp, Crown, Jar, Plus, Shield } from '@/ui/icons';
import { BackBtn, Btn, ErrorLine, Money, Row, Txt } from '@/ui/kit';
import { AmountSheet } from '@/ui/amount';
import { Sheet, SheetTile } from '@/ui/sheet';
import { ActionRow, RoundAction } from '@/ui/watchlist';
import { useDeskColumn } from '@/ui/layout';
import { C, FONT, S, fmtUsd } from '@/ui/tokens';

const field = { color: C.ink, ...FONT.medium, fontSize: 16, backgroundColor: C.s2, borderRadius: 16, paddingHorizontal: 14, height: 52 } as const;

/** Line icons in the ui/icons style for the three things that set has no glyph for. */
const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const });
const TrendUp = ({ size = 20, color = C.ink }: { size?: number; color?: string }) => (
  <Svg {...svg(size)} stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><Polyline points="3 17 9.5 10.5 13.5 14.5 21 7" /><Polyline points="15 7 21 7 21 13" /></Svg>
);
const Target = ({ size = 20, color = C.ink }: { size?: number; color?: string }) => (
  <Svg {...svg(size)} stroke={color} strokeWidth={2.1}><Circle cx="12" cy="12" r="8.5" /><Circle cx="12" cy="12" r="4.5" /><Circle cx="12" cy="12" r="0.8" fill={color} /></Svg>
);
const Moon = ({ size = 20, color = C.ink }: { size?: number; color?: string }) => (
  <Svg {...svg(size)} stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>
);
const Disc = ({ children, size = 40 }: { children: ReactNode; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
);

/** A round action that can be switched off (dimmed, not pressable) while it has nothing to act on. */
function Action({ disabled, ...p }: ComponentProps<typeof RoundAction> & { disabled?: boolean }) {
  return (
    <View style={{ flex: 1, opacity: disabled ? 0.4 : 1 }} pointerEvents={disabled ? 'none' : 'auto'} accessibilityState={{ disabled: !!disabled }}>
      <RoundAction {...p} />
    </View>
  );
}

/** One row of a settings group: an icon, the title, the current value, a chevron; opens that setting's drawer. */
const SetRow = ({ icon, title, value, onPress }: { icon: ReactNode; title: string; value: string; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${value}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: pressed ? C.s1 : 'transparent' })}>
    <Disc>{icon}</Disc>
    <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{title}</Txt>
    <Txt v="small" lines={1} style={{ flex: 1, textAlign: 'right' }}>{value}</Txt>
    <Txt v="label" color={C.dim}>›</Txt>
  </Pressable>
);
/** A selectable option row inside a drawer, with a radio on the current choice. */
const Choice = ({ title, line, on, busy, onPress }: { title: string; line: string; on: boolean; busy?: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={title}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, marginBottom: 8, backgroundColor: on ? C.s2 : pressed ? C.s1 : C.card, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
    <View style={{ flex: 1, minWidth: 0 }}><Txt v="label">{title}</Txt><Txt v="small" style={{ marginTop: 1 }}>{line}</Txt></View>
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? C.brand : C.s2, alignItems: 'center', justifyContent: 'center' }}>{on ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.onBrand }} /> : null}</View>
  </Pressable>
);
const Opt = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={{ flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.ink : C.s2 }}><Txt v="small" color={on ? '#000' : C.ink} style={{ ...FONT.semi }}>{label}</Txt></Pressable>
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
        <Txt v="title">Stash</Txt>
      </Row>

      {!me || hasProfile === false ? (
        <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 16 }}>
          <Txt v="label">{wallet.status === 'out' ? 'Sign in to open your Stash' : 'Pick your name on Home first'}</Txt>
          <Txt v="small" style={{ marginTop: 4 }}>A savings jar on Solana that only you can open.</Txt>
          <Btn title={wallet.status === 'out' ? 'Sign in' : 'Go to Home'} style={{ marginTop: 12 }} onPress={() => (wallet.status === 'out' ? wallet.login?.() : router.replace('/'))} />
        </View>
      ) : (
        <>
          {/* the total, the way the best money apps lead: one big number, cents dimmed */}
          <View>
            <Txt v="small">Stash + stocks</Txt>
            <View style={{ marginTop: 2 }}><Money value={(s?.balance ?? 0) + invested} size={40} /></View>
            <Txt v="small" color={stockProfit >= 0 ? C.up : C.down} style={{ ...FONT.medium, marginTop: 2, fontVariant: ['tabular-nums'] }}>
              {stockProfit >= 0 ? '+' : '−'}${Math.abs(stockProfit).toFixed(2)} <Txt v="small">on stocks · ${(s?.balance ?? 0).toFixed(2)} cash</Txt>
            </Txt>
            {/* the coin drop after a save, a buy or a payment */}
            {dropping ? <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: -6, width: 72, height: 72 }}><Lottie key={coin} name="coin" size={72} onDone={() => setDropping(false)} /></View> : null}
          </View>
          {goal > 0 ? (
            <View style={{ marginTop: 12 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.s2, overflow: 'hidden' }}><View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: C.brand }} /></View>
              <Txt v="small" lines={1} style={{ marginTop: 4 }}>{Math.round(pct * 100)}% of {fmtUsd(goal)}{s?.goalName ? ` · ${s.goalName}` : ''}</Txt>
            </View>
          ) : null}
          <ActionRow>
            <Action primary label="Add" icon={<Plus size={22} color={C.onBrand} />} onPress={() => setAmt({ kind: 'add' })} />
            <Action label="Take out" icon={<ArrowUp size={21} color={C.ink} />} disabled={!s || s.balance <= 0} onPress={() => setAmt({ kind: 'out' })} />
            <Action label="Invest" icon={<TrendUp size={21} />} onPress={() => setPickStock(true)} />
          </ActionRow>
          {s ? (
            <Row style={{ gap: 8, marginTop: 20 }}>
              {[['Put in', s.savedManual], ['Round-ups', s.savedRoundup], ['From wins', s.savedWins]].map(([k, v]) => (
                <View key={k as string} style={{ flex: 1, minWidth: 0, backgroundColor: C.card, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>
                  <Txt v="small" lines={1}>{k}</Txt>
                  <Txt v="num" lines={1} style={{ marginTop: 2 }}>{fmtUsd(v as number)}</Txt>
                </View>
              ))}
            </Row>
          ) : null}
          {err ? <ErrorLine msg={err} /> : null}

          {/* the goal */}
          <Pressable onPress={() => setPanel('goal')} accessibilityRole="button" accessibilityLabel={goal > 0 ? 'Change your goal' : 'Set a goal'}
            style={({ pressed }) => ({ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: pressed ? C.s1 : C.card, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            <Disc size={44}><Target size={20} /></Disc>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="label" lines={1}>{goal > 0 ? (s?.goalName || 'My goal') : 'Set a goal'}</Txt>
              {goal > 0 ? (
                <>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: C.s2, overflow: 'hidden', marginTop: 7 }}><View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: C.brand, borderRadius: 3 }} /></View>
                  <Txt v="small" lines={1} style={{ marginTop: 4 }}>{fmtUsd(s?.balance ?? 0)} of {fmtUsd(goal)} · {Math.round(pct * 100)}%</Txt>
                </>
              ) : <Txt v="small" lines={1} style={{ marginTop: 1 }}>A phone, a trip, a rainy day.</Txt>}
            </View>
            <Txt v="label" color={C.dim}>›</Txt>
          </Pressable>

          {/* stocks */}
          <Row style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 4 }}>
            <Txt v="h2">Stocks</Txt>
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
                <Pressable onPress={() => router.push(`/stock/${st.symbol}` as never)} accessibilityRole="button" accessibilityLabel={st.name} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Image source={STOCK_ART[st.symbol]} style={{ width: 38, height: 38, borderRadius: 19 }} contentFit="cover" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>{st.name}</Txt>
                  <Txt v="small" lines={1} style={{ marginTop: 1 }}>{held ? `${pos!.shares.toFixed(4)} ${st.symbol}` : st.symbol} · {price ? fmtUsd(price) : '…'}</Txt>
                </View>
                </Pressable>
                {held ? (
                  <Pressable onPress={() => setSell(st)} accessibilityRole="button" accessibilityLabel={`Sell ${st.name}`} style={{ alignItems: 'flex-end', marginRight: 2 }}>
                    <Txt v="num">{fmtUsd(value)}</Txt>
                    <Txt v="small" color={profit >= 0 ? C.up : C.down} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>{profit >= 0 ? '+' : '−'}{fmtUsd(Math.abs(profit))}</Txt>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setAmt({ kind: 'buy', st })} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Buy ${st.name}`} hitSlop={6}
                  style={({ pressed }) => ({ paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: C.s2, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                  <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Buy</Txt>
                </Pressable>
              </Row>
            );
          })}

          {/* automatic saving and your limits */}
          <Txt v="h2" style={{ marginTop: 28, marginBottom: 10 }}>On autopilot</Txt>
          <View style={{ backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', paddingVertical: 4 }}>
            <SetRow icon={<Jar size={19} color={C.ink} />} title="Round-ups" value={(prof?.roundupStep ?? 0) > 0 ? `To next $${prof!.roundupStep}` : 'Off'} onPress={() => setPanel('roundup')} />
            <SetRow icon={<ArrowUp size={19} color={C.ink} />} title="Pay someone" value="Rounds up" onPress={() => setPanel('pay')} />
            <SetRow icon={<Crown size={19} color={C.ink} />} title="Save from wins" value={(prof?.saveBps ?? 0) > 0 ? `${prof!.saveBps / 100}% of each win` : 'Off'} onPress={() => setPanel('wins')} />
          </View>
          <Txt v="h2" style={{ marginTop: 28 }}>Your limits</Txt>
          <Txt v="small" style={{ marginTop: 2, marginBottom: 10 }}>Enforced by the Clashy program on every stake.</Txt>
          <View style={{ backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', paddingVertical: 4 }}>
            <SetRow icon={<Shield size={19} color={C.ink} />} title="Daily stake limit" value={prof ? `${fmtUsd(prof.dailyLimit)} · ${fmtUsd(stakedToday)} used` : '…'} onPress={() => setPanel('limit')} />
            <SetRow icon={<Moon size={19} />} title="Take a break" value={prof && prof.breakUntil > now ? `Until ${new Date(prof.breakUntil * 1000).toLocaleDateString()}` : 'Off'} onPress={() => setPanel('break')} />
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
        art={amt?.st ? <Image source={STOCK_ART[amt.st.symbol]} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" /> : undefined} min={1} max={(s?.balance ?? 0) + (bal ?? 0)} presets={[5, 10, 25]}
        confirm={(n) => `Buy $${n.toFixed(2)} of ${amt?.st?.symbol ?? ''}`} success={`You own more ${amt?.st?.name ?? ''}`} successSub="Real tokenized shares, bought through Orca, now in your own wallet."
        onConfirm={async (n) => { if (amt?.st) { await buyNow(amt.st, n); after(); } }} />
      <Sheet open={panel === 'goal'} onClose={() => setPanel(null)} title={goal > 0 ? 'Change your goal' : 'Set a goal'}>
        <TextInput value={goalName} onChangeText={setGoalName} placeholder={s?.goalName || 'What for? A new phone'} placeholderTextColor={C.muted} maxLength={24} style={field} />
        <TextInput value={goalAmt} onChangeText={setGoalAmt} placeholder={goal > 0 ? `${goal} USDC` : 'How much? 200'} placeholderTextColor={C.muted} keyboardType="decimal-pad" style={[field, { marginTop: 8 }]} />
        <Row style={{ gap: 8, marginTop: 8 }}>{[50, 200, 500, 1000].map((n) => <Opt key={n} label={`$${n}`} on={goalAmt === String(n)} onPress={() => setGoalAmt(String(n))} />)}</Row>
        {err ? <ErrorLine msg={err} /> : null}
        <Btn title={busy === 'goal' ? 'Saving…' : 'Save goal'} style={{ marginTop: 14 }} disabled={!!busy || !goalAmt} onPress={async () => { await setGoal(); }} />
      </Sheet>
      <Sheet open={panel === 'roundup'} onClose={() => setPanel(null)} title="Round-ups">
        <Txt v="small" style={{ marginBottom: 12 }}>The change from each payment lands in your Stash, in the same transaction.</Txt>
        {[0, 1, 5].map((n) => <Choice key={n} title={n === 0 ? 'Off' : `Round up to the next $${n}`} line={n === 0 ? 'Pay the exact amount' : `Pay $3.40 and $${(n - 3.4 % n).toFixed(2)} is saved`} on={(prof?.roundupStep ?? 0) === n} busy={busy === 'limits'} onPress={setControls({ roundup: n })} />)}
      </Sheet>
      <Sheet open={panel === 'wins'} onClose={() => setPanel(null)} title="Save from wins">
        <Txt v="small" style={{ marginBottom: 12 }}>This share of each clash win goes straight to your Stash.</Txt>
        {[0, 1000, 2500, 5000].map((b) => <Choice key={b} title={b === 0 ? 'Off' : `${b / 100}% of every win`} line={b === 0 ? 'Winnings stay in your wallet' : `Win $9.70 and $${(9.7 * b / 10_000).toFixed(2)} is saved`} on={(prof?.saveBps ?? 0) === b} busy={busy === 'limits'} onPress={setControls({ saveBps: b })} />)}
      </Sheet>
      <Sheet open={panel === 'limit'} onClose={() => setPanel(null)} title="Daily stake limit">
        <Txt v="small" style={{ marginBottom: 12 }}>The most you can put into games in a day. Lowering applies now; raising waits 24 hours.{prof?.pendingAt ? ` Raise to ${fmtUsd(prof.pendingLimit)} applies ${new Date(prof.pendingAt * 1000).toLocaleString()}.` : ''}</Txt>
        {[10, 25, 50, 100].map((n) => <Choice key={n} title={`$${n} a day`} line={prof && n < prof.dailyLimit ? 'Applies now' : prof && n > prof.dailyLimit ? 'Applies in 24 hours' : 'Your limit'} on={prof?.dailyLimit === n} busy={busy === 'limits'} onPress={setControls({ limit: n })} />)}
      </Sheet>
      <Sheet open={panel === 'break'} onClose={() => setPanel(null)} title="Take a break">
        <Txt v="small" style={{ marginBottom: 12 }}>Stops every stake until it ends; it can't be shortened. Saving and stocks stay open.</Txt>
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
                <Image source={STOCK_ART[sell.symbol]} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" />
                <View style={{ marginTop: 8 }}><Money value={value} size={34} /></View>
                <Txt v="small">{pos?.shares.toFixed(4)} {sell.symbol} · paid {fmtUsd(pos?.cost ?? 0)}</Txt>
              </View>
              {err ? <ErrorLine msg={err} /> : null}
              <Btn title={busy === `sell${sell.symbol}` ? 'Selling…' : 'Sell all into the Stash'} kind="ghost" h={52} style={{ marginTop: 16 }} disabled={!!busy || !pos} onPress={async () => { if (pos) { await sellAll(sell, pos.shares)(); setSell(null); } }} />
              <Txt v="small" style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: C.dim }}>Sold through Orca at the pool price, into your Stash.</Txt>
            </>
          );
        })() : null}
      </Sheet>
      <Sheet open={pickStock} onClose={() => setPickStock(false)} title="Invest in">
        {STOCKS.map((st) => (
          <SheetTile key={st.symbol} art={<Image source={STOCK_ART[st.symbol]} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />} title={st.name} line={`${st.symbol} · ${px[st.symbol] ? fmtUsd(px[st.symbol]) : '…'}`}
            onPress={() => { setPickStock(false); setTimeout(() => setAmt({ kind: 'buy', st }), 260); }} />
        ))}
      </Sheet>
    </ScrollView>
  );
}
