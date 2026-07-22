// cutout — turn a nano-banana render (a subject on a plain flat WHITE background) into a tightly-trimmed
// transparent PNG. AUTHOR-TIME ONLY. Nano-banana emits no true alpha, so the generator asks for the
// asset on a flat white field and this pass keys that field out.
//
// Strategy: a CORNER FLOOD FILL, not a global chroma-key. Starting from every border pixel that matches
// the sampled background colour (within a tolerance), we flood inward and clear only the CONNECTED
// background region — so a cream/white patch INSIDE the subject (a lit window, a daisy petal) is kept,
// because it is not connected to the border. A light alpha feather softens the anti-aliased rim to cut
// the white halo. Finally we trim to the opaque bounding box so the manifest can seat the ground pivot
// on the real art (and derive an undistorted display width from the trimmed aspect).
//
// pngjs is a pure-JS PNG codec (no native build), so this stays cross-platform and CI-safe.

import { PNG } from 'pngjs';

export interface CutoutOptions {
  /** max per-channel distance from the sampled background a pixel may have and still be flooded as
   *  background. Default 42 (tuned for a flat white field with soft edges). */
  tolerance?: number;
  /** the looser band above `tolerance` over which a kept rim pixel's alpha is feathered 1→0 to kill the
   *  white halo. Default 36. */
  feather?: number;
  /** transparent margin (px) left around the trimmed subject. Default 2. */
  pad?: number;
  /** if set, downscale the trimmed sprite so its largest side is at most this many px (aspect kept), so
   *  a committed sprite is lean. Unset = keep native resolution. */
  maxDim?: number;
}

export interface CutoutResult {
  /** the transparent, trimmed PNG bytes. */
  png: Buffer;
  /** the trimmed box in native pixels (drives the manifest's undistorted display width). */
  width: number;
  height: number;
}

/** A decoded RGBA raster (what a PNG/JPEG decoder yields): row-major, 4 bytes per pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function chan(data: Uint8Array, idx: number): Rgb {
  return { r: data[idx] ?? 0, g: data[idx + 1] ?? 0, b: data[idx + 2] ?? 0 };
}

function dist(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

/** Sample the background as the average of the four corner pixels. */
function sampleBackground(img: RgbaImage): Rgb {
  const { width: w, height: h, data } = img;
  const corners = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of corners) {
    const p = chan(data, c);
    r += p.r;
    g += p.g;
    b += p.b;
  }
  return { r: r / 4, g: g / 4, b: b / 4 };
}

/**
 * Cut the flat background out of a rendered PNG and trim to the subject. Returns the transparent PNG plus
 * its trimmed pixel box. Throws on an image that flood-fills to nothing left (a mis-generated all-white
 * frame) so the runner can retry rather than write an empty sprite.
 */
export function cutoutTransparent(pngBuffer: Buffer, opts: CutoutOptions = {}): CutoutResult {
  const png = PNG.sync.read(pngBuffer);
  return cutoutRgba({ width: png.width, height: png.height, data: png.data }, opts);
}

/**
 * The format-agnostic core: cut the flat background out of an already-decoded RGBA raster (a PNG via
 * pngjs, a JPEG via jpeg-js, …) and trim to the subject. The input `data` is copied, not mutated.
 */
