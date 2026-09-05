// shipped-footprint-measure.mjs — drive `shipped-footprint.html`: the true footprint at the signed
// 50° with the grove density laddered beside it, measured and written out as frames, numbers and a
// report. Run it on the arc's named box (the RTX 2060, ADR-0505 D3) for figures that go in a README.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5376 --strictPort --host 127.0.0.1
//   ST_FOOTPRINT_URL=http://127.0.0.1:5376/shipped-footprint.html pnpm --filter @storytree/forest-world-r3f measure-shipped-footprint
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE FOOTPRINT OR
// THE DENSITY: a software rasteriser; an insensitive delta instrument; a control that differs from
// itself; a shipped camera that is not the signed 50° or a control camera that is not the old 45°;
// the three true arms not sharing one ground MESH (then a difference between rungs is not the
// grove's); a control whose island is not the true island re-projected by exactly the drawing's
// projection (then "before" is a different island, not yesterday's); a ladder that does not RISE in
// grove pines; a capability-tree count that MOVES with the rung (density reaching the vocabulary);
// a rung byte-identical to the rung below it; and an arm that drew no kit.
//
// ⚠ IT DECIDES NOTHING ABOUT COST. Frame cost is `shipped-footprint-cost.mjs`'s, and it reports.
// The rung is picked on the LOOK (ADR-0503 / ADR-0517 D4) and lands in `src/grove-dressing.ts`.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { groundFlattening } from '@storytree/forest-world';

import { GROVE_DENSITY, RECIPE_ISLAND_AREA } from '../src/grove-dressing.ts';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import {
  CONTROL_ARM,
  DENSITY_LADDER,
  FOOTPRINT_ARMS,
  PREVIOUS_DENSITY,
  PREVIOUS_ELEVATION_DEG,
  PREVIOUS_RECIPE_ISLAND_AREA,
  SHIPPED_ARM,
  armCaption,
  countsCaption,
  leanerArm,
  trueArmId,
} from './shipped-footprint-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_FOOTPRINT_URL'] ?? 'http://localhost:5376/shipped-footprint.html';
const OUT =
  process.env['ST_FOOTPRINT_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-true-footprint-2026-09-05');
const ANGLE = process.env['ST_FOOTPRINT_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_FOOTPRINT_ALLOW_SOFTWARE'] === '1';

const ARMS = FOOTPRINT_ARMS.map((a) => a.id);
const TRUE_ARMS = DENSITY_LADDER.map((d) => trueArmId(d));
const SIZES = ['one', 'forest'];
const ZOOMS = [8, 'fit'];
const READ_ZOOM = 8;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_FOOTPRINT_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.footprintRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, sizes, zooms, readZoom]) => {
    const r = window.footprintRunner;
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
    `the renderer is a software rasterizer (${result.id.renderer}). Set DISPLAY=:0 on the Mint box so ` +
      'headless chromium reaches the GPU, or ST_FOOTPRINT_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
      'anyway — and do not quote a software frame as this map’s picture.',
  );
}
if (result.agreement.length > 0) {
  fail(`the cameras are not what the arms claim:\n  ${result.agreement.join('\n  ')}`);
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
  if (row.counts.grovePines === 0) fail(`${row.arm} at ${row.size}/${row.zoom} stands NO grove pines — the grove did not grow`);
}

