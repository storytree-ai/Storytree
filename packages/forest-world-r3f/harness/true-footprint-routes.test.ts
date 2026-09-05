// true-footprint-routes.test.ts — THE SHIPPED MAPPER'S TRUE FOOTPRINT, CHECKED AGAINST AN
// INDEPENDENT ROUTE. `src/true-footprint.test.ts` holds the arithmetic on synthetic islands; this
// holds that on the REAL fixture island the mapper's default output is the same island the scene
// itself builds at plan view (`cameraElevationDeg: 90`, where `projectGround` is the identity) —
// two implementations of the same unprojection agreeing to the drawing's own rounding. It lives in
// the harness because it needs the fixture (`scope-fence.test.ts`: src never imports the harness).

import assert from 'node:assert/strict';
import test from 'node:test';

import { PLAN_VIEW_ELEVATION_DEG, groundFlattening } from '@storytree/forest-world';

import { RECIPE_ISLAND_AREA, cellsArea } from '../src/dressing-ground.js';
import { LAND_AREA_PER_CAPABILITY, LAND_SCALE, TUNED_FIXTURE } from '../src/land-per-capability.js';
import { parcelCellsFrom } from '../src/parcel-cells.js';
import { islandCentres } from '../src/true-footprint.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from '../src/world-to-3d.js';
import { islandScene } from './island-fixture.js';

/** A ground-plane extent: width along x, depth along z. */
interface Extent {
  w: number;
  d: number;
}

const cells = (ds: readonly Descriptor3D[]): InstanceDescriptor[] =>
  ds.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');

function depthOf(ds: readonly InstanceDescriptor[]): Extent {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of ds) {
    for (const p of c.points ?? []) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  return { w: maxX - minX, d: maxZ - minZ };
}

test('⚠⚠ THE SHIPPED MAPPER RESTORES THE TRUE FOOTPRINT, AND TWO INDEPENDENT ROUTES AGREE: the scene built at plan view, and the drawing unprojected', () => {
  // Route 1: the scene's own `cameraElevationDeg` seam at 90° — `projectGround` is the identity,
  // so the mapper receives the unprojected outline and (told the elevation) leaves it alone.
  // Route 2: the default — the drawing, stretched per island by the mapper.
  // Both are read RELATIVE TO THE ISLAND'S CENTRE: the plan-view scene unprojects about the
  // drawing's origin, the mapper about the island's own centre, and the two differ by a
  // translation the comparison must not count.
  //
  // ⚠ BOTH ROUTES ARE READ WITH `landAreaPerCapability: null` — at the size the DRAWING gives the
  // island. This test is about the footprint STRETCH (ADR-0517 D1), and the land-per-capability
  // ratio the mapper applies by default (`land-per-capability.ts`) is a separate seam with its
  // own tests (`src/land-per-capability.test.ts`). Left on, it would scale one route and not the
  // other, and the agreement below would be measuring the ratio rather than the unprojection.
  // The width/depth pins are therefore the DRAWN island's, 234 × 135, not the shipped one's.
  const unsized = { landAreaPerCapability: null } as const;
  const recentre = (ds: InstanceDescriptor[]): InstanceDescriptor[] => {
    const c = [...islandCentres(ds).values()][0]!;
    return ds.map((d) => ({
      ...d,
      transform: { ...d.transform, x: d.transform.x - c.x, z: d.transform.z - c.z },
      points: (d.points ?? []).map((p) => ({ ...p, x: p.x - c.x, z: p.z - c.z })),
    }));
  };
  const plan = recentre(
    cells(
      worldTo3D(islandScene({ cameraElevationDeg: PLAN_VIEW_ELEVATION_DEG }), {
        cameraElevationDeg: PLAN_VIEW_ELEVATION_DEG,
        ...unsized,
      }),
    ),
  );
  const shipped = recentre(cells(worldTo3D(islandScene(), unsized)));
  assert.equal(plan.length, shipped.length, 'the same number of cells');
  assert.ok(plan.length > 100, `a real decomposition (${plan.length} cells)`);
  // The drawn island is the recipe's own hex cluster, ~234 × ~135; both figures re-derived here.
  const shape = depthOf(shipped);
  assert.ok(shape.w > 220 && shape.w < 250, `width ${shape.w}`);
  assert.ok(shape.d > 125 && shape.d < 145, `depth ${shape.d}`);
  // And the DRAWING — the mapper told the scene is already true — is the squashed ribbon the
  // canvas drew until 2026-09-05: the same width, a third of the depth.
  const drawn = depthOf(cells(worldTo3D(islandScene(), { cameraElevationDeg: PLAN_VIEW_ELEVATION_DEG, ...unsized })));
  assert.ok(Math.abs(drawn.w - shape.w) < 1e-9, 'width untouched');
  assert.ok(Math.abs(drawn.d * (1 / groundFlattening()) - shape.d) < 1e-9, 'depth stretched by exactly the projection');
  assert.ok(drawn.d > 40 && drawn.d < 55, `drawn depth ${drawn.d}`);
  // ⚠ THE TWO ROUTES AGREE TO THE DRAWING'S OWN ROUNDING AND NO CLOSER — and that bound is
  // derived, not chosen. The scene writes its path coordinates to ONE decimal, so each route
  // carries up to ±0.05 of rounding on the coordinate it rounds: the plan-view route on the
  // unprojected z itself, the mapper's route on the PROJECTED z, which the stretch then
  // multiplies by 1/sin 20° ≈ 2.92. Measured 2026-09-05: worst vertex 0.181 on 164 matched
  // cells. A tolerance tighter than the rounding would fail on noise; one looser than a cell
  // would pass a different island.
  const rounding = 0.05;
  const tolerance = rounding * (1 + 1 / groundFlattening());
  assert.ok(tolerance > 0.18 && tolerance < 0.25, `tolerance ${tolerance}`);
  const centroid = (d: InstanceDescriptor) => {
    const pts = d.points ?? [];
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
  };
  let worstVertex = 0;
  for (const a of plan) {
    const ca = centroid(a);
    let best: InstanceDescriptor | null = null;
    let bestDist = Infinity;
    for (const b of shipped) {
      const cb = centroid(b);
      const dist = Math.hypot(ca.x - cb.x, ca.z - cb.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }
    assert.ok(best !== null && bestDist < tolerance, `a plan-view cell has no twin within ${tolerance} (nearest ${bestDist})`);
    assert.equal(best.points?.length, a.points?.length, 'the twin has the same ring');
    for (const p of a.points ?? []) {
      let nearest = Infinity;
      for (const q of best.points ?? []) nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.z - q.z));
      worstVertex = Math.max(worstVertex, nearest);
    }
  }
  assert.ok(worstVertex < tolerance, `worst vertex deviation ${worstVertex} against ${tolerance}`);
  // Not vacuous: the agreement is far tighter than the thing it distinguishes — a cell of the
  // drawn mesh is >= 8.66 units across (8.66 × LAND_SCALE once the ratio sizes it) — and not to
  // the bit, which would mean one route IS the other.
  assert.ok(worstVertex > 0);
});

