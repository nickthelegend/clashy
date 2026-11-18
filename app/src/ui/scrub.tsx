// A crosshair for any chart, laid over it without touching how the chart looks. Hover or drag on the web, drag a
// finger on a phone: a thin line snaps to the nearest point, a dot marks it and a small card shows its value and
// time. Lifting the finger or leaving the chart hides it. Vertical page scrolling still works over the chart.
// (No import from kit.tsx: kit's own charts use this.)
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Platform, Text, View, type GestureResponderEvent } from 'react-native';
import { C, FONT } from './tokens';

export type ScrubLabel = { value: string; sub?: string; color?: string };

/** A price with sensible digits: 64,384.48 · 73.25 · 0.0006073. */
export const fmtNum = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (a >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: a >= 100 ? 2 : 4 });
  return a === 0 ? '0' : v.toPrecision(4);
};
/** "Nov 19, 2:05 PM" from ms. */
export const fmtWhen = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Scrub({ w, h, n, xAt, yAt, label, color = C.ink }: {
  w: number; h: number; n: number; xAt: (i: number) => number; yAt: (i: number) => number; label: (i: number) => ScrubLabel; color?: string;
}) {
  const [i, setI] = useState<number | null>(null);
  const cur = useRef<number | null>(null);
  const web = Platform.OS === 'web';
  const pick = (x: number) => {
    if (n < 1 || !Number.isFinite(x)) return;
    let best = 0, bd = Infinity;
    for (let k = 0; k < n; k++) { const d = Math.abs(xAt(k) - x); if (d < bd) { bd = d; best = k; } }
    if (best === cur.current) return;
    cur.current = best;
    setI(best);
    if (!web) Haptics.selectionAsync().catch(() => {});
  };
  const clear = () => { cur.current = null; setI(null); };
  const handlers = web
    ? {
      onPointerMove: (e: { nativeEvent: { offsetX: number } }) => pick(e.nativeEvent.offsetX),
      onPointerDown: (e: { nativeEvent: { offsetX: number } }) => pick(e.nativeEvent.offsetX),
      onPointerLeave: clear,
      onPointerCancel: clear,
    }
    : {
      onStartShouldSetResponder: () => true,
      onResponderGrant: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
      onResponderMove: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
      onResponderRelease: clear,
      onResponderTerminate: clear,
      onResponderTerminationRequest: () => true,
    };
  const lab = i === null || i >= n ? null : label(i);
  const x = lab ? xAt(i!) : 0, y = lab ? yAt(i!) : 0;
  const boxW = 136;
  const bx = Math.max(0, Math.min(w - boxW, x - boxW / 2));
  return (
    <View accessibilityLabel="Chart: hover or drag to read values" style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h }, (web ? { touchAction: 'pan-y', cursor: 'crosshair' } : null) as object]} {...(handlers as object)}>
      {lab ? (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', left: x - 0.5, top: 0, width: 1, height: h, backgroundColor: 'rgba(247,247,248,0.32)' }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: x - 6, top: y - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: lab.color ?? color, borderWidth: 2, borderColor: '#000' }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: bx, top: y > h * 0.45 ? 2 : h - 50, width: boxW, backgroundColor: 'rgba(18,18,24,0.95)', borderRadius: 11, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: '#2A2A34' }}>
            <Text numberOfLines={1} style={{ ...FONT.bold, fontSize: 13, color: lab.color ?? C.ink, fontVariant: ['tabular-nums'] }}>{lab.value}</Text>
            {lab.sub ? <Text numberOfLines={2} style={{ ...FONT.medium, fontSize: 10.5, lineHeight: 14, color: C.muted, marginTop: 1 }}>{lab.sub}</Text> : null}
          </View>
        </>
      ) : null}
    </View>
  );
}
