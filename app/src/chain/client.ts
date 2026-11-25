// On-chain Clashy client: the deployed `clashy` program on Solana + a MagicBlock Ephemeral Rollup.
// Network comes from EXPO_PUBLIC_CLASHY_BASE / EXPO_PUBLIC_CLASHY_ER (defaults: the local MagicBlock stack
// started by chain/scripts/localnet.sh). Every number shown in the on-chain screens is read from these
// accounts; every action is a real signed transaction whose signature is shown to the player.
//
// Money is USDC. A player's wallet holds USDC and nothing else: the sponsor relay (chain/scripts/sponsor.ts) is the
// fee payer of every transaction and the `payer` of every account it creates. The player's wallet (Privy, or a device
// test wallet on the local stack) signs only for what is theirs.
import { Buffer } from 'buffer';
(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import idl from './idl.json';
import type { Clashy } from './idl-types';

export const NET = {
  base: process.env.EXPO_PUBLIC_CLASHY_BASE ?? 'http://127.0.0.1:8999',
  er: process.env.EXPO_PUBLIC_CLASHY_ER ?? 'http://127.0.0.1:7799',
  label: process.env.EXPO_PUBLIC_CLASHY_NET ?? 'Local MagicBlock stack',
  /** Local test validators accept airdrops; devnet and mainnet do not. */
  airdrop: (process.env.EXPO_PUBLIC_CLASHY_NET ?? 'local') === 'local' || !process.env.EXPO_PUBLIC_CLASHY_NET,
  erValidator: new PublicKey(process.env.EXPO_PUBLIC_CLASHY_ER_VALIDATOR ?? 'mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev'),
  /** The sponsor relay that pays fees and rent (chain/scripts/sponsor.ts). */
  sponsor: process.env.EXPO_PUBLIC_CLASHY_SPONSOR ?? 'http://127.0.0.1:8790',
};
/** MagicBlock pieces the app passes explicitly (the IDL resolves the rest: magic program, context, vault). */
export const MB = {
  delegation: new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'),
  permissionProgram: new PublicKey('ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1'),
  oracle: new PublicKey('PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd'),
  /** True where the rollup is MagicBlock's Private Ephemeral Rollup (a TEE): duels use private picks there. */
  private: process.env.EXPO_PUBLIC_CLASHY_PRIVATE_PICKS === '1' || /tee/.test(process.env.EXPO_PUBLIC_CLASHY_ER ?? ''),
};
/** The rollup validator's magic fee vault: the keeper PDA is a delegated fee payer billed through it. */
export const feeVault = () => PublicKey.findProgramAddressSync([Buffer.from('magic-fee-vault'), NET.erValidator.toBuffer()], MB.delegation)[0];
/** A MagicBlock permission PDA (who may read a delegated account on the TEE rollup). */
export const permissionOf = (account: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('permission:'), account.toBuffer()], MB.permissionProgram)[0];
/** The stake currency. The local fork serves mainnet USDC's address with a local mint authority. */
export const USDC_MINT = new PublicKey(process.env.EXPO_PUBLIC_CLASHY_USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC = 1_000_000;
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
/** A wallet's USDC token account (its associated token account). */
export const usdcAta = (owner: PublicKey) => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), USDC_MINT.toBuffer()], ATA_PROGRAM)[0];
/** USDC held by a wallet, in whole USDC (0 before its token account exists). */
export async function usdcBalance(owner: PublicKey): Promise<number> {
  const info = await base.getAccountInfo(usdcAta(owner));
  return info ? Number(info.data.readBigUInt64LE(64)) / USDC : 0;
}
/** "12.50 USDC" from base units. */
export const fmtUsdc = (units: number, dp = 2) => `${(units / USDC).toFixed(dp)} USDC`;
export const base = new Connection(NET.base, 'confirmed');
export const er = new Connection(NET.er, 'confirmed');
export const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
/** Config coins in order: crypto (Coinbase prices) then tokenized stocks (xStocks, Jupiter prices). */
export const COIN_SYMBOLS = ['SOL', 'BTC', 'ETH', 'NVDA', 'TSLA', 'AAPL', 'SPY', 'GOOGL'];
/** Pool masks for duels: the three cryptos, or the five stocks. */
export const CRYPTO_MASK = 0b0000_0111;
export const STOCK_MASK = 0b1111_1000;

