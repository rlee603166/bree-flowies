import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Animated, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { AvatarStack } from '@/components/ui/avatar';
import { FilmStrip } from '@/components/ui/film-strip';
import { Radius, Spacing } from '@/constants/theme';
import { useKeyboardShift } from '@/hooks/use-keyboard-shift';
import { useTheme } from '@/hooks/use-theme';
import { createGroup, joinGroup, listGroups, type GroupSummary } from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { onAnyEventChange } from '@/lib/realtime';

type FormMode = 'none' | 'create' | 'join';

function GroupCard({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  const theme = useTheme();
  const live = group.liveEvent;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.groupCard,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: live ? theme.accent : theme.border,
        },
      ]}
    >
      <View style={styles.groupCardTop}>
        <View style={styles.groupCardText}>
          <ThemedText type="subtitle">{group.name}</ThemedText>
          <View style={styles.membersRow}>
            <AvatarStack names={group.memberNames} size={24} />
            <ThemedText type="label" themeColor="textSecondary">
              {group.memberNames.length} {group.memberNames.length === 1 ? 'member' : 'members'}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="subtitle" themeColor={live ? 'accent' : 'textSecondary'}>
          →
        </ThemedText>
      </View>
      {live && (
        <>
          <FilmStrip count={10} style={styles.liveDivider} />
          <ThemedText type="label" style={{ color: theme.accent }} numberOfLines={1}>
            ● live now · {live.name}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

export default function GroupsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const userId = useUserId();
  const insets = useSafeAreaInsets();
  const keyboardShift = useKeyboardShift(1);

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('none');
  const [formValue, setFormValue] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setGroups(await listGroups());
    } catch (err) {
      Alert.alert('Could not load groups', err instanceof Error ? err.message : undefined);
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Live: a friend starting or ending an event anywhere in your groups
  // re-pulls the list so "● live now" appears/clears without a manual refresh.
  useEffect(() => onAnyEventChange(refresh), [refresh]);

  const submitForm = async () => {
    if (!formValue.trim()) return;
    setBusy(true);
    try {
      if (formMode === 'create') {
        const group = await createGroup(formValue, userId);
        router.push({ pathname: '/group/[id]', params: { id: group.id } });
      } else {
        const groupId = await joinGroup(formValue);
        router.push({ pathname: '/group/[id]', params: { id: groupId } });
      }
      setFormMode('none');
      setFormValue('');
      refresh();
    } catch (err) {
      Alert.alert(
        formMode === 'create' ? 'Could not create group' : 'Could not join group',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setBusy(false);
    }
  };

  const closeForm = () => {
    setFormMode('none');
    setFormValue('');
  };

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.listContent,
          groups.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <GroupCard
            group={item}
            onPress={() => router.push({ pathname: '/group/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <FilmStrip count={7} holeSize={7} />
              <ThemedText type="subtitle" style={styles.emptyTitle}>
                no groups yet
              </ThemedText>
              <ThemedText type="code" themeColor="textSecondary" style={styles.emptyTitle}>
                create one for your friends, or join with a code
              </ThemedText>
            </View>
          ) : null
        }
      />

      <Animated.View
        style={[
          styles.actionBar,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + Spacing.two,
            transform: [{ translateY: keyboardShift }],
          },
        ]}
      >
        {formMode === 'none' ? (
          <View style={styles.actionRow}>
            <AppButton
              title="create a group"
              style={styles.actionButton}
              onPress={() => setFormMode('create')}
            />
            <AppButton
              title="join with a code"
              variant="secondary"
              style={styles.actionButton}
              onPress={() => setFormMode('join')}
            />
          </View>
        ) : (
          <View style={styles.formColumn}>
            <AppTextInput
              placeholder={formMode === 'create' ? 'group name' : 'join code'}
              autoFocus
              autoCapitalize={formMode === 'join' ? 'characters' : 'sentences'}
              autoCorrect={false}
              value={formValue}
              onChangeText={setFormValue}
              onSubmitEditing={submitForm}
            />
            <View style={styles.actionRow}>
              <AppButton
                title={formMode === 'create' ? 'create' : 'join'}
                loading={busy}
                disabled={!formValue.trim()}
                style={styles.actionButton}
                onPress={submitForm}
              />
              <AppButton title="cancel" variant="secondary" style={styles.actionButton} onPress={closeForm} />
            </View>
            {formMode === 'join' && (
              <AppButton
                title="⊡ scan a QR code instead"
                variant="secondary"
                onPress={() => {
                  closeForm();
                  router.push('/scan');
                }}
              />
            )}
          </View>
        )}
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.three,
    paddingBottom: 160,
    gap: Spacing.two,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  groupCard: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  groupCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupCardText: {
    flex: 1,
    gap: Spacing.two,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  liveDivider: {
    marginVertical: Spacing.three,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.six,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
  },
  formColumn: {
    gap: Spacing.two,
  },
});
