// Clashy social server: the off-chain half of the game. Direct messages, follows and follow requests, notifications,
// bios, and the public archive of calls and squad chat. Wallets sign in with their Solana key (see auth.ts). It never
// holds money or keys, and nothing it stores decides a game: duels, squads, calls and payouts stay on Solana and the
// MagicBlock rollup.
//
//   GET  /health                         liveness, backend and counts
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
//   GET  /v1/posts?before=&author=&replyTo=&limit=   GET /v1/posts/:seq      the archive of calls (public)
//   GET  /v1/chat/:clan/:ch?before=&limit=           a squad's history (members, signed in)
//   POST /internal/archive {posts, chat, members}     the indexer only (x-clashy-indexer: CLASHY_INDEXER_SECRET)
//
// Env: PORT (8791), CLASHY_DATA (./data, SQLite), CLASHY_DATABASE_URL (Postgres / Supabase instead of SQLite),
// CLASHY_SOCIAL_SECRET (required off the local stack), CLASHY_INDEXER_SECRET, CLASHY_APP_ORIGIN (CORS; * only on the
// local stack), CLASHY_TRUST_PROXY=1 behind Caddy, CLASHY_ENV=local|devnet|mainnet.
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';
import { challenge, HttpError, issueToken, loadSecret, readToken, verifySignIn } from './auth.ts';
import { isWallet } from './b58.ts';
import { Store, type ArchivedChat, type ArchivedPost } from './db.ts';

const PORT = Number(process.env.PORT ?? 8791);
const ENV = process.env.CLASHY_ENV ?? 'local';
const PROD = ENV !== 'local';
const DATA = resolve(process.env.CLASHY_DATA ?? './data');
const ORIGIN = process.env.CLASHY_APP_ORIGIN ?? (PROD ? '' : '*');
if (PROD && (!ORIGIN || ORIGIN === '*')) throw new Error('Setup required: CLASHY_APP_ORIGIN (the app\'s exact web origin, not *) is needed outside the local stack');
const INDEXER = process.env.CLASHY_INDEXER_SECRET ?? '';
if (INDEXER && INDEXER.length < 32) throw new Error('Setup required: CLASHY_INDEXER_SECRET must be at least 32 characters');
const TRUST_PROXY = process.env.CLASHY_TRUST_PROXY === '1';

mkdirSync(DATA, { recursive: true });
const secret = loadSecret(DATA, PROD);
const store = await Store.open({ url: process.env.CLASHY_DATABASE_URL, file: join(DATA, 'social.db') });

/** Signed in: 60 writes and 600 reads a minute per wallet. Before sign-in, per IP: 600 writes (sign-ins) and 1,200 reads
 *  a minute, since a whole venue or a NAT can share one address. Behind the Caddy proxy (CLASHY_TRUST_PROXY=1) the IP is
 *  the first X-Forwarded-For entry. */
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

async function body(req: http.IncomingMessage, max = 16_000): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > max) throw new HttpError(413, 'Request too large'); }
  if (!raw) return {};
  try { const j = JSON.parse(raw); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { /* fall through */ }
  throw new HttpError(400, 'Send a JSON object');
}
const wallet = (s: string | undefined) => { if (!isWallet(s)) throw new HttpError(400, 'Not a Solana address'); return s; };
const int = (v: unknown, lo: number, hi: number) => { if (v === null || v === undefined || v === '') return undefined; const x = Number(v); return Number.isInteger(x) && x >= lo && x <= hi ? x : undefined; };

/** The indexer's batch, checked field by field: the archive holds only well-formed rows. */
function archiveBatch(x: Record<string, unknown>) {
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);
  const posts: ArchivedPost[] = [];
  for (const p of Array.isArray(x.posts) ? x.posts.slice(0, 500) : []) {
    const seq = int(p?.seq, 0, Number.MAX_SAFE_INTEGER), ts = int(p?.ts, 0, 1e11), kind = int(p?.kind, 0, 255);
    const text = str(p?.text, 600), likes = int(p?.likes, 0, 1e9), replies = int(p?.replies, 0, 1e9);
    const replyTo = p?.replyTo === null ? null : int(p?.replyTo, 0, Number.MAX_SAFE_INTEGER);
    if (seq === undefined || ts === undefined || kind === undefined || text === undefined || likes === undefined || replies === undefined || replyTo === undefined
      || !isWallet(p?.author) || !isWallet(p?.refkey)) throw new HttpError(400, 'archive: a malformed post');
    posts.push({ seq, ts, kind, text, likes, replies, replyTo, author: p.author, refkey: p.refkey });
  }
  const chat: ArchivedChat[] = [];
  for (const m of Array.isArray(x.chat) ? x.chat.slice(0, 2000) : []) {
    const ch = int(m?.ch, 0, 255), i = int(m?.i, 0, Number.MAX_SAFE_INTEGER), ts = int(m?.ts, 0, 1e11), kind = int(m?.kind, 0, 255), text = str(m?.text, 600);
    if (ch === undefined || i === undefined || ts === undefined || kind === undefined || text === undefined || !isWallet(m?.clan) || !isWallet(m?.author) || !isWallet(m?.refkey))
      throw new HttpError(400, 'archive: a malformed message');
    chat.push({ clan: m.clan, ch, i, ts, kind, text, author: m.author, refkey: m.refkey });
  }
  const members: { clan: string; wallets: string[] }[] = [];
  for (const g of Array.isArray(x.members) ? x.members.slice(0, 2000) : []) {
    if (!isWallet(g?.clan) || !Array.isArray(g?.wallets) || g.wallets.length > 1000 || !g.wallets.every(isWallet)) throw new HttpError(400, 'archive: malformed members');
    members.push({ clan: g.clan, wallets: g.wallets });
  }
  return { posts, chat, members };
}
function indexerOk(h: string | string[] | undefined) {
  if (!INDEXER) throw new HttpError(503, 'Setup required: CLASHY_INDEXER_SECRET is not set on this server');
  const got = Buffer.from(String(h ?? '')), want = Buffer.from(INDEXER);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'Not the indexer');
}

