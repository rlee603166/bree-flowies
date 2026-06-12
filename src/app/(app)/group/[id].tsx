import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { AvatarStack } from '@/components/ui/avatar';
import { FilmStrip } from '@/components/ui/film-strip';
import { PeopleSheet } from '@/components/ui/people-sheet';
import { QrPoster } from '@/components/ui/qr-poster';
import { Radius, Spacing } from '@/constants/theme';
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
import { inviteLink } from '@/lib/invite';
import { onGroupActivity, type ShotEvent } from '@/lib/realtime';
import { displayName } from '@/lib/names';

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
  const [peopleOpen, setPeopleOpen] = useState(false);

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

  // Keep the active event id reachable from realtime callbacks without
  // re-subscribing every time the events list changes.
  const activeEventIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeEventIdRef.current = activeEvent?.id ?? null;
  }, [activeEvent]);

  // Bump a person's shot chip the instant they shoot, from the per-group
  // broadcast (carries no photo data). A full refresh on focus reconciles.
  const handleShot = useCallback((shot: ShotEvent) => {
    if (shot.event_id !== activeEventIdRef.current) return;
    setCounts((prev) => {
      const i = prev.findIndex((c) => c.user_id === shot.taken_by);
      if (i === -1) return [...prev, { user_id: shot.taken_by, shots: 1 }];
      const next = [...prev];
      next[i] = { ...next[i], shots: next[i].shots + 1 };
      return next;
    });
  }, []);

  // Live: events starting/ending in this group re-pull; per-shot broadcasts
  // tick the counts. One private channel handles both.
  useEffect(
    () => onGroupActivity(id, { onEventsChange: refresh, onShot: handleShot }),
    [id, refresh, handleShot]
  );

  const shareCode = () => {
    if (!group) return;
    Share.share({
      message: `Join "${group.name}" on bree flowies — scan the QR, open ${inviteLink(
        group.join_code
      )}, or use code ${group.join_code}`,
    });
  };

  const eventHostName = useMemo(() => {
    if (!activeEvent) return null;
    if (activeEvent.created_by === userId) return 'you';
    const host = members.find((m) => m.user_id === activeEvent.created_by);
    return host ? displayName(host) : null;
  }, [activeEvent, members, userId]);

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
          style={[styles.codeCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <View style={styles.codeCardTop}>
            <ThemedText type="label" themeColor="textSecondary">
              invite
            </ThemedText>
            <ThemedText type="label" themeColor="accent">
              share ↗
            </ThemedText>
          </View>
          <QrPoster code={group.join_code} />
        </Pressable>
      )}

      <Pressable
        onPress={() => members.length > 0 && setPeopleOpen(true)}
        style={styles.membersRow}
        hitSlop={8}
      >
        <AvatarStack names={members.map((m) => displayName(m))} />
        <ThemedText type="label" themeColor="textSecondary">
          {members.length} in the group ›
        </ThemedText>
      </Pressable>

      {activeEvent ? (
        <View
          style={[
            styles.activeCard,
            { borderColor: theme.accent, backgroundColor: theme.backgroundElement },
          ]}
        >
          <ThemedText type="label" style={{ color: theme.accent }}>
            ● live now
          </ThemedText>
          <ThemedText type="subtitle">{activeEvent.name}</ThemedText>
          {eventHostName && (
            <ThemedText type="label" themeColor="textSecondary">
              {eventHostName === 'you' ? "you're hosting" : `hosted by ${eventHostName}`}
            </ThemedText>
          )}
          <View style={styles.shotCounts}>
            {members.map((m) => {
              const shots = counts.find((c) => c.user_id === m.user_id)?.shots ?? 0;
              return (
                <View
                  key={m.user_id}
                  style={[styles.shotChip, { backgroundColor: theme.backgroundSelected }]}
                >
                  <ThemedText type="code" themeColor="textSecondary">
                    {displayName(m)}{' '}
                    <ThemedText type="code" themeColor="text">
                      {String(shots).padStart(2, '0')}
                    </ThemedText>
                  </ThemedText>
                </View>
              );
            })}
          </View>
          <AppButton
            title="● open camera"
            onPress={() =>
              router.push({ pathname: '/camera/[eventId]', params: { eventId: activeEvent.id } })
            }
          />
          {activeEvent.created_by === userId && (
            <Pressable onPress={confirmEndEvent} style={styles.endEvent} hitSlop={8}>
              <ThemedText type="label" themeColor="danger">
                end event
              </ThemedText>
            </Pressable>
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
          <AppButton title="start shooting" loading={busy} disabled={!eventName.trim()} onPress={startEvent} />
          <AppButton title="cancel" variant="secondary" onPress={() => setCreatingEvent(false)} />
        </View>
      ) : (
        <AppButton title="＋ new event" onPress={() => setCreatingEvent(true)} />
      )}

      {pastEvents.length > 0 && (
        <ThemedText type="label" themeColor="textSecondary" style={styles.pastLabel}>
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
                {
                  backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <FilmStrip direction="column" count={4} holeSize={4} style={styles.eventPerforation} />
              <View style={styles.eventRowText}>
                <ThemedText>{item.name}</ThemedText>
                <ThemedText type="code" themeColor="textSecondary">
                  {formatEventDate(item.started_at)}
                </ThemedText>
                {phase === 'developing' && (
                  <ThemedText type="label" style={{ color: theme.accent }}>
                    developing · ready {formatDevelopTime(item.develops_at)}
                  </ThemedText>
                )}
              </View>
              <ThemedText themeColor="textSecondary">{phase === 'developing' ? '🎞️' : '›'}</ThemedText>
            </Pressable>
          );
        }}
      />
      <PeopleSheet
        visible={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        members={members}
        hostUserId={group?.created_by ?? null}
        currentUserId={userId}
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
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  codeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  activeCard: {
    borderWidth: 1.5,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  shotCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  shotChip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.one + 2,
  },
  endEvent: {
    alignSelf: 'center',
    padding: Spacing.one,
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
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  eventPerforation: {
    marginRight: Spacing.three,
  },
  eventRowText: {
    flex: 1,
    gap: Spacing.one,
  },
});
