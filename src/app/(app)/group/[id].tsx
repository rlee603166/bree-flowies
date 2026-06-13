import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Avatar } from '@/components/ui/avatar';
import { EventCell } from '@/components/ui/event-cell';
import { FabMenu, type FabAction } from '@/components/ui/fab-menu';
import { InviteSheet } from '@/components/ui/invite-sheet';
import { NewEventSheet } from '@/components/ui/new-event-sheet';
import { PeopleSheet } from '@/components/ui/people-sheet';
import { EVENTS_COLUMNS, PHOTO_COLUMNS, PHOTO_GRID_GAP, PhotoCell, photoCellSize } from '@/components/ui/photo-cell';
import { PhotoViewer } from '@/components/ui/photo-viewer';
import { StoryRing } from '@/components/ui/story-ring';
import { SwipeTabs } from '@/components/ui/swipe-tabs';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
    createEvent,
    endEvent,
    getGroup,
    listEvents,
    listGroupPhotos,
    listMembers,
    shotCounts,
    signedPhotoUrls,
    type AppEvent,
    type Group,
    type Member,
    type PhotoWithAuthor,
    type ShotCount,
} from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { formatDevelopTime } from '@/lib/event-state';
import { displayName } from '@/lib/names';
import { onGroupActivity, type ShotEvent } from '@/lib/realtime';

type GroupPhoto = PhotoWithAuthor & { url: string | null };

const isVideo = (path: string) => /\.mov$/i.test(path);

