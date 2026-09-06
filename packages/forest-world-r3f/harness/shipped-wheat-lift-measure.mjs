// shipped-wheat-lift-measure.mjs — drive `shipped-wheat-lift.html`: the wheat field laddered on
// how PALE it is (a stop-luma lift on the six rebased stops, the mustard anchor held fixed),
// measured and written out as frames, numbers and a report. Run it on the arc's named box (the
// RTX 2060, ADR-0505 D3) for figures that go in a README.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5419 --strictPort --host 127.0.0.1
//   ST_WHEAT_LIFT_URL=http://127.0.0.1:5419/shipped-wheat-lift.html pnpm --filter @storytree/forest-world-r3f measure-shipped-wheat-lift
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE LIFT: a
// software rasteriser; an insensitive delta instrument; a control that differs from itself; the
// GREEN island changing at all; a camera that is not the signed elevation; an arm whose ground
// mesh differs from the control's (the lift is six constants in a fragment-stage ramp); a rung
// byte-identical to its neighbour; a rung that is not BRIGHTER than the rung below it on the
// yellow island (the lever's whole claim); a shipped arm that coincides with NO rung; a real
// forest carrying no in-progress island to paint.
//
// ⚠ IT DECIDES NOTHING ABOUT COST OR ABOUT THE READER MARGIN. Both are measured and REPORTED
// (ADR-0517 D4; ADR-0503 D1 / ADR-0506 / ADR-0489 D3). The pick is made on the LOOK and lands in
// `src/ForestWorldCanvas.tsx` (`SHIPPED_WHEAT_LIFT`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { SHIPPED_WHEAT_ANCHOR, SHIPPED_WHEAT_LIFT, SHIPPED_WHEAT_MIX } from '../src/ForestWorldCanvas.tsx';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import { WHEAT_LIFTS } from '../src/land-wheat.ts';
import {
  FLAT_ARM,
  LIFT_ARMS,
  LIFT_CONTROL_ARM,
  LIFT_LADDER_ARMS,
  LIFT_SHIPPED_ARM,
  liftArmCaption,
  liftArmSpec,
  liftArmsFor,
  liftNeighbourArm,
  sameLiftArm,
} from './shipped-wheat-lift-scene.ts';
import { WHEAT_PICTURES } from './shipped-wheat-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_WHEAT_LIFT_URL'] ?? 'http://localhost:5419/shipped-wheat-lift.html';
const OUT = process.env['ST_WHEAT_LIFT_OUT'] ?? join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-wheat-paleness-2026-09-06');
const ANGLE = process.env['ST_WHEAT_LIFT_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_WHEAT_LIFT_ALLOW_SOFTWARE'] === '1';
const COST_BATCH = Number(process.env['ST_WHEAT_LIFT_BATCH'] ?? '60');

const SHOTS = WHEAT_PICTURES.flatMap((p) => liftArmsFor(p.id).map((arm) => ({ picture: p.id, arm })));

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_WHEAT_LIFT_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.wheatLiftRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([shots, batch, control, shipped]) => {
    const r = window.wheatLiftRunner;
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
  [SHOTS, COST_BATCH, LIFT_CONTROL_ARM, LIFT_SHIPPED_ARM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set DISPLAY=:0 on the Mint box so ` +
      'headless chromium reaches the GPU, or ST_WHEAT_LIFT_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
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
const shippedSpec = liftArmSpec(LIFT_SHIPPED_ARM);
const coincides = LIFT_LADDER_ARMS.filter((id) => sameLiftArm(liftArmSpec(id), shippedSpec));
if (coincides.length !== 1) {
  fail(`the shipped arm (${liftArmCaption(LIFT_SHIPPED_ARM)}) coincides with ${coincides.length} rungs of the ladder — a pick has to be exactly one rung the owner saw`);
}

for (const row of result.rows) {
  const where = `${row.arm} at ${row.picture}`;
  if (row.landPx === 0) fail(`${where} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${where} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) fail(`${where} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 1e-6) fail(`${where} is not judged from the signed ${RENDER_ELEV_DEG}° (read ${row.elevationDeg})`);
  const control = at(LIFT_CONTROL_ARM, row.picture);
  if (row.groundTriangles !== control.groundTriangles) {
    fail(`${where} has ${row.groundTriangles} ground triangles against the control's ${control.groundTriangles} — the lift is six ramp constants and moved the MESH`);
  }
  if (row.triangles !== control.triangles) fail(`${where} draws ${row.triangles} triangles against the control's ${control.triangles}`);
  // Every wheat arm wears the SHIPPED anchor — the reading says what it wore.
  if (row.wheat !== null && row.wheat.anchor !== SHIPPED_WHEAT_ANCHOR) fail(`${where} wore the anchor ${row.wheat.anchor}, not the shipped ${SHIPPED_WHEAT_ANCHOR} — this ladder varies the lift only`);
  if (row.wheat !== null && row.wheat.mix !== SHIPPED_WHEAT_MIX) fail(`${where} wore the factor ${row.wheat.mix}, not the shipped ${SHIPPED_WHEAT_MIX}`);
}

