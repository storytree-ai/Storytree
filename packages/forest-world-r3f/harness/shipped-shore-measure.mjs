// shipped-shore-measure.mjs - DRIVER for "the landform that falls to the shore", now carrying TWO
// axes that meet at one arm, over one island and one forest.
//
// THE WIDTH AXIS - how far inland the fall reaches, and nothing else:
//   none      the map as it ships - full height right up to the waterline (CONTROL and DENOMINATOR)
//   authored  a 3.1-unit band - the approved render's generator's own BEACH constant
//   beach     a 7-unit band - COAST_OUTSET, exactly the land the coast clip added
//   shelf     a 16.5-unit band - one mean parcel diameter, a shelf rather than a lip
//
// THE RING AXIS - the SAME 7-unit band, with vertices inside it for the falloff to bend through:
//   ring      + one inset ring at 3.5 units, the band's midpoint
//   ring-pair + two inset rings at the band's thirds
//
// WARNING - THE TWO AXES MEET AT `beach`, AND EVERY REFUSAL BELOW IS SCOPED TO ONE OF THEM. The
// width arms must be EXACTLY FREE - a vertical fall creates no geometry, so a moving triangle count
// there is a bug. The ring arms must COST triangles and must NOT move one square unit of land. A
// refusal that demanded either rule of both axes would fire on a correct run.
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
// WARNING - AND THE WIDTH TURNED OUT NOT TO BE A KNOB, WHICH IS WHY THE RING AXIS EXISTS. On the
// shipped island 253 of 392 distinct ground vertices lie EXACTLY on the coast and the nearest
// interior vertex is 8.66 units away, with nothing in between: every band narrower than that void
// acts on the rim alone, so `authored` (3.1) and `beach` (7) render byte-identically. The mesh is
// about thirty times coarser than the 0.55-unit grid the reference constants were authored on. The
// remedy for a geometry-valued component is not a different constant, it is more vertices.
//
// WARNING - THE REFUSALS ARE WHERE THIS PAGE'S HONESTY LIVES, and the sharpest pair is per-axis.
// The WIDTH arms are supposed to be FREE, so a triangle, a ring vertex, an attribute byte or a
// square unit of land that MOVED there is a bug rather than a cost. The RING arms are supposed to
// SPEND triangles and to conserve the land EXACTLY - ground drawn twice is one capability's status
// painted over another's, which is the one way this component could do real harm.
//
// Reproduce (needs a real GPU - every committed frame figure comes off the Mint box):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5302 --strictPort
//   DISPLAY=:0 ST_SHORE_URL=http://localhost:5302/shipped-shore.html \
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
// ⚠ A NEW DIRECTORY PER INCREMENT, never a rewrite of the last one. The shore fall's own evidence
// (`chapter2-shipped-shore-2026-09-01`) is what this increment's numbers are read AGAINST, and the
// owner has not seen it yet - a driver that overwrote it would delete the denominator.
const OUT =
  process.env['ST_SHORE_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shore-ring-2026-09-01');
const ANGLE = process.env['ST_SHORE_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_SHORE_ALLOW_SOFTWARE'] === '1';
const BATCH = Number(process.env['ST_SHORE_BATCH'] ?? '30');
const REPEATS = Number(process.env['ST_SHORE_REPEATS'] ?? '5');

/** The land with NO fall at all - not another option, the CONTROL and the DENOMINATOR. */
const REFERENCE = 'none';
/** The arms on the WIDTH axis, control excluded - the ones that must be exactly free. */
const WIDTH_ARMS = ['authored', 'beach', 'shelf'];
/** The arms on the RING axis - the ones that divide the mesh and must pay for it. */
const RING_ARMS = ['ring', 'ring-pair'];
/** The arm the RING axis is read against: the same band, the mesh the map has today. */
const RING_REFERENCE = 'beach';
const ARMS = [...WIDTH_ARMS, ...RING_ARMS];
const ALL_ARMS = [REFERENCE, ...ARMS];
/** Each arm's band width in ground units, mirrored from `SHORE_ARM_WIDTH` so the printed table can
 *  name it. The scene module is the source; a disagreement here is caught by the refusal below,
 *  which reads the width off the page rather than off this line. */
