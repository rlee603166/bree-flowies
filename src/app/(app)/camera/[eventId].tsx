import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Device from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/app-button';
import { FilmStrip } from '@/components/ui/film-strip';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getEvent, shotCounts } from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { createFakePhotoBytes } from '@/lib/fake-photo';
import { onEventChange } from '@/lib/realtime';
import { enqueuePhoto, getUploads, retryFailedUploads, subscribeToUploads } from '@/lib/upload-queue';

// Simulators have no camera; in dev we fake the shutter so the whole
// capture -> develop -> album flow stays testable.
const FAKE_CAMERA = __DEV__ && !Device.isDevice;

const BODY = Colors.background;
const PANEL = Colors.backgroundElement;
const TRIM = Colors.border;
const ACCENT = Colors.accent;

export default function CameraScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const userId = useUserId();

  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const capturing = useRef(false);
  const [flashAnim] = useState(() => new Animated.Value(0));

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [priorShots, setPriorShots] = useState(0);
  const [sessionShots, setSessionShots] = useState(0);
  const [rollClosed, setRollClosed] = useState(false);

  const uploads = useSyncExternalStore(subscribeToUploads, getUploads);
  const eventUploads = uploads.filter((u) => u.eventId === eventId);
  const uploading = eventUploads.filter((u) => u.status === 'uploading').length;
  const failed = eventUploads.filter((u) => u.status === 'failed').length;

  useEffect(() => {
    shotCounts(eventId)
      .then((counts) => setPriorShots(counts.find((c) => c.user_id === userId)?.shots ?? 0))
      .catch(() => {});
  }, [eventId, userId]);

  // Close the roll the moment the host ends it — even mid-shoot. Also covers
  // the stale-entry case: if the event was already ended before this screen
  // opened, the initial check closes it too.
  useEffect(() => {
    getEvent(eventId)
      .then((event) => {
        if (event.status !== 'active') setRollClosed(true);
      })
      .catch(() => {});
    return onEventChange(eventId, (event) => {
      if (event.status !== 'active') setRollClosed(true);
    });
  }, [eventId]);

  useEffect(() => {
    if (!FAKE_CAMERA && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const fireFlashOverlay = () => {
    flashAnim.setValue(0.95);
    Animated.timing(flashAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start();
  };

  const snap = async () => {
    if (rollClosed || capturing.current) return;
    capturing.current = true;
    try {
      if (FAKE_CAMERA) {
        enqueuePhoto({ eventId, userId, bytes: createFakePhotoBytes() });
      } else {
        if (!cameraReady || !cameraRef.current) return;
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
        enqueuePhoto({ eventId, userId, uri: photo.uri });
      }
      fireFlashOverlay();
      setSessionShots((n) => n + 1);
    } catch {
      // missed shot; the next press tries again, just like a real dispo jam
    } finally {
      capturing.current = false;
    }
  };

  const needsPermission = !FAKE_CAMERA && (!permission || !permission.granted);
  const shutterDisabled = needsPermission || rollClosed;
  const totalShots = priorShots + sessionShots;

  return (
    <View style={[styles.body, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.safeArea}>
        {/* top controls */}
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.control}>
            <Text style={styles.controlText}>✕</Text>
          </Pressable>
          <Text style={styles.brand}>bree flowies</Text>
          <View style={styles.topRight}>
            <Pressable
              onPress={() => setFlash(flash === 'off' ? 'on' : 'off')}
              hitSlop={12}
              style={[styles.control, flash === 'on' && styles.controlActive]}
            >
              <Text style={[styles.controlText, flash === 'on' && { color: Colors.onAccent }]}>⚡︎</Text>
            </Pressable>
            <Pressable
              onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
              hitSlop={12}
              style={styles.control}
            >
              <Text style={styles.controlText}>⟲</Text>
            </Pressable>
          </View>
        </View>

        {/* tiny dispo viewfinder — deliberately too small to compose with */}
        <View style={styles.viewfinderRow}>
          <View style={styles.viewfinder}>
            {needsPermission ? (
              <View style={styles.viewfinderFallback}>
                <Text style={styles.fallbackText}>no access</Text>
              </View>
            ) : FAKE_CAMERA ? (
              <View style={styles.viewfinderFallback}>
                <Text style={styles.fallbackText}>simulator</Text>
              </View>
            ) : (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                flash={flash}
                onCameraReady={() => setCameraReady(true)}
              />
            )}
            <View pointerEvents="none" style={styles.viewfinderOverlay}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <View style={styles.crosshairH} />
              <View style={styles.crosshairV} />
            </View>
          </View>
        </View>

        {permission && !permission.granted && !FAKE_CAMERA && (
          <View style={styles.permissionBox}>
            <Text style={styles.fallbackText}>
              {permission.canAskAgain
                ? 'bree flowies needs the camera to shoot'
                : 'enable camera access in Settings'}
            </Text>
            {permission.canAskAgain && (
              <AppButton title="allow camera" onPress={requestPermission} />
            )}
          </View>
        )}

        {/* film counter */}
        <View style={styles.counterRow}>
          <FilmStrip count={6} color={TRIM} />
          <View style={styles.counterWindow}>
            <Text style={styles.counterText}>{String(totalShots).padStart(2, '0')}</Text>
          </View>
          <FilmStrip count={6} color={TRIM} />
          <Text style={styles.counterLabel}>shots on your roll</Text>
        </View>

        {/* shutter */}
        <View style={styles.shutterRow}>
          <Pressable
            onPress={snap}
            disabled={shutterDisabled}
            style={({ pressed }) => [
              styles.shutterOuter,
              pressed && styles.shutterPressed,
              shutterDisabled && styles.shutterDisabled,
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </View>

        {/* upload status */}
        <View style={styles.statusRow}>
          {uploading > 0 && <Text style={styles.statusText}>↑ saving {uploading}…</Text>}
          {failed > 0 && (
            <Pressable onPress={retryFailedUploads} hitSlop={8}>
              <Text style={[styles.statusText, styles.statusFailed]}>
                {failed} didn’t save — tap to retry
              </Text>
            </Pressable>
          )}
          {uploading === 0 && failed === 0 && (
            <Text style={styles.statusText}>photos develop after the event ends 🎞️</Text>
          )}
        </View>
      </View>

      {/* roll closed — soft block: shutter is dead, they tap out when ready */}
      {rollClosed && (
        <View style={[styles.closedOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <FilmStrip count={8} color={TRIM} />
          <Text style={styles.closedTitle}>this roll just closed</Text>
          <Text style={styles.closedBody}>
            the host ended the event — your shots are developing 🎞️
          </Text>
          <View style={styles.closedAction}>
            <AppButton title="back to group" onPress={() => router.back()} />
          </View>
        </View>
      )}

      {/* shutter flash */}
      <Animated.View pointerEvents="none" style={[styles.flashOverlay, { opacity: flashAnim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: BODY,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  topRight: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PANEL,
    borderWidth: 1,
    borderColor: TRIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  controlText: {
    color: Colors.text,
    fontSize: 18,
  },
  brand: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  viewfinderRow: {
    marginTop: Spacing.five,
    alignItems: 'flex-start',
  },
  viewfinder: {
    width: 132,
    height: 92,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: TRIM,
    backgroundColor: '#000',
  },
  viewfinderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: ACCENT,
  },
  cornerTL: { top: 5, left: 5, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  cornerTR: { top: 5, right: 5, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  cornerBL: { bottom: 5, left: 5, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  cornerBR: { bottom: 5, right: 5, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  crosshairH: {
    width: 12,
    height: 1,
    backgroundColor: ACCENT,
    opacity: 0.7,
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: 12,
    backgroundColor: ACCENT,
    opacity: 0.7,
  },
  viewfinderFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  fallbackText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
    textAlign: 'center',
  },
  permissionBox: {
    marginTop: Spacing.four,
    gap: Spacing.three,
  },
  counterRow: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  counterWindow: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: TRIM,
    borderRadius: 8,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  counterText: {
    color: ACCENT,
    fontFamily: Fonts.mono,
    fontSize: 44,
    fontVariant: ['tabular-nums'],
  },
  counterLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
  },
  shutterRow: {
    alignItems: 'center',
    paddingBottom: Spacing.four,
  },
  shutterOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PANEL,
  },
  shutterPressed: {
    transform: [{ scale: 0.93 }],
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: ACCENT,
  },
  statusRow: {
    alignItems: 'center',
    paddingBottom: Spacing.three,
    minHeight: 36,
  },
  statusText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  statusFailed: {
    color: Colors.danger,
  },
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  closedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BODY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.four,
  },
  closedTitle: {
    color: ACCENT,
    fontFamily: Fonts.mono,
    fontSize: 20,
    letterSpacing: 1,
    textAlign: 'center',
  },
  closedBody: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  closedAction: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
});
