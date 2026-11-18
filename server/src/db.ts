// Clashy's off-chain data. Bios, follows (with requests for private accounts), direct messages with read receipts,
// notifications, and the public archive: every call on the board and every squad message, copied off the MagicBlock
// rollup by the indexer (chain/scripts/indexer.ts) so nothing is lost when the on-chain rings roll over. Money, games,
// names and avatars stay on Solana; this database only links wallets and keeps history.
//
// Two backends, one set of queries:
//   SQLite (Node's built-in driver, WAL)   testnet / hackathon: one file on one small box
//   Postgres (Supabase on mainnet)         CLASHY_DATABASE_URL; pooled connections, prepared statements off for PgBouncer
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from './auth.ts';

export type Follow = 'none' | 'pending' | 'accepted';
export type Note = { id: number; kind: 'follow' | 'follow_request' | 'follow_accept'; actor: string; at: number; read: boolean };
export type Msg = { id: number; sender: string; body: string; at: number };
export type ArchivedPost = { seq: number; author: string; ts: number; kind: number; refkey: string; replyTo: number | null; text: string; likes: number; replies: number };
export type ArchivedChat = { clan: string; ch: number; i: number; author: string; ts: number; kind: number; refkey: string; text: string };

type Row = Record<string, unknown>;
interface Sql {
  kind: 'sqlite' | 'postgres';
  q<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

function sqliteSql(file: string): Sql {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  return {
    kind: 'sqlite',
    q: async <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as never[])) as T[],
    exec: async (sql: string) => { db.exec(sql); },
    close: async () => db.close(),
  };
}
async function postgresSql(url: string): Promise<Sql> {
  const { default: postgres } = await import('postgres');
  const local = /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(url);
  const sql = postgres(url, {
    ssl: local ? false : 'require', max: Number(process.env.CLASHY_DB_POOL ?? 10), idle_timeout: 30, prepare: false,
    types: { bigint: { to: 20, from: [20], parse: (x: string) => Number(x), serialize: (x: number) => String(x) } },
    onnotice: () => {},
  });
  // our queries use ? placeholders; Postgres wants $1, $2, … (no query has a literal ? in it)
  const dollars = (text: string) => { let n = 0; return text.replace(/\?/g, () => `$${++n}`); };
  return {
    kind: 'postgres',
    q: async <T>(text: string, params: unknown[] = []) => (await sql.unsafe(dollars(text), params as never[])) as unknown as T[],
    exec: async (text: string) => { await sql.unsafe(text); },
    close: async () => { await sql.end({ timeout: 5 }); },
  };
}

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];
const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

export class Store {
  sql: Sql;
  private constructor(sql: Sql) { this.sql = sql; }

  /** SQLite at `file`, or Postgres when `url` is set. Creates the schema if it is missing. */
  static async open(opts: { url?: string; file: string }): Promise<Store> {
    const s = new Store(opts.url ? await postgresSql(opts.url) : sqliteSql(opts.file));
    await s.migrate();
    return s;
  }
  get kind() { return this.sql.kind; }
  close() { return this.sql.close(); }

