// shipped-shore-measure.mjs - DRIVER for "the landform that falls to the shore": three widths of
// shore band over one island and one forest, differing ONLY in how far inland the fall reaches.
//
//   none      the map as it ships - full height right up to the waterline (CONTROL and DENOMINATOR)
//   authored  a 3.1-unit band - the approved render's generator's own BEACH constant
//   beach     a 7-unit band - COAST_OUTSET, exactly the land the coast clip added
//   shelf     a 16.5-unit band - one mean parcel diameter, a shelf rather than a lip
//
// THE INCREMENT: the landform that falls to the shore, on `adopt-the-land-into-the-shipped-map-arc`
// - the SECOND of the approved treatment's six components and the one the arc's own start-order
// note had lost track of. Its premise was checked at source before any of this was built, and it is
// the OPPOSITE of the coast clip's: a repo-wide grep for a shore falloff, a shore height term or a
// beach dip returns exactly ONE hit, and it is the sentence in the reference README naming the
// component as wanted. `landRelief` is an unbounded sum of three sines with no shore term at all.
// The component was genuinely ABSENT, not merely unimported.
//
// THE NUMBERS ARE THE APPROVED RENDER'S OWN. `build_land.py` authors the landform as a 3.1-unit
// smoothstep band and a 0.62-unit beach dip, at an island scale that matches ours to within a
// quarter of a unit - so both constants transfer as authored, and the only open question is that
// our beach is 7 units wide against the reference's 3.1. The arms are three answers to that.
//
// WARNING - THE REFUSALS ARE WHERE THIS PAGE'S HONESTY LIVES, and the sharpest one is that this
// component is supposed to be FREE. A vertical fall moves vertices in Y and creates none, so a
// triangle, a ring vertex, an attribute byte or a square unit of land that MOVED is a bug rather
// than a cost - and "it is free" is exactly the class of claim that gets believed rather than
// checked. The driver refuses any run in which a geometry counter differs between arms.
//
// Reproduce (needs a real GPU - every committed frame figure comes off the Mint box):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5300 --strictPort
//   DISPLAY=:0 ST_SHORE_URL=http://localhost:5300/shipped-shore.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-shore
//
// A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is computed
// in the typechecked modules (`harness/shipped-shore-scene.ts`, `src/shore-fall.ts`); this starts a
// browser, walks one page and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_SHORE_URL'] ?? 'http://localhost:5300/shipped-shore.html';
const OUT =
  process.env['ST_SHORE_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-shore-2026-09-01');
const ANGLE = process.env['ST_SHORE_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_SHORE_ALLOW_SOFTWARE'] === '1';
const BATCH = Number(process.env['ST_SHORE_BATCH'] ?? '30');
const REPEATS = Number(process.env['ST_SHORE_REPEATS'] ?? '5');

/** The land with NO fall at all - not a fourth option, the CONTROL and the DENOMINATOR. */
const REFERENCE = 'none';
const ARMS = ['authored', 'beach', 'shelf'];
const ALL_ARMS = [REFERENCE, ...ARMS];
/** Each arm's band width in ground units, mirrored from `SHORE_ARM_WIDTH` so the printed table can
 *  name it. The scene module is the source; a disagreement here is caught by the refusal below,
 *  which reads the width off the page rather than off this line. */
const ARM_WIDTH = { none: 0, authored: 3.1, beach: 7, shelf: 16.5 };
const SIZES = ['one', 'forest'];
const ZOOMS = [2, 8, 'fit'];
const FIT = 'fit';
/** The arc's zoomed-in read - where the beach is 56 delivered px and the comparison actually
 *  turns. */
const READ_ZOOM = 8;
/** Ground units of beach at the authored outset, which is what the pixel check below sizes. */
const BEACH_GROUND_WIDTH = 7;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

/** ⚠ 5184 is the default every worktree's vite pins — two harnesses on one box would serve each
 *  other's pages, and the numbers would belong to whichever branch started first. */
