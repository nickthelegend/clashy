// Clashy price history: the crank (scripts/crank.ts) appends one sample a minute of the prices it pushed on chain,
// and the sponsor relay (scripts/sponsor.ts) serves them read-only at GET /history. Nothing else writes this file and
// nothing is backfilled: the history starts the first time the crank ran with this code.
//
// File: chain/.localnet/price-history.jsonl, one JSON object per line: { "t": unix seconds, "p": { "SOL": 141.2, ... } }
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HISTORY_FILE = fileURLToPath(new URL('../.localnet/price-history.jsonl', import.meta.url));
/** Samples older than this are dropped (on crank startup and every hour). */
export const KEEP_SECS = 7 * 86_400;
/** One sample a minute. */
export const SAMPLE_EVERY_SECS = 60;
export type Sample = { t: number; p: Record<string, number> };

/** Parses the JSONL file; a torn or foreign line is skipped, never guessed at. */
export function parseSamples(text: string): Sample[] {
  const out: Sample[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const s = JSON.parse(line) as Sample;
      if (typeof s?.t !== 'number' || !s.p || typeof s.p !== 'object') continue;
      const p: Record<string, number> = {};
      for (const [k, v] of Object.entries(s.p)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) p[k] = v;
      out.push({ t: s.t, p });
    } catch { /* torn line (crank killed mid-write): skip it */ }
  }
  return out.sort((a, b) => a.t - b.t);
}

export function appendSample(s: Sample) {
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  appendFileSync(HISTORY_FILE, `${JSON.stringify(s)}\n`);
}

/** Drops samples older than KEEP_SECS (rewrites the file atomically). Returns how many samples are kept. */
export function trimSamples(nowSecs = Math.floor(Date.now() / 1000)): number {
  if (!existsSync(HISTORY_FILE)) return 0;
  const kept = parseSamples(readFileSync(HISTORY_FILE, 'utf8')).filter((s) => s.t >= nowSecs - KEEP_SECS);
  const tmp = `${HISTORY_FILE}.tmp`;
  writeFileSync(tmp, kept.map((s) => `${JSON.stringify(s)}\n`).join(''));
  renameSync(tmp, HISTORY_FILE);
  return kept.length;
}

let cache: { mtime: number; size: number; samples: Sample[] } | null = null;
/** Every sample in the file (cached until the file changes). Throws ENOENT when the crank has never recorded one. */
export function readSamples(): Sample[] {
  const st = statSync(HISTORY_FILE);
  if (cache && cache.mtime === st.mtimeMs && cache.size === st.size) return cache.samples;
  const samples = parseSamples(readFileSync(HISTORY_FILE, 'utf8'));
  cache = { mtime: st.mtimeMs, size: st.size, samples };
  return samples;
}

/** At most `max` real samples, evenly spaced, always keeping the first and the last. */
export function downsample<T>(xs: T[], max = 300): T[] {
  if (xs.length <= max) return xs;
  const step = (xs.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => xs[Math.round(i * step)]);
}