/** What signs for the player: their Privy wallet, or a device-held test key on the local stack. */
export type WalletSigner = {
  publicKey: PublicKey;
  kind: 'privy' | 'device';
  /** Shown in the wallet card: the Privy login (email) or "Device test wallet". */
  label: string;
  signTransaction(tx: Transaction): Promise<Transaction>;
  /** The Privy access token the relay checks (it pays only for the signed-in user's own wallet). */
  authToken?: () => Promise<string | null>;
};

const WALLET_KEY = 'clashy:chain:wallet';
/** A device-held test wallet for the local stack (automated tests, phones without Privy). Mainnet uses Privy. */
export async function loadWallet(): Promise<Keypair> {
  // a device test key sits in plain app storage: fine for the local stack and devnet test money, never for real USDC
  if ((process.env.EXPO_PUBLIC_CLASHY_NET ?? '').toLowerCase().startsWith('mainnet')) {
    throw new Error('Setup required: the device test wallet is off on mainnet. Sign in with Privy.');
  }
  const raw = await AsyncStorage.getItem(WALLET_KEY);
  if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  const kp = Keypair.generate();
  await AsyncStorage.setItem(WALLET_KEY, JSON.stringify([...kp.secretKey]));
  return kp;
}

export function deviceSigner(kp: Keypair): WalletSigner {
  return { publicKey: kp.publicKey, kind: 'device', label: 'Device test wallet', signTransaction: async (tx) => { tx.partialSign(kp); return tx; } };
}

let sponsorInfo: Promise<{ sponsor: PublicKey; faucet: boolean }> | null = null;
/** The relay's sponsor key and whether it runs a test-USDC faucet (local fork only). */
export function getSponsor() {
  sponsorInfo ??= fetch(`${NET.sponsor}/info`).then(async (r) => {
    if (!r.ok) throw new Error(`sponsor relay answered HTTP ${r.status}`);
    const j = (await r.json()) as { sponsor: string; faucet: boolean };
    return { sponsor: new PublicKey(j.sponsor), faucet: j.faucet };
  }).catch((e) => {
    sponsorInfo = null;
    console.warn(`sponsor relay ${NET.sponsor} unreachable:`, e);
    throw new Error("Clashy's payment relay is offline, so nothing can be sent right now. Try again in a minute.");
  });
  return sponsorInfo;
}

type Layer = 'base' | 'er';
async function post<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${NET.sponsor}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }).catch((e) => {
    console.warn(`sponsor relay ${NET.sponsor} unreachable:`, e);
    throw new Error("Clashy's payment relay is offline, so nothing can be sent right now. Try again in a minute.");
  });
  const j = (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as T & { error?: string; logs?: string[] };
  if (!r.ok) throw Object.assign(new Error(j.error ?? `HTTP ${r.status}`), { logs: j.logs ?? [] });
  return j;
}
const needs = (tx: Transaction, pk: PublicKey) => tx.instructions.some((ix) => ix.keys.some((k) => k.isSigner && k.pubkey.equals(pk)));

/** Sponsor pays: fee payer = sponsor, the player's wallet signs if the transaction needs it, the relay co-signs and sends. */
export async function sendSponsored(tx: Transaction, layer: Layer, signer: WalletSigner, extra: Keypair[] = []): Promise<string> {
  const { sponsor } = await getSponsor();
  tx.feePayer = sponsor;
  tx.recentBlockhash = (await (layer === 'er' ? er : base).getLatestBlockhash()).blockhash;
  for (const k of extra) tx.partialSign(k);
  const signed = needs(tx, signer.publicKey) ? await signer.signTransaction(tx) : tx;
  const token = (await signer.authToken?.()) ?? null;
  const { sig } = await post<{ sig: string }>('/relay', { tx: Buffer.from(signed.serialize({ requireAllSignatures: false })).toString('base64'), layer }, token);
  return sig;
}

