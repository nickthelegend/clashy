// The Lottie files shared by the web player (lottie.tsx) and the phone player (lottie.native.tsx).
// A file may carry two markers: "loop" (play the intro once, then loop that segment) and "still" (the frame shown,
// not played, under reduced motion).
export const FILES = {
  coin: require('../../assets/lottie/coin-drop.json'),
  heart: require('../../assets/lottie/heart-pop.json'),
  flame: require('../../assets/lottie/flame.json'),
  squadWar: require('../../assets/lottie/squad-war.json'),
  // result moments: 300 px over the 170 px result tile (left -65, top -70)
  win: require('../../assets/lottie/result-win.json'),
  lose: require('../../assets/lottie/result-lose.json'),
  knockout: require('../../assets/lottie/result-liquidated.json'),
  deadHeat: require('../../assets/lottie/result-dead-heat.json'),
};
export type LottieName = keyof typeof FILES;

export type Marker = { tm: number; cm: string; dr: number };
export const marker = (name: LottieName, cm: string): Marker | undefined =>
  ((FILES[name] as { markers?: Marker[] }).markers ?? []).find((m) => m.cm === cm);

