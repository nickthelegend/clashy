// The amount drawer: a huge number, presets, a number pad and one big button, like the best trading apps; then a
// success screen with a big green check. Used for saving, taking out, buying stocks and clash stakes.
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { ZoomIn, FadeIn } from 'react-native-reanimated';
import { Sheet } from './sheet';
import { errText } from '@/chain/useChain';
import { Keypad, editAmount, type Key } from './keypad';
import { ErrorLine, Txt } from './kit';
import { C, F } from './tokens';

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
          <Animated.View entering={ZoomIn.springify().damping(10)} style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.up, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.bold, fontSize: 38, letterSpacing: -1.2, color: '#04120A', marginTop: -2 }}>✓</Text>
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(150)} style={{ fontFamily: F.semi, fontSize: 22, color: C.ink, marginTop: 18 }}>{success}</Animated.Text>
          <Animated.Text entering={FadeIn.delay(220)} style={{ fontFamily: F.semi, fontSize: 52, color: C.ink, letterSpacing: -2, marginTop: 2 }}>${done.toFixed(2)}</Animated.Text>
          {successSub ? <Txt v="small" style={{ marginTop: 6, textAlign: 'center' }}>{successSub}</Txt> : null}
          <Pressable onPress={onClose} style={({ pressed }) => ({ alignSelf: 'stretch', marginTop: 26, height: 58, borderRadius: 29, backgroundColor: C.up, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Text style={{ fontFamily: F.bold, fontSize: 17, color: '#04120A' }}>Done ✓</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {art ? <View style={{ alignItems: 'center', marginBottom: 2 }}>{art}</View> : null}
          {sub ? <Txt v="small" style={{ textAlign: 'center' }}>{sub}</Txt> : null}
          <Text style={{ fontFamily: F.semi, fontSize: 64, color: v ? C.ink : C.dim, letterSpacing: -3, textAlign: 'center', marginTop: 6 }}>
            ${whole}<Text style={{ color: C.dim }}>{v.includes('.') ? `.${cents ?? ''}` : ''}</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {presets.map((p) => (
              <Pressable key={p} onPress={() => { Haptics.selectionAsync(); setV(String(p)); setErr(undefined); }} style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 20, backgroundColor: Number(v) === p ? C.ink : '#1F1F26', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                <Txt v="label" color={Number(v) === p ? '#000' : C.ink}>${p}</Txt>
              </Pressable>
            ))}
            {max !== undefined ? (
              <Pressable onPress={() => { setV(String(Math.floor(max * 100) / 100)); setErr(undefined); }} style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: '#1F1F26', alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="label">Max</Txt>
              </Pressable>
            ) : null}
          </View>
          <View style={{ marginTop: 14 }}>
            <Keypad onKey={tap} onClear={() => setV('')} onEnter={() => { if (v && !busy) go(); }} active={open && done === null} />
          </View>
          {err ? <ErrorLine msg={err} /> : null}
          <Pressable onPress={go} disabled={busy || !v} style={({ pressed }) => ({ marginTop: 14, height: 58, borderRadius: 29, backgroundColor: v ? C.ink : '#2A2A31', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Text style={{ fontFamily: F.bold, fontSize: 17, color: v ? '#000' : C.muted }}>{busy ? 'Confirming…' : v ? confirm(n) : 'Enter an amount'}</Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}
