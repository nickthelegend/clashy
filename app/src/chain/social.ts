// The social layer, read straight from the Clashy program: player profiles (names, avatars), the public calls
// feed on the MagicBlock rollup, each author's on-chain stock positions (shares + cost basis), the Stash, and
// live prices from the crank's on-chain feeds. Nothing here is invented: when a read fails the hook says so.
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import idl from './idl.json';
import type { Clashy } from './idl-types';
import { NET, P, base, er, COIN_SYMBOLS, FEED_BOARD } from './client';
import { SHARE, STOCKS, stockAta, stockByMint, type Stock } from './stocks';

export const reader = new Program<Clashy>(idl as Clashy, { connection: base } as unknown as anchor.Provider);
export const erReader = new Program<Clashy>(idl as Clashy, { connection: er } as unknown as anchor.Provider);
export type Load<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T };

/** Polls `read` every `ms`; keeps the last good data and reports the first failure. */
export function usePoll<T>(read: () => Promise<T>, ms: number, deps: unknown[] = []): Load<T> & { reload: () => void } {
  const [s, setS] = useState<Load<T>>({ status: 'loading' });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = () => read().then((data) => alive && setS({ status: 'ready', data }))
      .catch((e) => alive && setS((p) => (p.status === 'ready' ? p : { status: 'error', error: `Cannot read ${NET.label}: ${(e as Error).message}` })));
    run();
    const h = setInterval(run, ms);
    return () => { alive = false; clearInterval(h); };
  }, [...deps, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, reload: () => setN((x) => x + 1) } as Load<T> & { reload: () => void };
}

const text = (bytes: number[], len?: number) => Buffer.from(len === undefined ? bytes.filter((b) => b !== 0) : bytes.slice(0, len)).toString('utf8');

export type Profile = { owner: PublicKey; name: string; avatar: number; number: number; dayStreak: number; bestDayStreak: number; dailyLimit: number; pendingLimit: number; pendingAt: number; stakedToday: number; day: number; breakUntil: number; saveBps: number; roundupStep: number };
const toProfile = (p: anchor.IdlAccounts<Clashy>['profile']): Profile => ({
  owner: p.owner, name: text(p.name), avatar: p.avatar, number: p.number, dayStreak: p.dayStreak, bestDayStreak: p.bestDayStreak,
  dailyLimit: Number(p.dailyLimit) / 1e6, pendingLimit: Number(p.pendingLimit) / 1e6, pendingAt: Number(p.pendingAt), stakedToday: Number(p.stakedToday) / 1e6,
  day: Number(p.day), breakUntil: Number(p.breakUntil), saveBps: p.saveBps, roundupStep: Number(p.roundupStep) / 1e6,
});

/** Every profile on chain, by owner. */
export async function readProfiles(): Promise<Map<string, Profile>> {
  const all = await reader.account.profile.all();
  return new Map(all.map(({ account }) => [account.owner.toBase58(), toProfile(account)]));
}
export const useProfiles = () => usePoll(readProfiles, 10_000);
/** Accounts made by chain/tests (handles t_... and b_...): real on the local chain, kept off public boards. */
export const isTestAccount = (p?: Profile) => !!p && /^(t|b)_/.test(p.name);
export async function readProfile(owner: PublicKey): Promise<Profile | null> {
  const p = await reader.account.profile.fetchNullable(P.profile(owner));
  return p ? toProfile(p) : null;
}

export type Post = { seq: number; author: PublicKey; ts: number; kind: number; refkey: PublicKey; replyTo: number | null; likes: number; replies: number; text: string; liked: number[] };
/** The public calls feed (live on the rollup), newest first. */
export async function readBoard(): Promise<Post[]> {
  const b = await erReader.account.board.fetch(P.board(FEED_BOARD));
  return b.posts.filter((p) => !p.author.equals(PublicKey.default)).map((p) => ({
    seq: Number(p.seq), author: p.author, ts: Number(p.ts), kind: p.kind, refkey: p.refkey,
    replyTo: p.replyTo.toString() === '18446744073709551615' ? null : Number(p.replyTo),
    likes: p.likes, replies: p.replies, text: text(p.text, p.len), liked: p.liked,
  })).sort((a, b) => b.seq - a.seq);
}
export const useBoard = () => usePoll(readBoard, 2500);
export const likedBy = (post: Post, number: number) => number < post.liked.length * 8 && !!(post.liked[number >> 3] & (1 << (number & 7)));

export type Holding = { owner: PublicKey; stock: Stock; shares: number; cost: number; realized: number; soldUsdc: number };
/** Positions bought through the Stash: (owner, mint) pairs → shares and USDC cost, read from Holding accounts. */
export async function readHoldings(pairs: { owner: PublicKey; mint: PublicKey }[]): Promise<Map<string, Holding>> {
  if (!pairs.length) return new Map();
  const keys = pairs.map((x) => P.holding(x.owner, x.mint));
  const accs = await reader.account.holding.fetchMultiple(keys);
  const out = new Map<string, Holding>();
  accs.forEach((h, i) => {
    const stock = stockByMint(pairs[i].mint.toBase58());
    if (!h || !stock) return;
    out.set(`${pairs[i].owner.toBase58()}:${pairs[i].mint.toBase58()}`, {
      owner: h.owner, stock, shares: Number(h.shares) / SHARE, cost: Number(h.cost) / 1e6, realized: Number(h.realized) / 1e6, soldUsdc: Number(h.soldUsdc) / 1e6,
    });
  });
  return out;
}
export const holdingKey = (owner: PublicKey, mint: PublicKey) => `${owner.toBase58()}:${mint.toBase58()}`;

