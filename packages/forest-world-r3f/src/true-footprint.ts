// true-footprint.ts — THE DRAWING'S PROJECTION, UNDONE, PER ISLAND (ADR-0517 D1).
//
// The semantic scene `worldTo3D` reads is a 2D DRAWING, and that drawing is already isometrically
// foreshortened: every ground coordinate was projected at the declared land camera
// (`LAND_CAMERA_ELEVATION_DEG`, 20°), so an island's depth on the page is its ground depth times
// `sin 20°` = 0.342. Until 2026-09-05 the mapper laid that drawing straight onto the ground plane
// — SVG (x, y) → 3D (x, 0, z) — and the shipped island was 233.8 units wide and 46.2 deep where the
// recipe's own hex cluster (`build_land.py`, the render the owner stamped) is 233.8 × 135.1. The
// 3D camera then foreshortened that squashed plane a SECOND time, and the owner read the result as
// "the camera is too low". PR #1820's ladder measured the two causes apart: the five degrees of
// elevation move the island's on-screen proportions by 7.5%, the footprint by 129%.
//
// So the mapper restores the island's TRUE footprint: every ground z is stretched by
// `1 / sin(elevation)` — 2.9238 at the land camera — ABOUT ITS OWN ISLAND'S CENTRE, x untouched.
//
// ⚠⚠ ABOUT EACH ISLAND, NOT ABOUT THE ORIGIN, and the difference was measured rather than argued.
// Stretching the whole stream about the forest origin unprojects the layout's SPACING along with
// the islands — the thirty-five-island crowd became 10,235 units deep and `shore-grid` refused the
// extent outright (478,401 buckets against its 262,144 cap). The owner judged the ISLAND's
// footprint, and approved the arm that holds the layout still and unsquashes each island in place
// (ADR-0517 D1: "each island stretches about its own centre — so the forest's arrangement does not
// move; only each island's shape does"). On one island the two are the same picture up to where
// the island sits in the frame.
//
// ⚠ THE WHOLE STREAM, NOT THE CELLS ALONE. The strips dock on the coast, the blooms carry an
// island's centre, a cave stands on the rim — every one of them was projected by the same
// `projectGround`, so unprojecting the cells and leaving the rest would put the docks in the water
// and the flowers off their islands. A descriptor that names its island is stretched about that
// island. A strip belongs to no island (it spans two): each END is attached to the island nearest
// it, and the points between blend the two islands' displacements by arc-length fraction, so both
// docks land exactly on their own stretched coasts and the ribbon between them has no step — the
// per-point-nearest-island rule the harness used to carry would put a jump in a trail wherever it
// crossed the midline between two islands. A wisp follows the nearest island.
//
// ⚠ A CAVE'S BEARING IS RE-DERIVED, NOT INHERITED. The bearing is the outward rim NORMAL in the
// drawing plane; stretch the plane along z and the rim's tangent turns, so the normal turns with
// it: `n' ∝ (s·cos b, sin b)`. A portal left at its drawn bearing would face a coast that is no
// longer there.
//
// Pure: no React, no three — behind the provability firewall with `world-to-3d.ts`, and the
// arithmetic is affine about a fixed centre, so an island's centre (the mean of its ring vertices)
// is INVARIANT under the stretch and `stretchAboutIslands(·, 1/s)` is its exact inverse. That is
// what lets a comparison page recover the pre-2026-09-05 drawing as a "before" arm from the same
// stream, and what `true-footprint.test.ts` holds.
//
// ⚠ THE STRETCH IS ONE CASE OF A PER-ISLAND AFFINE SCALE. `scaleAboutIslands` is the general
// operation — any (x, z) factor pair per island, about that island's own centre, with the same
// per-family rules — and the true-footprint stretch is `{ x: 1, z: 1 / sin θ }` for every island.
// `land-per-capability.ts` (the island's SIZE from a declared land-per-capability ratio) is the
// second caller, an ISOTROPIC factor that differs per island, and it reuses this rather than
// carrying a second copy of the ribbon and bearing rules.

import { LAND_CAMERA_ELEVATION_DEG, groundFlattening } from '@storytree/forest-world';

import type { Descriptor3D, InstanceDescriptor, Transform3D } from './world-to-3d.js';

/** A ground-plane centre — the mean of an island's ring vertices. */
export interface IslandCentre {
  x: number;
  z: number;
}

