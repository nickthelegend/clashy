// Live taunts during a clash, Clash Royale style: a row of quick stickers under the live board plus the full sticker
// keyboard behind "+". A taunt is a real sticker message to your rival (the social server's DM thread), so it lands on
// their screen within a couple of seconds: yours float up on your side, theirs on theirs. They stay in your DMs after.
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import type { PublicKey } from '@solana/web3.js';
import { social, useSocial, type Dm } from '@/chain/social-api';
import { useChain } from '@/chain/useChain';
import { PACKS, rememberSticker, stickerBody, stickerById, stickerOf, useStickerMemory, type Sticker } from '@/stickers';
import { Plus } from './icons';
import { Txt } from './kit';
import { Sheet } from './sheet';
import { C, FONT } from './tokens';

const QUICK = ['clashy/06', 'clashy/07', 'clashy/05', 'clashy/11', 'perps/03', 'clashy/10'];

export function Taunts({ rival, since, rivalName }: { rival: PublicKey | null; since: number; rivalName: string }) {
  const chain = useChain();
  const me = chain.me?.toBase58();
  const id = rival?.toBase58();
  const thread = useSocial<{ messages: Dm[] }>(me && id ? `/v1/dm/${id}` : null, 2000);
  const mem = useStickerMemory();
  const [float, setFloat] = useState<{ k: number; s: Sticker; mine: boolean; x: number }[]>([]);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string>();
  const shown = useRef(new Set<number>());
  const last = useRef(0);
  const k = useRef(0);

  const spawn = (s: Sticker, mine: boolean) => {
    const n = ++k.current;
    setFloat((f) => [...f.slice(-6), { k: n, s, mine, x: Math.random() * 50 - 25 }]);
    setTimeout(() => setFloat((f) => f.filter((x) => x.k !== n)), 2200);
  };
  // their taunts (and yours from another device) since the bell
  useEffect(() => {
    for (const m of thread.data?.messages ?? []) {
      if (shown.current.has(m.id) || m.at < since * 1000) continue;
      shown.current.add(m.id);
      const s = stickerOf(m.body);
      if (s) { spawn(s, m.sender === me); if (m.sender !== me) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    }
  }, [thread.data, since, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const taunt = async (s: Sticker) => {
    if (!id || !chain.wallet.signer) { setErr('Sign in to taunt.'); return; }
    if (Date.now() - last.current < 1200) return;
    last.current = Date.now(); setErr(undefined); setMore(false);
    rememberSticker(s.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    spawn(s, true);
    try {
      const m = await social<Dm>(chain.wallet.signer, `/v1/dm/${id}`, { method: 'POST', body: { body: stickerBody(s) } });
      shown.current.add(m.id);
    } catch (e) { setErr(`Taunt not sent: ${(e as Error).message}`); }
  };
  const quick = [...mem.recent.filter((s) => s.pack === 'clashy' || s.pack === 'perps').slice(0, 2), ...QUICK.map((q) => stickerById(q)).filter((s): s is Sticker => !!s)]
    .filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i).slice(0, 5);

  if (!id) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 40, height: 1, zIndex: 30 }}>
        {float.map((f) => <Floater key={f.k} s={f.s} mine={f.mine} x={f.x} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0E0E13', borderRadius: 22, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, gap: 4 }}>
        <Txt v="small" color={C.muted} style={{ ...FONT.semi, fontSize: 12, marginRight: 2 }}>Taunt</Txt>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
          {quick.map((s) => (
            <Pressable key={s.id} onPress={() => taunt(s)} accessibilityRole="button" accessibilityLabel={`Taunt ${rivalName}: ${s.word}`}
              style={({ pressed }) => ({ width: 50, height: 50, transform: [{ scale: pressed ? 0.82 : 1 }] })}>
              <Image source={s.src} style={{ flex: 1 }} contentFit="contain" />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setMore(true)} accessibilityRole="button" accessibilityLabel="All stickers"
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? '#2A2933' : '#1C1B24', alignItems: 'center', justifyContent: 'center' })}>
          <Plus size={18} color={C.ink} />
        </Pressable>
      </View>
      {err ? <Txt v="small" color={C.down} style={{ marginTop: 6, textAlign: 'center' }}>{err}</Txt> : (
        <Txt v="small" style={{ marginTop: 6, textAlign: 'center', fontSize: 11.5 }}>Taunts go to {rivalName} live and stay in your DMs.</Txt>
      )}
      <Sheet open={more} onClose={() => setMore(false)} title="Taunt" sub={`Pick any sticker. ${rivalName} sees it fly in.`}>
        <TauntPicker onPick={taunt} />
      </Sheet>
    </View>
  );
}

/** A taunt rising from its owner's side of the board with a little wobble. */
function Floater({ s, mine, x }: { s: Sticker; mine: boolean; x: number }) {
  const y = useSharedValue(0), o = useSharedValue(1), sc = useSharedValue(0.3), r = useSharedValue(mine ? -18 : 18);
  useEffect(() => {
    sc.value = withSpring(1, { damping: 7, stiffness: 180 });
    r.value = withSpring(0, { damping: 6, stiffness: 120 });
    y.value = withTiming(-260, { duration: 2000, easing: Easing.out(Easing.cubic) });
    o.value = withDelay(1300, withTiming(0, { duration: 700 }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateX: x }, { translateY: y.value }, { scale: sc.value }, { rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={[{ position: 'absolute', bottom: 0, [mine ? 'left' : 'right']: '6%' }, st]}>
      <Image source={s.src} style={{ width: 128, height: 128 }} contentFit="contain" />
    </Animated.View>
  );
}

/** Every pack, one at a time: a row of pack covers, then that pack's stickers (a plain grid, so it can live in a sheet). */
function TauntPicker({ onPick }: { onPick: (s: Sticker) => void }) {
  const [pack, setPack] = useState(PACKS[0]?.id ?? '');
  const { width } = useWindowDimensions();
  const cell = Math.floor((Math.min(width, 560) - 36) / 4);
  const p = PACKS.find((x) => x.id === pack) ?? PACKS[0];
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
        {PACKS.map((x) => (
          <Pressable key={x.id} onPress={() => { setPack(x.id); Haptics.selectionAsync(); }} accessibilityRole="tab" accessibilityState={{ selected: x.id === pack }} accessibilityLabel={`${x.name} pack`}
            style={{ width: 48, height: 48, borderRadius: 14, padding: 4, backgroundColor: x.id === pack ? '#2A2836' : '#1A1922' }}>
            <Image source={x.cover} style={{ flex: 1 }} contentFit="contain" />
          </Pressable>
        ))}
      </ScrollView>
      <Txt v="small" color={C.muted} style={{ ...FONT.semi, fontSize: 12, marginBottom: 2 }}>{p?.name}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {p?.stickers.map((s) => (
          <Pressable key={s.id} onPress={() => onPick(s)} accessibilityRole="button" accessibilityLabel={`Taunt: ${s.word}`}
            style={({ pressed }) => ({ width: cell, height: cell, padding: 4, transform: [{ scale: pressed ? 0.86 : 1 }] })}>
            <Image source={s.src} style={{ flex: 1 }} contentFit="contain" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
