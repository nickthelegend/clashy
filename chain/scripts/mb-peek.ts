// Prints the keeper and every game on the rollup (status, round, ticks): a quick look at what MagicBlock's crank did.
//   npx tsx scripts/mb-peek.ts
import { er, erProgram, programId, PublicKey } from '../tests/common.ts';
const K = PublicKey.findProgramAddressSync([Buffer.from('keeper')], programId)[0];
const info = await er.getAccountInfo(K);
console.log('keeper', K.toBase58(), info ? JSON.stringify(erProgram.coder.accounts.decode('keeper', info.data)) : 'not on the rollup');
for (const t of await erProgram.account.tournament.all()) console.log(`royale ${t.publicKey.toBase58().slice(0, 8)} status ${t.account.status} round ${t.account.round} lives ${t.account.lives.slice(0, t.account.count)}`);
for (const d of await erProgram.account.duel.all()) console.log(`duel ${d.publicKey.toBase58().slice(0, 8)} status ${d.account.status} exit ${d.account.exitPrice} winner ${d.account.winner}`);