for (const pic of WHEAT_PICTURES) {
  const control = at(LIFT_CONTROL_ARM, pic.id);
  if (control.touched !== 0) fail(`the CONTROL arm differs from itself at ${pic.id} (${control.touched} px) — the denominator is not a denominator`);
}

// ⚠⚠ THE GREEN ISLAND MAY NOT CHANGE. The lift is on the wheat's stops; a green pixel moving would
// be a shared constant moved without being shown.
const greenShipped = at(LIFT_SHIPPED_ARM, 'green');
if (greenShipped.touched !== 0) {
  fail(`the SHIPPED arm touches ${greenShipped.touched} px of the GREEN island against the control — this row may not change the green islands' delivered look`);
}

// ⚠ THE YELLOW ISLAND MUST CHANGE on every rung above the control, every rung must differ from
// its neighbour, and every rung must be BRIGHTER than the one below — the lever's claim, held on
// the picture and not only on the arithmetic.
const flatYellow = at(FLAT_ARM, 'yellow');
if (flatYellow.touched === 0) fail('the FLAT reference is byte-identical to the control at yellow — the wheat is not reaching the island');
let below = null;
for (const arm of LIFT_LADDER_ARMS) {
  const row = at(arm, 'yellow');
  if (arm !== LIFT_CONTROL_ARM) {
    // ⚠ A rung that moves NO pixel past the bar is REPORTED, not refused: that is the ladder's own
    // finding about that rung (a lever laddered at a shallow rung is invisible), and ADR-0490 D6
    // is how arms are JUDGED, not a floor the page enforces. Byte-identical is the refusal.
    if (row.touched === 0) fail(`${arm} at yellow is byte-identical to the control — the lift is not reaching the island`);
    const n = liftNeighbourArm(arm);
    if (n !== null && row.touchedVsNeighbour === 0) fail(`${arm} at yellow is byte-identical to ${n} — the rung is not reaching the picture`);
  }
  if (below !== null && !(row.stats.mean > below.stats.mean)) {
    fail(`${arm} at yellow is not brighter than ${below.arm} (mean ${row.stats.mean.toFixed(2)} vs ${below.stats.mean.toFixed(2)}) — the lift is not a lift`);
  }
  below = row;
}
// The shipped arm coincides with its rung in pixels too, on both pictures where the ladder is read.
for (const pic of ['yellow', 'forest']) {
  const twin = at(coincides[0], pic);
  if (twin.touchedVsShipped !== 0) fail(`${coincides[0]} claims to be the shipped arm by spec and differs from it at ${pic} by ${twin.touchedVsShipped} px`);
}
// The real forest carries in-progress islands, and the lift reaches them.
const yellowIslands = (result.forestMix['proposed'] ?? 0) + (result.forestMix['building'] ?? 0);
if (yellowIslands === 0) fail('the exported real forest carries NO in-progress island — nothing here could show the wheat on the map');
if (SHIPPED_WHEAT_LIFT !== 1) {
  const forestShipped = at(LIFT_SHIPPED_ARM, 'forest');
  if (forestShipped.visible === 0) fail(`the shipped arm moved no forest pixel past ${VISIBLE_DELTA}/255 vs the control — the lift is not reaching the real map`);
}

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
say(`ships: wheat ${SHIPPED_WHEAT_ANCHOR} lifted ${SHIPPED_WHEAT_LIFT.toFixed(2)} at ${SHIPPED_WHEAT_MIX} → the shipped arm coincides with: ${coincides.join(', ')}`);
say(
  `real forest: ${result.layout.islands} islands from ${result.layout.id} (studio ${result.layout.head.slice(0, 8)}, exported ${result.layout.generatedAt}) — ` +
    Object.entries(result.forestMix)
      .map(([s, n]) => `${n} ${s}`)
      .join(', '),
);
say('');
say('THE ARMS');
for (const a of LIFT_ARMS) say(`  ${a.id.padEnd(10)} ${liftArmCaption(a.id)}`);
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
  say('arm         fam  largest   top3   MICRO  STRUCT   mean   land px  moved>20 vs control  touched   vs neighbour  vs shipped   stamp ms');
  for (const arm of liftArmsFor(pic.id)) {
    const r = at(arm, pic.id);
    say(
      `${arm.padEnd(10)} ${String(r.families).padStart(4)}  ${pct(r.largestShare).padStart(7)}  ${pct(r.topThreeShare).padStart(5)}  ` +
        `${r.stats.micro.toFixed(2).padStart(5)}  ${r.stats.struct.toFixed(2).padStart(6)}  ${r.stats.mean.toFixed(1).padStart(5)}  ${String(r.landPx).padStart(8)}  ${String(r.visible).padStart(19)}  ${String(r.touched).padStart(7)}  ` +
        `${(r.visibleVsNeighbour === null ? '—' : String(r.visibleVsNeighbour)).padStart(12)}  ${String(r.touchedVsShipped).padStart(10)}  ${r.buildMs.toFixed(0).padStart(9)}`,
    );
  }
  say('');
}

