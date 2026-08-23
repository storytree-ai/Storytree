// flower-descriptors.ts — THE UAT FLOWERS for the live-render experiment, inside the
// provability firewall (pure, no React, no three.js, node:test-provable).
//
// WHY THIS IS A SEPARATE FAMILY FROM `plant-descriptors.ts`, AND WHY IT READS SO MUCH MORE.
// Vegetation carries no meaning: ADR-0226 D2 gives its signal to the COUNT of plants, so a
// plant descriptor takes only a FOOTPRINT off the scene and the live generator regrows the
// shape from a seed. A flower is the opposite. ADR-0226 D4 puts one flower on the island per
// UAT criterion, 1:1, and reads the verdict OFF THE FORM — a bloomed daisy is proven, a
// closed bud is pending, a wilted nodding head is failing. The shape IS the claim.
//
// So a live flower may not be regrown from a seed. It is READ: the wrapper's kind carries the
// state, and every petal angle, petal length, leaf placement, stalk curve and bud extent is
// taken from the marks the SVG surface actually authored in `scene.ts`'s `tallFlowerMarks`.
// A generator that invented its own daisy would be free to drift, and the day it drifted far
// enough that a bud read as a bloom, the island would be asserting a proof state the work does
// not hold — the ADR-0367 D5 failure, arrived at through art rather than through data.
//
// THE STANDING COROLLARY, RESTATED WHERE IT COULD BE BROKEN: NEVER ANIMATE A FLOWER. Motion
// that changes silhouette blurs the three verdict shapes into each other, which is the
// ADR-0045 honesty wall. Grass may animate. These may not. Nothing in this module or in
// `flower-geometry.ts` takes a time parameter, and that is the enforcement — there is no clock
// to pass.
//
// THE PROJECTION TRAP IS THE SAME ONE THE LAND HAS. `buildScene` emits coordinates that are
// ALREADY PROJECTED at `LAND_CAMERA_ELEVATION_DEG`. A flower's POSITION is a ground point, so
// it unprojects by `sin(elev)`; its HEIGHT is an upright mark's drawn height, so it recovers
// by `cos(elev)`; its WIDTH is a ground span in x and does not foreshorten at all. Using the
// ground flattening where the upright one belongs is the error that made every plant 2.75x too
// tall, and it is silent. This module returns the drawn SVG numbers untouched and names which
// axis each one is, so the recovery happens once, in `flower-geometry.ts`, against the two
// helpers `camera.ts` supplies for exactly this.

import type { SceneG, SceneNode } from '@storytree/forest-world';

/** A UAT criterion's proof state, exactly as `scene.ts` encodes it in the marker wrapper's
 *  kind. This is the whole semantic payload; everything else here is drawing. */
export type FlowerState = 'proven' | 'pending' | 'failing';

/** One petal, as the surface authored it: an ellipse rooted at the head and rotated into
 *  place. `angleDeg` is an SVG rotation about the head — clockwise from twelve o'clock,
 *  because SVG's y runs down. */
export interface FlowerPetal {
  angleDeg: number;
  /** Half the ellipse's long axis: how far the petal reaches from the head centre. */
  length: number;
  /** Half the ellipse's short axis: how broad the petal is. */
  halfWidth: number;
}

/** One stalk leaf, as authored: a small ellipse offset from the stalk and angled up-and-out. */
export interface FlowerLeaf {
  /** Local position relative to the marker's planted base, in wrapper units. */
  x: number;
  y: number;
  rx: number;
  ry: number;
  angleDeg: number;
}

/** The marker's 2D extent in world (SVG) px, and its centre — the same matched-footprint
 *  contract the plants carry, so a delivery claim about a flower is about DETAIL not size. */
