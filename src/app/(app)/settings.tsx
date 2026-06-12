import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Avatar } from '@/components/ui/avatar';
import { FilmStrip } from '@/components/ui/film-strip';
import { Spacing } from '@/constants/theme';
import { deleteAccount, getProfile, updateProfile, type Profile } from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const userId = useUserId();

  const [saved, setSaved] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getProfile(userId)
      .then((profile) => {
        setSaved(profile);
        setUsername(profile.username);
        setFirstName(profile.first_name ?? '');
        setLastName(profile.last_name ?? '');
      })
      .catch((err) =>
        Alert.alert('Could not load profile', err instanceof Error ? err.message : undefined)
      );
  }, [userId]);

  const dirty =
    !!saved &&
    (username.trim() !== saved.username ||
      firstName.trim() !== (saved.first_name ?? '') ||
      lastName.trim() !== (saved.last_name ?? ''));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile(userId, {
        username: username.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
      });
      setSaved(updated);
    } catch (err) {
      Alert.alert('Could not save profile', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account?',
      'Your profile, group memberships, and every photo you have shot will be permanently deleted. This cannot be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              // the auth user is gone, so only clear the local session
              await supabase.auth.signOut({ scope: 'local' });
            } catch (err) {
              Alert.alert(
                'Could not delete account',
                err instanceof Error ? err.message : undefined
              );
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.avatarRow}>
          <Avatar name={username.trim() || '?'} size={64} />
        </View>

        <ThemedText type="label" themeColor="textSecondary">
          username
        </ThemedText>
        <AppTextInput
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />

        <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLabel}>
          name
        </ThemedText>
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

        <AppButton
          title="save changes"
          loading={saving}
          disabled={!dirty || !username.trim()}
          onPress={save}
        />

        <FilmStrip count={10} style={styles.divider} />

        <AppButton title="sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
        <AppButton
          title="delete account"
          variant="danger"
          loading={deleting}
          onPress={confirmDelete}
        />
        <ThemedText type="code" themeColor="textSecondary" style={styles.deleteNote}>
          deleting your account removes your profile and every photo you have shot. groups you
          created stay with their members.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  avatarRow: {
    alignItems: 'center',
    marginVertical: Spacing.three,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  divider: {
    marginVertical: Spacing.four,
  },
  deleteNote: {
    textAlign: 'center',
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
