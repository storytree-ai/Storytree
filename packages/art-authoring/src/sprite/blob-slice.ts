// blob-slice — the CONTENT-AWARE slicer that cuts the individual master objects back out of ONE
// whole-sheet generation (see ./whole-sheet-plan.ts). AUTHOR-TIME ONLY; pure (no node/network deps) so it
// is unit-testable offline.
//
// WHY NOT A GRID. The model will not honour a pixel-exact grid — objects land where they land. So we do NOT
// grid-slice. Instead we find the objects by CONTENT: detect the flat background (the same corner-sampled
// flood-fill ./cutout.ts uses), label the connected foreground components, MERGE near fragments (a flower
// stem separated from its head, an anti-aliased thin part that broke into pieces), drop speckle, and sort
// the survivors into READING ORDER (row-major) so the runner can assign them to the roster by position.
//
// THE FRAGILE STEP is that position→roster assignment: if the model draws objects out of order, or two
// objects touch (merging into one blob), the assignment is wrong. That is exactly why the runner emits a
// contact sheet showing every detected blob NUMBERED with its assigned name — the cut is made
// eyeball-verifiable, and a bad blob is re-authored with a per-object touch-up, never a whole re-roll.

import { cutoutRgba, type RgbaImage, type CutoutResult, type CutoutOptions } from './cutout.js';

/** One detected object: its inclusive bounding box (source px), foreground pixel `area`, and `centroid`. */
export interface Blob {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  centroidX: number;
  centroidY: number;
}

