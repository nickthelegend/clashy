// The calls feed: X-style posts where a call carries the author's real position in a tokenized stock, read from
// their on-chain Holding (shares bought through the Stash, and what they cost) and marked to the live price.
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, Share as RNShare, TextInput, View } from 'react-native';
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js';
import { BN, NO_REPLY, P, USDC, usdcAta, FEED_BOARD } from '@/chain/client';
import { errText, type useChain } from '@/chain/useChain';
import { ago, holdingKey, likedBy, type Holding, type Post, type Profile } from '@/chain/social';
import { STOCKS, createStockAtaIx, minSharesFor, stockByMint, swapAccounts, type Stock } from '@/chain/stocks';
import { ART, AVATARS, Btn, ErrorLine, Row, Txt } from './kit';
import { Heart, More, Reply, Share } from './icons';
import { C, F, fmtUsd } from './tokens';

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
    <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0D0D10', borderRadius: 14, borderWidth: 1, borderColor: C.s2, padding: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={STOCK_ART[stock.symbol]} style={{ width: 40, height: 40 }} contentFit="contain" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{stock.name}</Txt>
        <Txt v="small" lines={1}>{holding && holding.shares > 0 ? stock.symbol : `${stock.symbol} · tokenized stock`}</Txt>
      </View>
      {holding && holding.shares > 0 ? (
        <>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt v="small" style={{ fontSize: 11 }}>Position</Txt>
            <Txt v="label">{value === null ? '…' : fmtUsd(value)}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end', minWidth: 74 }}>
            <Txt v="small" style={{ fontSize: 11 }}>Profit</Txt>
            <Txt v="label" color={profit === null ? C.muted : profit >= 0 ? C.up : C.down}>
              {profit === null ? '…' : `${profit >= 0 ? '+' : '−'}${fmtUsd(Math.abs(profit))}`}
            </Txt>
            {pct !== null ? <Txt v="small" style={{ fontSize: 11 }} color={profit! >= 0 ? C.up : C.down}>{`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</Txt> : null}
          </View>
        </>
      ) : (
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="small" style={{ fontSize: 11 }}>{holding ? 'Sold out' : 'No position'}</Txt>
          <Txt v="label">{price ? fmtUsd(price) : '…'}</Txt>
        </View>
      )}
    </View>
  );
}

type ItemProps = {
  post: Post; profiles: Map<string, Profile>; holdings: Map<string, Holding>; prices: Record<string, number>;
  me?: Profile; onReply: (p: Post) => void; onLike: (p: Post) => void; liking: number | null; threadBelow?: boolean; reply?: boolean;
};

export function PostItem({ post, profiles, holdings, prices, me, onReply, onLike, liking, threadBelow, reply }: ItemProps) {
  const author = profiles.get(post.author.toBase58());
  const stock = post.kind === 1 ? stockByMint(post.refkey.toBase58()) : undefined;
  const liked = me ? likedBy(post, me.number) : false;
  const share = () => RNShare.share({ message: `${nameOf(author, post.author)} on Clashy: "${post.text}"${stock ? ` · ${stock.symbol}` : ''}` }).catch(() => {});
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingTop: reply ? 6 : 14, paddingBottom: threadBelow ? 0 : 12 }}>
      <View style={{ alignItems: 'center' }}>
        <ProfileAvatar p={author} size={reply ? 34 : 42} />
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
        <Txt v="body" style={{ marginTop: 3, fontSize: 15, lineHeight: 21 }}>{post.text}</Txt>
        {stock ? <PositionCard stock={stock} holding={holdings.get(holdingKey(post.author, post.refkey))} price={prices[stock.symbol]} /> : null}
        <Row style={{ marginTop: 10, gap: 22 }}>
          <Pressable onPress={share} hitSlop={8}><Share size={17} color={C.muted} /></Pressable>
          <Pressable onPress={() => onReply(post)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Reply size={17} color={C.muted} /><Txt v="small">{post.replies || ''}</Txt>
          </Pressable>
          <Pressable onPress={() => onLike(post)} disabled={liked || liking === post.seq} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Heart size={17} color={liked ? C.opp : C.muted} filled={liked} /><Txt v="small" color={liked ? C.opp : C.muted}>{post.likes || ''}</Txt>
          </Pressable>
          <View style={{ flex: 1 }} />
          {stock && prices[stock.symbol] ? <Txt v="small" style={{ fontFamily: F.semi }} color={C.ink}>{stock.symbol} {fmtUsd(prices[stock.symbol])}</Txt> : null}
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
        <Pressable onPress={() => setAll(true)} style={{ paddingLeft: 54, paddingBottom: 12 }}><Txt v="small" color={C.up} style={{ fontFamily: F.semi }}>Show {props.replies.length - 2} more replies</Txt></Pressable>
      ) : <View style={{ height: 4 }} />}
    </View>
  );
}

/** Write a call. Attach a stock to show your live position; optionally back it now with USDC from your Stash. */
export function Composer({ chain, me, replyTo, onCancelReply, onPosted, stashBalance, myHoldings }: {
  chain: Chain; me?: Profile; replyTo: Post | null; onCancelReply: () => void; onPosted: () => void; stashBalance: number | null; myHoldings: Map<string, Holding>;
}) {
  const [text, setText] = useState('');
  const [sym, setSym] = useState<string | null>(null);
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
      const body = text.trim();
      if (!body) throw new Error('Write something first');
      if (new TextEncoder().encode(body).length > 140) throw new Error('140 bytes at most');
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
      await onEr(replyTo ? 'Reply' : stock ? `Call ${stock.symbol}` : 'Post', progs.er.methods.post(body, stock ? 1 : 0, stock ? new PublicKey(stock.mint) : PublicKey.default, replyTo ? new BN(replyTo.seq) : NO_REPLY)
        .accountsPartial({ author: owner, board: P.board(FEED_BOARD) }));
      setText(''); setSym(null); setBack(0); onCancelReply(); onPosted();
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
        <TextInput value={text} onChangeText={setText} placeholder={replyTo ? 'Your reply' : "What's your call?"} placeholderTextColor={C.muted} multiline maxLength={140}
          style={{ flex: 1, color: C.ink, fontFamily: F.medium, fontSize: 16, minHeight: 40, paddingTop: 8 }} />
      </Row>
      {!replyTo ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {STOCKS.map((s) => (
            <Pressable key={s.symbol} onPress={() => { setSym(sym === s.symbol ? null : s.symbol); setBack(0); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 30, borderRadius: 15, backgroundColor: sym === s.symbol ? C.brand : C.s2 }}>
              <Image source={STOCK_ART[s.symbol]} style={{ width: 18, height: 18 }} contentFit="contain" />
              <Txt v="small" color={sym === s.symbol ? '#fff' : C.ink} style={{ fontFamily: F.semi, fontSize: 12 }}>{s.symbol}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
      {stock ? (
        <View style={{ marginTop: 10 }}>
          <Txt v="small">{held && held.shares > 0 ? `Your ${stock.symbol} position shows on the call. Add to it from your Stash:` : `Back your call: buy ${stock.symbol} from your Stash, so your position shows on the post.`}</Txt>
          <Row style={{ gap: 6, marginTop: 8 }}>
            {[0, 5, 10, 25].map((n) => (
              <Pressable key={n} onPress={() => setBack(n)} style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: back === n ? C.ink : C.s2 }}>
                <Txt v="small" color={back === n ? '#000' : C.ink} style={{ fontFamily: F.semi }}>{n === 0 ? 'Just post' : `$${n}`}</Txt>
              </Pressable>
            ))}
          </Row>
          {back > 0 ? <Txt v="small" style={{ marginTop: 6 }}>Stash has {stashBalance === null ? '…' : `${stashBalance.toFixed(2)} USDC`}{stashBalance !== null && stashBalance < back ? `; ${(back - stashBalance).toFixed(2)} moves in from your wallet first` : ''}. Real {stock.symbol} xStock through Orca, into your own wallet.</Txt> : null}
        </View>
      ) : null}
      {err ? <ErrorLine msg={err} /> : null}
      <Row style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <Txt v="small" style={{ fontSize: 12 }}>{new TextEncoder().encode(text).length}/140 · posts live on the MagicBlock rollup</Txt>
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
          <Txt v="small" style={{ marginTop: 4 }}>It goes on your calls, duels and clan. Yours alone, on chain. Fees are on Clashy.</Txt>
        </View>
      </Row>
      <TextInput value={name} onChangeText={(t) => setName(t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16))} placeholder="your_name" placeholderTextColor={C.muted}
        autoCapitalize="none" autoCorrect={false} style={{ marginTop: 14, color: C.ink, fontFamily: F.semi, fontSize: 17, backgroundColor: C.s2, borderRadius: 12, paddingHorizontal: 12, height: 46 }} />
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
