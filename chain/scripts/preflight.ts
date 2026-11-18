// Preflight: is a Clashy deployment ready? Read-only: it checks settings, endpoints, the deployed program and balances,
// and prints PASS / FAIL / WARN per line with what to do. It never signs or sends anything and never prints a secret.
//   npx tsx scripts/preflight.ts testnet     (reads the environment: deploy/testnet.env + chain/.env when run by compose)
//   npx tsx scripts/preflight.ts mainnet
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { existsSync, readFileSync, statSync } from 'node:fs';

const target = process.argv[2];
if (target !== 'testnet' && target !== 'mainnet') { console.error('usage: preflight.ts testnet|mainnet'); process.exit(2); }
const main = target === 'mainnet';
const env = (k: string) => (process.env[k] ?? '').trim();
type R = 'PASS' | 'FAIL' | 'WARN';
const rows: [R, string, string][] = [];
const add = (r: R, what: string, note = '') => rows.push([r, what, note]);

// settings
const need = (k: string, note: string, check?: (v: string) => string | null) => {
  const v = env(k);
  if (!v) return add('FAIL', k, `Setup required: ${note}`);
  const bad = check?.(v);
  add(bad ? 'FAIL' : 'PASS', k, bad ?? '');
};
const url = (v: string) => (/^https:\/\//.test(v) ? null : 'must be an https:// URL');
need('CLASHY_BASE', main ? 'a mainnet RPC (Helius / Triton)' : 'devnet RPC, e.g. https://api.devnet.solana.com', (v) => url(v) ?? (main ? (/devnet|testnet/.test(v) ? 'points at a test network' : null) : (/devnet/.test(v) ? null : 'testnet runs on devnet')));
need('CLASHY_ER', main ? 'a MagicBlock mainnet rollup, e.g. https://eu.magicblock.app' : 'a MagicBlock devnet rollup, e.g. https://devnet-eu.magicblock.app', (v) => url(v) ?? (main === /devnet/.test(v) ? (main ? 'points at devnet' : 'testnet uses a devnet rollup') : null));
need('CLASHY_ER_VALIDATOR', "the rollup validator's identity, from MagicBlock's docs for that region");
need('CLASHY_TREASURY', 'the USDC wallet that receives the rake');
need('CLASHY_APP_ORIGIN', 'the app\'s exact web origin', (v) => (v === '*' ? 'must not be * off the local stack' : /^https:\/\//.test(v) ? null : 'must be https://'));
need('CLASHY_SOCIAL_SECRET', '64 random characters (openssl rand -hex 32)', (v) => (v.length >= 32 ? null : 'at least 32 characters'));
need('CLASHY_INDEXER_SECRET', '64 random characters, shared by social and the indexer', (v) => (v.length >= 32 ? null : 'at least 32 characters'));
if (env('CLASHY_LOCAL') === '1') add('FAIL', 'CLASHY_LOCAL', 'must be 0 (or unset) off the local stack: 1 turns on the test faucet and local keys');
else add('PASS', 'CLASHY_LOCAL', 'off');
if (main) need('CLASHY_DATABASE_URL', 'Supabase Postgres connection string (Project Settings → Database, the pooled URI)', (v) => (/^postgres(ql)?:\/\//.test(v) ? null : 'must be a postgres:// URL'));
else add(env('CLASHY_DATABASE_URL') ? 'PASS' : 'WARN', 'CLASHY_DATABASE_URL', env('CLASHY_DATABASE_URL') ? 'Postgres' : 'unset: SQLite on the server volume (fine for the hackathon; back it up)');
need('CLASHY_PRIVY_APP_ID', 'the Clashy app in the Privy dashboard');
need('CLASHY_PRIVY_APP_SECRET', 'its app secret');

// keys: present as files, owner-only permissions, never printed
const keyFile = (k: string) => {
  const p = env(k);
  if (!p) return add('FAIL', k, 'Setup required: path to the keypair file (mounted read-only)'), null;
  if (!existsSync(p)) return add('FAIL', k, 'the file does not exist at that path'), null;
  if (statSync(p).mode & 0o077) add('WARN', k, 'readable by other users: chmod 600');
  try { const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8')))); add('PASS', k, kp.publicKey.toBase58()); return kp.publicKey; }
  catch { return add('FAIL', k, 'not a Solana keypair file'), null; }
};
const sponsor = keyFile('CLASHY_SPONSOR');
const authority = keyFile('CLASHY_AUTHORITY');

// endpoints and chain state
const programId = new PublicKey(JSON.parse(readFileSync(new URL('../target/idl/clashy.json', import.meta.url), 'utf8')).address);
async function chain() {
  if (!env('CLASHY_BASE')) return;
  const c = new Connection(env('CLASHY_BASE'), 'confirmed');
  try {
    const [genesis, v] = await Promise.all([c.getGenesisHash(), c.getVersion()]);
    const isMain = genesis === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
    add(isMain === main ? 'PASS' : 'FAIL', 'RPC network', `${isMain ? 'mainnet-beta' : 'not mainnet'} · solana-core ${v['solana-core']}`);
  } catch (e) { return add('FAIL', 'RPC', `unreachable: ${(e as Error).message}`); }
  const prog = await c.getAccountInfo(programId);
  if (!prog?.executable) add('FAIL', 'Program', `${programId.toBase58()} is not deployed here: run scripts/deploy.sh ${main ? 'mainnet' : 'devnet'}`);
  else add('PASS', 'Program', `${programId.toBase58()} deployed`);
  const config = PublicKey.findProgramAddressSync([Buffer.from('config')], programId)[0];
  add((await c.getAccountInfo(config)) ? 'PASS' : 'FAIL', 'Config account', (await c.getAccountInfo(config)) ? 'initialised' : 'not initialised: deploy.sh runs first-time setup');
  const bal = async (who: string, k: PublicKey | null, min: number) => {
    if (!k) return;
    const sol = (await c.getBalance(k)) / LAMPORTS_PER_SOL;
    add(sol >= min ? 'PASS' : 'FAIL', `${who} balance`, `${sol.toFixed(4)} SOL (needs at least ${min})`);
  };
  await bal('Sponsor', sponsor, main ? 1 : 0.5);
  await bal('Authority (crank)', authority, main ? 0.3 : 0.2);
}
async function rollup() {
  if (!env('CLASHY_ER')) return;
  try { const r = await new Connection(env('CLASHY_ER'), 'confirmed').getSlot(); add('PASS', 'MagicBlock rollup', `reachable, slot ${r}`); }
  catch (e) { add('FAIL', 'MagicBlock rollup', `unreachable: ${(e as Error).message}`); }
}
async function services() {
  for (const [name, u] of [['Social server', env('CLASHY_SOCIAL') || 'http://127.0.0.1:8791'], ['Relay', env('CLASHY_RELAY') || 'http://127.0.0.1:8790']] as const) {
    try {
      const r = await fetch(`${u}${name === 'Relay' ? '/info' : '/health'}`, { signal: AbortSignal.timeout(5000) });
      const j = (await r.json()) as { db?: string; faucet?: boolean };
      if (name === 'Social server' && main && j.db !== 'postgres') add('FAIL', name, `running on ${j.db}: mainnet needs CLASHY_DATABASE_URL (Supabase)`);
      else if (name === 'Relay' && j.faucet) add('FAIL', name, 'the test-USDC faucet is on: CLASHY_LOCAL must be 0');
      else add(r.ok ? 'PASS' : 'FAIL', name, `${u} answered ${r.status}${j.db ? ` · ${j.db}` : ''}`);
    } catch (e) { add('WARN', name, `${u} not reachable from here (${(e as Error).message}); start the stack and run again`); }
  }
}

await Promise.all([chain(), rollup(), services()]);
const w = Math.max(...rows.map((r) => r[1].length));
console.log(`\nClashy preflight · ${target}\n`);
for (const [r, what, note] of rows) console.log(`${r === 'PASS' ? '✓' : r === 'WARN' ? '!' : '✗'} ${r.padEnd(4)}  ${what.padEnd(w)}  ${note}`);
const fails = rows.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${fails ? `${fails} to fix before ${target} goes live.` : `Ready for ${target}.`}`);
process.exit(fails ? 1 : 0);