function Stat({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
    return (
        <Pressable onPress={onPress} disabled={!onPress} style={styles.stat}>
            <ThemedText type="smallBold">{value}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
                {label}
            </ThemedText>
        </Pressable>
    );
}

export default function GroupScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const theme = useTheme();
    const userId = useUserId();
    const { width } = useWindowDimensions();

    const [group, setGroup] = useState<Group | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [events, setEvents] = useState<AppEvent[]>([]);
    const [counts, setCounts] = useState<ShotCount[]>([]);
    const [photoCount, setPhotoCount] = useState(0);
    const [coverUrls, setCoverUrls] = useState<Map<string, string>>(new Map());
    const [photos, setPhotos] = useState<GroupPhoto[]>([]);
    const [photosLoaded, setPhotosLoaded] = useState(false);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [peopleOpen, setPeopleOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [newEventOpen, setNewEventOpen] = useState(false);

    const activeEvent = useMemo(() => events.find((e) => e.status === 'active') ?? null, [events]);
    const pastEvents = useMemo(() => events.filter((e) => e.status !== 'active'), [events]);

    const refresh = useCallback(async () => {
        try {
            const [groupData, memberData, eventData, photoRows] = await Promise.all([
                getGroup(id),
                listMembers(id),
                listEvents(id),
                listGroupPhotos(id),
            ]);
            setGroup(groupData);
            setMembers(memberData);
            setEvents(eventData);
            setPhotoCount(photoRows.length);
            const active = eventData.find((e) => e.status === 'active');
            setCounts(active ? await shotCounts(active.id) : []);

            // One cover per developed event — rows come back newest-first, so the
            // first non-video photo we see for an event is its latest still.
            const coverPath = new Map<string, string>();
            for (const p of photoRows) {
                if (!coverPath.has(p.event_id) && !isVideo(p.storage_path)) coverPath.set(p.event_id, p.storage_path);
            }
            const signed = await signedPhotoUrls([...coverPath.values()]);
            const map = new Map<string, string>();
            coverPath.forEach((path, eventId) => {
                const url = signed.get(path);
                if (url) map.set(eventId, url);
            });
            setCoverUrls(map);
        } catch (err) {
            Alert.alert('Could not load group', err instanceof Error ? err.message : undefined);
        } finally {
            setRefreshing(false);
        }
    }, [id]);

    // The whole-group gallery. Signed URLs are pricey for a big group, so this is
    // only fetched once the "all pictures" tab is first seen (and on pull-down).
    // RLS already limits the rows to developed events.
    const loadPhotos = useCallback(async () => {
        try {
            const rows = await listGroupPhotos(id);
            setPhotos((prev) => {
                const prevUrls = new Map(prev.map((p) => [p.id, p.url]));
                return rows.map((p) => ({ ...p, url: prevUrls.get(p.id) ?? null }));
            });
            const urls = await signedPhotoUrls(rows.map((p) => p.storage_path));
            setPhotos(
                rows.flatMap((p) => {
                    const url = urls.get(p.storage_path);
                    return url ? [{ ...p, url }] : [];
                })
            );
        } catch (err) {
            Alert.alert('Could not load photos', err instanceof Error ? err.message : undefined);
        } finally {
            setPhotosLoaded(true);
        }
    }, [id]);

    const handleTabChange = useCallback(
        (index: number) => {
            if (index === 1 && !photosLoaded) loadPhotos();
        },
        [photosLoaded, loadPhotos]
    );

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

    const eventHostName = useMemo(() => {
        if (!activeEvent) return null;
        if (activeEvent.created_by === userId) return 'you';
        const host = members.find((m) => m.user_id === activeEvent.created_by);
        return host ? displayName(host) : null;
    }, [activeEvent, members, userId]);

    const openCamera = () =>
        activeEvent && router.push({ pathname: '/camera/[eventId]', params: { eventId: activeEvent.id } });

    // Rejects on failure so the sheet stays open for a retry; resolves on success
    // after closing the sheet and pulling the new active event in.
    const handleCreateEvent = async (name: string) => {
        try {
            await createEvent(id, name, userId);
            setNewEventOpen(false);
            refresh();
        } catch (err) {
            Alert.alert('Could not start event', err instanceof Error ? err.message : undefined);
            throw err;
        }
    };

    // Speed-dial: only offer "new event" when no roll is live (one active per group).
    const fabActions = useMemo<FabAction[]>(() => {
        const actions: FabAction[] = [];
        if (!activeEvent) {
            actions.push({ key: 'new', label: 'new event', icon: 'camera.fill', onPress: () => setNewEventOpen(true) });
        }
        actions.push({ key: 'invite', label: 'invite people', icon: 'person.badge.plus', onPress: () => setInviteOpen(true) });
        return actions;
    }, [activeEvent]);

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

    // Instagram-profile header: ringed group avatar, stats, name, action buttons,
    // and a live banner when a roll is running.
    const header = (
        <View style={styles.header}>
            <View style={styles.identity}>
                <StoryRing
                    name={group?.name ?? ''}
                    uri={members[0]?.avatar_url}
                    size={84}
                    live={!!activeEvent}
                    onPress={() => (activeEvent ? openCamera() : members.length > 0 && setPeopleOpen(true))}
                />
                <View style={styles.stats}>
                    <Stat value={members.length} label="members" onPress={() => members.length > 0 && setPeopleOpen(true)} />
                    <Stat value={events.length} label="events" />
                    <Stat value={photoCount} label="photos" />
                </View>
            </View>

            {group?.description ? (
                <ThemedText type="small" style={styles.description}>
                    {group.description}
                </ThemedText>
            ) : null}

            {activeEvent && (
                <View style={[styles.liveBanner, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="smallBold" themeColor="text">
                        <ThemedText type="smallBold" style={{ color: theme.recording }}>
                            ●
                        </ThemedText>{' '}
                        live now · {activeEvent.name}
                    </ThemedText>
                    {eventHostName && (
                        <ThemedText type="small" themeColor="textSecondary">
                            {eventHostName === 'you' ? "you're hosting" : `hosted by ${eventHostName}`}
                        </ThemedText>
                    )}
                    <View style={styles.shotCounts}>
                        {members.map((m) => {
                            const shots = counts.find((c) => c.user_id === m.user_id)?.shots ?? 0;
                            return (
                                <View key={m.user_id} style={[styles.shotChip, { backgroundColor: theme.backgroundSelected }]}>
                                    <Avatar name={displayName(m)} uri={m.avatar_url} size={18} />
                                    <ThemedText type="small" themeColor="textSecondary">
                                        {displayName(m)}{' '}
                                        <ThemedText type="smallBold" themeColor="text">
                                            {String(shots).padStart(2, '0')}
                                        </ThemedText>
                                    </ThemedText>
                                </View>
                            );
                        })}
                    </View>
                    <AppButton title="● open camera" onPress={openCamera} />
                    {activeEvent.created_by === userId && (
                        <Pressable onPress={confirmEndEvent} style={styles.endEvent} hitSlop={8}>
                            <ThemedText type="smallBold" themeColor="danger">
                                end event
                            </ThemedText>
                        </Pressable>
                    )}
                </View>
            )}
        </View>
    );

    const eventsTab = (
        <FlatList
            data={pastEvents}
            keyExtractor={(e) => e.id}
            numColumns={EVENTS_COLUMNS}
            columnWrapperStyle={{ gap: PHOTO_GRID_GAP }}
            contentContainerStyle={styles.gridContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.textSecondary} />}
            renderItem={({ item }) => (
                <EventCell
                    event={item}
                    coverUrl={coverUrls.get(item.id) ?? null}
                    size={photoCellSize(width, EVENTS_COLUMNS)}
                    onPress={() => router.push({ pathname: '/album/[eventId]', params: { eventId: item.id } })}
                />
            )}
            ListEmptyComponent={
                events.length === 0 ? (
                    <View style={styles.empty}>
                        <ThemedText type="subtitle">no events yet</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                            start a roll and everyone can shoot into it.
                        </ThemedText>
                        <AppButton title="＋ new event" onPress={() => setNewEventOpen(true)} />
                    </View>
                ) : (
                        <View style={styles.empty}>
                            <ThemedText type="small" themeColor="textSecondary">
                                no past events yet
                            </ThemedText>
                        </View>
                    )
            }
        />
    );

    const picturesTab = (
        <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            numColumns={PHOTO_COLUMNS}
            columnWrapperStyle={{ gap: PHOTO_GRID_GAP }}
            contentContainerStyle={styles.gridContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadPhotos} tintColor={theme.textSecondary} />}
            renderItem={({ item, index }) => (
                <PhotoCell
                    id={item.id}
                    url={item.url}
                    size={photoCellSize(width)}
                    isVideo={isVideo(item.storage_path)}
                    onPress={() => setViewerIndex(index)}
                />
            )}
            ListEmptyComponent={
                <View style={styles.empty}>
                    <ThemedText type="small" themeColor="textSecondary">
                        {photosLoaded ? 'no developed photos yet 🎞️' : 'loading…'}
                    </ThemedText>
                </View>
            }
        />
    );

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen
                options={{
                    title: group?.name ?? '',
                    headerRight: () => (
                        <Pressable
                            onPress={() => router.push({ pathname: '/group-settings/[id]', params: { id } })}
                            hitSlop={8}
                        >
                            <SymbolView name="gearshape" size={24} tintColor={theme.text} />
                        </Pressable>
                    ),
                }}
            />
            {header}
            <SwipeTabs
                onIndexChange={handleTabChange}
                tabs={[
                    { key: 'events', label: 'events', icon: 'square.grid.3x3', content: eventsTab },
                    { key: 'pictures', label: 'all pictures', icon: 'photo.on.rectangle.angled', content: picturesTab },
                ]}
            />
            {fabActions.length > 0 && <FabMenu actions={fabActions} />}
            <PhotoViewer photos={photos} index={viewerIndex} onClose={() => setViewerIndex(null)} />
            <PeopleSheet
                visible={peopleOpen}
                onClose={() => setPeopleOpen(false)}
                members={members}
                adminUserId={group?.created_by ?? null}
                currentUserId={userId}
            />
            {group && (
                <InviteSheet
                    visible={inviteOpen}
                    onClose={() => setInviteOpen(false)}
                    groupName={group.name}
                    code={group.join_code}
                />
            )}
            <NewEventSheet visible={newEventOpen} onClose={() => setNewEventOpen(false)} onCreate={handleCreateEvent} />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: Spacing.three,
        paddingTop: Spacing.two,
        paddingBottom: Spacing.three,
        gap: Spacing.three,
    },
    identity: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.four,
    },
    stats: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    stat: {
        alignItems: 'center',
        gap: Spacing.half,
    },
    description: {
        lineHeight: 20,
    },
    liveBanner: {
        borderWidth: 1.5,
        borderRadius: Radius.card,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    shotCounts: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.two,
    },
    shotChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.one + 2,
        borderRadius: Radius.pill,
        paddingLeft: Spacing.one,
        paddingRight: Spacing.three - 4,
        paddingVertical: Spacing.one,
    },
    endEvent: {
        alignSelf: 'center',
        padding: Spacing.one,
    },
    gridContent: {
        gap: PHOTO_GRID_GAP,
        paddingBottom: Spacing.six,
        flexGrow: 1,
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.three,
        padding: Spacing.five,
    },
    emptyText: {
        textAlign: 'center',
    },
});