/** Paying someone in USDC: create their USDC account if needed (the sponsor pays its rent), then TransferChecked
 *  `units` out of the payer's own USDC account. Both instructions are the only token moves the relay sponsors. */
export function usdcPayIxs(sponsor: PublicKey, from: PublicKey, to: PublicKey, units: bigint | number) {
  const dest = usdcAta(to);
  const createIdem = new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: sponsor, isSigner: true, isWritable: true }, { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: false }, { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0); // TransferChecked
  data.writeBigUInt64LE(BigInt(units), 1);
  data.writeUInt8(6, 9);
  const transfer = new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: usdcAta(from), isSigner: false, isWritable: true }, { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: dest, isSigner: false, isWritable: true }, { pubkey: from, isSigner: true, isWritable: false },
    ],
    data,
  });
  return [createIdem, transfer];
}

/** Withdraw: sends `amount` USDC (whole units) from the player's USDC account to any Solana address. The sponsor pays
 *  the fee and, if the receiver has no USDC account yet, its rent. */
export async function sendUsdc(signer: WalletSigner, to: PublicKey, amount: number): Promise<string> {
  const { sponsor } = await getSponsor();
  const units = BigInt(Math.round(amount * USDC));
  if (units <= 0n) throw new Error('Enter an amount above 0');
  if (to.equals(signer.publicKey)) throw new Error('That is your own wallet');
  return sendSponsored(new Transaction().add(...usdcPayIxs(sponsor, signer.publicKey, to, units)), 'base', signer);
}

/** Test networks only: 100 test USDC from the relay's faucet (devnet: signed in, once a day per wallet). */
export const faucetUsdc = async (owner: PublicKey, signer?: { authToken?: () => Promise<string | null> } | null) =>
  post<{ usdc: number }>('/faucet', { owner: owner.toBase58() }, (await signer?.authToken?.()) ?? null); // devnet: signed-in users only
/** True when this build plays on the local fork (test USDC from the faucet; no real money). */
export const IS_LOCAL_NET = /127\.0\.0\.1|localhost/.test(NET.base);
/** True on Solana mainnet. */
export const IS_MAINNET = /mainnet/.test(NET.base);
/**
 * Real money (buying USDC, real stakes) is switched on only for a mainnet build made with
 * EXPO_PUBLIC_CLASHY_REAL_MONEY=1, which needs Nick's go (lawyer, geofence, audit fixes). The public beta is practice
 * money plus devnet test USDC, so it never offers a way to put real money in.
 */
export const REAL_MONEY = IS_MAINNET && process.env.EXPO_PUBLIC_CLASHY_REAL_MONEY === '1';

/** An Anchor provider whose `.rpc()` goes through the sponsor relay. */
function relayProvider(connection: typeof base, layer: Layer, signer: WalletSigner, sponsor: PublicKey) {
  const wallet = {
    publicKey: sponsor,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
  };
  return {
    connection, publicKey: sponsor, wallet,
    sendAndConfirm: (tx: Transaction | VersionedTransaction, signers?: Keypair[]) => sendSponsored(tx as Transaction, layer, signer, signers ?? []),
  } as unknown as anchor.AnchorProvider;
}

