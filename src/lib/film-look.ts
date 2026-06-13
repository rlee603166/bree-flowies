/**
 * The "bree" film look: one signature effect baked into every captured photo
 * before it's uploaded — a warm flash / party-night disposable camera. Exposure
 * trim + filmic contrast + warm split-tone grade + hard flash vignette + grain +
 * chromatic fringing + warm highlight halation + an amber date stamp, so the
 * developed album reads like real film coming back from the lab.
 *
 * Runs headless (offscreen Skia surface) inside the upload queue — no on-screen
 * <Canvas> and no React tree. Every step is guarded: if Skia fails for any
 * reason we pass the original bytes straight through, because losing a photo to
 * a cosmetic effect is never acceptable.
 *
 * Produces two outputs: the `effectBytes` jpg the user sees (-> photos bucket)
 * and the untouched `rawBytes` (-> private originals bucket, see upload-queue).
 */
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import {
  BlendMode,
  FilterMode,
  ImageFormat,
  MipmapMode,
  Skia,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkTypeface,
} from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

export type FilmLookResult = { effectBytes: Uint8Array; rawBytes: Uint8Array };

/**
 * Every capture is normalized to this 3:4 portrait frame before the look is
 * baked in — the finder shoots 3:4, photos are stored 3:4, video is cropped to
 * match (see modules/video-crop). Small enough that the shader + blur stay cheap.
 */
const TARGET_W = 720;
const TARGET_H = 960;
const JPEG_QUALITY = 90;

// Tuning for the signature look: warm flash / party-night disposable camera,
// kept tasteful. These are the knobs to nudge against real photos.
const EXPOSURE = 0.94; // overall trim — the previous look read too bright
const GRAIN = 0.05;
const VIGNETTE = 0.72; // strong flash falloff so corners go dark
const CHROMA = 2; // radial R/B separation in working pixels at the corners
const HALATION_BLUR = 6; // sigma for the highlight bloom
const HALATION_ALPHA = 0.42; // bloom is highlight-only now, so it no longer lifts the frame

const FILM_SKSL = `
uniform shader image;
uniform float2 resolution;
uniform float  grainAmt;
uniform float  vignette;
uniform float  chroma;    // pixel offset at the corners
uniform float  exposure;  // overall brightness trim
uniform float  seed;      // per-photo so grain never repeats

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

half4 main(float2 xy) {
  float2 uv = xy / resolution;
  float2 toCenter = uv - 0.5;
  float  dist2 = dot(toCenter, toCenter);

  // chromatic fringing: push R outward, B inward, growing toward the edges
  float2 offsetPx = toCenter * chroma * (dist2 * 4.0);
  half  r = image.eval(xy + offsetPx).r;
  half4 base = image.eval(xy);
  half  b = image.eval(xy - offsetPx).b;
  half3 col = half3(r, base.g, b);

  // exposure trim — the previous look ran too bright
  col *= exposure;

  // filmic contrast with a toe: pivot below mid so shadows gain density
  col = clamp((col - 0.45) * 1.22 + 0.44, 0.0, 1.0);

  // warm orange flash / party grade via luma split-tone (red up, blue pulled)
  float luma = dot(col, half3(0.299, 0.587, 0.114));
  half3 shadowTint = half3(1.035, 0.995, 0.945); // warm shadows
  half3 highTint   = half3(1.075, 1.005, 0.875); // orange highlights, blue crushed
  col *= mix(shadowTint, highTint, smoothstep(0.15, 0.85, luma));

  // a touch of desaturation for the cheap-film feel
  col = mix(half3(luma), col, 0.93);

  // hard flash vignette: corners fall off dark
  float vig = smoothstep(0.85, 0.18, dist2);
  col *= mix(1.0, vig, vignette);

  // grain, a little stronger in the shadows where film shows it most
  float n = hash(uv * resolution + seed) - 0.5;
  col += n * grainAmt * (1.0 - 0.5 * luma);

  return half4(clamp(col, 0.0, 1.0), base.a);
}
`;

// Extracts warm-tinted highlights for the halation bloom; everything mid/dark
// comes out ~black so the blurred result adds glow only to genuine bright spots
// (real flash halation) instead of lifting the whole frame.
const HIGHLIGHT_SKSL = `
uniform shader image;

half4 main(float2 xy) {
  half4 c = image.eval(xy);
  float l = dot(c.rgb, half3(0.299, 0.587, 0.114));
  float t = smoothstep(0.75, 0.95, l);
  half3 bloom = c.rgb * t * half3(1.0, 0.90, 0.72); // warm amber glow
  return half4(bloom, 1.0);
}
`;

// Compile the shaders once; reuse across every photo.
const filmEffect = Skia.RuntimeEffect.Make(FILM_SKSL);
const highlightEffect = Skia.RuntimeEffect.Make(HIGHLIGHT_SKSL);

// The bundled SpaceMono ttf, loaded outside React and memoized at module scope.
// `SpaceMono_400Regular` is a require()'d Metro asset, so we resolve it through
// expo-asset to a real local file before reading its bytes.
let typefacePromise: Promise<SkTypeface | null> | null = null;
function getStampTypeface(): Promise<SkTypeface | null> {
  if (!typefacePromise) {
    typefacePromise = (async () => {
      try {
        const asset = Asset.fromModule(SpaceMono_400Regular);
        await asset.downloadAsync();
        if (!asset.localUri) return null;
        const bytes = await new File(asset.localUri).bytes();
        return Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes));
      } catch {
        return null;
      }
    })();
  }
  return typefacePromise;
}

