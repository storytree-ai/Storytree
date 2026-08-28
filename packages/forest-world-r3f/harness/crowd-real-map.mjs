// crowd-real-map.mjs — DRIVER for the pixel figures `crowd-layout.ts`'s `REAL_FOREST` hardcodes.
//
// Reproduce:
//   pnpm --filter @storytree/forest-world-r3f measure-real-map
//   ST_MAP_PNG=<some other map.png> pnpm --filter @storytree/forest-world-r3f measure-real-map
//
// WHAT IT IS FOR. `REAL_FOREST` in `crowd-layout.ts` says the synthetic crowd is calibrated to
// the REAL public map rather than to a made-up layout, and it carries five pixel figures that
// only mean something if the derivation can be re-run. This is that derivation: it measures
// `docs/research/forest-snapshot-2026-08-28/forest-map.png` — the picture committed beside the
// snapshot README that the story counts come from — and prints the numbers the constant holds.
// A reader who doubts `landFractionOfBox: 0.0285` runs this and reads it off the image.
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked — `tsconfig.json` covers only
// `.ts`/`.tsx` under `src` and `harness`. That is the usual rule here
// (`measurement-instrument-must-be-typechecked`) and this file is the usual exception's shape: it
// runs ONCE to justify a constant, and every number it prints is a count of pixels rather than a
// computation over the project's own vocabulary. Nothing downstream imports it.
//
// ⚠ DELIBERATELY DEPENDENCY-FREE. It decodes the PNG itself via `node:zlib` rather than adding
// `pngjs`, because this package SHIPS TO THE WEBSITE (it is synced as an artifact, ADR-0093 §3)
// and a decoder used once to justify a constant is not worth a dependency in that payload. The
// decoder is the boring 120 lines: IHDR/IDAT/IEND, concatenate, inflate, undo the five scanline
// filters. It handles 8-bit colour types 2 (RGB) and 6 (RGBA) and REFUSES on anything else —
// interlaced, 16-bit, palette, greyscale — rather than reading the bytes the wrong way and
// reporting confident numbers off a garbled image.
//
// ⚠ THE FLOOD FILL NEEDS AN EXPLICIT STACK. A 2280x2822 image is 6.4 million pixels and one
// island blob runs to tens of thousands of them; a recursive 4-way fill overflows the call stack
// long before it finishes, and it does so in the middle of a component, so the failure would look
// like a smaller blob rather than like a crash. The stack here is a plain array of indices.
//
// ⚠ IT REFUSES, rather than reporting, on: a missing or non-PNG file · an unsupported PNG shape ·
// an unknown scanline filter byte · an inflated buffer that is not exactly one filter byte plus
// one row per scanline · a decoded size that disagrees with IHDR · zero surviving blobs.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const PNG =
  process.env['ST_MAP_PNG'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'forest-snapshot-2026-08-28', 'forest-map.png');

/** What the committed `REAL_FOREST` was measured off. A different size is a different picture. */
const EXPECT = { w: 2280, h: 2822 };

/**
 * ⚠ THE LAND PREDICATE, and it is the one that produced the committed figures — do not tune it.
 *
 * The islands are green/olive and the page behind them is a warm pink-cream, so land is what is
 * decisively greener than it is blue, bright enough not to be a shadow line, and not also red
 * (which is what separates olive land from the background's warm cream). Every threshold here is
 * part of the published derivation: moving one moves `landFractionOfBox`, which is hardcoded.
 */
const isLand = (r, g, b) => g > b + 18 && g > 60 && !(r > g + 10);

/**
 * Blobs at or below this many pixels are trail lines, label glyphs and antialiasing crumbs, not
 * islands. The real islands start around 1,000 px, so the floor is nowhere near any of them.
 */
const MIN_BLOB_PX = 400;

function fail(msg) {
  console.error(`\nREFUSED: ${msg}\n`);
  process.exit(1);
}

