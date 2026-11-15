// Clans and clan chat. The source of truth is the Clashy program on Solana: clan accounts on the base layer,
// each clan's chat as a ring buffer delegated to a MagicBlock Ephemeral Rollup.
// The program is built from the Blitz kickoff (Nov 20). Until it's deployed, every call reports
// "setup required" instead of inventing clans or messages.
export type Clan = { id: string; name: string; members: number; online: number; warRecord?: string; crest?: string };
export type ClanMessage = { id: string; author: string; text: string; at: number; kind?: 'text' | 'challenge' | 'proposal' };

export const CLAN_PROGRAM_ID: string | undefined = undefined; // set when the program is deployed
export const SETUP_REASON = 'Clans live on chain. They open when the Clashy program is deployed on MagicBlock at the Blitz kickoff.';

export type ClanState<T> = { status: 'setup' } | { status: 'ready'; data: T };

export function useClans(): ClanState<Clan[]> {
  return CLAN_PROGRAM_ID ? { status: 'ready', data: [] } : { status: 'setup' };
}
export function useClan(_id: string): ClanState<{ clan: Clan; messages: ClanMessage[]; joined: boolean }> {
  return { status: 'setup' };
}
