// shipped-camera-measure.mjs — drive `shipped-camera.html`: the camera's elevation ladder on two
// ground footprints, measured and written out as frames, numbers and a report. Run it on the arc's
// named box (the RTX 2060, ADR-0505 D3) for figures that go in a README.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5374 --strictPort --host 127.0.0.1
//   ST_CAMERA_URL=http://127.0.0.1:5374/shipped-camera.html pnpm --filter @storytree/forest-world-r3f measure-shipped-camera
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE CAMERA OR THE
// FOOTPRINT: a software rasteriser; an insensitive delta instrument; a control that differs from
// itself; a control that does not look along the SHIPPED camera; two elevation rungs of one
// footprint that do not share a ground build or a placement list (then a difference between them is
// not the camera's); a true footprint that is not the map footprint stretched by exactly the
// drawing's projection (then the footprint arm is a different island, not the same island
// unprojected); a rung byte-identical to the rung below it; and an arm that drew no kit.
//
// ⚠ IT DECIDES NOTHING. It refuses runs that could not answer the question and writes down what
// the ones that can answer say. The pick is the owner's.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { groundFlattening } from '@storytree/forest-world';

import {
  CAMERA_ARMS,
  CONTROL_ARM,
  ELEVATION_LADDER,
  FOOTPRINTS,
  REFERENCE_GEOMETRY_ARM,
  SHIPPED_ELEVATION_DEG,
  SIGNED_ELEVATION_DEG,
  armCaption,
  armId,
  lowerArm,
} from './shipped-camera-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_CAMERA_URL'] ?? 'http://localhost:5374/shipped-camera.html';
const OUT =
  process.env['ST_CAMERA_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-camera-elevation-2026-09-05');
const ANGLE = process.env['ST_CAMERA_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_CAMERA_ALLOW_SOFTWARE'] === '1';

const ARMS = CAMERA_ARMS.map((a) => a.id);
const SIZES = ['one', 'forest'];
const ZOOMS = [8, 'fit'];
const READ_ZOOM = 8;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_CAMERA_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.cameraRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, sizes, zooms, readZoom]) => {
    const r = window.cameraRunner;
    const rows = [];
    for (const size of sizes) {
      for (const zoom of zooms) {
        for (const arm of arms) rows.push({ size, zoom, ...r.read(arm, size, zoom) });
      }
    }
    const reference = await r.reference('/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png');
    const shots = {};
    for (const arm of arms) {
      for (const size of sizes) {
        for (const zoom of zooms) shots[`${arm}-${size}-${zoom}`] = r.snapshot(arm, size, zoom);
      }
    }
    return {
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      agreement: r.agreement(),
      rows,
      reference,
      shots,
      sensitivity: r.sensitivity('one', readZoom),
    };
  },
  [ARMS, SIZES, ZOOMS, READ_ZOOM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set ST_CAMERA_ANGLE=default on ` +
      'the Windows box to reach its GPU, or ST_CAMERA_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
      'anyway — and do not quote a software frame as this map’s picture.',
  );
}
if (result.agreement.length > 0) {
  fail(`the control arm is not today’s camera:\n  ${result.agreement.join('\n  ')}`);
}
if (result.sensitivity.length > 0) {
  fail(
    'the visible-delta instrument failed its own sensitivity rung, so no reading below means ' +
      `anything:\n  ${result.sensitivity.join('\n  ')}`,
  );
}

const at = (arm, size, zoom) => result.rows.find((r) => r.arm === arm && r.size === size && r.zoom === zoom);

for (const row of result.rows) {
  if (row.land === 0) fail(`${row.arm} at ${row.size}/${row.zoom} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${row.arm} at ${row.size}/${row.zoom} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) {
    fail(`${row.arm} at ${row.size}/${row.zoom} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  }
  // ⚠ WITHIN A FOOTPRINT, EVERY RUNG STANDS ON THE SAME GROUND AND THE SAME PROPS — or the
  // difference between two rungs is not the camera's.
  const bottom = at(armId(row.footprint, ELEVATION_LADDER[0]), row.size, row.zoom);
  for (const key of ['groundTriangles', 'placements', 'casters', 'meshes', 'triangles']) {
    if (row[key] !== bottom[key]) {
      fail(
        `${row.arm} at ${row.size}/${row.zoom} has ${key} ${row[key]} against ${bottom.arm}'s ${bottom[key]} — ` +
          'the rungs of one footprint do not share a scene, so no difference between them is the camera’s',
      );
    }
  }
  if (Math.abs(row.ground.w - bottom.ground.w) > 1e-9 || Math.abs(row.ground.d - bottom.ground.d) > 1e-9) {
    fail(`${row.arm} at ${row.size}/${row.zoom} stands on a different ground footprint from ${bottom.arm}`);
  }
}

