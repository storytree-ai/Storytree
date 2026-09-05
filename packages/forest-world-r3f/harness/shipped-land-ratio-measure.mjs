// shipped-land-ratio-measure.mjs — drive `shipped-land-ratio.html`: the island's size laddered on a
// land-per-capability ratio, measured and written out as frames, numbers and a report. Run it on
// the arc's named box (the RTX 2060, ADR-0505 D3) for figures that go in a README.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5377 --strictPort --host 127.0.0.1
//   ST_LAND_RATIO_URL=http://127.0.0.1:5377/shipped-land-ratio.html pnpm --filter @storytree/forest-world-r3f measure-shipped-land-ratio
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE ISLAND'S SIZE:
// a software rasteriser; an insensitive delta instrument; a control that differs from itself; a
// camera that is not the signed 50°; a tree count that is not the capability count on ANY arm
// (ADR-0518 D1/D4 — the remedy for a sparse island is less land, never more trees); a land arm
// whose centre island is not EXACTLY its rung's units² per capability; a land ladder that does not
// descend; arms at one ratio not sharing one ground mesh; a cover ladder that does not rise; a rung
// byte-identical to its neighbour; and an arm that drew no kit.
//
// ⚠ IT DECIDES NOTHING ABOUT COST. Frame cost is `shipped-land-ratio-cost.mjs`'s, and it reports.
// The rung is picked on the LOOK (ADR-0503 / ADR-0489 D3) and lands in `src/land-per-capability.ts`.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { COVER_DENSITY, COVER_SIZE } from '../src/cover-dressing.ts';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import { LAND_AREA_PER_CAPABILITY, LAND_SCALE, TUNED_LAND_AREA_PER_CAPABILITY } from '../src/land-per-capability.ts';
import {
  CONTROL_ARM,
  COVER_ARMS,
  COVER_LADDER,
  LAND_ARMS,
  LAND_LADDER,
  LAND_RATIO_ARMS,
  PREVIOUS_COVER_DENSITY,
  PREVIOUS_RECIPE_ISLAND_AREA,
  SHIPPED_ARM,
  armCaption,
  armSpec,
  countsCaption,
  neighbourArm,
  picturesAt,
} from './shipped-land-ratio-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_LAND_RATIO_URL'] ?? 'http://localhost:5377/shipped-land-ratio.html';
const OUT =
  process.env['ST_LAND_RATIO_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-land-per-capability-2026-09-05');
const ANGLE = process.env['ST_LAND_RATIO_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_LAND_RATIO_ALLOW_SOFTWARE'] === '1';

