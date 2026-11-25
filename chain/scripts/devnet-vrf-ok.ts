// Classifies recent successful MagicBlock VRF transactions on devnet: requests vs oracle answers (callbacks).
import { Connection, PublicKey } from '@solana/web3.js';
const c = new Connection(process.env.CLASHY_BASE ?? 'https://rpc.magicblock.app/devnet', 'confirmed');
const s = await c.getSignaturesForAddress(new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'), { limit: 60 });
const out: string[] = [];
for (const x of s) {
  if (x.err) continue;
  const tx = await c.getTransaction(x.signature, { maxSupportedTransactionVersion: 0 });
  const logs = tx?.meta?.logMessages ?? [];
  const first = tx?.transaction.message.getAccountKeys().staticAccountKeys[0]?.toBase58().slice(0, 6);
  const kind = logs.find((l) => /Instruction|Program log/.test(l))?.slice(0, 70) ?? '?';
  out.push(`${new Date((x.blockTime ?? 0) * 1000).toISOString().slice(11, 19)} payer ${first} ${kind}`);
  if (out.length >= 12) break;
}
console.log(out.join('\n'));
