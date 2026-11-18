// A market's price chart with range tabs. For the eight prices Clashy's crank records on chain (SOL, BTC, ETH and the
// five Stash stocks) it draws the crank's real history (one sample a minute, GET /history) for 1H / 24H / 7D, with
// today's live price as the last point. Live draws only the prices this screen has seen since it opened. Anything the
// crank doesn't record gets Live only. Nothing is backfilled: a range the crank hasn't covered yet says since when.
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { historySym, usePriceHistory, type PriceRange } from '@/chain/history-prices';
import { Bone, ErrorLine, LiveChart, LiveDot, Row, Txt } from './kit';
import { C, FONT } from './tokens';

type Mode = 'live' | PriceRange;
const MODES: { k: Mode; label: string; secs: number; past: string }[] = [
  { k: 'live', label: 'Live', secs: 0, past: 'since you opened' },
  { k: '1h', label: '1H', secs: 3_600, past: 'past hour' },
  { k: '24h', label: '24H', secs: 86_400, past: 'past 24 hours' },
  { k: '7d', label: '7D', secs: 7 * 86_400, past: 'past 7 days' },
];
const when = (secs: number) => new Date(secs * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
const money = (n: number) => {
  const a = Math.abs(n);
  return `${n >= 0 ? '+' : '−'}$${a >= 100 ? a.toLocaleString('en-US', { maximumFractionDigits: 2 }) : a < 1 ? a.toPrecision(3) : a.toFixed(2)}`;
};

/** samples: the live prices this screen has seen ({t ms, p}); price: the live price now. */
export function PriceChart({ sym, samples, price, h = 220, minSpan = 0.0006, source }: {
  sym: string; samples: { t: number; p: number }[]; price?: number; h?: number; minSpan?: number; source: string;
}) {
  const hs = historySym(sym);
  const [mode, setMode] = useState<Mode>(hs ? '24h' : 'live');
  const hist = usePriceHistory(hs && mode !== 'live' ? mode : null);
  const [w, setW] = useState(0);
  const def = MODES.find((x) => x.k === mode)!;

  let line: number[] = [];
  let caption = '';
  if (mode === 'live') {
    line = samples.map((x) => x.p);
    caption = samples.length > 1 ? `${source} · live since you opened · ${span(samples[samples.length - 1].t - samples[0].t)}` : `${source} · watching the live price`;
  } else if (hs && hist.data) {
    const pts = hist.data.points.filter((x) => typeof x.p[hs] === 'number');
    line = pts.map((x) => x.p[hs]);
    if (price !== undefined && line.length) line = [...line, price];
    const covers = !!pts[0] && pts[0].t <= Date.now() / 1000 - def.secs + 5 * 60;
    caption = `Clashy's on-chain ${hs} feed · a sample a minute${pts[0] && !covers ? ` · since ${when(pts[0].t)}` : ''}`;
  }
  const first = line[0];
  const last = line[line.length - 1];
  const moved = first !== undefined && last !== undefined ? last - first : 0;
  const pct = first ? (moved / first) * 100 : 0;
  const color = moved >= 0 ? C.up : C.down;

  return (
    <View style={{ marginTop: 10 }}>
      <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={{ marginHorizontal: -4 }}>
        {w === 0 ? <View style={{ height: h }} />
          : line.length > 1 ? <LiveChart data={line} w={w} h={h} color={color} minSpan={minSpan} />
            : mode !== 'live' && hist.error ? <View style={{ height: h, justifyContent: 'center', paddingHorizontal: 8 }}><ErrorLine msg={hist.error} onRetry={hist.reload} /></View>
              : mode !== 'live' && !hist.data ? <View style={{ height: h, justifyContent: 'center', alignItems: 'center' }}><Bone w={'94%'} h={h - 40} r={18} /></View>
                : (
                  <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                    <LiveDot color={C.brandSoft} />
                    <Txt v="label" style={{ marginTop: 10, textAlign: 'center' }}>{mode === 'live' ? 'Watching the price' : 'Not enough history yet'}</Txt>
                    <Txt v="small" style={{ marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                      {mode === 'live' ? 'The line draws itself from the live price while this page is open.' : `Clashy records ${hs} once a minute. Try Live, or check back in a few minutes.`}
                    </Txt>
                  </View>
                )}
      </View>

      <Row style={{ marginTop: 6, gap: 2, marginLeft: -8 }}>
        {(hs ? MODES : MODES.slice(0, 1)).map((x) => {
          const on = x.k === mode;
          return (
            <Pressable key={x.k} onPress={() => { Haptics.selectionAsync(); setMode(x.k); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={x.past}
              style={{ height: 36, minWidth: 44, paddingHorizontal: 10, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.s2 : 'transparent' }}>
              <Txt v="small" color={on ? C.ink : C.dim} style={{ ...(on ? FONT.semi : FONT.medium), fontSize: 14 }}>{x.label}</Txt>
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        {line.length > 1 ? (
          <Txt v="small" color={color} style={{ ...FONT.semi, fontSize: 13, fontVariant: ['tabular-nums'] }}>
            {money(moved)} ({pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%)
          </Txt>
        ) : null}
      </Row>
      {caption ? <Txt v="small" lines={2} style={{ fontSize: 11.5, marginTop: 2 }}>{caption}</Txt> : null}
    </View>
  );
}
