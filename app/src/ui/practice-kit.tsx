// Pieces shared by the two Practice screens: real market logos, the "Paper money" badge, stat tiles, an open paper
// trade with live P&L, and the drawer that closes one at the live price.
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { errText } from '@/chain/useChain';
import {
  VENUES, borrowCost, closeFeeAt, equityOf, fmtPrice, isBookVenue, isFresh, liqPrice, notional, pnlOf, signedPct, signedUsd,
  type Closed, type Market, type Position, type Practice, type Px,
} from '@/chain/practice';
import { bookFresh, fillQty, useBookFeed, type BookFeed } from '@/chain/venues';
import { STOCK_ART } from './feed';
import { ART, ErrorLine, Row, Txt } from './kit';
import { Sheet } from './sheet';
import { C } from './tokens';

export const CARD = '#111116';
export const HAIR = '#1F1F27';
const MAJOR: Record<string, number> = { SOL: ART.logoSOL, BTC: ART.logoBTC, ETH: ART.logoETH };

type LogoOf = Pick<Market, 'kind' | 'icon' | 'stockSym' | 'art'> & { symbol?: string };
/** The real logo: bundled for the five stocks and SOL / BTC / ETH, Jupiter's token icon for everything else. A token
 *  whose image host refuses to be loaded from another site gets its initial on a disc, never an empty circle. */
export function MarketLogo({ m, size = 40 }: { m: LogoOf; size?: number }) {
  const local = m.stockSym ? STOCK_ART[m.stockSym] : m.art ? MAJOR[m.art] : undefined;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [m.icon]);
  // stocks (and stock perps) sit on a rounded tile: their logos are wordmarks, not coins
  const tile = m.kind === 'stock' || !!m.stockSym;
  if (!local && (broken || !m.icon) && !tile) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#24242E', alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="label" color={C.brandSoft} style={{ fontSize: size * 0.42 }}>{(m.symbol ?? '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '?'}</Txt>
      </View>
    );
  }
  if (tile) {
    return (
      <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {local ? <Image source={local} style={{ width: size * 0.86, height: size * 0.86 }} contentFit="contain" />
          : m.icon ? <Image source={{ uri: m.icon }} style={{ width: size, height: size }} contentFit="cover" transition={150} /> : null}
      </View>
    );
  }
  if (local) return <Image source={local} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  if (m.icon) return <Image source={{ uri: m.icon }} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: CARD }} contentFit="cover" transition={150} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.s2 }} />;
}

export function PaperBadge() {
  return (
    <View style={{ backgroundColor: 'rgba(91,108,255,0.16)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Txt v="small" color={C.brandSoft} style={{ fontSize: 11.5 }}>Paper money</Txt>
    </View>
  );
}

export function SideTag({ p }: { p: Pick<Position, 'kind' | 'side' | 'lev'> }) {
  const long = p.side === 'long';
  const text = p.kind === 'perp' ? `${long ? 'Long' : 'Short'} ${p.lev}x` : 'Spot';
  return (
    <View style={{ backgroundColor: p.kind === 'perp' ? (long ? C.upBg : C.downBg) : C.s2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Txt v="small" color={p.kind === 'perp' ? (long ? C.up : C.down) : C.muted} style={{ fontSize: 11 }}>{text}</Txt>
    </View>
  );
}

export function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: HAIR, paddingVertical: 12, paddingHorizontal: 12 }}>
      <Txt v="small" style={{ fontSize: 11.5 }} lines={1}>{label}</Txt>
      <Txt v="h2" color={color} lines={1} style={{ marginTop: 3, fontVariant: ['tabular-nums'] }}>{value}</Txt>
      {sub ? <Txt v="small" style={{ fontSize: 11, marginTop: 1 }} lines={1}>{sub}</Txt> : null}
    </View>
  );
}

