import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { joinGroup } from '@/lib/api';

/** Landing point for invite links (breeflowies://join/<code>) and the scanner. */
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !code) return;
    ran.current = true;
    joinGroup(code)
      .then((groupId) => router.replace({ pathname: '/group/[id]', params: { id: groupId } }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not join the group'));
  }, [code, router]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: '' }} />
      {error ? (
        <View style={styles.center}>
          <ThemedText style={styles.emoji}>🎞️</ThemedText>
          <ThemedText type="subtitle" style={styles.text}>
            couldn&apos;t join
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary" style={styles.text}>
            {error}
          </ThemedText>
          <AppButton title="back to groups" onPress={() => router.replace('/')} />
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={theme.textSecondary} />
          <ThemedText type="label" themeColor="textSecondary">
            joining…
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  emoji: {
    fontSize: 48,
    lineHeight: 56,
  },
  text: {
    textAlign: 'center',
  },
});
