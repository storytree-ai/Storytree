// shipped-wheat-measure.mjs — drive `shipped-wheat.html`: the wheat field on the in-progress
// islands, laddered on how yellow it is, measured and written out as frames, numbers and a report.
// Run it on the arc's named box (the RTX 2060, ADR-0505 D3) for figures that go in a README.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5417 --strictPort --host 127.0.0.1
//   ST_WHEAT_URL=http://127.0.0.1:5417/shipped-wheat.html pnpm --filter @storytree/forest-world-r3f measure-shipped-wheat
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE WHEAT: a
// software rasteriser; an insensitive delta instrument; a control that differs from itself; the
// GREEN island changing at all (this row may not touch the green's delivered look); a camera that
// is not the signed elevation; an arm whose ground mesh differs from the control's (the wheat is a
// fragment-stage layer); a rung byte-identical to its neighbour; a shipped arm that coincides with
// NO rung (a pick has to be a rung the owner saw); a yellow island the wheat did not reach; a real
// forest that carries no in-progress island to paint.
//
// ⚠ IT DECIDES NOTHING ABOUT COST OR ABOUT THE READER MARGIN. Both are measured and REPORTED
// (ADR-0517 D4; ADR-0503 D1 / ADR-0506 / ADR-0489 D3). The pick is made on the LOOK and lands in
// `src/ForestWorldCanvas.tsx` (`SHIPPED_WHEAT_ANCHOR`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { SHIPPED_WHEAT_ANCHOR, SHIPPED_WHEAT_MIX } from '../src/ForestWorldCanvas.tsx';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import { WHEAT_ANCHORS } from '../src/land-wheat.ts';
import {
  CONTROL_ARM,
  LADDER_ARMS,
  SHIPPED_ARM,
  WHEAT_ARMS,
  WHEAT_PICTURES,
  armCaption,
  armSpec,
  armsFor,
  neighbourArm,
  sameArm,
} from './shipped-wheat-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_WHEAT_URL'] ?? 'http://localhost:5417/shipped-wheat.html';
const OUT = process.env['ST_WHEAT_OUT'] ?? join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-wheat-field-2026-09-06');
const ANGLE = process.env['ST_WHEAT_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_WHEAT_ALLOW_SOFTWARE'] === '1';
const COST_BATCH = Number(process.env['ST_WHEAT_BATCH'] ?? '60');

const SHOTS = WHEAT_PICTURES.flatMap((p) => armsFor(p.id).map((arm) => ({ picture: p.id, arm })));

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_WHEAT_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.wheatRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([shots, batch, control, shipped]) => {
    const r = window.wheatRunner;
    const rows = [];
    for (const { picture, arm } of shots) rows.push(r.read(arm, picture));
    const reference = await r.reference('/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png');
    const frames = {};
    for (const { picture, arm } of shots) frames[`${arm}-${picture}`] = r.snapshot(arm, picture);
    const costs = [];
    for (const picture of ['yellow', 'forest']) {
      for (const arm of [control, shipped]) costs.push(await r.cost({ arm, picture, batch }));
    }
    return {
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      forestMix: r.forestMix(),
      layout: r.layout(),
      rows,
      reference,
      frames,
      costs,
      margins: r.margins(),
      sensitivity: { yellow: r.sensitivity('yellow'), forest: r.sensitivity('forest') },
    };
  },
  [SHOTS, COST_BATCH, CONTROL_ARM, SHIPPED_ARM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set DISPLAY=:0 on the Mint box so ` +
      'headless chromium reaches the GPU, or ST_WHEAT_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
      'anyway — and do not quote a software frame as this map’s picture.',
  );
}
for (const pic of ['yellow', 'forest']) {
  if (result.sensitivity[pic].length > 0) {
    fail(`the visible-delta instrument failed its own sensitivity rung on ${pic}, so no reading below means anything:\n  ${result.sensitivity[pic].join('\n  ')}`);
  }
}

const at = (arm, picture) => result.rows.find((r) => r.arm === arm && r.picture === picture);

// The shipped arm has to BE a rung of the ladder.
const shippedSpec = armSpec(SHIPPED_ARM);
const coincides = LADDER_ARMS.filter((id) => sameArm(armSpec(id), shippedSpec));
if (coincides.length !== 1) {
  fail(`the shipped arm (${armCaption(SHIPPED_ARM)}) coincides with ${coincides.length} rungs of the ladder — a pick has to be exactly one rung the owner saw`);
}

for (const row of result.rows) {
  const where = `${row.arm} at ${row.picture}`;
  if (row.landPx === 0) fail(`${where} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${where} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) fail(`${where} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 1e-6) fail(`${where} is not judged from the signed ${RENDER_ELEV_DEG}° (read ${row.elevationDeg})`);
  const control = at(CONTROL_ARM, row.picture);
  if (row.groundTriangles !== control.groundTriangles) {
    fail(`${where} has ${row.groundTriangles} ground triangles against the control's ${control.groundTriangles} — the wheat is a fragment-stage layer and moved the MESH`);
  }
  if (row.triangles !== control.triangles) fail(`${where} draws ${row.triangles} triangles against the control's ${control.triangles}`);
}

