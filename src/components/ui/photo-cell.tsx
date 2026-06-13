import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { Colors } from '@/constants/theme';

export const PHOTO_COLUMNS = 3;
export const PHOTO_GRID_GAP = 2;

/** Square edge length for a cell in a full-bleed 3-up grid of the given width. */
export const photoCellSize = (width: number) =>
  (width - PHOTO_GRID_GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS;

/**
 * One square in a photo grid. Shows a shimmer until its (signed) URL resolves
 * and the image decodes; non-interactive until then.
 */
export function PhotoCell({
  id,
  url,
  size,
  isVideo = false,
  onPress,
}: {
  id: string;
  url: string | null;
  size: number;
  isVideo?: boolean;
  onPress: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  // Video files (.mov) can't be decoded by expo-image — show a dark tile with a
  // play badge instead of a thumbnail. The full clip plays in the viewer.
  return (
    <Pressable onPress={onPress} disabled={!url}>
      <View style={{ width: size, height: size, backgroundColor: Colors.backgroundElement }}>
        {!isVideo && !imageLoaded && <Skeleton style={StyleSheet.absoluteFill} />}
        {url && !isVideo && (
          <Image
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={id}
            transition={150}
            onLoad={() => setImageLoaded(true)}
          />
        )}
        {isVideo && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoGlyph}>▶</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  videoBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoGlyph: {
    color: Colors.onPhotoBackdrop,
    fontSize: 22,
    opacity: 0.85,
  },
});