/** Each island's ground centre — the mean of its `cell-ground` ring vertices — keyed by island id.
 *  Islands with no ring vertices are absent rather than at the origin. */
export function islandCentres(descriptors: readonly Descriptor3D[]): Map<string, IslandCentre> {
  const sums = new Map<string, { x: number; z: number; n: number }>();
  for (const d of descriptors) {
    if (d.kind !== 'cell-ground' || d.island === undefined) continue;
    const acc = sums.get(d.island) ?? { x: 0, z: 0, n: 0 };
    for (const p of d.points ?? []) {
      acc.x += p.x;
      acc.z += p.z;
      acc.n += 1;
    }
    sums.set(d.island, acc);
  }
  const out = new Map<string, IslandCentre>();
  for (const [id, acc] of sums) if (acc.n > 0) out.set(id, { x: acc.x / acc.n, z: acc.z / acc.n });
  return out;
}

/** The centre nearest a ground point, or null when there are no islands at all. */
export function nearestCentre(centres: ReadonlyMap<string, IslandCentre>, x: number, z: number): IslandCentre | null {
  let best: IslandCentre | null = null;
  let bestDist = Infinity;
  for (const c of centres.values()) {
    const dist = Math.hypot(x - c.x, z - c.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/** The cave bearing after the plane is stretched by `factor` along z: the rim normal
 *  `(cos b, sin b)` becomes `(factor·cos b, sin b)`, renormalised by `atan2`. Identity at 1. */
export function stretchedBearing(bearing: number, factor: number): number {
  return scaledBearing(bearing, { x: 1, z: factor });
}

/** A per-island scale: the factor applied along x and along z about the island's centre. */
export interface IslandScale {
  x: number;
  z: number;
}

/** The cave bearing after the plane is scaled by `(sx, sz)`: the rim's TANGENT scales with the
 *  plane, so its NORMAL `(cos b, sin b)` becomes `(cos b / sx, sin b / sz)`, renormalised by
 *  `atan2`. Identity under any isotropic scale, and the z-stretch case above at `sx = 1`. */
export function scaledBearing(bearing: number, scale: IslandScale): number {
  return Math.atan2(Math.sin(bearing) / scale.z, Math.cos(bearing) / scale.x);
}

/** The families whose points are a ribbon between two islands rather than one island's own. */
const SPANNING: ReadonlySet<string> = new Set(['trail-strip', 'trail-ghost-strip']);

/**
 * Stretch every ground z by `factor` about its island's centre; x and y untouched. See the header
 * for which centre each family stretches about. A stream with no islands is returned as-is (there
 * is nothing to stretch about), and skipped descriptors pass through untouched.
 */
export function stretchAboutIslands<T extends Descriptor3D>(descriptors: readonly T[], factor: number): T[] {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`true-footprint: a stretch factor must be a positive finite number, got ${factor}`);
  }
  // Stryker disable next-line ConditionalExpression: EQUIVALENT — at a factor of exactly 1 the map
  // below is the identity too; the early return only saves the work, and no input can tell them apart.
  if (factor === 1) return [...descriptors];
  const scale: IslandScale = { x: 1, z: factor };
  return scaleAboutIslands(descriptors, () => scale);
}

/**
 * THE GENERAL OPERATION: scale every descriptor about its island's centre by that island's own
 * `(x, z)` factors, y untouched. `scaleFor` is asked once per island centre and may answer a
 * different pair per island — which is what a per-island SIZE needs and a global stretch does not.
 * The per-family rules are the header's: a descriptor naming its island scales about it, a wisp
 * follows the nearest island, a ribbon between two islands attaches each end to its nearest island
 * and blends between them, and a cave's bearing turns with its rim. A stream with no islands is
 * returned as-is; skipped descriptors pass through untouched.
 */
export function scaleAboutIslands<T extends Descriptor3D>(
  descriptors: readonly T[],
  scaleFor: (island: string, centre: IslandCentre) => IslandScale,
): T[] {
  const centres = islandCentres(descriptors);
  if (centres.size === 0) return [...descriptors];
  const scales = new Map<string, IslandScale>();
  for (const [id, c] of centres) {
    const s = scaleFor(id, c);
    if (!Number.isFinite(s.x) || s.x <= 0 || !Number.isFinite(s.z) || s.z <= 0) {
      throw new Error(`true-footprint: island "${id}" was given a scale of (${s.x}, ${s.z}); both must be positive finite numbers`);
    }
    scales.set(id, s);
  }
  const ownIsland = (d: InstanceDescriptor, at: Transform3D): [IslandCentre, IslandScale] => {
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — `Map.get(undefined)` is
    // `undefined` too; the guard is for the type, not for the value.
    const own = d.island === undefined ? undefined : centres.get(d.island);
    const id = own !== undefined ? (d.island as string) : nearestIsland(centres, at.x, at.z);
    return [centres.get(id) as IslandCentre, scales.get(id) as IslandScale];
  };
  return descriptors.map((d): T => {
    if (d.kind === 'skipped') return d;
    if (SPANNING.has(d.kind) && d.points !== undefined && d.points.length > 0) {
      return { ...d, ...scaleSpan(d, d.points, centres, scales) };
    }
    const [c, s] = ownIsland(d, d.transform);
    const about = (p: Transform3D): Transform3D => ({ ...p, x: c.x + (p.x - c.x) * s.x, z: c.z + (p.z - c.z) * s.z });
    const moved: InstanceDescriptor = { ...d, transform: about(d.transform) };
    if (d.points !== undefined) moved.points = d.points.map(about);
    if (d.bearing !== undefined) moved.bearing = scaledBearing(d.bearing, s);
    return moved as T;
  });
}

/** The id of the island whose centre is nearest a ground point. The caller holds `centres.size > 0`. */
function nearestIsland(centres: ReadonlyMap<string, IslandCentre>, x: number, z: number): string {
  // Every finite distance beats the initial Infinity, so the first island is the running best and
  // a tie keeps the FIRST — the same rule `nearestCentre` holds — with no placeholder id to return
  // by mistake.
  let best: string | undefined;
  let bestDist = Infinity;
  for (const [id, c] of centres) {
    const dist = Math.hypot(x - c.x, z - c.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best as string;
}

/** A ribbon's displacement: each end attached to its nearest island, the points between blending
 *  the two islands' displacements by arc-length fraction. Returns the new transform and points. */
function scaleSpan(
  d: InstanceDescriptor,
  points: readonly Transform3D[],
  centres: ReadonlyMap<string, IslandCentre>,
  scales: ReadonlyMap<string, IslandScale>,
): Pick<InstanceDescriptor, 'transform' | 'points'> {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const aId = nearestIsland(centres, first.x, first.z);
  const bId = nearestIsland(centres, last.x, last.z);
  const a = centres.get(aId) as IslandCentre;
  const b = centres.get(bId) as IslandCentre;
  const sa = scales.get(aId) as IslandScale;
  const sb = scales.get(bId) as IslandScale;
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i - 1]!;
    const q = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(q.x - p.x, q.z - p.z));
  }
  const total = lengths[lengths.length - 1]!;
  const shift = (p: Transform3D, i: number) => {
    const t = total > 0 ? lengths[i]! / total : 0;
    return {
      dx: (1 - t) * (p.x - a.x) * (sa.x - 1) + t * (p.x - b.x) * (sb.x - 1),
      dz: (1 - t) * (p.z - a.z) * (sa.z - 1) + t * (p.z - b.z) * (sb.z - 1),
    };
  };
  const shifts = points.map(shift);
  const moved = points.map((p, i) => ({ ...p, x: p.x + shifts[i]!.dx, z: p.z + shifts[i]!.dz }));
  const meanX = shifts.reduce((s, v) => s + v.dx, 0) / shifts.length;
  const meanZ = shifts.reduce((s, v) => s + v.dz, 0) / shifts.length;
  return { transform: { ...d.transform, x: d.transform.x + meanX, z: d.transform.z + meanZ }, points: moved };
}

/**
 * THE TRUE FOOTPRINT: the drawing's projection at `elevationDeg` undone, per island. At the
 * declared land camera that is a stretch of `1 / sin 20°` = 2.9238 along z; at plan view
 * (`PLAN_VIEW_ELEVATION_DEG`, sin = 1) the drawing is already true and nothing moves.
 */
export function restoreTrueFootprint<T extends Descriptor3D>(
  descriptors: readonly T[],
  elevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): T[] {
  return stretchAboutIslands(descriptors, 1 / groundFlattening(elevationDeg));
}
