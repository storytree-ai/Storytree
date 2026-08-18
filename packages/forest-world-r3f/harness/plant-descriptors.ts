// plant-descriptors.ts — VEGETATION for the live-render experiment, inside the
// provability firewall (pure, no React, no three.js, node:test-provable).
//
// WHY THIS EXISTS AT ALL. `world-to-3d.ts` maps the land's STRUCTURE — hex ground, the
// story tree, trail ribbons, cave portals, wisps — and explicitly skips every flora kind:
// the spike renders "no vegetation". Vegetation is the entire subject of the chapter2
// organic-art arc, so a live-render experiment that cannot draw a plant cannot answer any
// of its three questions. This module supplies the missing family, WITHOUT widening the
// spike's structural mapper: it is additive and separately importable, so `worldTo3D`'s
// existing total-coverage contract and its tests are untouched.
//
// THE ONE FIELD THAT MATTERS IS `footprint`. The arc's headline finding is that a shrub
// delivers roughly TWELVE PIXELS, because the author-time sprite path is built on
// ONE GROUND UNIT = ONE DELIVERED PIXEL. Three independent instruments have now measured
// that the sprite path cannot escape it — hair/particle techniques, shading levers, and
// resolution (the 1x/2x/4x/8x ladder, which scales the SAME authored geometry and so
// authors no new detail at any rung). The live-render question is whether a renderer that
// draws at the DISPLAY's resolution unties detail from that budget.
//
// That comparison is only honest at a MATCHED FOOTPRINT. This arc has already nearly
// shipped the opposite conclusion once: raw hair candidates "delivered more pixels" than
// the hand-modelled dome purely because they were bigger objects — arithmetic wearing the
// costume of a technique win. So every plant descriptor carries the plant's own 2D extent
// in world/SVG px, measured from the marks the SVG surface actually draws. A live
// renderer sizes its mesh to that extent, and any delivery claim is then a claim about
// DETAIL AT A FIXED SIZE rather than about size.

import type { SceneG, SceneNode } from '@storytree/forest-world';

/** A plant's 2D extent in world (SVG) px — the box the SVG surface's own marks occupy.
 *  `w`/`h` are the matched-footprint contract; `cx`/`cy` are its centre. */
export interface Footprint2D {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** The coarse form family a placed plant wears, folded from the marks the theme authored.
 *  This is a DRAWING hint, never a semantic: ADR-0226 D2 gives the vegetation signal to
 *  the COUNT of plants, so a species that meant something would invent a channel under
 *  cover of an art change. `mixed` is a plant whose marks span families. */
export type PlantForm = 'blade' | 'shrub' | 'stem' | 'flower' | 'mixed';

/** One placed plant, ready for a live renderer to instance. */
export interface PlantInstance {
  kind: 'plant-instance';
  /** Ground position: SVG x → 3D x (east), SVG y → 3D z (depth). y is the ground plane. */
  transform: { x: number; y: number; z: number };
  /** The instancing group — plants sharing a group share a mesh and material family. */
  group: string;
  /** The parcel's folded status — the material's TOKEN family (palette-band.ts). */
  material: string;
  /** The parcel's surface theme (meadow / woodland / heath). */
  theme: string;
  /** The coarse form family, for mesh selection. Carries NO meaning (ADR-0226 D2). */
  form: PlantForm;
  /** The 2D extent the SVG surface's own marks occupy, in world px. THE matched-footprint
   *  contract — a live mesh is sized to this, so a delivery comparison is about detail. */
  footprint: Footprint2D;
  /** How many individual marks the SVG surface spends on this plant. The sprite path's own
   *  complexity budget, for the "what does the extra budget buy" comparison. */
  marks: number;
  /** The owning capability id, when the surface stamped one. */
  capability?: string;
}

/** Numbers in a path `d`, paired as coordinates. Shared shape with world-to-3d's
 *  `pathPoints`: the core emits M/L polylines and M+C splines, so pairing the numeric
 *  stream recovers the vertices (control points join the hull — a deliberate
 *  spike-fidelity approximation, and an OVER-estimate of extent never an under-one). */
function pathPoints(d: string): { x: number; y: number }[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: parseFloat(nums[i]!), y: parseFloat(nums[i + 1]!) });
  }
  return pts;
}

