import { Platform } from 'react-native';

/**
 * Bridge to the local `video-crop` native module (modules/video-crop). It's
 * iOS-only and only linked after a dev-client rebuild, so the require is guarded:
 * on Android, web, or a stale JS bundle we fall back to passing the clip through
 * untouched rather than crashing.
 */
let mod: { cropTo3x4(uri: string): Promise<string> } | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../modules/video-crop/src/VideoCropModule').default;
  } catch {
    mod = null;
  }
}

/** Center-crop a recorded clip to 720×960 (3:4); no-op where the module is unavailable. */
export function cropVideoTo3x4(uri: string): Promise<string> {
  return mod ? mod.cropTo3x4(uri) : Promise.resolve(uri);
}
