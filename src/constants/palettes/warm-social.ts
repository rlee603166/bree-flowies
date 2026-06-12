import type { Palette } from './types';

/**
 * "Warm social" — same dark-room intimacy, but warmer and friendlier than the
 * clinical black+neon. Espresso-brown surfaces, warm cream type, and a soft
 * sunset-coral accent in place of the acid green. Photo surfaces stay true
 * black so the images themselves carry the color.
 */
export const warmSocial: Palette = {
  background: '#161210',
  backgroundElement: '#241D19',
  backgroundSelected: '#322822',
  border: '#3A2F28',
  text: '#FBF3EA',
  textSecondary: '#A39288',
  accent: '#FF8A5B',
  onAccent: '#2A1206',
  danger: '#FF5247',

  scrim: 'rgba(0,0,0,0.35)',
  scrimStrong: 'rgba(0,0,0,0.65)',

  photoBackdrop: '#000',
  onPhotoBackdrop: '#fff',

  /** Warm, slightly richer tones to match the espresso base. */
  avatarTones: ['#E8A15B', '#C9956B', '#D98E7A', '#B98CA0', '#8FA08A', '#D4A5A5'],
  onAvatarTone: '#241008',

  posterPaper: '#FBF3EA',
  posterInk: '#241008',
};
