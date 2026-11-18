// Order-book pieces for Practice's Phoenix and Pacifica markets: the venue chip, a candle chart drawn from the venue's
// own candles, the live L2 book (asks above, spread, bids below, depth bars) and the tape of real trades.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { G, Line as SLine, Rect } from 'react-native-svg';
import { VENUES, mid, spreadBps, type BookFeed, type Candle, type Level, type Print, type Venue } from '@/chain/venues';
import { LiveDot, Row, Txt } from './kit';
import { Scrub, fmtWhen } from './scrub';
import { C } from './tokens';

export function VenueChip({ venue, small }: { venue: Venue; small?: boolean }) {
  const book = venue !== 'jupiter';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: book ? 'rgba(171,159,242,0.15)' : C.s2, borderRadius: 7, paddingHorizontal: 7, paddingVertical: small ? 1 : 3 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: venue === 'phoenix' ? '#FF7A45' : venue === 'pacifica' ? '#3EC7E0' : '#C7F284' }} />
      <Txt v="small" color={book ? C.brandSoft : C.muted} style={{ fontSize: small ? 11 : 11.5 }} lines={1}>{VENUES[venue].name}</Txt>
    </View>
  );
}

/** Digits for a price on this market: enough that the tick size shows. */
export function decimalsFor(p?: number) {
  if (!p || !Number.isFinite(p)) return 2;
  if (p >= 10_000) return 1;
  if (p >= 100) return 2;
  if (p >= 1) return 3;
  return Math.min(8, Math.max(4, Math.ceil(-Math.log10(p)) + 3));
}
export const fmtP = (p: number, d: number) => p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(3));
const fmtUsdC = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);

/* ---------- candles ---------- */
export function CandleChart({ candles, w, h = 220, last }: { candles: Candle[]; w: number; h?: number; last?: number }) {
  const data = candles.slice(-60);
  if (data.length < 2) return null;
  const lo0 = Math.min(...data.map((k) => k.l), last ?? Infinity), hi0 = Math.max(...data.map((k) => k.h), last ?? -Infinity);
  const pad = (hi0 - lo0 || hi0 * 0.001) * 0.1;
  const lo = lo0 - pad, hi = hi0 + pad;
  const R_ = 62;
  const cw = (w - R_) / data.length;
  const body = Math.max(1.5, cw * 0.62);
  const Y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (h - 12);
  const px = last ?? data[data.length - 1].c;
  const up = px >= data[0].o;
  const d = decimalsFor(px);
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {[0.25, 0.5, 0.75].map((f) => <SLine key={f} x1={0} x2={w - R_ + 2} y1={h * f} y2={h * f} stroke="#17171C" />)}
        {data.map((k, i) => {
          const x = i * cw + cw / 2;
          const g = k.c >= k.o;
          const col = g ? C.up : C.down;
          const top = Y(Math.max(k.o, k.c)), bot = Y(Math.min(k.o, k.c));
          return (
            <G key={k.t}>
              <SLine x1={x} x2={x} y1={Y(k.h)} y2={Y(k.l)} stroke={col} strokeWidth={1} />
              <Rect x={x - body / 2} y={top} width={body} height={Math.max(1, bot - top)} fill={col} rx={0.8} />
            </G>
          );
        })}
        <SLine x1={0} x2={w} y1={Y(px)} y2={Y(px)} stroke={up ? C.up : C.down} strokeOpacity={0.55} strokeDasharray="2 3" />
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', right: 2, top: Math.max(2, Math.min(h - 22, Y(px) - 10)), backgroundColor: up ? C.up : C.down, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
        <Txt v="small" color="#000" style={{ fontSize: 10.5, fontVariant: ['tabular-nums'] }}>{fmtP(px, d)}</Txt>
      </View>
      <Txt v="small" style={{ position: 'absolute', right: 4, top: 2, fontSize: 10 }}>{fmtP(hi0, d)}</Txt>
      <Txt v="small" style={{ position: 'absolute', right: 4, bottom: 0, fontSize: 10 }}>{fmtP(lo0, d)}</Txt>
      <Scrub w={w - R_} h={h} n={data.length} xAt={(i) => i * cw + cw / 2} yAt={(i) => Y(data[i].c)}
        label={(i) => { const k = data[i]; return { value: fmtP(k.c, d), color: k.c >= k.o ? C.up : C.down, sub: `O ${fmtP(k.o, d)} H ${fmtP(k.h, d)} L ${fmtP(k.l, d)} · ${fmtWhen(k.t)}` }; }} />
    </View>
  );
}

