import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraType,
  type FlashMode,
} from 'expo-camera';
import * as Device from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/app-button';
import { AvatarStack } from '@/components/ui/avatar';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { getEvent, getGroup, listMembers, shotCounts, type Member } from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { createFakePhotoBytes } from '@/lib/fake-photo';
import { displayName } from '@/lib/names';
import { onEventChange, onGroupActivity, type ShotEvent } from '@/lib/realtime';
import {
  enqueuePhoto,
  enqueueVideo,
  getUploads,
  retryFailedUploads,
  subscribeToUploads,
} from '@/lib/upload-queue';

// Simulators have no camera; in dev we fake the shutter so the whole
// capture -> develop -> album flow stays testable.
const FAKE_CAMERA = __DEV__ && !Device.isDevice;

const ACCENT = Colors.accent;
const REC = '#FF3B30'; // recording red — a fixed signal color, not a theme accent

/** Max faces shown in the top-bar live stack before collapsing to "+N". */
const MAX_FACES = 3;

/** Height of the black control deck — the finder's rounded bottom rests on it. */
const DECK_HEIGHT = 110;
/** Bottom-corner radius of the finder, echoing the iPhone's screen corners. */
const FINDER_RADIUS = 36;

/** Hold the shutter past this to start a clip instead of taking a frame. */
const HOLD_MS = 300;
/** Clips cap out here (seconds) — also enforced natively via maxDuration. */
const MAX_CLIP_SECONDS = 30;

/** Flash cycles like the native camera: off -> auto -> on. */
const FLASH_CYCLE: FlashMode[] = ['off', 'auto', 'on'];

/**
 * A selectable zoom "stop" on the native pill cluster. expo-camera can't report
 * true optical factors, so this is best-effort: prefer a physical lens when iOS
 * lists one (ultra-wide / telephoto), fall back to a normalized digital `zoom`.
 */
type ZoomStop = { label: string; zoom: number; lens?: string };

/** Shown in the simulator (no real camera) just so the layout matches the design. */
const FAKE_STOPS: ZoomStop[] = [
  { label: '.5', zoom: 0 },
  { label: '1×', zoom: 0 },
  { label: '3', zoom: 0 },
];

/** Build the visible pill set from the lens ids iOS reports for this device. */
function buildZoomStops(lenses: string[]): ZoomStop[] {
  const find = (needle: string) => lenses.find((l) => l.toLowerCase().includes(needle));
  const ultraWide = find('ultra');
  const telephoto = find('tele');

  const stops: ZoomStop[] = [];
  if (ultraWide) stops.push({ label: '.5', zoom: 0, lens: ultraWide });
  // 1× is the default wide lens with no digital crop.
  stops.push({ label: '1×', zoom: 0 });
  if (telephoto) stops.push({ label: '3', zoom: 0, lens: telephoto });
  else stops.push({ label: '2', zoom: 0.05 }); // modest digital crop, device-dependent
  return stops;
}

