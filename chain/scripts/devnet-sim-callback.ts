// Simulates MagicBlock VRF's callback into Clashy on a duel still waiting for its coin (signatures not checked), to see
// whether the callback itself would succeed on devnet.
import { PublicKey, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { P, base, baseProgram, programId, sponsor } from '../tests/common.ts';
const VRF = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
const [identity] = PublicKey.findProgramAddressSync([Buffer.from('identity'), programId.toBuffer()], VRF);
const pending = (await baseProgram.account.duel.all()).filter((d) => d.account.vrfPending && d.account.status === 1);
console.log('pending duels', pending.length, 'scoped vrf identity', identity.toBase58());
for (const { publicKey: duel } of pending.slice(0, 1)) {
  const ix = await baseProgram.methods.coinRollCallback([...Buffer.alloc(32, 7)]).accountsPartial({ vrfProgramIdentity: identity, config: P.config, duel }).instruction();
  const msg = new TransactionMessage({ payerKey: sponsor.publicKey, recentBlockhash: (await base.getLatestBlockhash()).blockhash, instructions: [ix] }).compileToV0Message();
  const sim = await base.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true });
  console.log(duel.toBase58().slice(0, 8), 'err', JSON.stringify(sim.value.err), '\n' + (sim.value.logs ?? []).join('\n'));
}
void Transaction;
