// Up or down (Nov 20): one market (rolled, chosen, or hidden until the bell), one call. Clashy Bot takes the other side
// for the same stake. At the bell the first live price decides it: right doubles the stake, a flat market is a push.
// p: { roll?: boolean = true, blind?: boolean, lev?: number (shows the call's P&L at that leverage, for flavour) }
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CallButtons } from '@/ui/clash';
import { Row, Txt } from '@/ui/kit';
import { C, FONT } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { nameOf, poolOf, tickerOf, useLivePool, type PoolKey } from '../feed';
import { BotSays, Clock, Logo, MarketChart, MarketHead, MarketTile, Note, Panel, Tag, fmtPx, useClock, useRoll, type GameApi } from '../kit';
import { pick, signedPct } from '../odds';

type Call = 'up' | 'down';

export default function UpDown({ g }: { g: GameApi }) {
  const { def } = g;
  const roll = def.p?.roll !== false;
  const blind = !!def.p?.blind;
  const lev = Number(def.p?.lev ?? 1);
  const live = useLivePool(def.pool as PoolKey[]);
  const [sym, setSym] = useState<string | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [entry, setEntry] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  // roll a market as soon as the pool has live prices
  useEffect(() => { if (roll && !sym && live.length) setSym(pick(live)); }, [roll, sym, live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRoll(useMemo(() => poolOf(def.pool as PoolKey[]), [def.pool]), roll && sym ? [sym] : null, 800);

  const go = async (c: Call) => {
    if (!sym) return;
    const m = g.feed.mark(sym);
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const end = Date.now() + def.secs * 1000;
    if (!(await g.begin(end))) return;
    setCall(c); setEntry(m.p); setStartedAt(Date.now()); setEndsAt(end);
  };

  // the bell: settle on the first live price at or after it
  useEffect(() => {
    if (!sym || !entry || !endsAt || settled.current || g.phase !== 'live') return;
    const m = g.feed.mark(sym);
    if (Date.now() < endsAt) return;
    if (m && m.t >= endsAt) {
      settled.current = true;
      const mv = m.p / entry - 1;
      const won = mv === 0 ? null : (mv > 0) === (call === 'up');
      const lines: [string, string][] = [
        ['Market', `${nameOf(g.info, sym)} (${tickerOf(sym)})`],
        ['Your call', call === 'up' ? 'Up' : 'Down'],
        ['Clashy Bot', call === 'up' ? 'Down' : 'Up'],
        ['Entry', fmtPx(entry)],
        ['Price at the bell', fmtPx(m.p)],
        ['Move', signedPct(mv, 3)],
      ];
      g.end(won === null ? 1 : won ? 2 : 0, won === null ? 'Dead flat. Push.' : won ? `${tickerOf(sym)} went ${mv > 0 ? 'up' : 'down'}. You called it.` : `${tickerOf(sym)} went ${mv > 0 ? 'up' : 'down'}. Clashy Bot takes it.`, lines);
    } else if (Date.now() > endsAt + 15_000) {
      settled.current = true;
      g.abandon(`No live ${tickerOf(sym)} price came in at the bell, so your stake is back.`);
    }
  });

  const m = sym ? g.feed.mark(sym) : undefined;
  const mv = entry && m ? m.p / entry - 1 : 0;
  const winning = mv === 0 ? null : (mv > 0) === (call === 'up');

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <TourTarget id="g-pick">
          {roll ? (
            <Panel style={{ alignItems: 'center', gap: 10 }}>
              {blind ? (
                <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#1D1A28', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="title" color={C.brandSoft} style={{ fontSize: 40 }}>?</Txt>
                </View>
              ) : sym ? <Logo sym={shown(0) || sym} info={g.info} size={84} /> : <View style={{ width: 84, height: 84 }} />}
              <Txt v="title" style={{ fontSize: 24 }}>{blind ? 'Mystery market' : sym ? nameOf(g.info, shown(0) || sym) : 'Rolling…'}</Txt>
              <Note center>{blind ? 'Revealed at the bell. You only see the line.' : sym ? `${tickerOf(sym)} · ${fmtPx(m?.p)} · ${def.secs} s round` : 'Finding a market with a live price…'}</Note>
              {!blind && sym ? (
                <Pressable onPress={() => setSym(pick(live.filter((s) => s !== sym)) ?? sym)} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: '#1D1D24', justifyContent: 'center' }}>
                  <Txt v="small" color={C.ink} style={{ ...FONT.semi }}>Roll again</Txt>
                </Pressable>
              ) : null}
            </Panel>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {live.slice(0, 9).map((s) => <MarketTile key={s} g={g} sym={s} selected={s === sym} onPress={() => setSym(s)} />)}
            </View>
          )}
        </TourTarget>
        {sym && !blind ? <MarketChart g={g} sym={sym} h={150} /> : null}
        {g.stakeRow}
        <TourTarget id="g-go">
          <CallButtons onUp={() => void go('up')} onDown={() => void go('down')} disabled={!sym || g.busy} />
        </TourTarget>
        <Note center>Clashy Bot takes the other side. Right call: 2× your stake.</Note>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        {blind && g.phase === 'live' ? (
          <Row style={{ gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1D1A28', alignItems: 'center', justifyContent: 'center' }}><Txt v="label" color={C.brandSoft}>?</Txt></View>
            <View style={{ flex: 1 }}><Txt v="label" style={{ fontSize: 17 }}>Mystery market</Txt><Txt v="small" color={mv >= 0 ? C.up : C.down} style={{ ...FONT.semi }}>{signedPct(mv, 3)}</Txt></View>
          </Row>
        ) : sym ? <MarketHead g={g} sym={sym} from={entry ?? undefined} /> : null}
        <View style={{ marginTop: 12 }}><Clock left={left} total={def.secs} tint={def.tint} label={g.phase === 'done' ? 'done' : 'to the bell'} /></View>
      </Panel>
      {sym && entry ? <MarketChart g={g} sym={sym} from={startedAt ?? undefined} entry={entry} h={200} /> : null}
      <Row style={{ gap: 10 }}>
        <Panel style={{ flex: 1, alignItems: 'center', gap: 6 }} tint={winning ? C.up : undefined}>
          <Tag text="YOU" color={C.brand} />
          <Txt v="title" color={call === 'up' ? C.up : C.down} style={{ fontSize: 26 }}>{call === 'up' ? '▲ UP' : '▼ DOWN'}</Txt>
          {lev > 1 ? <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{signedPct((call === 'up' ? mv : -mv) * lev, 1)} at {lev}×</Txt> : null}
        </Panel>
        <Panel style={{ flex: 1, alignItems: 'center', gap: 6 }} tint={winning === false ? C.opp : undefined}>
          <Tag text="CLASHY BOT" color={C.opp} />
          <Txt v="title" color={call === 'up' ? C.down : C.up} style={{ fontSize: 26 }}>{call === 'up' ? '▼ DOWN' : '▲ UP'}</Txt>
          {lev > 1 ? <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>{signedPct((call === 'up' ? -mv : mv) * lev, 1)} at {lev}×</Txt> : null}
        </Panel>
      </Row>
      {g.phase === 'live' ? (
        <Animated.View entering={FadeIn}>
          <BotSays text={winning === null ? 'Dead even. Anything can happen.' : winning ? "You're ahead. Hold your nerve." : "I'm ahead. Bell's coming."} />
        </Animated.View>
      ) : null}
    </View>
  );
}