for (const pic of WHEAT_PICTURES) {
  const control = at(CONTROL_ARM, pic.id);
  if (control.touched !== 0) fail(`the CONTROL arm differs from itself at ${pic.id} (${control.touched} px) — the denominator is not a denominator`);
}

// ⚠⚠ THE GREEN ISLAND MAY NOT CHANGE. This row paints the yellow and moves the shadow's gate; a
// green pixel moving would be a shared constant moved without being shown.
const greenShipped = at(SHIPPED_ARM, 'green');
if (greenShipped.touched !== 0) {
  fail(`the SHIPPED arm touches ${greenShipped.touched} px of the GREEN island against today — this row may not change the green islands' delivered look`);
}

// ⚠ THE YELLOW ISLAND MUST CHANGE, on every rung, and every rung must differ from its neighbour.
for (const arm of armsFor('yellow')) {
  if (arm === CONTROL_ARM) continue;
  const row = at(arm, 'yellow');
  if (row.visible === 0) fail(`${arm} at yellow moved no pixel past ${VISIBLE_DELTA}/255 — the wheat is not reaching the island`);
  if (row.visible < row.landPx * 0.5) {
    fail(`${arm} at yellow moved only ${((row.visible / row.landPx) * 100).toFixed(1)}% of the island's land past ${VISIBLE_DELTA}/255 — a whole-island layer should reach most of it`);
  }
  const n = neighbourArm(arm);
  if (n !== null && row.touchedVsNeighbour === 0) fail(`${arm} at yellow is byte-identical to ${n} — the rung is not reaching the picture`);
}
// The shipped arm coincides with its rung in pixels too, on both pictures where the ladder is read.
for (const pic of ['yellow', 'forest']) {
  const twin = at(coincides[0], pic);
  if (twin.touchedVsShipped !== 0) fail(`${coincides[0]} claims to be the shipped arm by spec and differs from it at ${pic} by ${twin.touchedVsShipped} px`);
}
// The real forest carries in-progress islands, and the wheat reaches them.
const yellowIslands = (result.forestMix['proposed'] ?? 0) + (result.forestMix['building'] ?? 0);
if (yellowIslands === 0) fail('the exported real forest carries NO in-progress island — nothing here could show the wheat on the map');
const forestShipped = at(SHIPPED_ARM, 'forest');
if (forestShipped.visible === 0) fail(`the shipped arm moved no forest pixel past ${VISIBLE_DELTA}/255 — the wheat is not reaching the real map`);

// ── THE REPORT ──────────────────────────────────────────────────────────────────────────────────

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
say(`renderer: ${result.id.vendor} — ${result.id.renderer}`);
say(`software=${result.id.software}`);
say(
  `light probe: a lit white face delivered ${result.calibration.probe.toFixed(4)} at the authored intensities; ` +
    `scale ${result.calibration.scale.toFixed(4)} onto the ladder's ${result.calibration.target}; floor ${result.calibration.floor}`,
);
say(`elevation: ${RENDER_ELEV_DEG}° on every arm`);
say(`ships: wheat ${SHIPPED_WHEAT_ANCHOR} at ${SHIPPED_WHEAT_MIX} → the shipped arm coincides with: ${coincides.join(', ')}`);
say(
  `real forest: ${result.layout.islands} islands from ${result.layout.id} (studio ${result.layout.head.slice(0, 8)}, exported ${result.layout.generatedAt}) — ` +
    Object.entries(result.forestMix)
      .map(([s, n]) => `${n} ${s}`)
      .join(', '),
);
say('');
say('THE ARMS');
for (const a of WHEAT_ARMS) say(`  ${a.id.padEnd(18)} ${armCaption(a.id)}`);
say('');
say('THE REFERENCE — the approved Cycles render, through this page’s own census');
say(
  `  land-combined-1948px.png: ${result.reference.width}×${result.reference.height} · colour families ${result.reference.families} · largest holds ${pct(result.reference.largestShare)} · ` +
    `MICRO ${result.reference.stats.micro.toFixed(2)} · STRUCT ${result.reference.stats.struct.toFixed(2)}`,
);
say('  ⚠ measured, never differenced: another resolution, framing and camera, and a GREEN island — the wheat has no reference render; the reference is the STANDARD of paint, not of colour.');
say('');
for (const pic of WHEAT_PICTURES) {
  say(`── ${pic.id} @ ${pic.zoom === 'fit' ? 'fit' : `${pic.zoom} px/unit`} ─────────────────────────────────`);
  say('arm                 fam  largest   top3   MICRO  STRUCT   land px  moved>20 vs today  touched   vs neighbour  vs shipped   stamp ms');
  for (const arm of armsFor(pic.id)) {
    const r = at(arm, pic.id);
    say(
      `${arm.padEnd(18)} ${String(r.families).padStart(4)}  ${pct(r.largestShare).padStart(7)}  ${pct(r.topThreeShare).padStart(5)}  ` +
        `${r.stats.micro.toFixed(2).padStart(5)}  ${r.stats.struct.toFixed(2).padStart(6)}  ${String(r.landPx).padStart(8)}  ${String(r.visible).padStart(17)}  ${String(r.touched).padStart(7)}  ` +
        `${(r.visibleVsNeighbour === null ? '—' : String(r.visibleVsNeighbour)).padStart(12)}  ${String(r.touchedVsShipped).padStart(10)}  ${r.buildMs.toFixed(0).padStart(9)}`,
    );
  }
  say('');
}

