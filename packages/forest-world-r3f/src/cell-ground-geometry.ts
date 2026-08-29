// cell-ground-geometry.ts — the relaxed-mesh parcel ring → one merged ground buffer.
//
// THE PURE HALF of the `cell-ground` family (ADR-0123's provability firewall): arithmetic
// only, no React and no three.js, so every claim below is provable under bare `node:test`
// rather than only observable in a browser. `ForestWorldCanvas.tsx` hands the result
// straight to a `<bufferGeometry>`.
//
// ⚠⚠ WHY ONE MERGED BUFFER AND NOT ONE MESH PER PARCEL. The reference island carries 164
// parcels. A mesh each would take the shipped canvas from 2 draw calls to 166 — a cost
// regression roughly 80x on the metric `harness/hardware-floor.*` actually sweeps, paid to
// draw ground the classic substrate already drew in ONE instanced call. Parcels are
// arbitrary polygons and cannot share a geometry, so instancing is unavailable; merging is
// what is left. Per-parcel COLOUR survives the merge as a vertex attribute, which is the
// only property of the ground that varies and the one the map reports status with.
//
// ⚠ NORMALS ARE DERIVED FROM THE EMITTED WINDING, NEVER AUTHORED BESIDE IT. `pushTriangle`
// computes each face's geometric normal from the three vertices it is writing, so a
// positions/normals disagreement is unrepresentable rather than merely tested for. What the
// tests then have to check is only the ORDER the vertices are pushed in — which is the thing
// that can actually be got wrong, and whose failure mode (a parcel invisible from above
// under backface culling) looks exactly like the bug this whole module exists to fix.
//
// ⚠ ADOPTION HAS BEGUN AND THIS FILE IS WHERE IT LANDS. The owner authorised it on 2026-08-29
// ("This looks better, stamp it"), settling ADR-0380 D6 / ADR-0406 D2's separate-and-deliberate
// event. Two components of the approved treatment now reach this buffer, both as INPUTS rather
// than as things this module reaches for — which is what keeps every before/after on this arc
// the same function called twice: `relief` (the land's shape, crossed 2026-08-30) and `index`
// (the parcel's ramp ROW, which a banded material selects an authored colour with). Still NOT
// here: the coast clip, the stepped skirt, and the grain octave — the last of which is a
// fragment-stage field and belongs to the material, not to a vertex buffer.

import type { InstanceDescriptor } from './world-to-3d.js';

/** A linear-space colour triple. ⚠ LINEAR, not sRGB: three converts a hex string through
 *  `THREE.Color` on its way into a material, so a vertex-colour attribute that carried raw
 *  sRGB bytes would draw the same status token visibly lighter than the instanced hex-ground
 *  path draws it. The conversion is deliberately NOT transcribed here — {@link CellGroundGeometryInput}
 *  takes a resolver so the canvas can supply three's own. */
export interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

/** How deep a parcel prism sits below the ground plane, in world units. Matches
 *  `TILE_HEIGHT` in `ForestWorldCanvas.tsx` — the two substrates draw ground of the same
 *  thickness because they are the same ground in two representations. */
export const CELL_GROUND_DEPTH = 3;

/** Triangles in ONE parcel prism of `ringLength` vertices: a triangulated top face
 *  (`ringLength - 2`, the count ANY simple polygon triangulates to) plus two per wall quad.
 *
 *  ⚠ THERE IS NO BOTTOM CAP, and that is a decision rather than an oversight. The map is
 *  viewed from above, the parcels tile the island with no gaps, and a cap would cost another
 *  `ringLength` triangles per parcel to draw a face nothing can see. The classic
 *  `cylinderGeometry` prism DOES carry one, because three generates it and the shipped file
 *  does not ask it not to — so the two substrates differ by exactly this, and
 *  `shipped-baseline.ts` records both rather than pretending they match. */
export function cellGroundTriangles(ringLength: number): number {
  if (ringLength < 3) return 0;
  return ringLength * 3 - 2;
}

/** Everything {@link cellGroundGeometry} needs. Named rather than a positional list because
 *  the resolver's contract (LINEAR, not sRGB) is the one thing a caller gets wrong. */
