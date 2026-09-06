// shipped-cast-shadow-measure.mjs — drive `shipped-cast-shadow.html`: the cast shadow's three
// levers laddered, measured and written out as frames, numbers and a report. Run it on the arc's
// named box (the RTX 2060, ADR-0505 D3) for figures that go in a README.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5379 --strictPort --host 127.0.0.1
//   ST_CAST_SHADOW_URL=http://127.0.0.1:5379/shipped-cast-shadow.html pnpm --filter @storytree/forest-world-r3f measure-shipped-cast-shadow
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE SHADOW: a
// software rasteriser; an insensitive delta instrument; a control that differs from itself; a
// camera that is not the signed 50°; an arm whose ground mesh differs from the control's (a caster
// changes the FIELD, never the mesh); a rung byte-identical to its neighbour; a shipped arm that
// coincides with NO rung of a ladder (a pick has to be a rung the owner saw); the cover arm not
// casting more than the cone arm; an edge ladder whose soft occupancy does not RISE with the
// penumbra; a depth ladder whose darkest grass does not FALL with the rung; and an arm that drew no
// kit or more than one ground draw.
//
// ⚠ IT DECIDES NOTHING ABOUT COST. The mount-time stamp and the GPU frame are measured and
// REPORTED (ADR-0517 D4). The picks are made on the LOOK (ADR-0503 / ADR-0489 D3) and land in
// `src/ground-casters.ts`, `src/land-shadow.ts` and `src/shadow-rung.ts`.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { COVER_CASTS } from '../src/ground-casters.ts';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import { SHADOW_PENUMBRA } from '../src/land-shadow.ts';
import { SHADOW_DEPTH, SHADOW_EDGE } from '../src/shadow-rung.ts';
import {
  CAST_SHADOW_ARMS,
  CAST_SHADOW_PICTURES,
  CONTROL_ARM,
  DEPTH_ARMS,
  DEPTH_LADDER,
  EDGE_ARMS,
  EDGE_LADDER,
  SHIPPED_ARM,
  armCaption,
  armSpec,
  armsFor,
  neighbourArm,
  sameArm,
  zoomFor,
} from './shipped-cast-shadow-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_CAST_SHADOW_URL'] ?? 'http://localhost:5379/shipped-cast-shadow.html';
const OUT =
  process.env['ST_CAST_SHADOW_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-cast-shadows-2026-09-06');
const ANGLE = process.env['ST_CAST_SHADOW_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_CAST_SHADOW_ALLOW_SOFTWARE'] === '1';
const COST_BATCH = Number(process.env['ST_CAST_SHADOW_BATCH'] ?? '60');