const ARMS = LAND_RATIO_ARMS.map((a) => a.id);
const ZOOMS = [8, 'fit'];
const READ_ZOOM = 8;
/** Every (picture, zoom) the page renders — the compact forest is a fitted picture only. */
const SHOTS = ZOOMS.flatMap((zoom) => picturesAt(zoom).map((p) => ({ picture: p.id, zoom })));

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_LAND_RATIO_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.landRatioRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, shots, readZoom]) => {
    const r = window.landRatioRunner;
    const rows = [];
    for (const { picture, zoom } of shots) {
      for (const arm of arms) rows.push({ picture, zoom, ...r.read(arm, picture, zoom) });
    }
    const reference = await r.reference('/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png');
    const frames = {};
    for (const arm of arms) {
      for (const { picture, zoom } of shots) frames[`${arm}-${picture}-${zoom}`] = r.snapshot(arm, picture, zoom);
    }
    return {
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      agreement: r.agreement(),
      rows,
      reference,
      frames,
      sensitivity: r.sensitivity('one', readZoom),
    };
  },
  [ARMS, SHOTS, READ_ZOOM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set DISPLAY=:0 on the Mint box so ` +
      'headless chromium reaches the GPU, or ST_LAND_RATIO_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
      'anyway — and do not quote a software frame as this map’s picture.',
  );
}
if (result.agreement.length > 0) fail(`the camera is not what the arms claim:\n  ${result.agreement.join('\n  ')}`);
if (result.sensitivity.length > 0) {
  fail(`the visible-delta instrument failed its own sensitivity rung, so no reading below means anything:\n  ${result.sensitivity.join('\n  ')}`);
}

const at = (arm, picture, zoom) => result.rows.find((r) => r.arm === arm && r.picture === picture && r.zoom === zoom);

for (const row of result.rows) {
  const where = `${row.arm} at ${row.picture}/${row.zoom}`;
  if (row.landPx === 0) fail(`${where} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${where} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) fail(`${where} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 1e-9) fail(`${row.arm} is not judged from the signed ${RENDER_ELEV_DEG}°`);
  if (row.counts.cover === 0) fail(`${where} wears NO ground cover — the cover did not grow`);
  // ⚠⚠ ONE TREE PER CAPABILITY ON EVERY ARM (ADR-0518 D1/D4): the map's whole capability count,
  // as trees, and nothing else tree-shaped. On the one-island picture that is the fixture's eleven.
  const capabilities = row.picture === 'one' ? row.land.capabilities : row.counts.capabilityTreesPerHealthyIsland * row.counts.healthyIslands;
  if (row.picture === 'one' && row.counts.capabilityTrees !== row.land.capabilities) {
    fail(`${where} stands ${row.counts.capabilityTrees} trees on ${row.land.capabilities} capabilities — the count is not the capability count`);
  }
  if (row.picture !== 'one' && row.counts.capabilityTrees < capabilities) {
    fail(`${where} stands ${row.counts.capabilityTrees} trees against ${capabilities} capabilities on its green islands — a capability lost its tree`);
  }
  // ⚠⚠ THE RATIO IS EXACT: a land arm's centre island holds its rung's units² per capability to the bit.
  const spec = armSpec(row.arm);
  if (spec.areaPerCapability !== null && Math.abs(row.land.unitsPerCapability - spec.areaPerCapability) > 1e-6) {
    fail(`${where} holds ${row.land.unitsPerCapability} units² per capability against its rung's ${spec.areaPerCapability}`);
  }
  if (spec.areaPerCapability === null && Math.abs(row.land.unitsPerCapability - TUNED_LAND_AREA_PER_CAPABILITY) > 1) {
    fail(`the control at ${row.picture}/${row.zoom} holds ${row.land.unitsPerCapability} units² per capability — it is not the island the hex layout drew (${TUNED_LAND_AREA_PER_CAPABILITY.toFixed(1)})`);
  }
}

for (const { picture, zoom } of SHOTS) {
  const control = at(CONTROL_ARM, picture, zoom);
  if (control.touched !== 0) fail(`the CONTROL arm differs from itself at ${picture}/${zoom} (${control.touched} px) — the denominator is not a denominator`);
  // The land ladder DESCENDS in land, and every rung is exactly its ratio.
  let last = control.land.unitsPerCapability;
  for (const arm of LAND_ARMS) {
    const row = at(arm, picture, zoom);
    if (row.land.unitsPerCapability >= last) fail(`${arm} at ${picture}/${zoom} holds ${row.land.unitsPerCapability} units² per capability, not less than the rung above (${last})`);
    last = row.land.unitsPerCapability;
  }
  // Arms at ONE ratio share ONE ground mesh and one caster set — the cover ladder rides the shipped land's ground.
  const shipped = at(SHIPPED_ARM, picture, zoom);
  for (const arm of COVER_ARMS) {
    const row = at(arm, picture, zoom);
    if (row.groundTriangles !== shipped.groundTriangles) fail(`${arm} at ${picture}/${zoom} has ${row.groundTriangles} ground triangles against ${SHIPPED_ARM}'s ${shipped.groundTriangles} — the arms do not share a mesh`);
    if (row.casters !== shipped.casters) fail(`${arm} at ${picture}/${zoom} was built from ${row.casters} casters against ${SHIPPED_ARM}'s ${shipped.casters} — ground cover has started casting`);
    if (row.counts.capabilityTrees !== shipped.counts.capabilityTrees || row.counts.blooms !== shipped.counts.blooms) fail(`${arm} at ${picture}/${zoom} moved the vocabulary`);
    if (Math.abs(row.land.unitsPerCapability - shipped.land.unitsPerCapability) > 1e-9) fail(`${arm} at ${picture}/${zoom} is not at the shipped ratio`);
  }
  // The cover ladder RISES.
  const coverRungs = [...COVER_ARMS, SHIPPED_ARM].map((arm) => at(arm, picture, zoom)).sort((a, b) => a.coverDensity - b.coverDensity);
  for (let i = 1; i < coverRungs.length; i += 1) {
    if (coverRungs[i].counts.cover <= coverRungs[i - 1].counts.cover) fail(`${coverRungs[i].arm} at ${picture}/${zoom} wears ${coverRungs[i].counts.cover} cover against ${coverRungs[i - 1].arm}'s ${coverRungs[i - 1].counts.cover} — the cover ladder does not rise`);
  }
}

