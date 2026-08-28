// land-art-coverage.test.ts — every coverage refusal, fired.
//
// The rung this belongs to exists because an instrument nothing runs cannot fail a build. This
// suite exists because a rung that runs and checks nothing is the same problem wearing a green tick,
// which is the fault class this project has caught five times in two days.
//
// ⚠ THE FIXTURE IS A REAL RUN, NOT AN INVENTED ONE. Every figure below came out of
// `.capture-scratch/land-art/*/capture-report.json` on this branch, one `capture.mjs` run per page
// against the live harness:
//
//   grain.html        opaque 5,242,624   exempt 2,621,312   continuous 4   prop islands  0
//   island.html       opaque 29,085,906  exempt         0   continuous 0   prop islands  7
//   directions.html   opaque    987,118  exempt         0   continuous 0   prop islands 10
//
// An expectation invented for the test would pass against a declaration that had drifted away from
// what the pages actually deliver — the "an expectation derived from its subject cannot fail" shape.
// Using the real run means the PASSING cases below also assert that `LAND_ART_PAGES`'s floors are
// still satisfiable by the real harness, so a floor raised above what a page can deliver reds here
// rather than in a browser run twenty minutes later.
//
// ⚠ AND THE AUTOMATIC MUTATION RUNG DOES NOT COVER THIS FILE. `pnpm gate`'s `check:mutation-diff`
// skips `harness/**` — the harness sits outside any workspace project's `src/`, so it reports
// NOTHING TO MUTATE. The mutation evidence for the rung as a whole is hand-run and recorded in
// `docs/research/chapter2-land-art-rung-2026-08-28/README.md`, not produced by the gate.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAND_ART_PAGES,
  type CaptureCoverage,
  type PageCoverage,
  checkDeclarationCoverage,
  checkPageCoverage,
  readCoverage,
} from './land-art-coverage.js';

/**
 * The three pages as they actually measured on this branch.
 *
 * `satisfies` rather than an annotation: the annotation widened the key type to `string`, which
 * throws away the fact that these are exactly the three pages the rung drives — so a page renamed in
 * `LAND_ART_PAGES` but not here would have type-checked cleanly and asserted nothing.
 */
const MEASURED = {
  'grain.html': {
    opaquePixels: 5_242_624,
    exemptFromPaletteOpaquePixels: 2_621_312,
    continuousChecked: 4,
    propIslandsWithProps: 0,
  },
  'island.html': {
    opaquePixels: 29_085_906,
    exemptFromPaletteOpaquePixels: 0,
    continuousChecked: 0,
    propIslandsWithProps: 7,
  },
  'directions.html': {
    opaquePixels: 987_118,
    exemptFromPaletteOpaquePixels: 0,
    continuousChecked: 0,
    propIslandsWithProps: 10,
  },
} satisfies Record<string, CaptureCoverage>;

/** Exactly the pages this fixture carries — see `MEASURED`. */
type MeasuredPage = keyof typeof MEASURED;

const MEASURED_PAGES = Object.keys(MEASURED) as MeasuredPage[];

function declared(page: string): PageCoverage {
  const d = LAND_ART_PAGES.find((p) => p.page === page);
  assert.ok(d, `LAND_ART_PAGES no longer declares ${page}, so this fixture asserts nothing`);
  return d;
}

// ── THE REAL RUN CLEARS THE REAL DECLARATION ────────────────────────────────────────────────

test('every declared page is satisfied by what it actually delivered', () => {
  for (const page of MEASURED_PAGES) {
    const faults = checkPageCoverage(declared(page), MEASURED[page]);
    assert.deepEqual(faults, [], `${page} should clear its own measured delivery`);
  }
});

test('the declared set covers all three parts of ADR-0418 D4', () => {
  assert.deepEqual(checkDeclarationCoverage(), []);
});

// ── EACH COVERAGE DIMENSION REFUSES ─────────────────────────────────────────────────────────
//
// One test per dimension, each mutating the REAL delivery rather than a synthetic one, so a
// dimension that silently stopped being computed takes its own test down with it.

test('a page whose colour-spread band judged fewer continuous canvases is refused', () => {
  const faults = checkPageCoverage(declared('grain.html'), {
    ...MEASURED['grain.html'],
    continuousChecked: 3,
  });
  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.dimension, 'continuous');
  assert.equal(faults[0]!.delivered, 3);
  assert.equal(faults[0]!.declared, 4);
});

test('a page whose continuous canvases vanished entirely is refused, not skipped', () => {
  // The distinction that matters: `capture.mjs` prints "NO CONTINUOUS CANVASES ON THIS PAGE — the
  // band checked nothing" and exits 0. Zero is the value a lost declaration produces, so it must be
  // the loudest failure here, never the quietest.
  const faults = checkPageCoverage(declared('grain.html'), {
    ...MEASURED['grain.html'],
    continuousChecked: 0,
  });
  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.dimension, 'continuous');
});

test('a page that verified fewer prop islands than it declares is refused', () => {
  const faults = checkPageCoverage(declared('island.html'), {
    ...MEASURED['island.html'],
    propIslandsWithProps: 6,
  });
  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.dimension, 'props');
});

