// Responsive layout: phone (bottom tabs), desktop (sidebar shell). One codebase for app.clashy.fun and the phone app.
import { Platform, useWindowDimensions, ViewStyle } from 'react-native';

export const BP = { desk: 900, wide: 1240 } as const;

export function useLayout() {
  const { width } = useWindowDimensions();
  const desk = Platform.OS === 'web' && width >= BP.desk;
  return { width, desk, wide: desk && width >= BP.wide };
}

/** Centers a page's content column on desktop; no-op on phones. */
export function useDeskColumn(max = 760): ViewStyle {
  const { desk } = useLayout();
  return desk ? { width: '100%', maxWidth: max, alignSelf: 'center' } : {};
}

/** Remembered UI prefs on web (sidebar collapsed). Storage can be blocked, so every access is guarded. */
export const pref = {
  get(k: string): string | null {
    try { return Platform.OS === 'web' ? globalThis.localStorage?.getItem(`clashy:${k}`) ?? null : null; } catch { return null; }
  },
  set(k: string, v: string) {
    try { if (Platform.OS === 'web') globalThis.localStorage?.setItem(`clashy:${k}`, v); } catch { /* storage unavailable */ }
  },
};
