// baseline-measure.mjs — RECORD what the shipped forest map costs today, on a named GPU.
//
// THE INCREMENT: `adopt-the-land-into-the-shipped-map-arc-inc-01`. The arc's end state asks
// what the new land costs; a cost is a difference; and no BEFORE has ever been written down.
// This driver takes it — draw calls, triangles, delivered scale, renderer identity — off
// `baseline.html`, which mounts the REAL `src/ForestWorldCanvas.tsx` beside the harness.
//
// USAGE:
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5231
//   DISPLAY=:0 ST_BASELINE_GPU=1 ST_BASELINE_URL=http://localhost:5231/baseline.html \
//     pnpm --filter @storytree/forest-world-r3f measure-baseline
//
// ⚠ THE GPU FLAGS ARE NOT INTERCHANGEABLE AND ONE OF THEM LIES. Measured on the RTX 2060 box
// (docs/research/chapter2-ground-cover-2026-08-27 §10): `--use-gl=angle --use-angle=gl` reaches
// the NVIDIA driver headless, `--use-gl=egl` falls back to SwiftShader SILENTLY, and omitting
// `DISPLAY` from the environment does the same even headless. `ST_BASELINE_GPU=1` therefore
// REFUSES a run whose context came up software rather than reporting a plausible number from it.
//
// ⚠ THE PICTURES ARE ELEMENT SCREENSHOTS, NOT `getImageData`, AND NO COLOUR FIGURE IS DERIVED
// FROM THEM. R3F's canvas does not preserve its drawing buffer, so a readback after the frame
// returns nothing; and this arc has already been burned once by screenshots compositing the
// page background in opaque. They are here to be LOOKED at. Every number in the report comes
// from the GL call counter or from the geometry, never from a pixel.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHIPPED_UNDRAWN, authoredTriangles } from './shipped-baseline.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_BASELINE_URL'] ?? 'http://localhost:5231/baseline.html';
const OUT = process.env['ST_BASELINE_OUT'] ?? join(HERE, '..', '..', '..', '.baseline-measure');
const WANT_GPU = process.env['ST_BASELINE_GPU'] === '1';

const GPU_ARGS = ['--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'];

function refuse(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(1);
}

