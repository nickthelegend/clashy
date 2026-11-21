// TEMPLATE (not registered): copy to engines/<id>.tsx to start a new engine. A complete, working one-market call:
// roll a market, pick a side, the bell settles on the first tick after it, Clashy Bot takes the other side.
// Replace the call with your own play; keep the contract (docs/GAMES.md) and the kit pieces (docs/GAME-KIT.md).
// p: { } (document every setting here, and read it with pNum / pStr / pBool)
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Row } from '@/ui/kit';
import { C } from '@/ui/tokens';
import { TourTarget } from '@/tour';
import { BotSays, Choice, Clock, MarketHead, Note, Panel, PxChart, RolledPanel, bellPrice, fmtPx, mktLine, mv, tickerOf, useClock, useRolled, type GameApi, type Tick } from '../kit';

type Call = 'up' | 'down';

export default function Template({ g }: { g: GameApi }) {
  const { def } = g;
  const roll = useRolled(g);
  const [call, setCall] = useState<Call | null>(null);
  const [entry, setEntry] = useState<Tick | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const left = useClock(endsAt);
  const settled = useRef(false);

  // the bell: no deps on purpose (the feed re-renders every 1.5 s, the clock every 200 ms); the ref settles it once
  useEffect(() => {
    if (!entry || !endsAt || !call || !roll.sym || settled.current) return;
    const bell = bellPrice(g, roll.sym, endsAt);
    if (bell === 'wait') return;
    settled.current = true;
    if (bell === 'quiet') { g.abandon('No live price came after the bell, so your stake is back.'); return; }
    const move = bell.p / entry.p - 1;
    const won = move === 0 ? null : (move > 0) === (call === 'up');
    g.end(won === null ? 1 : won ? 2 : 0, won === null ? 'Dead flat. Stake back.' : won ? `Right. ${mv(move)}.` : `Wrong way. ${mv(move)}.`, [
      ['Market', mktLine(g, roll.sym)], ['Your call', call.toUpperCase()], ['Entry', fmtPx(entry.p)], ['At the bell', fmtPx(bell.p)], ['Move', mv(move)],
    ]);
  });

  const start = async (c: Call) => {
    const sym = roll.sym;
    if (!sym) return;
    const m = g.feed.mark(sym);
    // read the entry before taking the stake, and refuse a stale price
    if (!m || !g.feed.fresh(sym)) { g.fail(`Waiting for a live ${tickerOf(sym)} price.`); return; }
    const at = Date.now() + def.secs * 1000;
    if (!(await g.begin(at))) return;
    setCall(c); setEntry({ t: m.t, p: m.p }); setEndsAt(at);
  };

  if (g.phase === 'setup') {
    return (
      <View style={{ gap: 14 }}>
        <RolledPanel g={g} sym={roll.sym} shown={roll.shown} onReroll={roll.reroll} sub={`${def.secs} s round`} />
        {g.stakeRow}
        <TourTarget id="g-pick">
          <TourTarget id="g-go">
            <Row style={{ gap: 10 }}>
              <Choice title="▲ UP" color={C.up} onPress={() => start('up')} disabled={!roll.sym || g.busy} />
              <Choice title="▼ DOWN" color={C.down} onPress={() => start('down')} disabled={!roll.sym || g.busy} />
            </Row>
          </TourTarget>
        </TourTarget>
        <Note center>Clashy Bot takes the other side.</Note>
      </View>
    );
  }
  const sym = roll.sym!;
  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <MarketHead g={g} sym={sym} from={entry?.p} />
        <PxChart g={g} sym={sym} from={entry?.t} until={g.phase === 'done' ? endsAt ?? undefined : undefined} entry={entry?.p} />
        {g.phase === 'live' ? <Clock left={left} total={def.secs} tint={def.tint} /> : null}
      </Panel>
      <BotSays text={`Clashy Bot took ${call === 'up' ? 'DOWN' : 'UP'}.`} />
    </View>
  );
}
