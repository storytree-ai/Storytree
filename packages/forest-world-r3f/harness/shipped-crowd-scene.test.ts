// shipped-crowd-scene.test.ts — the crowd page's own arithmetic, and the controls that make it a
// comparison rather than three unrelated pictures.
//
// ⚠ WHAT THIS FILE IS FOR. Every number the crowd driver publishes is computed in
// `shipped-crowd-scene.ts`; the driver is a `.mjs` shell that starts a browser and decides an exit
// code (`measurement-instrument-must-be-typechecked`). So the claims that make a run READABLE —
// the arms differ in one thing, the scenes differ in one thing, the camera does not move — are
// held here, where they can fail without a GPU.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SHADE_LEVELS, LEGACY_SHADE_LEVELS } from '../src/shade-ladder.js';
import { SHADOW_GRES } from '../src/land-shadow.js';
import {
  CROWD_ARMS,
  CROWD_SIZES,
  CROWD_ZOOMS,
  FIT_ZOOM,
  MONO_STATUS,
  buildCrowdScene,
  crowdCasters,
  crowdCells,
  crowdIslands,
  crowdPxPerUnit,
  crowdSize,
} from './shipped-crowd-scene.js';
import { litLadderOf, shippedCasters, shippedParcels } from './shipped-land-scene.js';

const ONE = crowdSize('one');
const MONO = crowdSize('forest-mono');
const REAL = crowdSize('forest');

// ---------------------------------------------------------------------------
// THE ARMS — the ladder axis, and it is imported rather than restated
// ---------------------------------------------------------------------------

test('the two arms are the shipped ladder and the one it replaced, reached through litLadderOf', () => {
  assert.deepEqual([...CROWD_ARMS], ['shadow', 'dense']);
  // ⚠ THE LOAD-BEARING PAIR. `dense` is the map as it ships; `shadow` is what it wore until
  // 2026-08-31. Read through `litLadderOf` so this page and the one-island page cannot end up
  // measuring two different things under one arm name.
  assert.equal(litLadderOf('dense'), SHADE_LEVELS, 'dense must BE the shipped ladder, not a copy');
  assert.equal(litLadderOf('shadow'), LEGACY_SHADE_LEVELS, 'shadow must BE the legacy ladder');
  assert.ok(
    SHADE_LEVELS.length > LEGACY_SHADE_LEVELS.length,
    'the comparison is only interesting because the adopted ladder is the longer one',
  );
});

test('the arms differ in the ladder and in NOTHING else', () => {
  for (const size of CROWD_SIZES) {
    const a = buildCrowdScene('shadow', size, 2);
    const b = buildCrowdScene('dense', size, 2);
    for (const field of ['triangles', 'parcels', 'islands', 'statusRows', 'casters', 'shadowW', 'shadowH', 'width', 'height', 'pxPerUnit'] as const) {
      assert.equal(
        a[field],
        b[field],
        `at size ${size.id} the arms disagree about ${field} — they must differ in the ladder alone`,
      );
    }
    assert.equal(
      a.occlusionCoverage,
      b.occlusionCoverage,
      `at size ${size.id} the arms carry different occlusion fields`,
    );
  }
});

// ---------------------------------------------------------------------------
// THE SCENES — each differs from its neighbour in exactly one thing
// ---------------------------------------------------------------------------

test('one → forest-mono is PURELY the extra geometry: same status spread, 35x the parcels', () => {
  const one = buildCrowdScene('dense', ONE, 2);
  const mono = buildCrowdScene('dense', MONO, 2);
  assert.equal(one.statusRows, 1);
  assert.equal(mono.statusRows, 1, 'the mono crowd must wear ONE status, or it is not the control');
  assert.equal(mono.parcels, one.parcels * MONO.islands);
  assert.equal(mono.triangles, one.triangles * MONO.islands);
});

test('forest-mono → forest is PURELY the status spread: identical geometry, six rows instead of one', () => {
  const mono = buildCrowdScene('dense', MONO, 2);
  const real = buildCrowdScene('dense', REAL, 2);
  assert.equal(real.triangles, mono.triangles, 'the two crowds must stand on the same geometry');
  assert.equal(real.parcels, mono.parcels);
  assert.equal(real.islands, mono.islands);
  assert.ok(
    real.statusRows > mono.statusRows,
    'the real forest must carry more ramp rows than the mono one — that difference IS the arm',
  );
  // Six statuses is the schema (`packages/forest-world/src/scene.ts`), and the crowd population
  // spans all of them. A crowd that quietly held fewer would under-exercise the material's
  // selection chain, which is the mechanism this scene exists to test.
  assert.equal(real.statusRows, 6, 'the real forest spans every status the map can draw');
});

test('the geometry is byte-for-byte identical between the mono and real crowds', () => {
  // ⚠ NOT AN ASSERTION ABOUT COUNTS — about the BUFFER. `forest-mono` is only a control if the
  // vertices really are in the same places; equal triangle counts would also be satisfied by two
  // different forests of the same size.
  const monoCells = crowdCells(MONO);
  const realCells = crowdCells(REAL);
  assert.equal(monoCells.length, realCells.length);
  for (let i = 0; i < monoCells.length; i += 1) {
    const m = monoCells[i]!;
    const r = realCells[i]!;
    assert.deepEqual(m.points, r.points, `parcel ${i} stands somewhere else in the two crowds`);
  }
});

