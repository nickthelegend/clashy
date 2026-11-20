// One game: /games/[id]. The hero says what it is, the engine (../../games/engines) draws the setup and the live round,
// and the result card settles it: the payout lands in the practice balance with a receipt of real prices. Every game
// is practice money on live prices from Phoenix and Pacifica; nothing is sent on chain.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePractice, type GameRun } from '@/chain/practice';
import { errText } from '@/chain/useChain';
import { GAMES } from '@/games/catalog';
import { ENGINES } from '@/games/engines';
import { useFeed, useInfo } from '@/games/feed';
import { GameHero, MarketClosedBanner, ResultCard, RulesSheet, StakeRow, type GameApi, type Line, type Phase } from '@/games/kit';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { BackBtn, ErrorLine, Pending, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { PaperBadge } from '@/ui/practice-kit';
import { C, FONT, S } from '@/ui/tokens';


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
          <GameHero def={def} record={{ wins, played: history.length, net }} />
        </TourTarget>

        <MarketClosedBanner def={def} style={{ marginTop: 10 }} />
        <View style={{ marginTop: 16 }}>
          {!pr.ready ? <Txt v="small">Loading your practice balance…</Txt> : <Engine key={round} g={api} />}
        </View>
        {feed.error() ? <View style={{ marginTop: 12 }}><ErrorLine msg={`Live prices: ${feed.error()}`} /></View> : null}
        {err ? <View style={{ marginTop: 12 }}><ErrorLine msg={err} /></View> : null}

        {result ? <ResultCard run={result.run} verdict={result.verdict} tint={def.tint} onAgain={again} /> : null}
      </TourScroll>

      <RulesSheet def={def} open={rules} onClose={() => setRules(false)} />
    </ScrollView>
  );
}

