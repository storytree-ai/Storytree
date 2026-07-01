// world-to-3d.ts — ADR-0123 THIRD forest-world mapper: pure deterministic mapping
// from the @storytree/forest-world semantic scene graph to typed 3D instance
// descriptors. No React, no three.js — node:test-provable (the provability firewall).
//
// The mapper consumes the SEMANTIC LAYER (SceneKind / status / position), never the
// 2D SVG primitives. It supplies its own 3D geometry family for each core kind:
//   tile        → hex-ground   (extruded/instanced hex mesh)
//   tree        → story-tree   (3D story tree)
//   road        → road-strip   (path strip on the ground plane)
//   wisp        → wisp-sprite  (GPU point / sprite)
//
// All other SceneKinds yield { kind: 'skipped', sceneKind } — explicit, never a
// throw, never a silent drop. Total coverage is the invariant.

import type { SceneG, SceneNode } from '@storytree/forest-world';

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
export type InstanceKind = 'hex-ground' | 'story-tree' | 'road-strip' | 'wisp-sprite';

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
   *  story-tree); absent on families that don't carry a territory status. */
  material?: string;
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
function parseTranslate(t: string): { x: number; y: number } {
  const m = /translate\(\s*([-\d.]+)\s+([-\d.]+)/.exec(t);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}

/** Recursively walk a scene node, emitting descriptors into `out`.
 *  `parentXY` carries the accumulated 2D translation from ancestor `<g>` nodes;
 *  it is used to position wisp-sprites at their territory's centroid (the centroid
 *  lives on the `wisps` group's translate, one level above the individual `wisp`). */
function walkNode(
  node: SceneNode,
  out: Descriptor3D[],
  parentXY: { x: number; y: number },
): void {
  const kind = node.kind;

  // Leaf nodes (path / circle / ellipse / polygon / rect / text) carry no children.
  // Emit a skip for any that have a kind; return immediately.
  if (node.el !== 'g') {
    if (kind) out.push({ kind: 'skipped', sceneKind: kind });
    return;
  }

  // Accumulate this node's translation so children (especially wisp-sprites) can
  // inherit the centroid position from their enclosing `wisps` group.
  const myXY = node.transform ? parseTranslate(node.transform) : { x: 0, y: 0 };
  const childXY = { x: parentXY.x + myXY.x, y: parentXY.y + myXY.y };

  // Emit a descriptor for this node.
  switch (kind) {
    case 'tile':
      // Classic extruded-hex ground tile → hex-ground instance.
      // The hex centre is baked into the child path geometry; the group itself carries
      // no translate, so childXY is the accumulated parent offset (0 in the classic
      // ground, since ground-hex has no translate either). Material = territory status.
      out.push({
        kind: 'hex-ground',
        transform: { x: childXY.x, y: 0, z: childXY.y },
        group: 'hex-ground',
        material: node.status ?? 'unknown',
      });
      break;

    case 'tree':
      // The central story tree → story-tree instance. The tree group carries a
      // `translate(treeSpot.x treeSpot.y)` which is folded into childXY.
      out.push({
        kind: 'story-tree',
        transform: { x: childXY.x, y: 0, z: childXY.y },
        group: 'story-tree',
        material: node.status ?? 'unknown',
      });
      break;

    case 'road':
      // A `depends_on` road → road-strip instance. The road geometry lives in the
      // child road-line path's `d`; no translate on the group itself.
      out.push({
        kind: 'road-strip',
        transform: { x: childXY.x, y: 0, z: childXY.y },
        group: 'road-strip',
      });
      break;

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
    walkNode(child, out, childXY);
  }
}

// ---------------------------------------------------------------------------
// The public mapping function
// ---------------------------------------------------------------------------

/**
 * Maps a `buildScene` output (the @storytree/forest-world semantic scene graph) to
 * a flat array of typed 3D instance descriptors — the ADR-0123 provability firewall.
 *
 * Core kind families emit `InstanceDescriptor` objects:
 * - `tile`  → `hex-ground`   (extruded hex mesh; material = territory SceneStatus)
 * - `tree`  → `story-tree`   (3D story-tree mesh; material = territory SceneStatus)
 * - `road`  → `road-strip`   (path strip on the ground plane)
 * - `wisp`  → `wisp-sprite`  (GPU sprite / point)
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