// ⚠ THE TRUE FOOTPRINT IS THE MAP FOOTPRINT STRETCHED BY EXACTLY THE DRAWING'S PROJECTION —
// same width, depth divided by sin of the declared land camera. Anything else is a different island.
const stretch = 1 / groundFlattening();
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const map = at(armId('map', ELEVATION_LADDER[0]), size, zoom);
    const tru = at(armId('true', ELEVATION_LADDER[0]), size, zoom);
    if (Math.abs(map.ground.w - tru.ground.w) > 1e-6) {
      fail(`the true footprint at ${size} is ${tru.ground.w} wide against the map's ${map.ground.w} — the unprojection moved x`);
    }
    const want = map.ground.d * stretch;
    if (Math.abs(tru.ground.d - want) > 1e-6) {
      fail(
        `the true footprint at ${size} is ${tru.ground.d.toFixed(3)} deep; the map's ${map.ground.d.toFixed(3)} ` +
          `divided by sin(${((Math.asin(1 / stretch) * 180) / Math.PI).toFixed(1)}°) is ${want.toFixed(3)} — the footprint arm is not the same island unprojected`,
      );
    }
  }
}

for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const control = at(CONTROL_ARM, size, zoom);
    if (control.touched !== 0) {
      fail(`the CONTROL arm differs from itself at ${size}/${zoom} (${control.touched} px) — the denominator is not a denominator`);
    }
  }
}

// ⚠ THE LADDER MUST ACTUALLY MOVE THE PICTURE, rung to rung, and the footprint must move it at
// every rung. A byte-identical neighbour means the parameter never reached the camera.
for (const size of SIZES) {
  for (const arm of ARMS) {
    const row = at(arm, size, READ_ZOOM);
    const lower = lowerArm(arm);
    if (lower !== null && row.touchedVsLower === 0) {
      fail(`${arm} at ${size} is byte-identical to ${lower} — the elevation is not reaching the camera`);
    }
    if (row.touchedVsOtherFootprint === 0) {
      fail(`${arm} at ${size} is byte-identical to its other-footprint twin — the footprint is not reaching the ground`);
    }
  }
}

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};
const pct = (x) => `${(x * 100).toFixed(1)}%`;
say(`renderer: ${result.id.vendor} — ${result.id.renderer}`);
say(`software=${result.id.software}`);
say(
  `light probe: a lit white face delivered ${result.calibration.probe.toFixed(4)} at the authored intensities; ` +
    `scale ${result.calibration.scale.toFixed(4)} onto the ladder's ${result.calibration.target}; floor ${result.calibration.floor}`,
);
say(`shipped elevation (read off frameWorld): ${SHIPPED_ELEVATION_DEG.toFixed(4)}° · signed elevation (RENDER_ELEV_DEG): ${SIGNED_ELEVATION_DEG}°`);
say(`the control arm looks along the shipped crowd camera: yes (measured, would have refused otherwise)`);
say(`the drawing's projection: ground depth × sin(${((Math.asin(1 / stretch) * 180) / Math.PI).toFixed(1)}°) = × ${(1 / stretch).toFixed(4)}; unprojected by × ${stretch.toFixed(4)}`);
say('');
say('THE ARMS');
for (const arm of ARMS) say(`  ${arm.padEnd(8)} ${armCaption(arm)}`);
say('');
say('THE REFERENCE — the approved Cycles render, through this page’s own readers');
say(
  `  land-combined-1948px.png: ${result.reference.width}×${result.reference.height}, island box ${result.reference.box.w}×${result.reference.box.h} px ` +
    `(w/h ${result.reference.aspect.toFixed(3)}) · colour families ${result.reference.families} · largest ${pct(result.reference.largestShare)} · ` +
    `MICRO ${result.reference.stats.micro.toFixed(2)} · STRUCT ${result.reference.stats.struct.toFixed(2)}`,
);
say('  ⚠ measured, never differenced: another resolution and framing, and all SEVEN layers. Its box includes the props.');
say('');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    say(`── ${size} @ ${zoom === 'fit' ? 'fit (each arm at its own fit)' : `${zoom} px/unit`} ─────────────────────────────────`);
    say(
      'arm      elev  ground w×d      px/unit  island on screen (px)   w/h   box (px)      pine px  land%  tris     props  fam  largest  MICRO  STRUCT  moved>20 vs today  vs lower rung  vs other footprint',
    );
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      say(
        `${arm.padEnd(8)} ${String(r.elevationDeg).padStart(4)}  ${r.ground.w.toFixed(1).padStart(6)}×${r.ground.d.toFixed(1).padEnd(6)} ` +
          `${r.pxPerUnit.toFixed(3).padStart(8)}  ${r.screen.wPx.toFixed(0).padStart(6)}×${r.screen.hPx.toFixed(0).padEnd(6)}          ` +
          `${r.screen.aspect.toFixed(2).padStart(5)}  ${String(r.box.w).padStart(5)}×${String(r.box.h).padEnd(5)}  ${r.pineHeightPx.toFixed(0).padStart(6)}  ` +
          `${pct(r.landShare).padStart(5)}  ${String(r.triangles).padStart(8)} ${String(r.placements).padStart(5)}  ${String(r.families).padStart(3)}  ` +
          `${pct(r.largestShare).padStart(6)}  ${r.stats.micro.toFixed(2).padStart(5)}  ${r.stats.struct.toFixed(2).padStart(6)}  ` +
          `${String(r.visible).padStart(17)}  ${(r.visibleVsLower === null ? '—' : String(r.visibleVsLower)).padStart(13)}  ${String(r.visibleVsOtherFootprint).padStart(18)}`,
      );
    }
    say('');
  }
}