// ⚠ THE LADDERS MUST ACTUALLY MOVE THE PICTURE, rung to rung, at the read zoom.
for (const arm of ARMS) {
  if (arm === CONTROL_ARM) continue;
  const row = at(arm, 'one', READ_ZOOM);
  if (row.touched === 0) fail(`${arm} at one/${READ_ZOOM} is byte-identical to the control — nothing changed`);
  const n = neighbourArm(arm);
  if (n !== null && row.touchedVsNeighbour === 0) fail(`${arm} at one/${READ_ZOOM} is byte-identical to ${n} — the rung is not reaching the picture`);
}

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
say(`elevation (read off the crowd camera, which reads frameWorld): ${RENDER_ELEV_DEG}° on every arm`);
say(
  `shipped ratio (LAND_AREA_PER_CAPABILITY): ${LAND_AREA_PER_CAPABILITY} units² per capability → the shipped arm is ${SHIPPED_ARM} · ` +
    `LAND_SCALE ${LAND_SCALE.toFixed(4)} against the tuned ${TUNED_LAND_AREA_PER_CAPABILITY.toFixed(1)} · cover rung x${COVER_DENSITY} at size ${COVER_SIZE} · ` +
    `control (history): cover x${PREVIOUS_COVER_DENSITY} per recipe island of ${PREVIOUS_RECIPE_ISLAND_AREA.toFixed(1)} units²`,
);
say('');
say('THE ARMS');
for (const arm of ARMS) say(`  ${arm.padEnd(10)} ${armCaption(arm)}`);
say('');
say('THE REFERENCE — the approved Cycles render, through this page’s own readers');
say(
  `  land-combined-1948px.png: ${result.reference.width}×${result.reference.height}, island box ${result.reference.box.w}×${result.reference.box.h} px ` +
    `(w/h ${result.reference.aspect.toFixed(3)}) · colour families ${result.reference.families} · largest ${pct(result.reference.largestShare)} · ` +
    `MICRO ${result.reference.stats.micro.toFixed(2)} · STRUCT ${result.reference.stats.struct.toFixed(2)}`,
);
say('  ⚠ measured, never differenced: another resolution and framing, and its pines are the recipe’s stands, not one per capability.');
say('');
for (const { picture, zoom } of SHOTS) {
  say(`── ${picture} @ ${zoom === 'fit' ? 'fit (each arm at its own fit)' : `${zoom} px/unit`} ─────────────────────────────────`);
  say(
    'arm        units²/cap  caps  land units²  TREES  blooms  cover  bushes  tufts  flowers   px/unit  island (units)  on screen (px)   pine px  land% frame  land% box  tris      fam  largest  MICRO  moved>20 vs today  vs neighbour',
  );
  for (const arm of ARMS) {
    const r = at(arm, picture, zoom);
    const c = r.counts;
    say(
      `${arm.padEnd(10)} ${r.land.unitsPerCapability.toFixed(0).padStart(10)}  ${String(r.land.capabilities).padStart(4)}  ${r.land.landArea.toFixed(0).padStart(11)}  ` +
        `${String(c.capabilityTrees).padStart(5)}  ${String(c.blooms).padStart(6)}  ${String(c.cover).padStart(5)}  ${String(c.bushes).padStart(6)}  ${String(c.tufts).padStart(5)}  ${String(c.flowerPatches).padStart(7)}  ` +
        `${r.pxPerUnit.toFixed(3).padStart(8)}  ${`${r.island.w.toFixed(0)}×${r.island.d.toFixed(0)}`.padStart(14)}  ${`${r.screen.wPx.toFixed(0)}×${r.screen.hPx.toFixed(0)}`.padStart(14)}  ` +
        `${r.pineHeightPx.toFixed(0).padStart(7)}  ${pct(r.landShare, 2).padStart(10)}  ${pct(r.landShareOfBox).padStart(9)}  ${String(r.triangles).padStart(8)}  ${String(r.families).padStart(3)}  ` +
        `${pct(r.largestShare).padStart(6)}  ${r.stats.micro.toFixed(2).padStart(5)}  ${String(r.visible).padStart(17)}  ${(r.visibleVsNeighbour === null ? '—' : String(r.visibleVsNeighbour)).padStart(12)}`,
    );
  }
  if (picture !== 'one') {
    for (const arm of ARMS) {
      const r = at(arm, picture, zoom);
      say(`  ${arm.padEnd(10)} ${countsCaption(r.counts, r.land, picture)} · forest ${r.ground.w.toFixed(0)}×${r.ground.d.toFixed(0)} units · total land ${r.totalLand.toFixed(0)} units²`);
    }
  }
  say('');
}

