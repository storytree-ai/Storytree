// real-forest-measure.mjs — drive `real-forest.html`: storytree's REAL forest through the 3D
// renderer, photographed and measured, and written out as frames, numbers and a report.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5418 --strictPort --host 127.0.0.1
//   DISPLAY=:0 ST_REAL_URL=http://127.0.0.1:5418/real-forest.html \
//     pnpm --filter @storytree/forest-world-r3f measure-real-forest
//   (the scenes exported first by apps/studio/scripts/export-real-forest.mjs)
//
// ⚠ DISPLAY=:0 MUST BE IN THE ENVIRONMENT EVEN HEADLESS on the RTX box, or the working ANGLE flags
// fall back to SwiftShader and every figure is a software figure. The refusal below is what catches
// it; do not set ST_REAL_ALLOW_SOFTWARE to get past it and then quote a frame cost.
//
// ⚠ EVERY REFUSAL IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE MAP: a software
// rasteriser; a camera that is not the signed 50°; an island whose land is not the shipped ratio;
// fewer islands than the export recorded; a `matched` picture whose px/unit is not the 2D map's own
// delivered scale; and a page that reported errors.
//
// ⚠ IT DECIDES NOTHING. Frame cost REPORTS (ADR-0517 D4). The Adreno X1-85 acceptance floor of
// ADR-0380 D2 is NOT measured here and the report says so in terms — this box has an RTX 2060 and
// no Adreno, and an unmeasured number reported as measured is the failure mode this whole page
// exists to avoid.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import { LAND_AREA_PER_CAPABILITY } from '../src/land-per-capability.ts';
import { REAL_ARMS, REAL_FOREST_EVIDENCE_DIR, REAL_FOREST_PICTURES, REAL_READ_ZOOM } from './real-forest-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_REAL_URL'] ?? 'http://localhost:5418/real-forest.html';
const OUT = process.env['ST_REAL_OUT'] ?? join(HERE, '..', '..', '..', 'docs', 'research', REAL_FOREST_EVIDENCE_DIR);
const ANGLE = process.env['ST_REAL_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_REAL_ALLOW_SOFTWARE'] === '1';
const COST_BATCH = Number(process.env['ST_REAL_COST_BATCH'] ?? 60);

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_REAL_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
      'worktree may own it, and the numbers would be its tree rather than this one. Start the ' +
      'harness on a port of your own with --port <n> --strictPort.',
  );
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', `--use-angle=${ANGLE}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.realForestRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const PICTURES = REAL_FOREST_PICTURES.map((p) => p.id);

const result = await page.evaluate(
  async ([pictures, batch]) => {
    const r = window.realForestRunner;
    const rows = [];
    for (const p of pictures) rows.push(r.read(p));
    const frames = {};
    for (const p of pictures) frames[p] = r.snapshot(p, 'map');
    // the one arm worth SEEING beside the map rather than only reading: the same forest with the
    // slope-gated rock layer off, which is what the status numbers attribute the misread to.
    for (const p of pictures) frames[`${p}-norock`] = r.snapshot(p, 'norock');
    const costs = [];
    for (const p of pictures) costs.push(await r.cost({ picture: p, batch }));
    return {
      manifest: r.manifest(),
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      projection: r.projection(),
      extents: r.extents(),
      rows,
      frames,
      costs,
    };
  },
  [PICTURES, COST_BATCH],
);
if (pageErrors.length > 0) fail(`the page reported errors while measuring:\n  ${pageErrors.join('\n  ')}`);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Put DISPLAY=:0 in the environment ` +
      'so headless chromium reaches the GPU, or ST_REAL_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
      'anyway — and do not quote a software frame cost as this map’s.',
  );
}

const arm = result.manifest.arms[0];
const at = (p) => result.rows.find((r) => r.picture === p);

for (const row of result.rows) {
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 0.05) {
    fail(`${row.picture}: the camera looks down at ${row.elevationDeg.toFixed(2)}°, not the signed ${RENDER_ELEV_DEG}°`);
  }
  if (row.bounds.islands !== arm.islands) {
    fail(`${row.picture}: ${row.bounds.islands} islands rendered against the ${arm.islands} the export recorded`);
  }
  const per = row.bounds.unitsPerCapability;
  if (Math.abs(per.min - LAND_AREA_PER_CAPABILITY) > 0.5 || Math.abs(per.max - LAND_AREA_PER_CAPABILITY) > 0.5) {
    fail(`${row.picture}: land per capability spans ${per.min.toFixed(2)}–${per.max.toFixed(2)}, not the shipped ${LAND_AREA_PER_CAPABILITY}`);
  }
  if (row.tightest.overlap) fail(`${row.picture}: two 3D islands OVERLAP (${row.tightest.a} / ${row.tightest.b}) — the layout is not drawable as land`);
  for (const a of REAL_ARMS) {
    const v = row.status[a.id];
    if (!v || v.islands.length === 0) fail(`${row.picture}/${a.id}: no island reached the status reader, so its verdict is vacuous`);
    if (v.islands.length !== row.status.map.islands.length) {
      fail(`${row.picture}/${a.id}: the arms saw different island populations, so they are not comparable`);
    }
  }
}
const matched = at('matched');
if (Math.abs(matched.pxPerUnit - result.projection.matchedPxPerUnit) > 1e-9) {
  fail(`the matched picture rendered at ${matched.pxPerUnit} px/unit, not the 2D map's own delivered ${result.projection.matchedPxPerUnit}`);
}
if (at('one').pxPerUnit !== REAL_READ_ZOOM) fail(`the read picture rendered at ${at('one').pxPerUnit} px/unit, not the read zoom ${REAL_READ_ZOOM}`);

