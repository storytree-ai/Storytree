// world-to-3d.ts — ADR-0123 THIRD forest-world mapper: pure deterministic mapping
// from the @storytree/forest-world semantic scene graph to typed 3D instance
// descriptors. No React, no three.js — node:test-provable (the provability firewall).
//
// The mapper consumes the SEMANTIC LAYER (SceneKind / status / position), never the
// 2D SVG primitives. It supplies its own 3D geometry family for each core kind:
//   tile        → hex-ground        (extruded/instanced hex mesh)
//   cell        → cell-ground       (extruded parcel prism, the RELAXED-MESH substrate)
//   cell-wheat  → cell-ground       (ditto — wheat is a 2D look, not a different ground)
//   tree        → story-tree        (3D story tree)
//   trail-fill  → trail-strip       (routed ribbon strip on the ground plane, ADR-0169 §4)
//   trail-ghost → trail-ghost-strip (the under-island run — surfaces may skip it)
//   cave        → cave-arch         (the forced-route portal prop at the rim bearing)
//   wisp        → wisp-sprite       (GPU point / sprite)
//
// Only the trail FILL pass carries geometry into 3D — the shadow/casing passes are
// the 2D cased look, which the ribbon supplies itself; they skip explicitly.
//
// All other SceneKinds yield { kind: 'skipped', sceneKind } — explicit, never a
// throw, never a silent drop. Total coverage is the invariant.
//
// ⚠⚠ THE TWO GROUND SUBSTRATES, AND WHY BOTH CASES EXIST. `@storytree/forest-world`
// emits ground in one of two shapes (`scene.ts:658`): the CLASSIC extruded-hex island
// (`tile` groups, used when `relaxedCells` is null) and the RELAXED MESH the studio
// actually ships (`cell` / `cell-wheat` paths, one per parcel). Between ADR-0123 and
// 2026-08-28 this mapper had a case for the first only, so for an island of the shape
// the product draws it emitted NO GROUND AT ALL — 164 cells fell through to the default
// skip and the shipped canvas rendered one story tree over empty space. That was
// measured, pinned and pictured by `adopt-the-land-into-the-shipped-map-arc-inc-01`
// (PR #1679, `docs/research/chapter2-shipped-baseline-2026-08-28/`).
//
// ⚠ `cell-ground` IS DELIBERATELY THE SAME FIDELITY AS `hex-ground` — a flat prism
// wearing the parcel's folded status colour. It is the representation the mapper always
// intended to draw, arriving in the shape the product now emits it. It is NOT the land
// treatment `adopt-the-land-into-the-shipped-map-arc` is carrying toward this surface:
// no relief, no grain, no coast smoothing, no stepped skirt, no terrain. Adoption stays
// a separate, deliberate event (ADR-0380 D6 / ADR-0406 D2) with the ADR-0418 D4
// replacement check as its precondition — do not graft the treatment in here.

import { trailFillWidth, type Pt, type SceneG, type SceneNode, type ScenePath } from '@storytree/forest-world';

// ---------------------------------------------------------------------------
// Descriptor types — the provability-firewall output contract
// ---------------------------------------------------------------------------

/** A 3D world-space position. Coordinate convention: SVG x → 3D x (east),
 *  SVG y → 3D z (depth/south), 3D y is up. */
export interface Transform3D {
  x: number;
  y: number;
  z: number;
}

/** The 3D mesh family a mapped scene node belongs to. */
export type InstanceKind =
  | 'hex-ground'
  | 'cell-ground'
  | 'story-tree'
  | 'trail-strip'
  | 'trail-ghost-strip'
  | 'cave-arch'
  | 'wisp-sprite';

/** An instance descriptor: maps one core-family scene node to a 3D mesh instance.
 *  The discriminating `kind` is always an InstanceKind (never 'skipped'). */
