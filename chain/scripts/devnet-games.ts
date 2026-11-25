// Lists the last hour's duels and Royales on Solana (status, VRF pending, coin): quick devnet health check.
import { baseProgram } from '../tests/common.ts';
const hour = Date.now() / 1000 - 3600;
for (const d of await baseProgram.account.duel.all()) {
  if (Number(d.account.matchedAt) < hour && Number(d.account.expiresAt) < hour) continue;
  console.log('duel', d.publicKey.toBase58().slice(0, 6), 'status', d.account.status, 'vrfPending', d.account.vrfPending, 'coin', d.account.coin, 'matched', new Date(Number(d.account.matchedAt) * 1000).toISOString().slice(11, 19));
}
for (const t of await baseProgram.account.tournament.all()) {
  if (Number(t.account.createdAt) < hour) continue;
  console.log('royale', t.publicKey.toBase58().slice(0, 6), 'status', t.account.status, 'vrfPending', t.account.vrfPending, 'coin', t.account.coin);
}
