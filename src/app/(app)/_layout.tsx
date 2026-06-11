import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth-context';

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'bree flowies', headerLargeTitle: true }} />
      <Stack.Screen name="group/[id]" options={{ title: '' }} />
      <Stack.Screen
        name="camera/[eventId]"
        options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen name="album/[eventId]" options={{ title: '' }} />
    </Stack>
  );
}
