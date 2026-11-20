// Clashy's game kit (Nov 21): everything a game is built from, in one import.
//
//   import { Panel, Choice, Go, PxChart, useRolled, bellPrice, pTouch, payoutFor, type GameApi } from '../kit';
//
// - tokens   GT (colours), GS (shapes and sizes), TINTS (game colours)
// - api      GameApi (what the game screen hands an engine), Line, Phase
// - format   usd, fmtPx, fmtSecs, lengthOf, mv, absPct, fmtCompactUsd, fmtMetric…
// - settings pNum, pBool, pStr, pNums (reading def.p with defaults)
// - round    useClock, bellPrice, bellPrices, roundPath, readEntries, captureAt, pathOf, QUIET_MS
// - markets  poolList, useRoll, useRolled, rollable, rollMarkets, useMemes, long/short sides
// - candles  useGameCandles, past windows of real 1 m / 5 m candles
// - ui       Logo, MarketHead, MarketChart, MarketTile, RolledPanel, Clock, Panel, Choice, Go, Pill, BotSays, Note,
//            StakeRow, Waiting, Tag, BigNumber, StatTile, StatLine, Sides, CountUp, Heart, PotBar
// - chart    PxChart (levels, band, dots), CandleChart
// - screen   HotCard, GameCard, GameChip, Badge, InfoChip, BalancePill, CategoryChips, GameHero, MarketClosedBanner,
//            WarnBanner, RulesSheet, ResultCard
// - odds and feed are re-exported too, so a new engine needs only this one import.
//
// docs/GAME-KIT.md shows every piece; /games/kit draws them live.
export * from './api';
export * from './candles';
export * from './chart';
export * from './format';
export * from './markets';
export * from './round';
export * from './screen';
export * from './settings';
export * from './tokens';
export * from './ui';
export * from '../odds';
export * from '../feed';
export { ART } from '@/ui/kit';
