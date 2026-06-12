import { Link, Redirect, Stack } from 'expo-router';
import { Pressable } from 'react-native';

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
          title: 'bree flowies',
          headerLargeTitle: true,
          headerLargeTitleStyle: { fontFamily: Fonts.sansBold, color: Colors.text },
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable hitSlop={8}>
                <ThemedText type="label" themeColor="textSecondary">
                  settings
                </ThemedText>
              </Pressable>
            </Link>
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
