// rock-on-the-shipped-mesh.test.ts — WHERE LAYER 4 ACTUALLY LANDS, asked of the mesh the map
// draws rather than of a sampled field.
//
// ⚠⚠ THE SECOND, INDEPENDENT REASON ADR-0553's MECHANISM IS RIGHT, and it exists because that
// decision's own Consequences say what went wrong last time: a conclusion resting on ONE
// measurement is one instrument bug away from being wrong. `src/land-rock.test.ts` samples the
// relief field analytically and says the interior's up-component clears the ramp's ceiling. This
// file asks a different question of a different object — the vertices `cellGroundGeometry` emits
// for the shipped island, statuses and skirt and shore fall included — and must agree.
//
// ⚠ IT DECIDES NOTHING (ADR-0553 D2/D3). This unit's success is a picture the owner signs; a
// machine check may REPORT and gates nothing. What it fences is the STRUCTURE: rock at the steep
// coast, none across the interior grass.
//
// ⚠ THE GATE IS THE POINT OF THE FILTER. Layer 4 is multiplied by `grassGate`, so a vertex on an
// UNGATED row wears the skirt's own authored rock and not this layer at all — counting those would
// report a coverage the material never delivers. Only the painted rows are asked.

import assert from 'node:assert/strict';
import test from 'node:test';

import { GRASS_GATE_ROWS, WHEAT_GATE_ROWS, shippedGroundBuild } from '../src/ForestWorldCanvas.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { ROCK_SLOPE_RAMP, rockMask } from '../src/land-rock.js';
import { shippedParcels } from './shipped-land-scene.js';

/** Every painted ground vertex of the shipped island, as the up-component the rock mask reads —
 *  which is the GEOMETRIC normal, because that is what the mesh carries and what the material now
 *  captures before either bump. */
const paintedUps = (): readonly number[] => {
  // ⚠ `shippedParcels()` RATHER THAN A LOCAL FILTER: it is the typed predicate every other harness
  // page reaches for, so this file cannot end up asking about a different island from theirs. No
  // casters and no trail strips — neither reaches the ground's NORMALS, which is all this asks.
  const build = shippedGroundBuild(shippedParcels(), []);
  const geo = cellGroundGeometry(build.input);
  const painted = new Set<number>([...GRASS_GATE_ROWS, ...WHEAT_GATE_ROWS]);
  const ups: number[] = [];
  for (let v = 0; v < geo.statuses.length; v++) {
    if (painted.has(geo.statuses[v] ?? -1)) ups.push(geo.normals[v * 3 + 1] ?? 0);
  }
  return ups;
};

test('ON THE SHIPPED MESH the rock is at the coast and nowhere on the interior grass', () => {
  const ups = paintedUps();
  // Non-vacuity first: a filter that matched nothing would satisfy every claim below.
  assert.ok(ups.length > 1000, `only ${ups.length} painted ground vertices — the filter matched nothing`);

  const [lo, hi] = ROCK_SLOPE_RAMP;
  // ⚠ THE INTERIOR IS DEFINED BY THE MESH, NOT BY A RADIUS: a vertex whose up-component is at or
  // above the ramp's ceiling is ground the recipe calls flat. Every one of them must be bare.
  const flat = ups.filter((u) => u >= hi);
  assert.ok(flat.length > 0, 'the island has flat ground at all');
  for (const u of flat) assert.equal(rockMask(u, lo, hi), 0);

  // ⚠ AND THE COAST STILL WEARS IT, which is the half a fix that simply deleted the layer would
  // also pass. The island's walls are near-vertical, so they sit far below `lo` and clamp to a
  // full 1 — that is the "present at the steep coast" of ADR-0553 D1.
  const steep = ups.filter((u) => u < lo);
  assert.ok(steep.length > 0.2 * ups.length, `only ${steep.length} of ${ups.length} painted vertices are coast-steep`);
  for (const u of steep) assert.equal(rockMask(u, lo, hi), 1);

  // ⚠ AND THE BAND BETWEEN IS THE SHORE FALL, which is the one place the ramp is doing ramp work
  // rather than clamping. Measured on the fixture island 2026-09-08: 4.71% of painted vertices.
  const band = ups.filter((u) => u >= lo && u < hi);
  assert.ok(band.length > 0, 'the shore fall must land inside the ramp, or the ends are decorative');
  for (const u of band) {
    const m = rockMask(u, lo, hi);
    assert.ok(m > 0 && m < 1, `${u} should be a partial mask, got ${m}`);
  }
});
