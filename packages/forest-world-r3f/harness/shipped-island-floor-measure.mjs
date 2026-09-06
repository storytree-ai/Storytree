// shipped-island-floor-measure.mjs — drive `shipped-island-floor.html`: the zero-capability islands
// before and after the one-hex floor, on the real forest, measured and written out as frames, the
// per-island table and a report. Run it on the arc's named box (the RTX 2060, ADR-0505 D3).
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5421 --strictPort --host 127.0.0.1
//   ST_FLOOR_URL=http://127.0.0.1:5421/shipped-island-floor.html pnpm --filter @storytree/forest-world-r3f measure-shipped-island-floor
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE FLOOR: a
// software rasteriser; an insensitive delta instrument; a control that differs from itself; a
// shipped arm byte-identical to the control (nothing shipped); a camera that is not the signed
// elevation; a control on which the finding is NOT reproduced (no zero-capability island, or none
// of them left as drawn, or no inverted pair — then there was nothing to fix); a shipped arm on which
// any island is off `max(1, capabilities) × 318`, or on which any pair is still inverted; a read
// island that holds a capability after all.
//
// ⚠ IT DECIDES NOTHING. The decision is the owner's (2026-09-06) and lands in
// `src/land-per-capability.ts` (`LAND_FLOOR_CAPABILITIES`); this prints what it did to the map.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import { LAND_AREA_PER_CAPABILITY, LAND_FLOOR_CAPABILITIES } from '../src/land-per-capability.ts';
import {
  FLOOR_ARMS,
  FLOOR_CONTROL_ARM,
  FLOOR_PICTURES,
  FLOOR_SHIPPED_ARM,
  PRE_FLOOR,
  READ_ZERO_ISLAND,
  floorArmCaption,
  floorArmsFor,
} from './shipped-island-floor-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_FLOOR_URL'] ?? 'http://localhost:5421/shipped-island-floor.html';
const OUT = process.env['ST_FLOOR_OUT'] ?? join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-one-hex-floor-2026-09-06');
const ANGLE = process.env['ST_FLOOR_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_FLOOR_ALLOW_SOFTWARE'] === '1';

