import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { AvatarPicker } from '@/components/ui/avatar-picker';
import { Spacing } from '@/constants/theme';
import { useKeyboardShift } from '@/hooks/use-keyboard-shift';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function CompleteProfileScreen() {
  const { session, refreshProfile } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const keyboardShift = useKeyboardShift();

  const submit = async () => {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ first_name: firstName.trim(), last_name: lastName.trim(), avatar_url: avatarUrl })
        .eq('id', session.user.id);
      if (error) throw error;
      await refreshProfile();
      router.replace('/');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = firstName.trim().length >= 1 && lastName.trim().length >= 1;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.content, { transform: [{ translateY: keyboardShift }] }]}>
          <View style={styles.hero}>
            <ThemedText type="title" style={styles.logo}>
              almost
            </ThemedText>
            <ThemedText type="title" style={styles.logo}>
              there
              <ThemedText type="title" themeColor="accent" style={styles.logo}>
                {' '}
                ●
              </ThemedText>
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary" style={styles.tagline}>
              one last thing — what&apos;s your name?
            </ThemedText>
          </View>

          {session && (
            <View style={styles.avatarRow}>
              <AvatarPicker
                userId={session.user.id}
                name={firstName.trim() || '?'}
                avatarUrl={avatarUrl}
                onChange={setAvatarUrl}
                size={88}
              />
            </View>
          )}

          <AppTextInput
            placeholder="first name"
            autoCapitalize="words"
            autoCorrect={false}
            value={firstName}
            onChangeText={setFirstName}
          />
          <AppTextInput
            placeholder="last name"
            autoCapitalize="words"
            autoCorrect={false}
            value={lastName}
            onChangeText={setLastName}
          />

          {message && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
              {message}
            </ThemedText>
          )}

          <AppButton
            title="continue"
            loading={busy}
            disabled={!canSubmit}
            onPress={submit}
          />
        </Animated.View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  hero: {
    alignItems: 'flex-start',
    marginBottom: Spacing.five,
    transform: [{ rotate: '-2deg' }],
  },
  logo: {
    fontSize: 56,
    lineHeight: 60,
  },
  tagline: {
    marginTop: Spacing.two,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  message: {
    textAlign: 'center',
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
});