const ARM_WIDTH = { none: 0, authored: 3.1, beach: 7, shelf: 16.5, ring: 7, 'ring-pair': 7 };
/** Each arm's inset rings, for the table. Same mirroring, same caveat. */
const ARM_RINGS = {
  none: '-',
  authored: '-',
  beach: '-',
  shelf: '-',
  ring: '3.50',
  'ring-pair': '2.33,4.67',
};
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
      // THE RING AXIS'S OWN PAIRS, read against `beach` - same band, same everything, one mesh
      // apart. This is the number that answers "did the falloff's shape become VISIBLE", as
      // opposed to the sag, which answers whether it became DELIVERABLE.
      'beach|ring': await page.evaluate(
        ([s, z]) => window.shoreRunner.changedPixels('beach', 'ring', s, z),
        [size, zoom],
      ),
      'ring|ring-pair': await page.evaluate(
        ([s, z]) => window.shoreRunner.changedPixels('ring', 'ring-pair', s, z),
        [size, zoom],
      ),
    };
  }
}

// ── THE PICTURES.

// ⚠ THE PICTURES ARE THE RING AXIS'S, PLUS THE CONTROL. `authored` and `shelf` are the WIDTH
// axis's own finding and this increment does not move them - their arms carry no ring, so they
// render byte-identically to the shore fall's committed set and re-taking them would be four
// megabytes saying the same thing twice. `chapter2-shipped-shore-2026-09-01` holds them.
const PICTURE_ARMS = [REFERENCE, RING_REFERENCE, ...RING_ARMS];

