// shipped-blight-measure.mjs — drive `shipped-blight.html`: the unhealthy ground's starkness
// ladder on the REAL forest with one island forced, photographed and measured.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5422 --strictPort --host 127.0.0.1
//   DISPLAY=:0 ST_BLIGHT_URL=http://127.0.0.1:5422/shipped-blight.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-blight
//
// ⚠ DISPLAY=:0 MUST BE IN THE ENVIRONMENT EVEN HEADLESS on the RTX box, or the working ANGLE flags
// fall back to SwiftShader and every figure is a software figure. The refusal below catches it.
//
// ⚠ IT DECIDES NOTHING. The per-pixel reader model and the neighbour separations are REPORTS
// (ADR-0503 D1 / ADR-0506); the look decides (ADR-0489 D3). The one number that is a FENCE is the
// island's distance from the SEA — a metric that scores an island in isolation rewards painting it
// darker right up to invisibility (measured, PR #1792), so the darkest deliverable ground pixel is
// held to ADR-0490 D6's 20/255 above the scene background and a rung that fails it is named.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import {
  BLIGHT_READ_ZOOM,
  CONTROL_ARM,
  FORCED_ISLAND,
  NOCRACKS_ARM,
  SHIPPED_RUNG,
} from './shipped-blight-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = process.env['ST_BLIGHT_DIR'] ?? 'chapter2-unhealthy-ground-2026-09-08';
const URL_ = process.env['ST_BLIGHT_URL'] ?? 'http://localhost:5422/shipped-blight.html';
const OUT = process.env['ST_BLIGHT_OUT'] ?? join(HERE, '..', '..', '..', 'docs', 'research', EVIDENCE_DIR);
const ANGLE = process.env['ST_BLIGHT_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_BLIGHT_ALLOW_SOFTWARE'] === '1';

/** ADR-0490 D6's bar, in delivered luma, between the darkest ground pixel and the sea. */
const SEA_BAR = 20;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_BLIGHT_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.blightRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(async () => {
  const r = window.blightRunner;
  const rows = [];
  const frames = {};
  for (const pic of r.pictures) {
    for (const arm of r.arms) {
      const { reading, png } = await r.render(arm, pic);
      rows.push(reading);
      frames[`${pic}-${arm}`] = png;
    }
  }
  return {
    identity: window.__blightIdentity ?? null,
    palette: r.palette(),
    layout: r.layout(),
    captions: Object.fromEntries(r.arms.map((a) => [a, r.caption(a)])),
    rows,
    frames,
  };
});
if (pageErrors.length > 0) fail(`the page reported errors while measuring:\n  ${pageErrors.join('\n  ')}`);

// The renderer identity, read from the page's own context rather than assumed.
const identity = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (gl === null) return { vendor: 'none', renderer: 'none', software: true };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg === null ? gl.getParameter(gl.RENDERER) : gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  const vendor = dbg === null ? gl.getParameter(gl.VENDOR) : gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
  return { vendor: String(vendor), renderer: String(renderer), software: /swiftshader|llvmpipe|software/i.test(String(renderer)) };
});
if (identity.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${identity.renderer}). Put DISPLAY=:0 in the environment ` +
      'so headless chromium reaches the GPU, or ST_BLIGHT_ALLOW_SOFTWARE=1 to take the numbers anyway ' +
      '— and do not quote a software grain picture as this map’s.',
  );
}

for (const row of result.rows) {
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 0.05) {
    fail(`${row.picture}/${row.arm}: the camera looks down at ${row.elevationDeg.toFixed(2)}°, not the signed ${RENDER_ELEV_DEG}°`);
  }
  if (row.forced.groundPixels === 0) {
    fail(`${row.picture}/${row.arm}: the forced island contributed no ground pixel, so every number about it is vacuous`);
  }
}
const one = result.rows.filter((r) => r.picture === 'one');
if (one.length > 0 && one[0].pxPerUnit !== BLIGHT_READ_ZOOM) {
  fail(`the read picture rendered at ${one[0].pxPerUnit} px/unit, not the read zoom ${BLIGHT_READ_ZOOM}`);
}
// ⚠ THE ARMS MUST ACTUALLY DIFFER. A page that forced nothing, or a material option that never
// reached the shader, would render six identical frames and every separation below would be a
// number about one picture printed six times.
for (const pic of ['forest', 'one']) {
  const inPic = result.rows.filter((r) => r.picture === pic);
  const medians = new Set(inPic.map((r) => `${r.forced.median.r},${r.forced.median.g},${r.forced.median.b}`));
  if (medians.size < inPic.length) {
    fail(`${pic}: ${inPic.length} arms delivered only ${medians.size} distinct medians on the forced island — the ladder is not reaching the shader`);
  }
}

// ---- the frames
const written = [];
for (const [id, dataUrl] of Object.entries(result.frames)) {
  const file = join(OUT, `blight-${id}.png`);
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  written.push(file);
}

// ---- the numbers
const measurements = {
  measuredAt: new Date().toISOString(),
  renderer: identity,
  evidenceDir: EVIDENCE_DIR,
  forcedIsland: FORCED_ISLAND,
  shippedRung: SHIPPED_RUNG,
  palette: result.palette,
  layout: result.layout,
  seaBar: SEA_BAR,
  rows: result.rows,
};
writeFileSync(join(OUT, 'measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`);

