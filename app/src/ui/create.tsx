// The "+" in the tab bar: a bottom drawer with the four things you can start (a call, a clash, a save, a squad),
// and the call composer as its own drawer. Any screen can open them through useCreate() (Reply on a post does).
import { router, type Href } from 'expo-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { BN, USDC, usdcAta } from '@/chain/client';
import { errText, useChain } from '@/chain/useChain';
import { readHoldings, readProfile, readStash, usePoll, type Post } from '@/chain/social';
import { STOCKS } from '@/chain/stocks';
import { useLiveCounts } from '@/chain/reads';
import { CoinToken } from './clash';
import { Composer } from './feed';
import { Bolt, Chat, Crown, Jar, Shield, Swords } from './icons';
import { Btn, Txt } from './kit';
import { Sheet, SheetLabel, SheetTile } from './sheet';
import { AmountSheet } from './amount';
import { BotPic } from './practice-kit';
import { SearchSheet } from './search-sheet';
import { C, FONT } from './tokens';

type Ctx = { openMenu: () => void; openCall: (replyTo?: Post | null) => void; openSave: () => void; openArena: () => void; openSearch: () => void; arenaOpen: boolean };
const CreateCtx = createContext<Ctx>({ openMenu: () => {}, openCall: () => {}, openSave: () => {}, openArena: () => {}, openSearch: () => {}, arenaOpen: false });
export const useCreate = () => useContext(CreateCtx);

function CallDrawer({ open, onClose, replyTo }: { open: boolean; onClose: () => void; replyTo: Post | null }) {
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
        <Composer chain={chain} me={p} replyTo={replyTo} onCancelReply={onClose} onPosted={onClose}
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
      art={<View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Jar size={20} color={C.ink} /></View>} max={bal ?? 0} presets={[5, 10, 25]}
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
  const ic = C.ink;
  return (
    <Sheet open={open} onClose={onClose} title="Pick a game" sub="Clash real players for USDC, or practice free against the bot.">
      <SheetLabel index={0}>Play for real</SheetLabel>
      <SheetTile index={1} art={<Swords size={20} color={ic} />} title="Clash" line="1 v 1 from $5 · crypto in 60 s or a stock in 1 hour" meta={c?.openDuels ? `${c.openDuels} waiting` : undefined} onPress={go('/clash?mode=crypto')} />
      <SheetTile index={2} art={<View style={{ flexDirection: 'row' }}>{(['SOL', 'ETH'] as const).map((k, i) => <View key={k} style={{ marginLeft: i ? -12 : 0 }}><CoinToken sym={k} size={28} /></View>)}</View>} title="Perps clash" line="Long or short up to 50x · 60 s · liquidated means out" onPress={go('/clash?mode=perps')} />
      <SheetTile index={3} art={<Crown size={20} color={ic} />} title="Battle royale" line="Up to 16 players · $2 in · last one standing" meta={c?.openRoyales ? `${c.openRoyales} open` : undefined} onPress={go('/onchain-royale')} />
      <SheetTile index={4} art={<Shield size={20} color={ic} />} title="Squad war" line="Your squad's chest against another squad" onPress={go('/clans')} />
      <SheetLabel index={5}>Free practice</SheetLabel>
      <SheetTile index={6} art={<BotPic size={44} />} bare title="Practice clash" line="Clash Clashy Bot with practice money, live prices" onPress={go('/practice/clash')} />
      <SheetTile index={7} art={<Bolt size={19} color={ic} />} title="Paper trading" line="$10,000 practice money · stocks, 190 perps, memecoins" onPress={go('/practice')} />
      <Pressable onPress={go('/arena')} accessibilityRole="button" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 8 }}>
        <Txt v="small" color={C.brandSoft} style={{ ...FONT.medium }}>Live games, top players and results</Txt>
      </Pressable>
    </Sheet>
  );
}

export function CreateProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [call, setCall] = useState(false);
  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const [save, setSave] = useState(false);
  const [arena, setArena] = useState(false);
  const [search, setSearch] = useState(false);
  const ctx: Ctx = {
    openMenu: () => setMenu(true),
    openCall: (r) => { setReplyTo(r ?? null); setCall(true); },
    openSave: () => setSave(true),
    openArena: () => setArena(true),
    openSearch: () => setSearch(true),
    arenaOpen: arena,
  };
  // ⌘K / Ctrl+K opens search from anywhere in the tabs (web)
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
        <SheetTile index={0} art={<Chat size={20} color={C.ink} />} title="What's your call?" line="Post a call with your real position" onPress={go(() => ctx.openCall(null))} />
        <SheetTile index={1} art={<Swords size={20} color={C.ink} />} title="Clash someone" line="From $5 · a stock in 1 hour or crypto in 60 s" onPress={go(() => router.push('/clash' as Href))} />
        <SheetTile index={2} art={<Jar size={20} color={C.ink} />} title="Save to your Stash" line="Put money aside, then into real stocks" onPress={go(() => setSave(true))} />
        <SheetTile index={3} art={<Shield size={20} color={C.ink} />} title="Start or join a squad" line="Chat, chest, wars and the Weekly Cup" onPress={go(() => router.push('/squads/discover' as Href))} />
      </Sheet>
      <CallDrawer open={call} onClose={() => setCall(false)} replyTo={replyTo} />
      <SaveDrawer open={save} onClose={() => setSave(false)} />
      <ArenaDrawer open={arena} onClose={() => setArena(false)} />
      <SearchSheet open={search} onClose={() => setSearch(false)} />
    </CreateCtx.Provider>
  );
}
