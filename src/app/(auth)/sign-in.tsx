import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Spacing } from '@/constants/theme';
import { useKeyboardShift } from '@/hooks/use-keyboard-shift';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const keyboardShift = useKeyboardShift();

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
        if (data.session) {
          router.replace('/complete-profile');
        } else {
          setMessage('Check your email to confirm your account, then sign in.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // Check if profile is complete; if not, collect first/last name first
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', data.session.user.id)
          .single();
        if (!profile?.first_name) {
          router.replace('/complete-profile');
        }
        // else: auth listener flips the layout to (app) automatically
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
        <Animated.View style={[styles.content, { transform: [{ translateY: keyboardShift }] }]}>
          <View style={styles.hero}>
            <ThemedText type="title" style={styles.logo}>
              bree
            </ThemedText>
            <ThemedText type="title" style={styles.logo}>
              flowies
              <ThemedText type="title" themeColor="accent" style={styles.logo}>
                {' '}
                ●
              </ThemedText>
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary" style={styles.tagline}>
              shoot now. see it in the morning.
            </ThemedText>
          </View>

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
            title={mode === 'sign-in' ? 'sign in' : 'create account'}
            loading={busy}
            disabled={!canSubmit}
            onPress={submit}
          />
          <Pressable
            onPress={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setMessage(null);
            }}
            style={styles.modeSwitch}
            hitSlop={8}
          >
            <ThemedText type="label" themeColor="textSecondary">
              {mode === 'sign-in' ? 'new here? create an account' : 'have an account? sign in'}
            </ThemedText>
          </Pressable>
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
  modeSwitch: {
    alignSelf: 'center',
    padding: Spacing.two,
  },
});
