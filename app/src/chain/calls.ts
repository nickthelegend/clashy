// What a call is about. A post on the calls board carries a kind and a 32-byte refkey (chain/programs/clashy Post):
//   0  a plain post                    refkey unused
//   1  a call on one of the five Stash stocks   refkey = the xStock mint (the author's real position shows on it)
//   2  a clash                          refkey = the duel account
//   3  a call on any Solana token       refkey = the token mint (crypto, pump.fun memecoins, any xStock)
//   4  a call on a perp                 refkey = the Practice market id in ASCII, zero-padded ("phoenix-SOL", "SOL-PERP")
// Kinds 3 and 4 need no program change: the program stores kind and refkey as they are.
import { PublicKey } from '@solana/web3.js';
import { stockByMint } from './stocks';

export const CALL_TOKEN = 3;
export const CALL_PERP = 4;

/** A perp's market id packed into a refkey (ids are at most 32 ASCII bytes). */
export function perpRefkey(id: string): PublicKey {
  const b = new TextEncoder().encode(id);
  if (b.length === 0 || b.length > 32 || /[^\x20-\x7e]/.test(id)) throw new Error(`Can't call ${id}: market ids are 1 to 32 plain characters`);
  const out = new Uint8Array(32);
  out.set(b);
  return new PublicKey(out);
}
export function perpIdOf(refkey: PublicKey): string | null {
  const b = refkey.toBytes();
  const end = b.indexOf(0) === -1 ? 32 : b.indexOf(0);
  const id = new TextDecoder().decode(b.slice(0, end));
  return /^[\x20-\x7e]{1,32}$/.test(id) ? id : null;
}

export type CallTarget =
  | { kind: 'stock'; mint: string }
  | { kind: 'market'; id: string }
  | null;
/** What a post calls: a Stash stock (shows the author's position), or any Practice market (token or perp). */
export function callTarget(post: { kind: number; refkey: PublicKey }): CallTarget {
  if (post.kind === 1) return stockByMint(post.refkey.toBase58()) ? { kind: 'stock', mint: post.refkey.toBase58() } : null;
  if (post.kind === CALL_TOKEN) return { kind: 'market', id: post.refkey.toBase58() };
  if (post.kind === CALL_PERP) { const id = perpIdOf(post.refkey); return id ? { kind: 'market', id } : null; }
  return null;
}
