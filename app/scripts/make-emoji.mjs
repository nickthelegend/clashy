// Builds src/stickers/emoji.json for the emoji keyboard from emojibase-data (MIT): every fully-qualified emoji up to
// Emoji 15.0 (so it renders on iOS 16.4+ / Android 14+ instead of a tofu box), grouped like the system keyboards,
// with its name and tags for search. Skin-tone variants are left out (the default yellow is shown).
//   node scripts/make-emoji.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const data = require('emojibase-data/en/data.json');
const GROUPS = [
  [0, 'smileys', 'Smileys & emotion'], [1, 'people', 'People'], [3, 'nature', 'Animals & nature'], [4, 'food', 'Food & drink'],
  [6, 'activity', 'Activity'], [5, 'travel', 'Travel & places'], [7, 'objects', 'Objects'], [8, 'symbols', 'Symbols'], [9, 'flags', 'Flags'],
];
const out = GROUPS.map(([g, key, name]) => ({
  key, name,
  list: data.filter((e) => e.group === g && (e.version ?? 99) <= 15 && !/regional indicator/.test(e.label))
    .sort((a, b) => a.order - b.order)
    .map((e) => [e.emoji, e.label, [...new Set([...(e.tags ?? []), ...e.label.split(/[\s:,]+/)])].join(' ').toLowerCase()]),
}));
writeFileSync(new URL('../src/stickers/emoji.json', import.meta.url), JSON.stringify(out));
console.log(out.map((g) => `${g.key} ${g.list.length}`).join(', '));
