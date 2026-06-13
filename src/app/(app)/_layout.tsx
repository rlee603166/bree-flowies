import { Redirect, Stack } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        headerTintColor: Colors.text,
        headerTitleStyle: { fontFamily: Fonts.sansBold, color: Colors.text },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: '',
          // Instagram-style left-aligned wordmark; the header's right-side
          // action icons (+, settings) are set per-screen in index.tsx.
          headerLeft: () => (
            <ThemedText style={{ fontFamily: Fonts.sansBold, fontSize: 22, letterSpacing: -0.5 }}>
              bree flowies
            </ThemedText>
          ),
        }}
      />
      <Stack.Screen name="settings" options={{ title: 'settings' }} />
      <Stack.Screen name="group/[id]" options={{ title: '' }} />
      <Stack.Screen name="join/[code]" options={{ title: '' }} />
      <Stack.Screen
        name="camera/[eventId]"
        options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen
        name="scan"
        options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen name="album/[eventId]" options={{ title: '' }} />
    </Stack>
  );
}