  private async migrate() {
    const id = this.sql.kind === 'postgres' ? 'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    await this.sql.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        owner TEXT PRIMARY KEY, bio TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
        private INTEGER NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS follows (
        follower TEXT NOT NULL, followee TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','accepted')),
        created_at BIGINT NOT NULL, PRIMARY KEY (follower, followee));
      CREATE INDEX IF NOT EXISTS follows_followee ON follows (followee, status);
      CREATE TABLE IF NOT EXISTS messages (
        id ${id}, lo TEXT NOT NULL, hi TEXT NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL, at BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_pair ON messages (lo, hi, id);
      CREATE INDEX IF NOT EXISTS messages_hi ON messages (hi, id);
      CREATE TABLE IF NOT EXISTS reads (owner TEXT NOT NULL, peer TEXT NOT NULL, last_id BIGINT NOT NULL, PRIMARY KEY (owner, peer));
      CREATE TABLE IF NOT EXISTS notifications (
        id ${id}, owner TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL, at BIGINT NOT NULL, read INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS notifications_owner ON notifications (owner, id);
      CREATE TABLE IF NOT EXISTS posts (
        seq BIGINT PRIMARY KEY, author TEXT NOT NULL, ts BIGINT NOT NULL, kind INTEGER NOT NULL, refkey TEXT NOT NULL,
        reply_to BIGINT, text TEXT NOT NULL, likes INTEGER NOT NULL, replies INTEGER NOT NULL, archived_at BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS posts_author ON posts (author, seq);
      CREATE INDEX IF NOT EXISTS posts_reply ON posts (reply_to, seq);
      CREATE TABLE IF NOT EXISTS chat (
        clan TEXT NOT NULL, ch INTEGER NOT NULL, i BIGINT NOT NULL, author TEXT NOT NULL, ts BIGINT NOT NULL,
        kind INTEGER NOT NULL, refkey TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY (clan, ch, i));
      CREATE TABLE IF NOT EXISTS clan_members (clan TEXT NOT NULL, wallet TEXT NOT NULL, PRIMARY KEY (clan, wallet));
    `);
  }

  async counts() {
    const c = async (t: string) => n(await this.sql.q<{ n: number }>(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM ${t}`));
    return { messages: await c('messages'), follows: await c('follows'), profiles: await c('profiles'), posts: await c('posts'), chat: await c('chat') };
  }

  /* ---------- profiles ---------- */
  async profile(owner: string, viewer: string | null) {
    const [p] = await this.sql.q<{ bio: string; link: string; private: number }>('SELECT bio, link, private FROM profiles WHERE owner = ?', [owner]);
    const count = async (sql: string) => n(await this.sql.q<{ n: number }>(sql, [owner]));
    return {
      owner, bio: p?.bio ?? '', link: p?.link ?? '', private: !!p?.private,
      followers: await count("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM follows WHERE followee = ? AND status = 'accepted'"),
      following: await count("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM follows WHERE follower = ? AND status = 'accepted'"),
      you: viewer && viewer !== owner ? { follow: await this.followOf(viewer, owner), followsYou: (await this.followOf(owner, viewer)) === 'accepted' } : null,
    };
  }
  async setProfile(owner: string, v: { bio?: unknown; link?: unknown; private?: unknown }) {
    const bio = v.bio === undefined ? undefined : String(v.bio).trim();
    const link = v.link === undefined ? undefined : String(v.link).trim();
    if (bio !== undefined && [...bio].length > 160) throw new HttpError(400, 'Bio: 160 characters at most');
    if (link !== undefined && link && !/^https:\/\/[^\s"'<>]{3,120}$/.test(link)) throw new HttpError(400, 'Link: an https:// address');
    const [cur] = await this.sql.q<{ bio: string; link: string; private: number }>('SELECT bio, link, private FROM profiles WHERE owner = ?', [owner]);
    const priv = v.private === undefined ? (cur?.private ?? 0) : v.private ? 1 : 0;
    await this.sql.q(`INSERT INTO profiles (owner, bio, link, private, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (owner) DO UPDATE SET bio = excluded.bio, link = excluded.link, private = excluded.private, updated_at = excluded.updated_at`,
    [owner, bio ?? cur?.bio ?? '', link ?? cur?.link ?? '', priv, Date.now()]);
    // going public lets every pending request in
    if (!priv && cur?.private) {
      for (const r of await this.sql.q<{ follower: string }>("SELECT follower FROM follows WHERE followee = ? AND status = 'pending'", [owner])) await this.accept(owner, r.follower);
    }
  }

  /* ---------- follows ---------- */
  async followOf(follower: string, followee: string): Promise<Follow> {
    const [r] = await this.sql.q<{ status: Follow }>('SELECT status FROM follows WHERE follower = ? AND followee = ?', [follower, followee]);
    return r?.status ?? 'none';
  }
  async follow(me: string, them: string): Promise<Follow> {
    if (me === them) throw new HttpError(400, "You can't follow yourself");
    const cur = await this.followOf(me, them);
    if (cur !== 'none') return cur;
    const [p] = await this.sql.q<{ private: number }>('SELECT private FROM profiles WHERE owner = ?', [them]);
    const status: Follow = p?.private ? 'pending' : 'accepted';
    await this.sql.q('INSERT INTO follows (follower, followee, status, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', [me, them, status, Date.now()]);
    await this.notify(them, status === 'pending' ? 'follow_request' : 'follow', me);
    return status;
  }
  async unfollow(me: string, them: string) {
    await this.sql.q('DELETE FROM follows WHERE follower = ? AND followee = ?', [me, them]);
    await this.sql.q("DELETE FROM notifications WHERE owner = ? AND actor = ? AND kind IN ('follow','follow_request')", [them, me]);
  }
  async accept(me: string, follower: string) {
    const r = await this.sql.q("UPDATE follows SET status = 'accepted' WHERE follower = ? AND followee = ? AND status = 'pending' RETURNING follower", [follower, me]);
    if (!r.length) throw new HttpError(404, 'No follow request from this player');
    await this.sql.q("DELETE FROM notifications WHERE owner = ? AND actor = ? AND kind = 'follow_request'", [me, follower]);
    await this.notify(me, 'follow', follower);
    await this.notify(follower, 'follow_accept', me);
  }
  async decline(me: string, follower: string) {
    await this.sql.q("DELETE FROM follows WHERE follower = ? AND followee = ? AND status = 'pending'", [follower, me]);
    await this.sql.q("DELETE FROM notifications WHERE owner = ? AND actor = ? AND kind = 'follow_request'", [me, follower]);
  }
  list(owner: string, which: 'followers' | 'following') {
    return this.sql.q<{ who: string; at: number }>(which === 'followers'
      ? "SELECT follower AS who, created_at AS at FROM follows WHERE followee = ? AND status = 'accepted' ORDER BY created_at DESC LIMIT 500"
      : "SELECT followee AS who, created_at AS at FROM follows WHERE follower = ? AND status = 'accepted' ORDER BY created_at DESC LIMIT 500", [owner]);
  }

  /* ---------- direct messages ---------- */
  async send(me: string, them: string, body: unknown): Promise<Msg> {
    if (me === them) throw new HttpError(400, "You can't message yourself");
    const text = String(body ?? '').trim();
    if (!text) throw new HttpError(400, 'Write a message first');
    if ([...text].length > 1000) throw new HttpError(400, 'Messages are 1,000 characters at most');
    const [lo, hi] = pair(me, them);
    const at = Date.now();
    const [r] = await this.sql.q<{ id: number }>('INSERT INTO messages (lo, hi, sender, body, at) VALUES (?, ?, ?, ?, ?) RETURNING id', [lo, hi, me, text, at]);
    const id = Number(r.id);
    await this.markRead(me, them, id);
    return { id, sender: me, body: text, at };
  }
  async thread(me: string, them: string, after = 0, limit = 200) {
    const [lo, hi] = pair(me, them);
    const msgs = await this.sql.q<Msg>('SELECT id, sender, body, at FROM messages WHERE lo = ? AND hi = ? AND id > ? ORDER BY id DESC LIMIT ?', [lo, hi, after, limit]);
    const [r] = await this.sql.q<{ last_id: number }>('SELECT last_id FROM reads WHERE owner = ? AND peer = ?', [them, me]);
    return { messages: msgs.reverse().map((m) => ({ ...m, id: Number(m.id), at: Number(m.at) })), theirRead: Number(r?.last_id ?? 0), request: await this.isRequest(me, them) };
  }
  async markRead(me: string, them: string, id: number) {
    const max = this.sql.kind === 'postgres' ? 'GREATEST(reads.last_id, excluded.last_id)' : 'MAX(last_id, excluded.last_id)';
    await this.sql.q(`INSERT INTO reads (owner, peer, last_id) VALUES (?, ?, ?) ON CONFLICT (owner, peer) DO UPDATE SET last_id = ${max}`, [me, them, id]);
  }
  /** Instagram's rule: a thread from someone you don't follow waits in Requests until you reply. */
  async isRequest(me: string, them: string) {
    if ((await this.followOf(me, them)) === 'accepted') return false;
    const [lo, hi] = pair(me, them);
    return !(await this.sql.q('SELECT 1 AS x FROM messages WHERE lo = ? AND hi = ? AND sender = ? LIMIT 1', [lo, hi, me])).length;
  }
  async threads(me: string) {
    const rows = await this.sql.q<{ peer: string; id: number; sender: string; body: string; at: number }>(`
      SELECT CASE WHEN m.lo = ? THEN m.hi ELSE m.lo END AS peer, m.id, m.sender, m.body, m.at
      FROM messages m JOIN (SELECT lo, hi, MAX(id) AS id FROM messages WHERE lo = ? OR hi = ? GROUP BY lo, hi) t ON m.id = t.id
      ORDER BY m.id DESC LIMIT 200`, [me, me, me]);
    const out = [];
    for (const r of rows) {
      const [lo, hi] = pair(me, r.peer);
      const unread = n(await this.sql.q<{ n: number }>(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM messages WHERE lo = ? AND hi = ? AND sender <> ?
        AND id > COALESCE((SELECT last_id FROM reads WHERE owner = ? AND peer = ?), 0)`, [lo, hi, me, me, r.peer]));
      out.push({ peer: r.peer, last: { id: Number(r.id), sender: r.sender, body: r.body, at: Number(r.at) }, unread, request: await this.isRequest(me, r.peer) });
    }
    return out;
  }

  /* ---------- notifications ---------- */
  async notify(owner: string, kind: Note['kind'], actor: string) {
    await this.sql.q('INSERT INTO notifications (owner, kind, actor, at) VALUES (?, ?, ?, ?)', [owner, kind, actor, Date.now()]);
  }
  /** Newest 100, each with whether you follow that player back. */
  async notes(owner: string): Promise<(Note & { youFollow: Follow })[]> {
    const rows = await this.sql.q<Omit<Note, 'read'> & { read: number }>('SELECT id, kind, actor, at, read FROM notifications WHERE owner = ? ORDER BY id DESC LIMIT 100', [owner]);
    const out = [];
    for (const r of rows) out.push({ ...r, id: Number(r.id), at: Number(r.at), read: !!r.read, youFollow: await this.followOf(owner, r.actor) });
    return out;
  }
  async readNotes(owner: string) { await this.sql.q('UPDATE notifications SET read = 1 WHERE owner = ? AND read = 0', [owner]); }
  requests(owner: string) {
    return this.sql.q<{ who: string; at: number }>("SELECT follower AS who, created_at AS at FROM follows WHERE followee = ? AND status = 'pending' ORDER BY created_at DESC", [owner]);
  }
  async inbox(me: string) {
    const [threads, notifications, followRequests] = [await this.threads(me), await this.notes(me), await this.requests(me)];
    return {
      threads, notifications, followRequests,
      counts: {
        unreadThreads: threads.filter((t) => !t.request && t.unread > 0).length,
        messageRequests: threads.filter((t) => t.request).length,
        unreadNotifications: notifications.filter((x) => !x.read).length,
        followRequests: followRequests.length,
      },
    };
  }

  /* ---------- the public archive (written only by the indexer) ---------- */
  async archivePosts(list: ArchivedPost[]) {
    const now = Date.now();
    for (const p of list) {
      await this.sql.q(`INSERT INTO posts (seq, author, ts, kind, refkey, reply_to, text, likes, replies, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (seq) DO UPDATE SET likes = excluded.likes, replies = excluded.replies`,
      [p.seq, p.author, p.ts, p.kind, p.refkey, p.replyTo, p.text, p.likes, p.replies, now]);
    }
  }
  async archiveChat(list: ArchivedChat[]) {
    for (const m of list) {
      await this.sql.q('INSERT INTO chat (clan, ch, i, author, ts, kind, refkey, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
        [m.clan, m.ch, m.i, m.author, m.ts, m.kind, m.refkey, m.text]);
    }
  }
  async setMembers(clan: string, wallets: string[]) {
    await this.sql.q('DELETE FROM clan_members WHERE clan = ?', [clan]);
    for (const w of wallets) await this.sql.q('INSERT INTO clan_members (clan, wallet) VALUES (?, ?) ON CONFLICT DO NOTHING', [clan, w]);
  }
  async posts(o: { before?: number; author?: string; replyTo?: number; limit?: number }) {
    const where: string[] = [], args: unknown[] = [];
    if (o.before) { where.push('seq < ?'); args.push(o.before); }
    if (o.author) { where.push('author = ?'); args.push(o.author); }
    if (o.replyTo !== undefined) { where.push('reply_to = ?'); args.push(o.replyTo); }
    args.push(Math.min(100, Math.max(1, o.limit ?? 50)));
    const rows = await this.sql.q<Row>(`SELECT seq, author, ts, kind, refkey, reply_to, text, likes, replies FROM posts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ?`, args);
    return rows.map(postOut);
  }
  async post(seq: number) {
    const [r] = await this.sql.q<Row>('SELECT seq, author, ts, kind, refkey, reply_to, text, likes, replies FROM posts WHERE seq = ?', [seq]);
    return r ? postOut(r) : null;
  }
  /** A squad's history: members only (membership is copied from chain by the indexer). */
  async chat(me: string, clan: string, ch: number, before: number | undefined, limit = 100) {
    if (!(await this.sql.q('SELECT 1 AS x FROM clan_members WHERE clan = ? AND wallet = ?', [clan, me])).length) throw new HttpError(403, 'Only members of this squad can read its history');
    const rows = await this.sql.q<Row>(`SELECT i, author, ts, kind, refkey, text FROM chat WHERE clan = ? AND ch = ? ${before !== undefined ? 'AND i < ?' : ''} ORDER BY i DESC LIMIT ?`,
      before !== undefined ? [clan, ch, before, Math.min(200, limit)] : [clan, ch, Math.min(200, limit)]);
    return rows.map((r) => ({ i: Number(r.i), author: String(r.author), ts: Number(r.ts), kind: Number(r.kind), refkey: String(r.refkey), text: String(r.text) })).reverse();
  }
}
const postOut = (r: Row) => ({
  seq: Number(r.seq), author: String(r.author), ts: Number(r.ts), kind: Number(r.kind), refkey: String(r.refkey),
  replyTo: r.reply_to === null || r.reply_to === undefined ? null : Number(r.reply_to), text: String(r.text), likes: Number(r.likes), replies: Number(r.replies),
});
