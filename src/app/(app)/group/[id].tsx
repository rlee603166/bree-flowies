import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createEvent,
  endEvent,
  getGroup,
  listEvents,
  listMembers,
  shotCounts,
  type AppEvent,
  type Group,
  type Member,
  type ShotCount,
} from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { eventPhase, formatDevelopTime, formatEventDate } from '@/lib/event-state';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const userId = useUserId();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [counts, setCounts] = useState<ShotCount[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [eventName, setEventName] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeEvent = useMemo(() => events.find((e) => e.status === 'active') ?? null, [events]);
  const pastEvents = useMemo(() => events.filter((e) => e.status !== 'active'), [events]);

  const refresh = useCallback(async () => {
    try {
      const [groupData, memberData, eventData] = await Promise.all([
        getGroup(id),
        listMembers(id),
        listEvents(id),
      ]);
      setGroup(groupData);
      setMembers(memberData);
      setEvents(eventData);
      const active = eventData.find((e) => e.status === 'active');
      setCounts(active ? await shotCounts(active.id) : []);
    } catch (err) {
      Alert.alert('Could not load group', err instanceof Error ? err.message : undefined);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const shareCode = () => {
    if (!group) return;
    Share.share({
      message: `Join "${group.name}" on bree flowies with code ${group.join_code}`,
    });
  };

  const startEvent = async () => {
    if (!eventName.trim()) return;
    setBusy(true);
    try {
      await createEvent(id, eventName, userId);
      setEventName('');
      setCreatingEvent(false);
      refresh();
    } catch (err) {
      Alert.alert('Could not start event', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const confirmEndEvent = () => {
    if (!activeEvent) return;
    Alert.alert('End event?', 'No more photos can be added. The roll develops after it ends.', [
      { text: 'Keep shooting', style: 'cancel' },
      {
        text: 'End event',
        style: 'destructive',
        onPress: async () => {
          try {
            const ended = await endEvent(activeEvent.id);
            Alert.alert('Roll closed 🎞️', `Photos develop ${formatDevelopTime(ended.develops_at)}.`);
            refresh();
          } catch (err) {
            Alert.alert('Could not end event', err instanceof Error ? err.message : undefined);
          }
        },
      },
    ]);
  };

  const header = (
    <View style={styles.headerContent}>
      {group && (
        <Pressable
          onPress={shareCode}
          style={[styles.codeCard, { backgroundColor: theme.backgroundElement }]}
        >
          <View style={styles.codeCardText}>
            <ThemedText type="small" themeColor="textSecondary">
              join code · tap to share
            </ThemedText>
            <ThemedText type="subtitle" style={styles.code}>
              {group.join_code}
            </ThemedText>
          </View>
        </Pressable>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        {members.map((m) => m.username).join(' · ')}
      </ThemedText>

      {activeEvent ? (
        <View style={[styles.activeCard, { borderColor: theme.accent }]}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            ● live now
          </ThemedText>
          <ThemedText type="subtitle">{activeEvent.name}</ThemedText>
          <View style={styles.shotCounts}>
            {members.map((m) => {
              const shots = counts.find((c) => c.user_id === m.user_id)?.shots ?? 0;
              return (
                <ThemedText key={m.user_id} type="small" themeColor="textSecondary">
                  {m.username}: {shots} {shots === 1 ? 'shot' : 'shots'}
                </ThemedText>
              );
            })}
          </View>
          <AppButton
            title="📸  Open camera"
            onPress={() =>
              router.push({ pathname: '/camera/[eventId]', params: { eventId: activeEvent.id } })
            }
          />
          {activeEvent.created_by === userId && (
            <AppButton title="End event" variant="danger" onPress={confirmEndEvent} />
          )}
        </View>
      ) : creatingEvent ? (
        <View style={styles.newEventForm}>
          <AppTextInput
            placeholder="what's happening tonight?"
            autoFocus
            value={eventName}
            onChangeText={setEventName}
            onSubmitEditing={startEvent}
          />
          <AppButton title="Start shooting" loading={busy} disabled={!eventName.trim()} onPress={startEvent} />
          <AppButton title="Cancel" variant="secondary" onPress={() => setCreatingEvent(false)} />
        </View>
      ) : (
        <AppButton title="＋ New event" onPress={() => setCreatingEvent(true)} />
      )}

      {pastEvents.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.pastLabel}>
          past events
        </ThemedText>
      )}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: group?.name ?? '' }} />
      <FlatList
        data={pastEvents}
        keyExtractor={(e) => e.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const phase = eventPhase(item);
          return (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/album/[eventId]', params: { eventId: item.id } })
              }
              style={({ pressed }) => [
                styles.eventRow,
                { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
              ]}
            >
              <View style={styles.eventRowText}>
                <ThemedText>{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatEventDate(item.started_at)}
                  {phase === 'developing' && ` · developing, ready ${formatDevelopTime(item.develops_at)}`}
                </ThemedText>
              </View>
              <ThemedText themeColor="textSecondary">{phase === 'developing' ? '🎞️' : '›'}</ThemedText>
            </Pressable>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  headerContent: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  codeCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  codeCardText: {
    gap: Spacing.half,
  },
  code: {
    letterSpacing: 6,
  },
  activeCard: {
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  shotCounts: {
    gap: Spacing.half,
  },
  newEventForm: {
    gap: Spacing.two,
  },
  pastLabel: {
    marginTop: Spacing.two,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  eventRowText: {
    flex: 1,
    gap: Spacing.half,
  },
});