const m = result.margins;
say(`THE TWO FINDINGS, PER RUNG — the anchor ${m.anchor} held fixed, the wheat at ${m.fac}:`);
say('  rung    lift   field luma  flat luma  ratio   warm light stop  hue     cool light stop  hue     clamped channels   six stops (cool dark→light · warm dark→light)');
for (const r of m.rungs) {
  say(
    `  ${r.id.padEnd(6)}  ${r.lift.toFixed(2)}   ${r.luma.field.toFixed(1).padStart(10)}  ${r.luma.flat.toFixed(1).padStart(9)}  ${r.luma.ratio.toFixed(3)}   ` +
      `${r.stops.warmLight.hex}          ${r.stops.warmLight.hue.toFixed(1).padStart(5)}°  ${r.stops.cool[2].hex}          ${r.stops.cool[2].hue.toFixed(1).padStart(5)}°  ${String(r.stops.clampedChannels).padStart(16)}   ` +
      `${r.stops.cool.map((s) => s.hex).join(' ')} · ${r.stops.warm.map((s) => s.hex).join(' ')}`,
  );
}
say('  ⚠ the hue is HSV on the DELIVERED sRGB bytes — what the eye reads; a ratio-preserving lift moves it only where a channel clamps, and then toward yellow (the straw’s peach sits at 22°, the wheat token’s at 17°).');
say('');
say(`THE READER MODEL, PRINTED — per rung at the shipped strength ${m.fac}, ceiling walked on a ${m.step} grid (the step travels with the number):`);
say('  rung    reach   ceiling@step        worst margin  at            reads as   worst colour   reads-as shares over the ladder (flat 0.90 only)');
for (const r of m.rungs) {
  const shares = Object.entries(r.readsAs)
    .map(([s, v]) => `${s} ${pct(v)}`)
    .join(' · ');
  const flat = Object.entries(r.readsAsFlat)
    .map(([s, v]) => `${s} ${pct(v)}`)
    .join(' · ');
  say(
    `  ${r.id.padEnd(6)}  ${String(r.reach).padStart(5)}   ${r.ceiling.ceiling.toFixed(4)}@${r.ceiling.step}   ${r.worstMargin.toFixed(2).padStart(12)}  ${r.worstAt.padEnd(13)} ${r.worstReadsAs.padEnd(10)} ${r.worstColour}        ${shares}  (${flat})`,
  );
}
say(`  the GREEN on the SAME instrument at its shipped ${m.green.fac}: worst margin ${m.green.worstMargin.toFixed(2)} at ${m.green.worstAt} — the shipped grass reads foreign too; the instrument is a proxy and the look is the fence (ADR-0489 D3/D4, ADR-0503 D1, ADR-0506).`);
say(`  the unpainted yellow's own tightest margin: ${m.rungs[0].unpaintedWorstMargin.toFixed(2)} — the ladder's spend, not the layer's.`);
say(`  THE SHADOW on the yellow ${m.shadow.token}: margin ${m.shadow.marginDerived.toFixed(1)} at the derived rung ${m.shadow.derived} → ${m.shadow.marginDeep.toFixed(1)} at the deep rung ${m.shadow.deep} (what the painted islands wear) — printed, not a fence.`);
say('  ⚠ the reader table is the FLAT six-token table: "reads as healthy" means nearer the flat green than the flat yellow, which a viewer comparing two PAINTED islands never does. The picture decides.');
say('');
say(`THE LADDER'S LIFTS, for the record: ${WHEAT_LIFTS.map((l) => `${l.id} (×${l.lift})`).join(' · ')}`);
say('');
say(`FRAME COST — GPU ms per frame, ${COST_BATCH} frames on the GPU's own clock (REPORTS, ADR-0517 D4):`);
for (const c of result.costs) {
  say(`  ${c.picture.padEnd(7)} ${c.arm.padEnd(10)} ${c.gpuMsPerFrame === null ? 'no usable timer query' : `${c.gpuMsPerFrame.toFixed(3)} ms`} · ${c.drawCalls} draws · ${c.triangles.toLocaleString()} tris${c.disjoint ? ' · DISJOINT' : ''}${c.hidden ? ' · HIDDEN' : ''}`);
}
say('');
say('THE MOUNT-TIME STAMP — wall-clock ms for the shipped ground build, per picture (the field is the same on every arm; the lift adds no field):');
for (const pic of WHEAT_PICTURES) say(`  ${pic.id.padEnd(7)} ${at(LIFT_CONTROL_ARM, pic.id).buildMs.toFixed(0).padStart(6)} ms`);
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
