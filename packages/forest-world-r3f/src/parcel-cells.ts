// parcel-cells.ts — the island's ground cells in the basis anything standing ON them works in,
// and the one route from the SHIPPED descriptor stream into it.
//
// ⚠⚠ WHY THIS EXISTS AS ITS OWN MODULE. `harness/prop-layout.ts` has owned `GPoint` and
// `LayoutCell` since the procedural dressing, and it is 1,100 lines of scatter, grove, meander and
// loop machinery that the shipped map has no use for. When the bought kit crossed on 2026-08-30 it
// needed the two TYPES and a way to reach them from `worldTo3D`'s output — not the machinery. So
// the shapes crossed and the machinery stayed, and `harness/prop-layout.ts` re-exports them, which
// is what stops the harness and the product disagreeing about what a cell is.
//
// ⚠ THE `y`-MEANS-`z` TRAP, and it is why the conversion happens in exactly one place. The scene
// is authored in a 2D drawing basis where the second coordinate is `y`; the ground is a 3D plane
// where it is `z`. Converting ad hoc downstream is how a placement ends up rotated ninety degrees
// from the land it is standing on, and the picture looks merely odd rather than wrong.
//
// ⚠⚠ AND THE SHIPPED BASIS IS NOT THE HARNESS'S — do not assume one conversion serves both.
// `harness/island-descriptors.ts`'s `groundCellsFrom` UNPROJECTS the scene's isometric drawing back
// to ground coordinates before handing cells on. `worldTo3D` does not: it maps the drawing's
// `(x, y)` straight to `(x, 0, z)`, so the shipped island is the PROJECTED shape used as a ground
// plane — 234 units wide and 46 deep, measurably squashed. That is the shipped canvas's own
// long-standing basis and this module does not change it; what matters here is that a prop placed
// off these rings and lifted by `landRelief.height` sits on the ground the canvas actually draws,
// because both read the same numbers.

import type { Descriptor3D } from './world-to-3d.js';

/** A ground-space point. x east, z south — the space `landHeight(x, z)` takes. */
export interface GPoint {
  x: number;
  z: number;
}

/** One cell's outline in `{x, z}`, plus the capability whose parcel it belongs to and the folded
 *  status it wears. The form everything that stands on the ground works in. */
export interface LayoutCell {
  points: GPoint[];
  parcel: string | undefined;
  status: string;
  cellId: string | undefined;
}

/**
 * THE SHIPPED DESCRIPTOR STREAM'S GROUND CELLS, in the placement basis.
 *
 * ⚠ A CELL WITH NO `parcel` IS KEPT, NOT DROPPED, and the distinction is load-bearing. Dropping
 * it would silently shrink the island a whole-story prop (a UAT bloom) may stand on, and on a
 * substrate with no parcel groups at all it would shrink it to nothing — an island that reports
 * none of the work, drawn with no error anywhere. Callers that need per-capability identity group
 * by `parcel` and get an honest absence.
 */
export function parcelCellsFrom(descriptors: readonly Descriptor3D[]): LayoutCell[] {
  const out: LayoutCell[] = [];
  for (const d of descriptors) {
    if (d.kind !== 'cell-ground') continue;
    const ring = d.points;
    if (!ring || ring.length < 3) continue;
    // ANNOTATED local, then guarded assignments — `anti-slop/no-conditional-empty-object-spread`.
    const cell: LayoutCell = {
      points: ring.map((p) => ({ x: p.x, z: p.z })),
      parcel: d.parcel,
      status: d.material ?? 'unknown',
      cellId: undefined,
    };
    out.push(cell);
  }
  return out;
}

/** Group cells by the capability whose parcel they belong to, in first-seen order. Cells carrying
 *  no parcel are left out of every group — they belong to no capability, which is a different
 *  thing from belonging to a group of unnamed ones. */
export function cellsByParcel(cells: readonly LayoutCell[]): Map<string, LayoutCell[]> {
  const out = new Map<string, LayoutCell[]>();
  for (const cell of cells) {
    if (cell.parcel === undefined) continue;
    const list = out.get(cell.parcel);
    if (list) list.push(cell);
    else out.set(cell.parcel, [cell]);
  }
  return out;
}
