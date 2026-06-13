/**
 * The app is dark-only by design (a darkroom). The full color scheme lives in
 * one swappable palette — change `ACTIVE` below to recolor the entire app
 * (reload required; this is a design-time switch, not an in-app toggle).
 * Add new schemes under `palettes/` and register them in `palettes` here.
 *
 * Mono type is still used for anything that reads like camera hardware
 * (counters, codes, timers, labels) — see `Fonts` below.
 */
import { filmLab } from './palettes/film-lab';
import { instagram } from './palettes/instagram';
import type { Palette } from './palettes/types';
import { warmSocial } from './palettes/warm-social';

const palettes = { filmLab, warmSocial, instagram } satisfies Record<string, Palette>;

/** ← Swap this one value to play with different color schemes. */
const ACTIVE: keyof typeof palettes = 'instagram';

export const Colors: Palette = palettes[ACTIVE];

/** Single-color tokens only — excludes list-valued tokens like `avatarTones`. */
export type ThemeColor = {
  [K in keyof Palette]: Palette[K] extends string ? K : never;
}[keyof Palette];

/**
 * Family names as registered by useFonts in the root layout.
 * Custom fonts ship one file per weight — always pick the family,
 * never set fontWeight alongside these (Android ignores it).
 */
export const Fonts = {
  sans: 'SpaceGrotesk_500Medium',
  sansSemiBold: 'SpaceGrotesk_600SemiBold',
  sansBold: 'SpaceGrotesk_700Bold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  /** Cards, inputs, photo frames. */
  card: 20,
  /** Buttons. */
  pill: 999,
} as const;
