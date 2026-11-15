// On-chain Clashy client: the deployed `clashy` program on Solana + a MagicBlock Ephemeral Rollup.
// Network comes from EXPO_PUBLIC_CLASHY_BASE / EXPO_PUBLIC_CLASHY_ER (defaults: the local MagicBlock stack
// started by chain/scripts/localnet.sh). Every number shown in the on-chain screens is read from these
// accounts; every action is a real signed transaction whose signature is shown to the player.
import { Buffer } from 'buffer';
(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import idl from './idl.json';
import type { Clashy } from './idl-types';

export const NET = {
  base: process.env.EXPO_PUBLIC_CLASHY_BASE ?? 'http://127.0.0.1:8999',
  er: process.env.EXPO_PUBLIC_CLASHY_ER ?? 'http://127.0.0.1:7799',
  label: process.env.EXPO_PUBLIC_CLASHY_NET ?? 'Local MagicBlock stack',
  /** Local test validators accept airdrops; devnet and mainnet do not. */
  airdrop: (process.env.EXPO_PUBLIC_CLASHY_NET ?? 'local') === 'local' || !process.env.EXPO_PUBLIC_CLASHY_NET,
  erValidator: new PublicKey(process.env.EXPO_PUBLIC_CLASHY_ER_VALIDATOR ?? 'mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev'),
};
export const base = new Connection(NET.base, 'confirmed');
export const er = new Connection(NET.er, 'confirmed');
export const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
export const COIN_SYMBOLS = ['SOL', 'BTC', 'ETH'];

const WALLET_KEY = 'clashy:chain:wallet';
/** A device-held test wallet for the local stack / devnet. Mainnet uses the player's own wallet. */
export async function loadWallet(): Promise<Keypair> {
  const raw = await AsyncStorage.getItem(WALLET_KEY);
  if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  const kp = Keypair.generate();
  await AsyncStorage.setItem(WALLET_KEY, JSON.stringify([...kp.secretKey]));
  return kp;
}

/** anchor.Wallet is Node-only, so the app signs with its own minimal keypair wallet. */
function keypairWallet(kp: Keypair) {
  const sign = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if (tx instanceof VersionedTransaction) tx.sign([kp]);
    else tx.partialSign(kp);
    return tx;
  };
  return {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => sign(tx),
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs.map(sign),
  };
}

export function programs(kp: Keypair) {
  const w = keypairWallet(kp);
  return {
    base: new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(base, w, { commitment: 'confirmed' })),
    er: new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(er, w, { commitment: 'confirmed' })),
  };
}

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const le64 = (n: number | bigint) => new BN(n.toString()).toArrayLike(Buffer, 'le', 8);
export const P = {
  config: pda(Buffer.from('config')),
  feed: (coin: number) => pda(Buffer.from('feed'), Buffer.from([coin])),
  /** Never-delegated Solana copy of a coin feed: what Solana-side instructions (clan trades) read. */
  baseFeed: (coin: number) => pda(Buffer.from('bfeed'), Buffer.from([coin])),
  player: (owner: PublicKey) => pda(Buffer.from('player'), owner.toBuffer()),
  duel: (creator: PublicKey, nonce: number | bigint) => pda(Buffer.from('duel'), creator.toBuffer(), le64(nonce)),
  vault: (of: PublicKey) => pda(Buffer.from('vault'), of.toBuffer()),
  clan: (name: string) => pda(Buffer.from('clan'), Buffer.from(name)),
  chest: (clan: PublicKey) => pda(Buffer.from('chest'), clan.toBuffer()),
  member: (clan: PublicKey, wallet: PublicKey) => pda(Buffer.from('member'), clan.toBuffer(), wallet.toBuffer()),
  proposal: (clan: PublicKey, id: number | bigint) => pda(Buffer.from('proposal'), clan.toBuffer(), le64(id)),
  vote: (proposal: PublicKey, wallet: PublicKey) => pda(Buffer.from('vote'), proposal.toBuffer(), wallet.toBuffer()),
  position: (clan: PublicKey, id: number | bigint) => pda(Buffer.from('position'), clan.toBuffer(), le64(id)),
  tour: (creator: PublicKey, nonce: number | bigint) => pda(Buffer.from('tour'), creator.toBuffer(), le64(nonce)),
};