test('⚠⚠ RECIPE_ISLAND_AREA IS THE FIXTURE ISLAND’S OWN AREA THROUGH THE SHIPPED MAPPER — re-derived, in the true-footprint basis', () => {
  // The constant claims to be "the ground the recipe's thirteen stands were scattered over, in
  // this map's placement units". This is the check that it IS: the fixture island (the recipe's
  // own thirteen hexes) through `worldTo3D` and `parcelCellsFrom`, summed by the same `cellsArea`
  // the stand count divides by.
  //
  // ⚠ THREE BASES, and the constant is the FIRST:
  //   1. THROUGH THE SHIPPED MAPPER (default options) — the island sized by the land-per-capability
  //      ratio (`land-per-capability.ts`): `capabilities × LAND_AREA_PER_CAPABILITY`, 11 × 318 =
  //      3,498 units² exactly, since the mapper scales each island so that its area IS that product.
  //      This is the basis the constant is declared in (`RECIPE_ISLAND_AREA = 24631.8 * LAND_SCALE²`).
  //   2. THE TRUE FOOTPRINT AS DRAWN (`landAreaPerCapability: null`) — 24,631.8 units², the
  //      thirteen hexes unprojected and left at the size the drawing gives them (ADR-0517 D1).
  //   3. THE SQUASHED RIBBON (plan-view elevation, unsized) — 8,424.6, the pre-2026-09-05 basis;
  //      the true footprint is exactly 1 / sin 20° = 2.9238x that.
  const area = cellsArea(parcelCellsFrom(worldTo3D(islandScene())));
  // The ratio's own promise, held on the real island: the sized area is the product, exactly.
  assert.ok(
    Math.abs(area - TUNED_FIXTURE.capabilities * LAND_AREA_PER_CAPABILITY) < 1e-6,
    `sized area ${area} is not capabilities × ratio (${TUNED_FIXTURE.capabilities * LAND_AREA_PER_CAPABILITY})`,
  );
  const drawnTrue = cellsArea(parcelCellsFrom(worldTo3D(islandScene(), { landAreaPerCapability: null })));
  assert.ok(Math.abs(drawnTrue - 24631.8) < 0.05, `drawn true-footprint area ${drawnTrue}`);
  const drawn = cellsArea(
    parcelCellsFrom(worldTo3D(islandScene(), { cameraElevationDeg: PLAN_VIEW_ELEVATION_DEG, landAreaPerCapability: null })),
  );
  assert.ok(Math.abs(drawn - 8424.6) < 0.05, `drawn area ${drawn} — the old basis`);
  assert.ok(Math.abs(drawnTrue / drawn - 1 / groundFlattening()) < 1e-9, 'exactly the projection');
  // And the sized island against the drawn one is LAND_SCALE² to the drawing's own rounding: the
  // global factor is `√(318 / (13 ideal hex tiles / 11))`, the per-island one `√(11 × 318 / the
  // drawn 24,631.8)`, and the two differ only by the 7 units² the drawing's one-decimal
  // coordinates add over thirteen ideal hexes.
  assert.ok(Math.abs(area / drawnTrue - LAND_SCALE * LAND_SCALE) < 1e-3, `sized / drawn ${area / drawnTrue} vs LAND_SCALE² ${LAND_SCALE * LAND_SCALE}`);
  // THE CONSTANT ITSELF, last, so a red here names only the constant: it must be the fixture's
  // area through the shipped mapper (basis 1) to the same 0.05 the old basis was held to.
  assert.ok(Math.abs(area - RECIPE_ISLAND_AREA) < 0.05, `fixture area ${area} against the constant ${RECIPE_ISLAND_AREA}`);
});
