// pixel-metrics.ts — MICRO, STRUCT and the colour counts, over an RGBA pixel buffer. Pure,
// browser-free and node:test-provable; fenced into `harness/` with the rest of the experiment.
//
// WHY THIS EXISTS AS TYPESCRIPT AT ALL. The instrument that produced the numbers this arc runs
// on is `docs/research/chapter2-land-idiom-2026-08-27/measure_land.py`, and it only runs inside
// Blender — `bpy.data.images.load` is its pixel reader. Everything it measured is a Cycles
// render. The question this increment has to answer is whether the same treatment reads the
// same way when a BROWSER draws it, and that question is unanswerable until the same
// arithmetic can be applied to pixels a browser delivered.
//
// ⚠⚠ THE DEFINITIONS ARE TRANSCRIBED FROM `measure_land.py` DELIBERATELY, AND A DIFFERENCE
// ANYWHERE HERE IS A LIE IN THE COMPARISON RATHER THAN A ROUNDING DETAIL. The whole value of
// this module is that a number it returns can be read directly against that file's committed
// table (control MICRO 1.15, structure-bare 1.19, combined-bare 1.83 at 1948 px). Every
// decision below that could have gone another way is therefore annotated with the line it
// came from, and `pixel-metrics.test.ts` pins the ones a hand-computed case can reach.
//
// The four that actually differ between plausible implementations:
//   - LUMA is Rec.709 on the 0..255 BYTES, not on linear light and not on floats.
//   - MICRO averages horizontal and vertical neighbour pairs TOGETHER, in one mean over the
//     concatenation, so the axis with more pairs weighs more. Averaging the two axis means
//     separately gives a different number on a non-square mask.
//   - The BOX BLUR is mask-normalised: a pixel near the coast is averaged over the land it
//     actually has, not over transparency. Blurring zeros in would drag every coastal pixel
//     toward black and inflate STRUCT.
//   - BINS90 counts distinct EXACT colours, sorted by population, until 90% of the opaque
//     pixels are covered — `searchsorted(cumsum, opaque * 0.90) + 1`.

/** Alpha at or above this is opaque. `measure_land.py`: `mask = alpha >= 0.5`. */
export const OPAQUE_ALPHA = 128;

/** The blur radius STRUCT is defined at: a 9x9 window. `measure_land.py`: `box_blur(luma, m, 4)`. */
export const STRUCT_BLUR_RADIUS = 4;

export interface PixelMetrics {
  /** Opaque pixels the figures below are computed over. Zero means every figure is absent
   *  rather than zero — see {@link measurePixels}. */
  opaque: number;
  /** Mean |delta luma| between neighbouring opaque pixels. Contrast at the PIXEL scale. */
  micro: number;
  /** Standard deviation of luma after a 4-px box blur. Contrast at the scale a zoomed-out
   *  viewer still has. */
  struct: number;
  /** MICRO / STRUCT. A land whose richness is all grain has a high ratio; a land whose
   *  richness is structural has a low one. Neither end is good on its own. */
  ratio: number;
  /** Distinct exact colours delivered on opaque pixels. */
  distinct: number;
  /** Colours needed to cover 90% of the opaque frame. */
  bins90: number;
  /** The same count on the BLURRED frame: how much of the colour count survives when the
   *  detail does not. A ground scoring 300 bins that falls to 12 when blurred is scoring on
   *  noise. */
  bins90b: number;
  /** Luma percentiles over opaque pixels — p98 minus p2 is the "spread" the research tables
   *  report. */
  p2: number;
  p50: number;
  p98: number;
  /** p98 - p2, the luminance spread. */
  spread: number;
}

/** Rec.709 luma on 0..255 bytes. `measure_land.py`: `0.2126*R + 0.7152*G + 0.0722*B`. */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Mask-normalised box blur over a scalar plane.
 *
 * Implemented with a summed-area table because the naive form is O(w*h*r^2) and this runs over
 * a 1948-px frame four times per variant. The window is `[i-r, i+r]` INCLUSIVE and clipped to
 * the plane, matching `measure_land.py`'s `clip(arange - r, 0, n)` / `clip(arange + r + 1, 0, n)`
 * pair — an off-by-one here shifts every STRUCT figure by a fraction of a percent and would be
 * invisible except as a disagreement with the committed table.
 */
export function maskedBoxBlur(
  values: Float64Array,
  mask: Uint8Array,
  w: number,
  h: number,
  r: number,
): Float64Array {
  const integral = (src: Float64Array): Float64Array => {
    const s = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        rowSum += src[y * w + x]!;
        s[(y + 1) * (w + 1) + (x + 1)] = s[y * (w + 1) + (x + 1)]! + rowSum;
      }
    }
    return s;
  };
  const masked = new Float64Array(w * h);
  const maskF = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const m = mask[i] ? 1 : 0;
    masked[i] = values[i]! * m;
    maskF[i] = m;
  }
  const sv = integral(masked);
  const sm = integral(maskF);
  const out = new Float64Array(w * h);
  const win = (s: Float64Array, y0: number, y1: number, x0: number, x1: number): number =>
    s[y1 * (w + 1) + x1]! - s[y0 * (w + 1) + x1]! - s[y1 * (w + 1) + x0]! + s[y0 * (w + 1) + x0]!;
  for (let y = 0; y < h; y++) {
    const y0 = Math.min(Math.max(y - r, 0), h);
    const y1 = Math.min(Math.max(y + r + 1, 0), h);
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(Math.max(x - r, 0), w);
      const x1 = Math.min(Math.max(x + r + 1, 0), w);
      const den = win(sm, y0, y1, x0, x1);
      out[y * w + x] = den === 0 ? 0 : win(sv, y0, y1, x0, x1) / den;
    }
  }
  return out;
}

