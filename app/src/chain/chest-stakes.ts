// Your share of each squad chest, read from chain: every Member account whose wallet is you (seeds "member", clan,
// wallet) gives your chest shares and what you put in; the Clan account gives the chest's USDC and total shares.
// Shares redeem pro rata (withdraw_chest), so your share is worth shares × chest / total shares, in USDC.
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { clanName } from './client';
import { reader } from './social';

export type ChestStake = { clan: PublicKey; name: string; crest: number; value: number; deposit: number };

export async function readChestStakes(me: PublicKey): Promise<ChestStake[]> {
  const mine = await reader.account.member.all([{ memcmp: { offset: 40, bytes: me.toBase58() } }]);
  if (!mine.length) return [];
  const keys = mine.map((m) => m.account.clan);
  const clans = await reader.account.clan.fetchMultiple(keys);
  return clans.flatMap((c, i) => {
    const shares = new BN(mine[i].account.shares.toString());
    if (!c || shares.isZero()) return [];
    const total = new BN(c.shares.toString());
    const units = total.isZero() ? new BN(0) : shares.mul(new BN(c.chest.toString())).div(total);
    return [{ clan: keys[i], name: clanName(c.name), crest: c.crest, value: Number(units.toString()) / 1e6, deposit: Number(mine[i].account.deposit.toString()) / 1e6 }];
  });
}
