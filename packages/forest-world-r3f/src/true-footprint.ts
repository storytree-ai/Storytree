// true-footprint.ts — THE PER-ISLAND AFFINE SCALE: every descriptor moved about ITS OWN island's
// centre, with one rule per family.
//
// ⚠⚠ THE UN-PROJECTION THIS FILE WAS BORN FOR IS DELETED (ADR-0546, 2026-09-08). Read that first if
// you are here from an older comment. Between 2026-09-05 and 2026-09-08 this module also carried
// `restoreTrueFootprint` / `stretchAboutIslands`: the mapper received a 2D DRAWING already
// foreshortened at the declared land camera (`LAND_CAMERA_ELEVATION_DEG`, 20°, so a ground depth on
// the page is `sin 20°` = 0.342 of the real one) and un-squashed every island in place. The owner
// chose instead to have the 3D forest STAND ON TRUE GROUND — `worldTo3D` is handed a plan-view
// scene and un-projects nothing — so there is no drawing left to repair, and the repair went with
// it. The file name is the one it has always had; what survives it is the general operation the
// repair was one case of.
//
// WHAT SURVIVES, AND WHY IT IS WORTH A MODULE. `scaleAboutIslands` scales every descriptor about
// its own island's centre by that island's own `(x, z)` pair — the arithmetic is affine about a
// fixed centre, so an island's centre (the mean of its ring vertices) is INVARIANT under it and
// the inverse pair is its exact inverse. `land-per-capability.ts` is the live caller: an island's
// SIZE from a declared land-per-capability ratio is an ISOTROPIC factor that differs per island,
// and it reuses this rather than carrying a second copy of the two rules below.
//
// ⚠ THE WHOLE STREAM, NOT THE CELLS ALONE. The strips dock on the coast, the blooms carry an
// island's centre, a cave stands on the rim — scaling the cells and leaving the rest would put the
// docks in the water and the flowers off their islands. A descriptor that names its island scales
// about that island. A strip belongs to no island (it spans two): each END is attached to the
// island nearest it, and the points between blend the two islands' displacements by arc-length
// fraction, so both docks land exactly on their own scaled coasts and the ribbon between them has
// no step — the per-point-nearest-island rule the harness used to carry would put a jump in a trail
// wherever it crossed the midline between two islands. A wisp follows the nearest island.
//
// ⚠ A CAVE'S BEARING IS RE-DERIVED, NOT INHERITED. The bearing is the outward rim NORMAL in the
// ground plane; scale the plane and the rim's tangent turns, so the normal turns with it:
// `n' ∝ (cos b / sx, sin b / sz)`. A portal left at its drawn bearing would face a coast that is no
// longer there. Identity under any isotropic scale, which is the only scale shipped today.
//
// Pure: no React, no three — behind the provability firewall with `world-to-3d.ts`.

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

