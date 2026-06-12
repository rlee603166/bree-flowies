import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  onPress,
}: {
  id: string;
  url: string | null;
  size: number;
  onPress: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  return (
    <Pressable onPress={onPress} disabled={!url}>
      <View style={{ width: size, height: size, backgroundColor: Colors.backgroundElement }}>
        {!imageLoaded && <Skeleton style={StyleSheet.absoluteFill} />}
        {url && (
          <Image
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={id}
            transition={150}
            onLoad={() => setImageLoaded(true)}
          />
        )}
      </View>
    </Pressable>
  );
}
