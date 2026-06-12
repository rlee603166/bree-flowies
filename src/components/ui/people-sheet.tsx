import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
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
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop touches inside the sheet from dismissing it. */}
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.three },
          ]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
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
                  <Avatar name={displayName(item)} size={40} />
                  <View style={styles.rowText}>
                    <ThemedText>
                      {fullName(item)}
                      {isYou && (
                        <ThemedText themeColor="textSecondary"> · you</ThemedText>
                      )}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.card + 4,
    borderTopRightRadius: Radius.card + 4,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.three,
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
