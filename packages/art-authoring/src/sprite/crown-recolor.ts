// crown-recolor — derive the five per-status tree sprites from ONE authored master tree, by hue-recolouring
// only its GREEN CROWN pixels (the trunk, the ground shadow and the transparent field are left untouched).
// AUTHOR-TIME ONLY; pure (no node/network deps) so it is unit-testable offline.
//
// WHY. ADR-0227 restored per-status tree colour as a CODE recolour of one silhouette (green = healthy,
// red = unhealthy, amber = proposed, brown = mapped, grey = unknown) — NOT five separate generations. This
// is the sprite-sheet equivalent: from one master tree we emit `tree:<status>` variants that share an
// EXACT silhouette (the recolour never moves a pixel) and carry the exact ADR-0227 hexes, deterministically
// and for free. That kills the wave-2 drift where each per-status tree was its own nano-banana call.
//
// HOW. "Colorize" each crown pixel: take the target status hue + saturation, keep the pixel's OWN lightness.
// Lightness carries the crown's shading/texture (lit top, shaded underside), so the recoloured crown keeps
// its form and only swaps colour family. A pixel is "crown" when its hue sits in the green→teal band and it
// is saturated enough — which excludes the warm-brown trunk (low hue) and the desaturated grey shadow.

import type { RgbaImage } from './cutout.js';

/** One status → crown hue mapping (the ADR-0227 tree colourway hexes). */
export interface StatusColourway {
  status: string;
  hex: string;
}

/** The five studio tree statuses and their ADR-0227 crown hexes (LIT-tone bases). `healthy` green,
 *  `unhealthy` muted brick-red, `proposed` autumn amber, `mapped` brown, `unknown` sage grey-green. */
export const TREE_STATUS_PALETTE: readonly StatusColourway[] = [
  { status: 'healthy', hex: '#5aa46e' },
  { status: 'unhealthy', hex: '#b05a48' },
  { status: 'proposed', hex: '#cf9350' },
  { status: 'mapped', hex: '#96723f' },
  { status: 'unknown', hex: '#93a58c' },
];

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** An {h,s,l} colour: hue in DEGREES [0,360), saturation + lightness in [0,1]. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Parse `#rgb` / `#rrggbb` into 0..255 channels. Throws on a malformed hex (author-time fail-closed). */
export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`crown-recolor: not a hex colour: ${JSON.stringify(hex)}`);
  let h = m[1]!;
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** RGB (0..255) → HSL (h in degrees, s/l in 0..1). */
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** HSL (h in degrees, s/l in 0..1) → RGB (0..255, rounded). */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export interface CrownRecolorOptions {
  /** inclusive hue band (degrees) a pixel must fall in to be treated as crown foliage. Default [55, 200]
   *  (green → teal), which excludes the warm-brown trunk (hue ≈ 20-45). */
  hueMin?: number;
  hueMax?: number;
  /** minimum saturation a pixel needs to be crown — excludes the grey ground shadow. Default 0.10. */
  satMin?: number;
  /** minimum alpha a pixel needs to be considered at all (skips the transparent field / soft rim).
   *  Default 24. */
  alphaMin?: number;
}

/** Whether one pixel is crown foliage under the thresholds (hue in band, saturated enough, opaque enough). */
export function isCrownPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  opts: CrownRecolorOptions = {},
): boolean {
  const hueMin = opts.hueMin ?? 55;
  const hueMax = opts.hueMax ?? 200;
  const satMin = opts.satMin ?? 0.1;
  const alphaMin = opts.alphaMin ?? 24;
  if (a < alphaMin) return false;
  const { h, s } = rgbToHsl({ r, g, b });
  return s >= satMin && h >= hueMin && h <= hueMax;
}

/**
 * Recolour a master tree's crown to a status hue, returning a NEW raster (the input is not mutated). Each
 * crown pixel is "colorized": target hue + target saturation, the pixel's OWN lightness kept — so the
 * crown's shading/texture survives and only the colour family changes. Trunk, shadow, rim and transparent
 * pixels are copied verbatim. The silhouette is identical to the master (no pixel moves).
 */
export function recolorCrown(img: RgbaImage, targetHex: string, opts: CrownRecolorOptions = {}): RgbaImage {
  const target = rgbToHsl(hexToRgb(targetHex));
  const src = img.data;
  const out = new Uint8Array(src.length);
  out.set(src);
  const n = img.width * img.height;
  let recoloured = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = src[o] ?? 0;
    const g = src[o + 1] ?? 0;
    const b = src[o + 2] ?? 0;
    const a = src[o + 3] ?? 0;
    if (!isCrownPixel(r, g, b, a, opts)) continue;
    const l = rgbToHsl({ r, g, b }).l;
    const rgb = hslToRgb({ h: target.h, s: target.s, l });
    out[o] = rgb.r;
    out[o + 1] = rgb.g;
    out[o + 2] = rgb.b;
    // alpha (out[o+3]) is left as-is — the silhouette never changes.
    recoloured++;
  }
  if (recoloured === 0) {
    // Fail-closed: a tree master with no detectable green crown means the thresholds (or the generation)
    // are wrong — better to shout than to emit five identical uncoloured trees.
    throw new Error(
      'recolorCrown: no crown pixels matched — the master has no green foliage in the hue band, or the ' +
        'thresholds need tuning (hueMin/hueMax/satMin).',
    );
  }
  return { width: img.width, height: img.height, data: out };
}

/** The number of crown pixels that WOULD be recoloured — a cheap probe the runner / a test can assert on
 *  without allocating the output raster. */
export function countCrownPixels(img: RgbaImage, opts: CrownRecolorOptions = {}): number {
  const src = img.data;
  const n = img.width * img.height;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (isCrownPixel(src[o] ?? 0, src[o + 1] ?? 0, src[o + 2] ?? 0, src[o + 3] ?? 0, opts)) count++;
  }
  return count;
}
