// The guided tour's state (Nov 20). One tour plays at a time: the first-run tour of Home and every tab ("main"), or a
// short first-visit tour of an inner screen (Clash, the Cup, a DM…). Screens wrap what a tour points at in
// <TourTarget id>, which registers the view here; the overlay measures it in window coordinates when its step opens,
// so it always lights the thing where it is now. Finishing or skipping a tour remembers it on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type TourRect = { x: number; y: number; width: number; height: number };
/** A screen's scroll view, so a step can bring its thing into view before lighting it. */
export type Scroller = { by: (dy: number) => void };

type State = { tour: string | null; step: number };
let state: State = { tour: null, step: 0 };
const subs = new Set<() => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const useTourState = () => useSyncExternalStore(subscribe, () => state, () => state);
export const tourState = () => state;
export const startTour = (id: string) => set({ tour: id, step: 0 });
export const gotoStep = (step: number) => set({ step });
export const endTour = () => set({ tour: null, step: 0 });

const KEY = (id: string) => `clashy:tour:${id}`;
export async function isSeen(id: string) {
  try { return (await AsyncStorage.getItem(KEY(id))) === '1'; } catch { return false; }
}
export async function markSeen(id: string) {
  try { await AsyncStorage.setItem(KEY(id), '1'); } catch { /* storage unavailable: the tour shows again next time */ }
}
/** Settings → "Show screen tips again": forget every tour this device has seen. */
export async function forgetTours() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('clashy:tour:'));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* nothing to forget */ }
}

/** Anything laid out on screen that can say where it is (a View's ref). */
type Measurable = { measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void };
type Entry = { ref: { current: Measurable | null }; scroller: Scroller | null };
const targets = new Map<string, Entry[]>();

/** Registers a target; returns its unregister. Several mounts of one id keep the newest first. */
export function registerTarget(id: string, entry: Entry): () => void {
  targets.set(id, [entry, ...(targets.get(id) ?? []).filter((e) => e.ref !== entry.ref)]);
  return () => {
    const left = (targets.get(id) ?? []).filter((e) => e.ref !== entry.ref);
    if (left.length) targets.set(id, left); else targets.delete(id);
  };
}

const measureOne = (e: Entry) => new Promise<TourRect | null>((resolve) => {
  const v = e.ref.current;
  if (!v?.measureInWindow) { resolve(null); return; }
  v.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
});

/** Whether any screen has mounted this target (a thing that isn't mounted at all won't show up, so don't wait on it). */
export const hasTarget = (id: string) => (targets.get(id)?.length ?? 0) > 0;

/** Where the target is on screen now (the first of its mounts that is laid out), and the scroll view it sits in. */
export async function measureTarget(id: string): Promise<{ rect: TourRect; scroller: Scroller | null } | null> {
  for (const e of targets.get(id) ?? []) {
    const rect = await measureOne(e);
    if (rect) return { rect, scroller: e.scroller };
  }
  return null;
}
