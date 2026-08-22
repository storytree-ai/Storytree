// island-descriptors.ts — the LAND half of the live-render experiment: the island's own
// ground cells, extracted from a real `buildScene` output and returned in GROUND space,
// ready for a live renderer to extrude.
//
// WHY THIS EXISTS. The first pass of this experiment answered its questions on a ROW OF
// PLANTS, and the owner's reply was the arc's own standing rule turned back on it: judge on
// the ISLAND, never a contact sheet. A plant row can show that one convention carries more
// detail than another; it cannot show whether the result reads as a place. This module is
// what makes the island renderable.
//
// THE PROJECTION TRAP, WHICH IS THE WHOLE REASON THIS IS A MODULE AND NOT A LOOP INLINE.
// `buildScene` emits 2D coordinates that are ALREADY PROJECTED — the ground has been
// foreshortened by `groundFlattening(LAND_CAMERA_ELEVATION_DEG)`, i.e. sin(20 degrees), on
// its way out. Handing those numbers to a 3D renderer as if they were ground coordinates
// and then tilting a camera at them projects the SAME ground TWICE: the island comes out
// squashed to roughly a third of its true depth, and — the dangerous part — it still looks
// like a plausible island. Nothing about the picture announces the error.
//
// So every point goes through `unprojectGround` on the way in, recovering the ground plane
// the scene was projected FROM, and the live camera then does the one and only projection.
// `island-descriptors.test.ts` asserts the round trip on a real hex rather than trusting
// this paragraph.

import {
  LAND_CAMERA_ELEVATION_DEG,
  unprojectGround,
  type SceneG,
  type SceneNode,
} from '@storytree/forest-world';

/** One ground cell, in GROUND space (x east, y south — the caller maps y to 3D z). */
export interface GroundCell {
  /** The cell's outline, in ground coordinates, in path order. */
  points: { x: number; y: number }[];
  /** The owning capability's folded status — the material's token family. */
  status: string;
  /** The scene's per-cell colour variant (`substrate.ts` hash-picks one of three). */
  variant: number;
  /** The owning capability, from the enclosing `kind: 'parcel'` group's id.
   *
   *  CARRIED BECAUSE IT IS THE ONE EDGE THAT MEANS SOMETHING. A seam between two cells of
   *  the same capability is an artefact of how the substrate decomposed a hex and asserts
   *  nothing; a boundary between two capabilities is structure the island already owns and,
   *  on an all-healthy island, currently draws invisibly. Without this field the renderer
   *  cannot tell the two apart, and definition can then only be sprayed everywhere — which
   *  is precisely the treatment the owner rejected (`land-definition.ts`). */
  parcel?: string;
  /** The shape-free cell identity (ADR-0367), when the scene stamped one. */
  cellId?: string;
  /** True for a `cell-wheat` cell — the wheat token overrides the status family. */
  wheat: boolean;
}

/** All coordinate pairs in a path `d`, paired in path order. The core emits M/L polylines
 *  for cells, so pairing the numeric stream recovers the polygon exactly. */
function pathPoints(d: string): { x: number; y: number }[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: parseFloat(nums[i]!), y: parseFloat(nums[i + 1]!) });
  }
  return pts;
}

function parseTranslate(t: string | undefined) {
  if (!t) return { x: 0, y: 0 };
  const m = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(t);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}

/**
 * Every ground cell on the island, in GROUND space.
 *
 * `elevationDeg` is the elevation the SCENE was projected at — not the one you intend to
 * render at. It defaults to `LAND_CAMERA_ELEVATION_DEG` because that is what `buildScene`
 * itself uses, and passing the RENDER angle here is the exact mistake this parameter exists
 * to make nameable: it would unproject by the wrong amount and hide the error inside a
 * plausible picture.
 */
export function groundCellsFrom(
  scene: SceneG,
  elevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): GroundCell[] {
  const out: GroundCell[] = [];

  const walk = (
    node: SceneNode,
    at: { x: number; y: number },
    status: string | undefined,
    parcel: string | undefined,
  ): void => {
    if (node.el === 'g') {
      const t = parseTranslate(node.transform);
      const here = { x: at.x + t.x, y: at.y + t.y };
      // A `parcel` group carries the owning capability's status AND its capId; cells
      // inherit both when their own path does not restate them. The capId is only ever
      // taken from a group that says it IS a parcel — every other `<g>` on the island
      // carries an `id` for its own reasons (a territory, a trail edge, a hit target), and
      // inheriting one of those would silently partition the land along the wrong lines.
      const here2 = node.kind === 'parcel' ? node.id ?? parcel : parcel;
      const inherited = node.status ?? status;
      for (const child of node.children) walk(child, here, inherited, here2);
      return;
    }
    if (node.el !== 'path') return;
    if (node.kind !== 'cell' && node.kind !== 'cell-wheat') return;

    const pts = pathPoints(node.d).map((p) =>
      unprojectGround({ x: at.x + p.x, y: at.y + p.y }, elevationDeg),
    );
    if (pts.length < 3) return;

    out.push({
      points: pts,
      status: node.status ?? status ?? 'unknown',
      variant: node.variant ?? 0,
      wheat: node.kind === 'cell-wheat',
      ...(parcel !== undefined ? { parcel } : {}),
      ...(node.cellId !== undefined ? { cellId: node.cellId } : {}),
    });
  };

  walk(scene, { x: 0, y: 0 }, undefined, undefined);
  return out;
}

export interface GroundBoundsResult {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  w: number;
  h: number;
}

/** The island's ground-space bounding box — what a camera frames on. */
export function groundBounds(cells: readonly GroundCell[]): GroundBoundsResult {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    for (const p of c.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

/** Triangulate a convex-ish cell polygon as a fan about its centroid. The relaxed
 *  substrate's cells are small and near-convex, so a fan is exact for them and never
 *  produces the self-overlap an ear-clip would guard against. Returns flat triangle
 *  vertices, so the caller can build one merged buffer per status instead of a mesh
 *  per cell — 162 draw calls is a different experiment from the one being run. */
export function triangulateFan(points: readonly { x: number; y: number }[]): number[][] {
  if (points.length < 3) return [];
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  const tris: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    tris.push([cx, cy, a.x, a.y, b.x, b.y]);
  }
  return tris;
}
