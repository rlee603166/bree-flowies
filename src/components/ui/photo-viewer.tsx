import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Colors, Spacing } from '@/constants/theme';
import { savePhotoToLibrary, sharePhoto } from '@/lib/photo-export';

export type ViewerPhoto = {
  id: string;
  url: string | null;
  username: string;
  avatar_url: string | null;
  taken_at: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Signed URLs carry the storage path before the query — sniff a .mov clip. */
const isVideoUrl = (url: string | null) => !!url && /\.mov$/i.test(url.split('?')[0]);

/** One video page: its own looping player, native scrub controls. */
function VideoPage({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return <VideoView player={player} style={styles.image} contentFit="contain" nativeControls />;
}

/**
 * Full-screen, swipeable photo viewer. `index` is the frame to open on (null =
 * closed). The pager is remounted on each open so it always lands on `index`.
 */
export function PhotoViewer({
  photos,
  index,
  onClose,
}: {
  photos: ViewerPhoto[];
  index: number | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Track the frame currently centered in the pager so Share/Save act on it.
  const [current, setCurrent] = useState(index ?? 0);
  const [busy, setBusy] = useState<null | 'share' | 'save'>(null);

  const active = index !== null ? photos[current] : null;

  const onShare = async () => {
    if (!active?.url || busy) return;
    setBusy('share');
    try {
      const ok = await sharePhoto(active.url, active.id);
      if (!ok) Alert.alert('Sharing unavailable on this device');
    } catch (err) {
      Alert.alert('Could not share photo', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const onSave = async () => {
    if (!active?.url || busy) return;
    setBusy('save');
    try {
      const result = await savePhotoToLibrary(active.url, active.id);
      if (result === 'denied') {
        Alert.alert('Photos permission needed', 'Enable photo access in Settings to save to your camera roll.');
      }
    } catch (err) {
      Alert.alert('Could not save photo', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      visible={index !== null}
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => setCurrent(index ?? 0)}
    >
      <View style={styles.viewer}>
        {index !== null && (
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))
            }
            renderItem={({ item, index: i }) => (
              <View style={[styles.page, { width }]}>
                {isVideoUrl(item.url) ? (
                  <VideoPage uri={item.url!} />
                ) : (
                  <Image
                    source={item.url ? { uri: item.url } : undefined}
                    style={styles.image}
                    contentFit="contain"
                  />
                )}
                <View style={styles.caption}>
                  <Avatar name={item.username} uri={item.avatar_url} size={20} />
                  <ThemedText type="code" style={styles.captionText}>
                    frame {pad2(i + 1)}/{pad2(photos.length)} · {item.username} ·{' '}
                    {new Date(item.taken_at).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </ThemedText>
                </View>
              </View>
            )}
          />
        )}
        <Pressable onPress={onClose} hitSlop={12} style={[styles.close, { top: insets.top }]}>
          <ThemedText style={styles.closeText}>✕</ThemedText>
        </Pressable>
        <View style={[styles.actions, { top: insets.top }]}>
          <Pressable
            onPress={onSave}
            hitSlop={12}
            disabled={!active?.url || busy !== null}
            style={styles.action}
          >
            {busy === 'save' ? (
              <ActivityIndicator size="small" color={Colors.onPhotoBackdrop} />
            ) : (
              <ThemedText style={styles.actionText}>save</ThemedText>
            )}
          </Pressable>
          <Pressable
            onPress={onShare}
            hitSlop={12}
            disabled={!active?.url || busy !== null}
            style={styles.action}
          >
            {busy === 'share' ? (
              <ActivityIndicator size="small" color={Colors.onPhotoBackdrop} />
            ) : (
              <ThemedText style={styles.actionText}>share</ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    backgroundColor: Colors.photoBackdrop,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '80%',
  },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  captionText: {
    color: Colors.textSecondary,
  },
  close: {
    position: 'absolute',
    left: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    zIndex: 1,
  },
  closeText: {
    color: Colors.onPhotoBackdrop,
    fontSize: 22,
    padding: Spacing.two,
  },
  actions: {
    position: 'absolute',
    right: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    zIndex: 1,
  },
  action: {
    minWidth: 40,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  actionText: {
    color: Colors.onPhotoBackdrop,
    fontSize: 15,
  },
});
