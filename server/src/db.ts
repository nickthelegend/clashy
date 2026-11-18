// Clashy's social data: what doesn't belong on chain. Bios, follows (with requests for private accounts), direct
// messages with read receipts, and notifications. Money, games, names, avatars and calls stay on Solana and the
// MagicBlock rollup; this database only links wallets. SQLite in WAL mode (Node's built-in driver) holds a few hundred
// players on one small box; the SQL is plain enough to move to Postgres when that stops being true.
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from './auth.ts';

export type Follow = 'none' | 'pending' | 'accepted';
export type Note = { id: number; kind: 'follow' | 'follow_request' | 'follow_accept'; actor: string; at: number; read: boolean };
export type Msg = { id: number; sender: string; body: string; at: number };

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];

export class Store {
  db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS profiles (
        owner TEXT PRIMARY KEY, bio TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
        private INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS follows (
        follower TEXT NOT NULL, followee TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','accepted')),
        created_at INTEGER NOT NULL, PRIMARY KEY (follower, followee));
      CREATE INDEX IF NOT EXISTS follows_followee ON follows (followee, status);
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, lo TEXT NOT NULL, hi TEXT NOT NULL, sender TEXT NOT NULL,
        body TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_pair ON messages (lo, hi, id);
      CREATE INDEX IF NOT EXISTS messages_hi ON messages (hi, id);
      CREATE TABLE IF NOT EXISTS reads (owner TEXT NOT NULL, peer TEXT NOT NULL, last_id INTEGER NOT NULL, PRIMARY KEY (owner, peer));
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL,
        at INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS notifications_owner ON notifications (owner, id);
    `);
  }

  /* ---------- profiles ---------- */
  profile(owner: string, viewer: string | null) {
    const p = this.db.prepare('SELECT bio, link, private FROM profiles WHERE owner = ?').get(owner) as { bio: string; link: string; private: number } | undefined;
    const count = (sql: string) => (this.db.prepare(sql).get(owner) as { n: number }).n;
    return {
      owner, bio: p?.bio ?? '', link: p?.link ?? '', private: !!p?.private,
      followers: count("SELECT COUNT(*) AS n FROM follows WHERE followee = ? AND status = 'accepted'"),
      following: count("SELECT COUNT(*) AS n FROM follows WHERE follower = ? AND status = 'accepted'"),
      you: viewer && viewer !== owner ? { follow: this.followOf(viewer, owner), followsYou: this.followOf(owner, viewer) === 'accepted' } : null,
    };
  }
  setProfile(owner: string, v: { bio?: unknown; link?: unknown; private?: unknown }) {
    const bio = v.bio === undefined ? undefined : String(v.bio).trim();
    const link = v.link === undefined ? undefined : String(v.link).trim();
    if (bio !== undefined && [...bio].length > 160) throw new HttpError(400, 'Bio: 160 characters at most');
    if (link !== undefined && link && (!/^https:\/\/[^\s]{3,120}$/.test(link))) throw new HttpError(400, 'Link: an https:// address');
    const cur = this.db.prepare('SELECT bio, link, private FROM profiles WHERE owner = ?').get(owner) as { bio: string; link: string; private: number } | undefined;
    const priv = v.private === undefined ? (cur?.private ?? 0) : v.private ? 1 : 0;
    this.db.prepare(`INSERT INTO profiles (owner, bio, link, private, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (owner) DO UPDATE SET bio = excluded.bio, link = excluded.link, private = excluded.private, updated_at = excluded.updated_at`)
      .run(owner, bio ?? cur?.bio ?? '', link ?? cur?.link ?? '', priv, Date.now());
    // going public lets every pending request in
    if (!priv && cur?.private) {
      const pend = this.db.prepare("SELECT follower FROM follows WHERE followee = ? AND status = 'pending'").all(owner) as { follower: string }[];
      for (const r of pend) this.accept(owner, r.follower);
    }
  }

  /* ---------- follows ---------- */
  followOf(follower: string, followee: string): Follow {
    const r = this.db.prepare('SELECT status FROM follows WHERE follower = ? AND followee = ?').get(follower, followee) as { status: Follow } | undefined;
    return r?.status ?? 'none';
  }
  follow(me: string, them: string): Follow {
    if (me === them) throw new HttpError(400, "You can't follow yourself");
    const cur = this.followOf(me, them);
    if (cur !== 'none') return cur;
    const priv = !!(this.db.prepare('SELECT private FROM profiles WHERE owner = ?').get(them) as { private: number } | undefined)?.private;
    const status: Follow = priv ? 'pending' : 'accepted';
    this.db.prepare('INSERT INTO follows (follower, followee, status, created_at) VALUES (?, ?, ?, ?)').run(me, them, status, Date.now());
    this.notify(them, priv ? 'follow_request' : 'follow', me);
    return status;
  }
  unfollow(me: string, them: string) {
    this.db.prepare('DELETE FROM follows WHERE follower = ? AND followee = ?').run(me, them);
    this.db.prepare("DELETE FROM notifications WHERE owner = ? AND actor = ? AND kind IN ('follow','follow_request')").run(them, me);
  }
  accept(me: string, follower: string) {
    const r = this.db.prepare("UPDATE follows SET status = 'accepted' WHERE follower = ? AND followee = ? AND status = 'pending'").run(follower, me);
    if (!r.changes) throw new HttpError(404, 'No follow request from this player');
    this.db.prepare("DELETE FROM notifications WHERE owner = ? AND actor = ? AND kind = 'follow_request'").run(me, follower);
    this.notify(me, 'follow', follower);
    this.notify(follower, 'follow_accept', me);
  }
  decline(me: string, follower: string) {
    this.db.prepare("DELETE FROM follows WHERE follower = ? AND followee = ? AND status = 'pending'").run(follower, me);
    this.db.prepare("DELETE FROM notifications WHERE owner = ? AND actor = ? AND kind = 'follow_request'").run(me, follower);
  }
  list(owner: string, which: 'followers' | 'following') {
    const sql = which === 'followers'
      ? "SELECT follower AS who, created_at AS at FROM follows WHERE followee = ? AND status = 'accepted' ORDER BY created_at DESC LIMIT 500"
      : "SELECT followee AS who, created_at AS at FROM follows WHERE follower = ? AND status = 'accepted' ORDER BY created_at DESC LIMIT 500";
    return this.db.prepare(sql).all(owner) as { who: string; at: number }[];
  }

  /* ---------- messages ---------- */
  send(me: string, them: string, body: unknown): Msg {
    if (me === them) throw new HttpError(400, "You can't message yourself");
    const text = String(body ?? '').trim();
    if (!text) throw new HttpError(400, 'Write a message first');
    if ([...text].length > 1000) throw new HttpError(400, 'Messages are 1,000 characters at most');
    const [lo, hi] = pair(me, them);
    const at = Date.now();
    const r = this.db.prepare('INSERT INTO messages (lo, hi, sender, body, at) VALUES (?, ?, ?, ?, ?)').run(lo, hi, me, text, at);
    const id = Number(r.lastInsertRowid);
    this.markRead(me, them, id);
    return { id, sender: me, body: text, at };
  }
  thread(me: string, them: string, after = 0, limit = 200) {
    const [lo, hi] = pair(me, them);
    const msgs = this.db.prepare('SELECT id, sender, body, at FROM messages WHERE lo = ? AND hi = ? AND id > ? ORDER BY id DESC LIMIT ?')
      .all(lo, hi, after, limit) as Msg[];
    const theirRead = (this.db.prepare('SELECT last_id FROM reads WHERE owner = ? AND peer = ?').get(them, me) as { last_id: number } | undefined)?.last_id ?? 0;
    return { messages: msgs.reverse(), theirRead, request: this.isRequest(me, them) };
  }
  markRead(me: string, them: string, id: number) {
    this.db.prepare(`INSERT INTO reads (owner, peer, last_id) VALUES (?, ?, ?)
      ON CONFLICT (owner, peer) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`).run(me, them, id);
  }
  /** Instagram's rule: a thread from someone you don't follow waits in Requests until you reply. */
  isRequest(me: string, them: string) {
    if (this.followOf(me, them) === 'accepted') return false;
    const [lo, hi] = pair(me, them);
    return !this.db.prepare('SELECT 1 FROM messages WHERE lo = ? AND hi = ? AND sender = ? LIMIT 1').get(lo, hi, me);
  }
  threads(me: string) {
    const rows = this.db.prepare(`
      SELECT CASE WHEN m.lo = ? THEN m.hi ELSE m.lo END AS peer, m.id, m.sender, m.body, m.at
      FROM messages m JOIN (SELECT lo, hi, MAX(id) AS id FROM messages WHERE lo = ? OR hi = ? GROUP BY lo, hi) t ON m.id = t.id
      ORDER BY m.id DESC LIMIT 200`).all(me, me, me) as { peer: string; id: number; sender: string; body: string; at: number }[];
    const unread = this.db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE lo = ? AND hi = ? AND sender != ? AND id > COALESCE((SELECT last_id FROM reads WHERE owner = ? AND peer = ?), 0)`);
    return rows.map((r) => {
      const [lo, hi] = pair(me, r.peer);
      return { peer: r.peer, last: { id: r.id, sender: r.sender, body: r.body, at: r.at }, unread: (unread.get(lo, hi, me, me, r.peer) as { n: number }).n, request: this.isRequest(me, r.peer) };
    });
  }