export interface CellGroundGeometryInput {
  /** The `cell-ground` descriptors, each carrying its parcel ring in `points`. */
  cells: readonly InstanceDescriptor[];
  /** Status variant → LINEAR colour. The canvas supplies `new THREE.Color(hex)` so the sRGB
   *  transfer function is three's own rather than a transcription of it. */
  resolve: (material: string | undefined) => LinearRgb;
  /** Status variant → its RAMP ROW, an index into a material's authored `(token x level)` table.
   *
   *  ⚠ OPTIONAL, AND ITS ABSENCE MEANS AN EMPTY {@link CellGroundGeometry.statuses}, so a caller
   *  that predates it gets the buffer it always got. Supplying it is what a BANDED material
   *  needs and a smooth one does not: `resolve` hands the GPU a colour to light continuously,
   *  while this hands it a ROW to select a finished, already-rounded authored colour out of.
   *
   *  ⚠ THE TWO ARE NOT ALTERNATIVE SPELLINGS OF ONE THING, and the reason is measured rather
   *  than stylistic. A shader given a colour has to MULTIPLY it by the rung's level, and the
   *  GPU's float-to-unorm8 conversion resolves an exact half DOWN where `Math.round` takes it
   *  UP — which delivered 929 px of `#c2ad5e` against the authored `#c2ad5f` the first time
   *  this package tried it (see `bandLevelIndex` in `shade-ladder.ts`). THREE of this map's own
   *  authored products land on exactly that knife edge — `#d8c069`'s blue at 0.9 (94.5) and
   *  `#9ca3af`'s at 0.9 (157.5) and 0.78 (136.5) — so the arithmetic is done ONCE in TypeScript
   *  and the GPU is handed a row and a rung to look up. `banded-ground-material.test.ts`
   *  ENUMERATES that class rather than sampling it. */
  index?: ((material: string | undefined) => number) | undefined;
  /** Prism depth below the ground plane. Defaults to {@link CELL_GROUND_DEPTH}. */
  depth?: number;
  /** The ground's RELIEF — how high the land stands at a point, and which way it faces there.
   *
   *  ⚠ OPTIONAL, AND OMITTING IT IS THE FLAT GROUND VERBATIM. That is what makes the shipped
   *  map's before/after a controlled comparison rather than a claim: the same function, the
   *  same parcels, the same colours, differing in exactly this one input. `ForestWorldCanvas`
   *  passes {@link landRelief} unconditionally — there is no flag on the shipped surface, and
   *  a flag nobody flips is not adoption (the arc's end-state item 6).
   *
   *  ⚠ THE NORMAL IS SUPPLIED, NOT DERIVED, AND ONLY FOR THE TOP FACE. Everything else in this
   *  module takes its normal from the winding of the very vertices being written, which makes a
   *  positions/normals disagreement unrepresentable. That guard is kept for the walls. The top
   *  face gives it up deliberately: a face normal would quantise each triangle whole and the
   *  land would read as a mosaic of hard facets — the rejected per-cell noise arriving by
   *  another route — where an interpolated ANALYTIC vertex normal puts the shading gradient
   *  where the surface actually turns. `landNormal` has `y = 1/hypot(dx,1,dz)`, which is
   *  positive for every finite gradient, so an upward-facing top face stays unrepresentable
   *  too: this trades one guarantee for the same guarantee reached a different way. */
  relief?: GroundRelief | undefined;
}

/** The ground's shape, as the two functions a mesh needs: a height and a unit normal, both of
 *  POSITION ONLY. `src/land-relief.ts` supplies the pair the shipped map draws with, and the
 *  seam is an interface rather than a direct import so this module stays arithmetic a test can
 *  drive with a field of its own choosing — including the constant-zero one that proves the
 *  flat path is the relief path's own special case. */
export interface GroundRelief {
  height: (x: number, z: number) => number;
  normal: (x: number, z: number) => { x: number; y: number; z: number };
}

/** The FLAT ground, as a relief field — what a caller supplying none gets, written out rather
 *  than branched around so there is exactly one code path through the builder. The old flat
 *  behaviour is now a special case of the general one rather than a sibling of it, which is
 *  what lets the before/after comparison be the same function twice. */
export const FLAT_GROUND: GroundRelief = {
  height: () => 0,
  normal: () => ({ x: 0, y: 1, z: 0 }),
};

