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
  return Math.atan2(Math.sin(bearing), factor * Math.cos(bearing));
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
  const centres = islandCentres(descriptors);
  // Stryker disable next-line ConditionalExpression: EQUIVALENT — at a factor of exactly 1 the map
  // below is the identity too; the early return only saves the work, and no input can tell them apart.
  if (centres.size === 0 || factor === 1) return [...descriptors];
  const about = (cz: number, z: number): number => cz + (z - cz) * factor;
  const ownCentre = (d: InstanceDescriptor, at: Transform3D): IslandCentre => {
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — `Map.get(undefined)` is
    // `undefined` too; the guard is for the type, not for the value.
    const own = d.island === undefined ? undefined : centres.get(d.island);
    if (own !== undefined) return own;
    // `centres.size > 0` above, so the nearest centre exists.
    return nearestCentre(centres, at.x, at.z) as IslandCentre;
  };
  return descriptors.map((d): T => {
    if (d.kind === 'skipped') return d;
    if (SPANNING.has(d.kind) && d.points !== undefined && d.points.length > 0) {
      return { ...d, ...stretchSpan(d, d.points, centres, factor) };
    }
    const c = ownCentre(d, d.transform);
    const moved: InstanceDescriptor = { ...d, transform: { ...d.transform, z: about(c.z, d.transform.z) } };
    if (d.points !== undefined) moved.points = d.points.map((p) => ({ ...p, z: about(c.z, p.z) }));
    if (d.bearing !== undefined) moved.bearing = stretchedBearing(d.bearing, factor);
    return moved as T;
  });
}

/** A ribbon's displacement: each end attached to its nearest island, the points between blending
 *  the two islands' displacements by arc-length fraction. Returns the new transform and points. */
function stretchSpan(
  d: InstanceDescriptor,
  points: readonly Transform3D[],
  centres: ReadonlyMap<string, IslandCentre>,
  factor: number,
): Pick<InstanceDescriptor, 'transform' | 'points'> {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const a = nearestCentre(centres, first.x, first.z) as IslandCentre;
  const b = nearestCentre(centres, last.x, last.z) as IslandCentre;
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i - 1]!;
    const q = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(q.x - p.x, q.z - p.z));
  }
  const total = lengths[lengths.length - 1]!;
  const shift = (p: Transform3D, i: number): number => {
    const t = total > 0 ? lengths[i]! / total : 0;
    const dz = factor - 1;
    return (1 - t) * (p.z - a.z) * dz + t * (p.z - b.z) * dz;
  };
  const shifts = points.map(shift);
  const moved = points.map((p, i) => ({ ...p, z: p.z + shifts[i]! }));
  const mean = shifts.reduce((s, v) => s + v, 0) / shifts.length;
  return { transform: { ...d.transform, z: d.transform.z + mean }, points: moved };
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
