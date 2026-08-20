// plant-geometry.test.ts — the generator's contract. The two load-bearing properties are
// the MATCHED FOOTPRINT (every claim in this experiment is a claim at a fixed on-screen
// size, so the fit must be mechanical) and UNIT NORMALS after a non-uniform scale (a
// banded material's rung boundaries are a direct function of the lambert, so a normal that
// is merely close would move a visible band and read as art).

import assert from 'node:assert/strict';
import test from 'node:test';

import { growPlant, spriteQuad, type PlantMesh, type PlantSpec } from './plant-geometry.js';

const BASE: PlantSpec = { seed: 1234, form: 'shrub', width: 6, height: 3, detail: 2 };

function bbox(m: PlantMesh): { w: number; h: number; d: number; minY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    minX = Math.min(minX, m.positions[i]!);
    maxX = Math.max(maxX, m.positions[i]!);
    minY = Math.min(minY, m.positions[i + 1]!);
    maxY = Math.max(maxY, m.positions[i + 1]!);
    minZ = Math.min(minZ, m.positions[i + 2]!);
    maxZ = Math.max(maxZ, m.positions[i + 2]!);
  }
  return { w: maxX - minX, h: maxY - minY, d: maxZ - minZ, minY };
}

test('MATCHED FOOTPRINT: a grown plant bounding box IS the requested footprint', () => {
  for (const form of ['blade', 'shrub', 'stem', 'flower', 'mixed'] as const) {
    for (const [w, h] of [
      [6, 3],
      [2, 4],
      [20, 3],
      [1, 1],
    ] as const) {
      const m = growPlant({ ...BASE, form, width: w, height: h });
      const b = bbox(m);
      assert.ok(
        Math.abs(b.w - w) < 1e-4,
        `${form} ${w}x${h}: width came out ${b.w.toFixed(4)} — the comparison would not be like-for-like`,
      );
      assert.ok(
        Math.abs(b.h - h) < 1e-4,
        `${form} ${w}x${h}: height came out ${b.h.toFixed(4)}`,
      );
    }
  }
});

test('a plant STANDS on y=0 — it does not float or sink', () => {
  for (const form of ['blade', 'shrub', 'stem', 'flower', 'mixed'] as const) {
    const b = bbox(growPlant({ ...BASE, form }));
    assert.ok(Math.abs(b.minY) < 1e-5, `${form} base sits at y=${b.minY}`);
  }
});

test('NORMALS ARE UNIT LENGTH after the non-uniform footprint fit', () => {
  // The fit scales x, y and z differently. A normal transformed by the plain scale would
  // be wrong AND non-unit; a normal transformed by the inverse-transpose and re-normalised
  // is right and unit. Only the second passes this, so it distinguishes the two.
  const m = growPlant({ ...BASE, width: 20, height: 2 });
  let worst = 0;
  for (let i = 0; i < m.normals.length; i += 3) {
    const l = Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!);
    worst = Math.max(worst, Math.abs(l - 1));
  }
  assert.ok(worst < 1e-5, `worst normal length deviates by ${worst} — the shading would be a lie`);
});

test('normals point OUTWARD — a sample of vertices agrees with its own radial direction', () => {
  // A flipped normal set still passes the unit-length check while lighting the plant
  // inside-out, so the direction needs its own instrument.
  const m = growPlant(BASE);
  const b = bbox(m);
  let agree = 0;
  let total = 0;
  for (let i = 0; i < m.positions.length; i += 3) {
    // radial direction from the plant's own vertical axis at its base centre
    const rx = m.positions[i]!;
    const ry = m.positions[i + 1]! - b.h / 2;
    const rz = m.positions[i + 2]!;
    const l = Math.hypot(rx, ry, rz);
    if (l < 1e-6) continue;
    const dot = (rx / l) * m.normals[i]! + (ry / l) * m.normals[i + 1]! + (rz / l) * m.normals[i + 2]!;
    if (dot > 0) agree++;
    total++;
  }
  assert.ok(
    agree / total > 0.75,
    `only ${((agree / total) * 100).toFixed(0)}% of normals point outward — the mesh lights inside-out`,
  );
});

test('DETERMINISM: the same seed grows a byte-identical plant', () => {
  const a = growPlant(BASE);
  const b = growPlant(BASE);
  assert.deepEqual([...a.positions], [...b.positions]);
  assert.deepEqual([...a.normals], [...b.normals]);
  assert.deepEqual([...a.indices], [...b.indices]);
});

