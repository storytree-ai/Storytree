// shipped-grass-measure.mjs — DRIVER for "layer 1: the grass base": the shipped map's ground with
// the approved grass mixed in at four strengths, over one island and one forest.
//
//   flat          the map as it ships — status colour + the grain's normal half (CONTROL)
//   admissible    grass at 0.005 — the most the reader model admits on the SHIPPED ladder
//   ladder-limit  grass at 0.20  — the most that leaves any shading depth at all
//   visible       grass at 0.35  — the least a viewer can actually see
//
// THE INCREMENT: `layer-1-grass-base-and-hue-drift` on `land-ground-stack-arc` — the floor every
// other layer of the approved ground composites over (ADR-0490 D3).
//
// ⚠⚠ THIS DRIVER EXISTS TO PUT A CONFLICT IN FRONT OF SOMEONE, not to bless a component. The
// three facs above were chosen by `harness/grass-status-reading.ts` and they do not overlap: the
// factor needed to SEE the layer is seventy times the factor at which every status still reads as
// itself. So the refusals below are shaped around that rather than around "did it draw" — they
// check that the control is a control, that the layer costs no geometry, and that the two claims
// the report makes (invisible-but-honest, visible-but-not) are both actually true of the frames
// rather than of the arithmetic.
//
// ⚠ THE REFERENCE ARM IS THE STANDARD. Every crossing on this arc is judged against the picture
// the owner approved rather than against its own best arm — "the image that I stamped as looking
// awesome was done in isolation and now we trying to do the same with the app constraints in
// place" — so the approved Cycles render goes through the SAME family census as the live frames
// and the remaining gap is printed rather than inferred. It is an IMAGE at another resolution,
// framing and camera, carrying all seven layers: measured, never differenced.
//
// Reproduce (⚠ needs a real GPU — every committed frame figure comes off a discrete GPU;
// ST_LAND_ALLOW_SOFTWARE does NOT make a SwiftShader number comparable):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5316 --strictPort
//   ST_GRASS_URL=http://localhost:5316/shipped-grass.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-grass
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is
// computed in the typechecked modules (`harness/shipped-grass-scene.ts`, `src/land-grass.ts`);
// this starts a browser, walks one page and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_GRASS_URL'] ?? 'http://localhost:5316/shipped-grass.html';
const OUT =
  process.env['ST_GRASS_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-grass-2026-09-01');
const ALLOW_SOFTWARE = process.env['ST_GRASS_ALLOW_SOFTWARE'] === '1';

const CONTROL = 'flat';
const ARMS = ['flat', 'admissible', 'ladder-limit', 'visible'];
/** The arm whose whole claim is that it can be SEEN. Its refusals are the strict ones. */
const VISIBLE_ARM = 'visible';
/** The arm whose whole claim is that it CANNOT — the reader model's own ceiling. */
const ADMISSIBLE_ARM = 'admissible';
const SIZES = ['one', 'forest'];
const ZOOMS = [2, 8];
const FIT = 'fit';
/** The zoom the ground's own texture is read at. */
const READ_ZOOM = 8;
/** ADR-0490 D6: an arm is judged on pixels that MOVED by more than this, never on pixels touched. */
const VISIBLE_DELTA = 20;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

/** ⚠ 5184 is the default every worktree's vite pins, so two harnesses on one box would serve each
 *  other's pages and the numbers would belong to whichever branch started first
 *  (`strictport-vite-collision-measures-a-siblings-worktree`). This driver's default is its own. */
if (URL_.includes(':5184/')) {
  fail(
    "ST_GRASS_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.waitForFunction(() => window.grassRunner !== undefined, null, { timeout: 300000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, sizes, zooms, fit, readZoom]) => {
    const r = window.grassRunner;
    const rows = [];
    for (const size of sizes) {
      for (const zoom of zooms) {
        for (const arm of arms) {
          rows.push({ size, zoom, ...r.read(arm, size, zoom) });
        }
      }
    }
    const reference = await r.reference(
      '/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png',
    );
    const shots = {};
    for (const arm of arms) {
      for (const size of sizes) {
        shots[`${arm}-${size}-${fit}`] = r.snapshot(arm, size, fit);
        shots[`${arm}-${size}-${readZoom}`] = r.snapshot(arm, size, readZoom);
      }
    }
    return { id: r.identity(), rows, reference, shots };
  },
  [ARMS, SIZES, ZOOMS, FIT, READ_ZOOM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Frame numbers off SwiftShader ` +
      'are not comparable to any committed figure on this arc, and the grain this ground already ' +
      'wears is measurably renderer-specific — 24.5% of grained pixels land on a different ladder ' +
      'rung between SwiftShader and an RTX 2060. Set ST_GRASS_ALLOW_SOFTWARE=1 to take the ' +
      'GEOMETRY and FAMILY numbers anyway, and do not quote them as this map’s picture.',
  );
}

const at = (arm, size, zoom) =>
  result.rows.find((r) => r.arm === arm && r.size === size && r.zoom === zoom);

// ── THE REFUSALS ───────────────────────────────────────────────────────────────────────────────

for (const row of result.rows) {
  if (row.drawCalls !== 1) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} submits ${row.drawCalls} draw calls. The whole ` +
        "forest's ground is ONE draw and this layer is a fragment-stage mix on that one mesh — a " +
        'second call means the merge broke, which costs far more than the layer does.',
    );
  }
  if (row.land === 0) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} delivered NO land pixels. Every figure on this page ` +
        'is computed over the island mask, so a frame that is all background reports zeros that ' +
        'read exactly like a null result.',
    );
  }
}

// ⚠ THE CONTROL MUST BE A CONTROL. This is the structural half of the hazard this arc names
// second: a comparison whose control arm has quietly become an older map reports the PREVIOUS
// component's effect as the new one's, and the symptom is byte-identical numbers on a re-run.
// The page calls `shippedGroundBuild` — the function `CellGround` itself calls — so it cannot be a
// different scene; this checks the consequence rather than trusting the construction.
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const control = at(CONTROL, size, zoom);
    if (control.touched !== 0) {
      fail(
        `the CONTROL arm differs from itself at ${size}/${zoom} (${control.touched} px). The ` +
          'denominator is not a denominator and no figure on this page means anything.',
      );
    }
    if (control.octaves !== 0) {
      fail(`the CONTROL arm reports ${control.octaves} grass octaves; it must evaluate none.`);
    }
  }
}

// ⚠ LAYER 1 IS A FRAGMENT-STAGE LAYER AND ITS CORRECT GEOMETRY DELTA IS ZERO. This is the first
// hazard this arc names — every layer is priced against a repository the previous layer moved —
// inverted into a check: an arm whose triangle count differs from the control's changed something
// else and called it the grass.
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const control = at(CONTROL, size, zoom);
    for (const arm of ARMS) {
      const row = at(arm, size, zoom);
      if (row.triangles !== control.triangles) {
        fail(
          `${arm} at ${size}/${zoom} draws ${row.triangles} triangles against the control's ` +
            `${control.triangles}. Layer 1 adds no geometry; a difference here is another change ` +
            "wearing this layer's name.",
        );
      }
    }
  }
}

