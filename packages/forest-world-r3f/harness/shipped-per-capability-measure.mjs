// shipped-per-capability-measure.mjs — drive `shipped-per-capability.html`: one tree per capability
// with the ground cover's count laddered beside it, measured and written out as frames, numbers and
// a report. Run it on the arc's named box (the RTX 2060, ADR-0505 D3) for figures that go in a README.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5377 --strictPort --host 127.0.0.1
//   ST_PER_CAPABILITY_URL=http://127.0.0.1:5377/shipped-per-capability.html pnpm --filter @storytree/forest-world-r3f measure-shipped-per-capability
//   (on the Mint box, with DISPLAY=:0 in the environment so headless chromium reaches the GPU)
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE COVER OR THE
// TREE COUNT: a software rasteriser; an insensitive delta instrument; a control that differs from
// itself; a camera that is not the signed 50°; a ladder arm standing ANY dressing pine (ADR-0518
// D4's padding, arriving through the instrument); a tree count that is not the capability count;
// the ladder arms not sharing one ground MESH and one caster set (then a difference between rungs
// is not the cover's); a ladder that does not RISE in cover; a rung byte-identical to the rung
// below it; and an arm that drew no kit.
//
// ⚠ IT DECIDES NOTHING ABOUT COST. Frame cost is `shipped-per-capability-cost.mjs`'s, and it
// reports. The rung is picked on the LOOK (ADR-0503 / ADR-0518 D2) and lands in
// `src/cover-dressing.ts`.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { COVER_DENSITY, COVER_SIZE } from '../src/cover-dressing.ts';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.ts';
import {
  CONTROL_ARM,
  DENSITY_LADDER,
  LADDER_ARMS,
  PER_CAPABILITY_ARMS,
  PREVIOUS_COVER_DENSITY,
  PREVIOUS_GROVE_DENSITY,
  SHIPPED_ARM,
  armCaption,
  countsCaption,
  leanerArm,
} from './shipped-per-capability-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_PER_CAPABILITY_URL'] ?? 'http://localhost:5377/shipped-per-capability.html';
const OUT =
  process.env['ST_PER_CAPABILITY_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-one-tree-per-capability-2026-09-05');
const ANGLE = process.env['ST_PER_CAPABILITY_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_PER_CAPABILITY_ALLOW_SOFTWARE'] === '1';

const ARMS = PER_CAPABILITY_ARMS.map((a) => a.id);
const SIZES = ['one', 'forest'];
const ZOOMS = [8, 'fit'];
const READ_ZOOM = 8;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_PER_CAPABILITY_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.perCapabilityRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, sizes, zooms, readZoom]) => {
    const r = window.perCapabilityRunner;
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
      'headless chromium reaches the GPU, or ST_PER_CAPABILITY_ALLOW_SOFTWARE=1 to take the GEOMETRY numbers ' +
      'anyway — and do not quote a software frame as this map’s picture.',
  );
}
if (result.agreement.length > 0) fail(`the camera is not what the arms claim:\n  ${result.agreement.join('\n  ')}`);
if (result.sensitivity.length > 0) {
  fail(`the visible-delta instrument failed its own sensitivity rung, so no reading below means anything:\n  ${result.sensitivity.join('\n  ')}`);
}

const at = (arm, size, zoom) => result.rows.find((r) => r.arm === arm && r.size === size && r.zoom === zoom);