test('a DIFFERENT seed grows a different plant — the generator is not a constant', () => {
  const a = growPlant(BASE);
  const b = growPlant({ ...BASE, seed: BASE.seed + 1 });
  assert.notDeepEqual([...a.positions], [...b.positions]);
  // ...but at the SAME footprint, because the fit is mechanical and the seed cannot escape it.
  assert.deepEqual(bbox(a).w.toFixed(4), bbox(b).w.toFixed(4));
  assert.deepEqual(bbox(a).h.toFixed(4), bbox(b).h.toFixed(4));
});

test('the DETAIL LADDER is the knob the sprite path never had: triangles rise ~4x a rung', () => {
  const counts = [0, 1, 2, 3].map((detail) => growPlant({ ...BASE, detail }).triangles);
  for (let i = 1; i < counts.length; i++) {
    const ratio = counts[i]! / counts[i - 1]!;
    assert.ok(
      Math.abs(ratio - 4) < 0.01,
      `detail ${i - 1}->${i} multiplied triangles by ${ratio.toFixed(2)}, expected 4 (geodesic subdivision)`,
    );
  }
  // and the FOOTPRINT is unmoved by the ladder — this is precisely what the 1x/2x/4x/8x
  // raster ladder could NOT do: that one scaled the same authored geometry, so no rung
  // authored new detail. Here the size is pinned and the geometry genuinely gains.
  const sizes = [0, 3].map((detail) => bbox(growPlant({ ...BASE, detail })));
  assert.ok(Math.abs(sizes[0]!.w - sizes[1]!.w) < 1e-4);
  assert.ok(Math.abs(sizes[0]!.h - sizes[1]!.h) < 1e-4);
});

test('detail is CLAMPED — a caller cannot ask for a mesh that blows the index buffer', () => {
  const huge = growPlant({ ...BASE, detail: 12 });
  assert.equal(huge.triangles, growPlant({ ...BASE, detail: 3 }).triangles);
  assert.ok(
    huge.positions.length / 3 < 65536,
    'the vertex count must stay addressable by the Uint16 index buffer',
  );
});

test('the SPRITE side of the comparison is one quad at the same footprint', () => {
  const q = spriteQuad(6, 3);
  assert.equal(q.triangles, 2, 'a sprite is a billboard: two triangles, and that is the point');
  const b = bbox(q);
  assert.ok(Math.abs(b.w - 6) < 1e-4 && Math.abs(b.h - 3) < 1e-4);
  assert.ok(Math.abs(b.minY) < 1e-5, 'the sprite stands on the ground like the mesh does');
});

test('the two sides of the comparison occupy the SAME footprint — the whole contract', () => {
  const live = bbox(growPlant({ ...BASE, width: 6, height: 3 }));
  const sprite = bbox(spriteQuad(6, 3));
  assert.ok(Math.abs(live.w - sprite.w) < 1e-4, 'the live plant is wider than the sprite');
  assert.ok(Math.abs(live.h - sprite.h) < 1e-4, 'the live plant is taller than the sprite');
});

test('indices address real vertices — no out-of-range triangle reaches the GPU', () => {
  const m = growPlant({ ...BASE, detail: 3 });
  const verts = m.positions.length / 3;
  assert.equal(m.normals.length, m.positions.length, 'one normal per position');
  for (const i of m.indices) {
    assert.ok(i < verts, `index ${i} is out of range for ${verts} vertices`);
  }
  assert.equal(m.indices.length % 3, 0, 'the index buffer is not whole triangles');
});

// --- the FOLIAGE silhouette (owner: the mound reads as "circular swirls") ----------------

test('FOLIAGE honours every contract the mound does — footprint, ground, unit normals', () => {
  // The point of the variant is that it changes the SILHOUETTE and nothing else. If it
  // quietly changed size it would be a different plant, and the comparison would be the
  // bigger-object error this arc has already had to correct once.
  for (const [w, h] of [[6, 3], [2, 4], [20, 3]] as const) {
    const m = growPlant({ ...BASE, style: 'foliage', width: w, height: h });
    const b = bbox(m);
    assert.ok(Math.abs(b.w - w) < 1e-4, `foliage ${w}x${h}: width came out ${b.w.toFixed(4)}`);
    assert.ok(Math.abs(b.h - h) < 1e-4, `foliage ${w}x${h}: height came out ${b.h.toFixed(4)}`);
    assert.ok(Math.abs(b.minY) < 1e-5, 'foliage must stand on y=0 like the mound does');
  }
  // Unit normals after a TILT plus a non-uniform fit is the case most likely to go wrong:
  // the lobe basis is orthonormal (so it needs no inverse-transpose) but the footprint fit
  // afterwards is not (so it does). Both corrections have to compose.
  const m = growPlant({ ...BASE, style: 'foliage', width: 20, height: 2 });
  let worst = 0;
  for (let i = 0; i < m.normals.length; i += 3) {
    worst = Math.max(worst, Math.abs(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!) - 1));
  }
  assert.ok(worst < 1e-5, `worst foliage normal deviates by ${worst} — the shading would be a lie`);
});