const m = result.margins;
say(`THE READER MODEL, PRINTED — per rung at the shipped strength ${m.fac}, ceiling walked on a ${m.step} grid (ADR-0492's yellow reads 0.008 / 0.009 / 0.0095 at 0.002 / 0.001 / 0.0005 — the step travels with the number):`);
say('  rung          anchor   reach   ceiling@step        worst margin  at            reads as   worst colour   reads-as shares over the ladder (flat 0.90 only)');
for (const r of m.rungs) {
  const shares = Object.entries(r.readsAs)
    .map(([s, v]) => `${s} ${pct(v)}`)
    .join(' · ');
  const flat = Object.entries(r.readsAsFlat)
    .map(([s, v]) => `${s} ${pct(v)}`)
    .join(' · ');
  say(
    `  ${r.id.padEnd(12)}  ${r.anchor}  ${String(r.reach).padStart(5)}   ${r.ceiling.ceiling.toFixed(4)}@${r.ceiling.step}   ${r.worstMargin.toFixed(2).padStart(12)}  ${r.worstAt.padEnd(13)} ${r.worstReadsAs.padEnd(10)} ${r.worstColour}        ${shares}  (${flat})`,
  );
}
say(`  the GREEN on the SAME instrument at its shipped ${m.green.fac}: worst margin ${m.green.worstMargin.toFixed(2)} at ${m.green.worstAt} — the shipped grass reads foreign too; the instrument is a proxy and the look is the fence (ADR-0489 D3/D4, ADR-0503 D1, ADR-0506).`);
say(`  the unpainted yellow's own tightest margin: ${m.rungs[0].unpaintedWorstMargin.toFixed(2)} — the ladder's spend, not the layer's.`);
say(`  THE SHADOW on the yellow ${m.shadow.token}: margin ${m.shadow.marginDerived.toFixed(1)} at the derived rung ${m.shadow.derived} (what shipped) → ${m.shadow.marginDeep.toFixed(1)} at the deep rung ${m.shadow.deep} (what the painted islands wear now) — printed, not a fence.`);
say('  ⚠ the reader table is the FLAT six-token table: "reads as healthy" means nearer the flat green than the flat yellow, which a viewer comparing two PAINTED islands never does. The picture decides.');
say('');
say(`THE LADDER'S ANCHORS, for the record: ${WHEAT_ANCHORS.map((a) => `${a.id} ${a.hex}`).join(' · ')}`);
say('');
say(`FRAME COST — GPU ms per frame, ${COST_BATCH} frames on the GPU's own clock (REPORTS, ADR-0517 D4):`);
for (const c of result.costs) {
  say(`  ${c.picture.padEnd(7)} ${c.arm.padEnd(10)} ${c.gpuMsPerFrame === null ? 'no usable timer query' : `${c.gpuMsPerFrame.toFixed(3)} ms`} · ${c.drawCalls} draws · ${c.triangles.toLocaleString()} tris${c.disjoint ? ' · DISJOINT' : ''}${c.hidden ? ' · HIDDEN' : ''}`);
}
say('');
say('THE MOUNT-TIME STAMP — wall-clock ms for the shipped ground build, per picture (the field is the same on every arm; the wheat adds no field):');
for (const pic of WHEAT_PICTURES) say(`  ${pic.id.padEnd(7)} ${at(CONTROL_ARM, pic.id).buildMs.toFixed(0).padStart(6)} ms`);
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row, an arc intent or an earlier evidence sheet.');

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
