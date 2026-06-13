import type { Palette } from './types';

/**
 * "Film lab" — the original scheme. Warm near-blacks, one loud acid-green
 * accent, true black for photo-viewing surfaces.
 */
export const filmLab: Palette = {
  background: '#0C0A09',
  backgroundElement: '#1C1917',
  backgroundSelected: '#292524',
  border: '#2E2A25',
  text: '#FAF7F2',
  textSecondary: '#8F887F',
  accent: '#D4FF3F',
  onAccent: '#15170A',
  danger: '#FF4D3D',

  scrim: 'rgba(0,0,0,0.3)',
  scrimStrong: 'rgba(0,0,0,0.6)',

  photoBackdrop: '#000',
  onPhotoBackdrop: '#fff',

  cameraBody: '#16130F',
  cameraBodyEdge: '#2A241D',

  /** Muted film-stock tones — readable against the dark background. */
  avatarTones: ['#E8C170', '#A3B18A', '#C97B63', '#7FA8C9', '#B08BBB', '#D4A5A5'],
  onAvatarTone: '#15130C',

  posterPaper: '#FAF7F2',
  posterInk: '#15130C',
};
