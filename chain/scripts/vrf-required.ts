import { P, authority, baseProgram } from '../tests/common.ts';
const c = await baseProgram.account.config.fetch(P.config);
if (!c.vrfRequired) await baseProgram.methods.updateConfig(c.rakeBps, true, c.crank, c.treasury).accountsPartial({ authority: authority.publicKey }).rpc();
const n = await baseProgram.account.config.fetch(P.config);
console.log('vrfRequired', n.vrfRequired, 'queue', n.vrfQueue.toBase58(), 'rakeBps', n.rakeBps, 'erValidator', (n as any).erValidator?.toBase58?.());
