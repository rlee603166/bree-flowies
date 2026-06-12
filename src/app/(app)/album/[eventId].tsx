import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FilmStrip } from '@/components/ui/film-strip';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getEvent, listPhotos, signedPhotoUrls, type AppEvent, type PhotoWithAuthor } from '@/lib/api';
import { eventPhase, formatDevelopTime, formatEventDate } from '@/lib/event-state';

const GRID_GAP = 2;
const COLUMNS = 3;

type AlbumPhoto = PhotoWithAuthor & { url: string | null };

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export default function AlbumScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { width } = useWindowDimensions();

  const [event, setEvent] = useState<AppEvent | null>(null);
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const eventData = await getEvent(eventId);
      setEvent(eventData);
      if (eventPhase(eventData) === 'developed') {
        const rows = await listPhotos(eventId);
        // Rows arrive well before the images — show the grid as skeleton
        // cells right away, keeping any URLs we already have from a
        // previous load so refocusing doesn't flash everything back.
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
      }
    } catch (err) {
      Alert.alert('Could not load album', err instanceof Error ? err.message : undefined);
    } finally {
      setLoaded(true);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const cellSize = (width - GRID_GAP * (COLUMNS - 1)) / COLUMNS;
  const phase = event ? eventPhase(event) : null;

  // Live countdown while the roll develops; flips to the album once it hits zero.
  const developsAtMs = event?.develops_at ? new Date(event.develops_at).getTime() : null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const reloadedAtZero = useRef(false);
  const counting = phase === 'developing' && developsAtMs !== null;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);
  useEffect(() => {
    if (counting && developsAtMs !== null && nowMs >= developsAtMs && !reloadedAtZero.current) {
      reloadedAtZero.current = true;
      load();
    }
  }, [counting, developsAtMs, nowMs, load]);
  const remainingMs = developsAtMs !== null ? developsAtMs - nowMs : null;
  const showCountdown = counting && remainingMs !== null && remainingMs < 24 * 3600 * 1000;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: event?.name ?? '' }} />

      {phase === 'developing' && (
        <View style={styles.locked}>
          <View style={styles.darkroomCard}>
            <ThemedText style={styles.lockedEmoji}>🎞️</ThemedText>
            <ThemedText type="subtitle" style={styles.lockedText}>
              developing…
            </ThemedText>
            {showCountdown && remainingMs !== null ? (
              <>
                <ThemedText themeColor="accent" style={styles.countdown}>
                  {formatCountdown(remainingMs)}
                </ThemedText>
                <ThemedText type="label" themeColor="textSecondary" style={styles.lockedText}>
                  until the roll is ready
                </ThemedText>
              </>
            ) : (
              <ThemedText type="label" themeColor="accent" style={styles.lockedText}>
                roll ready {formatDevelopTime(event?.develops_at ?? null)}
              </ThemedText>
            )}
          </View>
        </View>
      )}

      {phase === 'developed' && (
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            numColumns={COLUMNS}
            contentInsetAdjustmentBehavior="automatic"
            columnWrapperStyle={{ gap: GRID_GAP }}
            contentContainerStyle={{ gap: GRID_GAP }}
            ListHeaderComponent={
            photos.length > 0 ? (
              <View style={styles.rollHeader}>
                <FilmStrip count={10} />
                <ThemedText type="label" themeColor="textSecondary">
                  roll · {photos.length} {photos.length === 1 ? 'exposure' : 'exposures'}
                  {event ? ` · ${formatEventDate(event.started_at)}` : ''}
                </ThemedText>
                <FilmStrip count={10} />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <PhotoCell photo={item} size={cellSize} onPress={() => setViewerIndex(index)} />
          )}
          ListEmptyComponent={
            loaded ? (
              <View style={styles.locked}>
                <ThemedText themeColor="textSecondary">nobody took any photos 🙃</ThemedText>
              </View>
            ) : null
          }
          />
        </SafeAreaView>
      )}

      <Modal
        visible={viewerIndex !== null}
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={styles.viewer}>
          <SafeAreaView edges={['top']} style={styles.viewerHeader}>
            <Pressable onPress={() => setViewerIndex(null)} hitSlop={12} style={styles.viewerClose}>
              <ThemedText style={styles.viewerCloseText}>✕</ThemedText>
            </Pressable>
          </SafeAreaView>
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            initialScrollIndex={viewerIndex ?? 0}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <View style={[styles.viewerPage, { width }]}>
                <Image
                  source={item.url ? { uri: item.url } : undefined}
                  style={styles.viewerImage}
                  contentFit="contain"
                />
                <ThemedText type="code" style={styles.viewerCaption}>
                  frame {pad2(index + 1)}/{pad2(photos.length)} · {item.username} ·{' '}
                  {new Date(item.taken_at).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </ThemedText>
              </View>
            )}
          />
        </View>
      </Modal>
    </ThemedView>
  );
}

function PhotoCell({
  photo,
  size,
  onPress,
}: {
  photo: AlbumPhoto;
  size: number;
  onPress: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  return (
    <Pressable onPress={onPress} disabled={!photo.url}>
      <View style={{ width: size, height: size, backgroundColor: Colors.backgroundElement }}>
        {!imageLoaded && <Skeleton style={StyleSheet.absoluteFill} />}
        {photo.url && (
          <Image
            source={{ uri: photo.url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={photo.id}
            transition={150}
            onLoad={() => setImageLoaded(true)}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  darkroomCard: {
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.five,
    alignSelf: 'stretch',
  },
  lockedEmoji: {
    fontSize: 56,
    lineHeight: 64,
  },
  lockedText: {
    textAlign: 'center',
  },
  countdown: {
    fontFamily: Fonts.mono,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  rollHeader: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '80%',
  },
  viewerCaption: {
    color: Colors.textSecondary,
    marginTop: Spacing.three,
  },
  viewerHeader: {
    backgroundColor: '#000',
  },
  viewerClose: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignSelf: 'flex-start',
  },
  viewerCloseText: {
    color: '#fff',
    fontSize: 22,
    padding: Spacing.two,
  },
});
