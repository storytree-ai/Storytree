// shipped-canopy-measure.mjs — DRIVER for the canopy comparison page: the shipped ground bare,
// with today's vocabulary casting its shadows, and with the healthy island's grove on top.
//
//   bare        the shipped ground alone — nothing bought and nothing casting (CONTROL)
//   capability  + one pine per capability, one bloom per signature — NOW casting
//   groves-x1   + the healthy island's grove at the RECIPE's own stand count (`src/grove-dressing.ts`)
//   groves-x2   + the grove at twice the recipe's stands — the SHIPPED pick
//   groves-x3   + the grove at three times the recipe's stands — the boldest rung rendered
//
// The last three are a DENSITY LADDER, not three ideas: the owner scales back along rungs already
// rendered (ADR-0503 D1/D3), so a scale-back is `GROVE_DENSITY` + `SHIPPED_GROVE_ARM` and no re-run.
//
// The arms live in `shipped-canopy-scene.ts` and are IMPORTED, so this driver cannot quietly drop
// a column the page added.
//
// THE INCREMENT: grove density and kit-tree shadows on the shipped forest map, toward the render
// the owner stamped. Frame cost is deliberately NOT measured here — the driving session takes that
// on the RTX 2060; what this reports is the payload half: draw calls, triangles and instance counts
// per arm, off `renderer.info`.
//
// ⚠⚠ THE REFUSALS, each a way this comparison could look right and mean nothing: a software
// rasteriser; the visible-delta instrument failing its own sensitivity rung; a frame with no land;
// a control that differs from itself; the ground's triangles moving between arms (a caster changes
// the field, never the mesh); a `capability` arm whose field has NO kit casters; ANY grove arm
// that places ZERO grove pines on the healthy island; a ladder that does not RISE (a denser rung
// standing no more pines than a leaner one is a ladder measuring nothing); any placement off the
// island; a
// dressed arm whose kit did not load (zero merged meshes — a picture of bare land that says nothing
// about why); and a dressed arm that moved no pixel past the bar against bare.
//
// Reproduce (⚠ needs a real GPU — every committed frame figure comes off a discrete GPU; a
// software rasteriser's numbers are not comparable):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5352 --strictPort --host 127.0.0.1
//   ST_CANOPY_URL=http://127.0.0.1:5352/shipped-canopy.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-canopy
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is
// computed in the typechecked modules (`harness/shipped-canopy-scene.ts`, `src/grove-dressing.ts`,
// `src/ground-casters.ts`); this starts a browser, walks one page and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { VISIBLE_DELTA } from './visible-delta.ts';
import { CANOPY_ARMS, CONTROL_ARM, GROVE_ARMS, SHIPPED_GROVE_ARM } from './shipped-canopy-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_CANOPY_URL'] ?? 'http://localhost:5352/shipped-canopy.html';
const OUT =
  process.env['ST_CANOPY_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-ground-canopy-2026-09-03');
const ALLOW_SOFTWARE = process.env['ST_CANOPY_ALLOW_SOFTWARE'] === '1';

/** THE ARMS ARE THE PAGE'S, imported rather than restated. */
const ARMS = [...CANOPY_ARMS];
const CONTROL = CONTROL_ARM;
const SIZES = ['one', 'forest'];
/** The zoom the canopy is READ at, and the fitted overview it is JUDGED at — both are read, so the
 *  table carries the opening view's numbers beside the zoomed ones. */
const ZOOMS = [8, 'fit'];
const READ_ZOOM = 8;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

/** ⚠ 5184 is the default every worktree's vite pins, so two harnesses on one box would serve each
 *  other's pages and the numbers would belong to whichever branch started first
 *  (`strictport-vite-collision-measures-a-siblings-worktree`). This driver's default is its own. */
