import { Image } from 'expo-image';
import { FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Colors, Spacing } from '@/constants/theme';

export type ViewerPhoto = {
  id: string;
  url: string | null;
  username: string;
  avatar_url: string | null;
  taken_at: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

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

  return (
    <Modal visible={index !== null} animationType="fade" onRequestClose={onClose}>
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
            renderItem={({ item, index: i }) => (
              <View style={[styles.page, { width }]}>
                <Image
                  source={item.url ? { uri: item.url } : undefined}
                  style={styles.image}
                  contentFit="contain"
                />
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
});