const SHOTS = FLOOR_PICTURES.flatMap((p) => floorArmsFor(p.id).map((arm) => ({ picture: p.id, arm })));

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_FLOOR_URL points at 5184, the port every worktree's vite pins by default — a sibling worktree " +
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
await page.waitForFunction(() => window.islandFloorRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([shots, arms]) => {
    const r = window.islandFloorRunner;
    const rows = [];
    for (const { picture, arm } of shots) rows.push(r.read(arm, picture));
    const land = {};
    for (const arm of arms) land[arm] = r.land(arm);
    const frames = {};
    for (const { picture, arm } of shots) frames[`${arm}-${picture}`] = r.snapshot(arm, picture);
    return {
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      layout: r.layout(),
      rows,
      land,
      frames,
      sensitivity: r.sensitivity('forest'),
    };
  },
  [SHOTS, FLOOR_ARMS.map((a) => a.id)],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set DISPLAY=:0 on the Mint box so ` +
      'headless chromium reaches the GPU, or ST_FLOOR_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers anyway — ' +
      'and do not quote a software frame as this map’s picture.',
  );
}
if (result.sensitivity.length > 0) {
  fail(`the visible-delta instrument failed its own sensitivity rung, so no reading below means anything:\n  ${result.sensitivity.join('\n  ')}`);
}

const at = (arm, picture) => result.rows.find((r) => r.arm === arm && r.picture === picture);
const today = result.land[FLOOR_CONTROL_ARM];
const shipped = result.land[FLOOR_SHIPPED_ARM];

for (const row of result.rows) {
  const where = `${row.arm} at ${row.picture}`;
  if (row.landPx === 0) fail(`${where} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${where} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) fail(`${where} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 1e-6) fail(`${where} is not judged from the signed ${RENDER_ELEV_DEG}° (${row.elevationDeg})`);
}
for (const pic of FLOOR_PICTURES) {
  const control = at(FLOOR_CONTROL_ARM, pic.id);
  if (control.touched !== 0) fail(`the CONTROL arm differs from itself at ${pic.id} (${control.touched} px) — the denominator is not a denominator`);
  const s = at(FLOOR_SHIPPED_ARM, pic.id);
  if (s.touched === 0) fail(`the shipped arm is byte-identical to the control at ${pic.id} — nothing shipped`);
  if (s.pxPerUnit !== control.pxPerUnit) fail(`${pic.id}: the two arms are not on the same frame (${control.pxPerUnit} vs ${s.pxPerUnit} px/unit)`);
}

// THE FINDING MUST BE REPRODUCED ON THE CONTROL, or there was nothing to fix.
if (today.zero.length === 0) fail('the layout carries no zero-capability island — the finding this page exists for is not on this map');
for (const z of today.zero) {
  if (Math.abs(z.area - z.drawn) > 1e-6) fail(`on the control, ${z.id} (0 capabilities) is not left as drawn (${z.area} vs ${z.drawn}) — the control is not the rule as it stood`);
}
if (today.inversions.length === 0) fail('the control has NO inverted pair — the zero-capability islands are not larger than any island holding work, so there is nothing to fix');
if (!today.zero.some((z) => z.id === READ_ZERO_ISLAND)) fail(`the read island ${READ_ZERO_ISLAND} holds a capability after all — it is not the zero-capability island this page reads`);
// AND THE FLOOR MUST CLOSE IT ON THE SHIPPED ARM.
if (!shipped.ratioHeld) fail(`on the shipped arm an island is off max(${LAND_FLOOR_CAPABILITIES}, capabilities) × ${LAND_AREA_PER_CAPABILITY} by ${shipped.ratioError} units²`);
if (shipped.inversions.length > 0) {
  fail(`on the shipped arm ${shipped.inversions.length} pair(s) are still drawn the wrong way round: ${shipped.inversions.map((p) => `${p.smaller} (${p.smallerCapabilities}, ${p.smallerArea.toFixed(0)}) > ${p.larger} (${p.largerCapabilities}, ${p.largerArea.toFixed(0)})`).join('; ')}`);
}
for (const z of shipped.zero) {
  if (Math.abs(z.area - LAND_FLOOR_CAPABILITIES * LAND_AREA_PER_CAPABILITY) > 1e-6) fail(`on the shipped arm ${z.id} draws ${z.area} units², not one capability’s worth`);
}
if (shipped.islands.length !== today.islands.length) fail('the two arms stand different island sets');

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
say(`layout: ${result.layout.id} — ${result.layout.islands} islands, exported ${result.layout.generatedAt} from studio ${result.layout.head}`);
say(`elevation: ${RENDER_ELEV_DEG}° on every arm · ${LAND_AREA_PER_CAPABILITY} units² per capability · floor ${LAND_FLOOR_CAPABILITIES} (control ${PRE_FLOOR})`);
say('');
say('THE ARMS');
for (const a of FLOOR_ARMS) say(`  ${a.id.padEnd(8)} ${floorArmCaption(a.id)}`);
say('');
say('THE OWNER’S QUESTION, ANSWERED PER ARM');
for (const arm of [FLOOR_CONTROL_ARM, FLOOR_SHIPPED_ARM]) {
  const l = result.land[arm];
  const most = [...l.islands].sort((a, b) => b.capabilities - a.capabilities)[0];
  say(`  ${arm}:`);
  say(`    largest island: ${l.largest.id} — ${l.largest.capabilities} capabilities, ${l.largest.area.toFixed(0)} units² (rank 1 of ${l.islandsCount})`);
  say(`    most work:      ${most.id} — ${most.capabilities} capabilities, ${most.area.toFixed(0)} units² (rank ${most.rank})`);
  say(`    ${l.largest.id === most.id ? 'YES — the biggest island is the one with the most work in it' : 'NO — the biggest island is NOT the one with the most work in it'}`);
  say(`    smallest island: ${l.smallest.id} — ${l.smallest.capabilities} capabilities, ${l.smallest.area.toFixed(0)} units²`);
  say(`    zero-capability islands: ${l.zero.map((z) => `${z.id} rank #${z.rank} (${z.area.toFixed(0)} units²)`).join(', ')}`);
  say(`    pairs drawn the wrong way round (fewer capabilities, more land): ${l.inversions.length}`);
  if (l.inversions.length > 0) {
    const bySmaller = new Map();
    for (const p of l.inversions) bySmaller.set(p.smaller, (bySmaller.get(p.smaller) ?? 0) + 1);
    for (const [id, n] of bySmaller) {
      const worst = l.inversions.filter((p) => p.smaller === id).sort((a, b) => b.largerCapabilities - a.largerCapabilities)[0];
      say(`      ${id}: larger than ${n} island(s) holding work, up to ${worst.larger} (${worst.largerCapabilities} capabilities, ${worst.largerArea.toFixed(0)} units²) — ${(worst.smallerArea / worst.largerArea).toFixed(2)}× its size`);
    }
  }
  say(`    every island at max(${l.floor}, capabilities) × ${LAND_AREA_PER_CAPABILITY}: ${l.ratioHeld ? 'yes' : `NO (max error ${l.ratioError.toFixed(1)} units²)`}`);
  say(`    total land: ${l.totalLand.toFixed(0)} units²`);
}
say('');
say('EVERY ISLAND — capability count, the 2D drawing’s tiles, land as drawn, land on each arm and its rank (largest first on the shipped arm)');
say(`  ${'island'.padEnd(34)} ${'caps'.padStart(4)} ${'tiles'.padStart(5)} ${'drawn'.padStart(8)} ${'today'.padStart(8)} ${'rank'.padStart(4)} ${'shipped'.padStart(8)} ${'rank'.padStart(4)} ${'per cap'.padStart(8)}`);
const todayRank = new Map(today.islands.map((r) => [r.id, r]));
for (const r of shipped.islands) {
  const t = todayRank.get(r.id);
  say(
    `  ${r.id.padEnd(34)} ${String(r.capabilities).padStart(4)} ${String(r.tiles ?? '—').padStart(5)} ${r.drawn.toFixed(0).padStart(8)} ${t.area.toFixed(0).padStart(8)} ${String(t.rank).padStart(4)} ${r.area.toFixed(0).padStart(8)} ${String(r.rank).padStart(4)} ${(r.perCapability === null ? '—' : r.perCapability.toFixed(1)).padStart(8)}${r.capabilities === 0 ? '   ← no capabilities' : ''}`,
  );
}
say('');
for (const pic of FLOOR_PICTURES) {
  say(`── ${pic.id} @ ${pic.zoom === 'fit' ? 'fit' : `${pic.zoom} px/unit`} ─────────────────────────────────`);
  say('arm       casters  placements  stamp ms  land px    land % of frame   island box (px)   fam  moved>20 vs today  touched  vs shipped');
  for (const arm of floorArmsFor(pic.id)) {
    const r = at(arm, pic.id);
    say(
      `${arm.padEnd(8)} ${String(r.casters).padStart(8)}  ${String(r.placements).padStart(10)}  ${r.buildMs.toFixed(0).padStart(8)}  ${String(r.landPx).padStart(7)}  ${pct(r.landShare).padStart(16)}   ${`${r.box.w}×${r.box.h}`.padStart(15)}   ${String(r.families).padStart(3)}  ${String(r.visible).padStart(17)}  ${String(r.touched).padStart(7)}  ${String(r.touchedVsShipped).padStart(10)}`,
    );
  }
  say('');
}
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row, an arc intent or an earlier evidence sheet.');
say(`⚠ The 2D studio map itself still draws a zero-capability story at ${today.zero[0].tiles} tiles until ADR-0528’s derived tile lands; this page reaches only the 3D mapper.`);

for (const [name, dataUrl] of Object.entries(result.frames)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'islands.json'), JSON.stringify(result.land, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.frames).length} frames + measurements.json + islands.json + report.txt to ${OUT} (visible-delta bar ${VISIBLE_DELTA}/255)`);
await browser.close();
