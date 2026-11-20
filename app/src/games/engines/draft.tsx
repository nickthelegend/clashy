// Draft (Nov 20): n markets on the board; draft k of them. With `snake` you and Clashy Bot take turns (it picks at
// random from what's left, after a short beat so you see it); otherwise it gets k at random from the rest when you
// start. Over the round each team scores the average move of its picks since the start: the better team wins 2×,
// a dead heat is a push.
// p: { n = 6, k = 3, snake = false }
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { tickerOf, useLivePool } from '../feed';
import { BotSays, Clock, Go, Logo, MarketTile, Note, Panel, Tag, bellPrices, clampInt, rollable, useClock, type GameApi, type Line } from '../kit';
import { pick, sample, signedPct } from '../odds';

export default function Draft({ g }: { g: GameApi }) {
  const { def } = g;
  const n = clampInt(def.p?.n, 4, 9, 6);
  const k = clampInt(def.p?.k, 1, Math.floor(n / 2), Math.min(3, Math.floor(n / 2)));
  const snake = !!def.p?.snake;
  const live = useLivePool(def.pool);
  const [board, setBoard] = useState<string[] | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [bot, setBot] = useState<string[]>([]);
  const [entries, setEntries] = useState<Record<string, number> | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [final, setFinal] = useState<Record<string, number> | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);
  const bell = useRef<Record<string, number>>({});

  useEffect(() => { if (!board && live.length >= n) setBoard(sample(rollable(g, live, n), n)); }, [board, live.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // snake: Clashy Bot's turn comes after each of yours
  const botTurn = snake && g.phase === 'setup' && !!board && mine.length > bot.length && bot.length < k;
  useEffect(() => {
    if (!botTurn || !board) return;
    const t = setTimeout(() => {
      setBot((b) => {
        const rest = board.filter((s) => !mine.includes(s) && !b.includes(s));
        return rest.length && b.length < mine.length ? [...b, pick(rest)] : b;
      });
    }, 700 + Math.random() * 600);
    return () => clearTimeout(t);
  }, [botTurn, mine.length, bot.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reroll = () => { setMine([]); setBot([]); setBoard(sample(rollable(g, live, n), n)); };
  const tap = (s: string) => {
    if (bot.includes(s)) return;
    if (snake) {
      if (botTurn || mine.includes(s) || mine.length >= k) return;
      setMine((m) => [...m, s]);
      return;
    }
    setMine((m) => (m.includes(s) ? m.filter((x) => x !== s) : m.length >= k ? m : [...m, s]));
  };
  const drafted = mine.length === k && (!snake || bot.length === k);

  const go = async () => {
    if (!board || !drafted) return;
    const theirs = snake ? bot : sample(board.filter((s) => !mine.includes(s)), k);
    const all = [...mine, ...theirs];
    const stale = all.find((s) => !g.feed.fresh(s));
    if (stale) { g.fail(`Waiting for a live ${tickerOf(stale)} price.`); return; }
    const e: Record<string, number> = {};
    for (const s of all) e[s] = g.feed.mark(s)!.p;
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setBot(theirs); setEntries(e); setEndsAt(end);
  };

  // the bell: every pick's first live price at or after it
  useEffect(() => {
    if (!entries || !endsAt || settled.current || g.phase !== 'live') return;
    if (Date.now() < endsAt) return;
    const all = [...mine, ...bot];
    const px = bellPrices(g, all, endsAt, bell);
    if (!px) {
      if (Date.now() > endsAt + 15_000) {
        settled.current = true;
        g.abandon('Not every pick sent a live price at the bell, so your stake is back.');
      }
      return;
    }
    settled.current = true;
    setFinal(px);
    const mv = (s: string) => px[s]! / entries[s]! - 1;
    const avg = (team: string[]) => team.reduce((a, s) => a + mv(s), 0) / team.length;
    const a = avg(mine), b = avg(bot);
    const lines: Line[] = [
      ...mine.map((s): Line => [`You · ${tickerOf(s)}`, signedPct(mv(s), 3)]),
      ['Your average', signedPct(a, 3)],
      ...bot.map((s): Line => [`Clashy Bot · ${tickerOf(s)}`, signedPct(mv(s), 3)]),
      ['Clashy Bot average', signedPct(b, 3)],
    ];
    if (a === b) g.end(1, 'Dead level. Push.', lines);
    else if (a > b) g.end(2, `Your team ${signedPct(a, 3)}, Clashy Bot's ${signedPct(b, 3)}. You win.`, lines);
    else g.end(0, `Clashy Bot's team ${signedPct(b, 3)}, yours ${signedPct(a, 3)}. Clashy Bot takes it.`, lines);
  });

  if (!board) {
    return <Panel><Note center>{live.length ? `Finding ${n} markets with a live price…` : 'Loading live prices…'}</Note></Panel>;
  }

  if (g.phase === 'setup') {
    const status = snake
      ? drafted ? 'Teams set.' : botTurn ? 'Clashy Bot is picking…' : `Your pick: ${mine.length + 1} of ${k}`
      : drafted ? `Team set. Clashy Bot gets ${k} of the rest.` : `Pick ${k - mine.length} more`;
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          <Panel style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt v="h2">Draft {k}</Txt>
                <Txt v="small" color={botTurn ? C.opp : C.muted}>{status}</Txt>
              </View>
              <Pressable onPress={reroll} disabled={botTurn} accessibilityRole="button" accessibilityLabel="Roll a new board" hitSlop={6}
                style={({ pressed }) => ({ paddingHorizontal: 14, height: 44, borderRadius: 22, backgroundColor: pressed ? '#24242C' : '#1D1D24', justifyContent: 'center', opacity: botTurn ? 0.5 : 1 })}>
                <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll again</Txt>
              </Pressable>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {board.map((s) => {
                const me = mine.includes(s), them = bot.includes(s);
                return (
                  <MarketTile key={s} g={g} sym={s} selected={me} disabled={them || (!me && (mine.length >= k || botTurn))} onPress={() => tap(s)}
                    mark={me ? <Tag text="YOU" color={C.brand} /> : them ? <Tag text="BOT" color={C.opp} /> : undefined} />
                );
              })}
            </View>
          </Panel>
        </TourTarget>
        {snake && bot.length ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <BotSays text={`I took ${bot.map(tickerOf).join(', ')}.`} />
          </Animated.View>
        ) : null}
        {g.stakeRow}
        <TourTarget id="g-go">
          <Go title={drafted ? 'Start the race' : snake ? 'Finish the draft' : `Pick ${k - mine.length} more`} sub={`${def.secs} s · better average wins 2×`}
            onPress={() => void go()} disabled={!drafted || g.busy} color={def.tint} ink="#0A0A0D" />
        </TourTarget>
      </View>
    );
  }

  // live and done: two teams, each pick's move and the team average
  const moveOf = (s: string) => { const p = final ? final[s] : g.feed.mark(s)?.p; const e = entries?.[s]; return p && e ? p / e - 1 : 0; };
  const avg = (team: string[]) => (team.length ? team.reduce((a, s) => a + moveOf(s), 0) / team.length : 0);
  const a = avg(mine), b = avg(bot);
  const lead = a === b ? null : a > b;
  return (
    <View style={{ gap: 14 }}>
      <Panel><Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></Panel>
      <Row style={{ gap: 10, alignItems: 'stretch' }}>
        <Team title="YOU" color={C.brand} picks={mine} moveOf={moveOf} avg={a} g={g} ahead={lead === true} />
        <Team title="CLASHY BOT" color={C.opp} picks={bot} moveOf={moveOf} avg={b} g={g} ahead={lead === false} />
      </Row>
      {g.phase === 'live' ? (
        <BotSays text={lead === null ? 'Dead level. Anything can happen.' : lead ? 'Your team is ahead. For now.' : 'My team is ahead. Bell is coming.'} />
      ) : null}
    </View>
  );
}

function Team({ title, color, picks, moveOf, avg, g, ahead }: { title: string; color: string; picks: string[]; moveOf: (s: string) => number; avg: number; g: GameApi; ahead: boolean }) {
  return (
    <Panel style={{ flex: 1, minWidth: 0, gap: 10, padding: 12 }} tint={ahead ? (color === C.opp ? C.opp : C.up) : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Tag text={title} color={color} />
        {ahead ? <Text style={{ ...FONT.bold, fontSize: 11, color: '#FFD66B' }}>LEADS</Text> : null}
      </Row>
      {picks.map((s, i) => {
        const mv = moveOf(s);
        return (
          <Animated.View key={s} entering={FadeInDown.delay(i * 90).duration(240)}>
            <Row style={{ gap: 8 }}>
              <Logo sym={s} info={g.info} size={28} />
              <Txt v="label" lines={1} style={{ flex: 1, fontSize: 14 }}>{tickerOf(s)}</Txt>
              <Txt v="small" color={mv >= 0 ? C.up : C.down} style={{ ...FONT.semi, fontVariant: ['tabular-nums'] }}>{signedPct(mv, 2)}</Txt>
            </Row>
          </Animated.View>
        );
      })}
      <View style={{ borderTopWidth: 1, borderTopColor: '#1F1F27', paddingTop: 8 }}>
        <Txt v="small">Average</Txt>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.displayB, fontSize: 26, letterSpacing: -0.8, color: avg >= 0 ? C.up : C.down, fontVariant: ['tabular-nums'] }}>{signedPct(avg, 3)}</Text>
      </View>
    </Panel>
  );
}
