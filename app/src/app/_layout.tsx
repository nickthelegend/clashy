import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Archivo_800ExtraBold_Italic, Archivo_900Black_Italic } from '@expo-google-fonts/archivo';
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

// Web: text fields draw their own focused look (the field surface), so drop the browser's blue focus ring on them;
// buttons and links keep a visible ring for keyboard users. Also stop the rubber-band overscroll and tap flash.
if (typeof document !== 'undefined' && !document.getElementById('clashy-web-css')) {
  const el = document.createElement('style');
  el.id = 'clashy-web-css';
  el.textContent = 'input,textarea{outline:none!important;caret-color:#5B6CFF}'
    + '[role=button]:focus-visible,a:focus-visible{outline:2px solid #AEB6FF;outline-offset:2px}'
    + 'html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent;background:#000}'
    + 'input::placeholder,textarea::placeholder{color:#5A5A64}';
  document.head.appendChild(el);
}

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.ink, border: C.line, primary: C.brand } };
const ONBOARDED_KEY = 'clashy:onboarded';

export default function Root() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Archivo_800ExtraBold_Italic, Archivo_900Black_Italic });
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
          <Stack.Screen name="u/[id]" />
          <Stack.Screen name="stash" />
          <Stack.Screen name="cup" />
          <Stack.Screen name="inbox" />
          <Stack.Screen name="clan-chat" />
          <Stack.Screen name="squads/discover" />
          <Stack.Screen name="onchain" options={{ gestureEnabled: false }} />
          <Stack.Screen name="clash" options={{ gestureEnabled: false }} />
          <Stack.Screen name="onchain-clan" />
          <Stack.Screen name="onchain-royale" options={{ gestureEnabled: false }} />
        </Stack>
      </ThemeProvider>
      </ClashyWallet>
    </GestureHandlerRootView>
  );
}
