// A trade, opened: /trade/<post seq> for a trade someone posted on the calls board, /trade/me-<id> for one of your own
// Practice trades (open or closed). The page itself is ui/trade-detail.tsx.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { View } from 'react-native';
import { callTarget } from '@/chain/calls';
import { usePractice } from '@/chain/practice';
import { useBoard, useProfiles } from '@/chain/social';
import { useArchivedPost } from '@/chain/social-api';
import { useMarket } from '@/ui/market-call';
import { ART, Bone, ErrorLine, Pending, Row } from '@/ui/kit';
import { CARD, tradeOf } from '@/ui/practice-kit';
import { TradeDetail, TradeShell } from '@/ui/trade-detail';

function Loading() {
  return (
    <TradeShell>
      <Row style={{ gap: 12 }}><Bone w={40} h={40} r={20} /><View style={{ gap: 8 }}><Bone w={140} h={14} /><Bone w={90} h={11} /></View></Row>
      <Bone w={'100%'} h={150} r={26} style={{ marginTop: 16 }} />
      <Bone w={'100%'} h={290} r={24} style={{ marginTop: 12 }} />
    </TradeShell>
  );
}

export default function TradeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = String(id ?? '');
  return s.startsWith('me-') ? <MyTrade id={s.slice(3)} /> : <PostedTrade seq={Number(s)} />;
}

function MyTrade({ id }: { id: string }) {
  const pr = usePractice();
  const p = pr.book?.open.find((x) => x.id === id) ?? pr.book?.closed.find((x) => x.id === id);
  const m = useMarket(p?.marketId ?? null);
  if (!pr.book) return <Loading />;
  if (!p) {
    return (
      <TradeShell>
        <Pending art={ART.emptySearch} title="Not in your Practice book" body="This trade isn't in the Practice book on this device. It may belong to another account, or Practice was reset." action="Open Practice" onAction={() => router.replace('/practice' as Href)} />
      </TradeShell>
    );
  }
  if (m === undefined) return <Loading />;
  if (m === null) return <TradeShell><View style={{ backgroundColor: CARD, borderRadius: 24, padding: 14 }}><ErrorLine msg={`Practice couldn't load the market ${p.symbol} right now.`} /></View></TradeShell>;
  return <TradeDetail v={{ m, t: tradeOf(p), mine: p }} />;
}

function PostedTrade({ seq }: { seq: number }) {
  const board = useBoard();
  const profiles = useProfiles();
  const live = board.status === 'ready' ? board.data.find((x) => x.seq === seq) : undefined;
  // a trade that rolled off the on-chain board comes from the archive (the indexer copies every call)
  const arch = useArchivedPost(board.status === 'ready' && !live && Number.isInteger(seq) ? seq : null);
  const post = live ?? arch.post ?? undefined;
  const target = post ? callTarget(post) : null;
  const m = useMarket(target?.kind === 'market' ? target.id : null);
  if (board.status === 'loading' || (board.status === 'ready' && !live && arch.post === undefined && !arch.error)) return <Loading />;
  if (board.status === 'error') return <TradeShell><View style={{ backgroundColor: CARD, borderRadius: 24, padding: 14 }}><ErrorLine msg={board.error} onRetry={board.reload} /></View></TradeShell>;
  if (!post || !post.trade || target?.kind !== 'market') {
    return (
      <TradeShell>
        <Pending art={ART.emptySearch} title="This trade isn't on the board" body="The calls board keeps the newest posts, so an older trade can scroll off it. Search shows the trades people posted recently." action="Back home" onAction={() => router.replace('/')} />
      </TradeShell>
    );
  }
  if (m === undefined) return <Loading />;
  if (m === null) return <TradeShell><View style={{ backgroundColor: CARD, borderRadius: 24, padding: 14 }}><ErrorLine msg="Practice couldn't load this trade's market right now." /></View></TradeShell>;
  const author = profiles.status === 'ready' ? profiles.data.get(post.author.toBase58()) : undefined;
  return <TradeDetail v={{ m, t: post.trade, post, author }} />;
}
