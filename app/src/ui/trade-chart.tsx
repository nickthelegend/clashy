// One trade on its chart, the way an exchange's position page draws it: the real candles over the time it was open,
// the stretch it was held shaded in its side's colour, Open and Close pins at the exact candle and price, the entry
// and exit (or live) price lines with their labels, and the liquidation line while a leveraged trade is open.
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Line as SLine, Rect } from 'react-native-svg';
import { CHART_TF_MS, type TradeCandles } from '@/chain/trade-chart';
import { decimalsFor, fmtP } from './orderbook';
import { Txt } from './kit';
import { C, FONT } from './tokens';

export type ChartTrade = {
  side: 'long' | 'short'; entry: number; exit?: number; openedAt: number; closedAt?: number;
  /** The live price while open. */ now?: number; liq?: number | null; liquidated?: boolean; win?: boolean;
};

const R_ = 66; // the price column on the right
const TOP = 26, BOT = 22;

const clock = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function TradeChart({ data, w, h = 250, t }: { data: TradeCandles; w: number; h?: number; t: ChartTrade }) {
  const step = CHART_TF_MS[data.tf];
  const ks = data.candles;
  const plotW = w - R_;
  const t0 = data.from, t1 = data.to + step;
  const X = (ms: number) => ((ms - t0) / (t1 - t0)) * plotW;
  const last = t.exit ?? t.now ?? ks[ks.length - 1]?.c;
  const { lo, hi, liqIn } = useMemo(() => {
    const vals = [...ks.flatMap((k) => [k.h, k.l]), t.entry, ...(last !== undefined ? [last] : [])];
    let a = Math.min(...vals), b = Math.max(...vals);
    const span = b - a || b * 0.002;
    // the liquidation line joins the chart only when it is close enough to read; otherwise its label sits at the edge
    const liqIn = !!t.liq && t.liq > a - span * 0.8 && t.liq < b + span * 0.8;
    if (liqIn) { a = Math.min(a, t.liq!); b = Math.max(b, t.liq!); }
    const pad = (b - a || b * 0.002) * 0.08;
    return { lo: a - pad, hi: b + pad, liqIn };
  }, [ks, t.entry, last, t.liq]);
  const Y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * (h - TOP - BOT);
  const d = decimalsFor(t.entry);
  const cw = plotW / Math.max(1, (t1 - t0) / step);
  const body = Math.max(1.2, Math.min(9, cw * 0.62));

  const sideCol = t.side === 'long' ? C.up : C.down;
  const xOpen = X(t.openedAt);
  const xEnd = X(Math.min(t.closedAt ?? Date.now(), t1));
  const exitCol = t.liquidated ? C.down : t.win === undefined ? C.ink : t.win ? C.up : C.down;
  // a long opens with a buy (pinned under the price) and closes with a sell (over it); a short the other way round
  const openBelow = t.side === 'long';

  const multiDay = t1 - t0 > 36 * 3_600_000;
  const ticks = [t0 + step, (t0 + t1) / 2, t1 - step];

  const pill = (y: number, label: string, bg: string, fg: string) => (
    <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: Math.max(0, Math.min(h - BOT - 20, y - 10)), backgroundColor: bg, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2.5, minWidth: R_ - 6, alignItems: 'center' }}>
      <Txt v="small" color={fg} lines={1} style={{ fontSize: 10, ...FONT.semi, fontVariant: ['tabular-nums'] }}>{label}</Txt>
    </View>
  );
  const pin = (x: number, y: number, text: string, bg: string, fg: string, below: boolean) => (
    <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, Math.min(plotW - 46, x - 23)), top: below ? Math.min(h - BOT - 20, y + 9) : Math.max(0, y - 29), width: 46, alignItems: 'center' }}>
      <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Txt v="small" color={fg} style={{ fontSize: 10.5, ...FONT.semi }}>{text}</Txt>
      </View>
    </View>
  );

  return (
    <View style={{ width: w, height: h }} accessibilityLabel={`Chart of the trade: opened at ${fmtP(t.entry, d)}${t.exit ? `, closed at ${fmtP(t.exit, d)}` : ''}`}>
      <Svg width={w} height={h}>
        {/* the stretch the trade was open */}
        <Rect x={xOpen} y={TOP - 8} width={Math.max(2, xEnd - xOpen)} height={h - TOP - BOT + 16} fill={sideCol} fillOpacity={0.07} rx={6} />
        {[0.25, 0.5, 0.75].map((f) => <SLine key={f} x1={0} x2={plotW} y1={TOP + (h - TOP - BOT) * f} y2={TOP + (h - TOP - BOT) * f} stroke="#17171C" />)}
        <SLine x1={xOpen} x2={xOpen} y1={TOP - 8} y2={h - BOT + 8} stroke={sideCol} strokeOpacity={0.6} strokeDasharray="3 3" />
        {t.closedAt ? <SLine x1={xEnd} x2={xEnd} y1={TOP - 8} y2={h - BOT + 8} stroke={exitCol} strokeOpacity={0.6} strokeDasharray="3 3" /> : null}
        {ks.map((k) => {
          const x = X(k.t + step / 2);
          const g = k.c >= k.o;
          const col = g ? C.up : C.down;
          const top = Y(Math.max(k.o, k.c)), bot = Y(Math.min(k.o, k.c));
          const inTrade = k.t + step > t.openedAt && k.t < (t.closedAt ?? Infinity);
          return (
            <G key={k.t} opacity={inTrade ? 1 : 0.45}>
              <SLine x1={x} x2={x} y1={Y(k.h)} y2={Y(k.l)} stroke={col} strokeWidth={1} />
              <Rect x={x - body / 2} y={top} width={body} height={Math.max(1, bot - top)} fill={col} rx={0.8} />
            </G>
          );
        })}
        {/* entry, exit or the live price, liquidation */}
        <SLine x1={0} x2={plotW} y1={Y(t.entry)} y2={Y(t.entry)} stroke={C.brandSoft} strokeOpacity={0.8} strokeDasharray="4 3" />
        {last !== undefined && last !== t.entry ? <SLine x1={0} x2={plotW} y1={Y(last)} y2={Y(last)} stroke={exitCol} strokeOpacity={0.7} strokeDasharray="2 3" /> : null}
        {t.liq && liqIn && !t.exit ? <SLine x1={0} x2={plotW} y1={Y(t.liq)} y2={Y(t.liq)} stroke={C.down} strokeOpacity={0.55} strokeDasharray="6 4" /> : null}
        {/* the fills */}
        <G>
          <Rect x={xOpen - 5} y={Y(t.entry) - 5} width={10} height={10} rx={5} fill={sideCol} stroke="#000" strokeWidth={2} />
          {t.exit && t.closedAt ? <Rect x={xEnd - 5} y={Y(t.exit) - 5} width={10} height={10} rx={5} fill={exitCol} stroke="#000" strokeWidth={2} /> : null}
          {!t.exit && last !== undefined ? <Rect x={xEnd - 4} y={Y(last) - 4} width={8} height={8} rx={4} fill={C.ink} stroke="#000" strokeWidth={2} /> : null}
        </G>
      </Svg>

      {pin(xOpen, Y(t.entry), 'Open', sideCol, t.side === 'long' ? '#04120A' : '#fff', openBelow)}
      {t.exit && t.closedAt ? pin(xEnd, Y(t.exit), t.liquidated ? 'Liq.' : 'Close', exitCol, exitCol === C.up ? '#04120A' : exitCol === C.ink ? '#000' : '#fff', !openBelow) : null}

      {pill(Y(t.entry), fmtP(t.entry, d), 'rgba(171,159,242,0.22)', C.brandSoft)}
      {last !== undefined && Math.abs(Y(last) - Y(t.entry)) > 18 ? pill(Y(last), fmtP(last, d), exitCol, exitCol === C.up ? '#04120A' : exitCol === C.ink ? '#000' : '#fff') : null}
      {t.liq && !t.exit ? (liqIn ? pill(Y(t.liq), fmtP(t.liq, d), C.downBg, C.down)
        : pill(t.liq < lo ? h - BOT - 10 : TOP - 6, `${t.liq < lo ? '↓' : '↑'} ${fmtP(t.liq, d)}`, C.downBg, C.down)) : null}

      {ticks.map((x, i) => (
        <Txt key={i} v="small" color={C.dim} style={{ position: 'absolute', bottom: 0, left: Math.max(0, Math.min(plotW - 60, X(x) - 30)), width: 60, textAlign: 'center', fontSize: 10, fontVariant: ['tabular-nums'] }}>
          {multiDay ? day(x) : clock(x)}
        </Txt>
      ))}
    </View>
  );
}
