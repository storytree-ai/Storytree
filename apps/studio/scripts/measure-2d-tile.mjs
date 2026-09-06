// measure-2d-tile.mjs — the 2D studio map's own numbers for the ADR-0528 tile ladder: for every
// arm and view the export captured (`export-tile-scenes.mjs`), the pixels that MOVED against the
// control at the same view (>20/255 on any channel, ADR-0490 D6 — never pixels touched), beside the
// delivered sizes `2d-metrics.json` already carries (the camera scale, the median island's width,
// the read island's width, the nameplate text's height). It writes `2d-report.txt` and folds the
// moved counts into `2d-metrics.json`.
//
//   node scripts/measure-2d-tile.mjs        (from apps/studio; after the export)
//
// ⚠ THE PIXELS ARE READ IN A BROWSER, NOT BY A PNG LIBRARY. The r3f harness keeps `pngjs` out of a
// package that ships to the website; this driver stays inside Playwright for the same reason the
// export does — the captures are its own, and Chromium already decodes them.
//
// ⚠ WHAT "MOVED" MEANS HERE. The fitted and resting views are camera compositions pinned to the
// world's bounds and to island COUNT respectively (ADR-0471), so on a uniformly re-based drawing the
// composition is the same and a moved pixel is a real change of the drawing — a re-composed island
// outline, a prop that did not scale, a nameplate that did. The island view is a deep link framed on
// the read island and is compared the same way.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const EVIDENCE = process.env['ST_TILE_EVIDENCE_OUT'] ?? join(REPO, 'docs', 'research', 'chapter2-tile-footprint-2026-09-06');
const VISIBLE_DELTA = 20;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

const metrics = JSON.parse(readFileSync(join(EVIDENCE, '2d-metrics.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(EVIDENCE, 'scenes', 'manifest.json'), 'utf8'));
const CONTROL = manifest.control;
const rows = metrics.rows;
const views = [...new Set(rows.map((r) => r.view))];
const arms = manifest.arms.map((a) => a.id);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent('<canvas id="a"></canvas><canvas id="b"></canvas>');

const dataUrl = (png) => `data:image/png;base64,${readFileSync(png).toString('base64')}`;

/** Pixels differing by more than `VISIBLE_DELTA` on any channel, and pixels differing at all. */
async function moved(pngA, pngB) {
  return page.evaluate(
    async ([a, b, delta]) => {
      const load = (src) =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { error: `size ${ia.width}×${ia.height} vs ${ib.width}×${ib.height}` };
      const draw = (id, img) => {
        const c = document.getElementById(id);
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const pa = draw('a', ia);
      const pb = draw('b', ib);
      let visible = 0;
      let touched = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
        if (d > 0) touched += 1;
        if (d > delta) visible += 1;
      }
      return { visible, touched, pixels: pa.length / 4 };
    },
    [dataUrl(pngA), dataUrl(pngB), VISIBLE_DELTA],
  );
}

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};
say(`THE 2D STUDIO MAP — every arm against ${CONTROL} at the same view; moved = pixels differing by more than ${VISIBLE_DELTA}/255 on any channel (ADR-0490 D6)`);
say(`control tile: hex radius ${manifest.controlTile.hexR}, ${manifest.controlTile.quota} · derived tile: hex radius ${manifest.tile.hexR.toFixed(3)}, ${manifest.tile.quota}`);
say('');
for (const view of views) {
  const control = rows.find((r) => r.arm === CONTROL && r.view === view);
  say(`── ${view} ─────────────────────────────`);
  say('arm                 scale    median island px   read island px   plate text px   moved>20 vs today   touched');
  for (const arm of arms) {
    const row = rows.find((r) => r.arm === arm && r.view === view);
    if (!row) {
      say(`${arm.padEnd(18)}  (no capture at this view)`);
      continue;
    }
    let m = { visible: null, touched: null };
    if (control && arm !== CONTROL) {
      m = await moved(control.png, row.png);
      if (m.error) fail(`${arm}/${view}: ${m.error}`);
      row.movedVsControl = m.visible;
      row.touchedVsControl = m.touched;
    } else if (arm === CONTROL) {
      row.movedVsControl = 0;
      row.touchedVsControl = 0;
      m = { visible: 0, touched: 0 };
    }
    const plate = row.plateTextPx ? `${row.plateTextPx.h.toFixed(1)}` : '—';
    const read = row.readIslandPx ? `${row.readIslandPx.w.toFixed(0)}` : '—';
    say(
      `${arm.padEnd(18)} ${row.scale.toFixed(3).padStart(6)} ${String(row.medianIslandWidthPx?.toFixed(0) ?? '—').padStart(18)} ${read.padStart(16)} ${plate.padStart(15)} ` +
        `${String(m.visible ?? '—').padStart(19)} ${String(m.touched ?? '—').padStart(9)}` +
        (arm === CONTROL ? '   ← TODAY' : ''),
    );
  }
  say('');
}
await browser.close();
writeFileSync(join(EVIDENCE, '2d-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
writeFileSync(join(EVIDENCE, '2d-report.txt'), `${lines.join('\n')}\n`);
console.log(`wrote ${join(EVIDENCE, '2d-report.txt')}`);