test('every island wears ONE status, and the mono crowd wears the single-island scene\'s own', () => {
  assert.equal(
    MONO_STATUS,
    shippedParcels()[0]?.material,
    'the mono status must be READ off the shipped fixture, never transcribed',
  );
  const monoStatuses = new Set(crowdCells(MONO).map((c) => c.material));
  assert.deepEqual([...monoStatuses], [MONO_STATUS]);

  const perIsland = new Map<number, Set<string | undefined>>();
  const base = shippedParcels().length;
  crowdCells(REAL).forEach((cell, i) => {
    const island = Math.floor(i / base);
    const seen = perIsland.get(island) ?? new Set();
    seen.add(cell.material);
    perIsland.set(island, seen);
  });
  for (const [island, seen] of perIsland) {
    assert.equal(seen.size, 1, `island ${island} wears ${seen.size} statuses — the shipped mapper folds a territory to one`);
  }
});

// ---------------------------------------------------------------------------
// THE CAMERA — it must not move between scenes, or a cost difference is a framing difference
// ---------------------------------------------------------------------------

test('every scene at a timed zoom shares one camera, so island count is the only thing moving', () => {
  for (const zoom of CROWD_ZOOMS) {
    const ref = buildCrowdScene('dense', ONE, zoom);
    for (const size of CROWD_SIZES) {
      for (const arm of CROWD_ARMS) {
        const s = buildCrowdScene(arm, size, zoom);
        assert.equal(s.width, ref.width, 'the buffer is the reader\'s screen and never changes');
        assert.equal(s.height, ref.height);
        assert.equal(s.pxPerUnit, zoom, 'a timed zoom IS its px/unit — no fitting, no derivation');
        assert.deepEqual(
          s.camera.projectionMatrix.toArray(),
          ref.camera.projectionMatrix.toArray(),
          `${arm}/${size.id} at zoom ${zoom} is framed differently from the control`,
        );
        assert.deepEqual(
          s.camera.matrixWorldInverse.toArray(),
          ref.camera.matrixWorldInverse.toArray(),
          `${arm}/${size.id} at zoom ${zoom} looks from somewhere else`,
        );
      }
    }
  }
});

test('the crowd is re-centred on one of its own islands, so every frame lands on land', () => {
  // The anchor island sits at the origin — the same place the single-island scene's island sits.
  const islands = crowdIslands(REAL);
  assert.ok(
    islands.some((i) => i.offset.x === 0 && i.offset.z === 0),
    'no island stands at the origin, so the 8 px/unit frame may be centred on open water and the ' +
      'three scenes would not be showing the same thing',
  );
  assert.equal(crowdIslands(ONE)[0]?.offset.x, 0);
  assert.equal(crowdIslands(ONE)[0]?.offset.z, 0);
});

test('the fit zoom is never one of the timed zooms', () => {
  // It delivers a different px/unit per scene by construction, so timing at it would compare three
  // different frames and call the difference the ladder's.
  // Compared as strings rather than through an assertion chain: `CROWD_ZOOMS` is numbers and
  // `FIT_ZOOM` is the literal 'fit', so `includes` cannot be asked directly — and casting to ask it
  // would discard exactly the type evidence that makes the two kinds of zoom distinguishable.
  assert.ok(CROWD_ZOOMS.every((z) => String(z) !== FIT_ZOOM));
  assert.ok(
    crowdPxPerUnit(REAL, FIT_ZOOM) < crowdPxPerUnit(ONE, FIT_ZOOM),
    'fitting a forest must zoom further out than fitting one island',
  );
});

// ---------------------------------------------------------------------------
// THE CASTERS AND THE OCCLUSION CLAMP — the branch nobody had ever drawn
// ---------------------------------------------------------------------------

test('every island brings its own casters, so no island wears the whole forest\'s shadows', () => {
  const casters = crowdCasters(REAL);
  assert.equal(casters.length, shippedCasters().length * REAL.islands);
  const places = new Set(casters.map((c) => `${c.x},${c.z}`));
  assert.equal(
    places.size,
    casters.length,
    'two casters at one place means the offsets were not applied and 35 islands\' shadows are ' +
      'stacked on one',
  );
});

test('the occlusion field hits the SHADOW_TEXTURE_MAX clamp at forest scale, and not on one island', () => {
  const one = buildCrowdScene('dense', ONE, 2);
  const forest = buildCrowdScene('dense', REAL, 2);
  assert.equal(
    one.shadowGres,
    SHADOW_GRES,
    'one island is small enough for the full sampling rate — if this ever fails, the committed ' +
      'single-island shadow evidence was taken at a resolution nobody recorded',
  );
  // ⚠ THE FINDING THIS PAGE IS THE FIRST TO EXERCISE. `src/land-shadow.ts:58-66` budgets for
  // "a forest of thirty-five islands spread over a thousand units square" and clamps the
  // RESOLUTION rather than refusing. That branch had never run. It runs here, and the page reports
  // what it costs instead of assuming the shadow survived it.
  assert.ok(
    forest.shadowGres < SHADOW_GRES,
    'the forest is supposed to be big enough to hit the texture cap — if it no longer is, this ' +
      'page has stopped testing the case it was built for',
  );
  assert.ok(
    Math.max(forest.shadowW, forest.shadowH) <= 2048,
    'the clamp exists to keep the field inside its budget',
  );
});
