// One call on the public board, X-style: the call big (full time, the author's live position), the call it answers
// above it, every reply below it oldest first, and a reply bar pinned to the bottom. Everything is read from the
// board account on the MagicBlock rollup; the board is a ring of the newest posts, so an old call can scroll off it,
// and then this page says so instead of inventing one.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useMemo, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Share as RNShare, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { BN, COIN_SYMBOLS, FEED_BOARD, P, USDC, readDuel } from '@/chain/client';
import { errText, useChain } from '@/chain/useChain';
import { holdingKey, likedBy, reader, readHoldings, useBoard, usePoll, usePrices, useProfiles, type Holding, type Post, type Profile } from '@/chain/social';
import { stockByMint } from '@/chain/stocks';
import { CoinToken, coinName } from '@/ui/clash';
import { useCreate } from '@/ui/create';
import { useArchivedPost } from '@/chain/social-api';
import { PositionCard, PostItem, ProfileAvatar, STOCK_ART } from '@/ui/feed';
import { MarketCallCard } from '@/ui/market-call';
import { callTarget } from '@/chain/calls';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { Heart, Reply, Share } from '@/ui/icons';
import { ART, BackBtn, Bone, Btn, ErrorLine, IconBtn, Row, SkeletonRows, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { Lottie } from '@/ui/lottie';
import { C, F, FONT, S, fmtUsd } from '@/ui/tokens';

/** The board keeps this many of the newest posts; older ones fall off the ring. */
const RING = 24;
const CARD = '#111116';
const EDGE = '#1F1F27';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const go = (to: string) => router.push(to as Href);
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const nameOf = (p: Profile | undefined, key: PublicKey) => p?.name ?? short(key.toBase58());
const fullTime = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

/** Top bar: back, the page name, share. */
function Bar({ title, onShare }: { title: string; onShare?: () => void }) {
  return (
    <Row style={{ gap: 12, height: 48 }}>
      <BackBtn onPress={back} />
      <Txt v="h2" lines={1} style={{ flex: 1, fontSize: 18 }}>{title}</Txt>
      {onShare ? <IconBtn onPress={onShare} size={40}><Share size={18} color={C.ink} /></IconBtn> : null}
    </Row>
  );
}

/** A shared clash result on a call: coin, the move and how the author did. Tap for the full replay. */
function ClashLink({ duel, author }: { duel: PublicKey; author: PublicKey }) {
  const d = usePoll(() => readDuel(reader, duel), 30_000, [duel.toBase58()]);
  if (d.status === 'loading') return <Bone w="100%" h={74} r={18} style={{ marginTop: 12 }} />;
  if (d.status === 'error') return <ErrorLine msg={d.error} onRetry={d.reload} />;
  const v = d.data;
  if (!v) return <Txt v="small" style={{ marginTop: 10 }}>The clash this call shared is no longer on chain.</Txt>;
  const sym = COIN_SYMBOLS[v.coin] ?? '?';
  const i = v.creator.equals(author) ? 0 : 1;
  const settled = v.status === 5;
  const won = settled && v.winner === i + 1;
  const tie = settled && v.winner === 3;
  const pot = v.stake * 2;
  const payout = (pot - Math.floor((pot * 300) / 10_000)) / USDC;
  return (
    <Pressable onPress={() => go(`/match/${duel.toBase58()}`)} style={({ pressed }) => ({ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0D0D10', borderRadius: 18, padding: 12, minHeight: 74, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <CoinToken sym={sym} size={46} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>Clash on {coinName(sym)}</Txt>
        <Txt v="small" lines={1}>{settled ? `${v.entryPrice.toFixed(2)} → ${v.exitPrice.toFixed(2)} · see the replay ›` : v.status === 6 ? 'Cancelled · refunded' : 'Still running ›'}</Txt>
      </View>
      {settled ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="small" style={{ fontSize: 11 }}>{won ? 'Won' : tie ? 'Tie' : 'Lost'}</Txt>
          <Text style={{ ...FONT.bold, fontSize: 16, color: won ? C.up : tie ? C.ink : C.down, fontVariant: ['tabular-nums'] }}>{won ? `+${fmtUsd(payout - v.stake / USDC)}` : tie ? '±0' : `−${fmtUsd(v.stake / USDC)}`}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** One big round action under the focused call (X's reply / like / share row). */
function Action({ onPress, disabled, label, children }: { onPress: () => void; disabled?: boolean; label: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => ({ minWidth: 64, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 14, backgroundColor: pressed ? '#17171D' : 'transparent', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      {children}
    </Pressable>
  );
}

/** The call itself, big: who said it, the words, the author's live position, the full time, the counts, the actions. */
function Focus({ post, author, holding, price, liked, liking, onLike, onReply, onShare }: {
  post: Post; author?: Profile; holding?: Holding; price?: number; liked: boolean; liking: boolean;
  onLike: () => void; onReply: () => void; onShare: () => void;
}) {
  const stock = post.kind === 1 ? stockByMint(post.refkey.toBase58()) : undefined;
  const [pop, setPop] = useState(false);
  return (
    <View style={{ paddingTop: 12 }}>
      <TourTarget id="post-author">
      <Pressable onPress={() => go(`/u/${post.author.toBase58()}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
        <ProfileAvatar p={author} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label" lines={1} style={{ fontSize: 16 }}>{nameOf(author, post.author)}</Txt>
          <Txt v="small" lines={1}>{author ? `Player #${author.number + 1}` : 'No profile yet'}{author && author.dayStreak >= 2 ? ` · 🔥 ${author.dayStreak}-day streak` : ''}</Txt>
        </View>
        <Txt v="small" color={C.brandSoft} style={{ ...FONT.semi }}>Profile ›</Txt>
      </Pressable>
      </TourTarget>

      {/* the words and what rides along: a stock call carries the author's real shares */}
      <TourTarget id={stock ? 'post-receipt' : 'post-call'} style={{ marginTop: 14 }}>
      <Txt v="body" style={{ fontSize: 21, lineHeight: 29, letterSpacing: -0.3 }}>{post.text}</Txt>

      {stock ? (
        <Pressable onPress={() => go(`/stock/${stock.symbol}`)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <PositionCard stock={stock} holding={holding} price={price} />
        </Pressable>
      ) : null}
      {(() => { const t = callTarget(post); return t?.kind === 'market' ? <MarketCallCard id={t.id} trade={post.trade} seq={post.seq} /> : null; })()}
      {post.kind === 2 ? <ClashLink duel={post.refkey} author={post.author} /> : null}
      </TourTarget>

      {stock ? (
        <Row style={{ marginTop: 12, gap: 8 }}>
          <Pressable onPress={() => go(`/stock/${stock.symbol}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingLeft: 8, paddingRight: 14, borderRadius: 22, backgroundColor: pressed ? '#1B1B21' : CARD })}>
            <Image source={STOCK_ART[stock.symbol]} style={{ width: 26, height: 26 }} contentFit="contain" />
            <Txt v="label" style={{ fontSize: 13.5 }}>{stock.symbol}</Txt>
            <Txt v="small" color={C.ink}>{price ? fmtUsd(price) : '…'}</Txt>
            <Txt v="small" color={C.muted}>›</Txt>
          </Pressable>
        </Row>
      ) : null}

      <Txt v="small" style={{ marginTop: 14, fontSize: 13.5 }}>{fullTime(post.ts)} · #{post.seq} on the public board</Txt>

      <Row style={{ marginTop: 14, paddingVertical: 12, gap: 22, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }}>
        <Txt v="small" style={{ fontSize: 14 }}><Txt v="label" style={{ fontSize: 15 }}>{post.replies}</Txt> {post.replies === 1 ? 'Reply' : 'Replies'}</Txt>
        <Txt v="small" style={{ fontSize: 14 }}><Txt v="label" style={{ fontSize: 15 }} color={liked ? C.opp : C.ink}>{post.likes}</Txt> {post.likes === 1 ? 'Like' : 'Likes'}</Txt>
      </Row>

      <TourTarget id="post-actions">
      <Row style={{ justifyContent: 'space-around', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Action onPress={onReply} label="Reply"><Reply size={22} color={C.muted} /></Action>
        <Action onPress={() => { if (!liked) setPop(true); onLike(); }} disabled={liked || liking} label={liked ? 'Liked' : 'Like'}>
          {pop ? <Lottie name="heart" size={70} style={{ position: 'absolute', left: -3, top: -11 }} onDone={() => setPop(false)} /> : null}
          <Heart size={22} color={liked ? C.opp : C.muted} filled={liked} />
        </Action>
        <Action onPress={onShare} label="Share"><Share size={22} color={C.muted} /></Action>
      </Row>
      </TourTarget>
    </View>
  );
}

/** A full-page honest state: the call is not (or no longer) on the board. */
function Gone({ title, body, top }: { title: string; body: string; top: number }) {
  const col = useDeskColumn(680);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: top + 6, paddingHorizontal: S.gutter, paddingBottom: 40 }}>
      <Bar title="Call" />
      <View style={{ alignItems: 'center', marginTop: 36, backgroundColor: CARD, borderRadius: 26, paddingHorizontal: 20, paddingVertical: 26 }}>
        <Image source={ART.emptySearch} style={{ width: 150, height: 150 }} contentFit="contain" />
        <Txt v="title" style={{ textAlign: 'center', marginTop: 8, fontSize: 24, lineHeight: 30 }}>{title}</Txt>
        <Txt v="small" style={{ textAlign: 'center', marginTop: 8, lineHeight: 19, fontSize: 13.5 }}>{body}</Txt>
        <Btn title="Back to Home" kind="white" h={52} style={{ marginTop: 18, alignSelf: 'stretch', borderRadius: 18 }} onPress={() => router.replace('/')} />
      </View>
    </ScrollView>
  );
}

export default function CallThread() {
  const { seq: raw } = useLocalSearchParams<{ seq: string }>();
  const seq = Number(raw);
  const valid = raw !== undefined && /^\d+$/.test(String(raw)) && Number.isSafeInteger(seq);
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(680);
  const { openCall } = useCreate();
  const chain = useChain();
  const { me, wallet, progs, onEr } = chain;
  const board = useBoard();
  const profiles = useProfiles();
  const prices = usePrices();
  const [liking, setLiking] = useState<number | null>(null);
  const [likeErr, setLikeErr] = useState<string>();

  const posts = board.status === 'ready' ? board.data : [];
  const profMap: Map<string, Profile> = profiles.status === 'ready' ? profiles.data : new Map();
  const myProfile = me ? profMap.get(me.toBase58()) : undefined;
  const live = posts.find((p) => p.seq === seq);
  // a call that rolled off the on-chain board comes from the archive (the indexer copies every call)
  const arch = useArchivedPost(board.status === 'ready' && !live && valid ? seq : null);
  const post = live ?? arch.post ?? undefined;
  const parent = post && post.replyTo !== null ? posts.find((p) => p.seq === post.replyTo) : undefined;
  const replies = post ? (live ? posts.filter((p) => p.replyTo === post.seq).sort((a, b) => a.seq - b.seq) : arch.replies) : [];

  // the author's live position on every stock call in this thread
  const shown = [post, parent, ...replies].filter((p): p is Post => !!p && p.kind === 1);
  const pairKey = shown.map((p) => `${p.author.toBase58()}:${p.refkey.toBase58()}`).join(',');
  const pairs = useMemo(() => {
    const seen = new Set<string>();
    return shown.filter((p) => { const k = holdingKey(p.author, p.refkey); if (seen.has(k)) return false; seen.add(k); return true; }).map((p) => ({ owner: p.author, mint: p.refkey }));
  }, [pairKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const holdings = usePoll(() => readHoldings(pairs), 6000, [pairKey]);
  const holdMap: Map<string, Holding> = holdings.status === 'ready' ? holdings.data : new Map();
  const px = prices.status === 'ready' ? prices.data : {};

  // likes go through the program's `like` instruction on the rollup, exactly as Home sends them
  const ts = useTourScroll<ComponentRef<typeof ScrollView>>();
  useScreenTour('post', board.status === 'ready' && !!post && profiles.status !== 'loading');

  const like = async (p: Post) => {
    if (!progs || !me) { wallet.login?.(); return; }
    setLiking(p.seq); setLikeErr(undefined);
    try {
      await onEr('Like', progs.er.methods.like(new BN(p.seq)).accountsPartial({ liker: me, board: P.board(FEED_BOARD) }));
      board.reload();
    } catch (e) { setLikeErr(errText(e)); } finally { setLiking(null); }
  };
  const reply = (p: Post) => (myProfile ? openCall(p) : wallet.login?.());
  const share = (p: Post) => {
    const a = profMap.get(p.author.toBase58());
    const stock = p.kind === 1 ? stockByMint(p.refkey.toBase58()) : undefined;
    RNShare.share({ message: `${nameOf(a, p.author)} on Clashy: "${p.text}"${stock ? ` · ${stock.symbol}` : ''}` }).catch(() => {});
  };

  if (!valid) return <Gone top={insets.top} title="No call here" body={`"${raw ?? ''}" is not a call number. Open a call from the feed to see its thread.`} />;
  if (board.status === 'ready' && !post && (arch.post !== undefined || arch.error)) {
    const newest = posts[0]?.seq ?? -1;
    return seq > newest
      ? <Gone top={insets.top} title="Not posted yet" body={`Call #${seq} does not exist yet: the newest call on the board is #${Math.max(0, newest)}.`} />
      : <Gone top={insets.top} title="This call scrolled off the board" body={arch.error ? `The board keeps only the ${RING} newest posts on chain, and Clashy's archive couldn't be reached: ${arch.error}` : `The board keeps only the ${RING} newest posts on chain, and Clashy's archive doesn't have call #${seq}: it was posted before the archive started.`} />;
  }

  const author = post ? profMap.get(post.author.toBase58()) : undefined;
  const stock = post && post.kind === 1 ? stockByMint(post.refkey.toBase58()) : undefined;
  const barH = 66 + insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: barH + 24 }} keyboardShouldPersistTaps="handled">
        <TourScroll value={ts.scroller}>
        <Bar title={post && post.replyTo !== null ? 'Reply' : 'Call'} onShare={post ? () => share(post) : undefined} />

        {board.status === 'loading' ? (
          <View style={{ marginTop: 10, gap: 14 }}>
            <Row style={{ gap: 12 }}><Bone w={52} h={52} r={26} /><View style={{ flex: 1, gap: 8 }}><Bone w="40%" h={14} /><Bone w="25%" h={11} /></View></Row>
            <Bone w="92%" h={20} /><Bone w="70%" h={20} />
            <Bone w="100%" h={70} r={14} />
            <SkeletonRows n={3} />
          </View>
        ) : board.status === 'error' ? (
          <View style={{ marginTop: 16 }}><ErrorLine msg={board.error} onRetry={board.reload} /></View>
        ) : post ? (
          <>
            {parent ? (
              <Pressable onPress={() => go(`/post/${parent.seq}`)} accessibilityLabel="Open the call this replies to">
                <PostItem post={parent} profiles={profMap} holdings={holdMap} prices={px} me={myProfile} onReply={reply} onLike={like} liking={liking} threadBelow />
              </Pressable>
            ) : post.replyTo !== null ? (
              <Row style={{ gap: 10, marginTop: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: CARD, borderRadius: 14 }}>
                <Reply size={15} color={C.dim} />
                <Txt v="small" style={{ flex: 1 }}>Replying to call #{post.replyTo}, which has scrolled off the board.</Txt>
              </Row>
            ) : null}

            <Focus post={post} author={author} holding={stock ? holdMap.get(holdingKey(post.author, post.refkey)) : undefined} price={stock ? px[stock.symbol] : undefined}
              liked={myProfile ? likedBy(post, myProfile.number) : false} liking={liking === post.seq}
              onLike={() => like(post)} onReply={() => reply(post)} onShare={() => share(post)} />
            {likeErr ? <ErrorLine msg={likeErr} /> : null}

            {replies.length ? (
              <>
                <TourTarget id="post-replies" style={{ marginTop: 18 }}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                  <Txt v="h2">Replies</Txt>
                  <Txt v="small">{replies.length} on the board · oldest first</Txt>
                </Row>
                {replies.map((r) => (
                  <Pressable key={r.seq} onPress={() => go(`/post/${r.seq}`)} style={({ pressed }) => ({ borderBottomWidth: 1, borderBottomColor: C.line, opacity: pressed ? 0.75 : 1 })}>
                    <PostItem post={r} profiles={profMap} holdings={holdMap} prices={px} me={myProfile} onReply={reply} onLike={like} liking={liking} />
                  </Pressable>
                ))}
                </TourTarget>
                {post.replies > replies.length ? (
                  <Txt v="small" style={{ marginTop: 10, textAlign: 'center' }}>{post.replies - replies.length} older {post.replies - replies.length === 1 ? 'reply has' : 'replies have'} scrolled off the board.</Txt>
                ) : null}
              </>
            ) : (
              <TourTarget id="post-noreplies" style={{ marginTop: 18 }}>
              <View style={{ alignItems: 'center', backgroundColor: CARD, borderRadius: 24, padding: 18 }}>
                <Image source={ART.chat} style={{ width: 84, height: 84 }} contentFit="contain" />
                <Txt v="h2" style={{ marginTop: 6 }}>{post.replies > 0 ? 'Replies scrolled off' : 'No replies yet'}</Txt>
                <Txt v="small" style={{ textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                  {post.replies > 0
                    ? `${post.replies} ${post.replies === 1 ? 'reply was' : 'replies were'} posted, but the board only keeps the ${RING} newest posts.`
                    : `Agree, fade it or ask ${nameOf(author, post.author)} why. Replies show up for everyone right away.`}
                </Txt>
                <Btn title={myProfile ? 'Reply' : 'Sign in to reply'} h={44} style={{ marginTop: 12, alignSelf: 'stretch' }} onPress={() => reply(post)} />
              </View>
              </TourTarget>
            )}
          </>
        ) : null}
        </TourScroll>
      </ScrollView>

      {post ? (
        // the reply bar, pinned like X's: opens the reply drawer
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.94)', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
          <View style={{ ...col, paddingHorizontal: S.gutter }}>
            <TourTarget id="post-replybar">
            <Pressable onPress={() => reply(post)} accessibilityLabel="Post your reply"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: 23, paddingLeft: 6, paddingRight: 6, backgroundColor: pressed ? '#18181E' : CARD, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
              {myProfile ? <ProfileAvatar p={myProfile} size={34} /> : <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.s2 }} />}
              <Txt v="body" color={C.muted} style={{ flex: 1, fontSize: 15 }} lines={1}>{myProfile ? 'Post your reply' : wallet.status === 'out' ? 'Sign in to reply' : 'Post your reply'}</Txt>
              <View style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: C.brand, justifyContent: 'center' }}>
                <Txt v="label" color={C.onBrand} style={{ fontSize: 13 }}>Reply</Txt>
              </View>
            </Pressable>
            </TourTarget>
          </View>
        </View>
      ) : null}
    </View>
  );
}
