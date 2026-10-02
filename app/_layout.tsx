import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import { EpicProvider } from '@/contexts/EpicContext';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
      <Stack.Screen
        name="add-child"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.65],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="add-category"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.45],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="add-behavior"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.55],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="child/[id]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="weekly-summary/[id]"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <AuthProvider>
              <DataProvider>
                <EpicProvider>
                  <RootLayoutNav />
                </EpicProvider>
              </DataProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
