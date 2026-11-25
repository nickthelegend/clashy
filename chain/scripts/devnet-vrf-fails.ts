// Prints the logs of recent failed MagicBlock VRF transactions on devnet (to see why a callback failed).
import { Connection, PublicKey } from '@solana/web3.js';
const c = new Connection(process.env.CLASHY_BASE ?? 'https://rpc.magicblock.app/devnet', 'confirmed');
const s = await c.getSignaturesForAddress(new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'), { limit: 40 });
let n = 0;
for (const x of s) {
  if (!x.err) continue;
  const tx = await c.getTransaction(x.signature, { maxSupportedTransactionVersion: 0 });
  const keys = tx?.transaction.message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58()) ?? [];
  console.log('---', new Date((x.blockTime ?? 0) * 1000).toISOString().slice(11, 19), x.signature.slice(0, 10), 'clashy in tx:', keys.includes('FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS'));
  console.log((tx?.meta?.logMessages ?? []).slice(-8).join('\n'));
  if (++n >= 3) break;
}
