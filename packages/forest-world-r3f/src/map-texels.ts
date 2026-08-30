// map-texels.ts — READ A DECODED BASE-COLOUR MAP'S OWN TEXELS, over its solid ones only.
//
// ⚠ CROSSED INTO `src/` ON 2026-08-30, whole, with the bought kit. A tinted crown needs its map's
// own mean, and the mean has to be read from the ASSET's decoded texels rather than from the
// delivered frame — an expectation derived from its own subject cannot fail. `harness/` re-exports
// it so the experiment and the product read one mean by one arithmetic.
//
// Extracted from `colour-convention-scene.ts` when a SECOND caller needed the same number:
// `kit-scene.ts` derives a leaf tint's gain from the map's own mean (`leaf-tint.ts`), and the
// colour guard judges delivered pixels against it. Two copies of this loop would agree today and
// disagree the first time either one's opaque cut moved — and the whole point of the cut is that
// the source mean and the delivered mean are means of the SAME SET of texels.
//
// ⚠ ONLY FULLY OPAQUE TEXELS, AND THIS IS NOT A DETAIL. Reading a map's texels means drawing it
// into a 2D canvas, and `getImageData` un-premultiplies — so every texel with alpha 0 comes back
// BLACK whatever its real colour is, while the GPU samples that colour perfectly happily. On the
// pine's foliage map that dragged the JavaScript mean to rgb(30,38,29) against a frame delivering
// rgb(72,91,71): a real disagreement, about the wrong thing.

import { OPAQUE_TEXEL_CUT, srgbToLinearUnit } from './texture-convention.js';
import type { Rgb } from './texture-convention.js';

/** A decoded texture image, in the one shape both the 2D canvas and three's loaders answer. */
export type DecodedMap = CanvasImageSource & { width?: number; height?: number };

/** What one decoded base-colour map is, measured over its solid texels only. */
export interface MapMeans {
  raw: Rgb;
  linear: Rgb;
  width: number;
  height: number;
  opaqueFraction: number;
}

/**
 * ⚠ BOTH MEANS ARE COMPUTED FROM THE SAME TEXELS IN THE SAME PASS. The linearised one is
 * `mean(srgb_to_linear(texel))` and NOT `srgb_to_linear(mean(texel))` — the curve is convex, so
 * those differ, and predicting with the wrong one leaves a systematic error that a tolerance
 * would then have to absorb. A tolerance absorbing a modelling error has stopped discriminating.
 */
/**
 * THE MEANS THEMSELVES — the arithmetic, over raw RGBA bytes, with no canvas anywhere.
 *
 * ⚠⚠ EXTRACTED FROM {@link mapMeans} SO IT CAN BE PROVED. Reading a texture's texels needs a 2D
 * canvas and therefore a browser; the arithmetic over them does not, and it is where every claim
 * lives — which mean is which, that only solid texels count, and what "no solid texels at all"
 * does. Left inside the canvas read it was 65 mutants nothing could reach, and
 * `check:mutation-diff` said so. The remedy is not a better browser fixture: it is that the
 * subject of the assertions was never the canvas.
 *
 * ⚠ IT ITERATES `data.keys()` RATHER THAN A COUNTER. A `for (let i = 0; i < n; i += 4)` carries
 * mutants that flip `+=` to `-=` and `<` to `>`; neither fails an assertion, both run forever, and
 * the rung scores a hang UNPROVEN — credited to nobody. A typed array's own key iterator has
 * nothing to mutate into one.
 */
export function texelMeans(data: ArrayLike<number> & { keys(): IterableIterator<number> }): {
  raw: Rgb;
  linear: Rgb;
  opaque: number;
} {
  let rr = 0;
  let gg = 0;
  let bb = 0;
  let lr = 0;
  let lg = 0;
  let lb = 0;
  let n = 0;
  for (const i of data.keys()) {
    if (i % 4 !== 0) continue;
    if (data[i + 3]! < OPAQUE_TEXEL_CUT) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    rr += r;
    gg += g;
    bb += b;
    lr += srgbToLinearUnit(r / 255) * 255;
    lg += srgbToLinearUnit(g / 255) * 255;
    lb += srgbToLinearUnit(b / 255) * 255;
    n += 1;
  }
  if (n === 0) throw new Error('map-texels: a map has no solid texels at all');
  return {
    raw: { r: rr / n, g: gg / n, b: bb / n },
    linear: { r: lr / n, g: lg / n, b: lb / n },
    opaque: n,
  };
}

/**
 * Draw a decoded texture image into a 2D canvas and answer its raw and linearised means.
 *
 * ⚠ THE ARITHMETIC IS {@link texelMeans}'S. What is left here is the browser-bound half — get the
 * texels out of a decoded image — and it is deliberately the only part that cannot be proved
 * without one.
 */
export function mapMeans(image: DecodedMap): MapMeans {
  const width = Number(image.width ?? 0);
  const height = Number(image.height ?? 0);
  if (!(width > 0 && height > 0)) throw new Error('map-texels: a map has no decoded pixels');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('map-texels: no 2d context to read a map with');
  ctx.drawImage(image, 0, 0);
  const means = texelMeans(ctx.getImageData(0, 0, width, height).data);
  return {
    raw: means.raw,
    linear: means.linear,
    width,
    height,
    opaqueFraction: means.opaque / (width * height),
  };
}