export interface InstanceDescriptor {
  kind: InstanceKind;
  /** The world-space 3D transform for this instance. */
  transform: Transform3D;
  /** The instancing group — all descriptors with the same group share a mesh + material
   *  family (maps to an `<Instances>` group in the R3F canvas). */
  group: string;
  /** The material variant, derived from the territory's folded SceneStatus (e.g.
   *  'healthy' / 'unhealthy' / 'proposed'). Set for status-bearing families (hex-ground,
   *  cell-ground, story-tree, cave-arch); absent on families that don't carry a territory
   *  status. */
  material?: string;
  /** A ground-plane polyline: the family's own path as 3D points, in path order.
   *  On a `trail-strip` / `trail-ghost-strip` it is the segment's smoothed centreline —
   *  the ribbon the canvas lays on the ground; curve control points join the polyline
   *  (the pathPoints approximation). On a `cell-ground` it is the parcel's CLOSED RING,
   *  each vertex once and no repeated first point (`polyPath` closes with `Z`, which
   *  carries no coordinates). Absent on point-like families (hex-ground / story-tree /
   *  wisp-sprite / cave-arch), whose geometry is a primitive at `transform`. */
  points?: Transform3D[];
  /** Ribbon / portal-mouth width in world px. Trail strips: `trailFillWidth(usage)` —
   *  the ONE width rule every surface shares; cave-arch: the portal mouth width. */
  width?: number;
  /** Distinct edges routed through this trail segment (what `width` derives from). */
  usage?: number;
  /** True on an under-island ghost run (`trail-ghost-strip`) — surfaces may skip it. */
  hidden?: boolean;
  /** The stable trail segment id (`trail-strip` / `trail-ghost-strip`). */
  segment?: string;
  /** The `from->to` edge keys through this trail segment / cave portal — the
   *  reveal-by-focus metadata (ADR-0169 §3/§4): a surface filters strips to a focused
   *  island's incident edges without re-walking the graph. */
  edges?: string[];
  /** The cave portal's outward rim normal, radians in the SVG plane (`cave-arch` only).
   *  Under the x→east / y→depth convention, apply as a rotation of -bearing about +Y. */
  bearing?: number;
  /** The island a cave portal sits on (`cave-arch` only). */
  island?: string;
  /** THE OWNING CAPABILITY'S ID (`cell-ground` only) — which capability's parcel this
   *  cell belongs to.
   *
   *  ⚠ IT IS NOT DERIVABLE FROM ANYTHING ELSE ON THE DESCRIPTOR, which is why it is carried.
   *  `material` is the FOLDED status, so two capabilities in the same state are one value; the
   *  ring is geometry. Without this field a consumer can draw the ground and cannot say which
   *  capability any part of it reports on — so ADR-0475's ONE OBJECT PER CAPABILITY is not
   *  expressible, and neither is anything else that has to be counted per capability.
   *
   *  ⚠ ONLY EVER TAKEN FROM A GROUP THAT SAYS IT IS A PARCEL (`kind === 'parcel'`), never from
   *  any other `<g id=…>` — every group on an island carries an `id` for its own reasons (a
   *  territory, a trail edge, a hit target), and inheriting one of those would partition the
   *  land along lines that are not capability boundaries while looking entirely plausible. That
   *  rule is `groundCellsFrom`'s (`harness/island-descriptors.ts`) and is restated rather than
   *  re-derived; the two now read the same identity off the same place.
   *
   *  ABSENT on a substrate that has no parcel groups (the classic extruded-hex island, where a
   *  tile IS a territory) and on every non-`cell-ground` family. Absent is a real answer here —
   *  a consumer that needs per-capability identity must handle its absence rather than invent
   *  one. */
  parcel?: string;
}

/** A skip record: a scene node with no core 3D mapping. Never a throw, never a silent
 *  drop — the total-coverage guarantee. */
export interface SkippedDescriptor {
  kind: 'skipped';
  /** The original SceneKind, retained for audit / debugging. */
  sceneKind: string;
}

/** The discriminated union returned by `worldTo3D`. Discriminant: `kind`. */
export type Descriptor3D = InstanceDescriptor | SkippedDescriptor;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse a `translate(x y)` string (the format buildScene emits for transforms).
 *  Returns { x: 0, y: 0 } when the string is absent or unrecognised. */
function parseTranslate(t: string): Pt {
  const m = /translate\(\s*([-\d.]+)\s+([-\d.]+)/.exec(t);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}

/** All coordinate pairs in a path `d` string, in path order. The core emits M/L
 *  polylines (`hexPath` / `polyPath`) and M+C trail splines (`routeTrails` `d`s), so
 *  pairing the numeric stream recovers the vertices. On a curve command the control
 *  points join the polyline — spike-fidelity approximation, deterministic and total. */
function pathPoints(d: string): Pt[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: parseFloat(nums[i]!), y: parseFloat(nums[i + 1]!) });
  }
  return pts;
}

