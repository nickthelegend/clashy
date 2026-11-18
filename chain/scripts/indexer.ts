// The archive indexer. The calls board and every squad channel are rings on the MagicBlock rollup (24 entries each),
// so older posts and messages roll off chain. Every few seconds this reads the board, every squad's #general and
// #trades, and each squad's members, and sends anything new to Clashy's social server (POST /internal/archive), which
// keeps them in SQLite or Postgres: the full public history of calls, and members-only squad history.
// Read-only on chain: it holds no keys. Run it next to the relay:
//   CLASHY_INDEXER_SECRET=… npx tsx scripts/indexer.ts
// Env: CLASHY_BASE, CLASHY_ER (defaults: the local stack), CLASHY_SOCIAL (http://127.0.0.1:8791), CLASHY_INDEXER_SECRET
// (the same value the social server has), CLASHY_INDEX_EVERY (ms, default 5000).
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import type { Clashy } from '../target/types/clashy.ts';

const BASE = process.env.CLASHY_BASE ?? 'http://127.0.0.1:8999';
const ER = process.env.CLASHY_ER ?? 'http://127.0.0.1:7799';
const SOCIAL = process.env.CLASHY_SOCIAL ?? 'http://127.0.0.1:8791';
const SECRET = process.env.CLASHY_INDEXER_SECRET ?? '';
const EVERY = Math.max(1000, Number(process.env.CLASHY_INDEX_EVERY ?? 5000));
if (SECRET.length < 32) throw new Error('Setup required: CLASHY_INDEXER_SECRET (at least 32 characters, the same value the social server has)');

const idl = JSON.parse(readFileSync(new URL('../target/idl/clashy.json', import.meta.url), 'utf8')) as Clashy;
// a throwaway wallet: Anchor wants one for its provider, the indexer never signs
const ro = new anchor.Wallet(Keypair.generate());
const baseP = new Program<Clashy>(idl, new anchor.AnchorProvider(new Connection(BASE, 'confirmed'), ro, { commitment: 'confirmed' }));
const erP = new Program<Clashy>(idl, new anchor.AnchorProvider(new Connection(ER, 'confirmed'), ro, { commitment: 'confirmed' }));
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, baseP.programId)[0];
const FEED_BOARD = 1;
const BOARD = pda(Buffer.from('board'), Buffer.from([FEED_BOARD]));
const CHANNELS = [0, 1];
const NO_REPLY = '18446744073709551615';
const text = (bytes: number[], len: number) => Buffer.from(bytes.slice(0, len)).toString('utf8');

/** The live copy: on the rollup while delegated, else on Solana. */
async function live<T>(read: (p: Program<Clashy>) => Promise<T | null>): Promise<T | null> {
  const onEr = await read(erP).catch(() => null);
  return onEr ?? read(baseP);
}

async function readBoard() {
  const b = await live((p) => p.account.board.fetchNullable(BOARD));
  if (!b) return [];
  return b.posts.filter((p) => !p.author.equals(PublicKey.default)).map((p) => ({
    seq: Number(p.seq), author: p.author.toBase58(), ts: Number(p.ts), kind: p.kind, refkey: p.refkey.toBase58(),
    replyTo: p.replyTo.toString() === NO_REPLY ? null : Number(p.replyTo), text: text(p.text, p.len), likes: p.likes, replies: p.replies,
  }));
}

const seen = new Map<string, number>(); // clan:ch → highest message index already archived
async function readSquads() {
  const [clans, members] = await Promise.all([baseP.account.clan.all(), baseP.account.member.all()]);
  const byClan = new Map<string, string[]>();
  for (const m of members) {
    const k = m.account.clan.toBase58();
    byClan.set(k, [...(byClan.get(k) ?? []), m.account.wallet.toBase58()]);
  }
  const chat: { clan: string; ch: number; i: number; author: string; ts: number; kind: number; refkey: string; text: string }[] = [];
  for (const c of clans) {
    for (const ch of CHANNELS) {
      const key = pda(Buffer.from('chan'), c.publicKey.toBuffer(), Buffer.from([ch]));
      const acc = await live((p) => p.account.channel.fetchNullable(key)).catch(() => null);
      if (!acc) continue;
      const count = Number(acc.count), n = Math.min(count, acc.msgs.length);
      const tag = `${c.publicKey.toBase58()}:${ch}`;
      for (let i = Math.max(count - n, (seen.get(tag) ?? -1) + 1); i < count; i++) {
        const m = acc.msgs[i % acc.msgs.length];
        chat.push({ clan: c.publicKey.toBase58(), ch, i, author: m.author.toBase58(), ts: Number(m.ts), kind: m.kind, refkey: m.refkey.toBase58(), text: text(m.text, m.len) });
      }
    }
  }
  const members_ = clans.map((c) => ({ clan: c.publicKey.toBase58(), wallets: byClan.get(c.publicKey.toBase58()) ?? [] }));
  return { chat, members: members_ };
}

async function once() {
  const [posts, squads] = await Promise.all([readBoard(), readSquads()]);
  const r = await fetch(`${SOCIAL}/internal/archive`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-clashy-indexer': SECRET },
    body: JSON.stringify({ posts, chat: squads.chat, members: squads.members }),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string; posts?: number; chat?: number };
  if (!r.ok) throw new Error(`the social server refused the batch (${r.status}): ${j.error ?? 'no reason given'}`);
  for (const m of squads.chat) { const tag = `${m.clan}:${m.ch}`; seen.set(tag, Math.max(seen.get(tag) ?? -1, m.i)); }
  return { posts: posts.length, chat: squads.chat.length, clans: squads.members.length };
}

console.log(`indexer · board and squad channels from ${ER} (rollup) / ${BASE} → ${SOCIAL} every ${EVERY / 1000}s`);
let last = '';
for (;;) {
  try {
    const r = await once();
    const line = `archived ${r.posts} board posts, ${r.chat} new squad messages, ${r.clans} squads`;
    if (line !== last || r.chat) console.log(`${new Date().toISOString()} ${line}`);
    last = line;
  } catch (e) {
    console.error(`${new Date().toISOString()} indexer: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, EVERY));
}
