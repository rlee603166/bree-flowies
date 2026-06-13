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
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

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


/** Max faces shown in the top-bar live stack before collapsing to "+N". */
const MAX_FACES = 3;

/** The finder is a 3:4 portrait box pinned to the top — matching the 720×960 capture. */
const FINDER_ASPECT = 4 / 3; // height / width
/** Height of the title header band that sits above the finder. */
const HEADER_H = 52;
/** Corner radius of the finder card, echoing the iPhone's screen corners. */
const FINDER_RADIUS = 36;
/** Amber/yellow the flash glyph turns when armed — a fixed hardware signal color. */
const FLASH_ON = '#FFD60A';

/** Hold the shutter past this to start a clip instead of taking a frame. */
const HOLD_MS = 300;
/** Clips cap out here (seconds) — also enforced natively via maxDuration. */
const MAX_CLIP_SECONDS = 10;
/**
 * Hard byte ceiling for a clip, enforced natively via maxFileSize so a clip can
 * never exceed the `photos` storage bucket's size limit (set a touch below it
 * to leave headroom for the moov-atom finalize). Recording stops if hit.
 */
const MAX_CLIP_BYTES = 24 * 1024 * 1024;
/**
 * iOS honors `videoQuality` only for the 4:3 stop, so we constrain size on iOS
 * through the H.264 codec + an explicit bitrate instead (videoBitrate needs a
 * codec set on recordAsync). 720p H.264 @ 3 Mbps ≈ ~3.75 MB for a 10s clip —
 * small, quick to upload on party LTE, and universally playable in the album.
 */
const VIDEO_BITRATE = 3_000_000;
const VIDEO_CODEC = 'avc1'; // H.264

/** Flash cycles like the native camera: off -> auto -> on. */
const FLASH_CYCLE: FlashMode[] = ['off', 'auto', 'on'];

// Perimeter progress arc around the shutter — fills over MAX_CLIP_SECONDS.
const RING_SIZE = 96;
const RING_STROKE = 4;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_R;
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);

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
  if (ultraWide) stops.push({ label: '.5×', zoom: 0, lens: ultraWide });
  // 1× is the default wide lens with no digital crop.
  stops.push({ label: '1×', zoom: 0 });
  if (telephoto) stops.push({ label: '3×', zoom: 0, lens: telephoto });
  else stops.push({ label: '2×', zoom: 0.05 }); // modest digital crop, device-dependent
  return stops;
}

