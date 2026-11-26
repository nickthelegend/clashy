// Prints the on-chain proof of one squad war: every transaction that touched either squad (clan) account on Solana
// devnet, in time order, with the instruction name and an explorer link, plus both squads' chests and war record.
//   source .devnet.env && CLASHY_ROLE=admin npx tsx scripts/squad-proof.ts <squad A address> <squad B address>
import { Connection, PublicKey } from '@solana/web3.js';
import { BASE_URL, baseProgram } from '../tests/common.ts';

/** getTransaction over raw JSON-RPC with version 1 allowed: web3.js only parses legacy and v0, and the Magic Action
 *  settle that MagicBlock's validator sends home is a version-1 transaction. */
async function rawTx(conn: Connection, sig: string): Promise<{ meta?: { logMessages?: string[] } } | null> {
  const r = await fetch(conn.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { maxSupportedTransactionVersion: 1, encoding: 'json', commitment: 'confirmed' }] }) });
  return ((await r.json()) as { result?: { meta?: { logMessages?: string[] } } }).result ?? null;
}

const base = new Connection(BASE_URL, 'confirmed');
const squads = process.argv.slice(2, 4).map((a) => new PublicKey(a));
if (squads.length !== 2) throw new Error('usage: squad-proof.ts <squad A> <squad B>');
const link = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
type Row = { t: number; ix: string; sig: string; err: boolean };
const rows = new Map<string, Row>();
for (const acc of squads) {
  const sigs = await base.getSignaturesForAddress(acc, { limit: 200 });
  for (const s of sigs) {
    if (rows.has(s.signature)) continue;
    const tx = await rawTx(base, s.signature).catch(() => null);
    const logs = tx?.meta?.logMessages ?? [];
    const names = logs.filter((l) => l.startsWith('Program log: Instruction: ')).map((l) => l.slice(26));
    rows.set(s.signature, { t: s.blockTime ?? 0, ix: names.length ? [...new Set(names)].join(' + ') : '(no log)', sig: s.signature, err: !!s.err });
  }
}
for (const k of squads) {
  const c = await (baseProgram.account as any).clan.fetch(k);
  const name = Buffer.from(c.name).toString().replace(/\0/g, '');
  console.log(`squad ${name} ${k.toBase58()} · chest ${(Number(c.chest) / 1e6).toFixed(2)} USDC · trades ${(Number(c.scorePnl) / 1e6).toFixed(2)} · wars ${c.wins}W ${c.losses}L`);
}
const sorted = [...rows.values()].sort((a, b) => a.t - b.t);
console.log(`${sorted.length} transactions on Solana devnet\n`);
for (const r of sorted) console.log(`${new Date(r.t * 1000).toISOString().slice(11, 19)}  ${r.err ? 'FAILED ' : ''}${r.ix}\n          ${link(r.sig)}`);
