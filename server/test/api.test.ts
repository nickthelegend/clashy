// End to end against a real server process: wallets sign in with real ed25519 signatures over a sign-in transaction,
// then follow, request, accept, message and read. Nothing is mocked. Run: npm test (in server/).
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { b58decode, b58encode } from '../src/b58.ts';

const PORT = 18791 + Math.floor(Math.random() * 500);
const URL_ = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;

type W = { addr: string; key: KeyObject; token?: string };
function wallet(): W {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { addr: b58encode(raw), key: privateKey };
}
const cu16 = (n: number) => (n < 0x80 ? [n] : [(n & 0x7f) | 0x80, n >> 7]);
/** The sign-in transaction the app signs: a Memo with the text, the payer as signer, an all-zero blockhash. */
function signInTx(w: W, text: string, opts: { blockhash?: number } = {}) {
  const memo = b58decode('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  const data = new TextEncoder().encode(text);
  const msg = Buffer.from([
    1, 0, 1, ...cu16(2), ...b58decode(w.addr), ...memo, ...new Array(32).fill(opts.blockhash ?? 0),
    ...cu16(1), 1, ...cu16(1), 0, ...cu16(data.length), ...data,
  ]);
  const sig = sign(null, msg, w.key);
  return Buffer.concat([Buffer.from(cu16(1)), sig, msg]).toString('base64');
}
async function call(method: string, path: string, w?: W, body?: unknown) {
  const r = await fetch(URL_ + path, { method, headers: { 'content-type': 'application/json', ...(w?.token ? { authorization: `Bearer ${w.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json()) as Record<string, any> };
}
async function signIn(w: W, tamper?: 'other' | 'sendable' | 'text') {
  const c = await call('POST', '/v1/auth/challenge', undefined, { wallet: w.addr });
  assert.equal(c.status, 200);
  const signer = tamper === 'other' ? { ...wallet(), addr: w.addr } : w;
  const tx = signInTx(signer, tamper === 'text' ? 'Sign in to something else' : c.json.message, { blockhash: tamper === 'sendable' ? 7 : 0 });
  return call('POST', '/v1/auth/verify', undefined, { nonce: c.json.nonce, tx });
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'clashy-social-'));
  proc = spawn(process.execPath, ['src/index.ts'], { env: { ...process.env, PORT: String(PORT), CLASHY_DATA: dir, CLASHY_ENV: 'local' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(URL_ + '/health')).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => { proc.kill(); rmSync(dir, { recursive: true, force: true }); });

const ann = wallet(), bo = wallet(), cy = wallet();

test('sign-in accepts the wallet’s own signature and refuses forgeries', async () => {
  for (const [tamper, status] of [['other', 401], ['sendable', 400], ['text', 400]] as const) {
    const r = await signIn(ann, tamper);
    assert.equal(r.status, status, `${tamper}: ${JSON.stringify(r.json)}`);
  }
  for (const w of [ann, bo, cy]) {
    const r = await signIn(w);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    w.token = r.json.token;
  }
  // a nonce works once
  const c = await call('POST', '/v1/auth/challenge', undefined, { wallet: bo.addr });
  const tx = signInTx(bo, c.json.message);
  assert.equal((await call('POST', '/v1/auth/verify', undefined, { nonce: c.json.nonce, tx })).status, 200);
  assert.equal((await call('POST', '/v1/auth/verify', undefined, { nonce: c.json.nonce, tx })).status, 401);
  // a forged token is just signed out
  assert.equal((await call('GET', '/v1/inbox', { ...ann, token: ann.token!.slice(0, -2) + 'AA' })).status, 401);
});

test('public follow is instant; a private account gets a request it can accept', async () => {
  assert.equal((await call('POST', `/v1/follow/${bo.addr}`, ann)).json.follow, 'accepted');
  assert.equal((await call('PUT', '/v1/me/profile', cy, { bio: 'perps only', private: true })).status, 200);
  assert.equal((await call('POST', `/v1/follow/${cy.addr}`, ann)).json.follow, 'pending');
  const inbox = (await call('GET', '/v1/inbox', cy)).json;
  assert.equal(inbox.followRequests.length, 1);
  assert.equal(inbox.followRequests[0].who, ann.addr);
  assert.equal((await call('POST', `/v1/requests/${ann.addr}/accept`, cy)).status, 200);
  const prof = (await call('GET', `/v1/profile/${cy.addr}`, ann)).json;
  assert.equal(prof.followers, 1);
  assert.equal(prof.bio, 'perps only');
  assert.equal(prof.you.follow, 'accepted');
  const annNotes = (await call('GET', '/v1/inbox', ann)).json.notifications;
  assert.ok(annNotes.some((n: { kind: string; actor: string }) => n.kind === 'follow_accept' && n.actor === cy.addr));
  assert.equal((await call('PUT', '/v1/me/profile', cy, { link: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('POST', `/v1/follow/${ann.addr}`, ann)).status, 400);
});

test('messages: requests until you reply, unread counts and read receipts', async () => {
  const sent = await call('POST', `/v1/dm/${bo.addr}`, cy, { body: 'gm, want a 5 USDC clash?' });
  assert.equal(sent.status, 200);
  let inbox = (await call('GET', '/v1/inbox', bo)).json;
  assert.equal(inbox.counts.messageRequests, 1, 'bo does not follow cy: a request');
  await call('POST', `/v1/dm/${cy.addr}`, bo, { body: 'you are on' });
  inbox = (await call('GET', '/v1/inbox', bo)).json;
  assert.equal(inbox.counts.messageRequests, 0, 'replying accepts it');
  const cyInbox = (await call('GET', '/v1/inbox', cy)).json;
  assert.equal(cyInbox.threads[0].unread, 1);
  const t = (await call('GET', `/v1/dm/${bo.addr}`, cy)).json;
  assert.deepEqual(t.messages.map((x: { body: string }) => x.body), ['gm, want a 5 USDC clash?', 'you are on']);
  await call('POST', `/v1/dm/${bo.addr}/read`, cy, { id: t.messages[1].id });
  assert.equal((await call('GET', '/v1/inbox', cy)).json.threads[0].unread, 0);
  assert.equal((await call('GET', `/v1/dm/${cy.addr}`, bo)).json.theirRead, t.messages[1].id, 'bo sees it was read');
  assert.equal((await call('POST', `/v1/dm/${bo.addr}`, cy, { body: '   ' })).status, 400);
  assert.equal((await call('GET', `/v1/dm/${bo.addr}`)).status, 401);
});