for (const row of result.rows) {
  if (row.land === 0) fail(`${row.arm} at ${row.size}/${row.zoom} delivered NO land pixels`);
  if (row.meshes === 0) fail(`${row.arm} at ${row.size}/${row.zoom} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) {
    fail(`${row.arm} at ${row.size}/${row.zoom} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  }
  if (Math.abs(row.elevationDeg - RENDER_ELEV_DEG) > 1e-9) fail(`${row.arm} is not judged from the signed ${RENDER_ELEV_DEG}°`);
  if (row.counts.cover === 0) fail(`${row.arm} at ${row.size}/${row.zoom} wears NO ground cover — the cover did not grow`);
  // ⚠⚠ ONE TREE PER CAPABILITY AND NOTHING ELSE TREE-SHAPED (ADR-0518 D1/D4): a ladder arm standing
  // a single dressing pine is the count being padded back through the instrument.
  if (row.arm !== CONTROL_ARM && row.counts.grovePines !== 0) {
    fail(`${row.arm} at ${row.size}/${row.zoom} stands ${row.counts.grovePines} dressing pines — the grove is retired and the count may not be padded back`);
  }
  if (row.arm === CONTROL_ARM && row.counts.grovePines === 0) {
    fail(`the control at ${row.size}/${row.zoom} stands NO dressing pines — it is not the map as it shipped`);
  }
}

// ⚠ THE LADDER ARMS SHARE ONE GROUND MESH, ONE CASTER SET AND ONE VOCABULARY — or a difference
// between rungs is not the cover's.
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const bottom = at(LADDER_ARMS[0], size, zoom);
    const control = at(CONTROL_ARM, size, zoom);
    for (const arm of ARMS) {
      const row = at(arm, size, zoom);
      if (row.groundTriangles !== bottom.groundTriangles) {
        fail(`${arm} at ${size}/${zoom} has ${row.groundTriangles} ground triangles against ${bottom.arm}'s ${bottom.groundTriangles} — the arms do not share a mesh`);
      }
      if (row.counts.capabilityTrees !== bottom.counts.capabilityTrees || row.counts.blooms !== bottom.counts.blooms) {
        fail(`${arm} at ${size}/${zoom} stands ${row.counts.capabilityTrees} capability trees / ${row.counts.blooms} blooms against ${bottom.arm}'s ${bottom.counts.capabilityTrees} / ${bottom.counts.blooms} — the rung reached the vocabulary`);
      }
    }
    for (const arm of LADDER_ARMS) {
      const row = at(arm, size, zoom);
      if (row.casters !== bottom.casters) {
        fail(`${arm} at ${size}/${zoom} was built from ${row.casters} casters against ${bottom.arm}'s ${bottom.casters} — ground cover has started casting`);
      }
    }
    // The control's casters are MORE — the grove cast — which is what makes it a different ground.
    if (control.casters <= bottom.casters) fail(`the control at ${size}/${zoom} casts no more than the ladder — it stands no grove`);
    // The ladder RISES in cover, and the count per rung is the recipe's scatter repeated.
    for (let i = 1; i < LADDER_ARMS.length; i += 1) {
      const lo = at(LADDER_ARMS[i - 1], size, zoom).counts.cover;
      const hi = at(LADDER_ARMS[i], size, zoom).counts.cover;
      if (hi <= lo) fail(`${LADDER_ARMS[i]} at ${size}/${zoom} wears ${hi} cover against ${LADDER_ARMS[i - 1]}'s ${lo} — the ladder does not rise`);
    }
    // The bottom rung and the control wear the SAME cover count — the control differs in the grove only.
    if (bottom.counts.cover !== control.counts.cover) {
      fail(`cover-x1 at ${size}/${zoom} wears ${bottom.counts.cover} cover against the control's ${control.counts.cover} — the control is not "today minus the grove"`);
    }
  }
}

for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const control = at(CONTROL_ARM, size, zoom);
    if (control.touched !== 0) fail(`the CONTROL arm differs from itself at ${size}/${zoom} (${control.touched} px) — the denominator is not a denominator`);
  }
}

