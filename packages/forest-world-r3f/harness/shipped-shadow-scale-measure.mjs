// shipped-shadow-scale-measure.mjs — drive `shipped-shadow-scale.html`: the contact pool, the tree's
// cast silhouette and the depth, each laddered, measured on three grounds and written out as
// frames, numbers and a report. Run it on the arc's named box (the RTX 2060, ADR-0505 D3).
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5421 --strictPort --host 127.0.0.1
//   ST_SCALE_URL=http://127.0.0.1:5421/shipped-shadow-scale.html pnpm --filter @storytree/forest-world-r3f measure-shipped-shadow-scale
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE SHADOW: a
// software rasteriser; an insensitive delta instrument; a control that differs from itself; a
// camera that is not the signed elevation; an arm whose ground mesh or placement list differs from
// the control's (a shadow changes the FIELD, never the mesh or what stands); a rung byte-identical to
// its neighbour; a shipped arm that coincides with NO rung of a ladder (a pick has to be a rung the
// owner saw); a pool ladder whose soft-band occupancy does not FALL as the pool narrows; a width
// ladder whose full-band occupancy does not FALL as the cone narrows; a depth ladder whose land does
// not get LIGHTER as the rung rises; and an arm that drew no kit or more than one ground draw.
//
// ⚠ IT DECIDES NOTHING ABOUT COST. The mount-time stamp and the GPU frame are measured and REPORTED
// (ADR-0517 D4). The picks are made on the LOOK, on three grounds (ADR-0503 / ADR-0489 D3), and land
// in `src/contact-shade.ts`, `src/ground-casters.ts` and `src/shadow-rung.ts`.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { CONTACT_SPREAD } from '../src/contact-shade.ts';
import { TREE_SHADOW_WIDTH } from '../src/ground-casters.ts';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import { SHADOW_DEPTH } from '../src/shadow-rung.ts';
import {
  DEPTH_ARMS,
  DEPTH_LADDER,
  POOL_ARMS,
  POOL_LADDER,
  SCALE_ARMS,
  SCALE_CONTROL_ARM,
  SCALE_PICTURES,
  SCALE_SHIPPED_ARM,
  TODAY_PICKS,
  WIDTH_ARMS,
  WIDTH_LADDER,
  sameScaleArm,
  scaleArmCaption,
  scaleArmSpec,
  scaleArmsFor,
  scaleNeighbourArm,
} from './shipped-shadow-scale-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_SCALE_URL'] ?? 'http://localhost:5421/shipped-shadow-scale.html';
const OUT = process.env['ST_SCALE_OUT'] ?? join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shadow-scale-back-2026-09-06');
const ANGLE = process.env['ST_SCALE_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_SCALE_ALLOW_SOFTWARE'] === '1';
const COST_BATCH = Number(process.env['ST_SCALE_BATCH'] ?? '60');