say('THE OWNER’S QUESTION, IN NUMBERS — one island at the read zoom:');
for (const arm of ARMS) {
  const r = at(arm, 'one', READ_ZOOM);
  say(
    `  ${arm.padEnd(10)} ${r.land.unitsPerCapability.toFixed(0).padStart(5)} units² per capability · island ${r.island.w.toFixed(0)}×${r.island.d.toFixed(0)} units (${r.screen.wPx.toFixed(0)}×${r.screen.hPx.toFixed(0)} px) · ` +
      `${String(r.counts.capabilityTrees).padStart(3)} trees on ${r.land.capabilities} capabilities · ${String(r.counts.cover).padStart(4)} ground cover` +
      (arm === SHIPPED_ARM ? '   ← SHIPPED' : arm === CONTROL_ARM ? '   ← TODAY (before this landing)' : ''),
  );
}
say('');
say('THE LAYOUT QUESTION, IN NUMBERS — the forest fitted, layout held still (what ships) against compacted (the other answer):');
for (const arm of ARMS) {
  const still = at(arm, 'forest', 'fit');
  const compact = at(arm, 'forest-compact', 'fit');
  say(
    `  ${arm.padEnd(10)} held still: land ${pct(still.landShare, 2)} of the frame, island ${still.screen.wPx.toFixed(0)}px wide at ${still.pxPerUnit.toFixed(3)} px/unit, pine ${still.pineHeightPx.toFixed(1)} px · ` +
      `compacted: land ${pct(compact.landShare, 2)}, island ${compact.screen.wPx.toFixed(0)}px wide at ${compact.pxPerUnit.toFixed(3)} px/unit, pine ${compact.pineHeightPx.toFixed(1)} px`,
  );
}
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row,');
say('  an arc intent or an earlier evidence sheet. Frame cost is shipped-land-ratio-cost.mjs’s and REPORTS (ADR-0517 D4).');
say(`ladders: land ${LAND_LADDER.join(' / ')} units² per capability · cover x${COVER_LADDER.join(' / x')}`);

for (const [name, dataUrl] of Object.entries(result.frames)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'reference.json'), JSON.stringify(result.reference, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.frames).length} frames + measurements.json + reference.json + report.txt to ${OUT}`);
await browser.close();