export function programs(signer: WalletSigner, sponsor: PublicKey) {
  return {
    base: new Program<Clashy>(idl as Clashy, relayProvider(base, 'base', signer, sponsor)),
    er: new Program<Clashy>(idl as Clashy, relayProvider(er, 'er', signer, sponsor)),
  };
}

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const le64 = (n: number | bigint) => new BN(n.toString()).toArrayLike(Buffer, 'le', 8);
export const P = {
  config: pda(Buffer.from('config')),
  auth: pda(Buffer.from('auth')),
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
  profile: (owner: PublicKey) => pda(Buffer.from('profile'), owner.toBuffer()),
  handle: (name: string) => pda(Buffer.from('handle'), Buffer.from(name)),
  stash: (owner: PublicKey) => pda(Buffer.from('stash'), owner.toBuffer()),
  stashVault: (owner: PublicKey) => pda(Buffer.from('stashv'), owner.toBuffer()),
  holding: (owner: PublicKey, mint: PublicKey) => pda(Buffer.from('hold'), owner.toBuffer(), mint.toBuffer()),
  channel: (clan: PublicKey, id: number) => pda(Buffer.from('chan'), clan.toBuffer(), Buffer.from([id])),
  board: (id: number) => pda(Buffer.from('board'), Buffer.from([id])),
  keeper: pda(Buffer.from('keeper')),
  /** A player's private pick for a duel (lives on MagicBlock's TEE rollup until the clash starts). */
  pick: (duel: PublicKey, player: PublicKey) => pda(Buffer.from('pick'), duel.toBuffer(), player.toBuffer()),
};

/** Each coin's price account as the program config names it: a Clashy feed, or MagicBlock's real-time oracle
 *  (Pyth Lazer on the rollup) for SOL, BTC and ETH on devnet and mainnet. Read once, then cached. */
let coinFeeds: Promise<PublicKey[]> | null = null;
export function feedsOf(prog: Program<Clashy>): Promise<PublicKey[]> {
  coinFeeds ??= prog.account.config.fetch(P.config).then((c) => c.coins.slice(0, c.coinCount).map((x) => x.feed)).catch((e) => { coinFeeds = null; throw e; });
  return coinFeeds;
}
export const feedOf = async (prog: Program<Clashy>, coin: number) => (await feedsOf(prog))[coin] ?? P.feed(coin);
/** Whether the keeper exists (it is what lets MagicBlock cranks finish games on their own). */
let keeperUp: Promise<boolean> | null = null;
export const hasKeeper = () => (keeperUp ??= er.getAccountInfo(P.keeper).then((i) => !!i).catch(() => false));
/** The public calls feed (board 0 held end-to-end test posts from before tests got their own board). */
export const FEED_BOARD = 1;
/** u64::MAX: a post that is not a reply. */
export const NO_REPLY = new BN('18446744073709551615');

export const TOUR_STATUS = ['Lobby', 'Live', 'Finished', 'Settled', 'Cancelled'] as const;
export type TourView = {
  key: PublicKey; creator: PublicKey; nonce: number; entry: number; coin: number; maxPlayers: number; count: number;
  players: PublicKey[]; lives: number[]; calls: number[]; startLives: number; alive: number; round: number; maxRounds: number;
  roundSecs: number; roundPrice: number; roundStartedAt: number; status: number; onEr: boolean;
};
/** Reads a tournament from wherever it lives right now (the rollup while delegated, otherwise Solana). */
export async function readTour(prog: Program<Clashy>, key: PublicKey): Promise<TourView | null> {
  const [b, e] = await Promise.all([base.getAccountInfo(key), er.getAccountInfo(key).catch(() => null)]);
  // on the rollup once its copy there is the delegated one (owned by the program); a fresh read-only clone is not yet
  const onEr = !!b && !b.owner.equals(PROGRAM_ID) && !!e && e.owner.equals(PROGRAM_ID);
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
  seedsRevealed: number; vrfPending: boolean; entryPrice: number; exitPrice: number; startTs: number; pnlBps: number[]; ko: number; winner: number;
  onEr: boolean; matchedAt: number; poolMask: number;
};

