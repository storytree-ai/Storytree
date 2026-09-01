// shore-atlas.test.ts — the distance-to-coast field, packed over the occlusion atlas's own tiles.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAtlasOcclusion } from './shadow-atlas.js';
import { AUTHORED_SHORE_WIDTH, shoreField } from './shore-fall.js';
import { SHADOW_GRES } from './land-shadow.js';
import {
  SAND_FIELD_WIDTH,
  buildAtlasShore,
  decodeShore,
  encodeShore,
  shoreSampleSpacing,
} from './shore-atlas.js';
import type { InstanceDescriptor } from './world-to-3d.js';

/** One square island, `size` units on a side, with a ring — `shoreField` refuses a ringless
 *  descriptor, so the ring is not decoration here. */
function island(id: string, x: number, z: number, size: number): InstanceDescriptor {
  return {
    kind: 'cell-ground',
    group: 'cell-ground',
    island: id,
    transform: { x: x + size / 2, y: 0, z: z + size / 2 },
    points: [
      { x, y: 0, z },
      { x: x + size, y: 0, z },
      { x: x + size, y: 0, z: z + size },
      { x, y: 0, z: z + size },
    ],
  };
}

const TWO: InstanceDescriptor[] = [island('isle-a', 0, 0, 40), island('isle-b', 400, 0, 40)];
const OCC = buildAtlasOcclusion({ cells: TWO, relief: 2.2, casters: [] });

/** ⚠ ISLANDS OF DELIBERATELY DIFFERENT SIZES, because the shelf packer leaves NO padding when they
 *  are equal — measured, {@link TWO} packs to 264x132 with zero uncovered texels. The `data.fill`
 *  that makes an unwritten texel read as grass is therefore untestable on the even fixture, which
 *  is exactly why `check:mutation-diff` could delete it and stay green. This layout leaves 17,802
 *  padding texels. */
const RAGGED: InstanceDescriptor[] = [
  island('isle-a', 0, 0, 40),
  island('isle-b', 400, 0, 17),
  island('isle-c', 800, 0, 63),
];
const RAGGED_OCC = buildAtlasOcclusion({ cells: RAGGED, relief: 2.2, casters: [] });

test('the field width is DERIVED from the recipe`s own divisor, not chosen', () => {
  // `build_land.py:880` divides by BEACH + 0.9, and BEACH is what `shore-fall.ts` already
  // transcribed as AUTHORED_SHORE_WIDTH. A literal here would be a second copy of a constant the
  // repo already holds — and one that could drift from the divisor the shader uses.
  assert.equal(SAND_FIELD_WIDTH, AUTHORED_SHORE_WIDTH + 0.9);
  assert.equal(AUTHORED_SHORE_WIDTH, 3.1);
  // ⚠ AND IT MUST EXCEED THE RAMP'S TOP STOP TIMES THE DIVISOR — 0.70 * 4.0 = 2.8 — with room for
  // the 0..1 noise the recipe adds BEFORE dividing. Capping at 2.8 would clip exactly the
  // break-up the noise exists to create, and it would show as a sand line going subtly straight.
  // The ramp's top stop is 0.70 of the divisor, and the noise the recipe adds before dividing
  // spans a full 1.0 unit — so the field has to reach at least that far past the ramp's top.
  const rampTopDistance = 0.7 * SAND_FIELD_WIDTH;
  const edgeNoiseSpan = 1.0;
  assert.ok(
    SAND_FIELD_WIDTH - rampTopDistance >= edgeNoiseSpan,
    `the field reaches ${SAND_FIELD_WIDTH} but the ramp tops out at ${rampTopDistance} — ` +
      'less than the edge noise can displace, so the break-up would be clipped',
  );
});

test('THE ADR-0490 D4 CLAIM: the field is FINER than the grid Blender authored against', () => {
  // The whole reason this is a texture and not a vertex attribute. Blender's `shore` attribute is
  // per-vertex on a 0.55-unit grid; the shipped mesh's ground vertices are >= 8.66 units apart, so
  // a vertex attribute smears the band away. This field's spacing is what replaces it, and the
  // claim is only worth making if it is actually finer.
  assert.ok(
    shoreSampleSpacing() < 0.55,
    `field spacing ${shoreSampleSpacing()} is coarser than Blender's 0.55 — the carrier is not a fix`,
  );
  assert.equal(shoreSampleSpacing(), 1 / SHADOW_GRES);
});

