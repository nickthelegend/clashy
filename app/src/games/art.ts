// Each engine's clay art (Nov 20): the game cards and the game screen show it. Games of one engine share a picture and
// differ by name, colour and markets. The game-*.webp icons were made for the games as one ChatGPT sheet in the soft
// clay style (assets/game-icons-sheet.png); the rest are the existing art kit.
import { ART } from '@/ui/kit';

const icon = {
  updown: require('../../assets/art/game-updown.webp'), race: require('../../assets/art/game-race.webp'), range: require('../../assets/art/game-range.webp'),
  cashout: require('../../assets/art/game-cashout.webp'), snipe: require('../../assets/art/game-snipe.webp'), compare: require('../../assets/art/game-compare.webp'),
  capguess: require('../../assets/art/game-capguess.webp'), draft: require('../../assets/art/game-draft.webp'), flip: require('../../assets/art/game-flip.webp'),
  addonce: require('../../assets/art/game-addonce.webp'), bingo: require('../../assets/art/game-bingo.webp'), guess: require('../../assets/art/game-guess.webp'),
} as const;
import type { EngineId } from './types';

export const ENGINE_ART: Record<EngineId, number> = {
  updown: icon.updown,
  race: icon.race,
  range: icon.range,
  touch: ART.goal,
  cashout: icon.cashout,
  survive: ART.limits,
  guess: icon.guess,
  streak: ART.streak,
  podium: ART.podium,
  draft: icon.draft,
  snipe: icon.snipe,
  compare: icon.compare,
  capguess: icon.capguess,
  ko: ART.ko,
  royale: ART.tileRoyale,
  flip: icon.flip,
  addonce: icon.addonce,
  bingo: icon.bingo,
  bracket: ART.tileCup,
  elim: ART.koSkull,
  leader: ART.crown,
};
