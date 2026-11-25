// For Clashy's latest VRF requests on devnet: the game account, and every transaction that touched it since.
import { Connection, PublicKey } from '@solana/web3.js';
const c = new Connection(process.env.CLASHY_BASE ?? 'https://rpc.magicblock.app/devnet', 'confirmed');
const program = new PublicKey('FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS');
const sigs = await c.getSignaturesForAddress(program, { limit: 30 });
for (const s of sigs) {
  const tx = await c.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  const logs = tx?.meta?.logMessages ?? [];
  if (!logs.some((l) => /Instruction: Request(CoinRoll|TournamentCoin)/.test(l))) continue;
  const keys = tx!.transaction.message.getAccountKeys().staticAccountKeys;
  console.log('request', s.signature.slice(0, 10), 'accounts', keys.map((k) => k.toBase58().slice(0, 6)).join(' '));
  console.log('  logs:', logs.filter((l) => /log:|consumed/.test(l)).slice(0, 6).join(' | ').slice(0, 600));
  break;
}