if (URL_.includes(':5184/')) {
  fail(
    "ST_CANOPY_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
      'worktree may own it, and the numbers would be its tree rather than this one. Start the ' +
      'harness on a port of your own with --port <n> --strictPort.',
  );
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction(() => window.canopyRunner !== undefined, null, { timeout: 300000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, sizes, zooms, readZoom]) => {
    const r = window.canopyRunner;
    const rows = [];
    for (const size of sizes) {
      for (const zoom of zooms) {
        for (const arm of arms) {
          rows.push({ size, zoom, ...r.read(arm, size, zoom) });
        }
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
    `the renderer is a software rasterizer (${result.id.renderer}). Frame numbers off SwiftShader ` +
      'are not comparable to any committed figure on this arc. Set ST_CANOPY_ALLOW_SOFTWARE=1 to ' +
      'take the GEOMETRY and COUNT numbers anyway, and do not quote them as this map’s picture.',
  );
}

// ⚠⚠ RUNG 2 BEFORE ANY READING IS QUOTED — the instrument must prove, on this run's own pixels,
// that it resolves the ADR-0490 D6 boundary.
if (result.sensitivity.length > 0) {
  fail(
    `the visible-delta instrument failed its own sensitivity rung, so no reading below means ` +
      `anything:\n  ${result.sensitivity.join('\n  ')}`,
  );
}

const at = (arm, size, zoom) =>
  result.rows.find((r) => r.arm === arm && r.size === size && r.zoom === zoom);

// ── THE REFUSALS ───────────────────────────────────────────────────────────────────────────────

for (const row of result.rows) {
  if (row.land === 0) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} delivered NO land pixels. Every figure on this page ` +
        'is computed over the island mask, so a frame that is all background reports zeros that ' +
        'read exactly like a null result.',
    );
  }
  if (row.offIsland !== 0) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} stands ${row.offIsland} object(s) on NO cell of the ` +
        'island — the placement basis and the ground’s have come apart.',
    );
  }
  if (row.arm === CONTROL) {
    if (row.drawCalls !== 1) {
      fail(
        `the CONTROL at ${row.size}/${row.zoom} submits ${row.drawCalls} draw calls. The whole ` +
          "forest's ground is ONE draw and nothing bought stands on the control — a second call " +
          'means the page put something on it.',
      );
    }
    if (row.kitCasters !== 0 || row.placements !== 0) fail('the CONTROL stands something');
    continue;
  }
  // A dressed arm: the kit must have arrived, and every placement must cast.
  if (row.meshes === 0) {
    fail(`${row.arm} at ${row.size}/${row.zoom} drew ZERO kit meshes — the kit did not load, and this is a picture of bare land`);
  }
  if (row.drawCalls !== 1 + row.meshes) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} submits ${row.drawCalls} draw calls for the ground plus ` +
        `${row.meshes} merged kit meshes — the merge broke, or the ground did.`,
    );
  }
  if (row.kitCasters === 0 || row.kitCasters !== row.placements) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} stands ${row.placements} objects and casts from ` +
        `${row.kitCasters} of them — a placement without a caster is an object that floats.`,
    );
  }
}

// ⚠ THE CONTROL MUST BE A CONTROL, and the ground must be the SAME mesh on every arm.
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const control = at(CONTROL, size, zoom);
    if (control.touched !== 0) {
      fail(
        `the CONTROL arm differs from itself at ${size}/${zoom} (${control.touched} px). The ` +
          'denominator is not a denominator and no figure on this page means anything.',
      );
    }
    for (const arm of ARMS) {
      const row = at(arm, size, zoom);
      if (row.groundTriangles !== control.groundTriangles) {
        fail(
          `${arm} at ${size}/${zoom} draws ${row.groundTriangles} GROUND triangles against the control's ` +
            `${control.groundTriangles}. A caster changes the field, never the mesh; a difference here is ` +
            'another change wearing this increment’s name.',
        );
      }
    }
  }
}

// ⚠ EVERY GROVE ARM MUST BE THERE, on the healthy island, and the capability arm must be the
// vocabulary. Asked of every rung rather than of the shipped one, so a ladder cannot be reported
// with a rung that grew nothing.
for (const size of SIZES) {
  const capability = at('capability', size, READ_ZOOM);
  if (capability.groves !== 0) fail(`the capability arm at ${size} grew ${capability.groves} grove pines`);
  if (capability.capabilityTrees === 0 || capability.blooms === 0) {
    fail(`the capability arm at ${size} stands no tree or no bloom — the vocabulary is not on it`);
  }
  for (const arm of GROVE_ARMS) {
    const groves = at(arm, size, READ_ZOOM);
    if (groves.groves === 0) {
      fail(`the ${arm} arm at ${size} placed ZERO grove pines — the healthy island grew no forest`);
    }
    if (groves.placements - groves.groves !== capability.placements) {
      fail(
        `the ${arm} arm at ${size} stands ${groves.placements - groves.groves} non-grove objects against the ` +
          `capability arm's ${capability.placements} — the grove moved the vocabulary's own objects.`,
      );
    }
  }
  // ⚠ THE LADDER MUST RISE. A rung is only a scale-back lever if it is a different picture from
  // the rung below it; equal counts mean the density argument never reached the placement.
  for (const [i, arm] of GROVE_ARMS.entries()) {
    if (i === 0) continue;
    const lean = at(GROVE_ARMS[i - 1], size, READ_ZOOM);
    const bold = at(arm, size, READ_ZOOM);
    if (bold.groves <= lean.groves) {
      fail(
        `the ladder does not rise at ${size}: ${arm} stands ${bold.groves} grove pines against ` +
          `${GROVE_ARMS[i - 1]}'s ${lean.groves}`,
      );
    }
  }
}