const SHOTS = SCALE_PICTURES.flatMap((p) => scaleArmsFor(p.id).map((arm) => ({ picture: p.id, arm })));

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_SCALE_URL points at 5184, the port every worktree's vite pins by default — a sibling worktree " +
      'may own it, and the numbers would be its tree rather than this one. Start the harness on a port of ' +
      'your own with --port <n> --strictPort.',
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
await page.waitForFunction(() => window.shadowScaleRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([shots, batch, control, shipped]) => {
    const r = window.shadowScaleRunner;
    const rows = [];
    for (const { picture, arm } of shots) rows.push(r.read(arm, picture));
    const frames = {};
    for (const { picture, arm } of shots) frames[`${arm}-${picture}`] = r.snapshot(arm, picture);
    const costs = [];
    for (const arm of [control, shipped]) costs.push(await r.cost({ arm, picture: 'green', batch }));
    return {
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      layout: r.layout(),
      rows,
      frames,
      costs,
      margins: r.margins(),
      sensitivity: [...r.sensitivity('green'), ...r.sensitivity('yellow')],
    };
  },
  [SHOTS, COST_BATCH, SCALE_CONTROL_ARM, SCALE_SHIPPED_ARM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set DISPLAY=:0 on the Mint box so ` +
      'headless chromium reaches the GPU, or ST_SCALE_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers anyway — ' +
      'and do not quote a software frame as this map’s picture.',
  );
}
if (result.sensitivity.length > 0) {
  fail(`the visible-delta instrument failed its own sensitivity rung, so no reading below means anything:\n  ${result.sensitivity.join('\n  ')}`);
}

const at = (arm, picture) => result.rows.find((r) => r.arm === arm && r.picture === picture);

// The shipped arm has to BE a rung of each ladder it claims a pick from.
const shippedSpec = scaleArmSpec(SCALE_SHIPPED_ARM);
const coincides = SCALE_ARMS.filter((a) => a.id !== SCALE_SHIPPED_ARM && sameScaleArm(a, shippedSpec)).map((a) => a.id);
for (const [name, ladder] of [['pool', POOL_ARMS], ['width', WIDTH_ARMS], ['depth', DEPTH_ARMS]]) {
  if (!coincides.some((id) => ladder.includes(id))) fail(`the shipped arm (${scaleArmCaption(SCALE_SHIPPED_ARM)}) coincides with NO rung of the ${name} ladder — a pick has to be a rung the owner saw`);
}

for (const row of result.rows) {
  const where = `${row.arm} at ${row.picture}`;
  if (row.landPx === 0) fail(`${where} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${where} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) fail(`${where} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 1e-6) fail(`${where} is not judged from the signed ${RENDER_ELEV_DEG}° (${row.elevationDeg})`);
  const control = at(SCALE_CONTROL_ARM, row.picture);
  if (row.groundTriangles !== control.groundTriangles) fail(`${where} has ${row.groundTriangles} ground triangles against the control's ${control.groundTriangles} — a shadow changed the MESH`);
  if (row.placements !== control.placements) fail(`${where} stands a different list from the control — the arms differ in more than the shadow`);
  if (row.casters !== control.casters) fail(`${where} casts from ${row.casters} casters against the control's ${control.casters} — the arms differ in WHAT casts, not how`);
  if (row.pxPerUnit !== control.pxPerUnit) fail(`${where} is not on the control's frame`);
}

for (const pic of SCALE_PICTURES) {
  const control = at(SCALE_CONTROL_ARM, pic.id);
  if (control.touched !== 0) fail(`the CONTROL arm differs from itself at ${pic.id} (${control.touched} px) — the denominator is not a denominator`);
  const s = at(SCALE_SHIPPED_ARM, pic.id);
  if (s.touched === 0) fail(`the shipped arm is byte-identical to the control at ${pic.id} — nothing shipped`);
}

// ⚠ THE LADDERS MUST ACTUALLY MOVE THE PICTURE rung to rung on BOTH mono grounds, and move it the way
// each lever claims.
for (const pic of ['green', 'yellow']) {
  for (const arm of scaleArmsFor(pic)) {
    if (arm === SCALE_CONTROL_ARM) continue;
    const row = at(arm, pic);
    const n = scaleNeighbourArm(arm);
    if (n !== null && row.touchedVsNeighbour === 0) fail(`${arm} at ${pic} is byte-identical to ${n} — the rung is not reaching the picture`);
  }
  // The pool ladder: a narrower pool puts LESS of the field in the soft band; the full band is untouched.
  let lastSoft = Infinity;
  for (const arm of POOL_ARMS) {
    const row = at(arm, pic);
    const soft = row.fieldSoft - row.fieldFull;
    if (soft >= lastSoft) fail(`${arm} at ${pic}: the soft band (${soft}) is not narrower than the rung above (${lastSoft})`);
    if (row.fieldFull !== at(POOL_ARMS[0], pic).fieldFull) fail(`${arm} at ${pic} moved the FULL band (${row.fieldFull} vs ${at(POOL_ARMS[0], pic).fieldFull}) — the pool reached the cast term`);
    lastSoft = soft;
  }
  if (at(POOL_ARMS[POOL_ARMS.length - 1], pic).spec.pool !== 0) fail('the pool ladder does not end at no pool');
  // The width ladder: a narrower cone puts LESS of the field past the full threshold.
  let lastFull = Infinity;
  for (const arm of WIDTH_ARMS) {
    const row = at(arm, pic);
    if (row.fieldFull >= lastFull) fail(`${arm} at ${pic}: the full band (${row.fieldFull}) is not narrower than the rung above (${lastFull})`);
    lastFull = row.fieldFull;
  }
  // The depth ladder: the land gets DARKER as the rung deepens (the ladder is listed lightest first);
  // the field is the SAME on every rung.
  let lastP50 = Infinity;
  for (const arm of DEPTH_ARMS) {
    const row = at(arm, pic);
    if (row.luma.p50 >= lastP50) fail(`${arm} at ${pic}: the median land luma (${row.luma.p50}) is not darker than the rung above (${lastP50})`);
    lastP50 = row.luma.p50;
    const first = at(DEPTH_ARMS[0], pic);
    if (row.fieldFull !== first.fieldFull || row.fieldSoft !== first.fieldSoft) fail(`${arm} at ${pic} is not on the same field as ${DEPTH_ARMS[0]} — the depth ladder moved the field`);
  }
  // The shipped arm coincides with its rungs in pixels too.
  for (const id of coincides) {
    const row = at(id, pic);
    if (row.touchedVsShipped !== 0) fail(`${id} at ${pic} claims to be the shipped arm by spec and differs from it by ${row.touchedVsShipped} px`);
  }
}

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};
const pct = (x, d = 2) => `${(x * 100).toFixed(d)}%`;
say(`renderer: ${result.id.vendor} — ${result.id.renderer}`);
say(`software=${result.id.software}`);
say(
  `light probe: a lit white face delivered ${result.calibration.probe.toFixed(4)} at the authored intensities; ` +
    `scale ${result.calibration.scale.toFixed(4)} onto the ladder's ${result.calibration.target}; floor ${result.calibration.floor}`,
);
say(`layout (forest picture): ${result.layout.id} — ${result.layout.islands} islands, exported ${result.layout.generatedAt} from studio ${result.layout.head}`);
say(`elevation: ${RENDER_ELEV_DEG}° on every arm`);
say(`ships: pool ${CONTACT_SPREAD} of the derived reach · cone ${TREE_SHADOW_WIDTH} of the crown · depth ${SHADOW_DEPTH} → the shipped arm coincides with: ${coincides.join(', ')}`);
say(`control (typed as history — the map after PR #1841 / #1845): pool ${TODAY_PICKS.pool} · cone ${TODAY_PICKS.width} · depth ${TODAY_PICKS.depth}`);
say('');
say('THE ARMS');
for (const a of SCALE_ARMS) say(`  ${a.id.padEnd(12)} ${scaleArmCaption(a.id)}`);
say('');
for (const pic of SCALE_PICTURES) {
  say(`── ${pic.id} @ ${pic.zoom === 'fit' ? 'fit' : `${pic.zoom} px/unit`} ─────────────────────────────────`);
  say('arm           casters  stamp ms   field full   field soft   pool band   land p05   p50    p95   p05/p95   fam  moved>20 vs today  touched  vs neighbour  vs shipped');
  for (const arm of scaleArmsFor(pic.id)) {
    const r = at(arm, pic.id);
    say(
      `${arm.padEnd(12)} ${String(r.casters).padStart(8)}  ${r.buildMs.toFixed(0).padStart(8)}  ${pct(r.fieldFull).padStart(11)}  ${pct(r.fieldSoft).padStart(11)}  ${pct(r.fieldSoft - r.fieldFull).padStart(10)}  ` +
        `${r.luma.p05.toFixed(1).padStart(8)}  ${r.luma.p50.toFixed(1).padStart(5)}  ${r.luma.p95.toFixed(1).padStart(5)}  ${r.luma.ratio.toFixed(3).padStart(8)}  ` +
        `${String(r.families).padStart(3)}  ${String(r.visible).padStart(17)}  ${String(r.touched).padStart(7)}  ${(r.visibleVsNeighbour === null ? '—' : String(r.visibleVsNeighbour)).padStart(12)}  ${String(r.touchedVsShipped).padStart(10)}`,
    );
  }
  say('');
}

