// The game kit, live: /games/kit (Nov 21). Every piece the 150 games are built from, drawn on real prices, real
// candles, real games from the catalog and your own last result, so whoever builds the next game can see what's there
// (docs/GAME-KIT.md lists the same pieces with their props). The examples here move no money.
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePractice } from '@/chain/practice';
import { GAMES } from '@/games/catalog';
import {
  Badge, BalancePill, BigNumber, BotSays, CandleChart, CategoryChips, Choice, Clock, CountUp, GS, GT, GameCard, GameChip, GameHero, Go, Heart, HotCard, InfoChip,
  Logo, MarketChart, MarketHead, MarketTile, Note, Panel, Pill, PotBar, PxChart, ResultCard, Ruler, Sides, Slider, StakeRow, StatLine, StatTile, TINTS, Tag, Waiting,
  WarnBanner, fmtPctUnits, fmtPx, fallbackSigma, evenBand, sigmaOf, tickerOf, useClock, useFeed, useGameCandles, useInfo, usd, type GameApi,
} from '@/games/kit';
import { BackBtn, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, FONT, S } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/games' as Href));
const SYM = 'SOL';
const noop = () => {};

function Section({ title, code, children }: { title: string; code: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 28, gap: 12 }}>
      <View>
        <Txt v="h2" style={{ fontSize: 22 }}>{title}</Txt>
        <Text style={{ ...FONT.semi, fontSize: 12, color: C.dim, marginTop: 2, fontFamily: 'Menlo' }}>{code}</Text>
      </View>
      {children}
    </View>
  );
}

