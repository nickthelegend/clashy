// Sign in with a Solana wallet, no new wallet feature needed. The server hands out a one-time nonce; the app signs a
// transaction that carries "Sign in to Clashy … Nonce: …" in a Memo instruction and an all-zero blockhash, so it can
// never land on chain; the server checks the wallet's ed25519 signature over that transaction's message. Privy's
// embedded wallets and the device test wallets already sign transactions silently, so this works for both.
// A session is an HMAC token: v1.<wallet>.<expiry>.<mac>. The secret comes from CLASHY_SOCIAL_SECRET (or a random one
// kept in the data folder for local runs) and is never logged.
import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { b58decode, isWallet } from './b58.ts';

const MEMO = b58decode('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const NONCE_TTL = 5 * 60_000;
export const SESSION_TTL = 7 * 24 * 3600_000;

export function loadSecret(dataDir: string, prod: boolean): Buffer {
  const env = process.env.CLASHY_SOCIAL_SECRET;
  if (env) {
    if (env.length < 32) throw new Error('Setup required: CLASHY_SOCIAL_SECRET must be at least 32 characters');
    return Buffer.from(env, 'utf8');
  }
  if (prod) throw new Error('Setup required: CLASHY_SOCIAL_SECRET (a long random string) is needed outside the local stack');
  const file = join(dataDir, '.session-secret');
  if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString('hex'), { mode: 0o600 });
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'utf8');
}

const nonces = new Map<string, { wallet: string; exp: number }>();
export function challenge(wallet: string) {
  if (!isWallet(wallet)) throw new HttpError(400, 'wallet: a Solana address');
  const now = Date.now();
  for (const [k, v] of nonces) if (v.exp < now) nonces.delete(k);
  if (nonces.size > 50_000) throw new HttpError(503, 'Too many sign-ins in flight. Try again in a minute.');
  const nonce = randomBytes(16).toString('hex');
  nonces.set(nonce, { wallet, exp: now + NONCE_TTL });
  return { nonce, message: signInText(wallet, nonce) };
}
export const signInText = (wallet: string, nonce: string) => `Sign in to Clashy\nWallet: ${wallet}\nNonce: ${nonce}`;

function cu16(b: Uint8Array, at: number): [number, number] {
  let v = 0, shift = 0, i = at;
  for (;;) {
    if (i >= b.length) throw new HttpError(400, 'transaction: truncated');
    const x = b[i++];
    v |= (x & 0x7f) << shift;
    if (!(x & 0x80)) break;
    shift += 7;
    if (shift > 14) throw new HttpError(400, 'transaction: bad length');
  }
  return [v, i];
}
const contains = (hay: Uint8Array, needle: Uint8Array) => Buffer.from(hay).indexOf(Buffer.from(needle)) !== -1;
const ED_DER = Buffer.from('302a300506032b6570032100', 'hex');

/** Checks the signed sign-in transaction (base64) for this nonce; returns the wallet it proves. */
export function verifySignIn(nonce: string, txB64: string): string {
  const pending = nonces.get(nonce);
  if (!pending || pending.exp < Date.now()) throw new HttpError(401, 'This sign-in expired. Try again.');
  nonces.delete(nonce);
  const tx = new Uint8Array(Buffer.from(txB64, 'base64'));
  if (tx.length < 100 || tx.length > 1232) throw new HttpError(400, 'transaction: wrong size');
  const [nSig, p] = cu16(tx, 0);
  if (nSig < 1 || nSig > 4) throw new HttpError(400, 'transaction: expected one signature');
  const sig = tx.slice(p, p + 64);
  const msg = tx.slice(p + 64 * nSig);
  // message: header (3) | keys | blockhash (32) | instructions
  const [nKeys, k] = cu16(msg, 3);
  if (nKeys < 2 || msg.length < k + 32 * nKeys + 32) throw new HttpError(400, 'transaction: bad message');
  const payer = msg.slice(k, k + 32);
  const blockhash = msg.slice(k + 32 * nKeys, k + 32 * nKeys + 32);
  if (Buffer.compare(Buffer.from(payer), Buffer.from(b58decode(pending.wallet))) !== 0) throw new HttpError(401, 'Signed by a different wallet');
  if (blockhash.some((x) => x !== 0)) throw new HttpError(400, 'A sign-in must not be a sendable transaction');
  if (!contains(msg, MEMO) || !contains(msg, new TextEncoder().encode(signInText(pending.wallet, nonce)))) throw new HttpError(400, 'The sign-in text is missing');
  const key = createPublicKey({ key: Buffer.concat([ED_DER, Buffer.from(payer)]), format: 'der', type: 'spki' });
  if (!verify(null, msg, key, sig)) throw new HttpError(401, 'The signature does not match');
  return pending.wallet;
}

export function issueToken(secret: Buffer, wallet: string) {
  const exp = Date.now() + SESSION_TTL;
  const body = `v1.${wallet}.${exp}`;
  return { token: `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`, expires: exp };
}
/** The wallet a session token belongs to, or null when it is missing, forged or expired. */
export function readToken(secret: Buffer, header?: string): string | null {
  const t = /^Bearer (v1\.[1-9A-HJ-NP-Za-km-z]{32,44}\.\d{13}\.[A-Za-z0-9_-]{43})$/.exec(header ?? '')?.[1];
  if (!t) return null;
  const [v, wallet, exp, mac] = t.split('.');
  const want = createHmac('sha256', secret).update(`${v}.${wallet}.${exp}`).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want) || Number(exp) < Date.now()) return null;
  return wallet;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}