if (URL_.includes(':5184/')) {
  fail('port 5184 is the shared worktree default — start vite on a free port.');
}

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    `--use-angle=${ANGLE}`,
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ],
});

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
const httpErrors = [];
page.on('response', (r) => {
  if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.url()}`);
});

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForFunction(() => 'shoreRunner' in window, null, { timeout: 300_000 });
if (consoleErrors.length > 0) fail(`the page logged errors:\n  ${consoleErrors.join('\n  ')}`);
if (httpErrors.length > 0) fail(`the page failed to load something:\n  ${httpErrors.join('\n  ')}`);

const identity = await page.evaluate(() => window.shoreRunner.identity());
if (identity.software && !ALLOW_SOFTWARE) {
  fail(
    `${identity.renderer} is a SOFTWARE rasteriser. Take this on the box with a discrete GPU. To ` +
      'develop the page here, set ST_SHORE_ALLOW_SOFTWARE=1 — the run then stamps itself.',
  );
}

mkdirSync(OUT, { recursive: true });

// ── THE SWEEP.

/** Median of a list, which is what a frame figure should be: one hitched frame moves a mean and
 *  moves a median not at all. */
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const readings = {};
for (const size of SIZES) {
  readings[size] = {};
  for (const zoom of ZOOMS) {
    readings[size][zoom] = {};
    for (const arm of ALL_ARMS) {
      const samples = [];
      let base = null;
      for (let r = 0; r < REPEATS; r += 1) {
        const one = await page.evaluate(
          ([a, s, z, b]) => window.shoreRunner.time(a, s, z, b),
          [arm, size, zoom, BATCH],
        );
        base = one;
        if (one.gpuNs !== null) samples.push(one.gpuNs);
      }
      readings[size][zoom][arm] = {
        ...base,
        gpuNs: samples.length > 0 ? median(samples) : null,
        samples: samples.length,
        spreadNs: samples.length > 1 ? Math.max(...samples) - Math.min(...samples) : 0,
      };
    }
  }
}

// ── THE PIXEL COMPARISONS. Every arm against the control — which is both "what changed" and, for
//    this page, THE COAST'S OWN FOOTPRINT, because the control is the map without one.

const coastPx = {};
const changedPct = {};
/** Arm-against-arm, so the report can say whether the three shapes are actually three shapes. */
const between = {};
for (const size of SIZES) {
  coastPx[size] = {};
  changedPct[size] = {};
  between[size] = {};
  for (const zoom of ZOOMS) {
    coastPx[size][zoom] = {};
    changedPct[size][zoom] = {};
    for (const arm of ARMS) {
      coastPx[size][zoom][arm] = await page.evaluate(
        ([a, s, z]) => window.shoreRunner.shorePixels(a, s, z),
        [arm, size, zoom],
      );
      changedPct[size][zoom][arm] = await page.evaluate(
        ([a, s, z]) => window.shoreRunner.changedPct('none', a, s, z),
        [arm, size, zoom],
      );
    }
    // ADJACENT RUNGS OF THE WIDTH LADDER, which is where the denominator earns its keep: the
    // arm-vs-control figure IS the band's own footprint here (control and reference are the same
    // arm), so it is the arm-vs-arm number that answers "are 3.1, 7 and 16.5 three different lands".
    between[size][zoom] = {
      'authored|beach': await page.evaluate(
        ([s, z]) => window.shoreRunner.changedPixels('authored', 'beach', s, z),
        [size, zoom],
      ),
      'beach|shelf': await page.evaluate(
        ([s, z]) => window.shoreRunner.changedPixels('beach', 'shelf', s, z),
        [size, zoom],
      ),
    };
  }
}

// ── THE PICTURES.

const shots = [];
for (const [size, zoom] of [
  ['forest', FIT],
  ['forest', 2],
  ['forest', 8],
  ['one', 2],
  ['one', 8],
]) {
  for (const arm of ALL_ARMS) {
    const png = await page.evaluate(
      ([a, s, z]) => window.shoreRunner.snapshot(a, s, z),
      [arm, size, zoom],
    );
    const name = `shore-${size}-${zoom}px-${arm}.png`;
    writeFileSync(join(OUT, name), Buffer.from(png.split(',')[1], 'base64'));
    shots.push(name);
  }
}

await browser.close();

const at = (size, zoom, arm) => readings[size][zoom][arm];

// ── THE REFUSALS. Each one is a way this comparison could look right and mean nothing.

// 1. ⚠⚠ NO PARCEL MAY FOLD, ON ANY ARM, AT ANY SIZE. This is the only refusal here that is about
//    the map's HONESTY rather than about the measurement's. A folded parcel draws its capability's
//    status colour over ground that belongs to another capability — a misreport, and the one way
//    this component could do real harm. The coast that ships in the 2D panel folds twice on this
//    island; `src/coast-clip.ts` caps every arm so that no parcel does, and this is the check that
//    a cap which stopped working could not pass silently.
for (const size of SIZES) {
  for (const arm of ALL_ARMS) {
    const folded = at(size, READ_ZOOM, arm).foldedParcels;
    if (folded !== 0) {
      fail(
        `the ${arm} arm folded ${folded} parcel(s) on the ${size} map. A folded parcel paints one ` +
          "capability's status over another's ground — the map has stopped reporting.",
      );
    }
  }
}

// 2. NON-VACUITY: the control must actually be the land that does NOT fall. If `none` already
//    dipped to the waterline there would be nothing here to compare against, and every picture
//    below would be of a solved problem.
const control = at('one', READ_ZOOM, REFERENCE);
if (control.movedVertices !== 0 || control.rungFlips !== 0) {
  fail(
    `the control moved ${control.movedVertices} vertices and flipped ${control.rungFlips} rungs ` +
      'against itself - it is not the unfallen land',
  );
}
for (const arm of ARMS) {
  const r = at('one', READ_ZOOM, arm);
  if (r.movedVertices <= 0) {
    fail(`the ${arm} arm moved NO ground at all - a landform that falls nowhere is not a landform`);
  }
  if (r.minHeight >= control.minHeight) {
    fail(
      `the ${arm} arm's lowest ground is ${r.minHeight.toFixed(3)}, no lower than the control's ` +
        `${control.minHeight.toFixed(3)} - the beach did not dip below the grass line`,
    );
  }
}

// 3. WARNING - THE MESH CANNOT READ A BAND NARROWER THAN 8.66 UNITS, AND THIS REFUSAL ASSERTS THE
//    FINDING RATHER THAN GUARDING AGAINST IT. It replaced a "a wider band must move more ground"
//    check - the one that catches a falloff wired up backwards - which FAILED, because `authored`
//    (3.1) and `beach` (7) move the identical set of vertices by identical amounts.
//
//    The measurement: 253 of 392 distinct ground vertices lie EXACTLY on the coast and the nearest
//    interior vertex is 8.66 units away, with nothing in between. The reference generator displaces
//    a 0.55-unit GRID; this ground is parcels ~16.5 units across whose only vertices are corners.
//    So the two bands inside the void deliver the bit-identical land, and the page shows two
//    pictures a reader can check are the same file.
//
//    The backwards-falloff check is not lost, it has moved to the one pair the mesh CAN separate.
const inVoid = ['authored', 'beach'];
for (const size of SIZES) {
  const first = at(size, READ_ZOOM, inVoid[0]);
  const second = at(size, READ_ZOOM, inVoid[1]);
  for (const [what, x, y] of [
    ['moved vertices', first.movedVertices, second.movedVertices],
    ['max drop', first.maxDrop, second.maxDrop],
    ['mean drop', first.meanDrop, second.meanDrop],
    ['rung flips', first.rungFlips, second.rungFlips],
  ]) {
    if (x !== y) {
      fail(
        `on the ${size} map ${inVoid[0]} and ${inVoid[1]} differ in ${what} (${x} vs ${y}). Both ` +
          'bands sit inside the 0-to-8.66-unit vertex void, so they should deliver the identical ' +
          'land - if they no longer do, the mesh has gained vertices and this page\'s finding is stale.',
      );
    }
  }
  const wide = at(size, READ_ZOOM, 'shelf');
  if (wide.movedVertices <= second.movedVertices) {
    fail(
      `on the ${size} map the shelf band (16.5 units, past the void) moved ${wide.movedVertices} ` +
        `vertices, no more than beach's ${second.movedVertices} - the falloff is not reading its width`,
    );
  }
}