// ------------------------------------------------------------------ the PNG decoder

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Paeth, straight out of the spec — the only filter with any subtlety in it. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode an 8-bit, non-interlaced, truecolour PNG to `{ width, height, channels, data }`. */
function decodePng(file) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch (e) {
    fail(`could not read ${file} — ${e}`);
  }
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) fail(`${file} is not a PNG`);

  let header = null;
  const idat = [];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colourType: body[9],
        compression: body[10],
        filter: body[11],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length; // length + type + data + crc
  }

  if (!header) fail(`${file} has no IHDR chunk`);
  if (!idat.length) fail(`${file} has no IDAT chunks`);

  // ⚠ REFUSE rather than guess. Every one of these would decode to plausible-looking bytes with
  // the truecolour reader below, and the numbers off them would be wrong without looking wrong.
  if (header.depth !== 8) fail(`${file} is ${header.depth}-bit; this decoder only reads 8-bit`);
  if (header.colourType !== 2 && header.colourType !== 6) {
    fail(
      `${file} is PNG colour type ${header.colourType}; this decoder only reads 2 (RGB) and 6 ` +
        '(RGBA). Palette and greyscale would need a different unpacker.',
    );
  }
  if (header.interlace !== 0) fail(`${file} is Adam7-interlaced; this decoder only reads non-interlaced`);
  if (header.compression !== 0 || header.filter !== 0) {
    fail(`${file} uses compression ${header.compression} / filter method ${header.filter}, not the standard 0/0`);
  }

  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (e) {
    fail(`the IDAT stream of ${file} would not inflate — ${e}`);
  }

  const channels = header.colourType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const expected = (stride + 1) * header.height;
  if (raw.length !== expected) {
    fail(
      `${file} inflated to ${raw.length} bytes; ${header.width}x${header.height} at ${channels} ` +
        `channels needs exactly ${expected} (one filter byte plus one row per scanline)`,
    );
  }

  // Undo the per-scanline filters in place, row by row, into a filterless buffer.
  const out = Buffer.allocUnsafe(stride * header.height);
  for (let y = 0; y < header.height; y++) {
    const filterType = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src + x];
      const a = x >= channels ? out[dst + x - channels] : 0; // left
      const b = y > 0 ? out[up + x] : 0; // above
      const c = x >= channels && y > 0 ? out[up + x - channels] : 0; // above-left
      let recon;
      switch (filterType) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + a;
          break;
        case 2:
          recon = value + b;
          break;
        case 3:
          recon = value + ((a + b) >> 1);
          break;
        case 4:
          recon = value + paeth(a, b, c);
          break;
        default:
          return fail(`scanline ${y} of ${file} carries unknown filter type ${filterType}`);
      }
      out[dst + x] = recon & 0xff;
    }
  }

  return { width: header.width, height: header.height, channels, data: out };
}

// ------------------------------------------------------------------ measure

const image = decodePng(PNG);
if (image.width !== EXPECT.w || image.height !== EXPECT.h) {
  fail(
    `${PNG} is ${image.width}x${image.height}, not the ${EXPECT.w}x${EXPECT.h} the committed ` +
      'REAL_FOREST figures were measured off. A different picture needs a different constant, ' +
      'not a re-run reported against the old one.',
  );
}

const { width, height, channels, data } = image;
const land = new Uint8Array(width * height);
let landPixels = 0;
for (let i = 0, p = 0; i < land.length; i++, p += channels) {
  if (isLand(data[p], data[p + 1], data[p + 2])) {
    land[i] = 1;
    landPixels++;
  }
}
if (landPixels === 0) fail(`no pixel in ${PNG} satisfied the land predicate`);