/** One merged, non-indexed ground buffer: three floats per vertex, three vertices per
 *  triangle, flat-shaded (each face's three vertices share that face's own normal). */
export interface CellGroundGeometry {
  positions: Float32Array;
  normals: Float32Array;
  /** Per-vertex LINEAR colour — the parcel's folded status, surviving the merge. */
  colors: Float32Array;
  /** Per-vertex RAMP ROW — the same parcel status as {@link colors}, in the form a banded
   *  material selects with. ONE float per vertex, not three: it is a row number.
   *
   *  ⚠ EMPTY when the caller supplied no `index`, rather than absent or zero-filled. Empty is
   *  the honest report — a zero-filled buffer would say every parcel is row 0, which is a real
   *  status, and a material handed it would paint the whole island one colour while looking
   *  like it was working. */
  statuses: Float32Array;
  /** Parcels actually built (rings of fewer than three vertices bound no area and are dropped). */
  cells: number;
  /** Triangles in the merged buffer — the authored count `harness/baseline-measure.mjs`
   *  holds the browser's own GL tally to. */
  triangles: number;
}

// ⚠ THERE IS NO EARLY RETURN FOR AN EMPTY INPUT, and adding one back would be dead code. A scene
// with no relaxed cells is the CLASSIC substrate — an ordinary island, not an error — and the
// general path already answers it exactly: zero triangles, three zero-length buffers. An
// `if (rings.length === 0) return …` guard sat here until a mutation sweep showed it could be
// deleted without any test noticing, which is what an unreachable branch looks like from outside.

/** A 3D point in the merged buffer's own terms. */
interface P3 {
  x: number;
  y: number;
  z: number;
}

/** A ring vertex flattened to the ground plane. Exported because the module's primitives below
 *  are exported: they are the substance of this file, not its plumbing, and the whole
 *  orientation convention everything else rests on is only checkable if they can be called. */
export interface P2 {
  x: number;
  z: number;
}

/** Twice the SIGNED shoelace area of a triangle in the (x, z) plane. Its SIGN is the winding,
 *  and under the mapper's x→east / y→depth convention a NEGATIVE value is the one whose face
 *  normal points +Y (up). Everything about orientation in this module reduces to that sentence. */
export function signedTriangleArea2(a: P2, b: P2, c: P2): number {
  return a.x * b.z - b.x * a.z + (b.x * c.z - c.x * b.z) + (c.x * a.z - a.x * c.z);
}

/** Twice the signed shoelace area of a whole ring — the same sign convention as {@link area2}. */
export function signedRingArea2(pts: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    s += p.x * q.z - q.x * p.z;
  }
  return s;
}

/** The ring in the module's ONE orientation: negative shoelace, i.e. the winding whose top face
 *  points +Y. Every downstream claim — the triangulation's facing, and the wall's `(-dz, 0, dx)`
 *  outward normal — is stated against this convention and holds only because of it. */
export function normalisedRing(pts: readonly P2[]): readonly P2[] {
  return signedRingArea2(pts) > 0 ? pts.slice().reverse() : pts;
}

/** Is `p` inside triangle `abc` (edges inclusive), for a triangle known to be wound negative? */
export function pointInTriangle(p: P2, a: P2, b: P2, c: P2): boolean {
  return signedTriangleArea2(a, b, p) <= 0 && signedTriangleArea2(b, c, p) <= 0 && signedTriangleArea2(c, a, p) <= 0;
}

/**
 * Triangulate a ring into upward-facing triangles by EAR CLIPPING.
 *
 * ⚠⚠ A CENTROID FAN IS NOT SAFE HERE, and this is the whole reason the algorithm is this one.
 * A fan is only correct when the polygon is star-shaped about the point fanned from, and the
 * relaxed mesh's parcels are not guaranteed to be: a Voronoi cell IS convex, but the cells are
 * CLIPPED to the island's hex-union boundary, which is not. On an L-shaped parcel the centroid
 * lands in the notch — outside the parcel — and the fan emits triangles wound the opposite way,
 * which draw as an inside-out parcel that vanishes from above under backface culling. That was
 * not reasoned about; it was caught by the `non-convex L` fixture in this module's tests, which
 * is kept precisely so nobody simplifies this back to a fan.
 *
 * Ear clipping makes no convexity assumption at all. The ring is normalised to the negative
 * (upward) winding first, so every emitted triangle inherits it and the caller never has to ask
 * which way round the scene handed the parcel in.
 */