const SHOTS = CAST_SHADOW_PICTURES.flatMap((p) => armsFor(p.id).map((arm) => ({ picture: p.id, arm })));

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_CAST_SHADOW_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.castShadowRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([shots, batch, control, shipped]) => {
    const r = window.castShadowRunner;
    const rows = [];
    for (const { picture, arm } of shots) rows.push(r.read(arm, picture));
    const reference = await r.reference('/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png');
    const frames = {};
    for (const { picture, arm } of shots) frames[`${arm}-${picture}`] = r.snapshot(arm, picture);
    const costs = [];
    for (const arm of [control, shipped]) costs.push(await r.cost({ arm, picture: 'one', batch }));
    return {
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      agreement: r.agreement(),
      rows,
      reference,
      frames,
      costs,
      margins: r.margins(),
      sensitivity: r.sensitivity('one'),
    };
  },
  [SHOTS, COST_BATCH, CONTROL_ARM, SHIPPED_ARM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set DISPLAY=:0 on the Mint box so ` +
      'headless chromium reaches the GPU, or ST_CAST_SHADOW_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
      'anyway — and do not quote a software frame as this map’s picture.',
  );
}
if (result.agreement.length > 0) fail(`the camera is not what the arms claim:\n  ${result.agreement.join('\n  ')}`);
if (result.sensitivity.length > 0) {
  fail(`the visible-delta instrument failed its own sensitivity rung, so no reading below means anything:\n  ${result.sensitivity.join('\n  ')}`);
}

const at = (arm, picture) => result.rows.find((r) => r.arm === arm && r.picture === picture);

// The shipped arm has to BE a rung of each ladder it claims a pick from.
const shippedSpec = armSpec(SHIPPED_ARM);
const coincides = CAST_SHADOW_ARMS.filter((a) => a.id !== SHIPPED_ARM && sameArm(a, shippedSpec)).map((a) => a.id);
if (coincides.length === 0) {
  fail(`the shipped arm (${armCaption(SHIPPED_ARM)}) coincides with NO rung on the page — a pick has to be a rung the owner saw`);
}

for (const row of result.rows) {
  const where = `${row.arm} at ${row.picture}`;
  if (row.landPx === 0) fail(`${where} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${where} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) fail(`${where} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 1e-9) fail(`${row.arm} is not judged from the signed ${RENDER_ELEV_DEG}°`);
  const control = at(CONTROL_ARM, row.picture);
  if (row.groundTriangles !== control.groundTriangles) {
    fail(`${where} has ${row.groundTriangles} ground triangles against the control's ${control.groundTriangles} — a caster changed the MESH`);
  }
  if (row.counts.placements !== control.counts.placements) fail(`${where} stands a different list from the control — the arms differ in more than the shadow`);
  if (row.spec.cover && row.counts.cover === 0) fail(`${where} claims the cover casts and counts no cover caster`);
  if (!row.spec.cover && row.counts.cover !== 0) fail(`${where} claims the cover casts nothing and counts ${row.counts.cover} cover casters`);
}

for (const pic of CAST_SHADOW_PICTURES) {
  const control = at(CONTROL_ARM, pic.id);
  if (control.touched !== 0) fail(`the CONTROL arm differs from itself at ${pic.id} (${control.touched} px) — the denominator is not a denominator`);
  const shipped = at(SHIPPED_ARM, pic.id);
  if (shipped.touched === 0) fail(`the shipped arm is byte-identical to the control at ${pic.id} — nothing shipped`);
}

