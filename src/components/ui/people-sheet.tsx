import { FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FilmStrip } from '@/components/ui/film-strip';
import { MemberRow } from '@/components/ui/member-row';
import { Spacing } from '@/constants/theme';
import type { Member } from '@/lib/api';

/** Slide-up roster of everyone in the group, shown by name. */
export function PeopleSheet({
  visible,
  onClose,
  members,
  adminUserId,
  currentUserId,
}: {
  visible: boolean;
  onClose: () => void;
  members: Member[];
  adminUserId: string | null;
  currentUserId: string;
}) {
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
        renderItem={({ item }) => (
          <MemberRow
            member={item}
            isAdmin={item.user_id === adminUserId}
            isYou={item.user_id === currentUserId}
          />
        )}
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
});