const fmtClip = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function CameraScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const userId = useUserId();

  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const capturing = useRef(false);
  const [flashAnim] = useState(() => new Animated.Value(0));
  const [recordAnim] = useState(() => new Animated.Value(0)); // shutter morph: 0 disc → 1 red square

  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [rollClosed, setRollClosed] = useState(false);

  // Video: holding the shutter records a clip. `recording` flips the camera into
  // video mode (via the `mode` prop) and the effect below drives recordAsync.
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  // Zoom: a dynamic set of stops from the device's lenses, plus the active one.
  const [zoomStops, setZoomStops] = useState<ZoomStop[]>(FAKE_CAMERA ? FAKE_STOPS : []);
  const [activeZoom, setActiveZoom] = useState(FAKE_CAMERA ? 1 : 0); // index into zoomStops
  // The lens set we last built stops for — guards against the snap-back where
  // every onAvailableLensesChanged re-emit reset the active pill to 1×.
  const builtFor = useRef<CameraType | null>(null);

  const [eventName, setEventName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  // Per-person shot tallies for this roll, keyed by user id — the live group
  // total. Seeded from shot_counts; ticked locally for our own shots and via
  // the group broadcast for everyone else's. Mirrors group/[id].tsx.
  const [counts, setCounts] = useState<Record<string, number>>({});

  const uploads = useSyncExternalStore(subscribeToUploads, getUploads);
  const eventUploads = uploads.filter((u) => u.eventId === eventId);
  const uploading = eventUploads.filter((u) => u.status === 'uploading').length;
  const failed = eventUploads.filter((u) => u.status === 'failed').length;

  // Event + group context: title, group name, roster, seed counts. The group
  // id comes off the event, so this is one dependent chain on mount.
  useEffect(() => {
    let cancelled = false;
    getEvent(eventId)
      .then(async (event) => {
        if (cancelled) return;
        setEventName(event.name);
        const [group, roster, seedCounts] = await Promise.all([
          getGroup(event.group_id),
          listMembers(event.group_id),
          shotCounts(eventId),
        ]);
        if (cancelled) return;
        setGroupName(group.name);
        setMembers(roster);
        setCounts(Object.fromEntries(seedCounts.map((c) => [c.user_id, c.shots])));

        // Live group total: bump everyone *except* us — our own shots are
        // counted optimistically in snap(), so skipping our echo here avoids
        // a double count.
        return onGroupActivity(event.group_id, {
          onEventsChange: () => {},
          onShot: (shot: ShotEvent) => {
            if (shot.event_id !== eventId || shot.taken_by === userId) return;
            setCounts((prev) => ({ ...prev, [shot.taken_by]: (prev[shot.taken_by] ?? 0) + 1 }));
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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

  // Lens discovery: build the pill set once per active camera. Re-emits for the
  // *same* facing are ignored so the user's pick isn't reset back to 1×.
  const applyLenses = (lenses: string[]) => {
    if (builtFor.current === facing) return;
    builtFor.current = facing;
    const stops = buildZoomStops(lenses);
    setZoomStops(stops);
    setActiveZoom(Math.max(0, stops.findIndex((s) => s.label === '1×')));
  };

  const onCameraReady = async () => {
    setCameraReady(true);
    try {
      const lenses = await cameraRef.current?.getAvailableLensesAsync();
      if (lenses && lenses.length) applyLenses(lenses);
    } catch {
      // older device / no enumeration — leave whatever stops we have
    }
  };

  const flipCamera = () => {
    // Front/back have different lenses — let the next ready/emit rebuild stops.
    builtFor.current = null;
    setFacing(facing === 'back' ? 'front' : 'back');
  };

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
      setCounts((prev) => ({ ...prev, [userId]: (prev[userId] ?? 0) + 1 }));
    } catch {
      // missed shot; the next press tries again, just like a real dispo jam
    } finally {
      capturing.current = false;
    }
  };

  // Hold-to-record. Flipping `recording` switches the CameraView into video mode;
  // the effect waits for that to apply, then drives recordAsync. Release (or the
  // native maxDuration) resolves the promise, which clears `recording`.
  const startRecording = async () => {
    if (FAKE_CAMERA || rollClosed || recording || !cameraReady) return;
    if (micPermission && !micPermission.granted && micPermission.canAskAgain) {
      await requestMicPermission();
    }
    setRecSeconds(0);
    setRecording(true);
    Animated.timing(recordAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  };

  const stopRecording = () => {
    if (recording) cameraRef.current?.stopRecording();
  };

  useEffect(() => {
    if (!recording || FAKE_CAMERA) return;
    const cam = cameraRef.current;
    if (!cam) return;
    let cancelled = false;
    (async () => {
      try {
        const video = await cam.recordAsync({ maxDuration: MAX_CLIP_SECONDS });
        if (!cancelled && video?.uri) {
          enqueueVideo({ eventId, userId, uri: video.uri });
          setCounts((prev) => ({ ...prev, [userId]: (prev[userId] ?? 0) + 1 }));
        }
      } catch {
        // recording failed to start/save; fall through and reset the UI
      } finally {
        if (!cancelled) {
          setRecording(false);
          Animated.timing(recordAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recording, eventId, userId, recordAnim]);

  // Recording clock + 30s safety stop (belt to maxDuration's braces).
  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setRecSeconds(s);
      if (s >= MAX_CLIP_SECONDS) cameraRef.current?.stopRecording();
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  const cycleFlash = () =>
    setFlash((prev) => FLASH_CYCLE[(FLASH_CYCLE.indexOf(prev) + 1) % FLASH_CYCLE.length]);

  const needsPermission = !FAKE_CAMERA && (!permission || !permission.granted);
  const shutterDisabled = needsPermission || rollClosed;
  const stop = zoomStops[activeZoom];
  const showZoom = zoomStops.length > 1 && !recording;
  const micGranted = !!micPermission?.granted;

  const vaultTotal = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts]
  );
  // Friends live in the roll: everyone who's contributed a shot, in roster order,
  // capped with a "+N" overflow.
  const faces = useMemo(() => {
    const contributors = members.filter((m) => (counts[m.user_id] ?? 0) > 0);
    return contributors.map((m) => ({ name: displayName(m), uri: m.avatar_url }));
  }, [members, counts]);
  const overflow = Math.max(0, faces.length - MAX_FACES);

  // Shutter inner morphs from a white disc to a small red square while recording.
  const innerStyle = {
    width: recordAnim.interpolate({ inputRange: [0, 1], outputRange: [62, 26] }),
    height: recordAnim.interpolate({ inputRange: [0, 1], outputRange: [62, 26] }),
    borderRadius: recordAnim.interpolate({ inputRange: [0, 1], outputRange: [31, 6] }),
    backgroundColor: recordAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [Colors.onPhotoBackdrop, REC],
    }),
  };

  return (
    <View style={styles.body}>
      {/* full-bleed finder — edge to edge up top, rounded where it meets the deck */}
      <View style={[styles.finder, { bottom: insets.bottom + DECK_HEIGHT }]}>
        {needsPermission ? (
          <View style={styles.finderFallback}>
            <Text style={styles.fallbackText}>no access</Text>
          </View>
        ) : FAKE_CAMERA ? (
          <View style={styles.finderFallback}>
            <Text style={styles.fallbackText}>simulator</Text>
          </View>
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.cameraFill}
            facing={facing}
            flash={flash}
            mode={recording ? 'video' : 'picture'}
            mute={!micGranted}
            zoom={stop?.zoom ?? 0}
            selectedLens={stop?.lens}
            onCameraReady={onCameraReady}
            onAvailableLensesChanged={({ lenses }) => lenses.length && applyLenses(lenses)}
          />
        )}
      </View>

      {/* top bar — exit · roll context (or recording clock) · contributor faces */}
      <View style={[styles.topRow, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.chip}>
          <Text style={styles.chipGlyph}>✕</Text>
        </Pressable>

        <View style={styles.context} pointerEvents="none">
          {recording ? (
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>{fmtClip(recSeconds)}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.eventName} numberOfLines={1}>
                {eventName.toUpperCase()}
              </Text>
              {groupName !== '' && (
                <Text style={styles.groupName} numberOfLines={1}>
                  {groupName}
                </Text>
              )}
            </>
          )}
        </View>

        <View style={styles.faces}>
          {faces.length > 0 ? (
            <>
              <AvatarStack people={faces.slice(0, MAX_FACES)} size={28} />
              {overflow > 0 && <Text style={styles.facesOverflow}>+{overflow}</Text>}
            </>
          ) : (
            <Text style={styles.facesEmpty}>—</Text>
          )}
        </View>
      </View>

      {/* permission prompt floats over the dead finder */}
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

      {/* controls row — flip · zoom pills */}
      <View style={[styles.controlsRow, { bottom: insets.bottom + 188 }]}>
        <Pressable onPress={flipCamera} hitSlop={10} disabled={recording} style={styles.chip}>
          <Text style={styles.chipGlyph}>⟲</Text>
        </Pressable>

        {showZoom ? (
          <View style={styles.zoomCluster}>
            {zoomStops.map((s, i) => {
              const active = i === activeZoom;
              return (
                <Pressable
                  key={s.label}
                  onPress={() => setActiveZoom(i)}
                  hitSlop={6}
                  style={[styles.zoomPill, active && styles.zoomPillActive]}
                >
                  <Text style={[styles.zoomText, active && styles.zoomTextActive]}>
                    {active ? s.label : s.label.replace('×', '')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.chip} pointerEvents="none" />
        )}

        {/* balances the flip button, keeping the zoom cluster centered */}
        <View style={styles.chip} pointerEvents="none" />
      </View>

      {/* bottom deck — VAULT · SHUTTER · FLASH */}
      <View style={[styles.deck, { paddingBottom: insets.bottom + Spacing.three }]}>
        {/* the hidden vault: the native thumbnail slot, repurposed — photos stay
            invisible until develop, so this shows the live group shot total */}
        <View style={styles.deckSlot}>
          <View style={styles.vault}>
            <Text style={styles.vaultCount}>{vaultTotal}</Text>
            <Text style={styles.vaultLabel}>VAULT</Text>
          </View>
        </View>

        <View style={styles.deckSlot}>
          <Pressable
            onPress={() => !recording && snap()}
            onLongPress={startRecording}
            onPressOut={stopRecording}
            delayLongPress={HOLD_MS}
            disabled={shutterDisabled}
            style={({ pressed }) => [
              styles.shutterOuter,
              recording && styles.shutterOuterRec,
              pressed && !recording && styles.shutterPressed,
              shutterDisabled && styles.shutterDisabled,
            ]}
          >
            <Animated.View style={innerStyle} />
          </Pressable>
        </View>

        <View style={styles.deckSlot}>
          <Pressable onPress={cycleFlash} hitSlop={12} disabled={recording} style={styles.flash}>
            <Text style={[styles.flashGlyph, flash !== 'off' && styles.flashGlyphOn]}>⚡︎</Text>
            {flash === 'auto' && <Text style={styles.flashAuto}>A</Text>}
          </Pressable>
        </View>
      </View>

      {/* upload status — system feedback, floats above the deck */}
      <View style={[styles.statusRow, { bottom: insets.bottom + 150 }]}>
        {uploading > 0 && <Text style={styles.statusText}>↑ saving {uploading}…</Text>}
        {failed > 0 && (
          <Pressable onPress={retryFailedUploads} hitSlop={8}>
            <Text style={[styles.statusText, styles.statusFailed]}>
              {failed} didn’t save — tap to retry
            </Text>
          </Pressable>
        )}
        {uploading === 0 && failed === 0 && (
          <Text style={styles.statusText}>
            {recording ? 'recording — release to stop' : 'tap to shoot · hold for video 🎞️'}
          </Text>
        )}
      </View>

      {/* roll closed — soft block: shutter is dead, they tap out when ready */}
      {rollClosed && (
        <View style={[styles.closedOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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

const CHIP = 42;

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: Colors.photoBackdrop,
  },

  // top bar — floats over the top of the full-bleed finder
  topRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
    gap: Spacing.three,
  },
  context: {
    flex: 1,
    alignItems: 'center',
  },
  eventName: {
    color: Colors.onPhotoBackdrop,
    fontFamily: Fonts.monoBold,
    fontSize: 14,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  groupName: {
    color: Colors.onPhotoBackdrop,
    opacity: 0.7,
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 2,
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  recDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: REC,
  },
  recText: {
    color: Colors.onPhotoBackdrop,
    fontFamily: Fonts.monoBold,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  faces: {
    minWidth: CHIP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  facesOverflow: {
    color: Colors.onPhotoBackdrop,
    fontFamily: Fonts.mono,
    fontSize: 11,
  },
  facesEmpty: {
    color: Colors.onPhotoBackdrop,
    opacity: 0.6,
    fontFamily: Fonts.mono,
    fontSize: 16,
  },

  // translucent gray circle controls (native style)
  chip: {
    width: CHIP,
    height: CHIP,
    borderRadius: CHIP / 2,
    backgroundColor: Colors.scrimStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipGlyph: {
    color: Colors.onPhotoBackdrop,
    fontSize: 18,
  },

  // full-bleed finder — pinned under the top edge, clipped with rounded bottom
  finder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderBottomLeftRadius: FINDER_RADIUS,
    borderBottomRightRadius: FINDER_RADIUS,
    backgroundColor: '#000',
  },
  cameraFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  finderFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    position: 'absolute',
    left: Spacing.five,
    right: Spacing.five,
    top: '42%',
    gap: Spacing.three,
  },

  // controls row (flip · zoom) — floats just above the deck
  controlsRow: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoomCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Colors.scrimStrong,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  zoomPill: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomPillActive: {
    backgroundColor: Colors.scrimStrong,
  },
  zoomText: {
    color: Colors.onPhotoBackdrop,
    fontFamily: Fonts.monoBold,
    fontSize: 12,
  },
  zoomTextActive: {
    color: ACCENT,
    fontSize: 13,
  },

  // bottom deck — solid dark bar pinned to the bottom
  deck: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    backgroundColor: Colors.photoBackdrop,
  },
  deckSlot: {
    flex: 1,
    alignItems: 'center',
  },

  // vault — the repurposed thumbnail slot, group shot total
  vault: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.backgroundElement,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultCount: {
    color: ACCENT,
    fontFamily: Fonts.monoBold,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    lineHeight: 22,
  },
  vaultLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1,
  },

  // shutter — native white double-ring, morphs to a red square while recording
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: Colors.onPhotoBackdrop,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterOuterRec: {
    borderColor: REC,
  },
  shutterPressed: {
    transform: [{ scale: 0.93 }],
  },
  shutterDisabled: {
    opacity: 0.4,
  },

  // flash toggle — dark circle, bolt + auto badge
  flash: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.scrimStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  flashGlyph: {
    color: Colors.onPhotoBackdrop,
    fontSize: 20,
  },
  flashGlyphOn: {
    color: ACCENT,
  },
  flashAuto: {
    color: ACCENT,
    fontFamily: Fonts.monoBold,
    fontSize: 11,
    marginLeft: 1,
    marginTop: -6,
  },

  statusRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusText: {
    color: Colors.onPhotoBackdrop,
    opacity: 0.8,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  statusFailed: {
    color: Colors.danger,
    opacity: 1,
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
    backgroundColor: Colors.background,
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