export interface SliceOptions {
  /** max per-channel distance from the sampled background a pixel may have and still count as background.
   *  Default 42 (a flat white field with soft edges). */
  tolerance?: number;
  /** two components whose bounding boxes come within this many px (in BOTH axes) are merged into one
   *  object — reconnects a stem to its head / a fragment to its parent. Default 8. Keep it well below the
   *  inter-object gap the whole-sheet prompt asks for, or distinct objects merge. */
  mergeGap?: number;
  /** a merged blob with fewer foreground pixels than this is discarded as speckle/JPEG noise. Default 200. */
  minArea?: number;
  /** row-clustering tolerance (px) for the reading-order sort — two blobs are in the same row if their
   *  centroid-Y are within this. Default: derived from the median blob height (≈0.5×). */
  rowTol?: number;
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

/** Sample the background as the average of the four corner pixels (same as ./cutout.ts). */
function sampleBackground(img: RgbaImage): Rgb {
  const { width: w, height: h, data } = img;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
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
 * The background mask: 1 where a pixel is the flat field CONNECTED to the border (a flood fill from every
 * border pixel that matches the sampled background within `tol`), 0 elsewhere. A white patch INSIDE an
 * object (a lit window, a daisy centre) is NOT connected to the border, so it stays foreground — the same
 * property ./cutout.ts relies on.
 */
export function backgroundMask(img: RgbaImage, tol: number): Uint8Array {
  const w = img.width;
  const h = img.height;
  const data = img.data;
  const bg = sampleBackground(img);
  const isBg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number): void => {
    const pi = y * w + x;
    if (isBg[pi] === 0 && dist(chan(data, pi * 4), bg) <= tol) {
      isBg[pi] = 1;
      stack.push(pi);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length > 0) {
    const pi = stack.pop()!;
    const x = pi % w;
    const y = (pi - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return isBg;
}

// ---- union-find (for merging near components) ----
function find(parent: number[], i: number): number {
  let r = i;
  while (parent[r] !== r) r = parent[r]!;
  while (parent[i] !== r) {
    const next = parent[i]!;
    parent[i] = r;
    i = next;
  }
  return r;
}
function union(parent: number[], a: number, b: number): void {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra !== rb) parent[ra] = rb;
}

/** Whether two bounding boxes come within `gap` px in BOTH axes (i.e. expanding each by `gap` makes them
 *  intersect) — the merge test for near fragments. */
function boxesNear(a: Blob, b: Blob, gap: number): boolean {
  const xGap = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
  const yGap = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
  return xGap <= gap && yGap <= gap;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Detect the master objects in a whole-sheet raster and return them in READING ORDER (top-to-bottom rows,
 * left-to-right within a row). Pipeline: background flood-fill → label 4-connected foreground components →
 * merge components whose boxes are within `mergeGap` → drop merged blobs under `minArea` → row-cluster and
 * sort. The returned order is what the runner zips against the roster.
 */
export function detectBlobs(img: RgbaImage, opts: SliceOptions = {}): Blob[] {
  const tol = opts.tolerance ?? 42;
  const mergeGap = opts.mergeGap ?? 8;
  const minArea = opts.minArea ?? 200;
  const w = img.width;
  const h = img.height;
  const isBg = backgroundMask(img, tol);

  // Label 4-connected foreground components with a scanline BFS.
  const label = new Int32Array(w * h).fill(-1);
  const comps: Blob[] = [];
  const queue: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (isBg[start] === 1 || label[start] !== -1) continue;
    const id = comps.length;
    label[start] = id;
    queue.length = 0;
    queue.push(start);
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    // BFS over the component.
    for (let qi = 0; qi < queue.length; qi++) {
      const pi = queue[qi]!;
      const x = pi % w;
      const y = (pi - x) / w;
      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nb = [
        x > 0 ? pi - 1 : -1,
        x < w - 1 ? pi + 1 : -1,
        y > 0 ? pi - w : -1,
        y < h - 1 ? pi + w : -1,
      ];
      for (const ni of nb) {
        if (ni < 0) continue;
        if (isBg[ni] === 1 || label[ni] !== -1) continue;
        label[ni] = id;
        queue.push(ni);
      }
    }
    comps.push({ minX, minY, maxX, maxY, area, centroidX: sumX / area, centroidY: sumY / area });
  }

  if (comps.length === 0) return [];

  // Merge components whose boxes are near (reconnect fragments) via union-find, then fold each set into
  // one blob (union the boxes, sum areas, area-weight the centroids).
  const parent = comps.map((_, i) => i);
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      if (boxesNear(comps[i]!, comps[j]!, mergeGap)) union(parent, i, j);
    }
  }
  const merged = new Map<number, Blob & { sumX: number; sumY: number }>();
  for (let i = 0; i < comps.length; i++) {
    const root = find(parent, i);
    const c = comps[i]!;
    const m = merged.get(root);
    if (!m) {
      merged.set(root, { ...c, sumX: c.centroidX * c.area, sumY: c.centroidY * c.area });
    } else {
      m.minX = Math.min(m.minX, c.minX);
      m.minY = Math.min(m.minY, c.minY);
      m.maxX = Math.max(m.maxX, c.maxX);
      m.maxY = Math.max(m.maxY, c.maxY);
      m.area += c.area;
      m.sumX += c.centroidX * c.area;
      m.sumY += c.centroidY * c.area;
    }
  }
  const blobs: Blob[] = [];
  for (const m of merged.values()) {
    if (m.area < minArea) continue;
    blobs.push({
      minX: m.minX,
      minY: m.minY,
      maxX: m.maxX,
      maxY: m.maxY,
      area: m.area,
      centroidX: m.sumX / m.area,
      centroidY: m.sumY / m.area,
    });
  }

  return sortReadingOrder(blobs, opts.rowTol);
}

/**
 * Sort blobs into reading order: cluster into rows by centroid-Y (a blob joins the current row while its
 * centroid-Y stays within `rowTol` of the row's running mean, else it opens a new row), then sort each row
 * left-to-right by centroid-X. `rowTol` defaults to ~half the median blob height.
 */
export function sortReadingOrder(blobs: Blob[], rowTol?: number): Blob[] {
  if (blobs.length <= 1) return [...blobs];
  const tol = rowTol ?? Math.max(20, 0.5 * median(blobs.map((b) => b.maxY - b.minY + 1)));
  const byY = [...blobs].sort((a, b) => a.centroidY - b.centroidY);
  const rows: { meanY: number; members: Blob[] }[] = [];
  for (const b of byY) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(b.centroidY - row.meanY) <= tol) {
      row.members.push(b);
      row.meanY = row.members.reduce((s, m) => s + m.centroidY, 0) / row.members.length;
    } else {
      rows.push({ meanY: b.centroidY, members: [b] });
    }
  }
  return rows.flatMap((r) => r.members.sort((a, b) => a.centroidX - b.centroidX));
}

/**
 * Cut ONE detected blob out to a tightly-trimmed transparent PNG. The blob's box is expanded by `cropPad`
 * (clamped to the image) so the crop's corners sit in guaranteed background, then ./cutout.ts keys that
 * background, feathers the rim, trims and (optionally) downscales — exactly as the per-sprite path does.
 */
export function cropBlob(
  img: RgbaImage,
  blob: Blob,
  opts: CutoutOptions & { cropPad?: number } = {},
): CutoutResult {
  const pad = opts.cropPad ?? 12;
  const w = img.width;
  const h = img.height;
  const x0 = Math.max(0, blob.minX - pad);
  const y0 = Math.max(0, blob.minY - pad);
  const x1 = Math.min(w - 1, blob.maxX + pad);
  const y1 = Math.min(h - 1, blob.maxY + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const sub = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = ((y + y0) * w + (x + x0)) * 4;
      const d = (y * cw + x) * 4;
      sub[d] = img.data[s] ?? 0;
      sub[d + 1] = img.data[s + 1] ?? 0;
      sub[d + 2] = img.data[s + 2] ?? 0;
      sub[d + 3] = img.data[s + 3] ?? 255;
    }
  }
  const { cropPad: _drop, ...cutoutOpts } = opts;
  return cutoutRgba({ width: cw, height: ch, data: sub }, cutoutOpts);
}