say('THE LAND LUMA HISTOGRAM — share of land pixels per 16-luma bin (crowns and cover included, the background excluded), the depth ladder on both mono grounds:');
const binHead = Array.from({ length: 16 }, (_, i) => String(i * 16).padStart(5)).join('');
say(`  ${'arm'.padEnd(20)}${binHead}`);
for (const pic of ['green', 'yellow']) {
  for (const arm of [SCALE_CONTROL_ARM, ...DEPTH_ARMS, SCALE_SHIPPED_ARM]) {
    say(`  ${`${pic}/${arm}`.padEnd(20)}${at(arm, pic).luma.bins.map((b) => (b * 100).toFixed(1).padStart(5)).join('')}`);
  }
}
say('');
say('THE READER MODEL, PRINTED — margin per token per depth rung (positive reads as its own token; negative is REPORTED, not a fence: ADR-0503 D1 / ADR-0506):');
const levels = [...new Set(result.margins.map((m) => m.level))];
const tokens = [...new Set(result.margins.map((m) => m.token))];
say(`  ${'token'.padEnd(9)} ${levels.map((l) => String(l).padStart(8)).join('')}`);
for (const token of tokens) {
  say(`  ${token.padEnd(9)} ${levels.map((l) => result.margins.find((m) => m.token === token && m.level === l).margin.toFixed(1).padStart(8)).join('')}`);
}
say('  ⚠ the painted tokens (the green and the wheat’s yellow) are sent to the shipped depth; every other token keeps the derived rung.');
say('');
say('THE MOUNT-TIME STAMP — wall-clock ms for the whole shipped ground build, per distinct field:');
const seen = new Set();
for (const r of result.rows) {
  const key = `${r.picture}|${r.spec.pool}|${r.spec.width}`;
  if (seen.has(key)) continue;
  seen.add(key);
  say(`  ${r.picture.padEnd(7)} ${r.arm.padEnd(12)} ${String(r.casters).padStart(6)} casters  ${r.buildMs.toFixed(0).padStart(6)} ms`);
}
say('');
say(`FRAME COST — GPU ms per frame, the green island at ${SCALE_PICTURES[0].zoom} px/unit, ${COST_BATCH} frames on the GPU's own clock (REPORTS, ADR-0517 D4):`);
for (const c of result.costs) {
  say(`  ${c.arm.padEnd(12)} ${c.gpuMsPerFrame === null ? 'no usable timer query' : `${c.gpuMsPerFrame.toFixed(3)} ms`} · ${c.drawCalls} draws · ${c.triangles.toLocaleString()} tris${c.disjoint ? ' · DISJOINT' : ''}${c.hidden ? ' · HIDDEN' : ''}`);
}
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row, an arc intent or an earlier evidence sheet.');
say(`ladders: pool ${POOL_LADDER.join(' / ')} of the derived reach · cone ${WIDTH_LADDER.join(' / ')} of the crown · depth derived / ${DEPTH_LADDER.join(' / ')} (higher is lighter)`);

for (const [name, dataUrl] of Object.entries(result.frames)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'margins.json'), JSON.stringify(result.margins, null, 2));
writeFileSync(join(OUT, 'frame-cost.json'), JSON.stringify(result.costs, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.frames).length} frames + measurements.json + margins.json + frame-cost.json + report.txt to ${OUT} (visible-delta bar ${VISIBLE_DELTA}/255)`);
await browser.close();
