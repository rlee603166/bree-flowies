import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getEvent, listPhotos, signedPhotoUrls, type AppEvent, type PhotoWithAuthor } from '@/lib/api';
import { eventPhase, formatDevelopTime } from '@/lib/event-state';

const GRID_GAP = 2;
const COLUMNS = 3;

type AlbumPhoto = PhotoWithAuthor & { url: string };

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

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: event?.name ?? '' }} />

      {phase === 'developing' && (
        <View style={styles.locked}>
          <ThemedText style={styles.lockedEmoji}>🎞️</ThemedText>
          <ThemedText type="subtitle" style={styles.lockedText}>
            developing…
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.lockedText}>
            the roll is ready {formatDevelopTime(event?.develops_at ?? null)}
          </ThemedText>
        </View>
      )}

      {phase === 'developed' && (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          numColumns={COLUMNS}
          contentInsetAdjustmentBehavior="automatic"
          columnWrapperStyle={{ gap: GRID_GAP }}
          contentContainerStyle={{ gap: GRID_GAP }}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setViewerIndex(index)}>
              <Image
                source={{ uri: item.url }}
                style={{ width: cellSize, height: cellSize }}
                contentFit="cover"
                recyclingKey={item.id}
                transition={150}
              />
            </Pressable>
          )}
          ListEmptyComponent={
            loaded ? (
              <View style={styles.locked}>
                <ThemedText themeColor="textSecondary">nobody took any photos 🙃</ThemedText>
              </View>
            ) : null
          }
        />
      )}

      <Modal
        visible={viewerIndex !== null}
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={styles.viewer}>
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            initialScrollIndex={viewerIndex ?? 0}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={[styles.viewerPage, { width }]}>
                <Image source={{ uri: item.url }} style={styles.viewerImage} contentFit="contain" />
                <ThemedText type="small" style={styles.viewerCaption}>
                  {item.username} ·{' '}
                  {new Date(item.taken_at).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </ThemedText>
              </View>
            )}
          />
          <SafeAreaView style={styles.viewerClose}>
            <Pressable onPress={() => setViewerIndex(null)} hitSlop={12}>
              <ThemedText style={styles.viewerCloseText}>✕</ThemedText>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </ThemedView>
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
  lockedEmoji: {
    fontSize: 56,
    lineHeight: 64,
  },
  lockedText: {
    textAlign: 'center',
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
    color: '#B0B4BA',
    marginTop: Spacing.three,
  },
  viewerClose: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingLeft: Spacing.four,
  },
  viewerCloseText: {
    color: '#fff',
    fontSize: 22,
    padding: Spacing.two,
  },
});