/** The mean of a point set — the exact centre of a regular polygon's vertices
 *  (the hex tile centre), the midpoint-ish anchor of a trail polyline. */
function centroidOf(pts: Pt[]): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

/** The first direct child path wearing one of `kinds` (where the core bakes a
 *  family's geometry: the tile's `tile-top`, the cave's `cave-arch` half-disc). */
function childPath(node: SceneG, ...kinds: string[]): ScenePath | null {
  for (const child of node.children) {
    if (child.el === 'path' && child.kind !== undefined && kinds.includes(child.kind)) {
      return child;
    }
  }
  return null;
}

/** Parse the `rotate(deg)` term of a transform string (the cave prop's rim bearing),
 *  returned in RADIANS. 0 when the term is absent. */
function parseRotate(t: string): number {
  const m = /rotate\(\s*([-\d.]+)/.exec(t);
  if (!m) return 0;
  return (parseFloat(m[1]!) * Math.PI) / 180;
}

/** Split a comma-joined `data-edges` value into edge keys ('' → []). */
function edgeKeys(edges: string | undefined): string[] {
  return (edges ?? '').split(',').filter((e) => e.length > 0);
}

/** Recursively walk a scene node, emitting descriptors into `out`.
 *  `parentXY` carries the accumulated 2D translation from ancestor `<g>` nodes;
 *  it is used to position wisp-sprites at their territory's centroid (the centroid
 *  lives on the `wisps` group's translate, one level above the individual `wisp`).
 *
 *  ⚠ `parentStatus` carries the nearest enclosing group's folded SceneStatus down, and it
 *  is REQUIRED rather than a convenience: on the relaxed-mesh substrate a plain parcel
 *  `cell` carries NO status of its own — the core puts it on the `<g kind="ground"
 *  status=…>` one level up (`scene.ts:3252` vs `:3254`). Read the cell alone and every
 *  parcel on the shipped map draws as `unknown`, which is a map that has stopped reporting
 *  (ADR-0392 D5 / ADR-0398 D7) rather than one that merely looks wrong. The parcels-present
 *  shape DOES stamp per-cell status (`scene.ts:1718`, per-capability rather than
 *  per-territory) and must WIN over the inherited value — hence `node.status ?? parentStatus`
 *  at every level, never the other way round.
 *
 *  ⚠ `parentParcel` carries the OWNING CAPABILITY'S ID down the same way, and it is taken ONLY
 *  from a group whose own `kind` is `parcel`. Every other `<g>` on an island carries an `id`
 *  for its own reasons, so reading `node.id` generally would partition the land along lines
 *  that are not capability boundaries — and it would do it invisibly, because the resulting
 *  picture is a perfectly ordinary island. Unlike status there is no per-cell restatement to
 *  prefer: a `cell` path carries no parcel of its own, so the inherited value is the only
 *  value. */
function walkNode(
  node: SceneNode,
  out: Descriptor3D[],
  parentXY: Pt,
  parentStatus?: string,
  parentParcel?: string,
): void {
  const kind = node.kind;
  const status = node.status ?? parentStatus;
  const parcel = kind === 'parcel' ? node.id ?? parentParcel : parentParcel;

  // Leaf nodes (path / circle / ellipse / polygon / rect / text) carry no children.
  // The trail FILL pass is the ribbon geometry source (ADR-0169 §4) — one strip per
  // visible segment; the ghost pass yields the under-island run as its own kind so a
  // surface can skip it. The shadow/casing passes (the 2D cased look) skip explicitly:
  // the 3D ribbon supplies its own look. All other kinded leaves skip.
  if (node.el !== 'g') {
    if (node.el === 'path' && (kind === 'trail-fill' || kind === 'trail-ghost')) {
      const pts = pathPoints(node.d);
      const mid = centroidOf(pts);
      const usage = node.usage ?? 1;
      const stripKind = kind === 'trail-fill' ? 'trail-strip' : 'trail-ghost-strip';
      // ANNOTATED local, then one guarded assignment — the shape
      // `anti-slop/no-conditional-empty-object-spread` requires.
      const strip: InstanceDescriptor = {
        kind: stripKind,
        transform: { x: parentXY.x + mid.x, y: 0, z: parentXY.y + mid.y },
        group: stripKind,
        points: pts.map((p) => ({ x: parentXY.x + p.x, y: 0, z: parentXY.y + p.y })),
        width: trailFillWidth(usage),
        usage,
        hidden: kind === 'trail-ghost',
        edges: edgeKeys(node.edges),
      };
      if (node.id !== undefined) strip.segment = node.id;
      out.push(strip);
      return;
    }
    // The RELAXED-MESH ground: one closed parcel ring per cell (`polyPath`, `scene.ts:3252`).
    // `cell-wheat` is the SAME ground wearing a 2D wheat look — the classic case already folds
    // its own `tile-top-wheat` into one `hex-ground`, so folding here keeps the two substrates
    // telling the same story rather than inventing a third drawable this surface has no idea
    // what to do with.
    if (node.el === 'path' && (kind === 'cell' || kind === 'cell-wheat')) {
      const ring = pathPoints(node.d).map((p) => ({ x: parentXY.x + p.x, y: 0, z: parentXY.y + p.y }));
      // A ring of fewer than three vertices bounds no area. Skipping rather than emitting a
      // degenerate parcel keeps `cell-ground` a family a consumer can always build a face from.
      if (ring.length < 3) {
        out.push({ kind: 'skipped', sceneKind: kind });
        return;
      }
      const c = centroidOf(ring.map((p) => ({ x: p.x, y: p.z })));
      // ⚠ THE RING IS PASSED ON IN THE SCENE'S OWN ORDER, winding included. A Voronoi relaxation
      // clipped to an island boundary guarantees neither a handedness nor convexity, and the
      // mapper deliberately does NOT normalise either: `cell-ground-geometry.ts` must be robust to
      // both anyway (it is exported on its own), and normalising in two places is how the two come
      // to disagree about which way is up. Winding is settled once, where it is tested.
      // ANNOTATED local, then one guarded assignment — the shape
      // `anti-slop/no-conditional-empty-object-spread` requires. `parcel` is left OFF rather
      // than set to a placeholder when the substrate has no parcel groups: a consumer must be
      // able to tell "this cell belongs to capability X" from "this substrate does not say".
      const cellDescriptor: InstanceDescriptor = {
        kind: 'cell-ground',
        transform: { x: c.x, y: 0, z: c.y },
        group: 'cell-ground',
        material: status ?? 'unknown',
        points: ring,
      };
      if (parcel !== undefined) cellDescriptor.parcel = parcel;
      out.push(cellDescriptor);
      return;
    }
    if (kind) out.push({ kind: 'skipped', sceneKind: kind });
    return;
  }

  // Accumulate this node's translation so children (especially wisp-sprites) can
  // inherit the centroid position from their enclosing `wisps` group.
  const myXY = node.transform ? parseTranslate(node.transform) : { x: 0, y: 0 };
  const childXY = { x: parentXY.x + myXY.x, y: parentXY.y + myXY.y };

  // Emit a descriptor for this node.
  switch (kind) {
    case 'tile': {
      // Classic extruded-hex ground tile → hex-ground instance. The tile group
      // carries NO translate — the core bakes the hex centre into the child
      // `tile-top` path's vertices — so the centre is recovered as the vertex
      // centroid (exact for a regular hex ring). Material = territory status.
      const top = childPath(node, 'tile-top', 'tile-top-wheat');
      const c = top ? centroidOf(pathPoints(top.d)) : { x: 0, y: 0 };
      out.push({
        kind: 'hex-ground',
        transform: { x: childXY.x + c.x, y: 0, z: childXY.y + c.y },
        group: 'hex-ground',
        material: status ?? 'unknown',
      });
      break;
    }

    case 'tree':
      // The central story tree → story-tree instance. The tree group carries a
      // `translate(treeSpot.x treeSpot.y)` which is folded into childXY.
      out.push({
        kind: 'story-tree',
        transform: { x: childXY.x, y: 0, z: childXY.y },
        group: 'story-tree',
        material: status ?? 'unknown',
      });
      break;

    case 'cave': {
      // A forced-route cave portal → a rim-mounted arch prop (ADR-0169 §2/§4). The
      // group's translate positions it (already folded into childXY); its rotate is
      // the outward rim normal in the SVG plane. The mouth width is recovered from
      // the baked arch half-disc (`M 0 -hw A hw …`, hw = width·1.6/2), round-tripping
      // the core's 0.1-rounding (±0.07 world px — placement fidelity, not survey data).
      // Material = the island's folded status (the shadow/side-wall hue family).
      const bearing = node.transform ? parseRotate(node.transform) : 0;
      const arch = childPath(node, 'cave-arch');
      const nums = arch ? arch.d.match(/-?\d+(?:\.\d+)?/g) : null;
      const hw = nums && nums[1] !== undefined ? Math.abs(parseFloat(nums[1])) : 0;
      // ANNOTATED local, then one guarded assignment — the shape
      // `anti-slop/no-conditional-empty-object-spread` requires.
      const archDescriptor: InstanceDescriptor = {
        kind: 'cave-arch',
        transform: { x: childXY.x, y: 0, z: childXY.y },
        group: 'cave-arch',
        material: status ?? 'unknown',
        bearing,
        width: (hw * 2) / 1.6,
        edges: edgeKeys(node.edges),
      };
      if (node.island !== undefined) archDescriptor.island = node.island;
      out.push(archDescriptor);
      break;
    }

    case 'wisp':
      // An individual in-flight build wisp → wisp-sprite GPU point.
      // `parentXY` (= childXY since wisp carries no own translate) holds the
      // centroid position inherited from the enclosing `wisps` group's translate.
      out.push({
        kind: 'wisp-sprite',
        transform: { x: childXY.x, y: 0, z: childXY.y },
        group: 'wisp-sprite',
      });
      break;

    default:
      // Non-core / structural node → explicit skip. Nodes with no kind at all
      // (anonymous <g> wrappers) produce no output; the `if (kind)` guard handles that.
      if (kind) out.push({ kind: 'skipped', sceneKind: kind });
      break;
  }

  // Always recurse into children so every descendant gets its own descriptor
  // (core descendants emit instances; non-core descendants emit skips).
  for (const child of node.children) {
    walkNode(child, out, childXY, status, parcel);
  }
}

// ---------------------------------------------------------------------------
// The public mapping function
// ---------------------------------------------------------------------------

/**
 * Maps a `buildScene` output (the @storytree/forest-world semantic scene graph) to
 * a flat array of typed 3D instance descriptors — the ADR-0123 provability firewall.
 *
 * Core kind families emit `InstanceDescriptor` objects, each POSITIONED from the
 * real World geometry (the faithfulness contract): the tile's baked hex centre
 * (vertex centroid of `tile-top`), the tree's `treeSpot` translate, the trail
 * segment's routed polyline (carried as `points` + a centroid anchor, width from
 * the ONE `trailFillWidth` rule), the cave's rim translate+rotate, the wisp's
 * territory centroid:
 * - `tile`        → `hex-ground`        (extruded hex mesh; material = territory SceneStatus)
 * - `tree`        → `story-tree`        (3D story-tree mesh; material = territory SceneStatus)
 * - `trail-fill`  → `trail-strip`       (ground-plane ribbon; usage/edges/segment metadata)
 * - `trail-ghost` → `trail-ghost-strip` (the under-island run — surfaces may skip it)
 * - `cave`        → `cave-arch`         (rim portal prop; bearing = rotation about Y)
 * - `wisp`        → `wisp-sprite`       (GPU sprite / point)
 *
 * Trail strips are REVEAL METADATA carriers (ADR-0169 §3/§4): every strip lists the
 * `from->to` edge keys routed through it, so a surface filters to a focused island's
 * incident edges — the descriptor layer never decides visibility; default-hidden is
 * the surface's call.
 *
 * All other SceneKinds emit `SkippedDescriptor` objects — never a throw, never a
 * silent drop (total-coverage invariant). The result is deterministic: the same
 * scene graph always produces a byte-identical descriptor array.
 */
export function worldTo3D(scene: SceneG): Descriptor3D[] {
  const out: Descriptor3D[] = [];
  walkNode(scene, out, { x: 0, y: 0 });
  return out;
}
