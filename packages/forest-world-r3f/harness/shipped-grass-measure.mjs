// shipped-grass-measure.mjs — DRIVER for "layer 1: the grass base, ADOPTED": the shipped map's
// ground with the approved grass mixed in at four strengths, over one island and one forest.
//
//   flat      the map BEFORE layer 1 — status colour + the grain's normal half (CONTROL)
//   authored  grass at 0.13   — the recipe's own factor, carried to show it is INVISIBLE here
//   adopted   grass at 0.32   — WHAT SHIPS
//   ceiling   grass at 0.4065 — the measured fence, carried to show what the headroom buys
//
// THE INCREMENT: `layer-1-adopted-on-green-under-the-per-token-gate` on `land-ground-stack-arc` —
// the floor every other layer of the approved ground composites over (ADR-0490 D3).
//
// ⚠⚠ THE QUESTION THIS DRIVER ASKS HAS CHANGED, AND ITS ARMS CHANGED WITH IT. Until ADR-0492 the
// arms were 0.005 / 0.20 / 0.35, framed around a CONFLICT: the factor needed to see the layer was
// seventy times the factor at which every status still read as itself, so the page existed to put
// an owner fork in front of someone. That premise was refuted. The 0.008 whole-map ceiling it
// rested on is a MINIMUM OVER SIX TOKENS and is a property of exactly one of them — the yellow;
// `healthy` alone admits 0.4065. Gated to the green (ADR-0492 D1) the conflict does not arise, so
// this page now shows an ADOPTION: what ships, what the recipe's own factor would have delivered
// (nothing), and what the remaining headroom looks like.
//
// The refusals below are shaped around that: the control is a control, the layer costs no
// geometry, the shipped arm is VISIBLE where the authored one provably is not, and — the claim
// unique to the per-token gate — the ungated tokens are untouched IN THE FRAMES rather than only
// in the arithmetic.
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

/** ADR-0490 D6: an arm is judged on pixels that MOVED by more than this, never on pixels touched.
 *  ⚠ IMPORTED, NOT RE-DECLARED. This driver used to carry its own `= 20`, and so did the skirt
 *  driver and both of their pages — four spellings of one number. The two driver copies were the
 *  worse pair, because they appear only inside REPORT SENTENCES: prose saying "20" over a page
 *  that had moved to 30 is a false claim about a true number, and no assertion reads prose. */
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_GRASS_URL'] ?? 'http://localhost:5316/shipped-grass.html';
const OUT =
  process.env['ST_GRASS_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-grass-2026-09-01');
const ALLOW_SOFTWARE = process.env['ST_GRASS_ALLOW_SOFTWARE'] === '1';

const CONTROL = 'flat';
const ARMS = ['flat', 'authored', 'adopted', 'ceiling'];
/** The arm that SHIPS, and whose claim is that a viewer can see it. Its refusals are the strict
 *  ones, because it is the only arm whose numbers describe the map people will look at. */
const VISIBLE_ARM = 'adopted';
/** The arm whose whole claim is that it CANNOT be seen — the recipe's own authored factor, which
 *  on the shipped ladder cannot move any pixel past the 20/255 bar. It is carried precisely so
 *  that "we adopted the recipe's constant" is visibly a landing that would have changed nothing. */
const ADMISSIBLE_ARM = 'authored';
/** The forest arm wears the REAL status mix — 21 green, 14 yellow — so the per-token gate's claim
 *  is answerable in pixels here and nowhere else. `one` is mono-healthy. */
const SIZES = ['one', 'forest'];
const ZOOMS = [2, 8];
const FIT = 'fit';
/** The zoom the ground's own texture is read at. */
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
    return { id: r.identity(), rows, reference, shots, sensitivity: r.sensitivity('one', readZoom) };
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

// ⚠⚠ RUNG 2 BEFORE ANY READING IS QUOTED. The instrument must prove, on the pixels THIS run
// captured, that it resolves the ADR-0490 D6 boundary: a move of 21/255 visible, a move of exactly
// 20/255 not. Without it "the admissible arm is invisible" and "this comparison never saw two
// different frames" are the same report — and the second one reads as reassurance.
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
// `grass-status-reading.ts` says the authored fac cannot move a pixel and the shipped one can.
// Both halves are claims about PICTURES, and a driver that printed them without looking would be
// quoting its own model back at itself.
const visible = at(VISIBLE_ARM, 'one', READ_ZOOM);
const admissible = at(ADMISSIBLE_ARM, 'one', READ_ZOOM);
if (visible.visible === 0) {
  fail(
    `the ${VISIBLE_ARM} arm touched ${visible.touched} px and moved NONE of them by more than ` +
      `${VISIBLE_DELTA}/255. This is the arm that SHIPS; an adoption that moves no pixel a viewer ` +
      'can see is the clean landing that changed nothing (ADR-0490 D6).',
  );
}
if (admissible.visible > visible.visible / 10) {
  fail(
    `the ${ADMISSIBLE_ARM} arm moved ${admissible.visible} px visibly against ${VISIBLE_ARM}'s ` +
      `${visible.visible}. The report's claim is that the RECIPE'S OWN factor is invisible on the ` +
      'shipped ladder — the reason the delivered strength was re-derived rather than transcribed ' +
      '(ADR-0492 D2). If 0.13 is visible here, that reasoning does not hold.',
  );
}

