// Local debugging: simulates tick_round on every live Royale on the rollup and prints the program logs.
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from '@magicblock-labs/ephemeral-rollups-sdk';
import { er, erProgram, LOCAL_ER_VALIDATOR, P, programId, PublicKey, sponsor } from '../tests/common.ts';
const KEEPER = PublicKey.findProgramAddressSync([Buffer.from('keeper')], programId)[0];
const FEE_VAULT = PublicKey.findProgramAddressSync([Buffer.from('magic-fee-vault'), LOCAL_ER_VALIDATOR.toBuffer()], new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'))[0];
for (const { publicKey: tournament, account: t } of await erProgram.account.tournament.all()) {
  if (t.status !== 1) continue;
  const tx = await erProgram.methods.tickRound().accountsPartial({ keeper: KEEPER, tournament, price: P.feed(t.coin), magicFeeVault: FEE_VAULT, magicContext: MAGIC_CONTEXT_ID, magicProgram: MAGIC_PROGRAM_ID }).transaction();
  tx.feePayer = sponsor.publicKey;
  tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
  const sim = await er.simulateTransaction(tx);
  console.log(tournament.toBase58().slice(0, 8), 'round', t.round, 'err', JSON.stringify(sim.value.err), 'units', sim.value.unitsConsumed);
  console.log((sim.value.logs ?? []).slice(-14).join('\n'));
}