export function Cell({ label, value, color, align = 'left' }: { label: string; value: string; color?: string; align?: 'left' | 'center' | 'right' }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
      <Txt v="small" style={{ fontSize: 11.5 }}>{label}</Txt>
      <Txt v="label" color={color} lines={1} style={{ marginTop: 2, fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </View>
  );
}

export function Head({ title, right }: { title: string; right?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 10, gap: 10 }}>
      <Txt v="h2" lines={1} style={{ flexShrink: 1 }}>{title}</Txt>
      {right ? <Txt v="small" lines={1}>{right}</Txt> : null}
    </Row>
  );
}

/** A pill in a bottom bar or drawer. */
export function BarBtn({ title, bg, fg, onPress, disabled, h = 54 }: { title: string; bg: string; fg: string; onPress: () => void; disabled?: boolean; h?: number }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flex: 1, height: h, borderRadius: h / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Txt v="label" color={fg} lines={1} style={{ fontSize: 16 }}>{title}</Txt>
    </Pressable>
  );
}

export function EmptyCard({ art, title, body, action }: { art: number; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20, borderRadius: 24, backgroundColor: '#0E0E12', borderWidth: 1, borderColor: HAIR, borderStyle: 'dashed' }}>
      <Image source={art} style={{ width: 72, height: 72 }} contentFit="contain" />
      <Txt v="label" style={{ marginTop: 6, textAlign: 'center' }}>{title}</Txt>
      <Txt v="small" style={{ marginTop: 3, textAlign: 'center', lineHeight: 18 }}>{body}</Txt>
      {action}
    </View>
  );
}