test('the byte encoding round-trips inside its own step, and clamps at both ends', () => {
  const step = SAND_FIELD_WIDTH / 255;
  for (const d of [0, 0.4, 1.55, 2.8, SAND_FIELD_WIDTH]) {
    assert.ok(
      Math.abs(decodeShore(encodeShore(d)) - d) <= step,
      `${d} did not round-trip within one quantiser step`,
    );
  }
  // ⚠ BOTH CLAMPS, and the low one is the one that matters: a negative distance cannot arise
  // today, but an unclamped encode would wrap it to a LARGE byte — reading as "far inland" — so
  // the failure would be sand missing from the one place it is certainly meant to be.
  assert.equal(encodeShore(-1), 0);
  assert.equal(encodeShore(SAND_FIELD_WIDTH * 2), 255);
  assert.equal(encodeShore(0), 0);
});

test('the shore atlas rides the OCCLUSION atlas`s tiles — structurally, not by agreement', () => {
  const shore = buildAtlasShore(TWO, OCC);
  // Same dimensions, same resolution, and the SAME tile objects — so the mesh's one
  // `atlasOrigin` attribute and the material's one `uShadowAtlasScale` address both textures.
  assert.equal(shore.w, OCC.w);
  assert.equal(shore.h, OCC.h);
  assert.equal(shore.gres, OCC.gres);
  assert.equal(shore.tiles, OCC.tiles, 'the tiles must be the occlusion atlas`s own, not a copy');
  assert.equal(shore.data.length, OCC.data.length);
});

test('⚠ AN UNWRITTEN TEXEL READS AS GRASS, NOT AS SAND', () => {
  // ⚠⚠ THE FAILURE THIS PREVENTS IS VISIBLE AND WRONG. Zero encodes distance ZERO — the
  // waterline — so an atlas left zero-filled would deliver PURE SAND everywhere no tile was
  // written: every gap between tiles, and every island the loop missed, as a sand-coloured
  // rectangle in the sea. 255 is "far inland", which makes an unwritten texel deliver exactly what
  // the ground drew before this layer existed.
  //
  // ⚠⚠ AND THE FIRST VERSION OF THIS TEST WAS VACUOUS — `check:mutation-diff` deleted the
  // `data.fill(255)` outright and it stayed green. It sampled the atlas's LAST texel, assuming
  // that was padding; on this layout it falls inside a tile and is written either way. The check
  // has to find the padding rather than guess where it is, so it derives the uncovered set.
  const shore = buildAtlasShore(RAGGED, RAGGED_OCC);
  const covered = new Uint8Array(shore.data.length);
  for (const tile of shore.tiles) {
    for (let j = 0; j < tile.h; j += 1) {
      for (let i = 0; i < tile.w; i += 1) covered[(tile.y + j) * shore.w + (tile.x + i)] = 1;
    }
  }
  const padding: number[] = [];
  for (let n = 0; n < shore.data.length; n += 1) if (covered[n] === 0) padding.push(n);
  // The precondition is ASSERTED, not assumed: a layout with no padding could not test the fill.
  assert.ok(padding.length > 0, 'this layout has no padding — the fill cannot be tested on it');
  for (const n of padding) {
    assert.equal(shore.data[n], 255, `padding texel ${n} is not far-inland grass`);
  }
  // And the claim is not vacuous the other way either: the field genuinely reaches 0 somewhere.
  assert.ok(shore.data.some((v) => v === 0), 'no texel is on the waterline — the field is empty');
});