/** A `translate(x y)` term, 0/0 when absent or unrecognised. */
function parseTranslate(t: string | undefined): { x: number; y: number } {
  if (!t) return { x: 0, y: 0 };
  const m = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(t);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}

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

/** The mark FAMILY a scene kind belongs to. The generic parcel vocabulary is frozen
 *  (`parcel-blade` / `parcel-shrub` / `parcel-stem` / `parcel-flower`); anything else a
 *  theme places inside a flora item contributes to the extent but names no family. */
function familyOf(kind: string | undefined): PlantForm | null {
  switch (kind) {
    case 'parcel-blade':
      return 'blade';
    case 'parcel-shrub':
      return 'shrub';
    case 'parcel-stem':
      return 'stem';
    case 'parcel-flower':
      return 'flower';
    default:
      return null;
  }
}

interface Walked {
  box: Box;
  marks: number;
  families: Set<PlantForm>;
}

/** Accumulate a mark subtree's extent, count and families, in coordinates relative to the
 *  flora item's own group (nested translates are folded in as they are met). */
function walkMarks(node: SceneNode, at: { x: number; y: number }, acc: Walked): void {
  if (node.el === 'g') {
    const t = parseTranslate(node.transform);
    const here = { x: at.x + t.x, y: at.y + t.y };
    for (const child of node.children) walkMarks(child, here, acc);
    return;
  }

  const fam = familyOf(node.kind);
  if (fam) acc.families.add(fam);
  // Every leaf inside a flora item is one of the surface's own marks — counting only the
  // four generic kinds would under-report a theme that wraps a mark in an unclassed shape,
  // and this number is a BUDGET comparison, so an under-count is the wrong direction.
  acc.marks++;

  switch (node.el) {
    case 'circle':
      acc.box = grow(acc.box, at.x + node.cx - node.r, at.y + node.cy - node.r);
      acc.box = grow(acc.box, at.x + node.cx + node.r, at.y + node.cy + node.r);
      break;
    case 'ellipse':
      acc.box = grow(acc.box, at.x + node.cx - node.rx, at.y + node.cy - node.ry);
      acc.box = grow(acc.box, at.x + node.cx + node.rx, at.y + node.cy + node.ry);
      break;
    case 'rect':
      acc.box = grow(acc.box, at.x + node.x, at.y + node.y);
      acc.box = grow(acc.box, at.x + node.x + node.width, at.y + node.y + node.height);
      break;
    case 'path':
      for (const p of pathPoints(node.d)) acc.box = grow(acc.box, at.x + p.x, at.y + p.y);
      break;
    case 'polygon':
      for (const p of pathPoints(node.points)) acc.box = grow(acc.box, at.x + p.x, at.y + p.y);
      break;
    default:
      // text carries no drawn extent for a plant; it never appears inside a flora item.
      break;
  }
}

/** Fold one `parcel-flora` group into a plant instance, or `null` when it drew nothing
 *  measurable. Returning `null` rather than a zero-extent plant is deliberate: a
 *  zero-footprint instance would silently become a delivery statistic of exactly the kind
 *  this arc has had to correct five times. */
