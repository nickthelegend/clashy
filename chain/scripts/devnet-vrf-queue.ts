// Shows recent activity on MagicBlock's devnet VRF base queue and program (is the hosted oracle answering?).
import { Connection, PublicKey } from '@solana/web3.js';
const c = new Connection(process.env.CLASHY_BASE ?? 'https://rpc.magicblock.app/devnet', 'confirmed');
for (const a of ['Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh', 'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz']) {
  const s = await c.getSignaturesForAddress(new PublicKey(a), { limit: 10 });
  console.log(a.slice(0, 6), s.map((x) => new Date((x.blockTime ?? 0) * 1000).toISOString().slice(5, 19) + (x.err ? '!' : '')).join(' '));
}
const q = await c.getAccountInfo(new PublicKey('Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh'));
console.log('queue bytes', q?.data.length, 'header', Buffer.from(q!.data.subarray(0, 16)).toString('hex'));