// 4. THE BAND MUST BE PHOTOGRAPHABLE AT THE ZOOM BEING COMPARED, and then it must actually move
//    pixels there. Either check alone is satisfied by a comparison that could not have failed -
//    this arc has already produced one pair of byte-identical files by comparing a sub-pixel
//    feature at an overview zoom.
const beachPx = BEACH_GROUND_WIDTH * READ_ZOOM;
if (beachPx < 24) {
  fail(`the beach is ${beachPx} delivered px at the read zoom - too narrow to falsify anything`);
}
for (const size of SIZES) {
  for (const arm of ARMS) {
    if (coastPx[size][READ_ZOOM][arm] <= 0) {
      fail(
        `${arm} rendered the ${size} map BYTE-IDENTICALLY to the control at ${READ_ZOOM} px per ` +
          'ground unit. Either it is not doing anything, or the frame does not contain a shore.',
      );
    }
  }
}

// 5. THE ARMS THE MESH CAN SEPARATE MUST ACTUALLY LOOK DIFFERENT. Only `beach` vs `shelf` is
//    checked here, and that narrowing is the finding rather than a weakening: `authored` vs `beach`
//    is byte-identical BY CONSTRUCTION (refusal 3), so demanding a pixel difference there would
//    refuse every correct run. Its picture pair is committed precisely so a reader can see that.
if (between['one'][READ_ZOOM]['beach|shelf'] <= 0) {
  fail(`beach and shelf are BYTE-IDENTICAL at ${READ_ZOOM} px/unit - that is not a fork`);
}
if (between['one'][READ_ZOOM]['authored|beach'] !== 0) {
  fail(
    `authored and beach differ by ${between['one'][READ_ZOOM]['authored|beach']} pixels. Both sit ` +
      'inside the vertex void, so they should render identically - the finding is stale.',
  );
}

