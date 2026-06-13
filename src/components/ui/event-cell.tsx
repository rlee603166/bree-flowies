import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui/skeleton';
import { Radius, Spacing } from '@/constants/theme';
import type { AppEvent } from '@/lib/api';
import { eventPhase, formatEventDate } from '@/lib/event-state';
import { useTheme } from '@/hooks/use-theme';

/**
 * One square in the events grid — the group "profile" version of an Instagram
 * post. Developed events show their album cover with a name/date scrim;
 * developing events (still hidden by RLS) and developed-but-empty rolls fall
 * back to a labeled dark tile. Tapping always opens the album.
 */
export function EventCell({
  event,
  coverUrl,
  size,
  onPress,
}: {
  event: AppEvent;
  /** Signed URL of the roll's cover photo, when developed and non-empty. */
  coverUrl: string | null;
  size: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false);
  const developing = eventPhase(event) === 'developing';

  return (
    <Pressable onPress={onPress}>
      <View style={[styles.cell, { width: size, height: size, backgroundColor: theme.backgroundElement }]}>
        {coverUrl && (
          <>
            {!loaded && <Skeleton style={StyleSheet.absoluteFill} />}
            <Image
              source={{ uri: coverUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              recyclingKey={event.id}
              transition={150}
              onLoad={() => setLoaded(true)}
            />
          </>
        )}

        {developing && (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <SymbolView name="hourglass" size={22} tintColor={theme.accent} />
          </View>
        )}

        {/* Bottom scrim with the roll name + date — always legible over a cover. */}
        <View style={styles.overlay}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.onCover}>
            {event.name}
          </ThemedText>
          <ThemedText
            type="small"
            numberOfLines={1}
            style={[styles.onCover, { color: developing ? theme.accent : 'rgba(255,255,255,0.7)' }]}
          >
            {developing ? 'developing' : formatEventDate(event.started_at)}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: Radius.card / 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    // Bottom-up dark scrim so text stays readable on bright covers.
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  onCover: {
    color: '#fff',
  },
});
