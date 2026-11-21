// Every engine, by id (docs/GAMES.md has the contract).
import type { ComponentType } from 'react';
import type { GameApi } from '../kit';
import type { EngineId } from '../types';
import addonce from './addonce';
import bingo from './bingo';
import bracket from './bracket';
import capguess from './capguess';
import cashout from './cashout';
import compare from './compare';
import draft from './draft';
import elim from './elim';
import flip from './flip';
import guess from './guess';
import ko from './ko';
import leader from './leader';
import podium from './podium';
import race from './race';
import range from './range';
import royale from './royale';
import snipe from './snipe';
import streak from './streak';
import survive from './survive';
import touch from './touch';
import updown from './updown';
import candle from './candle';
import mines from './mines';
import path from './path';
import picks from './picks';
import rewind from './rewind';
import roulette from './roulette';
import sync from './sync';
import tapgrid from './tapgrid';
import timer from './timer';
import tower from './tower';
import whochart from './whochart';

type Engine = ComponentType<{ g: GameApi }>;
export const ENGINES: Record<EngineId, Engine> = {
  updown, race, range, touch, cashout, survive, guess, streak,
  podium, draft, snipe, compare, capguess, ko, royale,
  flip, addonce, bingo, bracket, elim, leader,
  tapgrid, picks, tower, mines, roulette, rewind, whochart, candle, path, sync, timer,
};