export function cutoutRgba(img: RgbaImage, opts: CutoutOptions = {}): CutoutResult {
  const tol = opts.tolerance ?? 42;
  const feather = opts.feather ?? 36;
  const pad = opts.pad ?? 2;

  const w = img.width;
  const h = img.height;
  const data = new Uint8Array(img.data); // work on a copy so the caller's raster is untouched
  const bg = sampleBackground({ width: w, height: h, data });

  // 1) Flood fill background from the border. `state`: 0 = untouched, 1 = background (cleared).
  const state = new Uint8Array(w * h);
  const stack: number[] = [];
  const pushIfBorderBg = (x: number, y: number): void => {
    const pi = y * w + x;
    if (state[pi] === 0 && dist(chan(data, pi * 4), bg) <= tol) {
      state[pi] = 1;
      stack.push(pi);
    }
  };
  for (let x = 0; x < w; x++) {
    pushIfBorderBg(x, 0);
    pushIfBorderBg(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushIfBorderBg(0, y);
    pushIfBorderBg(w - 1, y);
  }
  while (stack.length > 0) {
    const pi = stack.pop()!;
    const x = pi % w;
    const y = (pi - x) / w;
    const neighbours = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (nx! < 0 || ny! < 0 || nx! >= w || ny! >= h) continue;
      const ni = ny! * w + nx!;
      if (state[ni] !== 0) continue;
      if (dist(chan(data, ni * 4), bg) <= tol) {
        state[ni] = 1;
        stack.push(ni);
      }
    }
  }

  // 2) Apply alpha: cleared background → 0; a kept rim pixel adjacent to cleared background gets a
  //    feathered alpha based on how close it still is to the background (kills the white halo).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = y * w + x;
      const ai = pi * 4 + 3;
      if (state[pi] === 1) {
        data[ai] = 0;
        continue;
      }
      // rim? adjacent to a cleared pixel
      let onRim = false;
      const nb = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of nb) {
        if (nx! < 0 || ny! < 0 || nx! >= w || ny! >= h) continue;
        if (state[ny! * w + nx!] === 1) {
          onRim = true;
          break;
        }
      }
      if (onRim) {
        const d = dist(chan(data, pi * 4), bg);
        if (d <= feather) {
          data[ai] = Math.round((d / feather) * 255);
        }
      }
    }
  }

  // 3) Trim to the opaque bounding box (alpha > 0).
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    throw new Error('cutoutTransparent: nothing left after background removal (blank/all-background frame)');
  }
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;

  const cropData = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const src = ((y + minY) * w + (x + minX)) * 4;
      const dst = (y * tw + x) * 4;
      cropData[dst] = data[src] ?? 0;
      cropData[dst + 1] = data[src + 1] ?? 0;
      cropData[dst + 2] = data[src + 2] ?? 0;
      cropData[dst + 3] = data[src + 3] ?? 0;
    }
  }

  // 4) Optionally downscale so the committed sprite is lean (a ~50–140px map footprint never needs a
  //    1024px source). Aspect is preserved, so the manifest's aspect-derived display width is unchanged.
  const cropped: RgbaImage = { width: tw, height: th, data: cropData };
  const final = opts.maxDim && Math.max(tw, th) > opts.maxDim ? downscaleRgba(cropped, opts.maxDim) : cropped;

  const out = new PNG({ width: final.width, height: final.height });
  out.data.set(final.data);
  return { png: PNG.sync.write(out), width: final.width, height: final.height };
}

/**
 * Area-average (box) downscale of an RGBA raster so its largest side is at most `maxDim`. Colour is
 * averaged in PREMULTIPLIED alpha (so transparent edge pixels don't drag the subject's colour toward
 * black), then un-premultiplied — the standard way to shrink a cut-out without a dark fringe.
 */
export function downscaleRgba(img: RgbaImage, maxDim: number): RgbaImage {
  const { width: sw, height: sh, data: src } = img;
  const scale = maxDim / Math.max(sw, sh);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const dst = new Uint8Array(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = Math.floor((dy * sh) / dh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * sh) / dh));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = Math.floor((dx * sw) / dw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * sw) / dw));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const si = (sy * sw + sx) * 4;
          const al = src[si + 3] ?? 0;
          r += (src[si] ?? 0) * al;
          g += (src[si + 1] ?? 0) * al;
          b += (src[si + 2] ?? 0) * al;
          a += al;
          n++;
        }
      }
      const di = (dy * dw + dx) * 4;
      const avgA = a / n;
      if (a > 0) {
        dst[di] = Math.round(r / a);
        dst[di + 1] = Math.round(g / a);
        dst[di + 2] = Math.round(b / a);
      }
      dst[di + 3] = Math.round(avgA);
    }
  }
  return { width: dw, height: dh, data: dst };
}
