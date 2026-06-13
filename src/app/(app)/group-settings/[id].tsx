import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { AvatarPicker } from '@/components/ui/avatar-picker';
import { FilmStrip } from '@/components/ui/film-strip';
import { MemberRow } from '@/components/ui/member-row';
import { Radius, Spacing } from '@/constants/theme';
import {
  deleteGroup,
  getGroup,
  leaveGroup,
  listMembers,
  removeMember,
  updateGroup,
  uploadGroupAvatar,
  type Group,
  type Member,
} from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { displayName } from '@/lib/names';

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const userId = useUserId();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const isAdmin = !!group && group.created_by === userId;

  const load = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([getGroup(id), listMembers(id)]);
      setGroup(g);
      setMembers(m);
      setName(g.name);
      setDescription(g.description ?? '');
    } catch (err) {
      Alert.alert('Could not load group', err instanceof Error ? err.message : undefined);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dirty =
    !!group &&
    (name.trim() !== group.name || description.trim() !== (group.description ?? ''));

  // The picker has already uploaded the file; persist the new URL right away
  // (separate from the name/description "save changes" flow).
  const changeAvatar = async (url: string | null) => {
    setGroup((g) => (g ? { ...g, avatar_url: url } : g));
    try {
      const updated = await updateGroup(id, { avatar_url: url });
      setGroup(updated);
    } catch (err) {
      Alert.alert('Could not update picture', err instanceof Error ? err.message : undefined);
      load();
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await updateGroup(id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      setGroup(updated);
    } catch (err) {
      Alert.alert('Could not save changes', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = (m: Member) => {
    Alert.alert(
      `Remove ${displayName(m)}?`,
      'They lose access to this group. Photos they have already shot stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(id, m.user_id);
              load();
            } catch (err) {
              Alert.alert('Could not remove member', err instanceof Error ? err.message : undefined);
            }
          },
        },
      ]
    );
  };

  const confirmLeave = () => {
    const lastOne = isAdmin && members.length <= 1;
    const transfers = isAdmin && members.length > 1;
    const message = lastOne
      ? 'You are the last member, so the group and all its photos will be deleted.'
      : transfers
        ? 'Your photos stay with the group. Admin hands off to the most active member.'
        : 'Your photos stay with the group.';
    Alert.alert('Leave group?', message, [
      { text: 'Stay', style: 'cancel' },
      {
        text: lastOne ? 'Leave & delete' : 'Leave',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await leaveGroup(id);
            router.replace('/');
          } catch (err) {
            Alert.alert('Could not leave group', err instanceof Error ? err.message : undefined);
            setLeaving(false);
          }
        },
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete group?',
      'The group and every event and photo in it will be permanently deleted. This cannot be undone.',
      [
        { text: 'Keep group', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGroup(id);
              router.replace('/');
            } catch (err) {
              Alert.alert('Could not delete group', err instanceof Error ? err.message : undefined);
            }
          },
        },
      ]
    );
  };

  // Built as an element (not a component) so the text inputs keep focus across
  // re-renders inside the FlatList header.
  const header = (
    <View style={styles.form}>
      <View style={styles.avatarRow}>
        <AvatarPicker
          userId={id}
          name={name.trim() || group?.name || '?'}
          avatarUrl={group?.avatar_url ?? null}
          onChange={changeAvatar}
          upload={(uri, prev) => uploadGroupAvatar(id, uri, prev)}
          size={96}
        />
      </View>

      <ThemedText type="label" themeColor="textSecondary">
        group name
      </ThemedText>
      <AppTextInput
        placeholder="group name"
        autoCapitalize="words"
        value={name}
        onChangeText={setName}
      />

      <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLabel}>
        description
      </ThemedText>
      <AppTextInput
        placeholder="what's this group about?"
        multiline
        value={description}
        onChangeText={setDescription}
        style={styles.descriptionInput}
      />
      <ThemedText type="code" themeColor="textSecondary">
        anyone in the group can edit the name, photo, and description.
      </ThemedText>

      <AppButton
        title="save changes"
        loading={saving}
        disabled={!dirty || !name.trim()}
        onPress={save}
      />

      <FilmStrip count={10} style={styles.divider} />
      <ThemedText type="label" themeColor="textSecondary">
        {members.length} {members.length === 1 ? 'member' : 'members'}
      </ThemedText>
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <FilmStrip count={10} style={styles.divider} />
      <AppButton title="leave group" variant="secondary" loading={leaving} onPress={confirmLeave} />
      {isAdmin && (
        <AppButton title="delete group" variant="danger" onPress={confirmDelete} />
      )}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'group settings' }} />
      <FlatList
        data={members}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <MemberRow
            member={item}
            isAdmin={item.user_id === group?.created_by}
            isYou={item.user_id === userId}
            trailing={
              isAdmin && item.user_id !== group?.created_by ? (
                <Pressable onPress={() => confirmRemove(item)} hitSlop={8}>
                  <ThemedText type="label" themeColor="danger">
                    remove
                  </ThemedText>
                </Pressable>
              ) : undefined
            }
          />
        )}
        ListFooterComponent={footer}
      />
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
    gap: Spacing.three,
  },
  form: {
    gap: Spacing.two,
  },
  avatarRow: {
    alignItems: 'center',
    marginVertical: Spacing.three,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  descriptionInput: {
    minHeight: 90,
    borderRadius: Radius.card,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: 'top',
  },
  divider: {
    marginVertical: Spacing.three,
  },
  footer: {
    gap: Spacing.two,
  },
});
