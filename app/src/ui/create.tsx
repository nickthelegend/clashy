// The "+" in the tab bar: a bottom drawer with the four things you can start (a call, a clash, a save, a squad),
// and the call composer as its own drawer. The root layout provides them, so any screen can open them through
// useCreate(): Reply on a post, the "+ Call" pill on Home, and Share on a Practice trade (a call with the trade on it).
import { router, type Href } from 'expo-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { PublicKey } from '@solana/web3.js';
import { BN, USDC, usdcAta } from '@/chain/client';
import { errText, useChain } from '@/chain/useChain';
import { readHoldings, readProfile, readStash, usePoll, type Post } from '@/chain/social';
import type { TradeTag } from '@/chain/calls';
import { STOCKS } from '@/chain/stocks';
import { useLiveCounts } from '@/chain/reads';
import { Composer } from './feed';
import { ART, Btn, ErrorLine, Row, Txt } from './kit';
import { Lottie } from './lottie';
import { Sheet, SheetLabel, SheetTile } from './sheet';
import { AmountSheet } from './amount';
import { BotPic } from './practice-kit';
import { SearchSheet } from './search-sheet';
import { C, F, FONT, fmtUsd } from './tokens';

/** A call to start on a market, optionally with the author's Practice trade on it. */
export type CallShare = { marketId: string; trade?: TradeTag };
type Ctx = { openMenu: () => void; openCall: (replyTo?: Post | null, share?: CallShare) => void; openSave: () => void; openArena: () => void; openSearch: () => void; arenaOpen: boolean };
const CreateCtx = createContext<Ctx>({ openMenu: () => {}, openCall: () => {}, openSave: () => {}, openArena: () => {}, openSearch: () => {}, arenaOpen: false });
export const useCreate = () => useContext(CreateCtx);

function CallDrawer({ open, onClose, replyTo, share }: { open: boolean; onClose: () => void; replyTo: Post | null; share: CallShare | null }) {
  const chain = useChain();
  const me = chain.me;
  const prof = usePoll(() => (me ? readProfile(me) : Promise.resolve(null)), 10000, [me?.toBase58(), open]);
  const stash = usePoll(() => (me ? readStash(me) : Promise.resolve(null)), 8000, [me?.toBase58(), open]);
  const hold = usePoll(() => (me ? readHoldings(STOCKS.map((s) => ({ owner: me, mint: new PublicKey(s.mint) }))) : Promise.resolve(new Map())), 8000, [me?.toBase58(), open]);
  const p = prof.status === 'ready' ? prof.data : null;
  return (
    <Sheet open={open} onClose={onClose} title={replyTo ? 'Reply' : "What's your call?"}>
      {!me ? (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Txt v="body" style={{ textAlign: 'center' }}>Sign in to post calls with your real positions.</Txt>
          <Btn title="Sign in" style={{ marginTop: 12, alignSelf: 'stretch' }} onPress={() => chain.wallet.login?.()} />
        </View>
      ) : !p ? <Txt v="small">Loading your profile…</Txt> : (
        <Composer key={share ? `${share.marketId}:${share.trade?.entry ?? ''}` : 'call'} chain={chain} me={p} replyTo={replyTo} start={share} onCancelReply={onClose} onPosted={onClose}
          stashBalance={stash.status === 'ready' ? stash.data?.balance ?? 0 : null} myHoldings={hold.status === 'ready' ? hold.data : new Map()} />
      )}
    </Sheet>
  );
}

function SaveDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const chain = useChain();
  const { me, progs, bal, onBase } = chain;
  return (
    <AmountSheet open={open} onClose={onClose} title="Add to your Stash" sub={`From your wallet · ${(bal ?? 0).toFixed(2)} USDC available`}
      art={<Image source={ART.stash} style={{ width: 84, height: 84 }} contentFit="contain" />} max={bal ?? 0} presets={[5, 10, 25]}
      confirm={(n) => `Save $${n.toFixed(2)}`} success="Saved to your Stash" successSub="It can't be staked. Take it out any time, or buy real stocks with it."
      onConfirm={async (n) => {
        if (!me || !progs) throw new Error('Sign in first');
        await onBase(`Save ${n} USDC`, () => progs.base.methods.stashSave(new BN(Math.round(n * USDC)), 0).accountsPartial({ owner: me, ownerUsdc: usdcAta(me) }).rpc());
      }} />
  );
}