const shots = [];
for (const [size, zoom] of [
  ['forest', FIT],
  ['forest', 2],
  ['forest', 8],
  ['one', 2],
  ['one', 8],
]) {
  for (const arm of PICTURE_ARMS) {
    const png = await page.evaluate(
      ([a, s, z]) => window.shoreRunner.snapshot(a, s, z),
      [arm, size, zoom],
    );
    const name = `ring-${size}-${zoom}px-${arm}.png`;
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
  // The fall pulls ground TOWARD the waterline, so where a band reaches a trough DEEPER than the
  // waterline it RAISES it. The island floor therefore never gets deeper - which is what keeps
  // every camera framing constant and every shadow reach unmoved by this increment.
  //
  // An earlier draft of this refusal had the sign backwards and demanded the floor DROP. It fired
  // on a correct run: the waterline is -0.62 and this island's sine trough is -3.912, six times
  // deeper, so the dip cannot lower the minimum and never could.
  if (r.minHeight < control.minHeight - 1e-9) {
    fail(
      `the ${arm} arm deepened the island floor to ${r.minHeight.toFixed(3)} against the control's ` +
        `${control.minHeight.toFixed(3)} - the fall only ever pulls ground toward the waterline`,
    );
  }
  if (r.maxDrop <= 0) {
    fail(`the ${arm} arm moved ${r.movedVertices} vertices by a maximum of zero - nothing fell`);
  }
}

// 3. WARNING - THE MESH CANNOT READ A BAND NARROWER THAN 8.66 UNITS, AND THIS REFUSAL ASSERTS THE
//    FINDING RATHER THAN GUARDING AGAINST IT. It replaced a "a wider band must move more ground"
//    check - the one that catches a falloff wired up backwards - which FAILED, because `authored`
//    (3.1) and `beach` (7) move the identical set of vertices by identical amounts.
//
//    The measurement: on the shipped island 253 of 392 distinct ground vertices lie EXACTLY on the
//    coast and the nearest interior vertex is 8.66 units away, with nothing in between. The
//    reference generator displaces a 0.55-unit GRID; this ground is parcels ~16.5 units across
//    whose only vertices are corners. So the two bands inside the void deliver the bit-identical
//    land, and the page shows two pictures a reader can check are the same file.
//
//    WARNING - AND THE FOREST IS WHERE THAT CLAIM WAS CAUGHT BEING TOO STRONG, BY THIS REFUSAL. The
//    coast wave is seeded per island, so 35 copies of one fixture wear 35 different coasts and each
//    samples the rim-to-interior gap differently. Across all of them exactly ONE vertex in 8884
//    falls between 3.1 and 7 units of its shore. So the void is EXACT on the shipped island and
//    overwhelming rather than absolute across seeds - which is a stronger statement than the one it
//    replaced, and the honest one.
//
//    The backwards-falloff check is not lost, it has moved to the one pair the mesh CAN separate.
//    WARNING - AND THIS REFUSAL IS SCOPED TO THE WIDTH AXIS BY CONSTRUCTION. Both arms named below
//    are width arms; a RING arm fills the very void this asserts, so holding one to it would refuse
//    the increment for working.
const inVoid = ['authored', 'beach'];
/** How many vertices the two in-void bands may deliver differently on the FOREST, in a fixed count
 *  rather than a percentage. Measured at ONE out of 8884 across 35 differently-seeded coasts; a
 *  handful is the honest bound, and a number that has to move is a finding rather than a retune. */
const VOID_SLACK = 5;
for (const size of SIZES) {
  const first = at(size, READ_ZOOM, inVoid[0]);
  const second = at(size, READ_ZOOM, inVoid[1]);
  // EXACT on the single island, where the void was measured; a handful of vertices on the forest,
  // where 35 different coast seeds each sample the gap differently and one of them lands in it.
  const slack = size === 'one' ? 0 : VOID_SLACK;
  const gap = Math.abs(first.movedVertices - second.movedVertices);
  if (gap > slack) {
    fail(
      `on the ${size} map ${inVoid[0]} and ${inVoid[1]} moved ${first.movedVertices} and ` +
        `${second.movedVertices} vertices, ${gap} apart against an allowance of ${slack}. Both ` +
        'bands sit inside the vertex void, so they should deliver essentially the identical land ' +
        '- if they no longer do, the mesh has gained vertices and this page\'s finding is stale.',
    );
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

// 5b. THE RING MUST CHANGE THE PICTURE, and it is a different claim from changing the surface. The
//     sag below says the mesh can now CARRY the falloff's shape; this says a viewer would see it.
//     Both are needed: a ring that halved the sag and moved no pixel would have bought a property
//     nobody can look at, and this arc's whole subject is the look.
if (between['one'][READ_ZOOM]['beach|ring'] <= 0) {
  fail(
    `beach and ring are BYTE-IDENTICAL at ${READ_ZOOM} px/unit. The ring divided the mesh and ` +
      'changed nothing a viewer can see - that is a refinement to decline, not to ship.',
  );
}

// 6. WARNING - EVERY WIDTH ARM MUST BE EXACTLY FREE, AND THIS IS THE SHORE FALL'S HEADLINE CLAIM
//    RATHER THAN A FOOTNOTE. A vertical fall moves vertices in Y and creates none, so a triangle, a
//    ring vertex, an attribute byte or a square unit of land that MOVED is a bug and not a cost.
//    "It is free" is exactly the class of claim that gets believed rather than checked, so it is
//    checked - on every width arm, at every size, against the control.
for (const size of SIZES) {
  for (const arm of WIDTH_ARMS) {
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

// 6b. WARNING - A RING ARM MUST SPEND TRIANGLES AND MUST NOT SPEND ONE SQUARE UNIT OF LAND. The
//     mirror of the refusal above, and the sharper half is the area: the ring DIVIDES parcels, so
//     ground lost is a hole in the island and ground double-counted is one capability's status
//     colour drawn over another's (ADR-0392 D5 / ADR-0398 D7). Either shows up here exactly.
for (const size of SIZES) {
  for (const arm of RING_ARMS) {
    const r = at(size, READ_ZOOM, arm);
    const c = at(size, READ_ZOOM, RING_REFERENCE);
    if (r.triangles <= c.triangles) {
      fail(
        `the ${arm} arm drew ${r.triangles} triangles against ${RING_REFERENCE}'s ${c.triangles} ` +
          'on the ' + size + ' map - it divided nothing, so it can have delivered nothing',
      );
    }
    if (r.dividedParcels <= 0) {
      fail(`the ${arm} arm divided NO parcel on the ${size} map`);
    }
    // AND IT MUST REACH MOST OF THE SHORE, not a scattering of it. A band delivered on half the
    // coastal parcels reads as a shore that keeps stopping, which is worse than one that is
    // uniformly abrupt - so the coverage is a number the report prints rather than a side effect.
    if (r.dividedParcels * 2 <= r.coastalParcels) {
      fail(
        `the ${arm} arm divided ${r.dividedParcels} of ${r.coastalParcels} coastal parcels on the ` +
          `${size} map - under half the shore, which draws as a band that keeps stopping`,
      );
    }
    if (Math.abs(r.groundArea - c.groundArea) > 1e-6) {
      fail(
        `the ${arm} arm bounds ${r.groundArea.toFixed(3)} sq units against ${RING_REFERENCE}'s ` +
          `${c.groundArea.toFixed(3)} - a division that changes how much land there is has ` +
          'either lost ground or drawn some of it twice, and the map has stopped reporting',
      );
    }
    if (r.leastScale <= 0) {
      fail(
        `the ${arm} arm kept a parcel's chain at zero depth on the ${size} map - that band ` +
          'delivers no shape and still costs its triangles',
      );
    }
  }
}

// 6c. WARNING - THE RING MUST MAKE THE FALLOFF DELIVERABLE, WHICH IS THE INCREMENT'S OWN QUESTION.
//     `shoreRelief` answers the smoothstep at every point; what the map DRAWS is a triangulation
//     that samples it at vertices and interpolates flat between. The SAG is the gap between the two
//     inside the band. A ring that cost triangles and did not move it bought nothing - and this
//     refusal is written so that outcome REPORTS rather than passes quietly.
for (const size of SIZES) {
  const c = at(size, READ_ZOOM, RING_REFERENCE);
  if (c.bandTriangles <= 0) {
    fail(`the ${RING_REFERENCE} arm has no band triangles on the ${size} map - nothing to improve`);
  }
  // AND THE TWO IN-VOID WIDTHS MUST REPORT THE IDENTICAL SAG over that fixed region - the void
  // finding, arriving on the new instrument. If they ever diverge the mesh has gained vertices and
  // both this page's findings are stale.
  const inVoidSag = [at(size, READ_ZOOM, 'authored'), at(size, READ_ZOOM, 'beach')];
  if (inVoidSag[0].bandTriangles !== inVoidSag[1].bandTriangles) {
    fail(
      `authored and beach cover ${inVoidSag[0].bandTriangles} and ${inVoidSag[1].bandTriangles} ` +
        `band triangles on the ${size} map. The sag region is FIXED, so these are the same ground ` +
        'and the same mesh - a difference means the region stopped being fixed.',
    );
  }
  for (const arm of RING_ARMS) {
    const r = at(size, READ_ZOOM, arm);
    if (r.bandTriangles <= c.bandTriangles) {
      fail(
        `the ${arm} arm put ${r.bandTriangles} triangles in the band against ` +
          `${RING_REFERENCE}'s ${c.bandTriangles} on the ${size} map - the ring is not inside it`,
      );
    }
    if (r.meanSag >= c.meanSag || r.maxSag >= c.maxSag) {
      fail(
        `the ${arm} arm's sag is ${r.meanSag.toFixed(4)} mean / ${r.maxSag.toFixed(4)} max ` +
          `against ${RING_REFERENCE}'s ${c.meanSag.toFixed(4)} / ${c.maxSag.toFixed(4)} on the ` +
          `${size} map. The mesh is no closer to the land it is approximating, so the ring cost ` +
          'triangles and delivered no shape - decline it rather than shipping it.',
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
lines.push(`# the landform that falls to the shore — three widths and two inset rings`);
lines.push('');
lines.push(`renderer: ${identity.vendor} — ${identity.renderer}`);
lines.push(`software rasteriser: ${identity.software}${identity.software ? '  ⚠ FIGURES NOT COMMITTABLE' : ''}`);
lines.push(`timer query: ${identity.timerQuery} · batch ${BATCH} · ${REPEATS} repeats, median reported`);
lines.push('');
lines.push('## what each arm costs — flat across the WIDTH axis, and paid on the RING axis');
lines.push('');
lines.push('⚠ READ THIS TABLE AS TWO. The four width arms must be identical down every column — a');
lines.push('vertical fall creates no geometry, so a moving column there is a BUG and the driver refuses');
lines.push('the run. The two ring arms must MOVE the triangles and must NOT move `sq units`: they divide');
lines.push('parcels, and a division that changed how much land there is has either lost ground or drawn');
lines.push('some of it twice — which on this map is one capability\'s status painted over another\'s.');
lines.push('');
lines.push('size    arm         band  rings        tris     +%  ringVerts  vertexKB  sq units  draws');
for (const size of SIZES) {
  const base = at(size, READ_ZOOM, RING_REFERENCE).triangles;
  for (const arm of ALL_ARMS) {
    const r = at(size, READ_ZOOM, arm);
    const grew = r.triangles === base ? '  —' : `${(((r.triangles - base) / base) * 100).toFixed(1)}`;
    lines.push(
      [
        size.padEnd(7),
        arm.padEnd(11),
        String(ARM_WIDTH[arm]).padStart(5),
        ARM_RINGS[arm].padStart(10),
        String(r.triangles).padStart(7),
        grew.padStart(6),
        String(r.ringVertices).padStart(10),
        (r.attributeBytes / 1024).toFixed(1).padStart(9),
        r.groundArea.toFixed(0).padStart(9),
        String(r.drawCalls).padStart(6),
      ].join(' '),
    );
  }
}
lines.push('');
lines.push('## ⚠⚠ DOES THE MESH CARRY THE FALLOFF\'S SHAPE? — the sag, in ground units');
lines.push('');
lines.push('`shoreRelief` is analytic: it answers the smoothstep at every point. What the map DRAWS is a');
lines.push('triangulation that samples it at the vertices and interpolates flat between them. With no');
lines.push('vertex between the coastline and the first interior corner 8.66 units inland, the drawn shore');
lines.push('is a straight ramp and the falloff\'s shape is not coarse but ABSENT. The sag is that gap,');
lines.push('measured per band triangle between its own plane and the field at its centroid.');
lines.push('');
lines.push('⚠ THE REGION IS FIXED at the 7-unit beach for EVERY arm, never the arm\'s own band. Measured');
lines.push('over its own band, `authored` reported a LOWER sag than `beach` and read as the better arm —');
lines.push('but only the denominator had moved. Fixed, the order inverts, and `none` becomes a real');
lines.push('baseline: the sine relief\'s own chordal error over the same ground, with no band at all.');
lines.push('');
lines.push('⚠⚠ AND THE FIXED REGION SEPARATES TWO ARMS THAT DELIVER THE BIT-IDENTICAL LAND. `authored`');
lines.push('and `beach` move the same vertices by the same amounts — the void finding — and still report');
lines.push('different sags, because each is measured against its OWN analytic field: `authored`\'s');
lines.push('smoothstep finishes in 3.1 units where `beach`\'s takes 7, so the straight ramp this mesh is');
lines.push('forced to draw departs from it further. The narrower the authored band, the more of its shape');
lines.push('the mesh fails to carry. That is the void finding as a quantity rather than as an identity.');
lines.push('');
lines.push('⚠ SO A LOW SAG DOES NOT BY ITSELF SELECT AN ARM, and `shelf` is the reason to say so: its band');
lines.push('is so wide that the falloff is gentle enough for even this mesh, which is why it reports the');
lines.push('lowest sag of the four width arms. It is still REFUSED, and for a reason this column cannot');
lines.push('see — it lowers ground inland of the pre-coast boundary, and that ground carries props.');
lines.push('');
lines.push('⚠ A RING THAT COST TRIANGLES AND DID NOT MOVE THIS BOUGHT NOTHING. That outcome was a live');
lines.push('possibility when this page was written, and the driver refuses the run rather than shipping it.');
lines.push('');
lines.push('⚠ `coastal` EXCLUDES the parcels this module refuses on principle rather than on geometry:');
lines.push('one whose vertices are ALL on the coast, and one meeting the coast in two separate runs (five');
lines.push('in 1,854 on the forest). The denominator is the parcels a single band COULD reach.');
lines.push('');
lines.push('size    arm         bandTris  maxSag  meanSag   vs beach  divided/coastal  capped  least  inserted');
for (const size of SIZES) {
  const c = at(size, READ_ZOOM, RING_REFERENCE);
  for (const arm of ALL_ARMS) {
    const r = at(size, READ_ZOOM, arm);
    const rel =
      arm === REFERENCE || c.meanSag === 0
        ? '     —'
        : `${(((r.meanSag - c.meanSag) / c.meanSag) * 100).toFixed(1)}%`;
    lines.push(
      [
        size.padEnd(7),
        arm.padEnd(11),
        String(r.bandTriangles).padStart(8),
        r.maxSag.toFixed(3).padStart(7),
        r.meanSag.toFixed(3).padStart(8),
        rel.padStart(10),
        `${r.dividedParcels}/${r.coastalParcels}`.padStart(15),
        String(r.cappedParcels).padStart(7),
        r.leastScale.toFixed(1).padStart(6),
        String(r.insertedVertices).padStart(9),
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
lines.push('## are these actually different lands? — pixels between adjacent arms');
lines.push('');
lines.push('⚠ `authored vs beach` is expected to be ZERO and is the width axis\'s own finding: both');
lines.push('bands sit inside the vertex void, so the mesh delivers the bit-identical land and the two');
lines.push('committed PNGs are the same file. The ring columns are the ones this increment turns on.');
lines.push('');
lines.push('size    zoom  authored|beach   beach|shelf   beach|ring   ring|ring-pair   (pixels)');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    lines.push(
      [
        size.padEnd(7),
        String(zoom).padStart(4),
        String(between[size][zoom]['authored|beach']).padStart(15),
        String(between[size][zoom]['beach|shelf']).padStart(13),
        String(between[size][zoom]['beach|ring']).padStart(12),
        String(between[size][zoom]['ring|ring-pair']).padStart(16),
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
    const rings =
      ARM_RINGS[arm] === '-'
        ? 'no ring — the band has no vertex to bend through'
        : `rings at ${ARM_RINGS[arm]} units, sag ${r.meanSag.toFixed(3)} mean over ` +
          `${r.bandTriangles} band triangles`;
    lines.push(
      `${size.padEnd(7)} ${arm.padEnd(11)} band ${String(w).padStart(4)} units — ${verdict}; ` +
        `${rings}; ` +
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