/**
 * Colours needed to cover `fraction` of `total` pixels, given a colour histogram.
 *
 * EXPORTED so `colour-spread.ts` can compute bins90 from a HISTOGRAM alone. `capture.mjs`'s
 * readback returns a colour histogram per canvas rather than the raw RGBA buffer — deliberately,
 * because a 1918x930 canvas is 7 MB of pixels to serialise out of the page and there are eight of
 * them. bins90 is exact from the histogram; MICRO and STRUCT are not, because they are spatial.
 * A second copy of this arithmetic living in the spread module is precisely how two instruments
 * quietly disagree, which is the fault `capture.mjs`'s own header records paying for.
 */
export function binsToCover(counts: number[], total: number, fraction: number): number {
  const sorted = [...counts].sort((a, b) => b - a);
  const target = total * fraction;
  let cum = 0;
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i]!;
    if (cum >= target) return i + 1;
  }
  return sorted.length;
}

/** Linear interpolation percentile, matching numpy's default. */
function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/**
 * Measure an RGBA buffer, TOP-DOWN (the order a canvas `readPixels`-style capture and a decoded
 * PNG both hand you).
 *
 * ⚠ `measure_land.py` flips its buffer on the way in (`[::-1]`) because BLENDER stores images
 * bottom-up. Every figure this module returns is orientation-INVARIANT — a mean over unordered
 * neighbour pairs, a standard deviation, a histogram — so no flip is needed here and adding one
 * would be a no-op that looked like a correctness fix. Stated because the absence of the flip is
 * the kind of thing a later reader checks for and mistakes for an omission.
 *
 * Returns `null` when nothing is opaque: a blank frame has no contrast rather than zero
 * contrast, and returning zeros would let an empty capture read as a legitimate measurement —
 * the vacuous-green shape this arc has already been bitten by twice.
 */
export function measurePixels(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): PixelMetrics | null {
  const n = w * h;
  if (rgba.length < n * 4) {
    throw new Error(`pixel-metrics: buffer holds ${rgba.length} bytes, need ${n * 4} for ${w}x${h}`);
  }
  const mask = new Uint8Array(n);
  const lum = new Float64Array(n);
  const histogram = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    lum[i] = luma(r, g, b);
    if (rgba[i * 4 + 3]! >= OPAQUE_ALPHA) {
      mask[i] = 1;
      opaque++;
      const key = r * 65536 + g * 256 + b;
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }
  }
  if (opaque === 0) return null;

  // MICRO — horizontal and vertical neighbour pairs pooled into ONE mean, both ends opaque.
  let deltaSum = 0;
  let pairs = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const i = y * w + x;
      if (mask[i] && mask[i - 1]) {
        deltaSum += Math.abs(lum[i]! - lum[i - 1]!);
        pairs++;
      }
    }
  }
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] && mask[i - w]) {
        deltaSum += Math.abs(lum[i]! - lum[i - w]!);
        pairs++;
      }
    }
  }
  const micro = pairs === 0 ? 0 : deltaSum / pairs;

  // STRUCT — standard deviation of the blurred luma, over the mask only.
  const blurred = maskedBoxBlur(lum, mask, w, h, STRUCT_BLUR_RADIUS);
  let bsum = 0;
  for (let i = 0; i < n; i++) if (mask[i]) bsum += blurred[i]!;
  const bmean = bsum / opaque;
  let bvar = 0;
  for (let i = 0; i < n; i++) if (mask[i]) bvar += (blurred[i]! - bmean) ** 2;
  const struct = Math.sqrt(bvar / opaque);

  // BINS90B — the colour count on the blurred frame, each channel blurred independently and
  // rounded exactly as `measure_land.py` does before the histogram.
  const chan = (offset: number): Float64Array => {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = rgba[i * 4 + offset]!;
    return maskedBoxBlur(v, mask, w, h, STRUCT_BLUR_RADIUS);
  };
  const br = chan(0);
  const bg = chan(1);
  const bb = chan(2);
  const blurHistogram = new Map<number, number>();
  const clamp255 = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const key = clamp255(br[i]!) * 65536 + clamp255(bg[i]!) * 256 + clamp255(bb[i]!);
    blurHistogram.set(key, (blurHistogram.get(key) ?? 0) + 1);
  }

  const lumaSorted = new Float64Array(opaque);
  let k = 0;
  for (let i = 0; i < n; i++) if (mask[i]) lumaSorted[k++] = lum[i]!;
  lumaSorted.sort();
  const p2 = percentile(lumaSorted, 2);
  const p50 = percentile(lumaSorted, 50);
  const p98 = percentile(lumaSorted, 98);

  return {
    opaque,
    micro,
    struct,
    ratio: struct === 0 ? 0 : micro / struct,
    distinct: histogram.size,
    bins90: binsToCover([...histogram.values()], opaque, 0.9),
    bins90b: binsToCover([...blurHistogram.values()], opaque, 0.9),
    p2,
    p50,
    p98,
    spread: p98 - p2,
  };
}