// ⚠ `vite.config.ts` pins strictPort 5184 for EVERY worktree, so the default port may be a
// SIBLING worktree's server — and a wrong-tree measurement produces a NUMBER rather than a
// missing file, which is worse than a crash.
if (/:5184\b/.test(URL) && !process.env['ST_BASELINE_ALLOW_DEFAULT_PORT']) {
  refuse(
    `${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_BASELINE_URL.',
  );
}

const browser = await chromium.launch(WANT_GPU ? { args: GPU_ARGS } : {});
const page = await browser.newPage({ viewport: { width: 2400, height: 1700 }, deviceScaleFactor: 1 });

page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__stExperimentSettled === true, null, { timeout: 180_000 });

const report = await page.evaluate(() => window.__stBaseline ?? null);
if (!report) refuse('the page settled but filed no __stBaseline report');

const software = /swiftshader|llvmpipe|software|Mesa OffScreen/i.test(report.renderer);
if (WANT_GPU && software) {
  refuse(
    `ST_BASELINE_GPU=1 was asked for and the context came up on ${report.renderer}.\n` +
      'Check DISPLAY is exported and the --use-angle=gl flags reached the browser.',
  );
}

console.log(`renderer: ${report.renderer}`);
console.log(`vendor:   ${report.vendor}`);
console.log(`EXT_disjoint_timer_query_webgl2: ${report.timerQuery ? 'available' : 'ABSENT'}`);
console.log('');

// ── refusals ────────────────────────────────────────────────────────────────────────────────
// A panel that drew NOTHING is the failure this instrument is most likely to meet and least
// likely to notice: an empty canvas costs zero draw calls, which reads exactly like a cheap one.
const panels = Object.entries(report.panels);
if (panels.length < 3) refuse(`only ${panels.length} panel(s) filed a reading; expected three shipped mounts`);
for (const [tag, r] of panels) {
  if (r.calls === 0) refuse(`panel ${tag} drew ZERO draw calls — an empty canvas is not a cheap one`);
  if (!(r.triangles > 0)) refuse(`panel ${tag} drew ZERO triangles`);
  // A reading averaged over one frame is a sample of one, and this arc has already published a
  // physical impossibility off exactly that.
  if (r.frames < 5) refuse(`panel ${tag} averaged over only ${r.frames} rendered frame(s)`);
}

// The two shipped mounts are the SAME scene at two canvas sizes, so their geometry must agree
// exactly. If it does not, one of them drew something else and the comparison is void.
const overview = report.panels['shipped-overview'];
const zoom = report.panels['shipped-zoom'];
if (!overview || !zoom) refuse('one of the two shipped mounts is missing from the report');
if (Math.round(overview.triangles) !== Math.round(zoom.triangles)) {
  refuse(
    `the two shipped mounts drew different geometry (${overview.triangles} vs ${zoom.triangles} triangles).\n` +
      'They are the same scene at two canvas sizes; a difference means one of them is not the scene it claims.',
  );
}

// The AUTHORED count, derived from the shipped file's own primitive arguments, against what the
// driver actually received. They are computed by completely different routes — one parses
// geometry arguments, the other counts GL calls — so agreement is evidence and disagreement is
// a finding rather than a bug to paper over.
const authored = authoredTriangles(report.census);
const delta = Math.round(zoom.triangles) - authored.triangles;

console.log('THE SHIPPED PATH, ONE ISLAND');
console.log(`  drawables: ${Object.entries(report.census).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  authored triangles (from the primitives): ${authored.triangles}`);
console.log(`  measured triangles (GL calls):            ${Math.round(zoom.triangles)}  [delta ${delta}]`);
for (const k of authored.byKind) {
  console.log(`    ${k.kind.padEnd(20)} ${String(k.drawables).padStart(3)} x  = ${k.triangles}`);
}
console.log('  not drawn at all:');
for (const u of SHIPPED_UNDRAWN) console.log(`    ${u.kind.padEnd(20)} ${u.why}`);
console.log('');

console.log('PER MOUNT');
for (const [tag, r] of panels) {
  console.log(
    `  ${tag.padEnd(18)} ${r.widthPx}x${r.heightPx}px  ${String(r.calls).padStart(4)} calls  ` +
      `${String(Math.round(r.triangles)).padStart(6)} tris  ` +
      `${r.scaleAtTarget.toFixed(2)} px/unit at target (${r.scaleNear.toFixed(2)}–${r.scaleFar.toFixed(2)} across)`,
  );
}
console.log('');
const classic = report.panels['shipped-classic'];
if (classic) {
  console.log('');
  console.log('THE CONTROL — the same canvas on the CLASSIC hex substrate it was written for');
  console.log(`  ${Math.round(classic.triangles)} triangles over ${classic.calls.toFixed(1)} draw calls/frame`);
  // ⚠ NON-VACUITY. The mesh-substrate mounts draw only a story tree; if the control drew the
  // same it would mean the mapper is broken outright rather than pointed at the wrong
  // representation, and the whole finding would change shape.
  if (Math.round(classic.triangles) <= Math.round(zoom.triangles)) {
    refuse(
      'the CLASSIC-substrate control drew no more than the mesh-substrate mount. The finding ' +
        'is that the mapper works and is pointed at a representation the product no longer ' +
        'produces; if the control draws nothing either, that finding is wrong.',
    );
  }
}

console.log('');
// ⚠ TAKEN OFF THE CONTROL, and it has to be. The mesh-substrate mounts draw ONE object, so
// their "island" is a single point and the near/far spread is 0.0% — a figure that is true
// about the measurement and says nothing about the renderer. The control has real extent.
if (classic) {
  const spread = (classic.scaleNear / classic.scaleFar - 1) * 100;
  console.log(
    `PERSPECTIVE SPREAD (off the classic control, the only mount with real extent): the shipped ` +
      `canvas delivers ${spread.toFixed(1)}% more px/unit at the near edge of the island than at the far one.`,
  );
  console.log('  The harness is ORTHOGRAPHIC, so its px/ground-unit is one number by construction.');
} else {
  console.log('PERSPECTIVE SPREAD: NOT ESTABLISHED — the control mount filed no reading.');
}

// ── the pictures ────────────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
// ⚠ THE CANVAS, NOT ITS WRAPPER. Screenshotting the padded `.stage` div bakes in the page's
// checkerboard border, and the sheet's content-crop then reads that border as the background
// colour and crops nothing — which is how the first sheet came out 70% empty black.
for (const tag of ['shipped-overview', 'shipped-zoom', 'shipped-classic']) {
  const el = page.locator(`[data-st-tag="${tag}"] canvas`).first();
  await el.screenshot({ path: join(OUT, `${tag}.png`) });
}
for (const tag of ['harness-overview', 'harness-zoom', 'harness-classic-compare']) {
  const el = page.locator(`canvas[data-st-tag="${tag}"]`).first();
  if ((await el.count()) > 0) await el.screenshot({ path: join(OUT, `${tag}.png`) });
}

writeFileSync(
  join(OUT, 'baseline.json'),
  `${JSON.stringify({ url: URL, wantGpu: WANT_GPU, ...report, authored, measuredVsAuthoredDelta: delta }, null, 2)}\n`,
);
console.log(`\nwrote ${OUT}`);

await browser.close();
