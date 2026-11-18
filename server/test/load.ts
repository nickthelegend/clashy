// Load test: N players sign in with real ed25519 signatures, then for D seconds each polls its inbox every 2 s, opens a
// thread every 4 s and sends a DM every 6 s, like the app does while Chats is open. Prints throughput, latency
// percentiles and errors. Usage: node test/load.ts [url=http://127.0.0.1:8791] [players=100] [seconds=30]
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { b58decode, b58encode } from '../src/b58.ts';

const [URL_ = 'http://127.0.0.1:8791', N = '100', D = '30'] = process.argv.slice(2);
const cu16 = (n: number) => (n < 0x80 ? [n] : [(n & 0x7f) | 0x80, n >> 7]);
const MEMO = b58decode('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
type P = { addr: string; key: KeyObject; token?: string };
const lat: number[] = [];
let errors = 0, limited = 0;
const errs = new Map<string, number>();

async function call(method: string, path: string, p?: P, body?: unknown) {
  const t = performance.now();
  try {
    const r = await fetch(URL_ + path, { method, headers: { 'content-type': 'application/json', ...(p?.token ? { authorization: `Bearer ${p.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    lat.push(performance.now() - t);
    if (r.status === 429) limited++;
    else if (!r.ok) { errors++; errs.set(String(j.error), (errs.get(String(j.error)) ?? 0) + 1); }
    return j;
  } catch (e) { errors++; errs.set(String((e as Error).message), (errs.get(String((e as Error).message)) ?? 0) + 1); return null; }
}
function player(): P {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { addr: b58encode(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)), key: privateKey };
}
async function signIn(p: P) {
  const c = await call('POST', '/v1/auth/challenge', undefined, { wallet: p.addr });
  const data = new TextEncoder().encode(c.message);
  const msg = Buffer.from([1, 0, 1, ...cu16(2), ...b58decode(p.addr), ...MEMO, ...new Array(32).fill(0), ...cu16(1), 1, ...cu16(1), 0, ...cu16(data.length), ...data]);
  const tx = Buffer.concat([Buffer.from(cu16(1)), sign(null, msg, p.key), msg]).toString('base64');
  p.token = (await call('POST', '/v1/auth/verify', undefined, { nonce: c.nonce, tx })).token;
}
const pct = (q: number) => { const s = [...lat].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]?.toFixed(1); };

const players = Array.from({ length: Number(N) }, player);
const t0 = performance.now();
await Promise.all(players.map(signIn));
console.log(`${players.length} players signed in in ${((performance.now() - t0) / 1000).toFixed(2)} s`);
lat.length = 0;
const end = Date.now() + Number(D) * 1000;
const peer = (i: number) => players[(i + 1 + Math.floor(Math.random() * (players.length - 1))) % players.length].addr;
const start = performance.now();
await Promise.all(players.map(async (p, i) => {
  let tick = Math.floor(Math.random() * 6);
  await new Promise((r) => setTimeout(r, Math.random() * 2000));
  while (Date.now() < end) {
    await call('GET', '/v1/inbox', p);
    if (tick % 2 === 1) await call('GET', `/v1/dm/${peer(i)}`, p);
    if (tick % 3 === 2) await call('POST', `/v1/dm/${peer(i)}`, p, { body: `gm from load test ${tick}` });
    tick++;
    await new Promise((r) => setTimeout(r, 2000));
  }
}));
const secs = (performance.now() - start) / 1000;
console.log(`${lat.length} requests in ${secs.toFixed(1)} s = ${(lat.length / secs).toFixed(1)} req/s · p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms · max ${Math.max(...lat).toFixed(1)} ms`);
console.log(`errors ${errors} · rate limited ${limited}${errs.size ? ' · ' + JSON.stringify([...errs]) : ''}`);