  /* ---------- notifications ---------- */
  notify(owner: string, kind: Note['kind'], actor: string) {
    this.db.prepare('INSERT INTO notifications (owner, kind, actor, at) VALUES (?, ?, ?, ?)').run(owner, kind, actor, Date.now());
  }
  /** Newest 100, each with whether you follow that player back. */
  notes(owner: string): (Note & { youFollow: Follow })[] {
    return (this.db.prepare('SELECT id, kind, actor, at, read FROM notifications WHERE owner = ? ORDER BY id DESC LIMIT 100').all(owner) as (Omit<Note, 'read'> & { read: number })[])
      .map((n) => ({ ...n, read: !!n.read, youFollow: this.followOf(owner, n.actor) }));
  }
  readNotes(owner: string) { this.db.prepare('UPDATE notifications SET read = 1 WHERE owner = ? AND read = 0').run(owner); }
  requests(owner: string) {
    return this.db.prepare("SELECT follower AS who, created_at AS at FROM follows WHERE followee = ? AND status = 'pending' ORDER BY created_at DESC").all(owner) as { who: string; at: number }[];
  }
  inbox(me: string) {
    const threads = this.threads(me);
    const notes = this.notes(me);
    const followRequests = this.requests(me);
    return {
      threads, notifications: notes, followRequests,
      counts: {
        unreadThreads: threads.filter((t) => !t.request && t.unread > 0).length,
        messageRequests: threads.filter((t) => t.request).length,
        unreadNotifications: notes.filter((n) => !n.read).length,
        followRequests: followRequests.length,
      },
    };
  }
}