say('WHAT SEPARATES THE TWO CAUSES — the island’s on-screen width-to-height ratio at the read zoom on one island:');
const c = at(CONTROL_ARM, 'one', READ_ZOOM);
const m50 = at(armId('map', SIGNED_ELEVATION_DEG), 'one', READ_ZOOM);
const t45 = at(armId('true', SHIPPED_ELEVATION_DEG), 'one', READ_ZOOM);
const t50 = at(REFERENCE_GEOMETRY_ARM, 'one', READ_ZOOM);
const top = at(armId('map', ELEVATION_LADDER[ELEVATION_LADDER.length - 1]), 'one', READ_ZOOM);
say(`  today (${c.arm}):                       w/h ${c.screen.aspect.toFixed(2)}  — island ${c.screen.wPx.toFixed(0)}×${c.screen.hPx.toFixed(0)} px`);
say(`  the five degrees alone (${m50.arm}):     w/h ${m50.screen.aspect.toFixed(2)}  — ${((m50.screen.hPx / c.screen.hPx - 1) * 100).toFixed(1)}% taller on screen`);
say(`  the whole ladder on the map (${top.arm}): w/h ${top.screen.aspect.toFixed(2)}  — ${((top.screen.hPx / c.screen.hPx - 1) * 100).toFixed(1)}% taller on screen, pine ${top.pineHeightPx.toFixed(0)} px against ${c.pineHeightPx.toFixed(0)}`);
say(`  the footprint alone (${t45.arm}):        w/h ${t45.screen.aspect.toFixed(2)}  — ${((t45.screen.hPx / c.screen.hPx - 1) * 100).toFixed(1)}% taller on screen`);
say(`  both, the reference geometry (${t50.arm}): w/h ${t50.screen.aspect.toFixed(2)}  — ${((t50.screen.hPx / c.screen.hPx - 1) * 100).toFixed(1)}% taller on screen`);
say(`  the approved render:                    w/h ${result.reference.aspect.toFixed(2)}  (its box includes the trees)`);
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row,');
say('  an arc intent or an earlier evidence sheet. Nothing here is a pick — the elevation is the owner’s.');

for (const [name, dataUrl] of Object.entries(result.shots)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'reference.json'), JSON.stringify(result.reference, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.shots).length} frames + measurements.json + reference.json + report.txt to ${OUT}`);
say(`footprints: ${FOOTPRINTS.join(', ')} · ladder: ${ELEVATION_LADDER.join(' / ')}°`);
await browser.close();
