// Shows the latest Clashy VRF requests on devnet and whether MagicBlock's oracle answered (callback logs).
import { Connection, PublicKey } from '@solana/web3.js';
const base = new Connection(process.env.CLASHY_BASE ?? 'https://rpc.magicblock.app/devnet', 'confirmed');
const program = new PublicKey('FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS');
const sigs = await base.getSignaturesForAddress(program, { limit: 40 });
for (const s of sigs) {
  const tx = await base.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  const logs = tx?.meta?.logMessages ?? [];
  const ix = logs.find((l) => l.startsWith('Program log: Instruction:'))?.replace('Program log: Instruction: ', '');
  if (!ix || !/Roll|Callback|Coin/i.test(ix)) continue;
  console.log(new Date((s.blockTime ?? 0) * 1000).toISOString().slice(11, 19), ix, s.err ? `ERR ${JSON.stringify(s.err)}` : 'ok', s.signature.slice(0, 12));
  if (s.err || /Callback/.test(ix)) console.log('   ', logs.filter((l) => /log:|failed|error/i.test(l)).slice(-4).join('\n    '));
}
