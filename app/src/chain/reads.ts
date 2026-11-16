// Read-only views of the Clashy program for screens that do not sign anything (Clans tab, Leaderboard, Profile
// history, the desktop rail). Every row comes from a program account on chain; when the chain cannot be read the
// hook says so with the error, it never shows invented rows.
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { useEffect, useState } from 'react';
import type { PublicKey } from '@solana/web3.js';
import idl from './idl.json';
import type { Clashy } from './idl-types';
import { NET, base, clanName } from './client';

export const reader = new Program<Clashy>(idl as Clashy, { connection: base } as unknown as anchor.Provider);

export type Load<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T };

/** Polls `read` every `ms` while mounted; keeps the last good data, reports the first failure. */
function usePoll<T>(read: () => Promise<T>, ms: number, deps: unknown[] = []): Load<T> {
  const [s, setS] = useState<Load<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const run = () => read().then((data) => alive && setS({ status: 'ready', data }))
      .catch((e) => alive && setS((p) => (p.status === 'ready' ? p : { status: 'error', error: `Cannot read ${NET.label}: ${(e as Error).message}` })));
    run();
    const h = setInterval(run, ms);
    return () => { alive = false; clearInterval(h); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

export type ClanRow = { key: PublicKey; name: string; crest: number; captain: PublicKey; members: number; chest: number; score: number; wins: number; losses: number; atWar: boolean };
export async function readClans(): Promise<ClanRow[]> {
  const all = await reader.account.clan.all();
  return all.map(({ publicKey, account: c }) => ({
    key: publicKey, name: clanName(c.name), crest: c.crest, captain: c.captain, members: c.members, chest: Number(c.chest) / 1e6,
    score: Number(c.scorePnl) / 1e6, wins: c.wins, losses: c.losses, atWar: !c.war.equals(anchor.web3.PublicKey.default),
  })).sort((a, b) => b.chest - a.chest || b.members - a.members);
}
export const useClansOnchain = () => usePoll(readClans, 5000);

export type PlayerRow = { owner: PublicKey; rating: number; rp: number; wins: number; losses: number; bestStreak: number; clan: PublicKey };
/** Every player who has finished at least one duel, best first (rank points, then Elo, then wins). */
export async function readLeaderboard(): Promise<PlayerRow[]> {
  const all = await reader.account.player.all();
  return all.map(({ account: p }) => ({ owner: p.owner, rating: p.rating, rp: p.rp, wins: p.wins, losses: p.losses, bestStreak: p.bestStreak, clan: p.clan }))
    .filter((p) => p.wins + p.losses > 0)
    .sort((a, b) => b.rp - a.rp || b.rating - a.rating || b.wins - a.wins);
}
export const useLeaderboardOnchain = () => usePoll(readLeaderboard, 8000);

export type DuelRow = { key: PublicKey; rival: PublicKey; coin: number; stake: number; won: boolean | null; myPnlBps: number; endTs: number; koRival: boolean };
/** Settled duels this wallet played (as creator or joiner), newest first. */
export async function readMyDuels(me: PublicKey): Promise<DuelRow[]> {
  const [mine, joined] = await Promise.all([
    reader.account.duel.all([{ memcmp: { offset: 8, bytes: me.toBase58() } }]),
    reader.account.duel.all([{ memcmp: { offset: 40, bytes: me.toBase58() } }]),
  ]);
  return [...mine, ...joined].filter((d) => d.account.status === 5).map(({ publicKey, account: d }) => {
    const i = d.creator.equals(me) ? 0 : 1;
    return {
      key: publicKey, rival: i === 0 ? d.joiner : d.creator, coin: d.coin, stake: Number(d.stake) / 1e6,
      won: d.winner === 3 ? null : d.winner === i + 1, myPnlBps: Number(d.pnlBps[i]), endTs: Number(d.endTs), koRival: !!(d.ko & (1 << (1 - i))),
    };
  }).sort((a, b) => b.endTs - a.endTs);
}
export const useMyDuels = (me: PublicKey | null) => usePoll(() => (me ? readMyDuels(me) : Promise.resolve([])), 8000, [me?.toBase58()]);

export type LiveCounts = { openDuels: number; openRoyales: number; clans: number };
export async function readLiveCounts(): Promise<LiveCounts> {
  const now = Date.now() / 1000;
  const [duels, tours, clans] = await Promise.all([
    reader.account.duel.all([{ memcmp: { offset: 8 + 32 + 32 + 8 + 8, bytes: anchor.utils.bytes.bs58.encode([0]) } }]),
    reader.account.tournament.all(),
    reader.account.clan.all(),
  ]);
  return {
    openDuels: duels.filter((d) => d.account.status === 0 && Number(d.account.expiresAt) > now).length,
    openRoyales: tours.filter((t) => t.account.status === 0).length,
    clans: clans.length,
  };
}
export const useLiveCounts = () => usePoll(readLiveCounts, 6000);

export type FeedDuel = { key: PublicKey; creator: PublicKey; joiner: PublicKey; status: number; coin: number; stake: number; pnlBps: number[]; winner: number; ko: number; ts: number; entry: number; exit: number };
export type Feed = { open: FeedDuel[]; live: FeedDuel[]; settled: FeedDuel[]; wars: { a: string; b: string; winner: number; returns: number[]; pot: number; ts: number }[] };
/** What is happening on chain right now: open challenges, duels live on the rollup, recent results and clan wars. */
export async function readFeed(): Promise<Feed> {
  const now = Date.now() / 1000;
  const [duels, wars, clans] = await Promise.all([reader.account.duel.all(), reader.account.war.all(), reader.account.clan.all()]);
  const row = ({ publicKey, account: d }: (typeof duels)[number]): FeedDuel => ({
    key: publicKey, creator: d.creator, joiner: d.joiner, status: d.status, coin: d.coin, stake: Number(d.stake) / 1e6,
    pnlBps: d.pnlBps.map((x) => Number(x)), winner: d.winner, ko: d.ko, ts: Number(d.endTs || d.startTs || d.expiresAt), entry: Number(d.entryPrice) / 1e6, exit: Number(d.exitPrice) / 1e6,
  });
  const name = new Map(clans.map((c) => [c.publicKey.toBase58(), clanName(c.account.name)]));
  return {
    open: duels.filter((d) => d.account.status === 0 && Number(d.account.expiresAt) > now).map(row).sort((a, b) => b.ts - a.ts),
    // a duel on the rollup reads as status 2 (rolled) on Solana until it commits back; picks revealed means it is playing
    live: duels.filter((d) => d.account.status === 3 || (d.account.status === 2 && d.account.picksRevealed === 3)).map(row),
    settled: duels.filter((d) => d.account.status === 5).map(row).sort((a, b) => b.ts - a.ts).slice(0, 12),
    wars: wars.filter((w) => w.account.status === 2).map((w) => ({
      a: name.get(w.account.clanA.toBase58()) ?? '?', b: name.get(w.account.clanB.toBase58()) ?? '?', winner: w.account.winner,
      returns: w.account.returnBps.map((x) => Number(x)), pot: (Number(w.account.stake) * 2) / 1e6, ts: Number(w.account.endTs),
    })).sort((x, y) => y.ts - x.ts).slice(0, 8),
  };
}
export const useFeed = () => usePoll(readFeed, 5000);

export type CoinDuelist = { owner: PublicKey; wins: number; losses: number; won: number };
/** Winners of settled on-chain duels on one coin (index into the program's coins), most wins first. */
export async function readCoinDuelists(coin: number): Promise<CoinDuelist[]> {
  const duels = (await reader.account.duel.all()).filter((d) => d.account.status === 5 && d.account.coin === coin);
  const t = new Map<string, CoinDuelist>();
  const get = (pk: PublicKey) => t.get(pk.toBase58()) ?? t.set(pk.toBase58(), { owner: pk, wins: 0, losses: 0, won: 0 }).get(pk.toBase58())!;
  for (const { account: d } of duels) {
    if (d.winner !== 1 && d.winner !== 2) continue;
    const [w, l] = d.winner === 1 ? [d.creator, d.joiner] : [d.joiner, d.creator];
    const pot = (Number(d.stake) * 2) / 1e6;
    get(w).wins += 1;
    get(w).won += pot - Math.floor(pot * 1e6 * 300 / 10_000) / 1e6 - Number(d.stake) / 1e6;
    get(l).losses += 1;
  }
  return [...t.values()].filter((p) => p.wins > 0).sort((a, b) => b.wins - a.wins || b.won - a.won).slice(0, 5);
}
export const useCoinDuelists = (coin: number) => usePoll(() => (coin >= 0 ? readCoinDuelists(coin) : Promise.resolve([])), 10000, [coin]);
