import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth-context';

export default function AuthLayout() {
  const { session, loading, profileComplete } = useAuth();

  if (loading) return null;
  if (session && profileComplete) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
