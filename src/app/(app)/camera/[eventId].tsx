import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Device from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/app-button';
import { Fonts, Spacing } from '@/constants/theme';
import { shotCounts } from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { createFakePhotoBytes } from '@/lib/fake-photo';
import { enqueuePhoto, getUploads, retryFailedUploads, subscribeToUploads } from '@/lib/upload-queue';

// Simulators have no camera; in dev we fake the shutter so the whole
// capture -> develop -> album flow stays testable.
const FAKE_CAMERA = __DEV__ && !Device.isDevice;

const BODY = '#17171A';
const PANEL = '#222226';
const TRIM = '#3A3A40';
const ACCENT = '#F2660F';

export default function CameraScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const userId = useUserId();

  const cameraRef = useRef<CameraView>(null);
  const capturing = useRef(false);
  const [flashAnim] = useState(() => new Animated.Value(0));

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [priorShots, setPriorShots] = useState(0);
  const [sessionShots, setSessionShots] = useState(0);

  const uploads = useSyncExternalStore(subscribeToUploads, getUploads);
  const eventUploads = uploads.filter((u) => u.eventId === eventId);
  const uploading = eventUploads.filter((u) => u.status === 'uploading').length;
  const failed = eventUploads.filter((u) => u.status === 'failed').length;

  useEffect(() => {
    shotCounts(eventId)
      .then((counts) => setPriorShots(counts.find((c) => c.user_id === userId)?.shots ?? 0))
      .catch(() => {});
  }, [eventId, userId]);

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
    if (capturing.current) return;
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
  const totalShots = priorShots + sessionShots;

  return (
    <View style={styles.body}>
      <SafeAreaView style={styles.safeArea}>
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
              <Text style={styles.controlText}>⚡︎</Text>
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
              <AppButton title="Allow camera" onPress={requestPermission} />
            )}
          </View>
        )}

        {/* film counter */}
        <View style={styles.counterRow}>
          <View style={styles.counterWindow}>
            <Text style={styles.counterText}>{String(totalShots).padStart(2, '0')}</Text>
          </View>
          <Text style={styles.counterLabel}>shots on your roll</Text>
        </View>

        {/* shutter */}
        <View style={styles.shutterRow}>
          <Pressable
            onPress={snap}
            disabled={needsPermission}
            style={({ pressed }) => [
              styles.shutterOuter,
              pressed && styles.shutterPressed,
              needsPermission && styles.shutterDisabled,
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
      </SafeAreaView>

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
    borderColor: ACCENT,
  },
  controlText: {
    color: '#E6E6E9',
    fontSize: 18,
  },
  brand: {
    color: '#6E6E76',
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
  viewfinderFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0D',
  },
  fallbackText: {
    color: '#6E6E76',
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
    backgroundColor: '#0B0B0D',
    borderWidth: 1,
    borderColor: TRIM,
    borderRadius: 8,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  counterText: {
    color: '#F5D90A',
    fontFamily: Fonts.mono,
    fontSize: 44,
    fontVariant: ['tabular-nums'],
  },
  counterLabel: {
    color: '#6E6E76',
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
    color: '#6E6E76',
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  statusFailed: {
    color: '#E5484D',
  },
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
});