export function triangulateRing(ring: readonly P2[]): [P2, P2, P2][] {
  const pts = normalisedRing(ring);
  const out: [P2, P2, P2][] = [];
  // ⚠ NOT a copy. `rest` is only ever REASSIGNED, never mutated in place, so aliasing `pts` here
  // cannot reach the caller's ring — and a defensive `.slice()` would be an allocation no test
  // could ever justify.
  let rest: readonly P2[] = pts;

  // ⚠⚠ THE PASS COUNT IS KNOWN BEFORE THE LOOP STARTS, AND THAT IS THE POINT OF THIS SHAPE.
  // Written the obvious way — `while (rest.length > 3)` with a `clipped` flag and a `break` —
  // termination is DISCOVERED by the body rather than guaranteed by the loop, and six separate
  // mutations of that body (dropping the splice, pinning the flag, emptying the block) turn it
  // into an infinite loop. A mutation sweep reported all six as TIMEOUTS: real detections, but
  // detections the rung cannot attribute to any test, because no test failed — the suite simply
  // hung. Counting the passes up front converts every one of them into an ordinary wrong answer
  // that area conservation catches, which is a far better thing to be held by than a stopwatch.
  //
  // The bound is `pts` itself, iterated for its LENGTH alone — its values are never read. n is a
  // safe ceiling rather than an exact count: clipping stops on its own once fewer than three
  // vertices remain (no corner of a two-vertex ring is an ear), so the last few passes are no-ops
  // and the fan below emits whatever the clipping did not.
  for (const _unused of pts) {
    const ear = earIndex(rest);
    // No ear: the ring is degenerate (collinear or repeated vertices), or it is down to its last
    // two vertices. Stop and let the fan below emit what is left — for a degenerate ring that is
    // zero-area and therefore harmless.
    // ⚠ `null`, not `-1`. A numeric sentinel invites `return -1` → `return +1`, which reads as a
    // VALID index, silently turns "no ear here" into "clip vertex 1", and produces a plausible
    // wrong triangulation of a degenerate ring rather than an obvious failure.
    if (ear === null) break;
    const a = rest[(ear + rest.length - 1) % rest.length]!;
    const b = rest[ear]!;
    const c = rest[(ear + 1) % rest.length]!;
    out.push([a, b, c]);
    rest = [...rest.slice(0, ear), ...rest.slice(ear + 1)];
  }

  // Whatever survived the clipping, as a fan from its first vertex. On a well-formed ring the
  // clipping has already consumed everything and this emits nothing.
  // ⚠ Driven by the array rather than by a counter: `for (let i = …; i += 1)` invites `i -= 1`,
  // which does not produce a wrong answer — it produces an INFINITE LOOP, and a suite that hangs
  // is a detection no rung can attribute to a test.
  // ⚠ THE TWO `!== undefined` GUARDS BELOW CAN NEVER BE FALSE, and they are here only because
  // `noUncheckedIndexedAccess` types an index access as possibly-undefined. `tail` is empty
  // unless `rest.length >= 3`, so `rest[0]` exists whenever the callback runs at all; and `i`
  // ranges over `tail` (length `rest.length - 2`), so `i + 2` tops out at `rest.length - 1`.
  // Both are marked EQUIVALENT rather than tested for, because the branch a test would have to
  // reach does not exist — asserting on it would mean weakening the types to manufacture it.
  const tail = rest.slice(1, -1);
  const first = rest[0];
  // Stryker disable next-line ConditionalExpression: EQUIVALENT — `tail` is non-empty only when
  // `rest.length >= 3`, so `rest[0]` is always defined by the time this runs.
  if (first !== undefined) {
    tail.forEach((v, i) => {
      const next = rest[i + 2];
      // Stryker disable next-line ConditionalExpression: EQUIVALENT — `i` indexes `tail`, whose
      // length is `rest.length - 2`, so `i + 2` never exceeds `rest.length - 1`.
      if (next !== undefined) out.push([first, v, next]);
    });
  }
  return out;
}