test('a page whose pixels were all exempted from the palette closure is refused', () => {
  // THE HOLE `capture.mjs` DOES NOT COVER. The exemption is granted by declaration and by nothing
  // else, which is right and is proved by PR #1673's mutation M4. But nothing downstream floors what
  // is LEFT. Exempt the whole page and capture prints "PALETTE CLOSED ON THE GPU (…N px exempt by
  // declaration)" and exits 0, having closed a palette over zero pixels.
  const all = MEASURED['island.html'].opaquePixels;
  const faults = checkPageCoverage(declared('island.html'), {
    ...MEASURED['island.html'],
    exemptFromPaletteOpaquePixels: all,
  });
  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.dimension, 'palette-held');
  assert.equal(faults[0]!.delivered, 0);
});

test('several dimensions failing at once are all reported, not just the first', () => {
  const faults = checkPageCoverage(declared('island.html'), {
    opaquePixels: 29_085_906,
    exemptFromPaletteOpaquePixels: 29_085_906,
    continuousChecked: 0,
    propIslandsWithProps: 0,
  });
  assert.deepEqual(new Set(faults.map((f) => f.dimension)), new Set(['props', 'palette-held']));
});

// ── THE DECLARATION SET ITSELF REFUSES ──────────────────────────────────────────────────────
//
// The half that no per-page check can reach: the pages all pass, and the SET stopped covering a
// part of D4. Every case here is a set on which the three real pages would each individually pass.

test('a set with no continuous page is refused — the replaced fence would judge nothing', () => {
  const withoutGrain = LAND_ART_PAGES.filter((p) => p.minContinuousChecked === 0);
  const faults = checkDeclarationCoverage(withoutGrain);
  assert.equal(faults.length, 1);
  assert.match(faults[0]!.half, /part 2/);
});

test('a set with no prop page is refused — a prop that stopped drawing would pass', () => {
  const withoutProps = LAND_ART_PAGES.filter((p) => p.minPropIslands === 0);
  const faults = checkDeclarationCoverage(withoutProps);
  assert.equal(faults.length, 1);
  assert.match(faults[0]!.half, /part 1/);
});

test('a set that holds too few pixels to the palette closure is refused', () => {
  const thin: PageCoverage[] = [
    { ...declared('grain.html'), minPaletteHeldPixels: 10 },
    { ...declared('island.html'), minPaletteHeldPixels: 10 },
  ];
  const faults = checkDeclarationCoverage(thin);
  assert.equal(faults.length, 1);
  assert.match(faults[0]!.half, /palette closure/);
});

test('an empty set is refused rather than trivially satisfied', () => {
  const faults = checkDeclarationCoverage([]);
  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.half, 'all');
});

// ── THE READER FAILS CLOSED ─────────────────────────────────────────────────────────────────
//
// `moving-a-write-target-makes-old-readers-vacuously-green`: a reader whose field moved starts
// asserting over nothing and passes forever. Every case here would be a silent PASS under `?? 0`
// for the two count fields, and a silent pass under `?? 0` for the exemption field too — because
// zero exemption is the GENEROUS reading of `palette-held`.

test('a report missing a coverage field is refused, never defaulted', () => {
  const full = {
    palette: { opaquePixels: 1 },
    colourSpread: { exemptFromPaletteOpaquePixels: 0, continuousChecked: 4 },
    propPresence: { islandsWithProps: 7 },
  };
  assert.deepEqual(readCoverage(full), {
    opaquePixels: 1,
    exemptFromPaletteOpaquePixels: 0,
    continuousChecked: 4,
    propIslandsWithProps: 7,
  });

  for (const [section, field] of [
    ['palette', 'opaquePixels'],
    ['colourSpread', 'exemptFromPaletteOpaquePixels'],
    ['colourSpread', 'continuousChecked'],
    ['propPresence', 'islandsWithProps'],
  ] as const) {
    const broken = JSON.parse(JSON.stringify(full)) as Record<string, Record<string, unknown>>;
    delete broken[section]![field];
    assert.throws(
      () => readCoverage(broken),
      new RegExp(field),
      `renaming ${section}.${field} must red the rung, not default it`,
    );
  }
});

test('a report that is not an object at all is refused', () => {
  assert.throws(() => readCoverage(null));
  assert.throws(() => readCoverage(undefined));
});

// ── THE DECLARATION IS STRUCTURAL, NOT A SHAVED MEASUREMENT ─────────────────────────────────

test('no floor is set above what its page actually delivers', () => {
  // The failure this catches is a floor nudged up to "just under the measured value", which is the
  // picked-number fault wearing a coverage hat: it reds on the first legitimate variation and gets
  // lowered again until it means nothing. A floor must be what the page is BUILT to contain.
  for (const page of MEASURED_PAGES) {
    const d = declared(page);
    const m = MEASURED[page];
    assert.ok(d.minContinuousChecked <= m.continuousChecked);
    assert.ok(d.minPropIslands <= m.propIslandsWithProps);
    assert.ok(d.minPaletteHeldPixels <= m.opaquePixels - m.exemptFromPaletteOpaquePixels);
  }
});