// ---- the frames
const written = [];
for (const [id, dataUrl] of Object.entries(result.frames)) {
  const file = join(OUT, `3d-${id}.png`);
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  written.push(file);
}

// ---- the numbers
const measurements = {
  measuredAt: new Date().toISOString(),
  renderer: result.id,
  calibration: result.calibration,
  kits: result.kits,
  map: { generatedAt: result.manifest.generatedAt, studio: result.manifest.studio, arm },
  projection: result.projection,
  extents: result.extents,
  landAreaPerCapability: LAND_AREA_PER_CAPABILITY,
  costBatch: COST_BATCH,
  rows: result.rows,
  costs: result.costs,
};
writeFileSync(join(OUT, 'measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`);

// ---- the report
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const e = result.extents;
const fit = at('fit');
const one = at('one');
const verdictLine = (v) => {
  const passed = v.islands.filter((i) => i.pass).length;
  const empty = v.islands.filter((i) => i.empty).length;
  const worst = [...v.islands].sort((a, b) => a.ownShare - b.ownShare)[0];
  return (
    `${passed}/${v.islands.length} read as their own status family` +
    (empty > 0 ? `, ${empty} with NO ground pixel in their rect` : '') +
    (worst ? ` · weakest ${worst.id} (${worst.status}) own-share ${pct(worst.ownShare)}, read ${worst.readFamily ?? 'nothing'}` : '')
  );
};
const lines = [
  "STORYTREE'S REAL FOREST, THROUGH THE 3D RENDERER — the first time anyone has seen it",
  `measured ${measurements.measuredAt}`,
  `renderer  ${result.id.vendor} — ${result.id.renderer} (software=${result.id.software}, timer query=${result.id.timerQuery})`,
  `map       ${arm.islands} islands, exported ${result.manifest.generatedAt} from the studio at ${result.manifest.studio.head.slice(0, 8)} (${result.manifest.studio.branch})`,
  `tile      ${arm.tile.quota}, hex circumradius ${arm.tile.hexR.toFixed(3)} (ADR-0528: derived)`,
  `trails    ${arm.trails.edges} edges routed, ${arm.trails.dropped.length} dropped`,
  '',
  '1. THE REAL LAYOUT AGAINST THE SYNTHETIC CROWD — both read by the same function',
  `   real       ${e.real.w.toFixed(0)} × ${e.real.d.toFixed(0)} ground units (${e.realIslands} islands), depth/width ${e.realDepthOverWidth.toFixed(2)}`,
  `   synthetic  ${e.synthetic.w.toFixed(0)} × ${e.synthetic.d.toFixed(0)} ground units (${e.syntheticIslands} islands), depth/width ${e.syntheticDepthOverWidth.toFixed(2)}`,
  `   ratio      width ×${e.widthRatio.toFixed(2)}, depth ×${e.depthRatio.toFixed(2)}, area ×${e.areaRatio.toFixed(2)}`,
  '',
  '2. FRAME COST AT THE REAL EXTENT — on the RTX 2060, REPORTING (ADR-0517 D4)',
  ...result.costs.map(
    (c) =>
      `   ${String(c.picture).padEnd(8)} ${c.gpuMsPerFrame === null ? 'no GPU clock' : `${c.gpuMsPerFrame.toFixed(3)} ms/frame`}` +
      ` · ${c.drawCalls} draw calls · ${c.triangles.toLocaleString()} triangles${c.disjoint ? ' · DISJOINT (unusable)' : ''}`,
  ),
  '   ⚠ THE ADR-0380 D2 ACCEPTANCE FLOOR (Adreno X1-85) WAS NOT MEASURED. This box has an RTX 2060',
  '     and no Adreno; nothing above is a floor figure and none of it may be quoted as one.',
  '',
  '3. THE SHADOW FIELD AT THE REAL EXTENT',
  `   occlusion coverage ${pct(fit.occlusionCoverage)} of the shipped atlas — one field over the whole forest`,
  '',
  '4. ARE THE SIX STATUS TERRAINS STILL SEPARABLE AT THE REAL MAP’S ZOOM?',
  `   ${REAL_ARMS.length} ARMS, each moving exactly one thing, so a misread can be attributed:`,
  ...REAL_ARMS.map((a) => `     ${a.id.padEnd(11)} ${a.what}`),
  ...result.rows.flatMap((row) => [
    `   ${String(row.picture).padEnd(8)} ${row.pxPerUnit.toFixed(3)} px/unit · ${row.islandsInFrame} in frame · ` +
      `smallest island rect ${row.islandRectPx.min.toFixed(0)} px², median ${row.islandRectPx.median.toFixed(0)} px²`,
    ...REAL_ARMS.map((a) => `              ${a.id.padEnd(11)} ${verdictLine(row.status[a.id])}`),
    ...REAL_ARMS.map((a) => {
      const g = row.readGround[a.id];
      const k = row.readGroundCore[a.id];
      const c = (x) => `rgb(${String(x.r).padStart(3)},${String(x.g).padStart(3)},${String(x.b).padStart(3)})`;
      return (
        `              ${a.id.padEnd(11)} ${g.island} (${g.status}) delivered ${c(g.median)} over its rect → ${g.nearest}, ` +
        `${c(k.median)} over its core → ${k.nearest}; the reader models ${g.status} from ${c(g.expected.darkest)} to ${c(g.expected.brightest)}`
      );
    }),
  ]),
  `   zero-separation pairs in the palette: ${fit.status.map.zeroPairs.map((p) => p.join('/')).join(', ') || 'none'}` +
    ' (ADR-0462 merged proposed/building onto one token — a measured identity, not a defect)',
  '',
  'THE PROJECTION THE TWO SURFACES DO NOT SHARE',
  `   the 2D map draws at ${result.projection.drawnElevationDeg}°; this canvas views true ground at ${result.projection.viewedElevationDeg}°,`,
  `   so depth delivers ${result.projection.depthGain.toFixed(2)}× more screen height in 3D. x is untouched by either,`,
  `   which is why the "matched" picture is taken at the 2D map's own ${result.projection.matchedPxPerUnit.toFixed(4)} px per world x unit.`,
  '',
  'THE PICTURES',
  ...result.rows.map(
    (row) =>
      `   3d-${row.picture}.png — ${row.pxPerUnit.toFixed(3)} px/unit · land ${pct(row.landShare)} of the frame, ` +
      `${pct(row.landShareOfBox)} of its own box · ${row.families} colour families · ${row.groundTriangles.toLocaleString()} ground triangles`,
  ),
  `   2d-fit.png / 2d-resting.png — the studio's own SVG map of the same forest, same 2560×1600 buffer`,
  '',
  ...REAL_ARMS.map((a) => `read island at ${REAL_READ_ZOOM} px/unit — ${a.id}: ${verdictLine(one.status[a.id])}`),
];
const report = `${lines.join('\n')}\n`;
writeFileSync(join(OUT, 'report.txt'), report);
await browser.close();

console.log(report);
console.log(`→ ${OUT}\n  ${written.join('\n  ')}`);
