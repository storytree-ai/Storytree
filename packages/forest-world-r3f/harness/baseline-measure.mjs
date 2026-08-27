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

import { BEFORE_THE_CELL_CASE, SHIPPED_UNDRAWN, authoredTriangles } from './shipped-baseline.ts';

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
if (panels.length < 7) refuse(`only ${panels.length} panel(s) filed a reading; expected seven shipped mounts`);
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
// ⚠ THE PARCEL TOTAL MUST BE PASSED IN. `authoredTriangles(census)` alone still returns a
// number, and until 2026-08-28 that number was right — the story tree alone. It is now an
// undercount by the entire ground, and it would go on being reported with the same authority.
const authored = authoredTriangles(report.census, report.cellGroundTriangles ?? 0);
const delta = Math.round(zoom.triangles) - authored.triangles;
if (delta !== 0) {
  refuse(
    `authored ${authored.triangles} triangles, the driver counted ${Math.round(zoom.triangles)}.\n` +
      'These are computed by entirely different routes — one from the shipped file\'s primitive\n' +
      'arguments, one from the GL calls the driver received — so a disagreement means one of them\n' +
      'is describing a scene that is not being drawn. Do not report either number until it is zero.',
  );
}

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
  console.log('THE CONTROL — the same canvas on the CLASSIC hex substrate');
  console.log(`  ${Math.round(classic.triangles)} triangles over ${classic.calls.toFixed(1)} draw calls/frame`);
  // ⚠ NON-VACUITY, RE-AIMED. Until the `cell` case landed this asked whether the control drew
  // MORE than the mesh mount, because the mesh mount drew nothing. That question is now
  // meaningless — the mesh mount draws a whole island. What has to be checked instead is that
  // the classic path STILL WORKS: a mapper re-pointed from `tile` to `cell`, rather than taught
  // both, would draw the island and nothing here, which is the same defect facing the other way.
  if (!(classic.triangles > 0)) {
    refuse(
      'the CLASSIC-substrate control drew nothing. The `cell` case was meant to ADD a\n' +
        'representation, not replace one; if the classic hex path has stopped drawing, the fix\n' +
        'traded the reported defect for its mirror image.',
    );
  }
}

/* ── ⚠⚠ THE BEFORE/AFTER REFUSALS — the claim this run exists to make ─────────────────────────
   The BEFORE panel is today's mapper with `cell-ground` filtered out, which reproduces the old
   drawable set exactly (every parcel used to come back as a skip, and a skip is not drawn). That
   is an argument, so it is checked: the panel must land on the 144 triangles over 2 draw calls
   PR #1679 measured on this same GPU before the fix existed. A reconstruction that agrees with a
   number taken beforehand is evidence; one that only agrees with itself is decoration. */
const before = report.panels['shipped-before'];
if (!before) refuse('the BEFORE panel filed no reading — there is no comparison to report');

console.log('');
console.log('BEFORE → AFTER, the same component on the same island in the same run');
console.log(`  BEFORE  ${Math.round(before.triangles)} tris over ${before.calls.toFixed(1)} calls/frame`);
console.log(`  AFTER   ${Math.round(overview.triangles)} tris over ${overview.calls.toFixed(1)} calls/frame`);
console.log(`  ground  ${report.cellGroundTriangles} tris across ${report.census['cell-ground'] ?? 0} parcels`);

if (Math.round(before.triangles) !== BEFORE_THE_CELL_CASE.triangles) {
  refuse(
    `the BEFORE panel drew ${Math.round(before.triangles)} triangles; PR #1679 measured ` +
      `${BEFORE_THE_CELL_CASE.triangles} on this GPU before the fix.\n` +
      'The reconstruction does not reproduce the state it claims to, so the comparison is void.',
  );
}
if (Math.round(before.calls) !== BEFORE_THE_CELL_CASE.drawCalls) {
  refuse(
    `the BEFORE panel drew ${before.calls} draw calls; PR #1679 measured ` +
      `${BEFORE_THE_CELL_CASE.drawCalls} before the fix.`,
  );
}
if (!(overview.triangles > before.triangles)) {
  refuse('the AFTER panel drew no more than the BEFORE panel — the ground did not arrive');
}