// ⚠ THE TWO CLAIMS THE REPORT RESTS ON, CHECKED AGAINST THE FRAMES RATHER THAN THE ARITHMETIC.
// `grass-status-reading.ts` says the admissible fac is invisible and the visible fac is not
// admissible. Both halves are claims about PICTURES, and a driver that printed them without
// looking would be quoting its own model back at itself.
const visible = at(VISIBLE_ARM, 'one', READ_ZOOM);
const admissible = at(ADMISSIBLE_ARM, 'one', READ_ZOOM);
if (visible.visible === 0) {
  fail(
    `the ${VISIBLE_ARM} arm touched ${visible.touched} px and moved NONE of them by more than ` +
      `${VISIBLE_DELTA}/255. The whole report says this fac is the one a viewer can see; if the ` +
      'frames disagree, the report is wrong and not the frames (ADR-0490 D6).',
  );
}
if (admissible.visible > visible.visible / 10) {
  fail(
    `the ${ADMISSIBLE_ARM} arm moved ${admissible.visible} px visibly against ${VISIBLE_ARM}'s ` +
      `${visible.visible}. The report's claim is that the model-admissible fac is invisible; a ` +
      'tenth of the visible arm is not invisible, and the conflict this page exists to show would ' +
      'be overstated.',
  );
}
if (visible.families <= at(CONTROL, 'one', READ_ZOOM).families) {
  fail(
    `the ${VISIBLE_ARM} arm delivers ${visible.families} colour families against the control's ` +
      `${at(CONTROL, 'one', READ_ZOOM).families}. This layer's entire purpose is to close a ` +
      'family gap of 9 against 36; an arm that adds none has not delivered it.',
  );
}

// ── THE REPORT ─────────────────────────────────────────────────────────────────────────────────

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};

say(`renderer: ${result.id.vendor} — ${result.id.renderer}`);
say(`software=${result.id.software}`);
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
    say(`── ${size} @ ${zoom} px/unit ─────────────────────────────────────────────`);
    say(
      'arm            fam  largest  top3    MICRO  STRUCT  moved>20  touched   tris  oct',
    );
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      say(
        `${arm.padEnd(14)} ${String(r.families).padStart(3)}  ` +
          `${(r.largestShare * 100).toFixed(1).padStart(6)}% ${(r.topThreeShare * 100).toFixed(1).padStart(5)}%  ` +
          `${r.stats.micro.toFixed(2).padStart(5)}  ${r.stats.struct.toFixed(2).padStart(6)}  ` +
          `${String(r.visible).padStart(8)}  ${String(r.touched).padStart(7)}  ` +
          `${String(r.triangles).padStart(5)}  ${String(r.octaves).padStart(3)}`,
      );
    }
    say('');
  }
}

say('THE GAP THAT REMAINS, at the read zoom on one island:');
const c1 = at(CONTROL, 'one', READ_ZOOM);
say(
  `  shipped ${c1.families} families → visible arm ${visible.families} → approved ` +
    `${result.reference.families}. Largest family: ${(c1.largestShare * 100).toFixed(1)}% → ` +
    `${(visible.largestShare * 100).toFixed(1)}% → ${(result.reference.largestShare * 100).toFixed(1)}%.`,
);
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row,');
say('  an arc intent or an earlier evidence sheet — a cost sentence in a parked row is a cost as at');
say('  the day it was parked, and this arc has already been sized 5x wrong that way once.');

for (const [name, dataUrl] of Object.entries(result.shots)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.shots).length} frames + measurements.json + report.txt to ${OUT}`);

await browser.close();
