// Prints the on-chain proof of one finished Royale: every transaction that touched the tournament account on
// Solana devnet and on MagicBlock's rollup, in time order, with the instruction name and an explorer link.
//   source .devnet.env && CLASHY_ROLE=admin npx tsx scripts/royale-proof.ts [tournament address]   (default: the newest finished Royale)
import { Connection, PublicKey } from '@solana/web3.js';
import { BASE_URL, ER_URL, baseProgram, programId } from '../tests/common.ts';

/** getTransaction over raw JSON-RPC with version 1 allowed: web3.js only parses legacy and v0, and the Magic Action
 *  settle that MagicBlock's validator sends home is a version-1 transaction. */
async function rawTx(conn: Connection, sig: string): Promise<{ meta?: { logMessages?: string[] } } | null> {
  const r = await fetch(conn.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { maxSupportedTransactionVersion: 1, encoding: 'json', commitment: 'confirmed' }] }) });
  return ((await r.json()) as { result?: { meta?: { logMessages?: string[] } } }).result ?? null;
}

const base = new Connection(BASE_URL, 'confirmed');
const rollup = new Connection(ER_URL.replace(/\?.*$/, ''), 'confirmed');
const erHost = ER_URL.replace(/\?.*$/, '');
const link = (sig: string, onEr: boolean) =>
  `https://explorer.solana.com/tx/${sig}?cluster=${onEr ? `custom&customUrl=${encodeURIComponent(erHost)}` : 'devnet'}`;

let tour: PublicKey;
if (process.argv[2]) tour = new PublicKey(process.argv[2]);
else {
  const done = (await baseProgram.account.tournament.all()).filter((t) => t.account.status >= 2).sort((a, b) => Number(b.account.nonce) - Number(a.account.nonce));
  if (!done.length) throw new Error('no finished Royale on this cluster');
  tour = done[0].publicKey;
}
const d = await baseProgram.account.tournament.fetch(tour);
const accounts = [tour];

type Row = { t: number; layer: 'Solana' | 'rollup'; ix: string; sig: string; err: boolean };
const rows = new Map<string, Row>();
async function collect(conn: Connection, layer: Row['layer']) {
  for (const acc of accounts) {
    const sigs = await conn.getSignaturesForAddress(acc, { limit: 100 }).catch(() => []);
    for (const s of sigs) {
      if (rows.has(s.signature)) continue;
      const tx = await rawTx(conn, s.signature).catch(() => null);
      const logs = tx?.meta?.logMessages ?? [];
      const names = logs.filter((l) => l.startsWith('Program log: Instruction: ')).map((l) => l.slice(26));
      const ix = names.length ? [...new Set(names)].join(' + ') : logs.some((l) => /Vrf1RN/.test(l)) ? 'MagicBlock VRF oracle' : logs.some((l) => /DELeGG/.test(l)) ? 'MagicBlock delegation program' : logs.some((l) => /MagicRoot|CloneAccount/.test(l)) ? 'MagicBlock validator: account sync' : logs.some((l) => /eHyd5BU8/.test(l)) ? 'MagicBlock scheduler: a run queued before the cancel' : '(no log)';
      rows.set(s.signature, { t: s.blockTime ?? 0, layer, ix, sig: s.signature, err: !!s.err });
    }
  }
}
await collect(base, 'Solana');
await collect(rollup, 'rollup');
const sorted = [...rows.values()].sort((a, b) => a.t - b.t);
console.log(`royale ${tour.toBase58()} · coin ${d.coin} · players ${d.count} · rounds ${d.round} · lives ${d.lives} · status ${d.status}`);
console.log(`${sorted.length} transactions (${sorted.filter((r) => r.layer === 'rollup').length} on the rollup)\n`);
for (const r of sorted) {
  console.log(`${new Date(r.t * 1000).toISOString().slice(11, 19)}  ${r.layer.padEnd(6)}  ${r.err ? 'FAILED ' : ''}${r.ix}\n          ${link(r.sig, r.layer === 'rollup')}`);
}
