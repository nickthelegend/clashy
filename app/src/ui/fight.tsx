// The fight stage over a live clash: your clay mascot (left) against the rival, played by LASER (right). It only
// acts out the real scores it is given: when the lead swings your way the mascot lands a punch and LASER takes the hit,
// when it swings the other way LASER fires his laser eyes and the mascot takes it. At the bell (or a knockout) the
// leader celebrates and the other one loses, or is knocked out if the chain liquidated them. Between blows LASER panics
// while you lead and taunts while he leads; liquidated, he melts; beaten, he rages.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Sprite, type SpriteName } from '@/ui/sprite';

type Pose = 'idle' | 'attack' | 'hit' | 'ko' | 'win' | 'lose';
const BO: Record<Pose, SpriteName> = { idle: 'bo-idle', attack: 'bo-punch', hit: 'bo-hit', ko: 'bo-ko', win: 'bo-win', lose: 'bo-lose' };
const LASER: Record<Pose, SpriteName> = { idle: 'laser-idle', attack: 'laser-attack', hit: 'laser-hit', ko: 'laser-melt', win: 'laser-win', lose: 'laser-rage' };
/** A lead change smaller than this (in percentage points of P&L) is noise, not a blow. */
const SWING = 0.004;
/** At most one exchange of blows this often. */
const GAP_MS = 1600;

export function FightStage({ myPnl, theirPnl, over, myKo = false, theirKo = false, size = 104 }: {
  myPnl: number; theirPnl: number;
  /** The clash has ended (bell or knockout). */
  over: boolean;
  myKo?: boolean; theirKo?: boolean; size?: number;
}) {
  const [poses, setPoses] = useState<{ me: Pose; them: Pose; n: number }>({ me: 'idle', them: 'idle', n: 0 });
  const last = useRef({ lead: myPnl - theirPnl, at: 0 });

  useEffect(() => {
    if (over) return;
    const lead = myPnl - theirPnl;
    const now = Date.now();
    const swing = lead - last.current.lead;
    if (Math.abs(swing) < SWING || now - last.current.at < GAP_MS) return;
    last.current = { lead, at: now };
    setPoses((p) => (swing > 0 ? { me: 'attack', them: 'hit', n: p.n + 1 } : { me: 'hit', them: 'attack', n: p.n + 1 }));
  }, [myPnl, theirPnl, over]);

  useEffect(() => {
    if (!over) return;
    const lead = myPnl - theirPnl;
    if (myKo && !theirKo) setPoses((p) => ({ me: 'ko', them: 'win', n: p.n + 1 }));
    else if (theirKo && !myKo) setPoses((p) => ({ me: 'win', them: 'ko', n: p.n + 1 }));
    else if (lead > 0) setPoses((p) => ({ me: 'win', them: 'lose', n: p.n + 1 }));
    else if (lead < 0) setPoses((p) => ({ me: 'lose', them: 'win', n: p.n + 1 }));
    else setPoses((p) => ({ me: 'idle', them: 'idle', n: p.n + 1 }));
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  // between blows LASER panics while you lead and taunts while he leads
  const lead = myPnl - theirPnl;
  const laser: SpriteName = poses.them === 'idle' && !over ? (lead > SWING ? 'laser-panic' : lead < -SWING ? 'laser-taunt' : 'laser-idle') : LASER[poses.them];
  // a blow plays once, then both go back to their stance
  const settle = () => { if (!over) setPoses((p) => (p.me === 'idle' && p.them === 'idle' ? p : { me: 'idle', them: 'idle', n: p.n })); };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: size, marginBottom: 6 }}>
      <Sprite key={`me-${poses.n}-${poses.me}`} name={BO[poses.me]} size={size} onDone={poses.me === 'attack' || poses.me === 'hit' ? settle : undefined} />
      <Sprite key={`them-${poses.n}-${laser}`} name={laser} size={size} />
    </View>
  );
}
