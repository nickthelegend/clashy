// After a squad war's window ends, anyone may close a squad's open positions at the base feed price (lib.rs
// close_position: "anyone may close a clan's positions once its war window is over, so a war can always settle").
// This closes every open position of one squad with the sponsor key as the closer. Used when a rival squad's captain
// is offline at the bell.
//   source .devnet.env && CLASHY_ROLE=admin npx tsx scripts/close-war-trades.ts <squad address>
import { PublicKey } from '@solana/web3.js';
import { P, baseProgram, programFor, sponsor } from '../tests/common.ts';

const clan = new PublicKey(process.argv[2] ?? '');
const c = await baseProgram.account.clan.fetch(clan);
const prog = programFor(sponsor);
let closed = 0;
// positions are keyed by the proposal id that placed them
for (let id = 0; id < Number(c.proposals); id++) {
  const key = P.position(clan, id);
  const pos = await baseProgram.account.clanPosition.fetchNullable(key);
  if (!pos || !pos.open) continue;
  const sig = await prog.methods.closePosition().accountsPartial({ closer: sponsor.publicKey, clan, position: key, price: P.baseFeed(pos.coin), war: c.war }).rpc();
  console.log(`closed position ${id} of ${clan.toBase58()}: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  closed++;
}
console.log(closed ? `${closed} closed` : 'no open positions');