// ⚠ THE DRESSED ARMS MUST BE VISIBLE against bare at the read zoom — a tree and its shadow that
// moved no pixel past the bar is a clean landing that changed nothing.
for (const arm of ARMS) {
  if (arm === CONTROL) continue;
  const row = at(arm, 'one', READ_ZOOM);
  if (row.visible === 0) {
    fail(`the ${arm} arm moved NO pixel past ${VISIBLE_DELTA}/255 against bare at 8 px/unit on one island`);
  }
}
if (at(SHIPPED_GROVE_ARM, 'one', READ_ZOOM).visible <= at('capability', 'one', READ_ZOOM).visible) {
  fail(`the ${SHIPPED_GROVE_ARM} arm moved no more pixels than the capability arm — the grove is not in the picture`);
}

// ── THE REPORT ─────────────────────────────────────────────────────────────────────────────────

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};

say(`renderer: ${result.id.vendor} — ${result.id.renderer}`);
say(`software=${result.id.software}`);
say(
  `light probe: a lit white face delivered ${result.calibration.probe.toFixed(4)} at the authored intensities; ` +
    `scale ${result.calibration.scale.toFixed(4)} onto the ladder's ${result.calibration.target}`,
);
say('');
say('THE REFERENCE — the approved Cycles render, through this page’s own family census');
say(
  `  land-combined: colour families ${result.reference.families} · largest holds ` +
    `${(result.reference.largestShare * 100).toFixed(1)}% · MICRO ` +
    `${result.reference.stats.micro.toFixed(2)} · STRUCT ${result.reference.stats.struct.toFixed(2)}`,
);
say('  ⚠ measured, never differenced: another resolution, framing and camera, and all SEVEN layers.');
say('');

for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const px = at(CONTROL, size, zoom).pxPerUnit;
    say(`── ${size} @ ${zoom === 'fit' ? `fit (${px.toFixed(3)} px/unit)` : `${zoom} px/unit`} ─────────────────────────────────`);
    say('arm         calls      tris  ground  objects  caps blooms groves  casters  fam largest   top3  MICRO  STRUCT  moved>20  touched');
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      say(
        `${arm.padEnd(11)} ${String(r.drawCalls).padStart(5)} ${String(r.triangles).padStart(9)} ` +
          `${String(r.groundTriangles).padStart(7)} ${String(r.placements).padStart(8)} ` +
          `${String(r.capabilityTrees).padStart(5)} ${String(r.blooms).padStart(6)} ${String(r.groves).padStart(6)} ` +
          `${String(r.casters).padStart(8)} ${String(r.families).padStart(4)} ` +
          `${(r.largestShare * 100).toFixed(1).padStart(6)}% ${(r.topThreeShare * 100).toFixed(1).padStart(5)}% ` +
          `${r.stats.micro.toFixed(2).padStart(6)} ${r.stats.struct.toFixed(2).padStart(7)} ` +
          `${String(r.visible).padStart(9)} ${String(r.touched).padStart(8)}`,
      );
    }
    say('');
  }
}

say('WHAT THE PAYLOAD HALF SAYS (frame cost is the RTX 2060 box’s to measure, not this run’s):');
for (const size of SIZES) {
  const bare = at(CONTROL, size, READ_ZOOM);
  const cap = at('capability', size, READ_ZOOM);
  const gro = at(SHIPPED_GROVE_ARM, size, READ_ZOOM);
  say(
    `  ${size}: bare ${bare.drawCalls} call / ${bare.triangles} tris → capability ${cap.drawCalls} calls / ` +
      `${cap.triangles} tris (${cap.placements} objects) → ${SHIPPED_GROVE_ARM} ${gro.drawCalls} calls / ${gro.triangles} tris ` +
      `(${gro.placements} objects, ${gro.groves} of them grove pines)`,
  );
}
say('');
say('THE GAP THAT REMAINS, at the read zoom on one island:');
const c1 = at(CONTROL, 'one', READ_ZOOM);
const g1 = at(SHIPPED_GROVE_ARM, 'one', READ_ZOOM);
say(
  `  bare ${c1.families} families → ${SHIPPED_GROVE_ARM} ${g1.families} → approved ${result.reference.families}. ` +
    `Largest family: ${(c1.largestShare * 100).toFixed(1)}% → ${(g1.largestShare * 100).toFixed(1)}% → ` +
    `${(result.reference.largestShare * 100).toFixed(1)}%. MICRO ${c1.stats.micro.toFixed(2)} → ` +
    `${g1.stats.micro.toFixed(2)} → ${result.reference.stats.micro.toFixed(2)}; STRUCT ` +
    `${c1.stats.struct.toFixed(2)} → ${g1.stats.struct.toFixed(2)} → ${result.reference.stats.struct.toFixed(2)}.`,
);
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row,');
say('  an arc intent or an earlier evidence sheet.');

for (const [name, dataUrl] of Object.entries(result.shots)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.shots).length} frames + measurements.json + report.txt to ${OUT}`);

await browser.close();