export interface FlowerFootprint {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** One placed UAT flower, ready for a live generator to build. All local geometry is in
 *  WRAPPER units (before `scale`); everything is in the scene's PROJECTED space. */
export interface FlowerInstance {
  kind: 'flower-instance';
  /** The UAT criterion this marker is, 1:1 (ADR-0226 D4). */
  criterion: string;
  /** The verdict, read from the wrapper's kind. */
  state: FlowerState;
  /** Ground position: SVG x → 3D x (east), SVG y → 3D z (depth), still PROJECTED. */
  transform: { x: number; y: number; z: number };
  /** The wrapper's uniform scale (`MARKER_SCALE` / `MARKER_SCALE_SMALL`). */
  scale: number;
  /** The head's local offset from the planted base. SVG y runs DOWN, so `y` is negative for
   *  an upright flower and less negative for a failing one, which sinks as it nods. */
  head: { x: number; y: number };
  /** The stalk, as its authored cubic: base, two controls, head. */
  stem: { p0: Pt2; c1: Pt2; c2: Pt2; p3: Pt2; strokeWidth: number } | null;
  /** Petals, in authored order. Empty for `pending`, which draws a bud instead. */
  petals: FlowerPetal[];
  /** The centre disc's radius; 0 when there is none. */
  centreRadius: number;
  /** The closed bud, as its authored cubic: tip, two controls, base (the stalk's head point).
   *  Kept as the CURVE rather than as a box because a bud's silhouette IS the pending verdict
   *  (ADR-0226 D4), and a box would hand the generator the control-point hull — 2.9 units wide
   *  against the curve's true 2.14 — so the live bud would be a third fatter than the authored
   *  one for a reason no reader would ever find. */
  bud: { p0: Pt2; c1: Pt2; c2: Pt2; p3: Pt2 } | null;
  leaves: FlowerLeaf[];
  footprint: FlowerFootprint;
  /** How many marks the SVG surface spends on this flower — the sprite path's own budget. */
  marks: number;
}

interface Pt2 {
  x: number;
  y: number;
}

/** Numbers in a path `d`, paired as coordinates — the same recovery `plant-descriptors.ts`
 *  and `island-descriptors.ts` make, and correct here for the identical reason: the surface
 *  emits `M`/`L`/`C` with explicit coordinates, so pairing the numeric stream recovers the
 *  vertices and the control points in authored order. */
function pathPoints(d: string): Pt2[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const pts: Pt2[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: parseFloat(nums[i]!), y: parseFloat(nums[i + 1]!) });
  }
  return pts;
}

function parseTranslate(t: string | undefined): Pt2 {
  if (!t) return { x: 0, y: 0 };
  const m = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(t);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}

/** The uniform `scale(k)` term of a wrapper transform, 1 when absent. The marker wrapper is
 *  the only place the surface uses one, and it is always uniform. */
