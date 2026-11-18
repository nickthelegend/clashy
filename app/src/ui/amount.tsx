// The amount drawer: one big number, presets, a number pad and one primary button, like the best trading apps; then
// a success screen with a check. Used for saving, taking out, buying stocks and clash stakes.
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { ZoomIn, FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Sheet } from './sheet';
import { errText } from '@/chain/useChain';
import { Keypad, editAmount, type Key } from './keypad';
import { ErrorLine, Money, Txt } from './kit';
import { C, FONT } from './tokens';

export type AmountProps = {
  open: boolean; onClose: () => void; title: string; sub?: string; art?: ReactNode; presets?: number[]; max?: number; min?: number;
  confirm: (amount: number) => string; onConfirm: (amount: number) => Promise<unknown>; /** What happened, shown over the amount: "Saved to your Stash". */
  success: string; successSub?: string;
};

export function AmountSheet({ open, onClose, title, sub, art, presets = [5, 10, 25, 50], max, min = 0.01, confirm, onConfirm, success, successSub }: AmountProps) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState<number | null>(null);
  useEffect(() => { if (open) { setV(''); setErr(undefined); setDone(null); } }, [open]);
  const n = Number(v || '0');
  const tap = (k: Key) => { setErr(undefined); setV((x) => editAmount(x, k, 2, 1_000_000)); };
  const go = async () => {
    if (!(n >= min)) { setErr(`At least $${min}`); return; }
    if (max !== undefined && n > max + 1e-9) { setErr(`You have $${max.toFixed(2)}`); return; }
    setBusy(true); setErr(undefined);
    try { await onConfirm(n); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setDone(n); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const [whole, cents] = (v || '0').split('.');
  return (
    <Sheet open={open} onClose={onClose} title={done === null ? title : undefined}>
      {done !== null ? (
        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
          <Animated.View entering={ZoomIn.springify().damping(14)} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none"><Path d="M5 12.5 10 17.5 19 7" stroke={C.onBrand} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(150)} style={{ marginTop: 16, alignItems: 'center' }}>
            <Txt v="h2" style={{ textAlign: 'center' }}>{success}</Txt>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(220)} style={{ marginTop: 4 }}>
            <Money value={done} size={40} />
          </Animated.View>
          {successSub ? <Txt v="small" style={{ marginTop: 6, textAlign: 'center' }}>{successSub}</Txt> : null}
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" style={({ pressed }) => ({ alignSelf: 'stretch', marginTop: 24, height: 52, borderRadius: 26, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Text style={{ ...FONT.semi, fontSize: 15.5, color: C.onBrand }}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {art ? <View style={{ alignItems: 'center', marginBottom: 6 }}>{art}</View> : null}
          {sub ? <Txt v="small" style={{ textAlign: 'center' }}>{sub}</Txt> : null}
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...FONT.semi, fontSize: 40, color: v ? C.ink : C.dim, letterSpacing: -1.4, textAlign: 'center', marginTop: 8, fontVariant: ['tabular-nums'] }}>
            ${whole}<Text style={{ color: C.dim }}>{v.includes('.') ? `.${cents ?? ''}` : ''}</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {presets.map((p) => (
              <Pressable key={p} onPress={() => { Haptics.selectionAsync(); setV(String(p)); setErr(undefined); }} style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 20, backgroundColor: Number(v) === p ? C.ink : C.s2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <Txt v="label" color={Number(v) === p ? '#000' : C.ink}>${p}</Txt>
              </Pressable>
            ))}
            {max !== undefined ? (
              <Pressable onPress={() => { setV(String(Math.floor(max * 100) / 100)); setErr(undefined); }} style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="label">Max</Txt>
              </Pressable>
            ) : null}
          </View>
          <View style={{ marginTop: 14 }}>
            <Keypad onKey={tap} onClear={() => setV('')} onEnter={() => { if (v && !busy) go(); }} active={open && done === null} />
          </View>
          {err ? <ErrorLine msg={err} /> : null}
          <Pressable onPress={go} disabled={busy || !v} accessibilityRole="button" style={({ pressed }) => ({ marginTop: 14, height: 52, borderRadius: 26, backgroundColor: v ? C.brand : C.s2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Text numberOfLines={1} style={{ ...FONT.semi, fontSize: 15.5, color: v ? C.onBrand : C.muted }}>{busy ? 'Confirming…' : v ? confirm(n) : 'Enter an amount'}</Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}
