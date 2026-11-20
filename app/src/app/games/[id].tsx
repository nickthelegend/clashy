// One game: /games/[id]. The hero says what it is, the engine (../../games/engines) draws the setup and the live round,
// and the result card settles it: the payout lands in the practice balance with a receipt of real prices. Every game
// is practice money on live prices from Phoenix and Pacifica; nothing is sent on chain.
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePractice, type GameRun } from '@/chain/practice';
import { errText } from '@/chain/useChain';
import { ENGINE_ART } from '@/games/art';
import { GAMES } from '@/games/catalog';
import { ENGINES } from '@/games/engines';
import { POOLS, poolOf, useFeed, useInfo, type PoolKey } from '@/games/feed';
import { StakeRow, lengthOf, usd, type GameApi, type Line, type Phase } from '@/games/kit';
import { CATEGORIES } from '@/games/types';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { BackBtn, ErrorLine, Pending, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { PaperBadge } from '@/ui/practice-kit';
import { Sheet } from '@/ui/sheet';
import { C, FONT, S } from '@/ui/tokens';


/** Whether the US stock market is open now (9:30–16:00 New York time, Monday to Friday; holidays not counted). */
function usMarketOpen(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
    const day = get('weekday'), mins = Number(get('hour')) % 24 * 60 + Number(get('minute'));
    return !['Sat', 'Sun'].includes(day) && mins >= 570 && mins < 960;
  } catch { return true; }
}
const STOCKY = new Set<string>([...POOLS.stocks, ...POOLS.indexes]);

