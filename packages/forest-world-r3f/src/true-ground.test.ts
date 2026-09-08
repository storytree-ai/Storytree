// true-ground.test.ts — the one-way legacy adapter from a 2D drawing to true ground.
//
// ⚠ IT HAD NO TESTS OF ITS OWN WHILE IT LIVED IN `harness/`, and that was survivable there because
// nothing shipped depended on it. It does now (the studio's land view), so the properties are
// asserted here in its new home rather than inferred from the pictures its callers produce —
// `check:mutation-diff` mutates a project's `src/` only, so a harness exercise of these lines
// would buy nothing.
//
// THE PROPERTY, stated once: this is the INVERSE of `projectGround` about the ORIGIN, applied to
// the ground plane alone. So the sharpest assertion available is a ROUND TRIP against the land's
// own projection — project a known true-ground world down to a drawing with the shared function,
// convert it back with this one, and require the original.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAND_CAMERA_ELEVATION_DEG,
  PLAN_VIEW_ELEVATION_DEG,
  groundFlattening,
  projectGround,
  type SceneG,
} from '@storytree/forest-world';

import { LAND_AREA_PER_CAPABILITY } from './land-per-capability.js';
import { landStreamFromDrawing, trueGroundFromDrawing } from './true-ground.js';
import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';

/** A parcel whose ring is the four points given, in the DRAWING's coordinates. */
function drawnCell(ring: readonly (readonly [number, number])[]): InstanceDescriptor {
  return {
    kind: 'cell-ground',
    transform: { x: 0, y: 0, z: 0 },
    group: 'cell-ground',
    material: 'healthy',
    island: 'a',
    points: ring.map(([x, z]) => ({ x, y: 0, z })),
  };
}

test('the ROUND TRIP against the land’s own projection is exact', () => {
  // A true-ground square, projected to a drawing by the function the 2D map projects with, then
  // brought back by this one. Anything but the inverse fails here, and it fails for a reason a
  // reader can name rather than against a remembered constant.
  const trueGround: readonly (readonly [number, number])[] = [
    [-30, -40],
    [30, -40],
    [30, 40],
    [-30, 40],
  ];
  const drawing = drawnCell(trueGround.map(([x, z]) => {
    const p = projectGround({ x, y: z });
    return [p.x, p.y] as const;
  }));
  const [recovered] = trueGroundFromDrawing([drawing]);
  assert.ok(recovered !== undefined);
  const got = recovered.points ?? [];
  assert.equal(got.length, trueGround.length);
  for (const [i, [x, z]] of trueGround.entries()) {
    assert.ok(Math.abs(got[i]!.x - x) < 1e-9, `x[${i}] ${got[i]!.x}`);
    assert.ok(Math.abs(got[i]!.z - z) < 1e-9, `z[${i}] ${got[i]!.z}`);
  }
  // ⚠ NON-VACUITY: the drawing really was squashed, or the round trip above proves nothing.
  const drawnDepth = Math.abs((drawing.points![2]!).z - (drawing.points![0]!).z);
  assert.ok(Math.abs(drawnDepth - 80 * groundFlattening(LAND_CAMERA_ELEVATION_DEG)) < 1e-9);
  assert.ok(drawnDepth < 80);
});

test('only ground DEPTH moves — x and the upright axis are untouched', () => {
  const cell = drawnCell([
    [10, 4],
    [70, 4],
    [70, 20],
    [10, 20],
  ]);
  const lifted: InstanceDescriptor = { ...cell, transform: { x: 40, y: 7, z: 12 } };
  const [out] = trueGroundFromDrawing([lifted]);
  assert.ok(out !== undefined);
  assert.equal(out.transform.x, 40);
  assert.equal(out.transform.y, 7, 'y is upright, and un-projecting the GROUND never touches it');
  const factor = 1 / groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  assert.ok(Math.abs(out.transform.z - 12 * factor) < 1e-9);
  for (const [i, p] of (out.points ?? []).entries()) {
    assert.equal(p.x, cell.points![i]!.x);
    assert.ok(Math.abs(p.z - cell.points![i]!.z * factor) < 1e-9);
  }
});

test('a cave’s BEARING turns with its rim, rather than riding through unchanged', () => {
  const cave: InstanceDescriptor = {
    kind: 'cave-arch',
    transform: { x: 0, y: 0, z: 0 },
    group: 'cave-arch',
    island: 'a',
    bearing: Math.PI / 4,
    width: 8,
  };
  const [out] = trueGroundFromDrawing([cave]);
  assert.ok(out !== undefined);
  // Stretching z about the origin swings a 45° rim normal TOWARD the x axis: the normal is
  // `(cos b, sin b / factor)` and the factor is ~2.9, so the angle shrinks. Derived, not recalled.
  const factor = 1 / groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const want = Math.atan2(Math.sin(Math.PI / 4) / factor, Math.cos(Math.PI / 4));
  assert.ok(Math.abs((out.bearing ?? 0) - want) < 1e-9, `bearing ${out.bearing}`);
  assert.ok((out.bearing ?? 0) < Math.PI / 4, 'the rim turned, and in the direction the stretch implies');
});