function plantOf(
  node: SceneG,
  at: { x: number; y: number },
): PlantInstance | null {
  const t = parseTranslate(node.transform);
  const here = { x: at.x + t.x, y: at.y + t.y };
  const acc: Walked = { box: EMPTY_BOX, marks: 0, families: new Set() };
  for (const child of node.children) walkMarks(child, here, acc);

  const { minX, minY, maxX, maxY } = acc.box;
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const w = maxX - minX;
  const h = maxY - minY;

  const form: PlantForm =
    acc.families.size === 1 ? [...acc.families][0]! : acc.families.size === 0 ? 'mixed' : 'mixed';

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    kind: 'plant-instance',
    // The plant STANDS at the bottom of its own marks — a mound's ground contact is the
    // box's south edge, not its centre. A live mesh planted at the centroid floats.
    transform: { x: cx, y: 0, z: maxY },
    group: `plant-${node.theme ?? 'meadow'}-${form}`,
    material: node.status ?? 'unknown',
    theme: node.theme ?? 'meadow',
    form,
    footprint: { cx, cy, w, h },
    marks: acc.marks,
    ...(node.id !== undefined ? { capability: node.id } : {}),
  };
}

/** Recursively collect every `parcel-flora` item under a scene node. */
function collect(
  node: SceneNode,
  at: { x: number; y: number },
  out: PlantInstance[],
): void {
  if (node.el !== 'g') return;
  const t = parseTranslate(node.transform);
  const here = { x: at.x + t.x, y: at.y + t.y };

  if (node.kind === 'parcel-flora') {
    // A flora item's own translate is already folded into `here`, and `plantOf` re-reads
    // it from the node, so pass the PARENT accumulation to avoid double-counting.
    const plant = plantOf(node, at);
    if (plant) out.push(plant);
    // A flora item's children are its marks, already walked — do not recurse further.
    return;
  }

  for (const child of node.children) collect(child, here, out);
}

/**
 * Extract every placed plant from a `buildScene` output as live-renderable instances.
 *
 * DELIBERATELY SEPARATE from `worldTo3D`. That function's contract is total coverage of
 * the STRUCTURAL families with an explicit skip for everything else, and its tests assert
 * exactly that; widening it to emit flora would change a contract the website's synced
 * copy depends on, for an experiment that is authorised while its ADOPTION is not
 * (ADR-0380 D6 — the experiment and the adoption are two separate events). A surface that
 * wants vegetation calls both and concatenates.
 *
 * Deterministic: same scene in, byte-identical array out, in scene-graph order.
 */
export function plantsFrom(scene: SceneG): PlantInstance[] {
  const out: PlantInstance[] = [];
  collect(scene, { x: 0, y: 0 }, out);
  return out;
}

/** The delivered-pixel budget a plant of this footprint gets under the AUTHOR-TIME sprite
 *  convention — ONE GROUND UNIT = ONE DELIVERED PIXEL. This is the number the arc has been
 *  fighting: it is a property of the convention, not of the art, so it is computable from
 *  the footprint alone and needs no render to state.
 *
 *  `fill` is the fraction of the footprint box a plant's marks actually cover; the arc's
 *  measured shrub sits near 0.6-0.8 of a 6x3 box, which is where "roughly twelve pixels"
 *  comes from. Passing it explicitly keeps the caller honest about an assumption that
 *  would otherwise hide inside a constant. */
export function spritePixelBudget(fp: Footprint2D, fill = 0.7): number {
  return Math.max(0, Math.round(fp.w * fp.h * fill));
}

/** The delivered-pixel budget the SAME plant gets from a live renderer drawing at
 *  `devicePixelsPerWorldUnit` — the whole live-render thesis in one function. The sprite
 *  convention pins the ratio at 1; a live renderer inherits the DISPLAY's ratio, so the
 *  budget grows with its SQUARE.
 *
 *  This is arithmetic, not a measurement, and it is stated as arithmetic on purpose: the
 *  arc has repeatedly had a magnitude reported as a finding. What a render must still show
 *  is whether the extra budget carries DETAIL — a bigger flat blob spends the same budget
 *  and buys nothing. */
export function livePixelBudget(
  fp: Footprint2D,
  devicePixelsPerWorldUnit: number,
  fill = 0.7,
): number {
  const s = devicePixelsPerWorldUnit;
  return Math.max(0, Math.round(fp.w * s * fp.h * s * fill));
}