type Ctx = { req: http.IncomingMessage; parts: string[]; q: URLSearchParams; me: string | null };
const need = (c: Ctx) => { if (!c.me) throw new HttpError(401, 'Sign in first'); return c.me; };

async function route(c: Ctx): Promise<unknown> {
  const { req, parts } = c;
  const m = req.method;
  const [v, a, b, d] = parts;
  if (m === 'GET' && v === 'health') return { ok: true, env: ENV, db: store.kind, ...(await store.counts()) };
  if (v === 'internal' && a === 'archive' && m === 'POST') {
    indexerOk(req.headers['x-clashy-indexer']);
    const x = archiveBatch(await body(req, 4_000_000));
    await store.archivePosts(x.posts);
    await store.archiveChat(x.chat);
    for (const g of x.members) await store.setMembers(g.clan, g.wallets);
    return { ok: true, posts: x.posts.length, chat: x.chat.length, clans: x.members.length };
  }
  if (v !== 'v1') throw new HttpError(404, 'Not found');
  if (m === 'POST' && a === 'auth' && b === 'challenge') return challenge(String((await body(req)).wallet ?? ''));
  if (m === 'POST' && a === 'auth' && b === 'verify') {
    const x = await body(req);
    return issueToken(secret, verifySignIn(String(x.nonce ?? ''), String(x.tx ?? '')));
  }
  if (m === 'GET' && a === 'profile' && b) return store.profile(wallet(b), c.me);
  if (m === 'PUT' && a === 'me' && b === 'profile') { const me = need(c); await store.setProfile(me, await body(req)); return store.profile(me, null); }
  if (a === 'follow' && b) {
    const me = need(c), them = wallet(b);
    if (m === 'POST') return { follow: await store.follow(me, them) };
    if (m === 'DELETE') { await store.unfollow(me, them); return { follow: 'none' }; }
  }
  if (m === 'POST' && a === 'requests' && b && (d === 'accept' || d === 'decline')) {
    const me = need(c), them = wallet(b);
    if (d === 'accept') await store.accept(me, them); else await store.decline(me, them);
    return { ok: true };
  }
  if (m === 'GET' && (a === 'followers' || a === 'following') && b) return { [a]: await store.list(wallet(b), a) };
  if (m === 'GET' && a === 'inbox') return store.inbox(need(c));
  if (a === 'dm' && b) {
    const me = need(c), them = wallet(b);
    if (m === 'GET' && !d) return store.thread(me, them, int(c.q.get('after') ?? 0, 0, Number.MAX_SAFE_INTEGER) ?? 0);
    if (m === 'POST' && !d) return store.send(me, them, (await body(req)).body);
    if (m === 'POST' && d === 'read') { const id = int((await body(req)).id, 1, Number.MAX_SAFE_INTEGER); if (!id) throw new HttpError(400, 'id: a message id'); await store.markRead(me, them, id); return { ok: true }; }
  }
  if (m === 'POST' && a === 'notifications' && b === 'read') { await store.readNotes(need(c)); return { ok: true }; }
  if (m === 'GET' && a === 'posts' && !b) {
    const author = c.q.get('author');
    const replyTo = c.q.get('replyTo');
    return { posts: await store.posts({
      before: int(c.q.get('before'), 1, Number.MAX_SAFE_INTEGER), author: author ? wallet(author) : undefined,
      replyTo: replyTo !== null ? int(replyTo, 0, Number.MAX_SAFE_INTEGER) : undefined, limit: int(c.q.get('limit'), 1, 100),
    }) };
  }
  if (m === 'GET' && a === 'posts' && b) {
    const seq = int(b, 0, Number.MAX_SAFE_INTEGER);
    if (seq === undefined) throw new HttpError(400, 'Not a post number');
    const p = await store.post(seq);
    if (!p) throw new HttpError(404, 'No archived post with that number');
    return p;
  }
  if (m === 'GET' && a === 'chat' && b && d !== undefined) {
    const ch = int(d, 0, 255);
    if (ch === undefined) throw new HttpError(400, 'Not a channel');
    return { messages: await store.chat(need(c), wallet(b), ch, int(c.q.get('before'), 0, Number.MAX_SAFE_INTEGER), int(c.q.get('limit'), 1, 200) ?? 100) };
  }
  throw new HttpError(404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (ORIGIN === '*' || (origin && ORIGIN.split(',').includes(origin))) { res.setHeader('Access-Control-Allow-Origin', ORIGIN === '*' ? '*' : origin!); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(data));
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const me = readToken(secret, req.headers.authorization);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'internal') limit(me ?? `ip:${ipOf(req)}`, req.method !== 'GET', !me);
    send(200, await route({ req, parts, q: url.searchParams, me }));
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err instanceof HttpError) return send(err.status, { error: err.message });
    console.error('social:', err.message);
    send(500, { error: 'The server hit an error. Try again.' });
  }
});
server.listen(PORT, () => console.log(`clashy social on :${PORT} · ${ENV} · ${store.kind === 'postgres' ? 'Postgres' : `SQLite in ${DATA}`}`));
const stop = async () => { server.close(); await store.close(); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
