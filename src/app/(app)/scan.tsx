import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/app-button';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { codeFromScan } from '@/lib/invite';

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  // Barcodes fire continuously while one is in frame — only act on the first.
  const handled = useRef(false);

  const onBarcode = ({ data }: { data: string }) => {
    if (handled.current) return;
    const code = codeFromScan(data);
    if (!code) return;
    handled.current = true;
    router.replace({ pathname: '/join/[code]', params: { code } });
  };

  const granted = permission?.granted ?? false;

  return (
    <View style={styles.body}>
      {granted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onBarcode}
        />
      )}

      <View style={[styles.overlay, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.control}>
            <Text style={styles.controlText}>✕</Text>
          </Pressable>
          <Text style={styles.brand}>scan to join</Text>
          <View style={styles.control} />
        </View>

        <View style={styles.reticleRow}>
          {granted ? (
            <View style={styles.reticle}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.hint}>
                {permission?.canAskAgain === false
                  ? 'enable camera access in Settings to scan'
                  : 'bree flowies needs the camera to scan invites'}
              </Text>
              {permission?.canAskAgain !== false && (
                <AppButton title="allow camera" onPress={requestPermission} />
              )}
            </View>
          )}
        </View>

        <Text style={[styles.hint, { paddingBottom: insets.bottom + Spacing.four }]}>
          point at a group&apos;s QR code
        </Text>
      </View>
    </View>
  );
}

const RETICLE = 240;
const CORNER = 28;

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: Colors.photoBackdrop,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  control: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: Fonts.sansBold,
  },
  brand: {
    color: Colors.text,
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  reticleRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: RETICLE,
    height: RETICLE,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: Colors.onPhotoBackdrop,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  permissionBox: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  hint: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
