// The number pad used everywhere an amount is typed (Stash, wallet, stock buys, squad chest, Practice orders): twelve
// real keys on a 3 × 4 grid, each a rounded key that sinks when pressed, a proper decimal point, the backspace icon
// (hold it to clear), haptics on touch-down, and the number keys of a physical keyboard on the web.
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Del } from './icons';
import { C, F } from './tokens';

export type Key = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '0' | 'del';
const ROWS: Key[][] = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'del']];

/** The amount after a key: one decimal point, at most `decimals` places, no leading zeros, never above `cap`. */
export function editAmount(x: string, k: Key, decimals = 2, cap = 100_000_000): string {
  if (k === 'del') return x.slice(0, -1);
  if (k === '.') return decimals === 0 || x.includes('.') ? x : (x || '0') + '.';
  const next = x === '0' ? k : x + k;
  const [, d] = next.split('.');
  if (d && d.length > decimals) return x;
  if (Number(next) > cap) return x;
  return next;
}

type Props = {
  onKey: (k: Key) => void;
  /** Hold backspace (or press Escape on the web) to clear the field. */
  onClear?: () => void;
  /** Enter on a physical keyboard. */
  onEnter?: () => void;
  /** No decimal point: the key is shown disabled. */
  decimals?: boolean;
  /** Shorter keys, for drawers that also hold a summary. */
  compact?: boolean;
  /** Listen to the physical keyboard (web) only while this pad is on screen and in use. */
  active?: boolean;
};

export function Keypad({ onKey, onClear, onEnter, decimals = true, compact, active = true }: Props) {
  const h = compact ? 48 : 56;
  const gap = compact ? 7 : 8;
  // the latest handlers, without re-binding the keyboard listener on every render
  const ref = useRef({ onKey, onClear, onEnter, decimals });
  ref.current = { onKey, onClear, onEnter, decimals };
  useEffect(() => {
    if (Platform.OS !== 'web' || !active || typeof window === 'undefined') return;
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const r = ref.current;
      if (/^[0-9]$/.test(e.key)) r.onKey(e.key as Key);
      else if ((e.key === '.' || e.key === ',') && r.decimals) r.onKey('.');
      else if (e.key === 'Backspace') r.onKey('del');
      else if (e.key === 'Escape' && r.onClear) r.onClear();
      else if (e.key === 'Enter' && r.onEnter) r.onEnter();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [active]);

  return (
    <View style={{ gap }} accessibilityLabel="Number pad">
      {ROWS.map((row) => (
        <View key={row.join('')} style={{ flexDirection: 'row', gap }}>
          {row.map((k) => {
            const off = k === '.' && !decimals;
            return (
              <Pressable key={k} disabled={off}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                onPress={() => onKey(k)}
                onLongPress={k === 'del' && onClear ? () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onClear(); } : undefined}
                delayLongPress={450}
                accessibilityRole="button"
                accessibilityLabel={k === 'del' ? 'Delete, hold to clear' : k === '.' ? 'Decimal point' : k}
                style={({ pressed }) => ({
                  flex: 1, height: h, borderRadius: compact ? 14 : 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: k === 'del' ? (pressed ? '#24242C' : 'transparent') : pressed ? '#2A2A33' : '#1A1A20',
                  opacity: off ? 0.3 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}>
                {k === 'del' ? <Del size={compact ? 24 : 26} color={C.ink} />
                  : k === '.' ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.ink, marginTop: compact ? 10 : 12 }} />
                    : <Text style={{ fontFamily: F.semi, fontSize: compact ? 23 : 26, color: C.ink, fontVariant: ['tabular-nums'] }}>{k}</Text>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