/** The index of a vertex of `rest` that is an ear, or -1 if the ring has none.
 *
 *  An ear is a corner that is CONVEX (for the module's negative winding, a strictly negative
 *  turn — which is why a collinear corner is not one) and whose triangle SWALLOWS no other vertex
 *  of the ring. The second condition is what makes ear clipping safe on a shape a fan is not:
 *  without it a corner across a notch looks locally convex and its triangle covers ground the
 *  polygon does not.
 *
 *  Returns `null` when the ring has no ear at all. */
function earIndex(rest: readonly P2[]): number | null {
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[(i + rest.length - 1) % rest.length]!;
    const b = rest[i]!;
    const c = rest[(i + 1) % rest.length]!;
    if (signedTriangleArea2(a, b, c) >= 0) continue;
    let contains = false;
    for (let j = 0; j < rest.length; j += 1) {
      if (j === i || j === (i + rest.length - 1) % rest.length || j === (i + 1) % rest.length) continue;
      if (pointInTriangle(rest[j]!, a, b, c)) {
        contains = true;
        break;
      }
    }
    if (!contains) return i;
  }
  return null;
}

/**
 * Build the merged ground buffer for a set of `cell-ground` descriptors.
 *
 * Per parcel: an ear-clipped top face at y = 0, then a wall quad per ring edge falling to
 * y = -depth. Winding is settled ONCE, here — `worldTo3D` passes the scene's ring on untouched
 * — so there is no second normalisation anywhere to disagree with this one.
 */