// ---- the report
const c = (x) => `rgb(${String(x.r).padStart(3)},${String(x.g).padStart(3)},${String(x.b).padStart(3)})`;

const verdictLine = (v) => {
  const passed = v.islands.filter((i) => i.pass).length;
  const byStatus = {};
  for (const i of v.islands) {
    const e = (byStatus[i.status] ??= { pass: 0, all: 0 });
    e.all += 1;
    if (i.pass) e.pass += 1;
  }
  const per = Object.entries(byStatus)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, e]) => `${k} ${e.pass}/${e.all}`)
    .join(', ');
  return `${passed}/${v.islands.length} islands read as their own status family (${per})`;
};
const armRows = (pic) =>
  result.rows
    .filter((r) => r.picture === pic)
    .flatMap((r) => [
      `   ${r.arm.padEnd(9)} forced island ${c(r.forced.median)} (core ${c(r.forcedCore.median)}) → reader says ${r.forced.nearest}`,
      `             separation ` +
        r.separation.map((s) => `vs ${s.status} (${s.islands}) ${String(s.maxChannel).padStart(3)}`).join('  '),
      `             ${(r.moved.share * 100).toFixed(1)}% of the island's pixels moved past 20/255 against the flat token` +
        ` · median ${r.sea.medianMargin.toFixed(1)} above the sea${r.sea.medianMargin < SEA_BAR ? '  ⚠ BELOW THE BAR' : ''}`,
      `             map-wide: ${verdictLine(r.verdict)}`,
    ]);

