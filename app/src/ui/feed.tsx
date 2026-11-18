// The calls feed: X-style posts where a call carries the author's real position in a tokenized stock, read from
// their on-chain Holding (shares bought through the Stash, and what they cost) and marked to the live price. A call on
// any other market (a coin, a memecoin, a perp) can carry the author's Practice trade, labelled as paper money.
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share as RNShare, TextInput, View } from 'react-native';
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js';
import { BN, COIN_SYMBOLS, NO_REPLY, P, USDC, readDuel, usdcAta, FEED_BOARD } from '@/chain/client';
import { errText, type useChain } from '@/chain/useChain';
import { ago, holdingKey, likedBy, reader, usePoll, type Holding, type Post, type Profile } from '@/chain/social';
import { STOCKS, createStockAtaIx, minSharesFor, stockByMint, swapAccounts, type Stock } from '@/chain/stocks';
import { CALL_PERP, CALL_TOKEN, callTarget, perpRefkey, tradeTag, type TradeTag } from '@/chain/calls';
import { resolveMarket, signedUsd, useCatalog, usePractice, usePrices, type Market } from '@/chain/practice';
import type { CallShare } from './create';
import { MarketCallCard, TradeStrip } from './market-call';
import { MarketLogo } from './practice-kit';
import { ART, AVATARS, Btn, ErrorLine, Row, Txt } from './kit';
import { Heart, More, Reply, Share } from './icons';
import { Lottie } from './lottie';
import { C, F, FONT, fmtUsd } from './tokens';

export const STOCK_ART: Record<string, number> = { NVDA: ART.stockNVDA, TSLA: ART.stockTSLA, AAPL: ART.stockAAPL, SPY: ART.stockSPY, GOOGL: ART.stockGOOGL };
type Chain = ReturnType<typeof useChain>;

export const ProfileAvatar = ({ p, size = 40 }: { p?: Profile; size?: number }) => (
  <Image source={AVATARS[(p?.avatar ?? 0) % AVATARS.length]} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#000' }} contentFit="cover" />
);
const nameOf = (p: Profile | undefined, key: PublicKey) => p?.name ?? `${key.toBase58().slice(0, 4)}…${key.toBase58().slice(-4)}`;

