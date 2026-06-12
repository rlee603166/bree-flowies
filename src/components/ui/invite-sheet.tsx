import { Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/app-button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { QrPoster } from '@/components/ui/qr-poster';
import { Spacing } from '@/constants/theme';
import { inviteLink } from '@/lib/invite';

/** The group's scannable invite, lifted into a sheet off the main screen. */
export function InviteSheet({
  visible,
  onClose,
  groupName,
  code,
}: {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  code: string;
}) {
  const share = () => {
    Share.share({
      message: `Join "${groupName}" on bree flowies — scan the QR, open ${inviteLink(code)}, or use code ${code}`,
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <ThemedText type="subtitle">invite others</ThemedText>
        <ThemedText type="label" themeColor="textSecondary" style={styles.caption}>
          scan the code to join the group, or share the link.
        </ThemedText>
        <QrPoster code={code} />
        <AppButton title="share invite ↗" variant="secondary" onPress={share} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  caption: {
    textAlign: 'center',
  },
});
