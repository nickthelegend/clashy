// Squads (on-chain clans) for the Discord-style Squads tab and Discover. A player can be in many squads: each
// membership is a Member PDA (seeds "member", clan, wallet), so "my squads" is every Member account whose wallet is
// me. A squad's P&L is real: the chest's realised trading score (Clan.score_pnl) plus its members' stock positions
// bought through the Stash (Holding accounts marked to the crank's on-chain prices). Chat activity comes from each
// squad's channel accounts (the live copy on the rollup while delegated). Nothing here is invented.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey } from '@solana/web3.js';
import { P, base, clanName, er } from './client';
import { clanLevel, readHoldings, reader, type ChatMsg } from './social';
import { STOCKS } from './stocks';

/** Chat channels a squad has (the program allows ids 0..3). */
export const CHANNELS = [
  { id: 0, name: 'general', blurb: 'Hang out, call trades, challenge each other' },
  { id: 1, name: 'trades', blurb: 'Post the stocks you bought and why' },
] as const;
export const channelName = (id: number) => CHANNELS.find((c) => c.id === id)?.name ?? `channel-${id}`;

export type Squad = {
  key: PublicKey; name: string; crest: number; captain: PublicKey; members: number; chest: number; scorePnl: number;
  wins: number; losses: number; openVotes: number; atWar: boolean; joinedAt: number; xp: number; level: number; levelFloor: number; levelNext: number;
};
type ClanAcc = NonNullable<Awaited<ReturnType<typeof reader.account.clan.fetchNullable>>>;
const toSquad = (key: PublicKey, c: ClanAcc, joinedAt = 0): Squad => {
  const chest = Number(c.chest) / 1e6;
  return {
    key, name: clanName(c.name), crest: c.crest, captain: c.captain, members: c.members, chest, scorePnl: Number(c.scorePnl) / 1e6,
    wins: c.wins, losses: c.losses, openVotes: c.openVotes, atWar: !c.war.equals(PublicKey.default), joinedAt, ...clanLevel(c.wins, c.members, chest),
  };
};

/** Every squad this wallet is in (one Member account each), in the order joined. */
export async function readMySquads(me: PublicKey): Promise<Squad[]> {
  const mine = await reader.account.member.all([{ memcmp: { offset: 40, bytes: me.toBase58() } }]);
  if (!mine.length) return [];
  const keys = mine.map((m) => m.account.clan);
  const clans = await reader.account.clan.fetchMultiple(keys);
  return clans.flatMap((c, i) => (c ? [toSquad(keys[i], c, Number(mine[i].account.joinedAt))] : [])).sort((a, b) => a.joinedAt - b.joinedAt);
}

export type ChannelMeta = { state: 'none' | 'base' | 'live'; count: number; last: ChatMsg | null };
const DELEGATION = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const chanKey = (clan: PublicKey, id: number) => `${clan.toBase58()}:${id}`;
/** Message count and last message of many squad channels at once (two batched reads: Solana, then the rollup). */
export async function readChannelMetas(clans: PublicKey[], ids: number[] = CHANNELS.map((c) => c.id)): Promise<Map<string, ChannelMeta>> {
  const pairs = clans.flatMap((clan) => ids.map((id) => ({ clan, id, key: P.channel(clan, id) })));
  const out = new Map<string, ChannelMeta>();
  if (!pairs.length) return out;
  const onBase = await base.getMultipleAccountsInfo(pairs.map((p) => p.key));
  const live = pairs.filter((_, i) => onBase[i]?.owner.equals(DELEGATION));
  const onEr = live.length ? await er.getMultipleAccountsInfo(live.map((p) => p.key)) : [];
  pairs.forEach((p, i) => {
    const b = onBase[i];
    if (!b) { out.set(chanKey(p.clan, p.id), { state: 'none', count: 0, last: null }); return; }
    const isLive = b.owner.equals(DELEGATION);
    const info = isLive ? onEr[live.indexOf(p)] : b;
    if (!info) { out.set(chanKey(p.clan, p.id), { state: isLive ? 'live' : 'base', count: 0, last: null }); return; }
    const c = reader.coder.accounts.decode('channel', info.data);
    const count = Number(c.count);
    const m = count ? c.msgs[(count - 1) % c.msgs.length] : null;
    out.set(chanKey(p.clan, p.id), {
      state: isLive ? 'live' : 'base', count,
      last: m ? { i: count - 1, author: m.author, ts: Number(m.ts), kind: m.kind, refkey: m.refkey, text: Buffer.from(m.text.slice(0, m.len)).toString('utf8') } : null,
    });
  });
  return out;
}
export const metaOf = (m: Map<string, ChannelMeta> | null, clan: PublicKey, id: number) => m?.get(chanKey(clan, id));

