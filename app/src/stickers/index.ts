// Stickers and emoji for every chat (DMs, squad channels, clash taunts). A sticker travels as a short text token, so
// it works through the social server and fits the on-chain squad channel (120 bytes): an invisible separator, `stk:`
// and the sticker's id, e.g. "⁣stk:clashy/07" (16 bytes). Old clients show the token as text; nothing breaks.
// Recents and favourites are per device (AsyncStorage).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { PACKS, type Pack, type Sticker } from './packs.gen';
import EMOJI from './emoji.json';

export { PACKS };
export type { Pack, Sticker };
export type EmojiGroup = { key: string; name: string; list: [emoji: string, name: string, tags: string][] };
export const EMOJI_GROUPS = EMOJI as EmojiGroup[];

const BY_ID = new Map(PACKS.flatMap((p) => p.stickers.map((s) => [s.id, s] as const)));
export const packOf = (id: string) => PACKS.find((p) => p.id === id);
export const stickerById = (id: string) => BY_ID.get(id);

export const STICKER_TAG = '⁣stk:';
export const stickerBody = (s: Sticker) => STICKER_TAG + s.id;
/** The sticker a message carries, or null for a plain text message. */
export const stickerOf = (body: string | undefined | null): Sticker | null =>
  body && body.startsWith(STICKER_TAG) ? BY_ID.get(body.slice(STICKER_TAG.length).trim()) ?? null : null;
export const isStickerBody = (body: string | undefined | null) => !!body && body.startsWith(STICKER_TAG);
// Replies and reactions ride in ordinary messages too, so they work in DMs and in on-chain squad channels alike:
//   a reply:    "⁣re:<message id>⁣" + the reply (text or a sticker token)
//   a reaction: "⁣rx:<message id>:<emoji>" (an empty emoji takes yours back); the thread folds these onto the
//               message they point at instead of showing them as messages.
const SEP = '⁣';
export const replyBody = (to: number, body: string) => `${SEP}re:${to}${SEP}${body}`;
export const reactBody = (to: number, emoji: string) => `${SEP}rx:${to}:${emoji}`;
export type Parsed = { text: string; reply?: number; react?: { to: number; emoji: string } };
export function parseBody(body: string): Parsed {
  if (body.startsWith(`${SEP}rx:`)) {
    const m = body.match(/^⁣rx:(\d+):(.*)$/su);
    if (m) return { text: '', react: { to: Number(m[1]), emoji: m[2].trim() } };
  }
  if (body.startsWith(`${SEP}re:`)) {
    const m = body.match(/^⁣re:(\d+)⁣(.*)$/su);
    if (m) return { text: m[2], reply: Number(m[1]) };
  }
  return { text: body };
}

/** One line for chat lists and notifications: "😏 Sticker" instead of the raw token. */
export const previewText = (body: string): string => {
  const p = parseBody(body);
  if (p.react) return p.react.emoji ? `Reacted ${p.react.emoji} to a message` : 'Removed a reaction';
  if (!isStickerBody(p.text)) return p.text;
  const s = stickerOf(p.text);
  return s ? `${s.emoji} Sticker` : 'Sticker';
};

// One emoji: a pictograph (or a flag pair, or a keycap) with its variation selector, skin tone and ZWJ joins.
const ONE = '(?:\\p{Extended_Pictographic}|[\\u{1F1E6}-\\u{1F1FF}]{2}|[#*0-9]\\uFE0F?\\u20E3)(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])*(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])*)*';
const ONE_RE = new RegExp(ONE, 'gu');
const ONLY_RE = new RegExp(`^(?:\\s*${ONE})+\\s*$`, 'u');
const LAST_RE = new RegExp(`(?:${ONE})$`, 'u');
/** 1 to 3 emoji and nothing else: Telegram shows those big, without a bubble. Returns how many (0 = a normal message). */
export function jumboCount(body: string): number {
  const t = body.trim();
  if (!t || t.length > 48 || !ONLY_RE.test(t)) return 0;
  const n = t.match(ONE_RE)?.length ?? 0;
  return n <= 3 ? n : 0;
}
/** Deletes the last character, or the whole last emoji (with its joins), like a keyboard's backspace. */
export function backspace(text: string): string {
  const m = text.match(LAST_RE);
  if (m) return text.slice(0, text.length - m[0].length);
  return Array.from(text).slice(0, -1).join('');
}

/** Stickers for what's being typed: one emoji finds stickers tagged with it; a short word finds captions and tags. */
export function suggestStickers(text: string, max = 12): Sticker[] {
  const t = text.trim();
  if (!t || t.length > 16) return [];
  if (jumboCount(t) === 1) {
    const e = t.replace(/️/g, '');
    return PACKS.flatMap((p) => p.stickers).filter((s) => s.emoji.replace(/️/g, '') === e).slice(0, max);
  }
  const q = t.toLowerCase();
  if (q.length < 2) return [];
  return PACKS.flatMap((p) => p.stickers).filter((s) => s.word.toLowerCase() === q || s.tags.split(' ').includes(q)).slice(0, max);
}
export function searchStickers(query: string): Sticker[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PACKS.flatMap((p) => p.stickers.map((s) => ({ s, p })))
    .filter(({ s, p }) => s.word.toLowerCase().includes(q) || s.tags.includes(q) || s.emoji === query.trim() || p.name.toLowerCase().includes(q))
    .map(({ s }) => s);
}
export function searchEmoji(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: string[] = [];
  for (const g of EMOJI_GROUPS) for (const [e, , tags] of g.list) if (tags.includes(q)) out.push(e);
  return out.slice(0, 160);
}

// Per-device memory: recently used stickers and emoji, and favourite stickers.
const K = { stickers: 'clashy:stickers:recent', emoji: 'clashy:emoji:recent', favs: 'clashy:stickers:favs' } as const;
type Key = keyof typeof K;
const mem: Record<Key, string[]> = { stickers: [], emoji: [], favs: [] };
const subs = new Set<() => void>();
let loaded = false;
async function load() {
  if (loaded) return;
  loaded = true;
  await Promise.all((Object.keys(K) as Key[]).map(async (k) => {
    try { const v = JSON.parse((await AsyncStorage.getItem(K[k])) ?? '[]'); if (Array.isArray(v)) mem[k] = v.filter((x) => typeof x === 'string'); } catch { /* fresh device */ }
  }));
  subs.forEach((f) => f());
}
function put(k: Key, list: string[]) {
  mem[k] = list;
  AsyncStorage.setItem(K[k], JSON.stringify(list)).catch(() => {});
  subs.forEach((f) => f());
}
export const rememberSticker = (id: string) => put('stickers', [id, ...mem.stickers.filter((x) => x !== id)].slice(0, 20));
export const rememberEmoji = (e: string) => put('emoji', [e, ...mem.emoji.filter((x) => x !== e)].slice(0, 32));
export const toggleFav = (id: string) => put('favs', mem.favs.includes(id) ? mem.favs.filter((x) => x !== id) : [id, ...mem.favs].slice(0, 40));
/** Live recents and favourites for the keyboard. */
export function useStickerMemory() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    load();
    return () => { subs.delete(f); };
  }, []);
  return {
    recent: mem.stickers.map((id) => BY_ID.get(id)).filter((s): s is Sticker => !!s),
    favs: mem.favs.map((id) => BY_ID.get(id)).filter((s): s is Sticker => !!s),
    favIds: new Set(mem.favs),
    recentEmoji: mem.emoji,
  };
}
