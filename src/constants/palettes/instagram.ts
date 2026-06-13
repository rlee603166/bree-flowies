import type { Palette } from './types';

/**
 * "Instagram" — IG's real dark-mode palette. Neutral true-black surfaces,
 * white type, hairline #262626 borders, and IG's blue (#0095F6) as the single
 * loud accent in place of the acid green. Photo surfaces stay true black so the
 * images carry the color. The signature multicolor story ring is *not* a single
 * token — it lives in `constants/ig-gradient.ts` and the story-ring component.
 */
export const instagram: Palette = {
  background: '#000000',
  backgroundElement: '#121212',
  backgroundSelected: '#1C1C1C',
  border: '#262626',
  text: '#FFFFFF',
  textSecondary: '#A8A8A8',
  accent: '#0095F6',
  onAccent: '#FFFFFF',
  danger: '#ED4956',

  scrim: 'rgba(0,0,0,0.5)',
  scrimStrong: 'rgba(0,0,0,0.7)',

  photoBackdrop: '#000',
  onPhotoBackdrop: '#fff',

  cameraBody: '#0A0A0A',
  cameraBodyEdge: '#262626',

  /** Saturated IG-ish tones for initial avatars. */
  avatarTones: ['#0095F6', '#D62976', '#FA7E1E', '#962FBF', '#4F5BD5', '#ED4956'],
  onAvatarTone: '#FFFFFF',

  posterPaper: '#FFFFFF',
  posterInk: '#000000',
};