/* ── ⚠⚠ THE GROUND STILL REPORTS — the fence, checked rather than looked at ────────────────────
   ADR-0392 D5 / ADR-0398 D7 put the land's colour beyond an art call: it is a capability's proof
   state, and a ground that draws beautifully while misreporting it is a REGRESSION. The mixed
   panel gives one capability a foreign status. Two things must hold together, and each alone is
   satisfied by a defect: the parcels must come back in MORE THAN ONE state (else the ground is
   ignoring status), and the two panels must draw IDENTICAL geometry (else something other than
   the colour varies with the status and the comparison is confounded — ADR-0462's premise
   refusal, in the shape this arc has settled on). */
const mixedStates = Object.keys(report.mixedMaterials ?? {});
const uniform = report.panels['shipped-uniform'];
const mixed = report.panels['shipped-mixed'];
if (!uniform || !mixed) refuse('the status-reporting row filed no reading — the fence is unchecked');
console.log('');
console.log('THE GROUND STILL REPORTS');
console.log(`  mixed island parcels by state: ${Object.entries(report.mixedMaterials).map(([k, v]) => `${v} ${k}`).join(' · ')}`);
if (mixedStates.length < 2) {
  refuse(
    `the mixed island came back in ${mixedStates.length} state(s): ${mixedStates.join(', ') || '(none)'}.\n` +
      'One capability was given a foreign status; a ground that draws one colour anyway has\n' +
      'stopped reporting, which is the one way this work can do real harm.',
  );
}
if (Math.round(uniform.triangles) !== Math.round(mixed.triangles) || Math.round(uniform.calls) !== Math.round(mixed.calls)) {
  refuse(
    `the uniform and mixed panels drew different geometry (${uniform.triangles}/${uniform.calls} vs ` +
      `${mixed.triangles}/${mixed.calls}).\nSomething other than the colour varies with the status, ` +
      'so the row does not show what it claims to.',
  );
}
console.log(`  both panels drew ${Math.round(uniform.triangles)} triangles over ${uniform.calls.toFixed(1)} calls — only the colour differs`);

// ⚠ THE DRAW-CALL CEILING IS THE POINT OF THE MERGED BUFFER, so it is refused rather than
// reported. 164 parcels are arbitrary polygons: they cannot share a geometry, so instancing is
// unavailable and the naive shape is one mesh each — 164 extra draw calls to draw ground the
// classic substrate drew in ONE. Restoring the ground at that price would be a regression on the
// metric `hardware-floor.*` actually sweeps, dressed as a fix.
const extraCalls = Math.round(overview.calls) - Math.round(before.calls);
console.log(`  the whole ground cost ${extraCalls} extra draw call(s)`);
if (extraCalls > 1) {
  refuse(
    `restoring the ground cost ${extraCalls} extra draw calls. The parcels are meant to merge ` +
      'into ONE buffer;\nmore than one call means the merge is not happening and the cost scales ' +
      'with the island.',
  );
}

console.log('');
// ⚠ TAKEN OFF THE CONTROL. Until the `cell` case landed this HAD to be, because the
// mesh-substrate mounts drew ONE object — a single point, whose near/far spread is 0.0%, a
// figure true about the measurement and silent about the renderer. The mesh mounts now have real
// extent too, so the control is no longer the only source; it is kept as the source so the
// figure stays comparable with the one PR #1679 published (5.1%).
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
for (const tag of [
  'shipped-before',
  'shipped-overview',
  'shipped-overview-2',
  'shipped-uniform',
  'shipped-mixed',
  'shipped-zoom',
  'shipped-classic',
]) {
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