const fmtClip = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function CameraScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const userId = useUserId();

  const insets = useSafeAreaInsets();
  // 3:4 finder, now sitting below a title header; the chin holds everything below.
  const { width: screenWidth } = useWindowDimensions();
  const finderHeight = Math.round(screenWidth * FINDER_ASPECT);
  const finderTop = insets.top + HEADER_H;
  const cameraRef = useRef<CameraView>(null);
  const capturing = useRef(false);
  // Hold-to-record state that must survive re-renders / stale closures:
  // `recordStartedRef` = native recordAsync is actually rolling; `releasedRef`
  // = the finger has come up. Together they close the race where a release
  // lands before recording has begun and gets silently dropped.
  const recordStartedRef = useRef(false);
  const releasedRef = useRef(false);
  const [flashAnim] = useState(() => new Animated.Value(0));
  const [recordAnim] = useState(() => new Animated.Value(0)); // shutter morph: 0 disc → 1 red square
  // Perimeter arc fill (0→1 over the 10s cap). Driven on the UI thread via
  // Reanimated so it sweeps smoothly even while the camera reconfigures.
  const progress = useSharedValue(0);
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRC * (1 - progress.value),
  }));

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
    releasedRef.current = false;
    recordStartedRef.current = false;
    setRecSeconds(0);
    // Switching into video mode reconfigures the native capture session.
    // recordAsync must wait for it to come back ready — starting mid-reconfigure
    // yields a clip that ignores BOTH stopRecording() and maxDuration. Drop
    // `cameraReady` now; onCameraReady flips it back when the video session is up
    // (the timeout is a fallback in case the event doesn't re-fire on this OS).
    setCameraReady(false);
    setRecording(true);
    setTimeout(() => setCameraReady(true), 700);
    Animated.timing(recordAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  // Finger lifted. If native recording is already rolling, stop it now; if the
  // capture session is still spinning up, just flag it — the record effect
  // stops the clip the instant it actually starts. Reading refs (not the
  // `recording` state) avoids the stale-closure case where this handler still
  // thinks we aren't recording yet.
  const stopRecording = () => {
    releasedRef.current = true;
    if (recordStartedRef.current) cameraRef.current?.stopRecording();
  };

  useEffect(() => {
    // Gate on cameraReady: the video-mode session must be fully up before we
    // start, or stopRecording()/maxDuration silently no-op on the clip.
    if (!recording || !cameraReady || FAKE_CAMERA) return;
    const cam = cameraRef.current;
    if (!cam) return;
    let cancelled = false;
    const resetUI = () => {
      setRecording(false);
      Animated.timing(recordAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    };
    (async () => {
      // Released before video mode even applied — never start the clip.
      if (releasedRef.current) {
        resetUI();
        return;
      }
      try {
        recordStartedRef.current = true;
        const recordPromise = cam.recordAsync({
          maxDuration: MAX_CLIP_SECONDS,
          maxFileSize: MAX_CLIP_BYTES,
          codec: VIDEO_CODEC, // required for videoBitrate to take effect on iOS
        });
        // Released during the brief mode-switch/startup window: native may not
        // have begun capturing yet (an immediate stop would be dropped), so
        // give it a beat, then stop. recordPromise resolves once it lands.
        if (releasedRef.current) setTimeout(() => cam.stopRecording(), 350);
        const video = await recordPromise;
        if (!cancelled && video?.uri) {
          enqueueVideo({ eventId, userId, uri: video.uri });
          setCounts((prev) => ({ ...prev, [userId]: (prev[userId] ?? 0) + 1 }));
        }
      } catch {
        // recording failed to start/save; fall through and reset the UI
      } finally {
        recordStartedRef.current = false;
        if (!cancelled) resetUI();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recording, cameraReady, eventId, userId, recordAnim]);

  // Recording clock + 10s safety stop (belt to maxDuration's braces).
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

  // Sweep the perimeter arc 0→full over the 10s cap while recording; snap it
  // back the moment recording stops (early release or the cap).
  useEffect(() => {
    if (!recording) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: MAX_CLIP_SECONDS * 1000,
      easing: Easing.linear,
    });
    return () => cancelAnimation(progress);
  }, [recording, progress]);

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

  // Shutter morph, all native-driver (scale + opacity) so it stays smooth even
  // while flipping into video mode briefly blocks the JS thread: the white ring
  // swells, the disc fades out, and a red rounded square forms in its place.
  const ringScale = {
    transform: [{ scale: recordAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
  };
  const discStyle = {
    opacity: recordAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  };
  const squareStyle = {
    opacity: recordAnim,
    transform: [{ scale: recordAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
  };

  return (
    <View style={styles.body}>
      {/* title header — roll context pill, now sitting above the finder */}
      <View style={[styles.header, { top: insets.top, height: HEADER_H }]} pointerEvents="none">
        <View style={styles.contextPill}>
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
      </View>

      {/* 3:4 finder — rounded card below the header; controls overlay its corners */}
      <View style={[styles.finder, { top: finderTop, height: finderHeight }]}>
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
            videoQuality="720p"
            videoBitrate={VIDEO_BITRATE}
            mute={!micGranted}
            zoom={stop?.zoom ?? 0}
            selectedLens={stop?.lens}
            onCameraReady={onCameraReady}
            onAvailableLensesChanged={({ lenses }) => lenses.length && applyLenses(lenses)}
          />
        )}

        {/* top overlay — exit (corner) · contributor faces (corner) */}
        <View style={styles.viewportTop}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.chip}>
            <Text style={styles.chipGlyph}>✕</Text>
          </Pressable>

          <View style={styles.faces}>
            {faces.length > 0 && (
              <>
                <AvatarStack people={faces.slice(0, MAX_FACES)} size={28} />
                {overflow > 0 && <Text style={styles.facesOverflow}>+{overflow}</Text>}
              </>
            )}
          </View>
        </View>

        {/* bottom overlay — flip (corner) · zoom pills (centered) */}
        {!needsPermission && (
          <View style={styles.viewportBottom}>
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
              <View style={styles.spacer} />
            )}

            {/* transparent spacer — balances the flip chip so zoom stays centered */}
            <View style={styles.spacer} />
          </View>
        )}
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

      {/* chin — the black area below the finder, holding the controls + shutter.
          Centered so the cluster sits comfortably on every screen size. */}
      <View style={[styles.chin, { top: finderTop + finderHeight, paddingBottom: insets.bottom + Spacing.three }]}>
        {/* deck — VAULT · SHUTTER · FLASH */}
        <View style={styles.deck}>
          {/* the hidden vault: the native thumbnail slot, repurposed — photos stay
              invisible until develop, so this shows the live group shot total */}
          <View style={styles.deckSlot}>
            <View style={styles.vault}>
              <Text style={styles.vaultCount}>{vaultTotal}</Text>
              <Text style={styles.vaultLabel}>VAULT</Text>
            </View>
          </View>

          <View style={styles.deckSlot}>
            <View style={styles.shutterWrap}>
              {recording && (
                <Svg
                  width={RING_SIZE}
                  height={RING_SIZE}
                  style={styles.progressRing}
                  pointerEvents="none"
                >
                  <AnimatedCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_R}
                    fill="none"
                    stroke={Colors.recording}
                    strokeWidth={RING_STROKE}
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRC}
                    animatedProps={ringProps}
                    // start at 12 o'clock and sweep clockwise
                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                  />
                </Svg>
              )}
              <Pressable
                onPress={() => !recording && snap()}
                onLongPress={startRecording}
                onPressOut={stopRecording}
                delayLongPress={HOLD_MS}
                disabled={shutterDisabled}
                style={({ pressed }) => [
                  styles.shutterHit,
                  pressed && !recording && styles.shutterPressed,
                  shutterDisabled && styles.shutterDisabled,
                ]}
              >
                <Animated.View style={[styles.shutterRing, ringScale]}>
                  <View style={styles.shutterInner}>
                    <Animated.View style={[styles.shutterDisc, discStyle]} />
                    <Animated.View style={[styles.shutterSquare, squareStyle]} />
                  </View>
                </Animated.View>
              </Pressable>
            </View>
          </View>

          <View style={styles.deckSlot}>
            <Pressable onPress={cycleFlash} hitSlop={12} disabled={recording} style={styles.flash}>
              <Text style={[styles.flashGlyph, flash !== 'off' && styles.flashGlyphOn]}>⚡︎</Text>
              {flash === 'auto' && <Text style={styles.flashAuto}>A</Text>}
            </Pressable>
          </View>
        </View>
      </View>

      {/* upload failures — a floating toast just below the finder; absolute so it
          never shifts the deck. Successful uploads stay silent. */}
      {failed > 0 && (
        <View
          style={[styles.toastWrap, { top: finderTop + finderHeight + Spacing.three }]}
          pointerEvents="box-none"
        >
          <Pressable onPress={retryFailedUploads} hitSlop={8} style={styles.toast}>
            <Text style={styles.toastText}>{failed} didn’t save — tap to retry</Text>
          </Pressable>
        </View>
      )}

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
// Inset that nestles a round CHIP concentric inside the finder's corner arc, so
// the gap is even along both straight edges and the rounded corner (36 − 21 = 15).
const CORNER_INSET = FINDER_RADIUS - CHIP / 2;

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: Colors.photoBackdrop,
  },

  // title header — centered roll context pill, sitting above the finder
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  // top overlay — exit chip (corner) · faces (corner), nestled in the finder
  viewportTop: {
    position: 'absolute',
    top: CORNER_INSET,
    left: CORNER_INSET,
    right: CORNER_INSET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  // bottom overlay — flip chip (corner) · zoom pills (centered)
  viewportBottom: {
    position: 'absolute',
    bottom: CORNER_INSET,
    left: CORNER_INSET,
    right: CORNER_INSET,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  // the roll context sits in a translucent pill, matching the other overlay chrome.
  // maxWidth lets it use the full header width, then the lines ellipsize cleanly.
  contextPill: {
    maxWidth: '100%',
    backgroundColor: Colors.scrimStrong,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
    backgroundColor: Colors.recording,
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
  // invisible CHIP-width placeholder that keeps the zoom cluster centered
  spacer: {
    width: CHIP,
  },

  // 3:4 finder — full-bleed width, offset below the status bar (top set inline),
  // clipped with a rounded bottom where it meets the black chin
  finder: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderRadius: FINDER_RADIUS,
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

  // chin — the black region below the 3:4 finder. Holds the control cluster,
  // vertically centered so it adapts to any screen size.
  chin: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
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
    color: Colors.onPhotoBackdrop,
    fontSize: 13,
  },

  // deck — VAULT · SHUTTER · FLASH row, the bottom of the chin cluster
  deck: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    color: Colors.onPhotoBackdrop,
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

  // shutter — fixed-size slot holding the SVG progress arc, a white ring that
  // swells, and an inner that morphs from a white disc to a red square
  shutterWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  shutterHit: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: Colors.onPhotoBackdrop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // resting white disc — fades out as the red square fades in
  shutterDisc: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 31,
    backgroundColor: Colors.onPhotoBackdrop,
  },
  // recording red square — scales + fades in over the disc
  shutterSquare: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.recording,
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
    color: FLASH_ON,
  },
  flashAuto: {
    color: FLASH_ON,
    fontFamily: Fonts.monoBold,
    fontSize: 11,
    marginLeft: 1,
    marginTop: -6,
  },

  // floating failure toast — absolute, so it overlays without shifting the deck
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: Colors.scrimStrong,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  toastText: {
    color: Colors.danger,
    fontFamily: Fonts.mono,
    fontSize: 12,
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
    color: Colors.onPhotoBackdrop,
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
