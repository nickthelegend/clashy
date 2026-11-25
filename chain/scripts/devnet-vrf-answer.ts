// Prints the full logs of MagicBlock's oracle answer transactions around a time window, to see each callback.
import { Connection, PublicKey } from '@solana/web3.js';
const c = new Connection(process.env.CLASHY_BASE ?? 'https://rpc.magicblock.app/devnet', 'confirmed');
const s = await c.getSignaturesForAddress(new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'), { limit: 60 });
for (const x of s) {
  const t = new Date((x.blockTime ?? 0) * 1000).toISOString().slice(11, 19);
  if (!['11:17:10', '11:18:50'].includes(t)) continue;
  const tx = await c.getTransaction(x.signature, { maxSupportedTransactionVersion: 0 });
  console.log('===', t, x.signature.slice(0, 12), x.err ? 'ERR' : 'ok');
  console.log((tx?.meta?.logMessages ?? []).join('\n'));
}
