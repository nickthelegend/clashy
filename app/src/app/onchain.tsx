// On-chain knockout duel: the real `clashy` program on Solana + a MagicBlock Ephemeral Rollup.
// Two devices (or two browser tabs) are two real players. Every step is a signed transaction; the strip at
// the bottom shows each signature, which layer it ran on, how long it took, and an explorer link.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BN, COIN_SYMBOLS, DUEL_STATUS, NET, P, USDC, USDC_MINT, fmtUsdc, openDuels, priceOf, random32, readDuel, sha256, usdcAta, type DuelView, PublicKey,
} from '@/chain/client';
import { reader } from '@/chain/reads';
import { TxStrip, WalletCard, errText, short, useChain } from '@/chain/useChain';
import { ClayLoop } from '@/ui/clay';
import { FX, Fill, Hit } from '@/ui/fx';
import { WinExtras } from '@/ui/result';
import { Sheet } from '@/ui/sheet';
import { ProfileAvatar } from '@/ui/feed';
import { useProfiles } from '@/chain/social';
import { Taunts } from '@/ui/taunts';
import { CallButtons, CoinRoll, CoinToken, FaceOff, LiveBoard, ModeRow, OpenClash, PERPS_LEVERAGE, Searching, clashLev, coinName, perpsNonce, symbolsIn } from '@/ui/clash';
import { Lottie } from '@/ui/lottie';
import { ART, BackBtn, Btn, ErrorLine, LiveChart, LiveDot, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, FONT, S } from '@/ui/tokens';

type Secrets = { seed: number[]; salt?: number[]; side?: number; lev?: number };
/** The program's DUEL_SETUP_SECS: after this a matched duel that never reached the rollup can be aborted. */
const DUEL_SETUP_SECS = 600;
/** Each player's stake, in USDC. */
const STAKE_USDC = 5;
/** Three kinds of clash: a 60 s call on crypto, a slow one-hour call on a real stock (both without leverage), or perps:
 *  60 s on crypto with leverage, where a side that loses its whole stake is liquidated and loses on the spot. */
const MODES = {
  crypto: { mask: 0b0000_0111, secs: 60, label: 'Crypto · 60 s', note: 'SOL, BTC or ETH' },
  stocks: { mask: 0b1111_1000, secs: 3600, label: 'Stocks · 1 hour', note: 'NVIDIA, Tesla, Apple, S&P 500 or Alphabet' },
  perps: { mask: 0b0000_0111, secs: 60, label: 'Perps · 60 s', note: 'SOL, BTC or ETH with leverage' },
} as const;
type Mode = keyof typeof MODES;
const isMode = (m: unknown): m is Mode => typeof m === 'string' && m in MODES;
const secretKey = (duel: PublicKey) => `clashy:chain:secret:${duel.toBase58()}`;

