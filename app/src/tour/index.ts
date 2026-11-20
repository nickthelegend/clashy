// The guided tour: first-run tour of Home and every tab, and a short first-visit tour of each inner screen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { forgetTours, isSeen, startTour, tourState } from './store';

export { TourOverlay } from './overlay';
export { TourScroll, TourTarget, useTourScroll } from './target';
export { startTour } from './store';

/**
 * Plays tour `id` once per device, the first time `ready` is true while no other tour is up. The main tour also waits
 * for onboarding (the welcome screens) to be finished.
 */
export function useScreenTour(id: string, ready = true) {
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const t = setTimeout(async () => {
      if (!alive || tourState().tour || (await isSeen(id))) return;
      if (id === 'main') {
        try { if ((await AsyncStorage.getItem('clashy:onboarded')) !== '1') return; } catch { return; }
      }
      if (alive && !tourState().tour) startTour(id);
    }, id === 'main' ? 1100 : 900);
    return () => { alive = false; clearTimeout(t); };
  }, [id, ready]);
}

/** Settings → "Take the tour again": forgets every tour (screen tips show again too) and plays the main one from Home. */
export async function replayTour() {
  await forgetTours();
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/' as Href);
  setTimeout(() => startTour('main'), 450);
}
