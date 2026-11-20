// Reading a game's engine settings (`def.p`) with a default, so a typo in the catalog falls back instead of breaking.
import type { GameApi } from './api';

export const pNum = (g: GameApi, k: string, d: number) => { const v = g.def.p?.[k]; return typeof v === 'number' && Number.isFinite(v) ? v : d; };
export const pBool = (g: GameApi, k: string) => g.def.p?.[k] === true;
export function pStr<T extends string>(g: GameApi, k: string, allowed: readonly T[], d: T): T {
  const v = g.def.p?.[k];
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}
export function pNums(g: GameApi, k: string, d: number[]): number[] {
  const v = g.def.p?.[k];
  return Array.isArray(v) && v.length && (v as unknown[]).every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as number[]) : d;
}
