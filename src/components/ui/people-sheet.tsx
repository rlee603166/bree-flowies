import { FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FilmStrip } from '@/components/ui/film-strip';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Member } from '@/lib/api';
import { displayName, fullName } from '@/lib/names';

/** Slide-up roster of everyone in the group, shown by name. */
export function PeopleSheet({
  visible,
  onClose,
  members,
  hostUserId,
  currentUserId,
}: {
  visible: boolean;
  onClose: () => void;
  members: Member[];
  hostUserId: string | null;
  currentUserId: string;
}) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <ThemedText type="subtitle">in the group</ThemedText>
        <ThemedText type="label" themeColor="textSecondary">
          {members.length} {members.length === 1 ? 'person' : 'people'}
        </ThemedText>
      </View>
      <FilmStrip count={12} style={styles.divider} />
      <FlatList
        data={members}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isHost = item.user_id === hostUserId;
          const isYou = item.user_id === currentUserId;
          return (
            <View style={styles.row}>
              <Avatar name={displayName(item)} uri={item.avatar_url} size={40} />
              <View style={styles.rowText}>
                <ThemedText>
                  {fullName(item)}
                  {isYou && <ThemedText themeColor="textSecondary"> · you</ThemedText>}
                </ThemedText>
                <ThemedText type="label" themeColor="textSecondary">
                  @{item.username}
                </ThemedText>
              </View>
              {isHost && (
                <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="label" themeColor="accent">
                    host
                  </ThemedText>
                </View>
              )}
            </View>
          );
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  divider: {
    marginVertical: Spacing.three,
  },
  list: {
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  badge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.one,
  },
});