export const TOUR_STATUS = ['Lobby', 'Live', 'Finished', 'Settled', 'Cancelled'] as const;
export type TourView = {
  key: PublicKey; creator: PublicKey; nonce: number; entry: number; coin: number; maxPlayers: number; count: number;
  players: PublicKey[]; lives: number[]; calls: number[]; startLives: number; alive: number; round: number; maxRounds: number;
  roundSecs: number; roundPrice: number; roundStartedAt: number; status: number; onEr: boolean;
};
/** Reads a tournament from wherever it lives right now (the rollup while delegated, otherwise Solana). */
export async function readTour(prog: Program<Clashy>, key: PublicKey): Promise<TourView | null> {
  const [b, e] = await Promise.all([base.getAccountInfo(key), er.getAccountInfo(key).catch(() => null)]);
  const onEr = !!b && !b.owner.equals(PROGRAM_ID) && !!e;
  const info = onEr ? e : b;
  if (!info || !(onEr || info.owner.equals(PROGRAM_ID))) return null;
  const t = prog.coder.accounts.decode('tournament', info.data);
  const n = t.count as number;
  return {
    key, creator: t.creator, nonce: Number(t.nonce), entry: Number(t.entry), coin: t.coin, maxPlayers: t.maxPlayers, count: n,
    players: (t.players as PublicKey[]).slice(0, n), lives: [...t.lives].slice(0, n), calls: [...t.calls].slice(0, n), startLives: t.startLives,
    alive: t.alive, round: t.round, maxRounds: t.maxRounds, roundSecs: t.roundSecs, roundPrice: Number(t.roundPrice) / 1e6,
    roundStartedAt: Number(t.roundStartedAt), status: t.status, onEr,
  };
}

/** Clan names are stored as fixed 24-byte, zero-padded UTF-8. */
export const clanName = (bytes: number[]) => Buffer.from(bytes.filter((b) => b !== 0)).toString('utf8');
/** Accounts whose first field (right after the 8-byte discriminator) is the clan key. */
export const byClan = (clan: PublicKey) => [{ memcmp: { offset: 8, bytes: clan.toBase58() } }];
/** Live P&L in basis points, same rule as the program (knockout floor at -100%). */
export function pnlBps(entry: number, price: number, side: number, lev: number) {
  if (!entry) return 0;
  const move = ((price - entry) * 10_000) / entry;
  return Math.max(-10_000, (side === 2 ? -move : move) * lev);
}

export async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', all));
}
export const random32 = () => crypto.getRandomValues(new Uint8Array(32));

export const DUEL_STATUS = ['Open', 'Matched', 'Coin rolled', 'Live', 'Finished', 'Settled', 'Cancelled'] as const;
export type DuelView = {
  key: PublicKey; creator: PublicKey; joiner: PublicKey; nonce: number; stake: number; status: number; coin: number;
  lenSecs: number; expiresAt: number; side: number[]; lev: number[]; picksCommitted: number; picksRevealed: number;
  seedsRevealed: number; entryPrice: number; exitPrice: number; startTs: number; pnlBps: number[]; ko: number; winner: number;
  onEr: boolean;
};

/** Reads a duel from wherever it lives right now (the rollup while delegated, otherwise Solana). */
export async function readDuel(prog: Program<Clashy>, key: PublicKey): Promise<DuelView | null> {
  const [b, e] = await Promise.all([base.getAccountInfo(key), er.getAccountInfo(key).catch(() => null)]);
  const onEr = !!b && !b.owner.equals(PROGRAM_ID) && !!e;
  const info = onEr ? e : b;
  if (!info || !(onEr || info.owner.equals(PROGRAM_ID))) return null;
  const d = prog.coder.accounts.decode('duel', info.data);
  return {
    key, creator: d.creator, joiner: d.joiner, nonce: Number(d.nonce), stake: Number(d.stake), status: d.status, coin: d.coin,
    lenSecs: d.lenSecs, expiresAt: Number(d.expiresAt), side: [...d.side], lev: [...d.lev], picksCommitted: d.picksCommitted,
    picksRevealed: d.picksRevealed, seedsRevealed: d.seedsRevealed, entryPrice: Number(d.entryPrice) / 1e6, exitPrice: Number(d.exitPrice) / 1e6,
    startTs: Number(d.startTs), pnlBps: d.pnlBps.map((x: BN) => Number(x)), ko: d.ko, winner: d.winner, onEr,
  };
}

/** Open duels on the challenge board, newest first. */
export async function openDuels(prog: Program<Clashy>): Promise<DuelView[]> {
  const all = await prog.account.duel.all();
  const now = Date.now() / 1000;
  const views = await Promise.all(all.filter((a) => a.account.status === 0 && Number(a.account.expiresAt) > now).map((a) => readDuel(prog, a.publicKey)));
  return (views.filter(Boolean) as DuelView[]).sort((x, y) => y.nonce - x.nonce);
}

export async function priceOf(prog: Program<Clashy>, coin: number): Promise<number | null> {
  const info = (await er.getAccountInfo(P.feed(coin)).catch(() => null)) ?? (await base.getAccountInfo(P.feed(coin)));
  if (!info) return null;
  const f = prog.coder.accounts.decode('priceFeed', info.data);
  return Number(f.price) / 1e6;
}

export async function balance(pk: PublicKey) { return (await base.getBalance(pk)) / LAMPORTS_PER_SOL; }
export async function fund(pk: PublicKey, sol = 5) {
  if (!NET.airdrop) throw new Error(`${NET.label} has no faucet: fund this wallet yourself`);
  const sig = await base.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
  await base.confirmTransaction(sig, 'confirmed');
  return sig;
}
export { BN, Keypair, LAMPORTS_PER_SOL, PublicKey };
