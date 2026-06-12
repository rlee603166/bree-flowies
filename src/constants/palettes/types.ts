/**
 * Shape every palette must satisfy. Swap the active palette in
 * `src/constants/theme.ts` to recolor the whole app — every color the app
 * draws lives here, so a palette is a complete, self-contained scheme.
 */
export type Palette = {
  /** Page background — the base surface. */
  background: string;
  /** Cards / rows / inputs. */
  backgroundElement: string;
  /** Pressed state of the above. */
  backgroundSelected: string;
  /** Hairline borders around cards, inputs, camera controls. */
  border: string;
  text: string;
  textSecondary: string;
  /** The one loud accent — develop timers, live indicators, primary buttons. */
  accent: string;
  /** Text/icons sitting on top of an accent-filled surface. */
  onAccent: string;
  danger: string;

  /** Dim overlay behind the fab menu / transient layers. */
  scrim: string;
  /** Stronger dim behind modal bottom sheets. */
  scrimStrong: string;

  /** True photo-viewing surface (camera body, album, full-screen viewer). */
  photoBackdrop: string;
  /** Text/controls/flash drawn on top of `photoBackdrop`. */
  onPhotoBackdrop: string;

  /** Initial-avatar background tones, picked by name hash. */
  avatarTones: string[];
  /** The initial drawn on a colored avatar tone. */
  onAvatarTone: string;

  /** QR poster tile — an intentionally light "paper" artifact. */
  posterPaper: string;
  /** QR modules / dark ink on the poster paper. */
  posterInk: string;
};
