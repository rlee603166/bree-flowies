/**
 * "Film lab" theme — the app is dark-only by design (a darkroom).
 * Warm near-blacks, one loud acid-green accent, mono type for anything
 * that reads like camera hardware (counters, codes, timers, labels).
 */

export const Colors = {
  /** Page background — warm near-black, not pure black. */
  background: '#0C0A09',
  /** Cards / rows / inputs. */
  backgroundElement: '#1C1917',
  /** Pressed state of the above. */
  backgroundSelected: '#292524',
  /** Hairline borders around cards, inputs, camera controls. */
  border: '#2E2A25',
  text: '#FAF7F2',
  textSecondary: '#8F887F',
  /** Acid green — develop timers, live indicators, primary buttons. */
  accent: '#D4FF3F',
  /** Text/icons sitting on top of an accent-filled surface. */
  onAccent: '#15170A',
  danger: '#FF4D3D',
} as const;

export type ThemeColor = keyof typeof Colors;

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
