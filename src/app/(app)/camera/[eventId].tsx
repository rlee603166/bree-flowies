import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Device from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/app-button';
import { FilmStrip } from '@/components/ui/film-strip';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
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
  const flashOn = flash === 'on';

  return (
    <View style={[styles.body, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.safeArea}>
        {/* top controls — sit above the camera body */}
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.control}>
            <Text style={styles.controlText}>✕</Text>
          </Pressable>
          <Text style={styles.brand}>bree flowies</Text>
          <View style={styles.topRight}>
            <Pressable
              onPress={() => setFlash(flashOn ? 'off' : 'on')}
              hitSlop={12}
              style={[styles.control, flashOn && styles.controlActive]}
            >
              <Text style={[styles.controlText, flashOn && { color: Colors.onAccent }]}>⚡︎</Text>
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

        {/* the molded camera body — everything hardware-ish lives inside this shell */}
        <View style={styles.shell}>
          {/* top cluster: printed labels (left), finder + wind-wheel (right) */}
          <View style={styles.cluster}>
            <View style={styles.printStack}>
              <Text style={styles.printLarge}>FILM 400</Text>
              <Text style={styles.print}>ISO ▢▢▢</Text>
              <Text style={styles.print}>35mm</Text>
            </View>

            <View style={styles.finderWheel}>
              {/* tiny dispo viewfinder — deliberately too small to compose with */}
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

              {/* film-advance thumb wheel — ridged plastic */}
              <View style={styles.wheelColumn}>
                <View style={styles.wheel}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <View key={i} style={styles.wheelRidge} />
                  ))}
                </View>
                <Text style={styles.wheelLabel}>WIND</Text>
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

          {/* recessed frame-counter window */}
          <View style={styles.counterArea}>
            <View style={styles.counterPlate}>
              <FilmStrip count={4} color={TRIM} />
              <View style={styles.counterWindow}>
                <Text style={styles.counterText}>{String(totalShots).padStart(2, '0')}</Text>
              </View>
              <FilmStrip count={4} color={TRIM} />
            </View>
            <Text style={styles.counterLabel}>shots on your roll</Text>
          </View>

          {/* bottom deck: flash-ready light, shutter, printed stamp */}
          <View style={styles.deck}>
            <View style={styles.readyRow}>
              <View style={[styles.readyDot, flashOn && styles.readyDotOn]} />
              <Text style={styles.readyText}>{flashOn ? 'flash ready' : 'flash off'}</Text>
            </View>

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
            <Text style={styles.shutterLabel}>shoot</Text>

            <Text style={styles.stamp}>breeflowies · single use</Text>
          </View>
        </View>

        {/* upload status — system feedback, off the camera body */}
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

  // molded camera body — subtly raised plastic shell
  shell: {
    flex: 1,
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Radius.card,
    backgroundColor: PANEL,
    borderWidth: 1,
    borderColor: TRIM,
    // faint top highlight + darker base = a molded, lit-from-above feel
    borderTopColor: Colors.backgroundSelected,
    padding: Spacing.four,
  },

  // top cluster: printed labels on the left, finder + wheel on the right
  cluster: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  printStack: {
    gap: Spacing.one,
    paddingTop: Spacing.one,
  },
  printLarge: {
    color: Colors.textSecondary,
    fontFamily: Fonts.monoBold,
    fontSize: 13,
    letterSpacing: 2,
  },
  print: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  finderWheel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  wheelColumn: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  wheel: {
    width: 30,
    height: 56,
    borderRadius: 6,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: TRIM,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  wheelRidge: {
    width: 2,
    height: 40,
    borderRadius: 1,
    backgroundColor: TRIM,
  },
  wheelLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  viewfinder: {
    width: 132,
    height: 92,
    borderRadius: 10,
    overflow: 'hidden',
    // recessed into the body: dark well, thin trim
    borderWidth: 3,
    borderColor: Colors.background,
    backgroundColor: Colors.photoBackdrop,
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
    backgroundColor: Colors.photoBackdrop,
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

  // recessed frame counter
  counterArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  counterPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TRIM,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  counterWindow: {
    backgroundColor: Colors.photoBackdrop,
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

  // bottom deck
  deck: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  readyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TRIM,
  },
  readyDotOn: {
    backgroundColor: ACCENT,
  },
  readyText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  shutterLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
  },
  stamp: {
    marginTop: Spacing.two,
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    opacity: 0.7,
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
    backgroundColor: Colors.onPhotoBackdrop,
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