/** The Arena button in the tab bar opens this: every game in one drawer, real money first, then free practice. */
function ArenaDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const counts = useLiveCounts();
  const c = counts.status === 'ready' ? counts.data : null;
  const go = (to: string) => () => { onClose(); setTimeout(() => router.push(to as Href), 260); };
  const art = (src: number) => <Image source={src} style={{ width: 46, height: 46 }} contentFit="contain" />;
  return (
    <Sheet open={open} onClose={onClose} title="Pick a game" sub="Clash real players for USDC, or practice free against the bot.">
      <SheetLabel index={0}>Play for real</SheetLabel>
      <SheetTile index={1} art={art(ART.tileDuel)} title="Clash" line="1 v 1 from $5 · crypto in 60 s or a stock in 1 hour" accent={C.opp} meta={c?.openDuels ? `${c.openDuels} waiting` : undefined} onPress={go('/clash?mode=crypto')} />
      <SheetTile index={2} art={<View style={{ flexDirection: 'row' }}><Image source={ART.logoSOL} style={{ width: 28, height: 28 }} /><Image source={ART.logoBTC} style={{ width: 28, height: 28, marginLeft: -9 }} /></View>} title="Perps clash" line="Long or short up to 50x · 60 s · liquidated means out" accent="#9B6BFF" onPress={go('/clash?mode=perps')} />
      <SheetTile index={3} art={art(ART.tileRoyale)} title="Battle royale" line="Up to 16 players · $2 in · last one standing" accent="#FFC94A" meta={c?.openRoyales ? `${c.openRoyales} open` : undefined} onPress={go('/onchain-royale')} />
      <SheetTile index={4} art={art(ART.tileWar)} title="Squad war" line="Your squad's chest against another squad" accent={C.brand} onPress={go('/clans')} />
      <SheetLabel index={5}>Free practice</SheetLabel>
      <SheetTile index={6} art={<BotPic size={44} />} title="Practice clash" line="Clash Clashy Bot with practice money, live prices" accent={C.brandSoft} onPress={go('/practice/clash')} />
      <SheetTile index={7} art={art(ART.tileLine)} title="Paper trading" line="$10,000 practice money · stocks, 190 perps, memecoins" accent={C.up} onPress={go('/practice')} />
      <Pressable onPress={go('/arena')} style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Txt v="label" color={C.brandSoft}>Live games, top players and results</Txt>
      </Pressable>
    </Sheet>
  );
}

export function CreateProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [call, setCall] = useState(false);
  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const [share, setShare] = useState<CallShare | null>(null);
  const [save, setSave] = useState(false);
  const [arena, setArena] = useState(false);
  const [search, setSearch] = useState(false);
  const ctx: Ctx = {
    openMenu: () => setMenu(true),
    openCall: (r, s) => { setReplyTo(r ?? null); setShare(r ? null : s ?? null); setCall(true); },
    openSave: () => setSave(true),
    openArena: () => setArena(true),
    openSearch: () => setSearch(true),
    arenaOpen: arena,
  };
  // ⌘K / Ctrl+K opens search from anywhere (web)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); } };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
  const go = (fn: () => void) => () => { setMenu(false); setTimeout(fn, 260); };
  return (
    <CreateCtx.Provider value={ctx}>
      {children}
      <Sheet open={menu} onClose={() => setMenu(false)} title="Start something">
        <SheetTile art={<Image source={ART.megaphone} style={{ width: 50, height: 50 }} contentFit="contain" />} title="What's your call?" line="Post a call with your real position" accent={C.opp} onPress={go(() => ctx.openCall(null))} />
        <SheetTile art={<Image source={ART.tileDuel} style={{ width: 52, height: 52 }} contentFit="contain" />} title="Clash someone" line="From $5 · a stock in 1 hour or crypto in 60 s" onPress={go(() => router.push('/clash' as Href))} />
        <SheetTile art={<Image source={ART.stash} style={{ width: 50, height: 50 }} contentFit="contain" />} title="Save to your Stash" line="Put money aside, then into real stocks" accent={C.up} onPress={go(() => setSave(true))} />
        <SheetTile art={<Image source={ART.clubhouse} style={{ width: 50, height: 50 }} contentFit="contain" />} title="Start or join a squad" line="Chat, chest, wars and the Weekly Cup" accent="#FFC94A" onPress={go(() => router.push('/squads/discover' as Href))} />
      </Sheet>
      <CallDrawer open={call} onClose={() => setCall(false)} replyTo={replyTo} share={share} />
      <SaveDrawer open={save} onClose={() => setSave(false)} />
      <ArenaDrawer open={arena} onClose={() => setArena(false)} />
      <SearchSheet open={search} onClose={() => setSearch(false)} />
    </CreateCtx.Provider>
  );
}
