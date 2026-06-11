import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: username.trim().toLowerCase() } },
        });
        if (error) throw error;
        // With email confirmation enabled, no session is returned until the link is clicked
        if (!data.session) setMessage('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // Auth listener flips the layout to (app) automatically
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    email.trim().length > 3 && password.length >= 6 && (mode === 'sign-in' || username.trim().length >= 2);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.content}
        >
          <ThemedText type="title" style={styles.logo}>
            bree flowies
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.tagline}>
            shoot now. see it in the morning.
          </ThemedText>

          {mode === 'sign-up' && (
            <AppTextInput
              placeholder="username"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />
          )}
          <AppTextInput
            placeholder="email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <AppTextInput
            placeholder="password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {message && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
              {message}
            </ThemedText>
          )}

          <AppButton
            title={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            loading={busy}
            disabled={!canSubmit}
            onPress={submit}
          />
          <AppButton
            title={mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
            variant="secondary"
            onPress={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setMessage(null);
            }}
          />
        </KeyboardAvoidingView>
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
  logo: {
    textAlign: 'center',
    fontSize: 40,
    lineHeight: 46,
  },
  tagline: {
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  message: {
    textAlign: 'center',
  },
});