// 6. WARNING - EVERY ARM MUST BE EXACTLY FREE, AND THIS IS THE HEADLINE CLAIM RATHER THAN A
//    FOOTNOTE. A vertical fall moves vertices in Y and creates none, so a triangle, a ring vertex,
//    an attribute byte or a square unit of land that MOVED is a bug and not a cost. "It is free" is
//    exactly the class of claim that gets believed rather than checked, so it is checked - on every
//    arm, at every size, against the control.
for (const size of SIZES) {
  for (const arm of ARMS) {
    const r = at(size, READ_ZOOM, arm);
    const c = at(size, READ_ZOOM, REFERENCE);
    for (const [what, got, want] of [
      ['triangles', r.triangles, c.triangles],
      ['ring vertices', r.ringVertices, c.ringVertices],
      ['attribute bytes', r.attributeBytes, c.attributeBytes],
      ['distinct vertices', r.vertices, c.vertices],
    ]) {
      if (got !== want) {
        fail(
          `the ${arm} arm changed ${what} on the ${size} map: ${got} against the control's ` +
            `${want}. The shore fall is VERTICAL - it cannot create geometry, so this is a bug.`,
        );
      }
    }
    if (Math.abs(r.groundArea - c.groundArea) > 1e-6) {
      fail(
        `the ${arm} arm bounds ${r.groundArea.toFixed(3)} sq units against the control's ` +
          `${c.groundArea.toFixed(3)} - a vertical fall cannot change how much land there is`,
      );
    }
  }
}