/** The author's live position in the called stock: value at the live price and profit against what they paid. */
export function PositionCard({ stock, holding, price }: { stock: Stock; holding?: Holding; price?: number }) {
  const value = holding && price ? holding.shares * price : null;
  const profit = value !== null && holding ? value - holding.cost : null;
  const pct = profit !== null && holding && holding.cost > 0 ? (profit / holding.cost) * 100 : null;
  return (
    <Pressable onPress={() => router.push(`/stock/${stock.symbol}` as Href)} style={({ pressed }) => ({ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? '#141419' : '#0D0D10', borderRadius: 14, padding: 12 })}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={STOCK_ART[stock.symbol]} style={{ width: 40, height: 40 }} contentFit="contain" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{stock.name}</Txt>
        <Txt v="small" lines={1}>{holding && holding.shares > 0 ? `${stock.symbol} · ${value === null ? '…' : fmtUsd(value)}` : `${stock.symbol} · tokenized stock`}</Txt>
      </View>
      {holding && holding.shares > 0 ? (
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <Txt v="label" color={profit === null ? C.muted : profit >= 0 ? C.up : C.down} style={{ fontVariant: ['tabular-nums'] }}>
            {profit === null ? '…' : `${profit >= 0 ? '+' : '−'}${fmtUsd(Math.abs(profit))}`}
          </Txt>
          <Txt v="small" style={{ fontSize: 11.5, fontVariant: ['tabular-nums'] }} color={pct === null ? C.muted : profit! >= 0 ? C.up : C.down}>{pct !== null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% profit` : 'profit'}</Txt>
        </View>
      ) : (
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="small" style={{ fontSize: 11 }}>{holding ? 'Sold out' : 'No position'}</Txt>
          <Txt v="label">{price ? fmtUsd(price) : '…'}</Txt>
        </View>
      )}
    </Pressable>
  );
}


/** A shared duel result: coin, both calls and the payout, read from the settled duel account. */
function DuelCard({ duel, author }: { duel: PublicKey; author: PublicKey }) {
  const d = usePoll(() => readDuel(reader, duel), 30000, [duel.toBase58()]);
  const v = d.status === 'ready' ? d.data : null;
  if (!v || v.status !== 5) return null;
  const i = v.creator.equals(author) ? 0 : 1;
  const won = v.winner === i + 1;
  const pot = (v.stake * 2 - Math.floor((v.stake * 2 * 300) / 10_000)) / USDC;
  const sym = COIN_SYMBOLS[v.coin] ?? '?';
  return (
    <Pressable onPress={() => router.push(`/match/${duel.toBase58()}` as Href)} style={({ pressed }) => ({ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? '#141419' : '#0D0D10', borderRadius: 14, padding: 12 })}>
      <Image source={ART.tileDuel} style={{ width: 44, height: 44 }} contentFit="contain" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>Clash on {sym}</Txt>
        <Txt v="small" lines={1}>{v.entryPrice.toFixed(2)} → {v.exitPrice.toFixed(2)} · settled on Solana</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt v="small" style={{ fontSize: 11 }}>{won ? 'Won' : v.winner === 3 ? 'Draw' : 'Lost'}</Txt>
        <Txt v="label" color={won ? C.up : C.muted}>{won ? `+${fmtUsd(pot - v.stake / USDC)}` : v.winner === 3 ? '±0' : `−${fmtUsd(v.stake / USDC)}`}</Txt>
      </View>
    </Pressable>
  );
}

type ItemProps = {
  post: Post; profiles: Map<string, Profile>; holdings: Map<string, Holding>; prices: Record<string, number>;
  me?: Profile; onReply: (p: Post) => void; onLike: (p: Post) => void; liking: number | null; threadBelow?: boolean; reply?: boolean;
};

export function PostItem({ post, profiles, holdings, prices, me, onReply, onLike, liking, threadBelow, reply }: ItemProps) {
  const author = profiles.get(post.author.toBase58());
  const target = callTarget(post);
  const stock = target?.kind === 'stock' ? stockByMint(target.mint) : undefined;
  const liked = me ? likedBy(post, me.number) : false;
  const [pop, setPop] = useState(false);
  const share = () => RNShare.share({ message: `${nameOf(author, post.author)} on Clashy: "${post.text}"${stock ? ` · ${stock.symbol}` : ''}` }).catch(() => {});
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingTop: reply ? 6 : 14, paddingBottom: threadBelow ? 0 : 12 }}>
      <View style={{ alignItems: 'center' }}>
        <Pressable onPress={() => router.push(`/u/${post.author.toBase58()}` as Href)}><ProfileAvatar p={author} size={reply ? 34 : 42} /></Pressable>
        {threadBelow ? <View style={{ width: 2, flex: 1, backgroundColor: C.s2, marginTop: 6, borderRadius: 1 }} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row style={{ gap: 6 }}>
          <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{nameOf(author, post.author)}</Txt>
          {author && author.dayStreak >= 2 ? <Txt v="small" style={{ fontSize: 12 }}>🔥{author.dayStreak}</Txt> : null}
          <Txt v="small" style={{ fontSize: 13 }}>· {ago(post.ts)} ago</Txt>
          <View style={{ flex: 1 }} />
          <More size={16} color={C.dim} />
        </Row>
        <Pressable onPress={() => router.push(`/post/${post.seq}` as Href)}><Txt v="body" style={{ marginTop: 3, fontSize: 15, lineHeight: 21 }}>{post.text}</Txt></Pressable>
        {stock ? <PositionCard stock={stock} holding={holdings.get(holdingKey(post.author, post.refkey))} price={prices[stock.symbol]} /> : null}
        {target?.kind === 'market' ? <MarketCallCard id={target.id} trade={post.trade} /> : null}
        {post.kind === 2 ? <DuelCard duel={post.refkey} author={post.author} /> : null}
        <Row style={{ marginTop: 10, gap: 22 }}>
          <Pressable onPress={share} hitSlop={8}><Share size={17} color={C.muted} /></Pressable>
          <Pressable onPress={() => onReply(post)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Reply size={17} color={C.muted} /><Txt v="small">{post.replies || ''}</Txt>
          </Pressable>
          <Pressable onPress={() => { if (!liked && me) setPop(true); onLike(post); }} disabled={liked || liking === post.seq} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {pop ? <Lottie name="heart" size={56} style={{ position: 'absolute', left: -19, top: -19 }} onDone={() => setPop(false)} /> : null}
            <Heart size={17} color={liked ? C.opp : C.muted} filled={liked} /><Txt v="small" color={liked ? C.opp : C.muted}>{post.likes || ''}</Txt>
          </Pressable>
          <View style={{ flex: 1 }} />
          {stock && prices[stock.symbol] ? <Txt v="small" style={{ ...FONT.semi }} color={C.ink}>{stock.symbol} {fmtUsd(prices[stock.symbol])}</Txt> : null}
        </Row>
      </View>
    </View>
  );
}

/** A thread: the call, then its replies (two, then "Show more replies"). */
export function Thread(props: Omit<ItemProps, 'threadBelow' | 'reply'> & { replies: Post[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? props.replies : props.replies.slice(0, 2);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.line }}>
      <PostItem {...props} threadBelow={shown.length > 0} />
      {shown.map((r, i) => <PostItem key={r.seq} {...props} post={r} reply threadBelow={i < shown.length - 1} />)}
      {props.replies.length > 2 && !all ? (
        <Pressable onPress={() => setAll(true)} style={{ paddingLeft: 54, paddingBottom: 12 }}><Txt v="small" color={C.up} style={{ ...FONT.semi }}>Show {props.replies.length - 2} more replies</Txt></Pressable>
      ) : <View style={{ height: 4 }} />}
    </View>
  );
}

/** Write a call. Attach a stock to show your live position; optionally back it now with USDC from your Stash. */
export function Composer({ chain, me, replyTo, start, onCancelReply, onPosted, stashBalance, myHoldings }: {
  chain: Chain; me?: Profile; replyTo: Post | null; start?: CallShare | null; onCancelReply: () => void; onPosted: () => void; stashBalance: number | null; myHoldings: Map<string, Holding>;
}) {
  const [text, setText] = useState('');
  const [sym, setSym] = useState<string | null>(null);
  /** Any other market: a token, a memecoin or a perp from Practice's catalog. */
  const [mkt, setMkt] = useState<Market | null>(null);
  const [browse, setBrowse] = useState(false);
  const [q, setQ] = useState('');
  const { cat } = useCatalog();
  /** Once the person picks or clears a chip, typing stops choosing one for them. */
  const [picked, setPicked] = useState(false);
  const allMarkets = useMemo(() => (cat ? [...cat.crypto, ...cat.perps, ...cat.memes, ...cat.stocks.filter((m) => !m.stockSym)] : []), [cat]);
  const majors = useMemo(() => (cat ? cat.crypto.filter((m) => m.art) : []), [cat]);
  const found = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^\$/, '');
    if (!t) return allMarkets.slice(0, 8);
    const sc = (h: string) => { const x = h.toLowerCase(); return x === t ? 3 : x.startsWith(t) ? 2 : x.includes(t) ? 1 : 0; };
    return allMarkets.map((m) => ({ m, s: Math.max(sc(m.symbol), sc(m.name), m.venueSym ? sc(m.venueSym) : 0) })).filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.m);
  }, [allMarkets, q]);
  const pickMarket = (m: Market | null) => { setPicked(true); setMkt(m); setSym(null); setBack(0); setBrowse(false); setQ(''); setTrade(null); };
  /** The author's Practice trade on the chosen market, attached to the call (paper money, labelled as such). */
  const [trade, setTrade] = useState<TradeTag | null>(start?.trade ?? null);
  const pr = usePractice();
  // opened from Share on a Practice trade: that market, with that trade on it
  useEffect(() => {
    if (!start) return;
    let alive = true;
    resolveMarket(start.marketId).then((m) => { if (alive && m) { setPicked(true); setMkt(m); setSym(null); } }).catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const myTrades = useMemo(() => {
    if (!mkt || !pr.book) return [];
    const open = pr.book.open.filter((p) => p.marketId === mkt.id)
      .map((p) => ({ key: p.id, label: `${p.kind === 'perp' || p.lev > 1 ? `${p.side === 'long' ? 'Long' : 'Short'} ${p.lev}x` : 'Holding'} · open`, tag: { side: p.side, lev: p.lev, entry: p.entry, margin: p.margin } as TradeTag }));
    const closed = pr.book.closed.filter((c) => c.marketId === mkt.id && Date.now() - c.closedAt < 14 * 864e5).slice(0, 3)
      .map((c) => ({ key: c.id, label: `Closed ${signedUsd(c.pnl)}`, tag: { side: c.side, lev: c.lev, entry: c.entry, exit: c.exit, margin: c.margin } as TradeTag }));
    return [...open, ...closed];
  }, [mkt, pr.book]);
  const sameTrade = (a: TradeTag | null, b: TradeTag) => !!a && a.side === b.side && a.lev === b.lev && a.entry === b.entry && a.exit === b.exit && a.margin === b.margin;
  const tag = mkt && trade && !replyTo ? tradeTag(trade) : '';
  const tagBytes = new TextEncoder().encode(tag).length;
  const { prices: mktPx } = usePrices(mkt && trade ? [mkt.mint] : [], 15_000);
  const [back, setBack] = useState(0);
  const [err, setErr] = useState<string>();
  const [step, setStep] = useState<string | null>(null);
  const stock = sym ? STOCKS.find((s) => s.symbol === sym)! : null;
  const held = useMemo(() => (stock && chain.me ? myHoldings.get(holdingKey(chain.me, new PublicKey(stock.mint))) : undefined), [stock, chain.me, myHoldings]);
  const post = async () => {
    const { me: owner, progs, sponsor, onBase, onEr } = chain;
    if (!owner || !progs || !sponsor) return;
    setErr(undefined);
    try {
      const words = text.trim();
      if (!words) throw new Error('Write something first');
      const body = words + tag;
      if (new TextEncoder().encode(body).length > 140) throw new Error(tag ? `140 bytes at most, and the trade takes ${tagBytes}` : '140 bytes at most');
      if (stock && back > 0) {
        setStep(`Buying ${back} USDC of ${stock.symbol}…`);
        const raw = back * USDC;
        const need = Math.max(0, raw - Math.round((stashBalance ?? 0) * USDC));
        const pre = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), createStockAtaIx(sponsor, owner, stock)];
        if (need > 0) pre.push(await progs.base.methods.stashSave(new BN(need), 0).accountsPartial({ owner, ownerUsdc: usdcAta(owner) }).instruction());
        const min = await minSharesFor(stock, raw);
        const sw = await swapAccounts(owner, stock, true);
        await onBase(`Buy ${back} USDC of ${stock.symbol} from the Stash`, () => progs.base.methods.stashInvest(new BN(raw), new BN(min))
          .accountsPartial({ owner, payer: sponsor, holding: P.holding(owner, new PublicKey(stock.mint)), sw })
          .preInstructions(pre).rpc());
      }
      setStep(replyTo ? 'Replying…' : 'Posting…');
      // a Stash stock (kind 1), any token by mint (3), a perp by its market id (4), or a plain post
      const [kind, refkey, label] = stock ? [1, new PublicKey(stock.mint), stock.symbol]
        : mkt?.kind === 'perp' ? [CALL_PERP, perpRefkey(mkt.id), mkt.symbol]
          : mkt ? [CALL_TOKEN, new PublicKey(mkt.mint), mkt.symbol] : [0, PublicKey.default, ''];
      await onEr(replyTo ? 'Reply' : label ? `Call ${label}` : 'Post', progs.er.methods.post(body, replyTo ? 0 : kind, replyTo ? PublicKey.default : refkey, replyTo ? new BN(replyTo.seq) : NO_REPLY)
        .accountsPartial({ author: owner, board: P.board(FEED_BOARD) }));
      setText(''); setSym(null); setMkt(null); setBack(0); setPicked(false); setTrade(null); onCancelReply(); onPosted();
    } catch (e) { setErr(errText(e)); } finally { setStep(null); }
  };
  if (!me) return null;
  return (
    <View style={{ backgroundColor: C.s1, borderRadius: 18, padding: 14, marginBottom: 6 }}>
      {replyTo ? (
        <Row style={{ marginBottom: 8, gap: 6 }}>
          <Txt v="small" style={{ flex: 1 }} lines={1}>Replying to "{replyTo.text}"</Txt>
          <Pressable onPress={onCancelReply} hitSlop={8}><Txt v="small" color={C.brandSoft}>Cancel</Txt></Pressable>
        </Row>
      ) : null}
      <Row style={{ gap: 10, alignItems: 'flex-start' }}>
        <ProfileAvatar p={me} size={36} />
        <TextInput value={text} onChangeText={(t) => {
          setText(t);
          if (!picked && !replyTo) {
            // a Stash stock by ticker or name, else a $TICKER or a major coin from the catalog
            const hit = STOCKS.find((s) => new RegExp(`\\b(${s.symbol}|${s.name.split(' ')[0]})\\b`, 'i').test(t));
            setSym(hit ? hit.symbol : null);
            const tag = /\$([A-Za-z][A-Za-z0-9]{1,11})\b/.exec(t)?.[1]?.toLowerCase();
            const coin = !hit ? (tag ? allMarkets.find((m) => m.kind !== 'perp' && m.symbol.toLowerCase() === tag) : majors.find((m) => new RegExp(`\\b(${m.symbol}|${m.name})\\b`, 'i').test(t))) : undefined;
            if ((coin?.id ?? null) !== (mkt?.id ?? null)) setTrade(null);
            setMkt(coin ?? null);
          }
        }} placeholder={replyTo ? 'Your reply' : trade ? 'How did the trade go, and why?' : "What's your call?"} placeholderTextColor={C.muted} multiline maxLength={140 - tagBytes}
          style={{ flex: 1, color: C.ink, ...FONT.medium, fontSize: 16, minHeight: 40, paddingTop: 8 }} />
      </Row>
      {!replyTo ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {STOCKS.map((s) => (
            <Pressable key={s.symbol} onPress={() => { setPicked(true); setMkt(null); setTrade(null); setSym(sym === s.symbol ? null : s.symbol); setBack(0); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 30, borderRadius: 15, backgroundColor: sym === s.symbol ? C.brand : C.s2 }}>
              <Image source={STOCK_ART[s.symbol]} style={{ width: 18, height: 18 }} contentFit="contain" />
              <Txt v="small" color={sym === s.symbol ? C.onBrand : C.ink} style={{ ...FONT.semi, fontSize: 12 }}>{s.symbol}</Txt>
            </Pressable>
          ))}
          {[...majors, ...(mkt && !majors.some((m) => m.id === mkt.id) ? [mkt] : [])].map((m) => {
            const on = mkt?.id === m.id;
            return (
              <Pressable key={m.id} onPress={() => pickMarket(on ? null : m)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 30, borderRadius: 15, backgroundColor: on ? C.brand : C.s2, maxWidth: 170 }}>
                <MarketLogo m={m} size={18} />
                <Txt v="small" lines={1} color={on ? C.onBrand : C.ink} style={{ ...FONT.semi, fontSize: 12, flexShrink: 1 }}>{m.symbol}</Txt>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setBrowse((b) => !b)} accessibilityRole="button" accessibilityLabel="Call another market"
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, height: 30, borderRadius: 15, backgroundColor: browse ? C.ink : C.s2 }}>
            <Txt v="small" color={browse ? '#000' : C.brandSoft} style={{ ...FONT.semi, fontSize: 12 }}>{browse ? 'Close' : '+ Perps, memecoins…'}</Txt>
          </Pressable>
        </View>
      ) : null}
      {browse && !replyTo ? (
        <View style={{ marginTop: 10 }}>
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search perps, coins, memecoins" placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false}
            style={{ height: 42, borderRadius: 12, backgroundColor: C.s2, paddingHorizontal: 12, color: C.ink, ...FONT.medium, fontSize: 14.5 }} />
          {!cat ? <Txt v="small" style={{ marginTop: 8 }}>Loading markets…</Txt> : found.length === 0 ? <Txt v="small" style={{ marginTop: 8 }}>Nothing called "{q.trim()}"</Txt> : (
            <View style={{ marginTop: 6 }}>
              {found.map((m) => (
                <Pressable key={m.id} onPress={() => pickMarket(m)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, backgroundColor: pressed ? C.s2 : 'transparent' })}>
                  <MarketLogo m={m} size={30} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="label" lines={1} style={{ fontSize: 14 }}>{m.kind === 'perp' ? m.symbol : m.name}</Txt>
                    <Txt v="small" lines={1} style={{ fontSize: 12 }}>{m.kind === 'perp' ? `${m.name} · ${m.venue === 'jupiter' ? 'Jupiter' : m.venue === 'phoenix' ? 'Phoenix' : 'Pacifica'} perp` : m.kind === 'meme' ? `${m.symbol} · pump.fun` : m.symbol}</Txt>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}
      {mkt && !replyTo && !browse ? (
        <View style={{ marginTop: 10 }}>
          <Txt v="small">Calling {mkt.kind === 'perp' ? mkt.symbol : mkt.name}: the post shows its live price, and anyone can tap through to trade it in Practice.</Txt>
          {myTrades.length ? (
            <>
              <Txt v="small" color={C.ink} style={{ marginTop: 10, ...FONT.semi }}>Show your trade</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {[{ key: 'none', label: 'No trade', tag: null as TradeTag | null }, ...myTrades].map((t) => {
                  const on = t.tag ? sameTrade(trade, t.tag) : !trade;
                  return (
                    <Pressable key={t.key} onPress={() => setTrade(t.tag)} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ paddingHorizontal: 11, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: on ? C.ink : C.s2 }}>
                      <Txt v="small" color={on ? '#000' : C.ink} style={{ ...FONT.semi, fontSize: 12 }}>{t.label}</Txt>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : !trade ? (
            <Pressable onPress={() => { onPosted(); setTimeout(() => router.push(`/practice/${mkt.id}` as Href), 260); }} hitSlop={6} style={{ marginTop: 8 }}>
              <Txt v="small" color={C.brandSoft}>Open a Practice trade in {mkt.symbol} to show it on your call ›</Txt>
            </Pressable>
          ) : null}
          {trade ? <View style={{ backgroundColor: '#0D0D10', borderRadius: 14, paddingHorizontal: 12, paddingBottom: 10, marginTop: 8 }}><TradeStrip t={trade} m={mkt} now={mktPx[mkt.mint]?.usdPrice} /></View> : null}
        </View>
      ) : null}
      {stock ? (
        <View style={{ marginTop: 10 }}>
          <Txt v="small">{held && held.shares > 0 ? `Your ${stock.symbol} position shows on the call. Add to it from your Stash:` : `Back your call: buy ${stock.symbol} from your Stash, so your position shows on the post.`}</Txt>
          <Row style={{ gap: 6, marginTop: 8 }}>
            {[0, 5, 10, 25].map((n) => (
              <Pressable key={n} onPress={() => setBack(n)} style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: back === n ? C.ink : C.s2 }}>
                <Txt v="small" color={back === n ? '#000' : C.ink} style={{ ...FONT.semi }}>{n === 0 ? 'Just post' : `$${n}`}</Txt>
              </Pressable>
            ))}
          </Row>
          {back > 0 ? <Txt v="small" style={{ marginTop: 6 }}>Stash has {stashBalance === null ? '…' : `${stashBalance.toFixed(2)} USDC`}{stashBalance !== null && stashBalance < back ? `; ${(back - stashBalance).toFixed(2)} moves in from your wallet first` : ''}. Real {stock.symbol} xStock through Orca, into your own wallet.</Txt> : null}
        </View>
      ) : null}
      {err ? <ErrorLine msg={err} /> : null}
      <Row style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <Txt v="small" style={{ fontSize: 12 }}>{new TextEncoder().encode(text).length + tagBytes}/140{tagBytes ? ` (trade ${tagBytes})` : ''} · everyone sees it right away</Txt>
        <Btn title={step ?? (replyTo ? 'Reply' : 'Post')} h={36} disabled={!!step || !text.trim()} onPress={post} />
      </Row>
    </View>
  );
}

/** First visit after sign-in: pick a name and a clay avatar. Creates the player, the profile and the Stash on chain. */
export function JoinCard({ chain }: { chain: Chain }) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(0);
  return (
    <View style={{ backgroundColor: C.s1, borderRadius: 20, padding: 16, marginBottom: 14 }}>
      <Row style={{ gap: 12 }}>
        <Image source={ART.onSquad} style={{ width: 64, height: 96, borderRadius: 12 }} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Txt v="h2">Pick your name</Txt>
          <Txt v="small" style={{ marginTop: 4 }}>It goes on your calls, clashes and squads. Yours alone, on chain. Fees are on Clashy.</Txt>
        </View>
      </Row>
      <TextInput value={name} onChangeText={(t) => setName(t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16))} placeholder="your_name" placeholderTextColor={C.muted}
        autoCapitalize="none" autoCorrect={false} style={{ marginTop: 14, color: C.ink, ...FONT.semi, fontSize: 17, backgroundColor: C.s2, borderRadius: 12, paddingHorizontal: 12, height: 46 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {AVATARS.map((src, i) => (
          <Pressable key={i} onPress={() => setAvatar(i)} style={{ borderRadius: 24, borderWidth: 2.5, borderColor: avatar === i ? C.brand : 'transparent' }}>
            <Image source={src} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
          </Pressable>
        ))}
      </View>
      {chain.err ? <ErrorLine msg={chain.err} /> : null}
      <Btn title={chain.busy === 'join' ? 'Setting you up…' : 'Join Clashy'} kind="white" style={{ marginTop: 14 }} disabled={!!chain.busy || name.length < 3 || !chain.sponsor} onPress={chain.join(name, avatar)} />
    </View>
  );
}