function parseScale(t: string | undefined): number {
  if (!t) return 1;
  const m = /scale\(\s*([-\d.]+)/.exec(t);
  return m ? parseFloat(m[1]!) : 1;
}

/** The angle of a `rotate(a cx cy)` term, 0 when absent. */
function parseRotate(t: string | undefined): number {
  if (!t) return 0;
  const m = /rotate\(\s*([-\d.]+)/.exec(t);
  return m ? parseFloat(m[1]!) : 0;
}

const STATE_OF_KIND: ReadonlyMap<string, FlowerState> = new Map([
  ["tall-flower-proven", 'proven'],
  ["tall-flower-pending", 'pending'],
  ["tall-flower-failing", 'failing'],
]);

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY_BOX: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

function grow(box: Box, x: number, y: number): Box {
  return {
    minX: Math.min(box.minX, x),
    minY: Math.min(box.minY, y),
    maxX: Math.max(box.maxX, x),
    maxY: Math.max(box.maxY, y),
  };
}

/** Fold one marker wrapper into a flower instance, or `null` when it drew nothing measurable.
 *
 *  THE GLOW AND THE GROUND SHADOW ARE READ AND DISCARDED, DELIBERATELY, and each for its own
 *  reason. The glow is drawn at opacity 0.10/0.16, and a blend of two palette entries is a
 *  colour on neither — the one thing a constructed palette cannot represent, so it is dropped
 *  rather than approximated (`palette-band.ts`, `MARKER_TOKENS`). The contact shadow is not
 *  dropped on principle at all: the live island has NO shadows yet, and what one costs in
 *  palette entries is the open `shadow-ladder-is-admissible-and-affordable` increment's
 *  question, not this one's. Both still count toward `marks`, because that number is the SVG
 *  surface's own budget and under-reporting it would flatter the live path. */
function flowerOf(node: SceneG, at: Pt2): FlowerInstance | null {
  const state = STATE_OF_KIND.get(node.kind ?? '');
  if (!state) return null;

  const t = parseTranslate(node.transform);
  const scale = parseScale(node.transform);
  const here = { x: at.x + t.x, y: at.y + t.y };

  let box = EMPTY_BOX;
  let marks = 0;
  let stem: FlowerInstance['stem'] = null;
  const petals: FlowerPetal[] = [];
  const leaves: FlowerLeaf[] = [];
  let centreRadius = 0;
  let bud: FlowerInstance['bud'] = null;
  let head: Pt2 | null = null;

  for (const child of node.children) {
    marks++;
    switch (child.kind) {
      case 'tall-flower-stem': {
        if (child.el !== 'path') break;
        const pts = pathPoints(child.d);
        // `M p0 C c1, c2, p3` — four pairs, in that order. Fewer means the surface changed
        // shape, and guessing at a partial curve would put a stalk somewhere it was not
        // authored; a flower with no stalk still renders its head, which is the part the
        // verdict is read from.
        if (pts.length >= 4) {
          stem = {
            p0: pts[0]!,
            c1: pts[1]!,
            c2: pts[2]!,
            p3: pts[3]!,
            strokeWidth: child.strokeWidth ?? 1,
          };
          head = pts[3]!;
        }
        for (const p of pts) box = grow(box, p.x, p.y);
        break;
      }
      case 'tall-flower-leaf': {
        if (child.el !== 'ellipse') break;
        leaves.push({
          x: child.cx,
          y: child.cy,
          rx: child.rx,
          ry: child.ry,
          angleDeg: parseRotate(child.transform),
        });
        box = grow(box, child.cx - child.rx, child.cy - child.ry);
        box = grow(box, child.cx + child.rx, child.cy + child.ry);
        break;
      }
      case 'tall-flower-petal': {
        if (child.el !== 'ellipse') break;
        // The surface roots a petal at `(headX, headY - plen)` with `ry = plen`, so the
        // ellipse's own centre sits ONE HALF-LENGTH out along the petal and its inner tip
        // touches the head: `length` here is the HALF-length, and the petal REACHES twice it.
        // Reading `ry` rather than re-deriving the reach from where the ellipse landed keeps
        // the petal the size it was authored, whatever the wrapper does around it.
        petals.push({
          angleDeg: parseRotate(child.transform),
          length: child.ry,
          halfWidth: child.rx,
        });
        box = grow(box, child.cx - child.rx, child.cy - child.ry);
        box = grow(box, child.cx + child.rx, child.cy + child.ry);
        break;
      }
      case 'tall-flower-center': {
        if (child.el !== 'circle') break;
        centreRadius = child.r;
        head = { x: child.cx, y: child.cy };
        box = grow(box, child.cx - child.r, child.cy - child.r);
        box = grow(box, child.cx + child.r, child.cy + child.r);
        break;
      }
      case 'tall-flower-bud': {
        if (child.el !== 'path') break;
        const pts = pathPoints(child.d);
        if (!pts.length) break;
        for (const p of pts) box = grow(box, p.x, p.y);
        // `M tip C c1, c2, base C c3, c4, tip` — the path runs from the TIP down one side to
        // the planted head point and back up the other, symmetric about the stalk. The first
        // four pairs are the whole silhouette; the return half mirrors them.
        if (pts.length >= 4) {
          bud = { p0: pts[0]!, c1: pts[1]!, c2: pts[2]!, p3: pts[3]! };
          head = pts[3]!;
        }
        break;
      }
      default:
        // `shadow` and `tall-flower-glow` land here: counted as budget, drawn by nobody. See
        // the note above this function for why each one is out.
        break;
    }
  }

  if (!Number.isFinite(box.minX)) return null;

  return {
    kind: 'flower-instance',
    criterion: node.id ?? '',
    state,
    // The marker stands at its own planted base — the wrapper point, which is where the
    // surface put the stalk's `M 0 0`. A flower planted at its bounding-box centre would
    // float, exactly as a plant would.
    transform: { x: here.x, y: 0, z: here.y },
    scale,
    head: head ?? { x: 0, y: 0 },
    stem,
    petals,
    centreRadius,
    bud,
    leaves,
    // Scaled into world px: the wrapper's own `scale` is part of how big the marker IS, and a
    // footprint that ignored it would compare a flower against plants measured in world units.
    footprint: {
      cx: here.x + ((box.minX + box.maxX) / 2) * scale,
      cy: here.y + ((box.minY + box.maxY) / 2) * scale,
      w: (box.maxX - box.minX) * scale,
      h: (box.maxY - box.minY) * scale,
    },
    marks,
  };
}

/** Recursively collect every UAT flower marker under a scene node. */
function collect(node: SceneNode, at: Pt2, out: FlowerInstance[]): void {
  if (node.el !== 'g') return;
  const t = parseTranslate(node.transform);
  const here = { x: at.x + t.x, y: at.y + t.y };

  if (node.kind && STATE_OF_KIND.has(node.kind)) {
    // The wrapper's own translate is re-read inside `flowerOf`, so pass the PARENT
    // accumulation to avoid counting it twice — the same shape `plant-descriptors.ts` uses.
    const flower = flowerOf(node, at);
    if (flower) out.push(flower);
    return;
  }

  for (const child of node.children) collect(child, here, out);
}

/**
 * Every placed UAT flower in a `buildScene` output, as live-renderable instances.
 *
 * Deterministic: same scene in, byte-identical array out, in scene-graph order — which for
 * markers is the surface's own y-sort, so the array is already back-to-front.
 *
 * DELIBERATELY SEPARATE from `worldTo3D`, for the same reason `plantsFrom` is: that function's
 * contract is total coverage of the STRUCTURAL families with an explicit, tested skip for
 * everything else — including these markers by name — and widening it would change a contract
 * the website's synced copy depends on, for an experiment whose ADOPTION is a separate event
 * and the owner's (ADR-0380 D6).
 */
export function flowersFrom(scene: SceneG): FlowerInstance[] {
  const out: FlowerInstance[] = [];
  collect(scene, { x: 0, y: 0 }, out);
  return out;
}
