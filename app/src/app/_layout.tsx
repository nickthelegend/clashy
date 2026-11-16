import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClashyWallet } from '@/chain/wallet';
import { C } from '@/ui/tokens';

SplashScreen.preventAutoHideAsync();

// Web: haptics map to navigator.vibrate, which the browser blocks (and logs as an error) until the person has tapped
// the page. Games fire haptics on their own events (a round resolving, the VS intro), so only vibrate after a tap.
if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
  const vibrate = navigator.vibrate.bind(navigator);
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  navigator.vibrate = ((pattern: VibratePattern) => (activation && !activation.hasBeenActive ? false : vibrate(pattern))) as Navigator['vibrate'];
}

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.ink, border: C.line, primary: C.brand } };
const ONBOARDED_KEY = 'clashy:onboarded';

export default function Root() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [checked, setChecked] = useState(false);
  const [firstOpen, setFirstOpen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((v) => setFirstOpen(!v)).catch(() => setFirstOpen(false)).finally(() => setChecked(true));
  }, []);
  useEffect(() => { if (loaded && checked) SplashScreen.hideAsync(); }, [loaded, checked]);
  useEffect(() => { if (loaded && checked && firstOpen) router.replace('/welcome'); }, [loaded, checked, firstOpen]);
  if (!loaded || !checked) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <ClashyWallet>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="leaderboard" />
          <Stack.Screen name="ranked" />
          <Stack.Screen name="onchain" options={{ gestureEnabled: false }} />
          <Stack.Screen name="onchain-clan" />
          <Stack.Screen name="onchain-royale" options={{ gestureEnabled: false }} />
          <Stack.Screen name="game/line" options={{ gestureEnabled: false }} />
          <Stack.Screen name="game/royale" options={{ gestureEnabled: false }} />
          <Stack.Screen name="game/streak" options={{ gestureEnabled: false }} />
          <Stack.Screen name="game/snipe" options={{ gestureEnabled: false }} />
          <Stack.Screen name="game/skirmish" options={{ gestureEnabled: false }} />
          <Stack.Screen name="clan/chest" />
          <Stack.Screen name="game/diamond" options={{ gestureEnabled: false }} />
          <Stack.Screen name="game/cup" />
          <Stack.Screen name="game/bounty" />
          <Stack.Screen name="duel/amount" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="duel/match" options={{ gestureEnabled: false }} />
          <Stack.Screen name="duel/live" options={{ gestureEnabled: false }} />
          <Stack.Screen name="duel/result" options={{ gestureEnabled: false, animation: 'fade' }} />
        </Stack>
      </ThemeProvider>
      </ClashyWallet>
    </GestureHandlerRootView>
  );
}