test('a bearing-less or point-like descriptor gains neither a bearing nor a ring', () => {
  const wisp: InstanceDescriptor = {
    kind: 'wisp-sprite',
    transform: { x: 3, y: 0, z: 9 },
    group: 'wisp-sprite',
  };
  const [out] = trueGroundFromDrawing([wisp]);
  assert.ok(out !== undefined);
  assert.equal(out.bearing, undefined);
  assert.equal(out.points, undefined);
});

test('a skipped record passes through untouched — it is an audit row, not a drawable', () => {
  const skipped: Descriptor3D = { kind: 'skipped', sceneKind: 'tree' };
  assert.deepEqual(trueGroundFromDrawing([skipped]), [skipped]);
});

test('PLAN VIEW is the identity — a scene already on true ground converts to itself', () => {
  const cell = drawnCell([
    [-5, -5],
    [5, -5],
    [5, 5],
    [-5, 5],
  ]);
  assert.deepEqual(trueGroundFromDrawing([cell], PLAN_VIEW_ELEVATION_DEG), [cell]);
});

test('an edge-on elevation REFUSES rather than returning an infinite world', () => {
  const cell = drawnCell([
    [0, 0],
    [1, 0],
    [1, 1],
  ]);
  // At 0° the ground plane projects to a line: there is no scale that undoes it, and silently
  // returning Infinity would put every island at the same place with no signal anywhere.
  assert.throws(() => trueGroundFromDrawing([cell], 0), /not a scale/);
});

test('the input is not mutated — the caller keeps its drawing', () => {
  const cell = drawnCell([
    [0, 10],
    [1, 10],
    [1, 20],
  ]);
  const before = JSON.parse(JSON.stringify(cell)) as unknown;
  trueGroundFromDrawing([cell]);
  assert.deepEqual(JSON.parse(JSON.stringify(cell)) as unknown, before);
});

// ---------------------------------------------------------------------------
// `landStreamFromDrawing` — the three-step pipeline, and the ORDER that is its whole point
// ---------------------------------------------------------------------------

/** A one-parcel island's scene graph as the 2D map emits it: a `ground` group carrying the island
 *  id, a `parcel` group carrying the capability id, and the parcel's own closed ring. Coordinates
 *  are the DRAWING's — already foreshortened, exactly as `buildScene` leaves them. */
function drawnIsland(island: string, capability: string, halfWidth: number, halfDepth: number): SceneG {
  const s = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const ring = [
    [-halfWidth, -halfDepth * s],
    [halfWidth, -halfDepth * s],
    [halfWidth, halfDepth * s],
    [-halfWidth, halfDepth * s],
  ];
  return {
    el: 'g',
    kind: 'ground',
    id: island,
    status: 'healthy',
    children: [
      {
        el: 'g',
        kind: 'parcel',
        id: capability,
        children: [{ el: 'path', kind: 'cell', d: `M ${ring.map(([x, y]) => `${x} ${y}`).join(' L ')} Z` }],
      },
    ],
  };
}

/** The area a closed ring encloses on the ground plane (the shoelace, absolute). */
function ringArea(points: readonly { x: number; z: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

test('the pipeline sizes the TRUE island, not the squashed one — the order is the substance', () => {
  const scene: SceneG = {
    el: 'g',
    children: [drawnIsland('alpha', 'cap-a', 40, 60)],
  };
  const stream = landStreamFromDrawing(scene);
  const cells = stream.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');
  assert.equal(cells.length, 1);
  const area = ringArea((cells[0]!.points ?? []).map((p) => ({ x: p.x, z: p.z })));
  // ONE capability, so the island is sized to exactly one ratio's worth of land.
  assert.ok(
    Math.abs(area - LAND_AREA_PER_CAPABILITY) / LAND_AREA_PER_CAPABILITY < 1e-9,
    `sized to ${area} units², wanted ${LAND_AREA_PER_CAPABILITY}`,
  );
  // ⚠ THE SEPARATION, stated so the assertion above cannot be satisfied by the wrong order. Sizing
  // BEFORE the un-projection measures the drawing's squashed area, so the island comes out
  // `1 / sin 20°` = 2.92x too large — a plausible forest, and never an error.
  const squashedOrderArea = LAND_AREA_PER_CAPABILITY / groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  assert.ok(squashedOrderArea / LAND_AREA_PER_CAPABILITY > 2.9, 'the two orders are far apart');
  assert.ok(Math.abs(area - squashedOrderArea) > LAND_AREA_PER_CAPABILITY, 'and this is not that one');
});

test('the pipeline stands the island UPRIGHT — the drawing’s squash is gone by the end', () => {
  const scene: SceneG = { el: 'g', children: [drawnIsland('alpha', 'cap-a', 50, 50)] };
  const cells = landStreamFromDrawing(scene).filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');
  const ring = cells[0]!.points ?? [];
  const width = Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x));
  const depth = Math.max(...ring.map((p) => p.z)) - Math.min(...ring.map((p) => p.z));
  // A square island drawn at 20° is a 2.92:1 letterbox on the page; on true ground it is square
  // again. The scaling is isotropic, so the RATIO is what the un-projection is judged on.
  assert.ok(Math.abs(width / depth - 1) < 1e-9, `${width} x ${depth}`);
});
