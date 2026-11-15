// Chats, profiles and rankings. Messages run on a MagicBlock Ephemeral Rollup and identities are Solana wallets,
// both built from the Blitz kickoff. Until then these report "setup" and the UI says so, never inventing people.
export type Chat = { id: string; kind: 'dm' | 'clan' | 'challenge'; name: string; last: string; at: number; unread: number };
export type Ranked = { rank: number; name: string; pnl7d: number; winRate: number };
export type Profile = { name: string; duels: number; winRate: number; pnl30d: number; bestStreak: number; rank?: number };

export const SOCIAL_LIVE = false;
export const SOCIAL_SETUP = 'Chats and profiles run on the Clashy program on MagicBlock. They go live at the Blitz kickoff, along with wallet sign-in.';

export type State<T> = { status: 'setup' } | { status: 'ready'; data: T };
export const useChats = (): State<Chat[]> => (SOCIAL_LIVE ? { status: 'ready', data: [] } : { status: 'setup' });
export const useLeaderboard = (): State<Ranked[]> => (SOCIAL_LIVE ? { status: 'ready', data: [] } : { status: 'setup' });
export const useMyProfile = (): State<Profile> => ({ status: 'setup' });
