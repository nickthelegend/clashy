// Chats are not built yet: there is no message store, on chain or off. The Chats tab says so instead of showing
// invented conversations. (Profiles, rankings and duel history are on chain: see chain/reads.ts.)
export type Chat = { id: string; kind: 'dm' | 'clan' | 'challenge'; name: string; last: string; at: number; unread: number };
export type State<T> = { status: 'setup' } | { status: 'ready'; data: T };
export const CHATS_NOTE = 'Direct messages and clan chat are not built yet. Duels, Royales and clans are live: play them from the Arena.';
export const useChats = (): State<Chat[]> => ({ status: 'setup' });
