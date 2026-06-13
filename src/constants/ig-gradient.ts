/**
 * Instagram's signature story-ring gradient (warm yellow → orange → magenta →
 * purple → blue). Used by `ui/story-ring.tsx` to ring "live" groups. These are
 * IG brand colors, intentionally palette-independent — they read the same on any
 * dark background — so they live here rather than in a `Palette` token.
 */
export const IG_STORY_GRADIENT = ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5'] as const;