/* ---------- unread: the message count this device last saw, per channel ---------- */
const SEEN = 'clashy:squads:seen:';
export async function readSeen(clans: PublicKey[], ids: number[] = CHANNELS.map((c) => c.id)): Promise<Map<string, number>> {
  const keys = clans.flatMap((c) => ids.map((id) => chanKey(c, id)));
  const rows = await AsyncStorage.multiGet(keys.map((k) => SEEN + k)).catch(() => [] as [string, string | null][]);
  return new Map(rows.map(([k, v]) => [k.slice(SEEN.length), Number(v ?? 0)]));
}
export const markSeen = (clan: PublicKey, id: number, count: number) => AsyncStorage.setItem(SEEN + chanKey(clan, id), String(count)).catch(() => {});
export const seenOf = (m: Map<string, number> | null, clan: PublicKey, id: number) => m?.get(chanKey(clan, id)) ?? 0;

/** The squad selected in the rail last time, so the tab reopens where you left it. */
const SELECTED = 'clashy:squads:selected';
export const loadSelected = () => AsyncStorage.getItem(SELECTED).catch(() => null);
export const saveSelected = (clan: PublicKey) => AsyncStorage.setItem(SELECTED, clan.toBase58()).catch(() => {});

/* ---------- squad P&L: chest score + members' stock positions ---------- */
export type SquadRank = Squad & { wallets: PublicKey[]; stocksPnl: number; pnl: number; priced: boolean };
/** Profit on a wallet's Stash positions: live value minus cost of what is held, plus what selling already realised. */
export async function readStockPnl(owners: PublicKey[], prices: Record<string, number>) {
  const hold = await readHoldings(owners.flatMap((owner) => STOCKS.map((s) => ({ owner, mint: new PublicKey(s.mint) }))));
  const out = new Map<string, { pnl: number; priced: boolean }>();
  for (const h of hold.values()) {
    const k = h.owner.toBase58();
    const row = out.get(k) ?? { pnl: 0, priced: true };
    const px = prices[h.stock.symbol];
    if (h.shares > 0) { if (px) row.pnl += h.shares * px - h.cost; else row.priced = false; }
    row.pnl += h.realized;
    out.set(k, row);
  }
  return out;
}
/** Every squad on chain with its member wallets and combined P&L, best first. */
export async function readSquadBoard(prices: Record<string, number>): Promise<SquadRank[]> {
  const [clans, members] = await Promise.all([reader.account.clan.all(), reader.account.member.all()]);
  const wallets = new Map<string, { w: PublicKey; at: number }[]>();
  for (const { account: m } of members) {
    const k = m.clan.toBase58();
    wallets.set(k, [...(wallets.get(k) ?? []), { w: m.wallet, at: Number(m.joinedAt) }]);
  }
  const owners = [...new Map(members.map((m) => [m.account.wallet.toBase58(), m.account.wallet])).values()];
  const stock = await readStockPnl(owners, prices);
  return clans.map(({ publicKey, account }) => {
    const s = toSquad(publicKey, account);
    const ws = (wallets.get(publicKey.toBase58()) ?? []).sort((a, b) => a.at - b.at).map((x) => x.w);
    let stocksPnl = 0;
    let priced = true;
    for (const w of ws) { const r = stock.get(w.toBase58()); if (r) { stocksPnl += r.pnl; priced &&= r.priced; } }
    return { ...s, wallets: ws, stocksPnl, pnl: s.scorePnl + stocksPnl, priced };
  }).sort((a, b) => b.pnl - a.pnl || b.chest - a.chest || b.members - a.members);
}

/** Whether this wallet is a member of the squad (its Member account exists). */
export async function isMember(clan: PublicKey, me: PublicKey) {
  return !!(await base.getAccountInfo(P.member(clan, me)));
}

/** "+$12.40" / "−$3.10" / "$0.00". */
export const fmtPnl = (n: number) => `${n > 0.004 ? '+' : n < -0.004 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pnlColor = (n: number, up: string, down: string, flat: string) => (n > 0.004 ? up : n < -0.004 ? down : flat);