// 7. WARNING - THE FALL MUST REACH THE DELIVERED COLOUR, NOT ONLY THE GEOMETRY. The banded material
//    quantises `dot(n, L)` onto the authored ladder, so a band that moved ground but flipped no
//    rung is INVISIBLE on the shipped material however deep its drop - and every geometry figure
//    above would still read as a success. This is the check that separates "the land moved" from
//    "the map looks different", and they are not the same claim.
for (const arm of ARMS) {
  const r = at('one', READ_ZOOM, arm);
  if (r.rungFlips <= 0) {
    fail(
      `the ${arm} arm moved ${r.movedVertices} vertices and flipped NO shade rung. On the banded ` +
        'material that is a land that moved and a map that did not change - report it, do not ship it.',
    );
  }
}

// 8. THE SHORE MAY NOT COST THE ONE-DRAW GROUND. `the forest's ground is ONE draw call` is a
//    property this arc has already committed to, and a vertical fall is a change to where the
//    ground sits rather than to how many meshes carry it.
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    for (const arm of ALL_ARMS) {
      if (at(size, zoom, arm).drawCalls !== 1) {
        fail(
          `${arm} submitted ${at(size, zoom, arm).drawCalls} draw calls on the ${size} map at ` +
            `${zoom} — the ground is ONE draw call`,
        );
      }
    }
  }
}

// ── THE REPORT.

const pct = (n, d) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);
const ms = (r) => (r.gpuNs === null ? '     n/a' : (r.gpuNs / 1e6).toFixed(4).padStart(8));