// ---- 4-way connected components, with the explicit stack the header warns about.
const seen = new Uint8Array(width * height);
const stack = new Int32Array(width * height);
const blobs = [];
for (let start = 0; start < land.length; start++) {
  if (!land[start] || seen[start]) continue;
  let top = 0;
  stack[top++] = start;
  seen[start] = 1;
  let count = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  while (top > 0) {
    const idx = stack[--top];
    const x = idx % width;
    const y = (idx - x) / width;
    count++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x > 0 && land[idx - 1] && !seen[idx - 1]) {
      seen[idx - 1] = 1;
      stack[top++] = idx - 1;
    }
    if (x + 1 < width && land[idx + 1] && !seen[idx + 1]) {
      seen[idx + 1] = 1;
      stack[top++] = idx + 1;
    }
    if (y > 0 && land[idx - width] && !seen[idx - width]) {
      seen[idx - width] = 1;
      stack[top++] = idx - width;
    }
    if (y + 1 < height && land[idx + width] && !seen[idx + width]) {
      seen[idx + width] = 1;
      stack[top++] = idx + width;
    }
  }
  if (count > MIN_BLOB_PX) {
    blobs.push({ pixels: count, minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
}
if (!blobs.length) fail(`no blob in ${PNG} cleared the ${MIN_BLOB_PX}px floor`);

/** Median, lower of the two middles on an even count — the same convention `frame-budget.ts` uses. */
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

const forestBox = {
  minX: Math.min(...blobs.map((b) => b.minX)),
  maxX: Math.max(...blobs.map((b) => b.maxX)),
  minY: Math.min(...blobs.map((b) => b.minY)),
  maxY: Math.max(...blobs.map((b) => b.maxY)),
};
forestBox.w = forestBox.maxX - forestBox.minX + 1;
forestBox.h = forestBox.maxY - forestBox.minY + 1;

const widths = blobs.map((b) => b.w);
const widest = blobs.reduce((a, b) => (b.w > a.w ? b : a));
const fills = blobs.map((b) => b.pixels / (b.w * b.h));

const report = {
  source: resolve(PNG),
  imagePx: { w: width, h: height },
  channels,
  landPredicate: 'g > b + 18 && g > 60 && !(r > g + 10)',
  minBlobPx: MIN_BLOB_PX,
  landPixels,
  blobs: blobs.length,
  forestBoxPx: { w: forestBox.w, h: forestBox.h },
  forestBoxBounds: { minX: forestBox.minX, maxX: forestBox.maxX, minY: forestBox.minY, maxY: forestBox.maxY },
  minIslandPx: Math.min(...widths),
  medianIslandPx: median(widths),
  widestIslandPx: Math.max(...widths),
  // ⚠ The land share is over ALL land pixels, sub-floor fragments included — the fraction is
  // about how empty the map READS, and a trail line is ink on the page whether or not it is an
  // island. The blob floor only governs the per-island figures.
  landFractionOfBox: landPixels / (forestBox.w * forestBox.h),
  // The mean over the islands of how much of its own bounding box each silhouette fills. An
  // island is a lobed blob, not a rectangle.
  islandBoxFill: fills.reduce((sum, f) => sum + f, 0) / fills.length,
  // ⚠ THE ONE FIGURE `REAL_FOREST` DOES NOT MATCH, and it is reported rather than reconciled.
  // The constant holds 0.543, which is not any statistic over the 40 blobs — it is ONE blob's
  // fill, the 157x93 / 7,933 px island its own doc comment names. Every other statistic the
  // spread supports is printed here so a reader can see which one 0.543 is and which it is not.
  // Nothing is tuned to close the gap: the constant is what it is, and this says so.
  boxFillSpread: {
    mean: fills.reduce((sum, f) => sum + f, 0) / fills.length,
    median: median(fills),
    areaWeighted:
      blobs.reduce((s, b) => s + b.pixels, 0) / blobs.reduce((s, b) => s + b.w * b.h, 0),
    min: Math.min(...fills),
    max: Math.max(...fills),
  },
};

console.log(JSON.stringify(report, null, 1));
console.log('');
console.log(
  `widest blob: ${widest.w}x${widest.h} px, ${widest.pixels} land px ` +
    `(${(widest.pixels / (widest.w * widest.h)).toFixed(3)} of its own box), at ` +
    `x ${widest.minX}..${widest.maxX}, y ${widest.minY}..${widest.maxY}`,
);
console.log(
  `${blobs.length} blobs over the ${MIN_BLOB_PX}px floor · widths ` +
    `${Math.min(...widths)} / ${median(widths)} / ${Math.max(...widths)} (min / median / max)`,
);
