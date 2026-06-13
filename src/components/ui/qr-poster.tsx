import QRCode from 'react-native-qrcode-svg';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { inviteLink } from '@/lib/invite';

/**
 * The scannable invite. Dark modules on a cream tile (kept high-contrast so
 * any camera reads it), with the short code underneath as a typed fallback.
 */
export function QrPoster({ code, size = 180 }: { code: string; size?: number }) {
  return (
    <View style={styles.poster}>
      <View style={styles.tile}>
        <QRCode
          value={inviteLink(code)}
          size={size}
          color={Colors.posterInk}
          backgroundColor={Colors.posterPaper}
        />
      </View>
      <ThemedText type="label" themeColor="textSecondary" style={styles.caption}>
        scan to join
      </ThemedText>
      <ThemedText style={styles.code}>{code}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  tile: {
    backgroundColor: Colors.posterPaper,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  caption: {
    marginTop: Spacing.one,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: 8,
    color: Colors.posterInk,
    textAlign: 'center',
  },
});
