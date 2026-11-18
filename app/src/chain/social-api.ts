// The app's side of Clashy's social server (server/): direct messages, follows and follow requests, notifications and
// bios. Sign-in is one silent wallet signature over a sign-in transaction that can never be sent (a Memo with the
// server's nonce and an all-zero blockhash); the session token is kept per wallet on this device for 7 days.
// If the server can't be reached the screens say so; nothing is faked or cached as if it were live.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from './wallet';
import type { WalletSigner } from './client';

export const SOCIAL = process.env.EXPO_PUBLIC_CLASHY_SOCIAL ?? 'http://127.0.0.1:8791';
const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const ZERO_HASH = '11111111111111111111111111111111';

export type FollowState = 'none' | 'pending' | 'accepted';
export type SocialProfile = { owner: string; bio: string; link: string; private: boolean; followers: number; following: number; you: { follow: FollowState; followsYou: boolean } | null };
export type Thread = { peer: string; last: { id: number; sender: string; body: string; at: number }; unread: number; request: boolean };
export type Note = { id: number; kind: 'follow' | 'follow_request' | 'follow_accept'; actor: string; at: number; read: boolean; youFollow: FollowState };
export type Inbox = { threads: Thread[]; notifications: Note[]; followRequests: { who: string; at: number }[]; counts: { unreadThreads: number; messageRequests: number; unreadNotifications: number; followRequests: number } };
export type Dm = { id: number; sender: string; body: string; at: number };

export class SocialError extends Error { status?: number; constructor(m: string, s?: number) { super(m); this.status = s; } }

const tokens = new Map<string, Promise<string>>();
const key = (w: string) => `clashy:social:v1:${w}`;

async function raw<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${SOCIAL}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new SocialError(`Can't reach Clashy's social server at ${SOCIAL}. Messages and follows need it running (server/).`);
  }
  const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!r.ok) throw new SocialError(j?.error ?? `The social server answered ${r.status}`, r.status);
  if (!j) throw new SocialError('The social server sent an answer we could not read');
  return j;
}

/** One silent signature: proves this wallet to the social server. */
async function signIn(signer: WalletSigner): Promise<string> {
  const wallet = signer.publicKey.toBase58();
  const { nonce, message } = await raw<{ nonce: string; message: string }>('/v1/auth/challenge', { method: 'POST', body: { wallet } });
  const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: ZERO_HASH })
    .add(new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(message, 'utf8') }));
  const signed = await signer.signTransaction(tx);
  const b64 = signed.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  const { token, expires } = await raw<{ token: string; expires: number }>('/v1/auth/verify', { method: 'POST', body: { nonce, tx: b64 } });
  await AsyncStorage.setItem(key(wallet), JSON.stringify({ token, expires })).catch(() => {});
  return token;
}
function tokenFor(signer: WalletSigner, fresh = false): Promise<string> {
  const w = signer.publicKey.toBase58();
  if (!fresh && tokens.has(w)) return tokens.get(w)!;
  const p = (async () => {
    if (!fresh) {
      const saved = await AsyncStorage.getItem(key(w)).catch(() => null);
      const s = saved ? (JSON.parse(saved) as { token: string; expires: number }) : null;
      if (s && s.expires > Date.now() + 60_000) return s.token;
    }
    return signIn(signer);
  })();
  tokens.set(w, p);
  p.catch(() => tokens.delete(w));
  return p;
}

/** Calls the social server as this wallet (signing in once if needed; again if the session lapsed). */
export async function social<T>(signer: WalletSigner | null, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!signer) return raw<T>(path, init);
  try {
    return await raw<T>(path, { ...init, token: await tokenFor(signer) });
  } catch (e) {
    if ((e as SocialError).status !== 401) throw e;
    return raw<T>(path, { ...init, token: await tokenFor(signer, true) });
  }
}

/** Polls a social read while the screen is open; keeps the last good answer and reports the first failure. */
export function useSocial<T>(path: string | null, ms: number, auth = true) {
  const w = useWallet();
  const signer = auth ? w.signer : null;
  const [s, setS] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: !!path });
  const [n, setN] = useState(0);
  const who = signer?.publicKey.toBase58();
  const live = useRef(signer);
  live.current = signer;
  useEffect(() => {
    if (!path) { setS({ loading: false }); return; }
    let alive = true;
    setS((p) => ({ ...p, loading: !p.data }));
    const run = () => social<T>(live.current, path).then((data) => alive && setS({ data, loading: false }))
      .catch((e: Error) => alive && setS((p) => ({ data: p.data, error: e.message, loading: false })));
    run();
    const h = ms ? setInterval(run, ms) : undefined;
    return () => { alive = false; if (h) clearInterval(h); };
  }, [path, who, ms, n, auth]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...s, reload };
}

export function useInbox(ms = 4000) { const w = useWallet(); return useSocial<Inbox>(w.signer ? '/v1/inbox' : null, ms); }
export const useSocialProfile = (owner: string | null, ms = 15_000) => useSocial<SocialProfile>(owner ? `/v1/profile/${owner}` : null, ms);