// ⚠ THE LADDER MUST ACTUALLY MOVE THE PICTURE, rung to rung.
for (const size of SIZES) {
  for (const arm of LADDER_ARMS) {
    const row = at(arm, size, READ_ZOOM);
    const leaner = leanerArm(arm);
    if (leaner !== null && row.touchedVsLeaner === 0) fail(`${arm} at ${size} is byte-identical to ${leaner} — the count is not reaching the cover`);
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
say(`elevation (read off the crowd camera, which reads frameWorld): ${RENDER_ELEV_DEG}° on every arm`);
say(`shipped cover count rung (COVER_DENSITY): x${COVER_DENSITY} at size ${COVER_SIZE} → the shipped arm is ${SHIPPED_ARM} · control (history): grove rung x${PREVIOUS_GROVE_DENSITY}, cover x${PREVIOUS_COVER_DENSITY}`);
say('');
say('THE ARMS');
for (const arm of ARMS) say(`  ${arm.padEnd(9)} ${armCaption(arm)}`);
say('');
say('THE REFERENCE — the approved Cycles render, through this page’s own readers');
say(
  `  land-combined-1948px.png: ${result.reference.width}×${result.reference.height}, island box ${result.reference.box.w}×${result.reference.box.h} px ` +
    `(w/h ${result.reference.aspect.toFixed(3)}) · colour families ${result.reference.families} · largest ${pct(result.reference.largestShare)} · ` +
    `MICRO ${result.reference.stats.micro.toFixed(2)} · STRUCT ${result.reference.stats.struct.toFixed(2)}`,
);
say('  ⚠ measured, never differenced: another resolution and framing, and its pines are the recipe’s stands, not one per capability.');
say('');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    say(`── ${size} @ ${zoom === 'fit' ? 'fit (each arm at its own fit)' : `${zoom} px/unit`} ─────────────────────────────────`);
    say(
      'arm        rung  TREES  dressing pines  blooms  cover  bushes  tufts  flowers  props   px/unit  ground on screen (px)  pine px  land%  tris      fam  largest  MICRO  moved>20 vs today  vs leaner rung',
    );
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      const c = r.counts;
      say(
        `${arm.padEnd(10)} x${String(r.coverDensity).padEnd(3)} ${String(c.capabilityTrees).padStart(5)}  ${String(c.grovePines).padStart(14)}  ${String(c.blooms).padStart(6)}  ` +
          `${String(c.cover).padStart(5)}  ${String(c.bushes).padStart(6)}  ${String(c.tufts).padStart(5)}  ${String(c.flowerPatches).padStart(7)}  ${String(c.placements).padStart(5)}  ` +
          `${r.pxPerUnit.toFixed(3).padStart(8)}  ${r.screen.wPx.toFixed(0).padStart(6)}×${r.screen.hPx.toFixed(0).padEnd(6)}         ` +
          `${r.pineHeightPx.toFixed(0).padStart(6)}  ${pct(r.landShare).padStart(5)}  ${String(r.triangles).padStart(8)}  ${String(r.families).padStart(3)}  ` +
          `${pct(r.largestShare).padStart(6)}  ${r.stats.micro.toFixed(2).padStart(5)}  ${String(r.visible).padStart(17)}  ${(r.visibleVsLeaner === null ? '—' : String(r.visibleVsLeaner)).padStart(14)}`,
      );
    }
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      if (size === 'forest') say(`  ${arm.padEnd(9)} ${countsCaption(r.counts, size)}`);
    }
    say('');
  }
}

say('THE OWNER’S QUESTION, IN NUMBERS — one island at the read zoom:');
for (const arm of ARMS) {
  const r = at(arm, 'one', READ_ZOOM);
  say(
    `  ${arm.padEnd(9)} ${String(r.counts.capabilityTrees).padStart(3)} trees (one per capability) · ${String(r.counts.grovePines).padStart(3)} dressing pines · ` +
      `${String(r.counts.cover).padStart(4)} ground cover · island ${r.island.w.toFixed(0)}×${r.island.d.toFixed(0)}` +
      (arm === SHIPPED_ARM ? '   ← SHIPPED' : arm === CONTROL_ARM ? '   ← TODAY (before this landing)' : ''),
  );
}
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row,');
say('  an arc intent or an earlier evidence sheet. Frame cost is shipped-per-capability-cost.mjs’s and REPORTS (ADR-0517 D4).');

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
