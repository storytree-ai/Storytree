// map-texels.ts — READ A DECODED BASE-COLOUR MAP'S OWN TEXELS, over its solid ones only.
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
 * Draw a decoded texture image into a 2D canvas and answer its raw and linearised means.
 *
 * ⚠ BOTH MEANS ARE COMPUTED HERE, FROM THE SAME TEXELS, IN THE SAME PASS. The linearised one is
 * `mean(srgb_to_linear(texel))` and NOT `srgb_to_linear(mean(texel))` — the curve is convex, so
 * those differ, and predicting with the wrong one leaves a systematic error that a tolerance
 * would then have to absorb. A tolerance absorbing a modelling error has stopped discriminating.
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
  const data = ctx.getImageData(0, 0, width, height).data;

  let rr = 0;
  let gg = 0;
  let bb = 0;
  let lr = 0;
  let lg = 0;
  let lb = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
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
    n++;
  }
  if (n === 0) throw new Error('map-texels: a map has no solid texels at all');
  return {
    raw: { r: rr / n, g: gg / n, b: bb / n },
    linear: { r: lr / n, g: lg / n, b: lb / n },
    width,
    height,
    opaqueFraction: n / (width * height),
  };
}