/** Classic disposable-camera stamp, e.g. `'26 06 13`. */
function formatStamp(takenAt: string): string {
  const d = new Date(takenAt);
  if (Number.isNaN(d.getTime())) return '';
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `'${yy} ${mm} ${dd}`;
}

/**
 * Center-crop the source to 3:4 and draw it into a TARGET_W×TARGET_H surface, so
 * every stored photo is exactly 720×960 and matches the 3:4 finder (WYSIWYG).
 * Camera captures are already ~3:4 portrait, so this trims very little.
 */
function cropResizeTo3x4(src: SkImage): SkImage {
  const sw = src.width();
  const sh = src.height();
  const targetAspect = TARGET_W / TARGET_H; // 0.75 (w/h)

  let cropW: number;
  let cropH: number;
  if (sw / sh > targetAspect) {
    // too wide — trim the sides
    cropH = sh;
    cropW = Math.round(cropH * targetAspect);
  } else {
    // too tall — trim top/bottom
    cropW = sw;
    cropH = Math.round(cropW / targetAspect);
  }
  const x = Math.round((sw - cropW) / 2);
  const y = Math.round((sh - cropH) / 2);

  const surface = Skia.Surface.MakeOffscreen(TARGET_W, TARGET_H);
  if (!surface) return src; // alloc failed; fall back to full-res source
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRect(
    src,
    Skia.XYWHRect(x, y, cropW, cropH),
    Skia.XYWHRect(0, 0, TARGET_W, TARGET_H),
    paint,
    true,
  );
  surface.flush();
  return surface.makeImageSnapshot();
}

async function drawStamp(
  canvas: SkCanvas,
  takenAt: string,
  w: number,
  h: number,
): Promise<void> {
  try {
    const text = formatStamp(takenAt);
    if (!text) return;
    const typeface = await getStampTypeface();
    if (!typeface) return;

    const size = Math.max(14, Math.round(Math.max(w, h) * 0.03));
    const font = Skia.Font(typeface, size);
    const textWidth = font.getTextWidth(text);
    const margin = Math.round(w * 0.045);
    const x = w - textWidth - margin;
    const y = h - margin;

    const amber = Skia.Color('#FF9A3C');

    // soft LED glow underneath
    const glow = Skia.Paint();
    glow.setColor(amber);
    glow.setAlphaf(0.5);
    glow.setImageFilter(Skia.ImageFilter.MakeBlur(3, 3, TileMode.Clamp, null));
    canvas.drawText(text, x, y, glow, font);

    // crisp stamp on top
    const paint = Skia.Paint();
    paint.setColor(amber);
    paint.setAntiAlias(true);
    canvas.drawText(text, x, y, paint, font);
  } catch {
    // a missing stamp is fine; never fail the whole look over it
  }
}

export async function applyFilmLook(
  rawBytes: Uint8Array,
  takenAt: string,
): Promise<FilmLookResult> {
  try {
    if (!filmEffect) return { effectBytes: rawBytes, rawBytes };

    const src = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(rawBytes));
    if (!src) return { effectBytes: rawBytes, rawBytes };

    // normalize to the 720×960 working frame; the raw archive copy keeps full res
    const work = cropResizeTo3x4(src);
    const w = work.width();
    const h = work.height();

    const surface = Skia.Surface.MakeOffscreen(w, h);
    if (!surface) return { effectBytes: rawBytes, rawBytes };
    const canvas = surface.getCanvas();

    // 1. graded base via the film shader
    const imageShader = work.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None,
    );
    const shader = filmEffect.makeShaderWithChildren(
      // order must match the FILM_SKSL uniform declarations
      [w, h, GRAIN, VIGNETTE, CHROMA, EXPOSURE, Math.random() * 1000],
      [imageShader],
    );
    const basePaint = Skia.Paint();
    basePaint.setShader(shader);
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), basePaint);

    // 2. halation: extract warm highlights to their own surface, blur, and add
    //    on top. Because mid/shadow pixels are ~black they contribute nothing,
    //    so only true highlights bloom (no global brightening like before).
    if (highlightEffect) {
      const highlightSurface = Skia.Surface.MakeOffscreen(w, h);
      if (highlightSurface) {
        const hCanvas = highlightSurface.getCanvas();
        const hShader = highlightEffect.makeShaderWithChildren(
          [],
          [work.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None)],
        );
        const hPaint = Skia.Paint();
        hPaint.setShader(hShader);
        hCanvas.drawRect(Skia.XYWHRect(0, 0, w, h), hPaint);
        highlightSurface.flush();

        const bloom = Skia.Paint();
        bloom.setImageFilter(Skia.ImageFilter.MakeBlur(HALATION_BLUR, HALATION_BLUR, TileMode.Clamp, null));
        bloom.setBlendMode(BlendMode.Plus);
        bloom.setAlphaf(HALATION_ALPHA);
        canvas.drawImage(highlightSurface.makeImageSnapshot(), 0, 0, bloom);
      }
    }

    // 3. amber date stamp
    await drawStamp(canvas, takenAt, w, h);

    surface.flush();
    const effectBytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, JPEG_QUALITY);
    return { effectBytes, rawBytes };
  } catch {
    return { effectBytes: rawBytes, rawBytes };
  }
}