// ⚠ THE LADDERS MUST ACTUALLY MOVE THE PICTURE, rung to rung, at the read zoom — and move it the
// way each lever claims.
for (const arm of armsFor('one')) {
  if (arm === CONTROL_ARM) continue;
  const row = at(arm, 'one');
  if (row.touched === 0) fail(`${arm} at one is byte-identical to the control — nothing changed`);
  const n = neighbourArm(arm);
  if (n !== null && row.touchedVsNeighbour === 0) fail(`${arm} at one is byte-identical to ${n} — the rung is not reaching the picture`);
}
const cylinder = at('shape-cylinder', 'one');
const cone = at('shape-cone', 'one');
const cover = at('shape-cover', 'one');
if (cover.counts.casters <= cone.counts.casters) fail(`shape-cover casts from ${cover.counts.casters} casters against shape-cone's ${cone.counts.casters} — the cover is not casting`);
if (cylinder.counts.casters !== cone.counts.casters) fail(`shape-cylinder and shape-cone cast from different lists — the shape ladder varies more than the form`);
// The cone is NARROWER than the cylinder: less of the field is fully occluded.
if (cone.fieldFull >= cylinder.fieldFull) fail(`shape-cone occupies ${cone.fieldFull} of the field against the cylinders' ${cylinder.fieldFull} — the silhouettes are not narrower`);
// The control's contact pools sit at the FULL rung; every other arm's in the soft band — so the
// control has MORE of the field past the full threshold than the same casters re-packed.
if (at(CONTROL_ARM, 'one').fieldFull <= cylinder.fieldFull) fail(`the control's full band (${at(CONTROL_ARM, 'one').fieldFull}) is not wider than shape-cylinder's (${cylinder.fieldFull}) — the contact pools did not move to the soft band`);
// The edge ladder: a wider penumbra puts MORE of the field in the soft band.
let lastSoft = -1;
for (const arm of EDGE_ARMS) {
  const row = at(arm, 'one');
  const soft = row.fieldSoft - row.fieldFull;
  if (soft <= lastSoft) fail(`${arm}'s soft band (${soft}) is not wider than the rung above (${lastSoft})`);
  lastSoft = soft;
}
// The depth ladder: the median green FALLS as the rung deepens (the shadowed grass is a large
// share of the green pixels); the field is the SAME on every rung.
let lastP50 = Infinity;
for (const arm of DEPTH_ARMS) {
  const row = at(arm, 'one');
  if (row.green.p50 >= lastP50) fail(`${arm}'s median green (${row.green.p50}) is not darker than the rung above (${lastP50})`);
  lastP50 = row.green.p50;
  const first = at(DEPTH_ARMS[0], 'one');
  if (row.fieldFull !== first.fieldFull || row.fieldSoft !== first.fieldSoft) fail(`${arm} is not on the same field as ${DEPTH_ARMS[0]} — the depth ladder moved the field`);
}
// The shipped arm coincides with its rungs in pixels too.
for (const id of coincides) {
  const row = at(id, 'one');
  if (row.touchedVsShipped !== 0) fail(`${id} claims to be the shipped arm by spec and differs from it by ${row.touchedVsShipped} px`);
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
say(`elevation (read off the crowd camera, which reads frameWorld): ${RENDER_ELEV_DEG}° on every arm`);
say(`ships: cover casts ${COVER_CASTS} · penumbra ${SHADOW_PENUMBRA} · edge ${SHADOW_EDGE} · depth ${SHADOW_DEPTH} → the shipped arm coincides with: ${coincides.join(', ')}`);
say('');
say('THE ARMS');
for (const a of CAST_SHADOW_ARMS) say(`  ${a.id.padEnd(12)} ${armCaption(a.id)}`);
say('');
say('THE REFERENCE — the approved Cycles render, through this page’s own readers');
say(
  `  land-combined-1948px.png: ${result.reference.width}×${result.reference.height}, island box ${result.reference.box.w}×${result.reference.box.h} px · ` +
    `green pixels ${result.reference.green.count.toLocaleString()} · grass luma p05 ${result.reference.green.p05.toFixed(1)} / p50 ${result.reference.green.p50.toFixed(1)} / p95 ${result.reference.green.p95.toFixed(1)} · ` +
    `darkest/brightest ${result.reference.green.ratio.toFixed(3)} · MICRO ${result.reference.stats.micro.toFixed(2)}`,
);
say('  ⚠ measured, never differenced: another resolution and framing; the ratio is the instrument the depth ladder is read against.');
say('');
for (const pic of CAST_SHADOW_PICTURES) {
  const zoom = zoomFor(pic.id);
  say(`── ${pic.id} @ ${zoom === 'fit' ? 'fit' : `${zoom} px/unit`} ─────────────────────────────────`);
  say('arm           casters  scene  cover   stamp ms   field full   field soft   grass p05   p50    p95   p05/p95   fam  MICRO  moved>20 vs today  vs neighbour  vs shipped');
  for (const arm of armsFor(pic.id)) {
    const r = at(arm, pic.id);
    say(
      `${arm.padEnd(12)} ${String(r.counts.casters).padStart(8)}  ${String(r.counts.scene).padStart(5)}  ${String(r.counts.cover).padStart(5)}  ` +
        `${r.buildMs.toFixed(0).padStart(9)}  ${pct(r.fieldFull).padStart(11)}  ${pct(r.fieldSoft).padStart(11)}  ` +
        `${r.green.p05.toFixed(1).padStart(9)}  ${r.green.p50.toFixed(1).padStart(5)}  ${r.green.p95.toFixed(1).padStart(5)}  ${r.green.ratio.toFixed(3).padStart(8)}  ` +
        `${String(r.families).padStart(3)}  ${r.stats.micro.toFixed(2).padStart(5)}  ${String(r.visible).padStart(17)}  ${(r.visibleVsNeighbour === null ? '—' : String(r.visibleVsNeighbour)).padStart(12)}  ${String(r.touchedVsShipped).padStart(10)}`,
    );
  }
  say('');
}

say('THE GREEN LUMA HISTOGRAM — share of green pixels (grass, crowns and cover alike; the background excluded) per 16-luma bin, the reference beside the arms at one island:');
const binHead = Array.from({ length: result.reference.green.bins.length }, (_, i) => String(i * 16).padStart(5)).join('');
say(`  ${'arm'.padEnd(14)}${binHead}`);
const binRow = (label, g) => say(`  ${label.padEnd(14)}${g.bins.map((b) => (b * 100).toFixed(1).padStart(5)).join('')}`);
binRow('reference', result.reference.green);
for (const arm of [CONTROL_ARM, 'shape-cover', ...DEPTH_ARMS]) binRow(arm, at(arm, 'one').green);
say('  ⚠ the reference is another resolution and framing; read the SHAPE of the row — where its dark mass sits against ours — not any one cell.');
say('');
say('THE READER MODEL, PRINTED — margin per token per depth rung (positive reads as its own token; negative is REPORTED, not a fence: ADR-0503 D1 / ADR-0506):');
const levels = [...new Set(result.margins.map((m) => m.level))];
const tokens = [...new Set(result.margins.map((m) => m.token))];
say(`  ${'token'.padEnd(9)} ${levels.map((l) => String(l).padStart(8)).join('')}`);
for (const token of tokens) {
  say(`  ${token.padEnd(9)} ${levels.map((l) => result.margins.find((m) => m.token === token && m.level === l).margin.toFixed(1).padStart(8)).join('')}`);
}
say('  ⚠ only the green token (#8cb85e) is ever sent below 0.77; every other token keeps the derived rung, so its deeper columns are what WOULD happen, not what ships.');
say('');
say('THE MOUNT-TIME STAMP — wall-clock ms for the whole shipped ground build (coast clip, occlusion field, relief, skirt), per distinct field:');
const seen = new Set();
for (const r of result.rows) {
  const key = `${r.picture}|${r.spec.profiles}|${r.spec.cover}|${r.spec.penumbra}|${r.spec.ladder === 'control'}`;
  if (seen.has(key)) continue;
  seen.add(key);
  say(`  ${r.picture.padEnd(7)} ${r.arm.padEnd(12)} ${String(r.counts.casters).padStart(6)} casters  ${r.buildMs.toFixed(0).padStart(6)} ms`);
}
say('');
say(`FRAME COST — GPU ms per frame, one island at ${zoomFor('one')} px/unit, ${COST_BATCH} frames on the GPU's own clock (REPORTS, ADR-0517 D4):`);
for (const c of result.costs) {
  say(`  ${c.arm.padEnd(12)} ${c.gpuMsPerFrame === null ? 'no usable timer query' : `${c.gpuMsPerFrame.toFixed(3)} ms`} · ${c.drawCalls} draws · ${c.triangles.toLocaleString()} tris${c.disjoint ? ' · DISJOINT' : ''}${c.hidden ? ' · HIDDEN' : ''}`);
}
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row, an arc intent or an earlier evidence sheet.');
say(`ladders: edge (soft) ${EDGE_LADDER.join(' / ')} ground units · depth ${DEPTH_LADDER.join(' / ')} on the green islands`);

for (const [name, dataUrl] of Object.entries(result.frames)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'reference.json'), JSON.stringify(result.reference, null, 2));
writeFileSync(join(OUT, 'margins.json'), JSON.stringify(result.margins, null, 2));
writeFileSync(join(OUT, 'frame-cost.json'), JSON.stringify(result.costs, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.frames).length} frames + measurements.json + reference.json + margins.json + frame-cost.json + report.txt to ${OUT}`);
await browser.close();
