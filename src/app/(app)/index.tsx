import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CreateJoinSheet } from '@/components/ui/create-join-sheet';
import { StoryRing } from '@/components/ui/story-ring';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createGroup, listGroups, type GroupSummary } from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { onAnyEventChange } from '@/lib/realtime';

function GroupRow({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  const theme = useTheme();
  const live = group.liveEvent;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundElement : 'transparent' },
      ]}
    >
      <StoryRing name={group.name} uri={group.members[0]?.avatar_url} size={56} live={!!live} onPress={onPress} />
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {group.name}
        </ThemedText>
        {live ? (
          <ThemedText type="small" themeColor="text" numberOfLines={1}>
            <ThemedText type="small" style={{ color: theme.recording }}>
              ●
            </ThemedText>{' '}
            live now · {live.name}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
          </ThemedText>
        )}
      </View>
      <SymbolView name="chevron.right" size={16} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

export default function GroupsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const userId = useUserId();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

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
  // re-pulls the list so the gradient ring / live line appears or clears.
  useEffect(() => onAnyEventChange(refresh), [refresh]);

  // IG-style header actions: + (create/join) and settings.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable onPress={() => setSheetOpen(true)} hitSlop={8}>
            <SymbolView name="plus.app" size={26} tintColor={theme.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
            <SymbolView name="gearshape" size={24} tintColor={theme.text} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, router, theme.text]);

  const handleCreate = async (name: string) => {
    const group = await createGroup(name, userId);
    setSheetOpen(false);
    router.push({ pathname: '/group/[id]', params: { id: group.id } });
    refresh();
  };

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.listContent, groups.length === 0 && styles.listContentEmpty]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.textSecondary} />}
        renderItem={({ item }) => (
          <GroupRow
            group={item}
            onPress={() => router.push({ pathname: '/group/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <SymbolView name="person.2" size={48} tintColor={theme.textSecondary} />
              <ThemedText type="subtitle" style={styles.center}>
                no groups yet
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                create one for your friends, or scan a QR to join
              </ThemedText>
            </View>
          ) : null
        }
      />

      <CreateJoinSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onCreate={handleCreate} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingVertical: Spacing.two,
    paddingBottom: Spacing.six,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  center: {
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