/** Live prices of every config coin from the crank's on-chain Solana feeds (USD). */
export async function readPrices(): Promise<Record<string, number>> {
  const feeds = await reader.account.priceFeed.fetchMultiple(COIN_SYMBOLS.map((_, i) => P.baseFeed(i)));
  const out: Record<string, number> = {};
  feeds.forEach((f, i) => { if (f && Number(f.price) > 0) out[COIN_SYMBOLS[i]] = Number(f.price) / 1e6; });
  return out;
}
export const usePrices = () => usePoll(readPrices, 5000);

export type StashView = { goal: number; goalName: string; balance: number; savedManual: number; savedRoundup: number; savedWins: number; withdrawn: number; saves: number };
export async function readStash(owner: PublicKey): Promise<StashView | null> {
  const s = await reader.account.stash.fetchNullable(P.stash(owner));
  if (!s) return null;
  const v = await base.getAccountInfo(P.stashVault(owner), 'confirmed');
  return {
    goal: Number(s.goal) / 1e6, goalName: text(s.goalName), balance: v ? Number(v.data.readBigUInt64LE(64)) / 1e6 : 0,
    savedManual: Number(s.savedManual) / 1e6, savedRoundup: Number(s.savedRoundup) / 1e6, savedWins: Number(s.savedWins) / 1e6,
    withdrawn: Number(s.withdrawn) / 1e6, saves: s.saves,
  };
}

/** A player's stock positions: every stock they have a Holding in, plus the shares sitting in their own wallet. */
export async function readPortfolio(owner: PublicKey) {
  const hold = await readHoldings(STOCKS.map((s) => ({ owner, mint: new PublicKey(s.mint) })));
  const atas = await base.getMultipleAccountsInfo(STOCKS.map((s) => stockAta(owner, s)), 'confirmed');
  return STOCKS.map((s, i) => {
    const h = hold.get(holdingKey(owner, new PublicKey(s.mint)));
    const wallet = atas[i] ? Number(atas[i]!.data.readBigUInt64LE(64)) / SHARE : 0;
    return { stock: s, shares: h?.shares ?? 0, cost: h?.cost ?? 0, realized: h?.realized ?? 0, wallet };
  }).filter((x) => x.shares > 0 || x.wallet > 0 || x.realized !== 0);
}

export const ago = (ts: number) => {
  const s = Math.max(0, Date.now() / 1000 - ts);
  return s < 60 ? `${Math.floor(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

export type ClanServer = {
  key: PublicKey; name: string; crest: number; captain: PublicKey; members: PublicKey[]; chest: number; wins: number; losses: number;
  openVotes: number; atWar: boolean; xp: number; level: number; levelFloor: number; levelNext: number;
};
/** Clan level from on-chain facts only: 300 XP a war won, 100 a member, 10 per USDC in the chest. */
export function clanLevel(wins: number, members: number, chest: number) {
  const xp = wins * 300 + members * 100 + Math.floor(chest) * 10;
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  return { xp, level, levelFloor: (level - 1) ** 2 * 100, levelNext: level ** 2 * 100 };
}
export async function readClanServer(clan: PublicKey): Promise<ClanServer | null> {
  const c = await reader.account.clan.fetchNullable(clan);
  if (!c) return null;
  const members = await reader.account.member.all([{ memcmp: { offset: 8, bytes: clan.toBase58() } }]);
  const chest = Number(c.chest) / 1e6;
  return {
    key: clan, name: text(c.name), crest: c.crest, captain: c.captain, members: members.map((m) => m.account.wallet), chest,
    wins: c.wins, losses: c.losses, openVotes: c.openVotes, atWar: !c.war.equals(PublicKey.default), ...clanLevel(c.wins, c.members, chest),
  };
}
/** The clan this wallet belongs to (default key when none). */
export async function readMyClan(owner: PublicKey): Promise<PublicKey | null> {
  const p = await reader.account.player.fetchNullable(P.player(owner));
  return p && !p.clan.equals(PublicKey.default) ? p.clan : null;
}

export type ChatMsg = { i: number; author: PublicKey; ts: number; kind: number; refkey: PublicKey; text: string };
/** A clan channel on the rollup, oldest first. Null when the channel has not been opened yet. */
export async function readChannel(clan: PublicKey, id = 0): Promise<{ count: number; msgs: ChatMsg[] } | null> {
  const key = P.channel(clan, id);
  const state = await channelState(clan, id);
  if (state === 'none') return null;
  // while delegated, the rollup holds the live copy
  const c = await (state === 'live' ? erReader : reader).account.channel.fetchNullable(key);
  if (!c) return null;
  const count = Number(c.count);
  const n = Math.min(count, c.msgs.length);
  const msgs: ChatMsg[] = [];
  for (let k = count - n; k < count; k++) {
    const m = c.msgs[k % c.msgs.length];
    msgs.push({ i: k, author: m.author, ts: Number(m.ts), kind: m.kind, refkey: m.refkey, text: text(m.text, m.len) });
  }
  return { count, msgs };
}
const DELEGATION = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
/** 'none' (not opened), 'base' (opened, not yet on the rollup) or 'live' (delegated: posting works). */
export async function channelState(clan: PublicKey, id = 0): Promise<'none' | 'base' | 'live'> {
  const info = await base.getAccountInfo(P.channel(clan, id));
  return !info ? 'none' : info.owner.equals(DELEGATION) ? 'live' : 'base';
}