test('⚠ each texel samples its OWN corner — the grid mapping is pinned, not assumed', () => {
  // ⚠⚠ `check:mutation-diff` flipped `minX + i / gres` to `minX - i / gres` and `i / gres` to
  // `i * gres`, and every other test here survived both: the field still had a waterline, still
  // had a capped interior, still rose inland. A mirrored or scaled sample grid produces a
  // perfectly plausible field for the WRONG PLACE — the beach would trace a coastline the island
  // does not have, which is the one failure a picture would not obviously reveal.
  //
  // So the mapping is checked against the reader directly: the texel at (i, j) must decode to what
  // `shoreField` reports at exactly `bounds.min + index / gres`.
  const shore = buildAtlasShore(TWO, OCC);
  const reader = shoreField(TWO, SAND_FIELD_WIDTH);
  const tile = shore.tiles.find((t) => t.island === 'isle-a')!;
  // ⚠⚠ THE WHOLE TILE, NOT A HANDFUL OF PROBES. Five sample points did NOT kill `i * gres`: at a
  // 3-samples-per-unit grid the mis-scaled coordinates mostly land deep inside the island where
  // the distance is CAPPED, so both mappings decode to 255 and the comparison passes. A sparse
  // probe set on a field that is constant over most of its area proves almost nothing — sweeping
  // the tile puts the shore band itself under the assertion, which is the only part that varies.
  const distinct = new Set<number>();
  for (let j = 0; j < tile.h; j += 1) {
    for (let i = 0; i < tile.w; i += 1) {
      const texel = shore.data[(tile.y + j) * shore.w + (tile.x + i)]!;
      const expected = encodeShore(
        reader.sample(tile.bounds.minX + i / shore.gres, tile.bounds.minZ + j / shore.gres).distance,
      );
      assert.equal(texel, expected, `texel (${i}, ${j}) does not sample its own corner`);
      distinct.add(texel);
    }
  }
  // ⚠ AND THE SWEEP MUST SEE A FIELD THAT ACTUALLY VARIES, or it is a long way of comparing 255 to
  // 255. The band is the part that discriminates between two mappings, so it has to be in here.
  assert.ok(distinct.size > 8, `the tile holds only ${distinct.size} distinct values — no band`);
  assert.ok(distinct.has(0) && distinct.has(255), 'the sweep must span waterline to capped interior');
});

test('the field reads ZERO at the coast and rises inland', () => {
  const shore = buildAtlasShore(TWO, OCC);
  const tile = shore.tiles.find((t) => t.island === 'isle-a')!;
  const at = (i: number, j: number): number => decodeShore(shore.data[(tile.y + j) * shore.w + (tile.x + i)]!);
  // Walk inward along one row from the tile's own left edge. The island's rim sits inside the
  // tile's padded bounds, so the first samples are outside the land (distance capped) and the
  // distance must be NON-DECREASING as we cross the rim and head for the middle.
  const mid = Math.floor(tile.h / 2);
  const centre = at(Math.floor(tile.w / 2), mid);
  // The centre of a 40-unit island is 20 units from its rim, far past the 4.0 cap.
  assert.equal(centre, SAND_FIELD_WIDTH, 'the island`s middle must be capped at the field width');
  // And somewhere along that row the field is strictly between the two, i.e. it is a BAND rather
  // than a step — which is what the sand ramp needs in order to have anything to ramp across.
  const row = Array.from({ length: tile.w }, (_, i) => at(i, mid));
  assert.ok(
    row.some((d) => d > 0 && d < SAND_FIELD_WIDTH),
    'the field is a step, not a band — nothing for the sand ramp to resolve',
  );
});

test('every island gets its OWN coast, not the nearest one on the map', () => {
  // Two islands 400 units apart. If the packing and the sampling disagreed about which tile is
  // whose, island B's tile would carry island A's distances — and the sand would trace a coast
  // that is not there. Both tiles must independently contain a waterline and a capped interior.
  const shore = buildAtlasShore(TWO, OCC);
  for (const id of ['isle-a', 'isle-b']) {
    const tile = shore.tiles.find((t) => t.island === id)!;
    const vals: number[] = [];
    for (let j = 0; j < tile.h; j += 1) {
      for (let i = 0; i < tile.w; i += 1) vals.push(shore.data[(tile.y + j) * shore.w + (tile.x + i)]!);
    }
    assert.ok(vals.includes(0), `${id} has no waterline in its own tile`);
    assert.ok(vals.includes(255), `${id} has no capped interior in its own tile`);
  }
});