/* ---------- the book ---------- */
const ROWS = 9;
function Side({ rows, kind, max, d, onPick }: { rows: [number, number, number][]; kind: 'bid' | 'ask'; max: number; d: number; onPick?: (p: number) => void }) {
  const col = kind === 'bid' ? C.up : C.down;
  return (
    <View>
      {rows.map(([p, a, cum]) => (
        <Pressable key={`${kind}${p}`} onPress={onPick ? () => onPick(p) : undefined} disabled={!onPick} accessibilityLabel={`${kind === 'bid' ? 'Bid' : 'Ask'} ${p}`}
          style={({ pressed }) => ({ height: 24, flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? '#1A1A21' : 'transparent' })}>
          <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 2, bottom: 2, width: `${Math.min(100, (cum / max) * 100)}%`, backgroundColor: kind === 'bid' ? 'rgba(48,209,88,0.11)' : 'rgba(255,69,58,0.11)', borderRadius: 3 }} />
          <Txt v="small" color={col} style={{ flex: 1, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{fmtP(p, d)}</Txt>
          <Txt v="small" color={C.ink} style={{ flex: 1, textAlign: 'right', fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{fmtSize(a)}</Txt>
          <Txt v="small" style={{ flex: 1, textAlign: 'right', fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{fmtUsdC(cum * p)}</Txt>
        </Pressable>
      ))}
    </View>
  );
}
const withCum = (lv: Level[]) => { let c = 0; return lv.slice(0, ROWS).map(([p, a]) => { c += a; return [p, a, c] as [number, number, number]; }); };

export function OrderBookView({ feed, base, onPick }: { feed: BookFeed; base: string; onPick?: (price: number) => void }) {
  const b = feed.book;
  const bids = useMemo(() => (b ? withCum(b.bids) : []), [b]);
  const asks = useMemo(() => (b ? withCum(b.asks) : []), [b]);
  const m = b ? mid(b) : undefined;
  const d = decimalsFor(m);
  const max = Math.max(bids.at(-1)?.[2] ?? 0, asks.at(-1)?.[2] ?? 0, 1e-9);
  const sp = b ? spreadBps(b) : undefined;
  if (!b) {
    return (
      <View style={{ height: 120, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <LiveDot color={C.brandSoft} />
        <Txt v="small">{feed.error ?? 'Connecting to the live order book'}</Txt>
      </View>
    );
  }
  return (
    <View>
      <Row style={{ height: 26 }}>
        <Txt v="small" style={{ flex: 1, fontSize: 11 }}>Price (USD)</Txt>
        <Txt v="small" style={{ flex: 1, textAlign: 'right', fontSize: 11 }}>Size ({base})</Txt>
        <Txt v="small" style={{ flex: 1, textAlign: 'right', fontSize: 11 }}>Total</Txt>
      </Row>
      <Side rows={[...asks].reverse()} kind="ask" max={max} d={d} onPick={onPick} />
      <Row style={{ height: 36, gap: 10 }}>
        <Txt v="label" style={{ fontVariant: ['tabular-nums'] }}>{m !== undefined ? fmtP(m, d) : '–'}</Txt>
        <Txt v="small" style={{ flex: 1 }}>mid</Txt>
        <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}>Spread {sp !== undefined ? `${sp < 10 ? sp.toFixed(2) : sp.toFixed(1)} bps` : '–'}</Txt>
      </Row>
      <Side rows={bids} kind="bid" max={max} d={d} onPick={onPick} />
    </View>
  );
}

export function TapeView({ trades, base }: { trades: Print[]; base: string }) {
  const [now] = useState(Date.now());
  const d = decimalsFor(trades[0]?.price);
  if (!trades.length) return <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}><Txt v="small">No trades seen yet</Txt></View>;
  return (
    <View>
      <Row style={{ height: 26 }}>
        <Txt v="small" style={{ flex: 1, fontSize: 11 }}>Price (USD)</Txt>
        <Txt v="small" style={{ flex: 1, textAlign: 'right', fontSize: 11 }}>Size ({base})</Txt>
        <Txt v="small" style={{ flex: 1, textAlign: 'right', fontSize: 11 }}>Time</Txt>
      </Row>
      {trades.slice(0, ROWS * 2 + 1).map((t) => (
        <Row key={t.id} style={{ height: 24 }}>
          <Txt v="small" color={t.side === 'buy' ? C.up : C.down} style={{ flex: 1, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{fmtP(t.price, d)}</Txt>
          <Txt v="small" color={C.ink} style={{ flex: 1, textAlign: 'right', fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{fmtSize(t.size)}</Txt>
          <Txt v="small" style={{ flex: 1, textAlign: 'right', fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{clock(t.t, now)}</Txt>
        </Row>
      ))}
    </View>
  );
}
const clock = (t: number, now: number) => {
  const dt = new Date(t);
  const same = new Date(now).toDateString() === dt.toDateString();
  const hh = String(dt.getHours()).padStart(2, '0'), mm = String(dt.getMinutes()).padStart(2, '0'), ss = String(dt.getSeconds()).padStart(2, '0');
  return same ? `${hh}:${mm}:${ss}` : `${dt.getMonth() + 1}/${dt.getDate()} ${hh}:${mm}`;
};

export { fmtUsdC };