// ⚠ THE TRUE ARMS SHARE ONE GROUND MESH AND ONE VOCABULARY — or a difference between rungs is not
// the grove's.
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const bottom = at(TRUE_ARMS[0], size, zoom);
    for (const arm of TRUE_ARMS) {
      const row = at(arm, size, zoom);
      if (row.groundTriangles !== bottom.groundTriangles) {
        fail(`${arm} at ${size}/${zoom} has ${row.groundTriangles} ground triangles against ${bottom.arm}'s ${bottom.groundTriangles} — the rungs do not share a mesh`);
      }
      if (row.counts.capabilityTrees !== bottom.counts.capabilityTrees || row.counts.blooms !== bottom.counts.blooms) {
        fail(`${arm} at ${size}/${zoom} stands ${row.counts.capabilityTrees} capability trees / ${row.counts.blooms} blooms against ${bottom.arm}'s ${bottom.counts.capabilityTrees} / ${bottom.counts.blooms} — density reached the vocabulary`);
      }
      if (Math.abs(row.island.w - bottom.island.w) > 1e-9 || Math.abs(row.island.d - bottom.island.d) > 1e-9) {
        fail(`${arm} at ${size}/${zoom} stands on a different ground footprint from ${bottom.arm}`);
      }
    }
    // The ladder RISES.
    for (let i = 1; i < TRUE_ARMS.length; i += 1) {
      const lo = at(TRUE_ARMS[i - 1], size, zoom).counts.grovePines;
      const hi = at(TRUE_ARMS[i], size, zoom).counts.grovePines;
      if (hi <= lo) fail(`${TRUE_ARMS[i]} at ${size}/${zoom} stands ${hi} grove pines against ${TRUE_ARMS[i - 1]}'s ${lo} — the ladder does not rise`);
    }
  }
}

// ⚠ THE CONTROL IS THE TRUE ISLAND RE-PROJECTED BY EXACTLY THE DRAWING'S PROJECTION — same width,
// depth times sin of the declared land camera, on the island every frame is centred on.
const flatten = groundFlattening();
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const before = at(CONTROL_ARM, size, zoom);
    const tru = at(TRUE_ARMS[0], size, zoom);
    if (Math.abs(before.island.w - tru.island.w) > 1e-6) {
      fail(`the control at ${size} is ${before.island.w} wide against the true island's ${tru.island.w} — the re-projection moved x`);
    }
    const want = tru.island.d * flatten;
    if (Math.abs(before.island.d - want) > 1e-6) {
      fail(`the control at ${size} is ${before.island.d.toFixed(3)} deep; the true island's ${tru.island.d.toFixed(3)} × sin(20°) is ${want.toFixed(3)} — "before" is not yesterday's island`);
    }
    if (Math.abs(before.elevationDeg - PREVIOUS_ELEVATION_DEG) > 1e-9 || before.density !== PREVIOUS_DENSITY) {
      fail(`the control at ${size} is ${before.elevationDeg}° at rung x${before.density} — not what shipped`);
    }
    if (before.recipeIslandArea !== PREVIOUS_RECIPE_ISLAND_AREA) {
      fail(`the control at ${size} was proportioned against ${before.recipeIslandArea}, not the basis it shipped in (${PREVIOUS_RECIPE_ISLAND_AREA})`);
    }
    for (const arm of TRUE_ARMS) {
      if (at(arm, size, zoom).recipeIslandArea !== RECIPE_ISLAND_AREA) fail(`${arm} is not proportioned against today's RECIPE_ISLAND_AREA`);
    }
    for (const arm of TRUE_ARMS) {
      if (Math.abs(at(arm, size, zoom).elevationDeg - RENDER_ELEV_DEG) > 1e-9) fail(`${arm} is not at the signed ${RENDER_ELEV_DEG}°`);
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

// ⚠ THE LADDER MUST ACTUALLY MOVE THE PICTURE, rung to rung.
for (const size of SIZES) {
  for (const arm of TRUE_ARMS) {
    const row = at(arm, size, READ_ZOOM);
    const leaner = leanerArm(arm);
    if (leaner !== null && row.touchedVsLeaner === 0) {
      fail(`${arm} at ${size} is byte-identical to ${leaner} — the density is not reaching the grove`);
    }
    if (row.touched === 0) fail(`${arm} at ${size} is byte-identical to the control — nothing changed`);
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
say(`shipped elevation (read off the crowd camera, which reads frameWorld): ${RENDER_ELEV_DEG}° · control elevation (history): ${PREVIOUS_ELEVATION_DEG}°`);
say(`shipped density rung (GROVE_DENSITY): x${GROVE_DENSITY} → the shipped arm is ${SHIPPED_ARM} · control rung (history): x${PREVIOUS_DENSITY}, proportioned against the basis it shipped in (${PREVIOUS_RECIPE_ISLAND_AREA}; today's RECIPE_ISLAND_AREA is ${RECIPE_ISLAND_AREA} — the same thirteen hexes in the true-footprint basis)`);
say(`the drawing's projection: ground depth × sin(20°) = × ${flatten.toFixed(4)}; the true footprint is × ${(1 / flatten).toFixed(4)} — the control is the true island re-projected, checked exactly`);
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
      'arm      elev rung  cap.trees  grove pines  pines/cap  blooms  cover  props   island w×d      px/unit  ground on screen (px)   w/h   pine px  land%  tris      fam  largest  MICRO  moved>20 vs before  vs leaner rung',
    );
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      const c = r.counts;
      say(
        `${arm.padEnd(8)} ${String(r.elevationDeg).padStart(4)}   x${String(r.density).padEnd(3)} ${String(c.capabilityTrees).padStart(8)}  ${String(c.grovePines).padStart(11)}  ` +
          `${c.pinesPerCapability.toFixed(1).padStart(9)}  ${String(c.blooms).padStart(6)}  ${String(c.cover).padStart(5)}  ${String(c.placements).padStart(5)}   ` +
          `${r.island.w.toFixed(1).padStart(6)}×${r.island.d.toFixed(1).padEnd(6)} ${r.pxPerUnit.toFixed(3).padStart(8)}  ${r.screen.wPx.toFixed(0).padStart(6)}×${r.screen.hPx.toFixed(0).padEnd(6)}          ` +
          `${r.screen.aspect.toFixed(2).padStart(5)}  ${r.pineHeightPx.toFixed(0).padStart(6)}  ${pct(r.landShare).padStart(5)}  ${String(r.triangles).padStart(8)}  ${String(r.families).padStart(3)}  ` +
          `${pct(r.largestShare).padStart(6)}  ${r.stats.micro.toFixed(2).padStart(5)}  ${String(r.visible).padStart(18)}  ${(r.visibleVsLeaner === null ? '—' : String(r.visibleVsLeaner)).padStart(14)}`,
      );
    }
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      if (size === 'forest') say(`  ${arm.padEnd(8)} ${countsCaption(r.counts, size)}`);
    }
    say('');
  }
}

