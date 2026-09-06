// shipped-tile-measure.mjs — drive `shipped-tile.html`: the 2D tile footprint derived from the land
// ratio (ADR-0528), with the gap re-laddered over it (D5), on the REAL layout — measured and written
// out as frames, numbers and a report. Run it on the arc's named box
// (the RTX 2060, ADR-0505 D3) for figures that go in a README.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5392 --strictPort --host 127.0.0.1
//   ST_TILE_URL=http://127.0.0.1:5392/shipped-tile.html pnpm --filter @storytree/forest-world-r3f measure-shipped-tile
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU; and the
//    scenes exported first by apps/studio/scripts/export-tile-scenes.mjs)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE SPACING: a software
// rasteriser; an insensitive delta instrument; a control that differs from itself; a camera that is not
// the signed 50°; an island whose land is not EXACTLY the shipped ratio on ANY arm (the island must be
// unaffected); a read island that moved in size between arms; a ladder whose forest does not tighten
// as the ratio falls; two 3D islands overlapping; a trail dropped at any rung; and an arm that drew no kit.
//
// ⚠ IT DECIDES NOTHING ABOUT COST. Frame cost is `shipped-tile-cost.mjs`'s, and it reports. The rung
// is picked on the LOOK (ADR-0503) and lands in `apps/studio/src/lib/islandSpacing.ts`.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import { LAND_AREA_PER_CAPABILITY } from '../src/land-per-capability.ts';
import { READ_ISLAND, SPACING_READ_ZOOM, SPACING_SHOTS } from './shipped-spacing-scene.ts';
import { TILE_EVIDENCE_DIR } from './shipped-tile-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_TILE_URL'] ?? 'http://localhost:5392/shipped-tile.html';
const OUT = process.env['ST_TILE_OUT'] ?? join(HERE, '..', '..', '..', 'docs', 'research', TILE_EVIDENCE_DIR);
const ANGLE = process.env['ST_TILE_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_TILE_ALLOW_SOFTWARE'] === '1';

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_TILE_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.tileRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([shots, readZoom]) => {
    const r = window.tileRunner;
    const arms = r.arms();
    const rows = [];
    for (const { picture, zoom } of shots) {
      for (const arm of arms) rows.push({ picture, zoom, ...r.read(arm, picture, zoom) });
    }
    const frames = {};
    for (const arm of arms) {
      for (const { picture, zoom } of shots) frames[`${arm}-${picture}-${zoom}`] = r.snapshot(arm, picture, zoom);
    }
    return {
      manifest: r.manifest(),
      arms,
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      rows,
      frames,
      sensitivity: r.sensitivity('one', readZoom),
    };
  },
  [SPACING_SHOTS, SPACING_READ_ZOOM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set DISPLAY=:0 on the Mint box so ` +
      'headless chromium reaches the GPU, or ST_TILE_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
      'anyway — and do not quote a software frame as this map’s picture.',
  );
}
if (result.sensitivity.length > 0) {
  fail(`the visible-delta instrument failed its own sensitivity rung, so no reading below means anything:\n  ${result.sensitivity.join('\n  ')}`);
}

const ARMS = result.arms;
const CONTROL = result.manifest.control;
const SHIPPED_RATIO = result.manifest.shippedRatio;
const shippedArm = ARMS.find((a) => a !== CONTROL && result.rows.find((r) => r.arm === a)?.ratio === SHIPPED_RATIO);
if (shippedArm === undefined) fail(`no arm carries the shipped ratio ${SHIPPED_RATIO} — the ladder does not include the pick`);
const at = (arm, picture, zoom) => result.rows.find((r) => r.arm === arm && r.picture === picture && r.zoom === zoom);

for (const row of result.rows) {
  const where = `${row.arm} at ${row.picture}/${row.zoom}`;
  if (row.landPx === 0) fail(`${where} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${where} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) fail(`${where} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 1e-9) fail(`${row.arm} is not judged from the signed ${RENDER_ELEV_DEG}°`);
  // ⚠⚠ THE ISLANDS ARE UNAFFECTED: every island on every arm holds EXACTLY the shipped land ratio.
  if (Math.abs(row.bounds.unitsPerCapability.min - LAND_AREA_PER_CAPABILITY) > 1e-6 || Math.abs(row.bounds.unitsPerCapability.max - LAND_AREA_PER_CAPABILITY) > 1e-6) {
    fail(`${where}: land per capability ranges ${row.bounds.unitsPerCapability.min}–${row.bounds.unitsPerCapability.max} against the shipped ${LAND_AREA_PER_CAPABILITY} — an island changed size`);
  }
  if (row.read.id !== READ_ISLAND) fail(`${where} centred the read zoom on ${row.read.id}`);
  // ⚠ Two 3D islands overlapping is a FINDING of the ladder, not a defect of the instrument: the lattice
  // floor keeps 2D tiles apart, and a 3D island is sized to its ratio regardless of its tile, so a
  // rung tight enough to overlap in 3D is simply not a rung that can ship (ADR-0528 D5). It is
  // recorded on every arm and REFUSED only on the shipped pick.
  if (row.tightest.overlap && row.arm === shippedArm) {
    fail(`${where}: the SHIPPED pick stands ${row.tightest.a} and ${row.tightest.b} OVERLAPPING in 3D — pick a rung with water between every pair`);
  }
  if (row.trails.dropped.length !== 0) fail(`${where}: ${row.trails.dropped.length} trails DROPPED at this rung: ${JSON.stringify(row.trails.dropped)}`);
}

const control0 = at(CONTROL, 'forest', 'fit');
for (const { picture, zoom } of SPACING_SHOTS) {
  const control = at(CONTROL, picture, zoom);
  if (control.touched !== 0) fail(`the CONTROL arm differs from itself at ${picture}/${zoom} (${control.touched} px) — the denominator is not a denominator`);
  for (const arm of ARMS) {
    const row = at(arm, picture, zoom);
    if (row.bounds.islands !== control.bounds.islands) fail(`${arm} at ${picture}/${zoom} stands ${row.bounds.islands} islands against the control's ${control.bounds.islands}`);
    if (row.trails.edges !== control.trails.edges) fail(`${arm} routes ${row.trails.edges} trails against the control's ${control.trails.edges} — an edge was lost`);
    if (row.counts.capabilityTrees !== control.counts.capabilityTrees) fail(`${arm} at ${picture}/${zoom} stands ${row.counts.capabilityTrees} trees against the control's ${control.counts.capabilityTrees}`);
    // the read island is the same island: same capabilities, same land
    if (row.read.capabilities !== control.read.capabilities || Math.abs(row.read.landArea - control.read.landArea) > 1e-6) {
      fail(`${arm}: ${READ_ISLAND} holds ${row.read.capabilities} capabilities on ${row.read.landArea} units² against the control's ${control.read.capabilities} on ${control.read.landArea} — the island is not unaffected`);
    }
  }
}
// ⚠ THE LADDER TIGHTENS: the forest's centre-to-centre extent must not grow as the ratio falls, rung to rung.
const rungs = ARMS.filter((a) => a !== CONTROL).map((a) => at(a, 'forest', 'fit'));
for (let i = 1; i < rungs.length; i += 1) {
  const up = rungs[i - 1];
  const here = rungs[i];
  const areaUp = up.bounds.centres.w * up.bounds.centres.d;
  const areaHere = here.bounds.centres.w * here.bounds.centres.d;
  if (areaHere > areaUp * 1.001) fail(`${here.arm} spans ${here.bounds.centres.w.toFixed(0)}×${here.bounds.centres.d.toFixed(0)} against ${up.arm}'s ${up.bounds.centres.w.toFixed(0)}×${up.bounds.centres.d.toFixed(0)} — the ladder does not tighten`);
}
// ⚠⚠ THE TILE MUST ACTUALLY CLOSE THE SLOT: the derived tile at the CONTROL'S OWN ratio must stand the
// forest in a smaller box than the control — otherwise the footprint did not follow the land.
{
  const sameRatio = rungs.find((r) => r.ratio === at(CONTROL, 'forest', 'fit').ratio);
  if (sameRatio === undefined) fail(`no derived-tile arm carries the control's ratio ${at(CONTROL, 'forest', 'fit').ratio} — the tile cannot be compared like for like`);
  const c = at(CONTROL, 'forest', 'fit');
  const areaC = c.bounds.centres.w * c.bounds.centres.d;
  const areaT = sameRatio.bounds.centres.w * sameRatio.bounds.centres.d;
  if (!(areaT < areaC)) fail(`${sameRatio.arm} spans ${sameRatio.bounds.centres.w.toFixed(0)}×${sameRatio.bounds.centres.d.toFixed(0)} against the control's ${c.bounds.centres.w.toFixed(0)}×${c.bounds.centres.d.toFixed(0)} at the same ratio — the derived tile did not close the slot`);
}
// ⚠ THE LADDER MUST ACTUALLY MOVE THE PICTURE on the forest, rung to rung.
for (const arm of ARMS) {
  if (arm === CONTROL) continue;
  const row = at(arm, 'forest', 'fit');
  if (row.touched === 0) fail(`${arm} at forest/fit is byte-identical to the control — nothing changed`);
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
say(`elevation (read off the camera): ${RENDER_ELEV_DEG}° on every arm · land ${LAND_AREA_PER_CAPABILITY} units² per capability on every island of every arm`);
say(`scenes: exported ${result.manifest.generatedAt} from the studio at ${result.manifest.studio.head} (${result.manifest.studio.branch}) · shipped spacing ratio ${SHIPPED_RATIO} → the shipped arm is ${shippedArm}`);
say(`derived tile: hex radius ${result.manifest.tile.hexR.toFixed(4)}, ${result.manifest.tile.tilesPerCapability} tile per capability (${result.manifest.tile.quota}) · control tile: hex radius ${result.manifest.controlTile.hexR}, ${result.manifest.controlTile.quota}`);
say('');
say('THE ARMS');
for (const a of result.manifest.arms) {
  const s = a.spacing;
  const tile = `hex radius ${a.tile.hexR.toFixed(2)}, ${a.tile.quota}`;
  say(`  ${a.id.padEnd(17)} ${a.id === CONTROL ? `the map as it SHIPPED — ${tile}, spacing ratio ${s.ratio} — TODAY (CONTROL)` : `the DERIVED tile — ${tile} — every gap ${s.ratio} × the mean radius of the two islands it separates`}${a.id === shippedArm ? '   ← SHIPPED' : ''} · 2D world ${a.world.width}×${a.world.height} · trails ${a.trails.edges} routed / ${a.trails.dropped.length} dropped · source ${a.source.head.slice(0, 8)} (${a.source.branch})`);
}
say('');
for (const { picture, zoom } of SPACING_SHOTS) {
  say(`── ${picture} @ ${zoom === 'fit' ? 'fit (each arm at its own fit)' : `${zoom} px/unit`} ─────────────────────────────────`);
  say(
    'arm                ratio  islands  centres span (units)  ground extent (units)  tightest pair (units, water)    px/unit  land% frame  land% box  island px  pine px   TREES  cover   tris     fam  MICRO  moved>20 vs today  vs neighbour',
  );
  for (const arm of ARMS) {
    const r = at(arm, picture, zoom);
    say(
      `${arm.padEnd(17)} ${(r.ratio === null ? '—' : String(r.ratio)).padStart(6)}  ${String(r.bounds.islands).padStart(7)}  ` +
        `${`${r.bounds.centres.w.toFixed(0)}×${r.bounds.centres.d.toFixed(0)}`.padStart(20)}  ${`${r.bounds.ground.w.toFixed(0)}×${r.bounds.ground.d.toFixed(0)}`.padStart(21)}  ` +
        `${`${r.tightest.centres.toFixed(0)}, ${r.tightest.overlap ? 'OVERLAP' : r.tightest.water.toFixed(0)}`.padStart(14)} ${`${r.tightest.a}↔${r.tightest.b}`.slice(0, 16).padEnd(16)}  ` +
        `${r.pxPerUnit.toFixed(3).padStart(7)}  ${pct(r.landShare, 2).padStart(10)}  ${pct(r.landShareOfBox).padStart(9)}  ` +
        `${(r.read.w * r.pxPerUnit).toFixed(0).padStart(9)}  ${r.pineHeightPx.toFixed(1).padStart(7)}  ${String(r.counts.capabilityTrees).padStart(5)}  ${String(r.counts.cover).padStart(5)}  ` +
        `${String(r.triangles).padStart(7)}  ${String(r.families).padStart(3)}  ${r.stats.micro.toFixed(2).padStart(5)}  ${String(r.visible).padStart(17)}  ${(r.visibleVsNeighbour === null ? '—' : String(r.visibleVsNeighbour)).padStart(12)}` +
        (arm === shippedArm ? '   ← SHIPPED' : arm === CONTROL ? '   ← TODAY' : ''),
    );
  }
  say('');
}
say(`THE READ ISLAND (${READ_ISLAND}) — unaffected on every arm:`);
for (const arm of ARMS) {
  const r = at(arm, 'one', SPACING_READ_ZOOM);
  say(`  ${arm.padEnd(17)} ${r.read.capabilities} capabilities · ${r.read.landArea.toFixed(1)} units² (${r.read.unitsPerCapability.toFixed(1)} per capability) · ${r.read.w.toFixed(0)}×${r.read.d.toFixed(0)} units · moved>${VISIBLE_DELTA} vs today ${r.visible.toLocaleString()} (its outline is composed from one hex per capability instead of capabilities + 2, and the ground noise is world-anchored, so pixels move; its LAND cannot)`);
}
say('');
say('THE TILE QUESTION, IN NUMBERS — the whole real forest, fitted:');
for (const arm of ARMS) {
  const r = at(arm, 'forest', 'fit');
  say(
    `  ${arm.padEnd(17)} land ${pct(r.landShare, 2)} of the frame (${pct(r.landShareOfBox)} of its own box) · centres span ${r.bounds.centres.w.toFixed(0)}×${r.bounds.centres.d.toFixed(0)} units ` +
      `(${pct((r.bounds.centres.w * r.bounds.centres.d) / (control0.bounds.centres.w * control0.bounds.centres.d), 0)} of today's area) · tightest pair ${r.tightest.overlap ? 'OVERLAPS' : `${r.tightest.water.toFixed(0)} units of water`} (${r.tightest.a}↔${r.tightest.b}) · ` +
      `island ${(r.read.w * r.pxPerUnit).toFixed(0)} px wide · pine ${r.pineHeightPx.toFixed(1)} px` +
      (arm === shippedArm ? '   ← SHIPPED' : arm === CONTROL ? '   ← TODAY (before this landing)' : ''),
  );
}
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row,');
say('  an arc intent or an earlier evidence sheet. Frame cost is shipped-tile-cost.mjs’s and REPORTS (ADR-0517 D4).');

for (const [name, dataUrl] of Object.entries(result.frames)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.frames).length} frames + measurements.json + report.txt to ${OUT}`);
await browser.close();