export function cellGroundGeometry(input: CellGroundGeometryInput): CellGroundGeometry {
  const depth = input.depth ?? CELL_GROUND_DEPTH;
  const relief = input.relief ?? FLAT_GROUND;
  /** A ring vertex raised onto the field. */
  const lift = (p: P2): P3 => ({ x: p.x, y: relief.height(p.x, p.z), z: p.z });
  /** The field's unit normal there — analytic, so it is the surface's own answer rather than a
   *  finite difference over whatever step someone happened to pick. */
  const facing = (p: P2): P3 => relief.normal(p.x, p.z);
  // ⚠ Mapped from the descriptors THEMSELVES, never re-indexed alongside a parallel array: an
  // index lookup here would be a second way to get the material wrong, and the parcel's colour is
  // what the map reports a capability's state with.
  const rings = input.cells.flatMap((c) =>
    c.points !== undefined && c.points.length >= 3 ? [{ pts: c.points, material: c.material }] : [],
  );

  let triangles = 0;
  for (const r of rings) triangles += cellGroundTriangles(r.pts.length);

  const positions = new Float32Array(triangles * 9);
  const normals = new Float32Array(triangles * 9);
  const colors = new Float32Array(triangles * 9);
  // ⚠ ONE float per VERTEX, where the three above carry three. It is a row number, not a colour,
  // and sizing it like a colour would silently leave two thirds of it as zeros — row 0, a real
  // status — which is the failure mode that looks exactly like working code.
  const statuses = input.index === undefined ? new Float32Array(0) : new Float32Array(triangles * 3);
  let w = 0;

  /** Write one triangle with an EXPLICIT normal per vertex — the top face's route, because the
   *  relief's normal is analytic and belongs to the point rather than to the facet.
   *
   *  ⚠ The colour is a PARAMETER rather than a mutable variable this closure reads. It was the
   *  latter until a mutation sweep showed its initial value could be anything at all without a
   *  test noticing — true, because every parcel overwrites it first, which is exactly the
   *  argument for not having one. */
  const pushTriangleWithNormals = (
    vertices: readonly [P3, P3, P3],
    vertexNormals: readonly [P3, P3, P3],
    colour: LinearRgb,
    row: number,
  ): void => {
    for (let i = 0; i < 3; i += 1) {
      const p = vertices[i]!;
      const n = vertexNormals[i]!;
      positions[w] = p.x;
      positions[w + 1] = p.y;
      positions[w + 2] = p.z;
      normals[w] = n.x;
      normals[w + 1] = n.y;
      normals[w + 2] = n.z;
      colors[w] = colour.r;
      colors[w + 1] = colour.g;
      colors[w + 2] = colour.b;
      // ⚠ THE ROW IS WRITTEN HERE, BESIDE THE COLOUR, RATHER THAN AS A SPAN AFTERWARDS. The span
      // form — remember `w` before the parcel, fill up to `w` after — was the first shape and it
      // was UNPROVABLE: because parcels are written in order, an off-by-one at either end is
      // immediately overwritten by the next parcel, so both boundary mutants survived the whole
      // suite. Writing it per vertex removes the arithmetic that could be off by one at all, and
      // makes "the row and the colour describe the same parcel" true by construction rather than
      // by two pieces of bookkeeping agreeing.
      //
      // With no `index` resolver `statuses` is zero-length and every one of these is a silent
      // no-op on a typed array — which is the honest outcome: the caller asked for no rows.
      statuses[w / 3] = row;
      w += 3;
    }
  };

  /** Write one triangle, deriving its normal from the very vertices being written — the WALLS'
   *  route, and the reason a positions/normals disagreement stays unrepresentable there. */
  const pushTriangle = (a: P3, b: P3, c: P3, colour: LinearRgb, row: number): void => {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    // ⚠ THIS USED TO CARRY A `Stryker disable … EQUIVALENT` ANNOTATION AND NO LONGER MAY. The
    // argument was that every face reaching here is either a top (a.y = c.y = 0) or a wall whose
    // `a` and `c` share a height, so `-` and `+` differ only by a scale the normalisation below
    // removes. Relief falsifies both halves: tops leave this function entirely now, and a wall's
    // corners stand at whatever heights the field gives them. A stale equivalence claim is worse
    // than no claim — it suppresses a mutant that a test can and does now kill.
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    const n: P3 = { x: nx, y: ny, z: nz };
    pushTriangleWithNormals([a, b, c], [n, n, n], colour, row);
  };

  for (const ring of rings) {
    const colour = input.resolve(ring.material);
    // ⚠ RESOLVED FROM THE DESCRIPTOR'S OWN MATERIAL, exactly as the colour beside it is, and
    // 0 when the caller asked for no rows — a value that reaches only a zero-length array.
    const row = input.index?.(ring.material) ?? 0;
    const pts = normalisedRing(ring.pts.map((p) => ({ x: p.x, z: p.z })));
    const n = pts.length;

    // The top face, standing on the relief field. `lift` and `facing` are the identity for a
    // caller that supplies none, so this line is the flat ground verbatim when relief is absent.
    for (const [a, b, c] of triangulateRing(pts)) {
      pushTriangleWithNormals(
        [lift(a), lift(b), lift(c)],
        [facing(a), facing(b), facing(c)],
        colour,
        row,
      );
    }

    // The walls. ⚠ THE OUTWARD DIRECTION IS READ OFF THE RING'S OWN WINDING, not off the parcel's
    // centroid: with `pts` normalised, edge A→B faces `(-dz, 0, dx)` and that is a LOCAL fact
    // about the edge. A centroid test would be wrong for exactly the parcels ear clipping exists
    // for — on an L-shaped parcel the centroid sits in the notch, outside the shape, so "away
    // from the centre" points INTO the parcel along the notch edges.
    //
    // ⚠ THE UNDERSIDE FOLLOWS THE RELIEF RATHER THAN STAYING FLAT, and that is a correctness
    // requirement, not a preference. The field reaches ±4.22 units at the authored amplitude
    // while the prism is 3 deep, so a bottom pinned at `-depth` would sit ABOVE the top face
    // wherever the land dips — every wall there inside out, and the parcel gone from above.
    // A constant-thickness slab also keeps the two substrates telling the same story: the
    // classic hex prism is `TILE_HEIGHT` thick and so is this, everywhere.
    for (let i = 0; i < n; i += 1) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const top = lift(a);
      const topNext = lift(b);
      const bot: P3 = { x: top.x, y: top.y - depth, z: top.z };
      const botNext: P3 = { x: topNext.x, y: topNext.y - depth, z: topNext.z };
      pushTriangle(topNext, top, botNext, colour, row);
      pushTriangle(botNext, top, bot, colour, row);
    }
  }

  return { positions, normals, colors, statuses, cells: rings.length, triangles };
}