const back = () => (router.canGoBack() ? router.back() : router.replace('/games' as Href));
type Result = { run: GameRun; verdict: string };

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const def = useMemo(() => GAMES.find((x) => x.id === id), [id]);
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const { width } = useWindowDimensions();
  const chartW = Math.min(width, 720) - 2 * S.gutter;
  const pr = usePractice();
  const feed = useFeed();
  const { info } = useInfo();
  const [stake, setStake] = useState(10);
  const [phase, setPhase] = useState<Phase>('setup');
  const [round, setRound] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [result, setResult] = useState<Result | null>(null);
  const [rules, setRules] = useState(false);
  const runId = useRef<string | null>(null);
  const ts = useTourScroll<React.ComponentRef<typeof ScrollView>>();
  const balance = pr.book?.balance ?? 0;
  useScreenTour(def ? `game:${def.id}` : 'game:none', !!def && pr.ready);

  const begin = useCallback(async (endsAt?: number) => {
    if (!def) return false;
    setErr(undefined); setBusy(true);
    try {
      const run = await pr.startGame({ gameId: def.id, name: def.name, stake, endsAt });
      runId.current = run.id;
      setPhase('live');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return true;
    } catch (e) { setErr(errText(e)); return false; } finally { setBusy(false); }
  }, [def, pr, stake]);

  const end = useCallback((mult: number, verdict: string, lines: Line[]) => {
    const rid = runId.current;
    if (!rid) return;
    runId.current = null;
    setPhase('done');
    pr.finishGame(rid, mult, lines).then((run) => {
      setResult({ run, verdict });
      Haptics.notificationAsync(run.result === 'won' ? Haptics.NotificationFeedbackType.Success : run.result === 'lost' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning);
      setTimeout(() => ts.scroller.by(10_000), 120);
    }).catch((e) => setErr(errText(e)));
  }, [pr, ts.scroller]);

  const abandon = useCallback((why: string) => {
    const rid = runId.current;
    if (!rid) return;
    runId.current = null;
    setPhase('done');
    pr.abandonGame(rid).then(() => setResult({ run: { id: rid, gameId: def?.id ?? '', name: def?.name ?? '', stake, startedAt: Date.now(), result: 'abandoned', payout: stake, pnl: 0 }, verdict: why }))
      .catch((e) => setErr(errText(e)));
  }, [pr, def, stake]);

  const again = () => { setResult(null); setErr(undefined); setPhase('setup'); setRound((r) => r + 1); ts.scroller.by(-10_000); };

  if (!def) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8, paddingHorizontal: S.gutter }}>
        <BackBtn onPress={back} />
        <Pending title="No such game" body="It may have been renamed. Every game is on the Games page." action="All games" onAction={() => router.replace('/games' as Href)} />
      </View>
    );
  }

  const Engine = ENGINES[def.engine];
  const api: GameApi = {
    def, feed, info, stake, balance, phase, busy, round, width: chartW,
    begin, end, abandon, fail: setErr,
    stakeRow: <StakeRow value={stake} onChange={setStake} balance={balance} disabled={phase !== 'setup'} />,
  };
  const history = (pr.book?.games ?? []).filter((x) => x.gameId === def.id && x.result !== 'abandoned').slice(0, 20);
  const wins = history.filter((x) => x.result === 'won').length;
  const net = history.reduce((a, x) => a + (x.pnl ?? 0), 0);
  const cat = CATEGORIES.find((c) => c.key === def.cat)?.label ?? '';
  const pool = poolOf(def.pool as PoolKey | readonly string[]);
  const stocky = pool.filter((x) => STOCKY.has(x)).length > pool.length / 2;

  return (
    <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={[{ paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }, col]}>
      <TourScroll value={ts.scroller}>
        <Row style={{ justifyContent: 'space-between' }}>
          <BackBtn onPress={back} />
          <Row style={{ gap: 8 }}>
            <PaperBadge />
            <TourTarget id="g-rules">
              <Pressable onPress={() => setRules(true)} accessibilityRole="button" accessibilityLabel="How to play" hitSlop={6}
                style={({ pressed }) => ({ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: pressed ? '#24242C' : C.s2, justifyContent: 'center' })}>
                <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>How to play</Txt>
              </Pressable>
            </TourTarget>
          </Row>
        </Row>

        {/* the hero: what this game is */}
        <TourTarget id="g-hero" style={{ marginTop: 14 }}>
          <Animated.View entering={FadeInDown.duration(320)} style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: '#100F15', borderWidth: 1.5, borderColor: `${def.tint}44`, padding: 16 }}>
            <View style={{ position: 'absolute', right: -50, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: def.tint, opacity: 0.14 }} />
            <Row style={{ gap: 14, alignItems: 'center' }}>
              <Image source={ENGINE_ART[def.engine]} style={{ width: 84, height: 84 }} contentFit="contain" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: 32, letterSpacing: -1, color: def.tint, lineHeight: 38 }}>{def.name}</Text>
                <Txt v="small" color="#D2CDE0" style={{ ...FONT.semi, fontSize: 14, lineHeight: 19, marginTop: 2 }}>{def.hook}</Txt>
              </View>
            </Row>
            <Row style={{ gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {[lengthOf(def), def.vs === 'bot' ? 'vs Clashy Bot' : def.vs === 'bots' ? 'vs 7 bots' : 'Solo', cat].map((t) => (
                <View key={t} style={{ backgroundColor: '#1C1A25', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Txt v="small" color={C.ink} style={{ ...FONT.semi, fontSize: 12 }}>{t}</Txt>
                </View>
              ))}
              {history.length ? (
                <View style={{ backgroundColor: '#1C1A25', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Txt v="small" color={net >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontSize: 12, fontVariant: ['tabular-nums'] }}>{wins}/{history.length} won · {net >= 0 ? '+' : '−'}{usd(Math.abs(net))}</Txt>
                </View>
              ) : null}
            </Row>
          </Animated.View>
        </TourTarget>

        {stocky && !usMarketOpen() ? (
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1A1606', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFC94A' }} />
            <Txt v="small" color="#E9D9A6" style={{ flex: 1, lineHeight: 18 }}>The US market is closed. Stocks barely move until it opens at 9:30 New York time.</Txt>
          </View>
        ) : null}
        <View style={{ marginTop: 16 }}>
          {!pr.ready ? <Txt v="small">Loading your practice balance…</Txt> : <Engine key={round} g={api} />}
        </View>
        {feed.error() ? <View style={{ marginTop: 12 }}><ErrorLine msg={`Live prices: ${feed.error()}`} /></View> : null}
        {err ? <View style={{ marginTop: 12 }}><ErrorLine msg={err} /></View> : null}

        {result ? <ResultCard r={result} tint={def.tint} onAgain={again} /> : null}
      </TourScroll>

      <Sheet open={rules} onClose={() => setRules(false)} title={def.name} sub={def.hook}>
        <View style={{ gap: 12, paddingBottom: 8 }}>
          {def.how.map((line, i) => (
            <Row key={i} style={{ gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${def.tint}2E`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...FONT.bold, fontSize: 13, color: def.tint }}>{i + 1}</Text>
              </View>
              <Txt v="body" style={{ flex: 1, lineHeight: 22 }}>{line}</Txt>
            </Row>
          ))}
          <Txt v="small" style={{ marginTop: 4, lineHeight: 18 }}>Practice money on live prices from Phoenix and Pacifica. {def.vs === 'bot' ? 'Clashy Bot picks at random.' : def.vs === 'bots' ? 'The bots call at random.' : ''}</Txt>
        </View>
      </Sheet>
    </ScrollView>
  );
}

function ResultCard({ r, tint, onAgain }: { r: Result; tint: string; onAgain: () => void }) {
  const { run } = r;
  const won = run.result === 'won', lost = run.result === 'lost';
  const color = won ? C.up : lost ? C.down : C.muted;
  const big = won ? `+${usd(run.pnl ?? 0)}` : lost ? `−${usd(Math.abs(run.pnl ?? 0))}` : 'Stake back';
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} style={{ marginTop: 18, borderRadius: 28, backgroundColor: '#0F0F14', borderWidth: 1.5, borderColor: `${color}66`, padding: 18 }}>
      <Txt v="small" color={color} style={{ ...FONT.bold, letterSpacing: 1.2 }}>{won ? 'YOU WON' : lost ? 'YOU LOST' : run.result === 'push' ? 'PUSH' : 'NO RESULT'}</Txt>
      <Text style={{ ...FONT.displayB, fontSize: 46, letterSpacing: -1.6, color, marginTop: 2, fontVariant: ['tabular-nums'] }}>{big}</Text>
      <Txt v="body" color={C.ink} style={{ marginTop: 2 }}>{r.verdict}</Txt>
      {run.lines?.length ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#1F1F27', paddingTop: 10, gap: 7 }}>
          {[...run.lines, ['Stake', usd(run.stake)] as Line, ['Paid out', usd(run.payout ?? 0)] as Line].map(([k, v]) => (
            <Row key={k} style={{ justifyContent: 'space-between', gap: 12 }}>
              <Txt v="small">{k}</Txt>
              <Txt v="small" color={C.ink} lines={1} style={{ ...FONT.semi, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v}</Txt>
            </Row>
          ))}
        </View>
      ) : null}
      <Row style={{ gap: 10, marginTop: 16 }}>
        <Pressable onPress={() => router.push('/games' as Href)} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 26, backgroundColor: pressed ? '#24242C' : C.s2, alignItems: 'center', justifyContent: 'center' })}>
          <Txt v="label" color={C.ink}>More games</Txt>
        </Pressable>
        <Pressable onPress={onAgain} accessibilityRole="button" style={({ pressed }) => ({ flex: 1.3, height: 52, borderRadius: 26, backgroundColor: tint, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
          <Txt v="label" color="#0A0A0D" style={{ ...FONT.bold }}>Play again</Txt>
        </Pressable>
      </Row>
    </Animated.View>
  );
}