const lines = [];
lines.push(`# the landform that falls to the shore — three widths, one instrument`);
lines.push('');
lines.push(`renderer: ${identity.vendor} — ${identity.renderer}`);
lines.push(`software rasteriser: ${identity.software}${identity.software ? '  ⚠ FIGURES NOT COMMITTABLE' : ''}`);
lines.push(`timer query: ${identity.timerQuery} · batch ${BATCH} · ${REPEATS} repeats, median reported`);
lines.push('');
lines.push('## what each arm costs — every column identical by construction, and checked');
lines.push('');
lines.push('⚠ THE POINT OF THIS TABLE IS THAT IT DOES NOT VARY. A vertical fall creates no geometry,');
lines.push('so a moving column here would be a BUG rather than a cost, and the driver refuses the run.');
lines.push('');
lines.push('size    arm         band  tris  ringVerts  vertexKB  sq units  draws');
for (const size of SIZES) {
  for (const arm of ALL_ARMS) {
    const r = at(size, READ_ZOOM, arm);
    lines.push(
      [
        size.padEnd(7),
        arm.padEnd(11),
        String(ARM_WIDTH[arm]).padStart(5),
        String(r.triangles).padStart(5),
        String(r.ringVertices).padStart(10),
        (r.attributeBytes / 1024).toFixed(1).padStart(9),
        r.groundArea.toFixed(0).padStart(9),
        String(r.drawCalls).padStart(6),
      ].join(' '),
    );
  }
}
lines.push('');
lines.push('## what each arm MOVED — the land, and the delivered colour');
lines.push('');
lines.push('⚠ `rung flips` is the only column a viewer can see. The banded material quantises');
lines.push('dot(n, L) onto the authored ladder, so a band that moved ground but flipped no rung is');
lines.push('invisible on the shipped material however deep its drop. It is a LOWER bound — taken per');
lines.push('vertex, while the shader quantises per fragment.');
lines.push('');
lines.push('size    arm         moved/verts     %  maxDrop  meanDrop  height range      rung flips');
for (const size of SIZES) {
  for (const arm of ALL_ARMS) {
    const r = at(size, READ_ZOOM, arm);
    lines.push(
      [
        size.padEnd(7),
        arm.padEnd(11),
        `${r.movedVertices}/${r.vertices}`.padStart(11),
        pct(r.movedVertices, r.vertices).padStart(6),
        r.maxDrop.toFixed(3).padStart(8),
        r.meanDrop.toFixed(3).padStart(9),
        `${r.minHeight.toFixed(2)}…${r.maxHeight.toFixed(2)}`.padStart(14),
        String(r.rungFlips).padStart(11),
      ].join(' '),
    );
  }
}
lines.push('');
lines.push('## what the shore band moved ON SCREEN — against the frame, and against itself');
lines.push('');
lines.push('⚠ the second column is the one to read. A shore band is a thin annulus, so the first column');
lines.push('  is small for every honest arm; the third divides by the arm\'s own footprint.');
lines.push('');
lines.push('size    zoom  arm         % of frame   shore px   beach px');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    for (const arm of ARMS) {
      const px = at(size, zoom, arm).pxPerUnit;
      lines.push(
        [
          size.padEnd(7),
          String(zoom).padStart(4),
          arm.padEnd(11),
          changedPct[size][zoom][arm].toFixed(3).padStart(10),
          String(coastPx[size][zoom][arm]).padStart(10),
          (BEACH_GROUND_WIDTH * px).toFixed(1).padStart(10),
        ].join(' '),
      );
    }
  }
}
lines.push('');
lines.push('## are the three shapes actually three shapes?');
lines.push('');
lines.push('size    zoom  authored vs beach   beach vs shelf   (pixels)');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    lines.push(
      [
        size.padEnd(7),
        String(zoom).padStart(4),
        String(between[size][zoom]['authored|beach']).padStart(18),
        String(between[size][zoom]['beach|shelf']).padStart(16),
      ].join(' '),
    );
  }
}
lines.push('');
lines.push('## frame cost (median GPU ms per render, and the spread over repeats)');
lines.push('');
lines.push('⚠ REPRODUCIBLE PER ROW, NOT PER TABLE. Take two runs and diff them row by row; quote');
lines.push('  only the rows that agree, and say which were dropped.');
lines.push('');
lines.push('size    zoom  arm            ms    spread ms   samples');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    for (const arm of ALL_ARMS) {
      const r = at(size, zoom, arm);
      lines.push(
        [
          size.padEnd(7),
          String(zoom).padStart(4),
          arm.padEnd(11),
          ms(r),
          (r.spreadNs / 1e6).toFixed(4).padStart(11),
          String(r.samples).padStart(9),
        ].join(' '),
      );
    }
  }
}
lines.push('');
lines.push(`## does the band cover the beach, or stop short of it?`);
lines.push('');
lines.push('⚠ THE QUESTION THIS PAGE EXISTS FOR. The coast outsets by 7 ground units, so the beach it');
lines.push('added is 7 units wide (modulated per vertex by the coast wave). A band NARROWER than that');
lines.push("leaves part of the map's own new land standing at full height; a band wider than it starts");
lines.push('lowering ground that was there before the coast, and that ground carries props.');
lines.push('');
for (const size of SIZES) {
  for (const arm of ARMS) {
    const r = at(size, READ_ZOOM, arm);
    const w = ARM_WIDTH[arm];
    const verdict =
      w < BEACH_GROUND_WIDTH
        ? `stops ${(BEACH_GROUND_WIDTH - w).toFixed(1)} units SHORT of the beach's outer edge`
        : w > BEACH_GROUND_WIDTH
          ? `reaches ${(w - BEACH_GROUND_WIDTH).toFixed(1)} units INLAND of the pre-coast boundary`
          : 'covers exactly the land the coast added, and no more';
    lines.push(
      `${size.padEnd(7)} ${arm.padEnd(11)} band ${String(w).padStart(4)} units — ${verdict}; ` +
        `${r.movedVertices}/${r.vertices} vertices moved (${pct(r.movedVertices, r.vertices)}), ` +
        `${r.rungFlips} rung flips`,
    );
  }
}
lines.push('');
lines.push(`pictures: ${shots.length}`);
for (const s of shots) lines.push(`  ${s}`);

const report = `${lines.join('\n')}\n`;
writeFileSync(join(OUT, 'shore-measurements.md'), report);
writeFileSync(
  join(OUT, 'shore-measurements.json'),
  `${JSON.stringify({ identity, readings, coastPx, changedPct, between, shots }, null, 2)}\n`,
);
console.log(report);
console.log(`wrote ${shots.length} pictures + shore-measurements.{md,json} to ${OUT}`);