say('THE OWNER’S QUESTION, IN NUMBERS — one island at the read zoom:');
for (const arm of ARMS) {
  const r = at(arm, 'one', READ_ZOOM);
  say(
    `  ${arm.padEnd(8)} ${String(r.counts.capabilityTrees).padStart(3)} capability trees · ${String(r.counts.grovePines).padStart(4)} grove pines · ` +
      `${r.counts.pinesPerCapability.toFixed(1).padStart(5)} pines per capability · island ${r.island.w.toFixed(0)}×${r.island.d.toFixed(0)} · on screen w/h ${r.screen.aspect.toFixed(2)}` +
      (arm === SHIPPED_ARM ? '   ← SHIPPED' : arm === CONTROL_ARM ? '   ← BEFORE' : ''),
  );
}
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row,');
say('  an arc intent or an earlier evidence sheet. Frame cost is shipped-footprint-cost.mjs’s and REPORTS (ADR-0517 D4).');

for (const [name, dataUrl] of Object.entries(result.shots)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'reference.json'), JSON.stringify(result.reference, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.shots).length} frames + measurements.json + reference.json + report.txt to ${OUT}`);
say(`arms: ${ARMS.join(', ')} · ladder: x${DENSITY_LADDER.join(' / x')}`);
await browser.close();