const p = result.palette;
const lines = [
  'THE UNHEALTHY GROUND, PAINTED FOR THE READ — a forced-token fixture on the REAL map',
  `measured ${measurements.measuredAt}`,
  `renderer  ${identity.vendor} — ${identity.renderer} (software=${identity.software})`,
  `map       ${result.layout.islands} islands, exported ${result.layout.generatedAt} from the studio at ${String(result.layout.head).slice(0, 8)}`,
  `forced    ${result.layout.forced} → unhealthy · frame status mix ${JSON.stringify(result.layout.statusMix)}`,
  '',
  '⚠ A FORCED-TOKEN FIXTURE. The published map carries NO unhealthy island (21 healthy + 14',
  '  proposed as at 2026-08-28), so nothing here is a live judgement. The control arm is the same',
  '  forced fixture wearing the FLAT token — what the map WOULD draw — not a shipped counterpart.',
  '',
  '1. THE TREATMENT',
  `   token        ${p.token} = ${c(p.tokenRgb)}`,
  `   cracks       the token lifted ${p.crackLift}x = ${c(p.crackRgb)} — the reader calls that colour "${p.crackNearest}"`,
  `   wears        ${p.wears.join(' · ')}`,
  `   drops        ${p.drops.join(' · ')}`,
  `   crack cost   ${p.octaves} lattice-noise octaves on a blighted row; the base paint adds none of its own`,
  `   shipped rung ${SHIPPED_RUNG.id} — burn ${SHIPPED_RUNG.palette.burn.toFixed(2)}, cracks ${SHIPPED_RUNG.palette.crackMix.toFixed(2)}`,
  '',
  '2. THE LADDER — every arm, on both pictures',
  ...Object.entries(result.captions).map(([id, cap]) => `   ${id.padEnd(9)} ${cap}`),
  '',
  '   THE FOREST, FITTED (the acceptance picture)',
  ...armRows('forest'),
  '',
  `   THE FORCED ISLAND AT ${BLIGHT_READ_ZOOM} PX/UNIT`,
  ...armRows('one'),
  '',
  '3. WHAT THE CRACK NETWORK IS WORTH — the attribution the compound rungs cannot give',
  '   ⚠ READ THE PIXEL SHARE, NOT THE MEDIAN. Cracks are thin lines: they move a minority of pixels a',
  '     long way, so the median barely moves while the island\'s appearance changes completely. On the',
  '     first run of this page the median said 3/255 between the burn alone and the shipped rung.',
  ...['forest', 'one'].flatMap((pic) => {
    const flat = result.rows.find((r) => r.picture === pic && r.arm === CONTROL_ARM);
    const noc = result.rows.find((r) => r.picture === pic && r.arm === NOCRACKS_ARM);
    const ship = result.rows.find((r) => r.picture === pic && r.arm === SHIPPED_RUNG.id);
    const gap = (a, b) =>
      Math.max(
        Math.abs(a.forced.median.r - b.forced.median.r),
        Math.abs(a.forced.median.g - b.forced.median.g),
        Math.abs(a.forced.median.b - b.forced.median.b),
      );
    return [
      `   ${pic.padEnd(7)} median  flat → nocracks ${String(gap(flat, noc)).padStart(3)}/255 (the burn alone)` +
        ` · nocracks → ${SHIPPED_RUNG.id} ${String(gap(noc, ship)).padStart(3)}/255 (the cracks alone)`,
      `   ${pic.padEnd(7)} pixels  against the FLAT token: the burn alone moves ${(noc.moved.share * 100).toFixed(1)}% of the island past 20/255,` +
        ` the whole treatment ${(ship.moved.share * 100).toFixed(1)}%`,
      `   ${pic.padEnd(7)} cracks  against the BURN: the crack network alone moves ${(ship.movedVsBurn.share * 100).toFixed(1)}%` +
        ` (${ship.movedVsBurn.pixels.toLocaleString()} of ${ship.movedVsBurn.islandPixels.toLocaleString()} island pixels)` +
        ` and it lifts the island's median from ${noc.sea.medianMargin.toFixed(1)} to ${ship.sea.medianMargin.toFixed(1)} above the sea`,
    ];
  }),
  '',
  '4. HOW IT SEPARATES FROM WHAT THE MAP ACTUALLY DRAWS',
  '   The right-hand number is the largest per-channel gap between the forced island\'s median and',
  '   the median of every island wearing that status IN THE SAME FRAME. ADR-0490 D6 calls 20/255 the',
  '   bar at which a pixel has moved. Reported, never a fence: the look decides (ADR-0489 D3).',
  ...['forest', 'one'].flatMap((pic) => {
    const ship = result.rows.find((r) => r.picture === pic && r.arm === SHIPPED_RUNG.id);
    const flat = result.rows.find((r) => r.picture === pic && r.arm === CONTROL_ARM);
    return [
      `   ${pic.padEnd(7)} flat token   ` + flat.separation.map((s) => `${s.status} ${String(s.maxChannel).padStart(3)}`).join('  '),
      `   ${pic.padEnd(7)} ${SHIPPED_RUNG.id.padEnd(12)}` + ship.separation.map((s) => `${s.status} ${String(s.maxChannel).padStart(3)}`).join('  '),
    ];
  }),
  '',
  '5. THE ONE FENCE — the sea',
  '   A contrast metric that excludes the background rewards painting a surface darker right up to',
  '   invisibility, and it shipped once (PR #1792). ⚠ THE FENCE IS ON THE MEDIAN, NOT THE DARKEST',
  '   PIXEL: the darkest pixel is the deepest shadow rung rather than the paint, and the FLAT token',
  '   already fails a 20/255 reading of it — so that column is direction, not a bar. What must not',
  '   happen is the island as a whole merging with the water.',
  ...result.rows.map(
    (r) =>
      `   ${r.picture.padEnd(7)} ${r.arm.padEnd(9)} median luma ${r.sea.medianLuma.toFixed(1)} → ${r.sea.medianMargin.toFixed(1)} above the sea` +
      `${r.sea.medianMargin < SEA_BAR ? '  ⚠ BELOW THE BAR — MUST NOT SHIP' : ''}` +
      ` · darkest pixel ${r.sea.darkestLuma.toFixed(1)} → ${r.sea.margin.toFixed(1)}${r.sea.margin < 0 ? '  ⚠ DARKER THAN THE SEA' : ''}`,
  ),
  '',
  'THE PICTURES',
  ...Object.keys(result.frames).map((k) => `   blight-${k}.png`),
];
const report = `${lines.join('\n')}\n`;
writeFileSync(join(OUT, 'report.txt'), report);
await browser.close();

console.log(report);
console.log(`→ ${OUT}\n  ${written.join('\n  ')}`);