test('FOLIAGE is genuinely a different shape, not a relabelled mound', () => {
  const mound = growPlant({ ...BASE, style: 'mound' });
  const foliage = growPlant({ ...BASE, style: 'foliage' });
  assert.notDeepEqual([...mound.positions], [...foliage.positions]);
  assert.equal(mound.triangles, foliage.triangles, 'the two styles must cost the same to draw');
});

test('the two styles differ MEASURABLY in outline — reported, not adjudicated', () => {
  // WHAT THIS TEST DELIBERATELY DOES NOT DO. An earlier version asserted that foliage has a
  // ROUGHER outline than the mound, on the theory that tilted discs would step where stacked
  // spheres taper. It measured the opposite — foliage 0.178 against the mound's 0.279,
  // because the foliage lobes are broader and overlap more, so the profile fills in more
  // continuously.
  //
  // The right response was NOT to flip the inequality until it passed. "Does this look like
  // circular swirls" is an APPEARANCE question, and ADR-0070 puts appearance behind an
  // operator's eye rather than a machine's: a metric invented after the fact, tuned until it
  // agrees with the conclusion someone already wants, is not evidence — it is decoration
  // that reads as evidence. So this test asserts only what geometry can honestly carry: that
  // the two styles are genuinely different, and that the difference is stable across seeds.
  // The NUMBER is reported in the research README so a reader can see which way it went; the
  // verdict on the look belongs to the owner, on an island.
  const spanProfile = (m: ReturnType<typeof growPlant>): number[] => {
    const rows = 12;
    const b = bbox(m);
    const spans: number[] = [];
    for (let r = 0; r < rows; r++) {
      const lo = (r / rows) * b.h;
      const hi = ((r + 1) / rows) * b.h;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < m.positions.length; i += 3) {
        const y = m.positions[i + 1]!;
        if (y < lo || y > hi) continue;
        min = Math.min(min, m.positions[i]!);
        max = Math.max(max, m.positions[i]!);
      }
      spans.push(Number.isFinite(min) ? max - min : 0);
    }
    return spans;
  };
  const roughness = (spans: number[]): number => {
    let acc = 0;
    let n = 0;
    for (let i = 1; i + 1 < spans.length; i++) {
      acc += Math.abs(spans[i + 1]! - 2 * spans[i]! + spans[i - 1]!);
      n++;
    }
    const mean = spans.reduce((s, v) => s + v, 0) / spans.length || 1;
    return acc / n / mean;
  };

  const seeds = [11, 27, 43, 58, 71];
  const avg = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
  const mound = avg(seeds.map((seed) => roughness(spanProfile(growPlant({ ...BASE, seed, style: 'mound' })))));
  const foliage = avg(seeds.map((seed) => roughness(spanProfile(growPlant({ ...BASE, seed, style: 'foliage' })))));

  // Both are real outlines, not degenerate ones.
  assert.ok(mound > 0 && foliage > 0, 'an outline profile came back flat — the probe is broken');
  // They differ by a margin no reasonable noise explains, in EITHER direction. That is the
  // honest assertion: the styles are distinguishable, and which one a person prefers is not
  // a thing this file gets to decide.
  assert.ok(
    Math.abs(mound - foliage) / Math.max(mound, foliage) > 0.15,
    `the two styles' outlines differ by only ${(Math.abs(mound - foliage) / Math.max(mound, foliage) * 100).toFixed(1)}% ` +
      `(mound ${mound.toFixed(4)}, foliage ${foliage.toFixed(4)}) — too close to offer as a real alternative`,
  );
});

test('FOLIAGE is deterministic, and detail still multiplies triangles by four a rung', () => {
  assert.deepEqual(
    [...growPlant({ ...BASE, style: 'foliage' }).positions],
    [...growPlant({ ...BASE, style: 'foliage' }).positions],
  );
  const counts = [0, 1, 2, 3].map((detail) => growPlant({ ...BASE, style: 'foliage', detail }).triangles);
  for (let i = 1; i < counts.length; i++) {
    assert.ok(Math.abs(counts[i]! / counts[i - 1]! - 4) < 0.01, 'the ladder must hold for foliage too');
  }
});