/** Reads a duel from wherever it lives right now (the rollup while delegated, otherwise Solana). */
export async function readDuel(prog: Program<Clashy>, key: PublicKey): Promise<DuelView | null> {
  const [b, e] = await Promise.all([base.getAccountInfo(key), er.getAccountInfo(key).catch(() => null)]);
  // on the rollup once its copy there is the delegated one (owned by the program); a fresh read-only clone is not yet
  const onEr = !!b && !b.owner.equals(PROGRAM_ID) && !!e && e.owner.equals(PROGRAM_ID);
  const info = onEr ? e : b;
  if (!info || !(onEr || info.owner.equals(PROGRAM_ID))) return null;
  const d = prog.coder.accounts.decode('duel', info.data);
  return {
    key, creator: d.creator, joiner: d.joiner, nonce: Number(d.nonce), stake: Number(d.stake), status: d.status, coin: d.coin,
    lenSecs: d.lenSecs, expiresAt: Number(d.expiresAt), side: [...d.side], lev: [...d.lev], picksCommitted: d.picksCommitted,
    picksRevealed: d.picksRevealed, seedsRevealed: d.seedsRevealed, vrfPending: d.vrfPending, entryPrice: Number(d.entryPrice) / 1e6, exitPrice: Number(d.exitPrice) / 1e6,
    startTs: Number(d.startTs), pnlBps: d.pnlBps.map((x: BN) => Number(x)), ko: d.ko, winner: d.winner, onEr, matchedAt: Number(d.matchedAt), poolMask: d.poolMask,
  };
}

/** Open duels on the challenge board, newest first. */
export async function openDuels(prog: Program<Clashy>): Promise<DuelView[]> {
  const all = await prog.account.duel.all();
  const now = Date.now() / 1000;
  const views = await Promise.all(all.filter((a) => a.account.status === 0 && Number(a.account.expiresAt) > now).map((a) => readDuel(prog, a.publicKey)));
  return (views.filter(Boolean) as DuelView[]).sort((x, y) => y.nonce - x.nonce);
}

export type PlayerRecord = { rating: number; rp: number; wins: number; losses: number; streak: number; bestStreak: number; clan: PublicKey };
/** A player's on-chain record (Elo, rank points, wins, losses, streaks), or null before their player account exists. */
export async function readPlayer(owner: PublicKey): Promise<PlayerRecord | null> {
  const info = await base.getAccountInfo(P.player(owner));
  if (!info) return null;
  const p = new anchor.BorshAccountsCoder(idl as anchor.Idl).decode('Player', info.data);
  // the raw coder keeps the IDL's snake_case field names
  return { rating: p.rating, rp: p.rp, wins: p.wins, losses: p.losses, streak: p.streak, bestStreak: p.best_streak ?? p.bestStreak ?? 0, clan: p.clan };
}

/** A coin's price on Solana: the crank-written base feed, the one clan trades execute and close at. */
export async function basePriceOf(prog: Program<Clashy>, coin: number): Promise<number | null> {
  const info = await base.getAccountInfo(P.baseFeed(coin));
  if (!info) return null;
  return Number(prog.coder.accounts.decode('priceFeed', info.data).price) / 1e6;
}

export async function priceOf(prog: Program<Clashy>, coin: number): Promise<number | null> {
  const feed = await feedOf(prog, coin).catch(() => P.feed(coin));
  const info = (await er.getAccountInfo(feed).catch(() => null)) ?? (await base.getAccountInfo(feed));
  if (!info) return null;
  if (info.owner.equals(MB.oracle)) {
    // MagicBlock oracle (PriceUpdateV2 layout): price i64 at byte 73; the exponent field holds the decimal count (8)
    const d = Buffer.from(info.data);
    const verif = d[40] === 0 ? 2 : 1;
    const o = 40 + verif + 32;
    const raw = Number(d.readBigInt64LE(o));
    const exp = d.readInt32LE(o + 16);
    return raw / 10 ** Math.abs(exp);
  }
  const f = prog.coder.accounts.decode('priceFeed', info.data);
  return Number(f.price) / 1e6;
}

export { BN, Keypair, LAMPORTS_PER_SOL, PublicKey };
