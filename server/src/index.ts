// Clashy social server: the off-chain half of the game. Direct messages, follows and follow requests, notifications
// and bios, for wallets that sign in with their Solana key (see auth.ts). It never holds money or keys, and nothing it
// stores decides a game: duels, squads, calls and payouts stay on Solana and the MagicBlock rollup.
//
//   GET  /health                         liveness and counts
//   POST /v1/auth/challenge {wallet}       → {nonce, message}
//   POST /v1/auth/verify {nonce, tx}       → {token, expires}       tx: the signed sign-in transaction, base64
//   GET  /v1/profile/:owner                bio, link, private, followers, following (+ how you relate, when signed in)
//   PUT  /v1/me/profile {bio, link, private}
//   POST /v1/follow/:owner   DELETE /v1/follow/:owner
//   POST /v1/requests/:owner/accept|decline
//   GET  /v1/followers/:owner   GET /v1/following/:owner
//   GET  /v1/inbox                         threads, notifications, follow requests, counts
//   GET  /v1/dm/:peer?after=id   POST /v1/dm/:peer {body}   POST /v1/dm/:peer/read {id}
//   POST /v1/notifications/read
//
// Env: PORT (8791), CLASHY_DATA (./data), CLASHY_SOCIAL_SECRET (required off the local stack), CLASHY_APP_ORIGIN (CORS;
// * when unset on the local stack), CLASHY_ENV=local|devnet|mainnet.
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';
import { challenge, HttpError, issueToken, loadSecret, readToken, verifySignIn } from './auth.ts';
import { isWallet } from './b58.ts';
import { Store } from './db.ts';

const PORT = Number(process.env.PORT ?? 8791);
const ENV = process.env.CLASHY_ENV ?? 'local';
const PROD = ENV !== 'local';
const DATA = resolve(process.env.CLASHY_DATA ?? './data');
const ORIGIN = process.env.CLASHY_APP_ORIGIN ?? (PROD ? '' : '*');
if (PROD && !ORIGIN) throw new Error('Setup required: CLASHY_APP_ORIGIN (the app\'s web origin) is needed outside the local stack');

mkdirSync(DATA, { recursive: true });
const secret = loadSecret(DATA, PROD);
const store = new Store(join(DATA, 'social.db'));

/** Signed in: 60 writes and 600 reads a minute per wallet. Before sign-in, per IP: 600 writes (sign-ins) and 1,200 reads
 *  a minute, since a whole venue or a NAT can share one address. Behind the Caddy proxy (CLASHY_TRUST_PROXY=1) the IP is
 *  the first X-Forwarded-For entry. */
const TRUST_PROXY = process.env.CLASHY_TRUST_PROXY === '1';
const buckets = new Map<string, { t: number; w: number; r: number }>();
function limit(key: string, write: boolean, anon: boolean) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.t > 60_000) { b = { t: now, w: 0, r: 0 }; buckets.set(key, b); }
  const [maxW, maxR] = anon ? [600, 1200] : [60, 600];
  if (write ? ++b.w > maxW : ++b.r > maxR) throw new HttpError(429, 'Slow down: too many requests this minute');
  if (buckets.size > 20_000) for (const [k, v] of buckets) if (now - v.t > 60_000) buckets.delete(k);
}
const ipOf = (req: http.IncomingMessage) => (TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';

async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 16_000) throw new HttpError(413, 'Request too large'); }
  if (!raw) return {};
  try { const j = JSON.parse(raw); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { /* fall through */ }
  throw new HttpError(400, 'Send a JSON object');
}
const wallet = (s: string | undefined) => { if (!isWallet(s)) throw new HttpError(400, 'Not a Solana address'); return s; };

type Ctx = { req: http.IncomingMessage; parts: string[]; q: URLSearchParams; me: string | null };
const need = (c: Ctx) => { if (!c.me) throw new HttpError(401, 'Sign in first'); return c.me; };

async function route(c: Ctx): Promise<unknown> {
  const { req, parts } = c;
  const m = req.method;
  const [v, a, b, d] = parts;
  if (m === 'GET' && v === 'health') {
    const n = (t: string) => (store.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    return { ok: true, env: ENV, messages: n('messages'), follows: n('follows'), profiles: n('profiles') };
  }
  if (v !== 'v1') throw new HttpError(404, 'Not found');
  if (m === 'POST' && a === 'auth' && b === 'challenge') return challenge(String((await body(req)).wallet ?? ''));
  if (m === 'POST' && a === 'auth' && b === 'verify') {
    const x = await body(req);
    return issueToken(secret, verifySignIn(String(x.nonce ?? ''), String(x.tx ?? '')));
  }
  if (m === 'GET' && a === 'profile' && b) return store.profile(wallet(b), c.me);
  if (m === 'PUT' && a === 'me' && b === 'profile') { const me = need(c); store.setProfile(me, await body(req)); return store.profile(me, null); }
  if (a === 'follow' && b) {
    const me = need(c), them = wallet(b);
    if (m === 'POST') return { follow: store.follow(me, them) };
    if (m === 'DELETE') { store.unfollow(me, them); return { follow: 'none' }; }
  }
  if (m === 'POST' && a === 'requests' && b && (d === 'accept' || d === 'decline')) {
    const me = need(c), them = wallet(b);
    if (d === 'accept') store.accept(me, them); else store.decline(me, them);
    return { ok: true };
  }
  if (m === 'GET' && (a === 'followers' || a === 'following') && b) return { [a]: store.list(wallet(b), a) };
  if (m === 'GET' && a === 'inbox') return store.inbox(need(c));
  if (a === 'dm' && b) {
    const me = need(c), them = wallet(b);
    if (m === 'GET' && !d) return store.thread(me, them, Math.max(0, Number(c.q.get('after') ?? 0) || 0));
    if (m === 'POST' && !d) return store.send(me, them, (await body(req)).body);
    if (m === 'POST' && d === 'read') { const id = Number((await body(req)).id); if (!(id > 0)) throw new HttpError(400, 'id: a message id'); store.markRead(me, them, id); return { ok: true }; }
  }
  if (m === 'POST' && a === 'notifications' && b === 'read') { store.readNotes(need(c)); return { ok: true }; }
  throw new HttpError(404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (ORIGIN === '*' || (origin && ORIGIN.split(',').includes(origin))) res.setHeader('Access-Control-Allow-Origin', ORIGIN === '*' ? '*' : origin!);
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(data));
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const me = readToken(secret, req.headers.authorization);
    limit(me ?? `ip:${ipOf(req)}`, req.method !== 'GET', !me);
    send(200, await route({ req, parts: url.pathname.split('/').filter(Boolean), q: url.searchParams, me }));
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err instanceof HttpError) return send(err.status, { error: err.message });
    console.error('social:', err.message);
    send(500, { error: 'The server hit an error. Try again.' });
  }
});
server.listen(PORT, () => console.log(`clashy social on :${PORT} · ${ENV} · data ${DATA}`));
const stop = () => { server.close(); store.db.close(); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