// ⚠⚠ THE PER-TOKEN GATE, PROVED IN PIXELS. This is the claim unique to ADR-0492 D1 and the one
// the arithmetic alone cannot settle: the shader multiplies the mix by zero on every ungated row,
// so the yellow islands must draw EXACTLY what they drew before layer 1 existed. The `one` scene
// is mono-healthy and the `forest` scene wears the real 21-green/14-yellow mix, so if the gate is
// working the forest touches a strictly smaller SHARE of its land than the single green island
// does — and if the gate were dropped, both shares would be ~1 and this check is what notices.
//
// ⚠ IT IS A SHARE, NOT A COUNT. The two scenes show different amounts of land at the same zoom,
// so comparing raw touched pixels would compare two framings and call the difference a gate.
//
// ⚠⚠ AND IT IS ONLY ASKABLE AT A ZOOM WHOSE FRAME ACTUALLY HOLDS MORE THAN ONE ISLAND. Every
// scene here is RE-CENTRED on the island nearest the forest's middle, and that island is green;
// at 8 px/unit the buffer holds about 320x200 ground units, i.e. that island and little else. So
// the "forest" frame there is the SAME GREEN ISLAND as the mono frame — measured, 582,580 land px
// against 575,962 — and both are grassed over 93.9% of their land whether the gate works or not.
// Asserting a difference at that zoom asserts something the framing forbids. The qualifying zooms
// are DERIVED from the land each frame actually shows rather than hard-coded, so a change to the
// viewport or the crowd layout moves the check instead of quietly falsifying it.
const MULTI_ISLAND_LAND = 1.5;
const gateZooms = ZOOMS.filter(
  (zoom) => at(VISIBLE_ARM, 'forest', zoom).land > at(VISIBLE_ARM, 'one', zoom).land * MULTI_ISLAND_LAND,
);
if (gateZooms.length === 0) {
  fail(
    'no zoom in this run framed more than one island, so the per-token gate could not be checked ' +
      'in pixels at all. The check must not silently vanish: widen ZOOMS or the viewport.',
  );
}
for (const zoom of gateZooms) {
  const green = at(VISIBLE_ARM, 'one', zoom);
  const mixed = at(VISIBLE_ARM, 'forest', zoom);
  const greenShare = green.touched / green.land;
  const mixedShare = mixed.touched / mixed.land;
  if (greenShare < 0.5) {
    fail(
      `the mono-healthy island at ${zoom} px/unit was grassed over only ` +
        `${(greenShare * 100).toFixed(1)}% of its land. Every parcel there is healthy, so the ` +
        'gate should dress all of it — a low share means the gate is naming the wrong row.',
    );
  }
  if (mixedShare >= greenShare) {
    fail(
      `at ${zoom} px/unit the real-mix forest was grassed over ${(mixedShare * 100).toFixed(1)}% ` +
        `of its land against the all-green island's ${(greenShare * 100).toFixed(1)}%. The ` +
        'per-token gate (ADR-0492 D1) must leave the yellow islands untouched; equal shares mean ' +
        'the layer is dressing every token and the map is reporting states it does not hold.',
    );
  }
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
  `  shipped ${c1.families} families → adopted ${visible.families} → approved ` +
    `${result.reference.families}. Largest family: ${(c1.largestShare * 100).toFixed(1)}% → ` +
    `${(visible.largestShare * 100).toFixed(1)}% → ${(result.reference.largestShare * 100).toFixed(1)}%.`,
);
say('');
say('THE PER-TOKEN GATE, IN PIXELS (ADR-0492 D1) — the share of land the shipped arm dressed:');
for (const zoom of gateZooms) {
  const green = at(VISIBLE_ARM, 'one', zoom);
  const mixed = at(VISIBLE_ARM, 'forest', zoom);
  say(
    `  @${zoom} px/unit: all-green island ${((green.touched / green.land) * 100).toFixed(1)}% · ` +
      `real-mix forest ${((mixed.touched / mixed.land) * 100).toFixed(1)}% — the difference is ` +
      'the yellow islands, drawing exactly what they drew before this layer.',
  );
}
for (const zoom of ZOOMS.filter((z) => !gateZooms.includes(z))) {
  say(
    `  @${zoom} px/unit: NOT ASKED — the forest frame here holds ` +
      `${at(VISIBLE_ARM, 'forest', zoom).land} land px against the single island's ` +
      `${at(VISIBLE_ARM, 'one', zoom).land}, i.e. the same re-centred green island. A gate ` +
      'difference at this zoom would be a claim the framing forbids.',
  );
}
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
