import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Member } from '@/lib/api';
import { displayName, fullName } from '@/lib/names';

/**
 * One person in a roster — avatar, name (with a "· you" marker), @username, an
 * "admin" badge for the group creator, and an optional trailing slot (e.g. a
 * remove control in group settings). Shared by `PeopleSheet` and the group
 * settings screen.
 */
export function MemberRow({
  member,
  isAdmin,
  isYou,
  trailing,
}: {
  member: Member;
  isAdmin: boolean;
  isYou: boolean;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Avatar name={displayName(member)} uri={member.avatar_url} size={40} />
      <View style={styles.rowText}>
        <ThemedText>
          {fullName(member)}
          {isYou && <ThemedText themeColor="textSecondary"> · you</ThemedText>}
        </ThemedText>
        <ThemedText type="label" themeColor="textSecondary">
          @{member.username}
        </ThemedText>
      </View>
      {isAdmin && (
        <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="label" themeColor="text">
            admin
          </ThemedText>
        </View>
      )}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
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
