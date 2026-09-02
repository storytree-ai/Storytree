// contact-sheet.mjs — lay several committed frames out side by side with captions, as ONE PNG.
//
// A viewing aid for the owner's per-step look on `land-ground-stack-arc`: each layer's landing is
// shown as a ladder of strengths in one image rather than as N attachments, so "scale it back"
// can point at a column. It measures nothing and decides nothing — every number a caption carries
// comes from the driver that wrote the frame.
//
// Usage:
//   node harness/contact-sheet.mjs --out sheet.png --cols 2 --width 900 \
//     "caption one=path/one.png" "caption two=path/two.png" ...
//
// ⚠ A SHELL ON PURPOSE (`.mjs`, not typechecked): it starts a browser, draws images into a page and
// screenshots it. There is no image library in this repo (no sharp, no Pillow); chromium through
// `@playwright/test` is the one PNG compositor available, the same route `capture.mjs` takes.

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
const out = opt('out', 'contact-sheet.png');
const cols = Number(opt('cols', '2'));
const cellWidth = Number(opt('width', '900'));
const title = opt('title', '');

const items = args.map((a) => {
  const eq = a.indexOf('=');
  if (eq < 0) throw new Error(`contact-sheet: expected "caption=path", got ${a}`);
  const caption = a.slice(0, eq);
  const path = resolve(a.slice(eq + 1));
  const b64 = readFileSync(path).toString('base64');
  return { caption, src: `data:image/png;base64,${b64}` };
});
if (items.length === 0) throw new Error('contact-sheet: no frames given');

const cells = items
  .map(
    (it) =>
      `<figure><img src="${it.src}" width="${cellWidth}"><figcaption>${escapeHtml(it.caption)}</figcaption></figure>`,
  )
  .join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #0b0d10; color: #e6e6e6; font: 15px/1.35 system-ui, sans-serif; }
  h1 { margin: 12px 16px 4px; font-size: 18px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(${cols}, ${cellWidth}px); gap: 12px 16px; padding: 12px 16px; }
  figure { margin: 0; }
  img { display: block; width: ${cellWidth}px; height: auto; background: #101418; }
  figcaption { padding: 6px 2px 0; white-space: pre-wrap; }
</style></head><body>${title ? `<h1>${escapeHtml(title)}</h1>` : ''}<div class="grid">${cells}</div></body></html>`;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: cols * (cellWidth + 16) + 16, height: 800 } });
await page.setContent(html, { waitUntil: 'load' });
const png = await page.screenshot({ fullPage: true, type: 'png' });
await browser.close();
writeFileSync(resolve(out), png);
console.log(`wrote ${resolve(out)} (${items.length} frames, ${cols} columns)`);
