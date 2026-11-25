// Compares the VRF request instruction (inner CPI to MagicBlock's VRF program) of an answered request with ours.
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
const c = new Connection(process.env.CLASHY_BASE ?? 'https://rpc.magicblock.app/devnet', 'confirmed');
const VRF = 'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz';
const s = await c.getSignaturesForAddress(new PublicKey(VRF), { limit: 60 });
let seen = 0;
for (const x of s) {
  const tx = await c.getTransaction(x.signature, { maxSupportedTransactionVersion: 0 });
  const logs = tx?.meta?.logMessages ?? [];
  if (!logs.some((l) => /OpenAuction|RequestCoinRoll/.test(l))) continue;
  const keys = tx!.transaction.message.getAccountKeys({ accountKeysFromLookups: tx!.meta?.loadedAddresses }).keySegments().flat();
  for (const inner of tx!.meta?.innerInstructions ?? []) for (const ix of inner.instructions) {
    if (keys[ix.programIdIndex].toBase58() !== VRF) continue;
    const data = Buffer.from(bs58.decode(ix.data));
    console.log(logs.find((l) => /OpenAuction|RequestCoinRoll/.test(l))?.slice(13), 'data len', data.length, 'hex', data.toString('hex').slice(0, 240));
    console.log('  accounts', ix.accounts.map((i) => keys[i].toBase58().slice(0, 6)).join(' '));
  }
  if (++seen >= 3) break;
}
