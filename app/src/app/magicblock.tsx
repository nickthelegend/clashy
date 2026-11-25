// Live on MagicBlock: where each part of Clashy runs, read from chain every second. Nothing here is a mock: the oracle
// prices are MagicBlock's own feeds on the rollup, the crank counters come from the keeper account the cranks write,
// and every address links to the explorer.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IS_LOCAL_NET, MB, NET, P, PROGRAM_ID, er, feedsOf, priceOf } from '@/chain/client';
import { reader } from '@/chain/reads';
import { CrankBeat } from '@/ui/magicblock';
import { BackBtn, ErrorLine, LiveDot, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, FONT, S } from '@/ui/tokens';

const CARD = '#0E0E13';
const explorer = (addr: string, onEr = false) =>
  `https://explorer.solana.com/address/${addr}?cluster=${IS_LOCAL_NET ? `custom&customUrl=${encodeURIComponent(onEr ? NET.er : NET.base)}` : onEr ? `custom&customUrl=${encodeURIComponent(NET.er)}` : 'devnet'}`;
const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

type Keeper = { ticks: number; finished: number };
type Px = { sym: string; price: number | null; oracle: boolean };

function Card({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(320)} style={{ backgroundColor: CARD, borderRadius: 24, padding: 16, marginTop: 14 }}>
      <Text style={{ ...FONT.semi, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: C.dim, marginBottom: 10 }}>{title}</Text>
      {children}
    </Animated.View>
  );
}

function Line({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <Pressable disabled={!href} onPress={() => href && Linking.openURL(href)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 }}>
      <Txt v="small" style={{ flexShrink: 1 }}>{k}</Txt>
      <Text style={{ ...FONT.semi, fontSize: 14, color: href ? C.brandSoft : C.ink, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{v}</Text>
    </Pressable>
  );
}

export default function LiveOnMagicBlock() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const [keeper, setKeeper] = useState<Keeper | null>(null);
  const [prices, setPrices] = useState<Px[]>([]);
  const [err, setErr] = useState<string>();
  const [cfg, setCfg] = useState<{ validator: string; queue: string; vrfRequired: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [k, c, feeds] = await Promise.all([er.getAccountInfo(P.keeper).catch(() => null), reader.account.config.fetch(P.config), feedsOf(reader)]);
        if (!alive) return;
        if (k) {
          const dv = new DataView(k.data.buffer, k.data.byteOffset, k.data.byteLength);
          setKeeper({ ticks: Number(dv.getBigUint64(9, true)), finished: Number(dv.getBigUint64(17, true)) });
        } else setKeeper(null);
        setCfg({ validator: c.erValidator.toBase58(), queue: c.vrfQueue.toBase58(), vrfRequired: c.vrfRequired });
        const syms = c.coins.slice(0, Math.min(3, c.coinCount)).map((x) => String.fromCharCode(...x.symbol.filter((b: number) => b !== 0)));
        const px = await Promise.all(syms.map(async (sym, i) => {
          const info = await er.getAccountInfo(feeds[i]).catch(() => null);
          return { sym, price: await priceOf(reader, i).catch(() => null), oracle: !!info?.owner.equals(MB.oracle) };
        }));
        if (alive) { setPrices(px); setErr(undefined); }
      } catch (e) { if (alive) setErr(`Cannot read ${NET.label}: ${(e as Error).message}`); }
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(h); };
  }, []);

  const tee = MB.private;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
      <Row style={{ gap: 10, marginBottom: 8 }}>
        <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Row>
      <Text style={{ ...FONT.bold, fontSize: 32, letterSpacing: -1, color: C.ink }}>Live on MagicBlock</Text>
      <Txt v="small" style={{ marginTop: 4 }}>Where every clash runs, read from chain each second on {NET.label}.</Txt>
      {err ? <ErrorLine msg={err} /> : null}

      <Card title="Cranks · the rollup finishes games by itself">
        {keeper ? (
          <>
            <CrankBeat ticks={keeper.ticks} />
            <Line k="Games the keeper sent home and paid" v={String(keeper.finished)} />
            <Line k="Keeper (a program PDA on the rollup)" v={short(P.keeper.toBase58())} href={explorer(P.keeper.toBase58(), true)} />
            <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>Each clash schedules a MagicBlock crank when it starts. It checks the price every second on the rollup; at a knockout or the bell the keeper commits the result to Solana with a Magic Action that pays the winner in the same step.</Txt>
          </>
        ) : <Txt v="small">No keeper on this rollup yet: games are checked by the players' apps and the backup keeper.</Txt>}
      </Card>

      <Card title="Prices · MagicBlock real-time oracle" delay={60}>
        {prices.length === 0 ? <Txt v="small">Loading…</Txt> : prices.map((p) => (
          <Row key={p.sym} style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
            <Row style={{ gap: 8 }}><LiveDot color={p.oracle ? C.brand : C.up} /><Text style={{ ...FONT.semi, fontSize: 15, color: C.ink }}>{p.sym}</Text></Row>
            <Text style={{ ...FONT.semi, fontSize: 15, color: C.ink, fontVariant: ['tabular-nums'] }}>{p.price === null ? '…' : `$${p.price.toLocaleString(undefined, { maximumFractionDigits: p.price > 1000 ? 2 : 4 })}`}</Text>
          </Row>
        ))}
        <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>{prices.some((p) => p.oracle) ? 'Pyth Lazer prices republished on the rollup by MagicBlock every 50 ms. Clashes score and settle against these accounts.' : 'Clashy price feeds pushed to the rollup each second (this rollup has no MagicBlock oracle feeds).'}</Txt>
      </Card>

      <Card title={tee ? 'Private Ephemeral Rollup (TEE)' : 'Ephemeral Rollup'} delay={120}>
        <Line k="Rollup validator" v={cfg ? short(cfg.validator) : '…'} />
        <Line k="Endpoint" v={NET.er.replace(/^https?:\/\//, '').replace(/\?.*$/, '')} />
        <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>{tee ? 'Duels, Royales, the calls feed and squad chat run here with no fees. In a private duel each call is locked inside the TEE, readable only by its player until the clash starts.' : 'Duels, Royales, the calls feed and squad chat run here with no fees.'}</Txt>
      </Card>

      <Card title="Verifiable randomness" delay={180}>
        <Line k="VRF queue" v={cfg ? short(cfg.queue) : '…'} href={cfg ? explorer(cfg.queue) : undefined} />
        <Line k="Only MagicBlock VRF may roll" v={cfg ? (cfg.vrfRequired ? 'Yes' : 'No (local test stack)') : '…'} />
        <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>Every clash and Royale coin is rolled by MagicBlock VRF. Only the VRF program's callback can set it, so neither player can pick the coin.</Txt>
      </Card>

      <Card title="The program" delay={240}>
        <Line k="Clashy on Solana" v={short(PROGRAM_ID.toBase58())} href={explorer(PROGRAM_ID.toBase58())} />
      </Card>
    </ScrollView>
  );
}

