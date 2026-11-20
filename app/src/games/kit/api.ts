// The round API the game screen hands each engine (Nov 20). See docs/GAMES.md for the contract.
import type { ReactNode } from 'react';
import type { Feed, Info } from '../feed';
import type { GameDef } from '../types';

/** One receipt line: label, value. */
export type Line = [string, string];
export type Phase = 'setup' | 'live' | 'done';
export type GameApi = {
  def: GameDef;
  feed: Feed;
  info: Map<string, Info> | null;
  stake: number;
  balance: number;
  phase: Phase;
  busy: boolean;
  /** Takes the stake and starts the round. False (with the reason shown) when it can't. */
  begin: (endsAt?: number) => Promise<boolean>;
  /** Ends the round: pays stake × mult (0 lost, 1 push, 2 a win against Clashy Bot…) with a verdict and receipt. */
  end: (mult: number, verdict: string, lines: Line[]) => void;
  /** No fair way to settle (the feed went quiet): the stake comes back. */
  abandon: (why: string) => void;
  /** Shows a problem under the game (undefined clears it). */
  fail: (msg?: string) => void;
  /** Bumps on every new round: engines key their round state on it. */
  round: number;
  /** The stake chips, for the engine to place above its start buttons. */
  stakeRow: ReactNode;
  /** The column width (for charts). */
  width: number;
};
