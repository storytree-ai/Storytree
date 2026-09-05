// crop-sheet.mjs — crop the SAME rectangle out of several frames, scale it up, and lay the crops
// out as one captioned sheet. A viewing aid for an 18-px cliff band: a contact sheet of whole
// frames (`contact-sheet.mjs`) shows it at ~5 px and every rung looks identical, so crop BEFORE you
// compose (`comparison-baseline-moves-under-the-page`, 2026-09-02).
//
// Usage:
//   node harness/crop-sheet.mjs --out crop.png --x 800 --y 905 --w 700 --h 100 --scale 3 \
//     --cols 1 "caption one=path/one.png" "caption two=path/two.png" ...
//
// ⚠ A SHELL ON PURPOSE (`.mjs`, not typechecked), like contact-sheet.mjs beside it: chromium through
// @playwright/test is the one PNG compositor in this repo (no sharp, no Pillow). It measures nothing
// and decides nothing — the frames are the driver's, the rectangle is the caller's, and a crop that
// misses the band is visible at a glance. Aim it with the frame's known geometry: the skirt driver's
// frames are 2560×1600, and at one island / 8 px per unit the cliff band sits at y≈905–1005.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const out = opt('out', 'crop-sheet.png');
const x = Number(opt('x', '0'));
const y = Number(opt('y', '0'));
const w = Number(opt('w', '700'));
const h = Number(opt('h', '100'));
const scale = Number(opt('scale', '3'));
const cols = Number(opt('cols', '1'));
const title = opt('title', '');
// `--smooth 1` resamples with the browser's filter instead of nearest-neighbour. The default stays
// pixelated because the sheet's original job is to show DELIVERED pixels at a band 18 px tall; a
// crop of a whole island scaled DOWN (scale < 1) is the other job, and nearest-neighbour there
// drops pixels and speckles every crown (`shipped-camera` sheets, 2026-09-05).
const smooth = opt('smooth', '0') === '1';

const items = args.map((a) => {
  const eq = a.indexOf('=');
  if (eq < 0) throw new Error(`crop-sheet: expected "caption=path", got ${a}`);
  const caption = a.slice(0, eq);
  const path = resolve(a.slice(eq + 1));
  const b64 = readFileSync(path).toString('base64');
  return { caption, src: `data:image/png;base64,${b64}` };
});
if (items.length === 0) throw new Error('crop-sheet: no frames given');

const cw = w * scale;
const ch = h * scale;
const cells = items
  .map(
    (it) => `
    <figure>
      <canvas width="${cw}" height="${ch}" data-src="${it.src}"></canvas>
      <figcaption>${it.caption.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</figcaption>
    </figure>`,
  )
  .join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #14181c; color: #e8e8e8; font: 15px/1.35 system-ui, sans-serif; }
  #sheet { display: inline-grid; grid-template-columns: repeat(${cols}, ${cw}px); gap: 14px 18px; padding: 16px; }
  h1 { font-size: 16px; font-weight: 600; margin: 16px 16px 0; }
  figure { margin: 0; }
  canvas { display: block; image-rendering: ${smooth ? 'auto' : 'pixelated'}; border: 1px solid #3a3f46; }
  figcaption { margin-top: 5px; white-space: pre-wrap; }
</style></head><body>${title ? `<h1>${title}</h1>` : ''}<div id="sheet">${cells}</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(
  async ({ x, y, w, h, scale, smooth }) => {
    for (const canvas of document.querySelectorAll('canvas')) {
      const img = new Image();
      img.src = canvas.dataset.src;
      await img.decode();
      const ctx = canvas.getContext('2d');
      // Nearest-neighbour by default, on purpose: the point of the sheet is to see the delivered
      // pixels, not a resampled impression of them. `--smooth 1` is for a whole-island crop scaled
      // DOWN, where dropping pixels is the distortion.
      ctx.imageSmoothingEnabled = smooth;
      if (smooth) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x, y, w, h, 0, 0, w * scale, h * scale);
    }
  },
  { x, y, w, h, scale, smooth },
);
const el = await page.$('body');
const box = await el.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out} (${items.length} crops of ${w}x${h} at ${scale}x, ${cols} col)`);