export default function GameKit() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const { width } = useWindowDimensions();
  const w = Math.min(width, 720) - 2 * S.gutter;
  const pr = usePractice();
  const feed = useFeed();
  const { info } = useInfo();
  const [stake, setStake] = useState(10);
  const [cat, setCat] = useState<'all' | 'memes' | 'perps'>('all');
  const [frac, setFrac] = useState(0.35);
  const [sel, setSel] = useState<'up' | 'down' | null>('up');
  const [reveal, setReveal] = useState(false);
  const [endsAt, setEndsAt] = useState(() => Date.now() + 20_000);
  const left = useClock(endsAt);
  useEffect(() => { if (left === 0) setEndsAt(Date.now() + 20_000); }, [left]);
  const candles = useGameCandles([SYM], '1m', 60);

  const def = GAMES.find((x) => x.id === 'tap-grid') ?? GAMES[0]!;
  const g: GameApi = {
    def, feed, info, stake, balance: pr.book?.balance ?? 0, phase: 'setup', busy: false, round: 1, width: w,
    begin: async () => false, end: noop, abandon: noop, fail: noop,
    stakeRow: <StakeRow value={stake} onChange={setStake} balance={pr.book?.balance ?? 0} />,
  };
  const m = feed.mark(SYM);
  const sigma = sigmaOf(feed, SYM, fallbackSigma(SYM));
  const band = m ? evenBand(sigma, 60) : 0;
  const lastRun = (pr.book?.games ?? []).find((x) => x.result && x.result !== 'abandoned');
  const lastDef = lastRun ? GAMES.find((x) => x.id === lastRun.gameId) : undefined;
  const all = candles.data?.[SYM] ?? [];
  const seen = all.slice(0, Math.max(0, all.length - 10)), hidden = all.slice(-10);
  const hot = useMemo(() => GAMES.filter((x) => x.badge).slice(0, 3), []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 60 }, col]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <BackBtn onPress={back} />
        <BalancePill balance={pr.book ? pr.book.balance : null} />
      </Row>
      <Text style={{ ...FONT.displayB, fontSize: 40, letterSpacing: -1.4, color: C.ink, marginTop: 14, lineHeight: 46 }}>Game kit</Text>
      <Txt v="small" style={{ marginTop: 2 }}>Every piece the {GAMES.length} games are built from, live on {tickerOf(SYM)}. One import: <Text style={{ fontFamily: 'Menlo', color: C.ink }}>@/games/kit</Text>. Nothing here moves money.</Txt>

      <Section title="Colours" code="GT · TINTS">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['panel', 'hero', 'raised', 'selected', 'chip', 'pill', 'track', 'gold', 'hot', 'you', 'opp', 'up', 'down'] as const).map((k) => (
            <View key={k} style={{ width: 74, gap: 4 }}>
              <View style={{ height: 40, borderRadius: 12, backgroundColor: GT[k], borderWidth: 1, borderColor: '#2A2A33' }} />
              <Txt v="small" style={{ fontSize: 11 }}>{k}</Txt>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(TINTS).map(([k, v]) => (
            <View key={k} style={{ width: 52, gap: 4, alignItems: 'center' }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: v }} />
              <Txt v="small" style={{ fontSize: 11 }}>{k}</Txt>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Game cards" code="HotCard · GameCard · GameChip · Badge · InfoChip · CategoryChips">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {hot.map((x, i) => <HotCard key={x.id} g={x} i={i} w={Math.min(300, width * 0.74)} />)}
        </ScrollView>
        <Row style={{ gap: 10, alignItems: 'flex-start' }}>
          {GAMES.slice(-2).map((x) => <GameCard key={x.id} g={x} w={(w - 10) / 2} />)}
        </Row>
        <Row style={{ gap: 8, flexWrap: 'wrap' }}>
          <GameChip g={GAMES[0]!} />
          <Badge text="Hot" /><Badge text="New" /><Badge text="Fast" />
          <InfoChip text="30 s" /><InfoChip text="vs Clashy Bot" />
        </Row>
        <CategoryChips value={cat} onChange={setCat} items={[{ key: 'all', label: 'All', n: GAMES.length }, { key: 'memes', label: 'Memes' }, { key: 'perps', label: 'Perps' }]} />
      </Section>

      <Section title="Game hero" code="GameHero · WarnBanner">
        <GameHero def={def} />
        <WarnBanner text="A yellow line for something the player should know, like the US market being closed." />
      </Section>

      <Section title="Markets" code="Logo · MarketHead · MarketTile">
        <Panel style={{ gap: 12 }}>
          <MarketHead g={g} sym={SYM} />
          <Row style={{ gap: 10 }}>
            {['BTC', 'ETH', 'SOL'].map((s) => <Logo key={s} sym={s} info={info} size={44} />)}
            {['NVDA', 'kBONK', 'GOLD'].map((s) => <Logo key={s} sym={s} info={info} size={44} />)}
          </Row>
        </Panel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['BTC', 'ETH', 'SOL'].map((s, i) => <MarketTile key={s} g={g} sym={s} rank={i + 1} selected={s === SYM} onPress={noop} />)}
        </View>
      </Section>

      <Section title="Charts" code="MarketChart · PxChart (levels, band, dots) · CandleChart">
        <Panel><MarketChart g={{ ...g, width: w - 32 }} sym={SYM} h={150} /></Panel>
        <Panel>
          {m ? (
            <PxChart g={{ ...g, width: w - 32 }} sym={SYM} h={190} entry={m.p}
              band={{ lo: m.p * (1 - band), hi: m.p * (1 + band), color: def.tint }}
              levels={[{ p: m.p * (1 + band), color: C.up, label: 'Even-odds band, 60 s' }, { p: m.p * (1 - band), color: C.down }]}
              dots={[{ t: m.t, p: m.p, color: C.brand, label: 'Now' }]} />
          ) : <Waiting text="Waiting for a live price…" />}
        </Panel>
        <Panel style={{ gap: 10 }}>
          {all.length ? <CandleChart seen={seen} hidden={hidden} reveal={reveal} w={w - 32} h={180} tint={def.tint} /> : <Waiting text={candles.error ?? 'Loading real 1-minute candles…'} />}
          <Pill label={reveal ? 'Hide the last 10' : 'Reveal the last 10'} onPress={() => setReveal((r) => !r)} />
        </Panel>
      </Section>

      <Section title="The round" code="Clock · Choice · Go · Pill · StakeRow · BotSays · Note · Waiting">
        <Panel><Clock left={left} total={20} tint={def.tint} label="a 20 s demo clock" /></Panel>
        <Row style={{ gap: 10 }}>
          <Choice title="▲ UP" color={C.up} selected={sel === 'up'} onPress={() => setSel('up')} />
          <Choice title="▼ DOWN" color={C.down} selected={sel === 'down'} onPress={() => setSel('down')} sub="selected: outlined" />
        </Row>
        {g.stakeRow}
        <Go title="Start" sub="the one primary button" onPress={noop} color={def.tint} ink={GT.onTint} />
        <Row style={{ gap: 8 }}><Pill label="Roll again" onPress={noop} /><Pill label="Disabled" onPress={noop} disabled /></Row>
        <BotSays text="Clashy Bot took DOWN." />
        <Note>One grey line, at most, under a decision.</Note>
        <Waiting text="Watching the last minute…" sub="A waiting box, with progress" progress={0.6} tint={def.tint} />
      </Section>

      <Section title="Numbers" code="BigNumber · CountUp · StatTile · StatLine · Tag · Sides · Heart">
        <BigNumber value={fmtPx(m?.p)} color={def.tint} sub={`${tickerOf(SYM)} live`} />
        {m ? <View style={{ alignItems: 'center' }}><CountUp to={m.p} fmt={(v) => fmtPx(v)} color={C.ink} size={30} /></View> : null}
        <Row style={{ gap: 8 }}>
          <StatTile k="Price" v={fmtPx(m?.p)} />
          <StatTile k="24 h" v={m?.ch24 !== undefined ? fmtPctUnits(m.ch24) : '–'} color={m?.ch24 !== undefined ? (m.ch24 >= 0 ? C.up : C.down) : undefined} />
          <StatTile k="Balance" v={pr.book ? usd(pr.book.balance) : '…'} />
        </Row>
        <Panel style={{ gap: 8 }}>
          <StatLine label="Volatility (per √s)" value={`${(sigma * 100).toFixed(4)}%`} />
          <StatLine label="Even-odds band, 60 s" value={`±${(band * 100).toFixed(3)}%`} />
        </Panel>
        <Row style={{ gap: 6 }}><Tag text="YOU" color={C.brand} /><Tag text="CLASHY BOT" color={C.opp} /><Tag text="LONG" color={C.up} /><Tag text="SHORT" color={C.down} /><Heart color={C.opp} size={14} /><Heart color={GT.track} size={14} /></Row>
        <Sides you={{ title: 'UP', color: C.up, sub: 'your call' }} bot={{ title: 'DOWN', color: C.down, sub: 'its call' }} lead="you" />
      </Section>

      <Section title="Inputs" code="Slider · Ruler">
        <Panel style={{ gap: 6 }}>
          <Slider frac={frac} min={-1} onChange={setFrac} label="A guess" text={`${(frac * 100).toFixed(0)}`} />
          <Ruler min={-1} max={1} marks={[{ v: frac, color: C.brand, label: 'YOU' }, { v: -0.2, color: C.opp, label: 'BOT' }, { v: 0.1, color: C.ink, label: 'LIVE', big: true }]} />
        </Panel>
      </Section>

      <Section title="Instant games" code="PotBar">
        <PotBar g={g} mult={1.9} streak={1} canCash onCash={noop} />
      </Section>

      <Section title="The end of a round" code="ResultCard">
        {lastRun && lastDef ? <ResultCard run={lastRun} verdict={`Your last ${lastDef.name} round.`} tint={lastDef.tint} onAgain={() => router.push(`/games/${lastDef.id}` as Href)} />
          : <Note>Play any game and your last result shows here.</Note>}
      </Section>

      <Txt v="small" style={{ textAlign: 'center', marginTop: 28, color: C.dim }}>Radii {GS.radius.hero} / {GS.radius.card} / {GS.radius.tile} · controls ≥ 44 px · docs/GAME-KIT.md</Txt>
    </ScrollView>
  );
}