/** One open paper trade: live P&L (net of the open fee and borrow), entry, live price, liquidation price, Close. */
export function OpenTrade({ p, px, onClose, onPress }: { p: Position; px?: Px; onClose: () => void; onPress?: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { if (p.kind !== 'perp') return; const h = setInterval(() => tick((x) => x + 1), 5000); return () => clearInterval(h); }, [p.kind]);
  const price = px?.usdPrice;
  const pnl = price !== undefined ? pnlOf(p, price) : undefined;
  const pct = pnl !== undefined ? (pnl / p.margin) * 100 : undefined;
  const liq = liqPrice(p);
  const color = pnl === undefined ? C.muted : pnl >= 0 ? C.up : C.down;
  // a card that isn't a link is a plain view: a disabled wrapper would mark its Close button disabled for assistive tech
  const card = { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: HAIR, padding: 14 } as const;
  return (
    <Card onPress={onPress} style={card}>
      <Row style={{ gap: 12 }}>
        <MarketLogo m={p} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ gap: 6 }}>
            <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{p.symbol}</Txt>
            <SideTag p={p} />
          </Row>
          <Txt v="small" lines={1} style={{ marginTop: 2 }}>
            ${p.margin.toLocaleString('en-US', { maximumFractionDigits: 2 })}{p.kind === 'perp' ? ` margin · $${notional(p).toLocaleString('en-US', { maximumFractionDigits: 0 })} size` : ' in'}
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="label" color={color} style={{ fontVariant: ['tabular-nums'] }}>{pnl === undefined ? '…' : signedUsd(pnl)}</Txt>
          <Txt v="small" color={color} style={{ fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{pct === undefined ? 'waiting for price' : signedPct(pct)}</Txt>
        </View>
      </Row>
      <View style={{ height: 1, backgroundColor: HAIR, marginVertical: 12 }} />
      <Row style={{ gap: 8 }}>
        <Cell label="Entry" value={fmtPrice(p.entry)} />
        <Cell label="Live" value={fmtPrice(price)} align="center" />
        <Cell label="Liquidation" value={liq === null ? 'None' : fmtPrice(liq)} color={liq === null ? C.muted : C.down} align="right" />
      </Row>
      <Row style={{ gap: 10, marginTop: 12 }}>
        <Txt v="small" lines={2} style={{ flex: 1, fontSize: 11.5, lineHeight: 16 }}>
          {p.kind !== 'perp' ? 'Practice spot has no fee'
            : isBookVenue(p.venue) ? `${VENUES[p.venue].name} · fee ${fmtUsdSmall(p.openFee)} · funding ${fundingText(borrowCost(p))}`
              : `Fee ${fmtUsdSmall(p.openFee)} · borrow ${fmtUsdSmall(borrowCost(p))} so far`}
        </Txt>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={`Close ${p.symbol}`}
          style={({ pressed }) => ({ height: 44, minWidth: 96, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#1F1F26', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
          <Txt v="label">Close</Txt>
        </Pressable>
      </Row>
    </Card>
  );
}
/** A trade card: tappable when it links somewhere, a plain view otherwise (a disabled wrapper would mark the Close
 *  button inside it disabled for assistive tech). */
function Card({ onPress, style, children }: { onPress?: () => void; style: object; children: ReactNode }) {
  if (!onPress) return <View style={style}>{children}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [style, pressed ? { backgroundColor: '#15151B' } : null]}>{children}</Pressable>;
}
const fmtUsdSmall = (n: number) => `$${n < 0.01 && n > 0 ? '<0.01' : n.toFixed(2)}`;
/** Funding so far: what this position has paid (or been paid). */
const fundingText = (cost: number) => (Math.abs(cost) < 0.005 ? '$0 so far' : cost > 0 ? `${fmtUsdSmall(cost)} paid` : `${fmtUsdSmall(-cost)} received`);

/** Close a paper trade: Jupiter markets at the live price; order-book perps at the market, walking the live book (the
 *  bids for a long, the asks for a short) at the venue's taker fee. Shows what comes back and the P&L first. */
export function CloseSheet({ p, px, pr, onClose, feed: given }: { p: Position | null; px?: Px; pr: Practice; onClose: () => void; feed?: BookFeed }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState<Closed | null>(null);
  const [shown, setShown] = useState<Position | null>(p);
  useEffect(() => { if (p) { setShown(p); setErr(undefined); setDone(null); } }, [p]);
  const q = p ?? shown;
  const onBook = !!q && isBookVenue(q.venue);
  // a book stream of its own only when the screen doesn't already have one for this market
  const mine = !!p && isBookVenue(p.venue) && !given;
  const own = useBookFeed(mine ? (p!.venue as 'phoenix' | 'pacifica') : undefined, mine ? p!.mint.slice(4) : undefined);
  const feed = given ?? own;
  const book = onBook && bookFresh(feed.book) ? feed.book : null;
  const qty = q ? notional(q) / q.entry : 0;
  const fill = onBook && book && q ? fillQty(q.side === 'long' ? book.bids : book.asks, qty) : undefined;
  const price = onBook ? (fill?.complete ? fill.vwap : undefined) : px?.usdPrice;
  const pnl = q && price !== undefined ? pnlOf(q, price) : undefined;
  const back = q && price !== undefined ? equityOf(q, price) : undefined;
  const ready = isFresh(px) && (!onBook || !!fill?.complete);
  const go = async () => {
    if (!q || !px) return;
    setBusy(true); setErr(undefined);
    try {
      const c = await pr.close(q.id, px, 'closed', onBook ? fill?.vwap : undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setDone(c);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!p} onClose={onClose}>
      {!q ? null : done ? (
        <View style={{ alignItems: 'center', paddingVertical: 14 }}>
          <Animated.View entering={ZoomIn.springify().damping(10)} style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: done.pnl >= 0 ? C.up : C.s2, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="title" color={done.pnl >= 0 ? '#04120A' : C.ink} style={{ fontSize: 36 }}>✓</Txt>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(150)} style={{ alignItems: 'center' }}>
            <Txt v="h2" style={{ marginTop: 16 }}>Trade closed</Txt>
            <Txt v="hero" color={done.pnl >= 0 ? C.up : C.down} style={{ fontSize: 48, marginTop: 2, fontVariant: ['tabular-nums'] }}>{signedUsd(done.pnl)}</Txt>
            <Txt v="small" style={{ textAlign: 'center' }}>{done.symbol} at {fmtPrice(done.exit)} · paper money, back in your balance</Txt>
          </Animated.View>
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', marginTop: 22 }}>
            <BarBtn title="Done" bg={C.ink} fg="#000" onPress={onClose} h={56} />
          </View>
        </View>
      ) : (
        <View>
          <Row style={{ gap: 12, marginTop: 4 }}>
            <MarketLogo m={q} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="title" lines={1} style={{ fontSize: 22 }}>Close {q.symbol}</Txt>
              <Row style={{ gap: 6, marginTop: 2 }}><SideTag p={q} /><Txt v="small">opened at {fmtPrice(q.entry)}</Txt></Row>
            </View>
          </Row>
          <View style={{ alignItems: 'center', marginTop: 18 }}>
            <Txt v="small">Profit if you close now</Txt>
            <Txt v="hero" color={pnl === undefined ? C.muted : pnl >= 0 ? C.up : C.down} style={{ fontSize: 48, fontVariant: ['tabular-nums'] }}>{pnl === undefined ? '…' : signedUsd(pnl)}</Txt>
          </View>
          <View style={{ backgroundColor: '#1B1B21', borderRadius: 18, borderWidth: 1, borderColor: '#26262E', padding: 14, marginTop: 14, gap: 10 }}>
            <Line k={onBook ? `Average fill on ${VENUES[q.venue!].name}` : 'Live price'} v={fmtPrice(price)} />
            {onBook ? <Line k="Mark price" v={fmtPrice(px?.usdPrice)} /> : null}
            <Line k="Back to your balance" v={back === undefined ? '…' : `$${back.toFixed(2)}`} />
            {q.kind === 'perp' ? <Line k="Open fee paid" v={fmtUsdSmall(q.openFee)} /> : null}
            {onBook && price !== undefined ? <Line k={`Closing fee (taker ${Number(q.closeFeePct!.toFixed(4))}%)`} v={fmtUsdSmall(closeFeeAt(q, price))} /> : null}
            {q.kind === 'perp' ? <Line k={onBook ? 'Funding so far (approx.)' : 'Borrow so far (approx.)'} v={onBook ? fundingText(borrowCost(q)) : fmtUsdSmall(borrowCost(q))} /> : null}
          </View>
          {!isFresh(px) ? <ErrorLine msg="Waiting for a fresh live price before closing." /> : null}
          {onBook && !book ? <ErrorLine msg={feed.error ?? `Waiting for ${VENUES[q.venue!].name}'s live order book.`} /> : null}
          {onBook && fill && !fill.complete ? <ErrorLine msg="The book doesn't show enough size to close all of it at once right now." /> : null}
          {err ? <ErrorLine msg={err} /> : null}
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            <BarBtn title={busy ? 'Closing…' : price !== undefined ? `Close at ${fmtPrice(price)}${onBook ? ' avg' : ''}` : 'Waiting for price'} bg={C.ink} fg="#000" h={56}
              onPress={go} disabled={busy || !ready} />
          </View>
          <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Practice · paper money. No real USDC moves.</Txt>
        </View>
      )}
    </Sheet>
  );
}

export function Line({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', gap: 12 }}>
      <Txt v="small" style={{ flexShrink: 1 }}>{k}</Txt>
      <Txt v="label" color={color} style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt>
    </Row>
  );
}

/** "Your SOL-PERP long was liquidated" after the watcher settles one. */
export function LiquidatedNotice({ c, onDismiss }: { c: Closed; onDismiss: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.downBg, borderRadius: 18, padding: 12, marginTop: 14 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" color={C.down}>{c.symbol} {c.side} {c.lev}x was liquidated</Txt>
        <Txt v="small" style={{ marginTop: 2, lineHeight: 17 }}>The live price reached {fmtPrice(c.exit)} and the loss used up the ${c.margin.toFixed(2)} margin.</Txt>
      </View>
      <Pressable onPress={onDismiss} hitSlop={8} style={{ height: 44, paddingHorizontal: 10, justifyContent: 'center' }}><Txt v="small" color={C.ink}>OK</Txt></Pressable>
    </Animated.View>
  );
}