export default function OnChainDuel() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(820);
  const chain = useChain(['Check duel']);
  // the Arena drawer links here as /clash?mode=perps (or stocks / crypto)
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(isMode(params.mode) ? params.mode : 'crypto');
  useEffect(() => { if (isMode(params.mode)) setMode(params.mode); }, [params.mode]);
  const [lev, setLev] = useState<number>(10);
  /** Arriving from the game picker (a ?mode= link) means "start a new one": a remembered clash that already
   *  ended (settled or cancelled) gives way to the lobby once, instead of showing its old result. */
  const freshFromPicker = useRef(!!params.mode);
  const [stake, setStake] = useState(STAKE_USDC);
  const { me: wallet, sponsor, progs, bal, hasPlayer, txs, err, setErr, busy, guard, onBase, onEr } = chain;
  const [board, setBoard] = useState<DuelView[]>([]);
  const [boardErr, setBoardErr] = useState<string>();
  const [active, setActive] = useState<PublicKey | null>(null);
  const [duel, setDuel] = useState<DuelView | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const inflight = useRef(new Set<string>());
  /** When this device first saw the duel matched (for the VRF fallback timer). */
  const matchedAt = useRef<number | null>(null);
  /** When this device first saw the finished duel back on Solana (the joiner's settle backup timer). */
  const homeAt = useRef<number | null>(null);
  /** When this device first saw the duel in its current step; the joiner steps in if the creator stalls there. */
  const stepSeen = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const [vrf, setVrf] = useState<{ queue: PublicKey; required: boolean } | null>(null);
  const [proof, setProof] = useState(false);
  /** Prices seen while the clash is live, for the chart. */
  const [hist, setHist] = useState<number[]>([]);
  const { width: winW } = useWindowDimensions();
  const profiles = useProfiles();
  const names = profiles.status === 'ready' ? profiles.data : new Map();
  /** The roll lands for a beat before the call buttons take over. */
  const [rolledSeen, setRolledSeen] = useState(false);

  // the challenge board
  // the board is public: shown whether or not this device has signed in
  useEffect(() => {
    const rp = progs?.base ?? reader;
    let alive = true;
    const tick = async () => {
      try { const b = await openDuels(rp); if (alive) { setBoard(b); setBoardErr(undefined); } }
      catch (e) { if (alive) setBoardErr(`Cannot read the challenge board: ${errText(e)}`); }
    };
    tick();
    const h = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(h); };
  }, [progs]);
  useEffect(() => { AsyncStorage.getItem('clashy:chain:active').then((v) => v && setActive(new PublicKey(v))).catch(() => {}); }, []);

  // the active duel's state machine, polled every second
  useEffect(() => {
    if (!active || !progs || !wallet || !sponsor) return;
    let alive = true;
    const step = async () => {
      const d = await readDuel(progs.base, active).catch(() => null);
      if (!alive || !d) return;
      setDuel(d);
      if (d.coin < 8) setPrice(await priceOf(progs.base, d.coin).catch(() => null));
      const me = d.creator.equals(wallet) ? 0 : d.joiner.equals(wallet) ? 1 : -1;
      // a duel remembered on this device from another wallet (signed in as someone else): not ours to show
      if (me < 0) { setActiveDuel(null); return; }
      const raw = await AsyncStorage.getItem(secretKey(active));
      const sec: Secrets | null = raw ? JSON.parse(raw) : null;
      const stepKey = `${d.status}:${d.picksRevealed}:${d.onEr}:${d.vrfPending}`;
      if (stepSeen.current.key !== stepKey) stepSeen.current = { key: stepKey, at: Date.now() };
      // the creator's device drives each step; if it stalls 8 s (closed tab, lost connection), the joiner's device does it
      const driver = me === 0 || Date.now() - stepSeen.current.at > 8_000;
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
        if (driver && !d.vrfPending) {
          await once('vrf', () => onBase('Request VRF roll', () => progs.base.methods.requestCoinRoll([...random32()]).accountsPartial({ player: wallet, payer: sponsor, duel: active, oracleQueue: cfg.queue }).rpc()));
        }
        if (!cfg.required && sec && !(d.seedsRevealed & (1 << me)) && Date.now() - matchedAt.current > 15_000) {
          await once(`seed-${me}`, () => onBase('Reveal roll seed (VRF fallback)', () => progs.base.methods.revealSeed(sec.seed).accountsPartial({ signer: wallet, duel: active }).rpc()));
        }
      } else {
        matchedAt.current = null;
      }
      // ROLLED: once both picks are committed, reveal mine
      if (d.status === 2 && sec?.salt && d.picksCommitted === 0b11 && !(d.picksRevealed & (1 << me))) {
        await once(`reveal-${me}`, () => onBase('Reveal sealed pick', () => progs.base.methods.revealPick(sec.side!, sec.lev!, sec.salt!).accountsPartial({ signer: wallet, duel: active }).rpc()));
      }
      // both revealed: the creator hands the duel to the rollup, then starts it there
      if (d.status === 2 && d.picksRevealed === 0b11 && driver && !d.onEr) {
        await once('delegate', () => onBase('Delegate duel to the rollup', () => progs.base.methods.delegateDuel(d.creator, new BN(d.nonce)).accountsPartial({ player: wallet, payer: sponsor, duel: active }).remainingAccounts([{ pubkey: NET.erValidator, isSigner: false, isWritable: false }]).rpc()));
      }
      if (d.status === 2 && d.picksRevealed === 0b11 && driver && d.onEr) {
        await once('start', () => onEr('Start duel on the rollup', progs.er.methods.startDuel().accountsPartial({ signer: wallet, duel: active, price: P.feed(d.coin) })));
      }
      // LIVE: both devices ask for a check every 2 s (idempotent, signed by the sponsor alone); the finishing check commits and undelegates
      // the creator's device checks; at the bell the joiner's checks too, so neither side alone picks the closing moment
      // (audit H1; the full fix, a price sampled at the bell, is in docs/AUDIT.md)
      const backup = me === 1 && Date.now() / 1000 >= d.startTs + d.lenSecs;
      // nobody could finish it two minutes after the bell (prices stopped, the keeper is down): void it, both stakes come back
      if (d.status === 3 && d.onEr && Date.now() / 1000 > d.startTs + d.lenSecs + 120) {
        await once('void', () => onEr('Refund a stuck duel', progs.er.methods.voidDuel().accountsPartial({ payer: sponsor, duel: active })));
      }
      if (d.status === 3 && d.onEr && (me === 0 || backup) && Date.now() % 2000 < 1000) {
        await onEr('Check duel', progs.er.methods.checkDuel().accountsPartial({ payer: sponsor, duel: active, price: P.feed(d.coin) })).catch((e) => setErr(`Checking the duel failed: ${errText(e)}`));
      }
      // FINISHED and home on Solana: either player settles
      // FINISHED and home: the creator settles; the joiner settles only if it is still unsettled 6 s later
      if (d.status === 4 && !d.onEr) homeAt.current ??= Date.now(); else homeAt.current = null;
      if (d.status === 4 && !d.onEr && (me === 0 || Date.now() - (homeAt.current ?? Date.now()) > 6000)) {
        await once('settle', () => onBase('Settle on Solana', async () => {
          const cfg = await progs.base.account.config.fetch(P.config);
          return progs.base.methods.settleDuel().accountsPartial({ duel: active, vault: P.vault(active), creatorUsdc: usdcAta(d.creator), joinerUsdc: usdcAta(d.joiner), creatorPlayer: P.player(d.creator), joinerPlayer: P.player(d.joiner), treasury: cfg.treasury, rentPayer: sponsor }).rpc();
        }));
      }
    };
    step();
    const h = setInterval(step, 1000);
    return () => { alive = false; clearInterval(h); };
  }, [active, wallet, sponsor, progs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!duel || duel.status !== 3 || price === null) { if (!duel || duel.status < 3) setHist([]); return; }
    setHist((h) => (h[h.length - 1] === price ? h : [...h, price].slice(-240)));
  }, [price, duel?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!duel || duel.status !== 2) { if (!duel || duel.status < 2) setRolledSeen(false); return; }
    if (rolledSeen) return;
    const h = setTimeout(() => setRolledSeen(true), 1800);
    return () => clearTimeout(h);
  }, [duel?.status, duel?.key.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveDuel = async (key: PublicKey | null) => {
    setActive(key); setDuel(null); inflight.current.clear();
    if (key) await AsyncStorage.setItem('clashy:chain:active', key.toBase58()); else await AsyncStorage.removeItem('clashy:chain:active');
  };
  useEffect(() => {
    if (!freshFromPicker.current || !duel) return;
    freshFromPicker.current = false;
    if (duel.status >= 5) setActiveDuel(null);
  }, [duel?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = guard('open', async () => {
    if (!progs || !wallet || !sponsor) return;
    // a perps clash carries its leverage in the nonce, so the board and the joiner see it before anyone picks
    const nonce = mode === 'perps' ? perpsNonce(lev) : Date.now();
    const key = P.duel(wallet, nonce);
    const seed = random32();
    await AsyncStorage.setItem(secretKey(key), JSON.stringify({ seed: [...seed] } satisfies Secrets));
    const seedHash = [...(await sha256(seed))];
    await onBase('Open duel · escrow USDC stake', () => progs.base.methods.openDuel(new BN(nonce), new BN(stake * USDC), MODES[mode].mask, MODES[mode].secs, new BN(900), seedHash)
      .accountsPartial({ creator: wallet, payer: sponsor, duel: key, vault: P.vault(key), creatorUsdc: usdcAta(wallet), usdcMint: USDC_MINT }).rpc());
    await setActiveDuel(key);
  });
  const join = (d: DuelView) => guard('join', async () => {
    if (!progs || !wallet) return;
    const seed = random32();
    await AsyncStorage.setItem(secretKey(d.key), JSON.stringify({ seed: [...seed] } satisfies Secrets));
    await onBase('Join duel · escrow USDC stake', async () => progs.base.methods.joinDuel([...(await sha256(seed))]).accountsPartial({ joiner: wallet, duel: d.key, vault: P.vault(d.key), joinerUsdc: usdcAta(wallet) }).rpc());
    await setActiveDuel(d.key);
  })();
  const pick = (side: 1 | 2, lev: number) => guard('pick', async () => {
    if (!progs || !wallet || !active) return;
    const raw = await AsyncStorage.getItem(secretKey(active));
    const sec: Secrets = raw ? JSON.parse(raw) : { seed: [] };
    const salt = random32();
    // the program binds the hash to this duel and this player, so a rival cannot copy it
    const hash = await sha256(active.toBytes(), wallet.toBytes(), new Uint8Array([side]), new Uint8Array(new Uint16Array([lev]).buffer), salt);
    await AsyncStorage.setItem(secretKey(active), JSON.stringify({ ...sec, salt: [...salt], side, lev } satisfies Secrets));
    await onBase('Commit sealed pick', () => progs.base.methods.commitPick([...hash]).accountsPartial({ signer: wallet, duel: active }).rpc());
  })();
  const cancel = guard('cancel', async () => {
    if (!progs || !wallet || !active || !sponsor) return;
    await onBase('Cancel · refund USDC stake', () => progs.base.methods.cancelDuel().accountsPartial({ signer: wallet, duel: active, vault: P.vault(active), creatorUsdc: usdcAta(wallet), rentPayer: sponsor }).rpc());
    await setActiveDuel(null);
  });
  // a matched duel that never reaches the rollup can be aborted by anyone after the program's 10 min setup window:
  // both stakes refunded (or, if only one player revealed after both locked, that player takes the pot)
  const abort = guard('abort', async () => {
    if (!progs || !duel || !sponsor) return;
    const cfg = await progs.base.account.config.fetch(P.config);
    await onBase('Abort the stuck duel · refund', () => progs.base.methods.abortDuel().accountsPartial({
      duel: duel.key, vault: P.vault(duel.key), creatorUsdc: usdcAta(duel.creator), joinerUsdc: usdcAta(duel.joiner), treasury: cfg.treasury, rentPayer: sponsor,
    }).rpc());
  });
  // +3 s: the program needs its own clock strictly past the window, and the chain's clock can trail this device's by a second or two
  const setupLeft = duel && (duel.status === 1 || duel.status === 2) && !duel.onEr ? duel.matchedAt + DUEL_SETUP_SECS + 3 - Date.now() / 1000 : null;
  const me = duel && wallet ? (duel.creator.equals(wallet) ? 0 : duel.joiner.equals(wallet) ? 1 : -1) : -1;
  const sym = duel && duel.coin < 3 ? COIN_SYMBOLS[duel.coin] : '…';
  const ready = hasPlayer && (bal ?? 0) >= stake;
  const myPnl = duel && me >= 0 ? duel.pnlBps[me] / 100 : 0;
  const theirPnl = duel && me >= 0 ? duel.pnlBps[1 - me] / 100 : 0;

  const sym2 = duel ? (COIN_SYMBOLS[duel.coin] ?? '…') : '…';
  const meProf = wallet ? names.get(wallet.toBase58()) : undefined;
  const rivalKey = duel && me >= 0 ? (me === 0 ? duel.joiner : duel.creator) : null;
  const rivalProf = rivalKey && !rivalKey.equals(PublicKey.default) ? names.get(rivalKey.toBase58()) : undefined;
  const left = duel && duel.status === 3 && duel.startTs ? Math.max(0, duel.startTs + duel.lenSecs - Date.now() / 1000) : duel && duel.status === 4 ? 0 : null;
  const won = duel && duel.status === 5 && duel.winner === me + 1;
  const tie = duel && duel.status === 5 && duel.winner === 3;
  const others = board.filter((d) => !wallet || !d.creator.equals(wallet));
  /** The leverage this clash was opened at (1 = a plain clash); both players pick at it. */
  const duelLev = duel ? clashLev(duel.nonce) : 1;
  const perps = duelLev > 1;
  const koMe = !!duel && me >= 0 && !!(duel.ko & (1 << me));
  const koThem = !!duel && me >= 0 && !!(duel.ko & (1 << (1 - me)));
  const pot = (stake * 2 * 0.97).toFixed(2);

  return (
    <View style={{ flex: 1, backgroundColor: '#07070A' }}>
      <ScrollView contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
        <Row style={{ gap: 10, marginBottom: 6 }}>
          <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setProof(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#15151B', borderRadius: 14, paddingHorizontal: 12, height: 34 }}>
            <LiveDot color={C.up} /><Txt v="small" color={C.ink} style={{ ...FONT.semi }}>{bal === null ? 'Wallet' : `${bal.toFixed(2)} USDC`}</Txt>
          </Pressable>
        </Row>
        {err ? <ErrorLine msg={err} /> : null}

        {!active || !duel || duel.status >= 5 ? (
          <>
            {duel && duel.status === 5 ? (
              <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', paddingTop: 6 }}>
                <View>
                  <ClayLoop name={won ? 'win' : tie ? 'duel' : 'ko'} size={170} loop={!!won} style={{ borderRadius: 36 }} />
                  {won ? <Lottie name="confetti" size={300} style={{ position: 'absolute', left: -65, top: -70 }} /> : null}
                </View>
                <Text style={{ ...FONT.bold, fontSize: 38, letterSpacing: -1.2, color: won ? C.up : tie ? C.ink : C.down, marginTop: 8 }}>{won ? 'You won' : koMe && !koThem ? 'Liquidated' : tie ? 'Dead heat' : 'You lost'}</Text>
                {duel.ko ? <Txt v="label" color={koMe && !koThem ? C.down : koThem && !koMe ? C.up : C.ink} style={{ textAlign: 'center' }}>{koMe && koThem ? 'Both sides liquidated' : koMe ? `Liquidated · your ${duel.lev[me]}× position lost its whole stake` : `Liquidated · ${rivalProf?.name ?? 'your rival'} lost it all at ${duel.lev[1 - me]}×`}</Txt> : null}
                <Text style={{ ...FONT.display, fontSize: 30, color: C.ink }}>{won ? `+${fmtUsdc(duel.stake * 2 - Math.floor((duel.stake * 2 * 300) / 10_000))}` : tie ? `${fmtUsdc(duel.stake)} back` : `−${fmtUsdc(duel.stake)}`}</Text>
                <Txt v="small" style={{ marginTop: 6, textAlign: 'center' }}>{coinName(sym2)} {duel.entryPrice.toFixed(2)} → {duel.exitPrice.toFixed(2)} · you {koMe ? 'liquidated' : `${myPnl >= 0 ? '+' : ''}${myPnl.toFixed(2)}%`}{duel.lev[me] > 1 ? ` at ${duel.lev[me]}×` : ''} · {rivalProf?.name ?? 'rival'} {koThem ? 'liquidated' : `${theirPnl >= 0 ? '+' : ''}${theirPnl.toFixed(2)}%`}{duel.lev[1 - me] > 1 ? ` at ${duel.lev[1 - me]}×` : ''}</Txt>
                {won && active ? <WinExtras chain={chain} duel={active} winnings={(duel.stake * 2 - Math.floor((duel.stake * 2 * 300) / 10_000)) / USDC} /> : null}
                <Btn title="Clash again" kind="white" h={56} style={{ marginTop: 14, alignSelf: 'stretch', borderRadius: 20 }} onPress={() => setActiveDuel(null)} />
              </Animated.View>
            ) : duel && duel.status === 6 ? (
              <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', backgroundColor: '#15151B', borderRadius: 26, padding: 18, marginBottom: 6 }}>
                <Image source={ART.stash} style={{ width: 90, height: 90 }} contentFit="contain" />
                <Text style={{ ...FONT.display, fontSize: 26, color: C.ink, marginTop: 6 }}>{fmtUsdc(duel.stake)} IS BACK</Text>
                <Txt v="small" style={{ textAlign: 'center', marginTop: 4 }}>{duel.joiner.equals(PublicKey.default) ? 'Nobody took your clash in time, so your stake went straight back to your wallet.' : 'The clash never got going, so both stakes went back. No one lost a cent.'}</Txt>
                <Btn title="Find another rival" kind="white" style={{ marginTop: 12, alignSelf: 'stretch' }} onPress={() => setActiveDuel(null)} />
              </Animated.View>
            ) : null}

            {!duel || duel.status === 6 || !active ? (
              <>
                <Animated.View entering={FadeInDown.duration(320)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ ...FONT.bold, fontSize: 34, letterSpacing: -1, color: C.ink }}>Clash</Text>
                    <Txt v="small" style={{ marginTop: 2, lineHeight: 19 }}>One coin, two sealed calls. The better call takes the pot.</Txt>
                  </View>
                  <ClayLoop name="duel" size={92} style={{ borderRadius: 26 }} />
                </Animated.View>

                <Txt v="small" style={{ ...FONT.semi, color: C.dim, marginTop: 22, marginBottom: 8 }}>Pick a game</Txt>
                <View style={{ gap: 8 }}>
                  <ModeRow index={0} title="Crypto" sub="60 seconds · SOL, BTC or ETH, up or down" on={mode === 'crypto'} onPress={() => setMode('crypto')}
                    art={<Row style={{ gap: -14 }}><CoinToken sym="SOL" size={30} /><CoinToken sym="BTC" size={30} /></Row>} />
                  <ModeRow index={1} title="Perps" tag="Up to 50×" sub="60 seconds with leverage · liquidated means out" on={mode === 'perps'} onPress={() => setMode('perps')}
                    art={<Row style={{ gap: -14 }}><CoinToken sym="ETH" size={30} /><CoinToken sym="SOL" size={30} /></Row>} />
                  <ModeRow index={2} title="Stocks" sub="1 hour · NVIDIA, Tesla, Apple, S&P or Alphabet" on={mode === 'stocks'} onPress={() => setMode('stocks')}
                    art={<ClayLoop name="stocks" size={60} />} />
                </View>

                {mode === 'perps' ? (
                  <Animated.View entering={FadeInDown.duration(260)}>
                    <Row style={{ justifyContent: 'space-between', marginTop: 20, marginBottom: 8, gap: 10 }}>
                      <Txt v="small" style={{ ...FONT.semi, color: C.dim }}>Leverage</Txt>
                      <Txt v="small" lines={1} style={{ flexShrink: 1 }}>A {(100 / lev).toFixed(lev >= 25 ? 1 : 0)}% move against you liquidates you</Txt>
                    </Row>
                    <View style={{ flexDirection: 'row', backgroundColor: '#0F0F13', borderRadius: 18, padding: 4, gap: 4 }}>
                      {PERPS_LEVERAGE.map((n) => (
                        <Pressable key={n} onPress={() => setLev(n)} accessibilityRole="button" accessibilityState={{ selected: lev === n }}
                          style={({ pressed }) => ({ flex: 1, height: 42, borderRadius: 14, backgroundColor: lev === n ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                          <Text style={{ ...FONT.semi, fontSize: 15.5, color: lev === n ? '#000' : C.ink }}>{`${n}×`}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </Animated.View>
                ) : null}

                <Row style={{ justifyContent: 'space-between', marginTop: 20, marginBottom: 8, gap: 10 }}>
                  <Txt v="small" style={{ ...FONT.semi, color: C.dim }}>Stake</Txt>
                  <Txt v="small" lines={1} style={{ flexShrink: 1 }}>{bal === null ? 'USDC' : `${bal.toFixed(2)} USDC in your wallet`}</Txt>
                </Row>
                <View style={{ flexDirection: 'row', backgroundColor: '#0F0F13', borderRadius: 18, padding: 4, gap: 4 }}>
                  {[5, 10, 25].map((n) => (
                    <Pressable key={n} onPress={() => setStake(n)} accessibilityRole="button" accessibilityState={{ selected: stake === n }}
                      style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 14, backgroundColor: stake === n ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                      <Text style={{ ...FONT.semi, fontSize: 18, color: stake === n ? '#000' : C.ink }}>${n}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ marginTop: 12, backgroundColor: '#0F0F13', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
                  <Row style={{ justifyContent: 'space-between' }}><Txt v="small">You put in</Txt><Txt v="label" style={{ fontVariant: ['tabular-nums'] }}>{stake.toFixed(2)} USDC</Txt></Row>
                  <Row style={{ justifyContent: 'space-between' }}><Txt v="small">Winner takes</Txt><Txt v="label" color={C.up} style={{ fontVariant: ['tabular-nums'] }}>{pot} USDC</Txt></Row>
                  <Row style={{ justifyContent: 'space-between' }}><Txt v="small">Dead heat or no rival</Txt><Txt v="small" color={C.ink}>Your stake comes back</Txt></Row>
                </View>

                <Pressable onPress={ready ? open : () => setProof(true)} disabled={!!busy} accessibilityRole="button"
                  style={({ pressed }) => ({ marginTop: 14, height: 62, borderRadius: 31, backgroundColor: C.opp, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }], shadowColor: C.opp, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } })}>
                  <Text style={{ ...FONT.bold, fontSize: 20, color: '#fff' }}>{busy === 'open' ? 'Opening…' : ready ? (mode === 'perps' ? `Find a rival · $${stake} at ${lev}×` : `Find a rival · $${stake}`) : 'Set up your wallet'}</Text>
                </Pressable>
                <Txt v="small" style={{ textAlign: 'center', marginTop: 8, lineHeight: 18 }}>{mode === 'perps' ? `You both go long or short at ${lev}×, sealed until you both lock. Best return wins; liquidated loses on the spot.` : 'Your call is sealed until both of you lock. Best call wins.'}</Txt>

                <Row style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 10 }}>
                  <Text style={{ ...FONT.bold, fontSize: 20, color: C.ink }}>Open clashes</Text>
                  <Txt v="small">{others.length} waiting</Txt>
                </Row>
                {boardErr ? <ErrorLine msg={boardErr} /> : null}
                {others.length === 0 ? (
                  <View style={{ alignItems: 'center', backgroundColor: '#15151B', borderRadius: 22, padding: 18 }}>
                    <Image source={ART.bellArt} style={{ width: 70, height: 70 }} contentFit="contain" />
                    <Txt v="small" style={{ textAlign: 'center', marginTop: 6 }}>No open clashes right now. Start one and the first rival in takes you on.</Txt>
                  </View>
                ) : others.map((d) => (
                  <OpenClash key={d.key.toBase58()} who={names.get(d.creator.toBase58())} stake={d.stake / USDC} secs={d.lenSecs} mask={d.poolMask ?? 0b111} lev={clashLev(d.nonce)} disabled={!ready || !!busy} onJoin={() => join(d)} />
                ))}
              </>
            ) : null}
          </>
        ) : (
          <Animated.View entering={FadeInDown.springify()} style={{ marginTop: 6 }}>
            {duel.status === 0 ? (
              <View style={{ alignItems: 'center' }}>
                <Searching><View style={{ borderRadius: 70, borderWidth: 4, borderColor: C.brand, padding: 3 }}><ProfileAvatar p={meProf} size={110} /></View></Searching>
                <Text style={{ ...FONT.display, fontSize: 36, color: C.ink, marginTop: 34 }}>Finding a rival</Text>
                <Txt v="small" style={{ textAlign: 'center' }}>Your {fmtUsdc(duel.stake)} is in escrow on Solana. The first player to join takes you on.</Txt>
                {me === 0 ? <Pressable onPress={cancel} disabled={!!busy} style={{ marginTop: 18 }}><Txt v="label" color={C.muted}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel and get it back'}</Txt></Pressable> : null}
              </View>
            ) : duel.status === 1 || (duel.status === 2 && !rolledSeen) ? (
              <View style={{ alignItems: 'center' }}>
                <FaceOff me={meProf} rival={rivalProf ?? undefined} meLabel={meProf?.name ?? 'You'} rivalLabel={rivalProf?.name ?? 'Rival'} />
                <View style={{ height: 22 }} />
                <CoinRoll pool={symbolsIn(duel.poolMask ?? 0b111)} landed={duel.status === 2 ? sym2 : null} />
              </View>
            ) : duel.status === 2 ? (
              <View style={{ alignItems: 'center' }}>
                <CoinToken sym={sym2} size={130} />
                <Text style={{ ...FONT.bold, fontSize: 38, letterSpacing: -1.2, color: C.ink, marginTop: 8 }}>{coinName(sym2)}</Text>
                <Txt v="small" style={{ textAlign: 'center' }}>{perps ? `Long or short at ${duelLev}× for ${duel.lenSecs} seconds. A ${(100 / duelLev).toFixed(duelLev >= 25 ? 1 : 0)}% move against you and you're liquidated.` : duel.lenSecs >= 3600 ? 'Where is it in 1 hour?' : `Where is it in ${duel.lenSecs} seconds?`}</Txt>
                <View style={{ alignSelf: 'stretch', marginTop: 20 }}>
                  {me >= 0 && !(duel.picksCommitted & (1 << me)) ? <CallButtons onUp={() => pick(1, duelLev)} onDown={() => pick(2, duelLev)} disabled={!!busy} {...(perps ? { upLabel: 'Long', downLabel: 'Short' } : {})} /> : (
                    <View style={{ alignItems: 'center', backgroundColor: '#15151B', borderRadius: 24, padding: 18 }}>
                      <Text style={{ ...FONT.display, fontSize: 28, color: C.ink }}>🔒 Locked</Text>
                      <Txt v="small" style={{ marginTop: 4, textAlign: 'center' }}>{duel.picksCommitted === 0b11 ? (duel.picksRevealed === 0b11 ? 'Both calls in. Going live…' : 'Both calls in. Revealing…') : `Sealed. Waiting for ${rivalProf?.name ?? 'your rival'} to call it…`}</Txt>
                    </View>
                  )}
                </View>
                <View style={{ alignSelf: 'stretch', marginTop: 26, backgroundColor: '#0E0E13', borderRadius: 26, paddingVertical: 18 }}>
                  <FaceOff me={meProf} rival={rivalProf} meLabel={meProf?.name ?? 'You'} rivalLabel={rivalProf?.name ?? 'Rival'} size={60} />
                  <Txt v="small" style={{ textAlign: 'center', marginTop: 12 }}>Winner takes {fmtUsdc(duel.stake * 2 - Math.floor((duel.stake * 2 * 300) / 10_000))}. Calls stay sealed until you both lock.</Txt>
                </View>
              </View>
            ) : (
              <>
                <LiveBoard me={meProf} rival={rivalProf} myPnl={myPnl} theirPnl={theirPnl} myCall={duel.side[me]} theirCall={duel.side[1 - me]} sym={sym2} price={price} entry={duel.entryPrice} left={left} onRollup={duel.status === 3}
                  perps={perps || duel.lev.some((l) => l > 1) ? { myLev: duel.lev[me] || duelLev, theirLev: duel.lev[1 - me] || duelLev, myKo: koMe, theirKo: koThem } : undefined} />
                {duel.status === 3 || duel.status === 4 ? <Taunts rival={rivalKey && !rivalKey.equals(PublicKey.default) ? rivalKey : null} since={duel.startTs || duel.matchedAt} rivalName={rivalProf?.name ?? 'your rival'} /> : null}
                {price !== null ? (
                  <View style={{ marginTop: 18, backgroundColor: '#0E0E13', borderRadius: 24, paddingVertical: 10, overflow: 'hidden' }}>
                    <LiveChart data={[duel.entryPrice, ...hist, price]} w={Math.min(winW, 820) - 2 * S.gutter} h={230} refLine={duel.entryPrice} refLabel="start" color={myPnl >= theirPnl ? C.brand : C.opp} />
                  </View>
                ) : null}
              </>
            )}
            {setupLeft !== null && setupLeft < DUEL_SETUP_SECS - 30 ? (
              setupLeft <= 0
                ? <Btn title={busy === 'abort' ? 'Getting your money back…' : `${rivalProf?.name ?? 'Your rival'} went quiet · get your ${STAKE_USDC} USDC back`} kind="white" style={{ marginTop: 18 }} disabled={!!busy} onPress={abort} />
                : <Txt v="small" style={{ marginTop: 14, textAlign: 'center' }}>If it never starts, your money comes back: unlocks in {Math.floor(setupLeft / 60)}:{String(Math.floor(setupLeft % 60)).padStart(2, '0')}.</Txt>
            ) : null}
            <Hit k={duel.status === 4 && duel.ko ? 1 : 0} src={FX.ko} />
          </Animated.View>
        )}
      </ScrollView>

      <Sheet open={proof} onClose={() => setProof(false)} title="Wallet and on-chain proof">
        <WalletCard chain={chain} note={`${STAKE_USDC} USDC each · 3% rake`} need={STAKE_USDC} />
        <Txt v="small" style={{ marginTop: 10 }}>Every step of a clash is a real transaction: stakes in a Solana escrow, the coin from MagicBlock VRF, the live scoring on a MagicBlock rollup, the payout back on Solana.</Txt>
        <TxStrip txs={txs} />
      </Sheet>
    </View>
  );
}
