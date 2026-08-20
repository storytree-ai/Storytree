// tree-descriptors.ts — THE HERO STORY TREE for the live-render experiment, inside the
// provability firewall (pure, no React, no three.js, node:test-provable).
//
// WHY THE ISLAND HAD NO TREE. `world-to-3d.ts` maps the land's STRUCTURE and does emit a
// `story-tree` descriptor — but only a POSITION and a status, because the sprite path draws the
// tree with a sprite. The live island needs the tree's actual SHAPE, and the shape is sitting
// right there in the scene: `buildTree` emits a `kind: 'tree'` group carrying a tapered trunk
// path, five `crown-lo` circles and three `crown-hi` circles, all jittered deterministically by
// the story's own id. This module reads that group.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// THE TREE-ANGLE FORK, DECIDED HERE AND RECORDED ON THE INCREMENT (ADR-0392 D2)
// ────────────────────────────────────────────────────────────────────────────────────────────
//
// The increment posed one engineering fork and required an answer: the SIGNED hero-tree track
// (v9, PR #1159, ceiling verdict 2026-08-14) is a RASTER sprite baked by `blender_tree.py` at a
// hardcoded `ELEV_DEG = 20.0`, while the live island renders at 50°. A sprite baked at one angle
// standing on land drawn at another reads wrong, and `assertSpriteRenderMatchesLandCamera`
// exists to refuse exactly that. Three options were named: re-render the track at the render
// angle, build a live-rendered tree, or hold the island at 20°.
//
// THE CHOICE IS THE SECOND: THE ISLAND'S TREE IS GROWN AS LIVE GEOMETRY FROM THE SCENE'S OWN
// AUTHORED TREE. Four reasons, in the order they bind.
//
//   1. A RASTER CANNOT STAND HERE WITHOUT BREAKING THE PALETTE FENCE. This harness's palette is
//      closed BY CONSTRUCTION — every delivered colour is `authored token x authored level` —
//      and `capture.mjs` refuses any pixel outside it. The v9 track's pixels are snapped to
//      exp-16's committed 31-colour palette, which shares no entry with the land's. Admitting
//      them means widening the closure to a second, SNAP-derived palette, and `palette-band.ts`
//      argues at length that a snap is the weaker construction — it is the one that already
//      repainted an `unknown` island's rim `healthy` green over 2564 px.
//
//   2. THE RE-RENDER IS CHEAP; WHAT IT DELIVERS IS THE PROBLEM. `--only 18 --elev 50` renders
//      just the mature frame (frames 0 and 18 are pinned at every angle, so the SIGNED mature
//      state is angle-invariant), and Blender 5.2 is on this box — compute was never the
//      objection. The objection is that it arrives as a 128-px billboard at ONE GROUND UNIT =
//      ONE DELIVERED PIXEL, the exact budget this whole experiment exists to escape, pasted over
//      an island whose every other mark rasterises at the display's resolution. On the zoom rungs
//      the evidence page already publishes, the tree would be the one thing turning to pixel mush
//      while the plants stayed plants.
//
//   3. IT ALSO WOULD NOT MAKE THE CAMERA A PARAMETER — IT WOULD MAKE IT A CHORE. The owner's own
//      framing is that going 3D makes the camera a parameter. A baked frame answers ONE angle;
//      the parked `shared-camera-angle-rises-to-birds-eye` increment would need another render,
//      and so would every angle after it. Live geometry answers all of them for free.
//
//   4. AND IT RE-TUNES NOTHING. The nine versions of Blender crown tuning are SPENT and are not
//      reopened: this module does not author a crown, it READS one. The lobe count, centres,
//      radii and per-lobe jitter are the scene's, keyed by the story id exactly as `buildTree`
//      keyed them. The only thing added is the third dimension a planar drawing could not carry.
//
// WHAT THIS DOES NOT DELIVER, STATED PLAINLY BECAUSE D2's AUTHORITY COMES WITH THE OBLIGATION TO
// SAY SO: ADR-0392 D3 item 5 names "the hero story tree", and the increment brief means the
// SIGNED BLENDER TRACK by it. This delivers the island's OWN declared tree as live geometry. The
// island is no longer treeless and its tree is at the render angle by construction — but the v9
// silhouette is not what stands there. If the terminal look wants that specific silhouette, the
// follow-on is to port v9's skeleton (`blender_tree.py` computes it in pure numpy and runs under
// `--no-render`) into the live generator. That is real work, and it is named here rather than
// pretended away.
//
// THE PROJECTION TRAP, ONE LAST TIME. The tree group's coordinates are PROJECTED at
// `LAND_CAMERA_ELEVATION_DEG`. Its ground POSITION unprojects by `sin(elev)`; its trunk height
// and crown heights are upright travels and recover by `cos(elev)`; a crown blob's RADIUS takes
// neither, because a sphere projects to a circle of its own radius at every elevation. Using the
// ground flattening where the upright one belongs is what made every plant 2.75x too tall, and
// it is silent.

import type { SceneG, SceneNode } from '@storytree/forest-world';

/** One crown blob, exactly as the surface authored it: a circle in PROJECTED scene space,
 *  positioned relative to the tree's own planted base. */
export interface CrownLobe {
  /** Horizontal offset from the trunk, in world px. A ground span — takes no foreshortening. */
  x: number;
  /** SVG y offset from the base, so NEGATIVE above ground. An upright travel. */
  y: number;
  /** The blob's radius. A sphere projects to a circle of its own radius at any elevation, so
   *  this is already a world radius and takes no correction either way. */
  r: number;
  /** `lo` = the five-blob crown body; `hi` = the three lighter blobs the flat surface used to
   *  paint a highlight it had no light for. Both are real silhouette and both are grown; only
   *  the flat lighter FILL is dropped (see `TREE_TOKENS` in palette-band.ts). */
  group: 'lo' | 'hi';
}

/** The hero story tree, read off the scene. All local geometry is in PROJECTED scene units,
 *  relative to the tree's planted base. */
export interface TreeInstance {
  kind: 'tree-instance';
  /** The story this tree is, from the group's title — also the jitter identity `buildTree` keyed
   *  its crown on, so the live crown's depth can be keyed the same way rather than by a counter. */
  storyId: string;
  /** The island's folded status — the crown's token family. */
  status: string;
  /** Ground position: SVG x → 3D x (east), SVG y → 3D z (depth), still PROJECTED. */
  transform: { x: number; y: number; z: number };
  /** The tapered bole: half-widths at the ground and at the crown, and the crown's SVG y
   *  (negative — the trunk's top). */
  trunk: { baseHalfWidth: number; topHalfWidth: number; topY: number } | null;
  lobes: CrownLobe[];
  /** The tree's 2D extent in world px — the same matched-footprint contract everything else on
   *  this island carries. */
  footprint: { cx: number; cy: number; w: number; h: number };
  /** How many marks the SVG surface spends on the tree. The sprite path's own budget. */
  marks: number;
}

interface Pt2 {
  x: number;
  y: number;
}

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

/** Fold one `kind: 'tree'` group into a tree instance, or `null` when it drew nothing.
 *
 *  THE CONTACT SHADOW IS READ AND DISCARDED. Not on principle: the live island has no shadows at
 *  all yet, and what one costs in palette entries is the open
 *  `shadow-ladder-is-admissible-and-affordable` increment's question. It still counts toward
 *  `marks`, which is the SVG surface's own budget — under-reporting it would flatter the live
 *  path in the one comparison this harness exists to make honestly.
 *
 *  A WITHERED TREE's bare branches and litter are read and discarded too, and that IS a limit
 *  rather than a deferral: an `unhealthy` STORY would render here as a crown with no bare limbs.
 *  The island this harness draws is healthy, and the mixed panel varies a CAPABILITY's status
 *  rather than the story's, so nothing on the evidence page hits it. Named so the next session
 *  finds it before a picture does. */
function treeOf(node: SceneG, at: Pt2): TreeInstance | null {
  const t = parseTranslate(node.transform);
  const here = { x: at.x + t.x, y: at.y + t.y };

  let trunk: TreeInstance['trunk'] = null;
  const lobes: CrownLobe[] = [];
  let marks = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  const readCrown = (group: SceneNode, which: 'lo' | 'hi'): void => {
    if (group.el !== 'g') return;
    for (const c of group.children) {
      marks++;
      if (c.el !== 'circle') continue;
      lobes.push({ x: c.cx, y: c.cy, r: c.r, group: which });
      grow(c.cx - c.r, c.cy - c.r);
      grow(c.cx + c.r, c.cy + c.r);
    }
  };

  for (const child of node.children) {
    switch (child.kind) {
      case 'trunk': {
        marks++;
        if (child.el !== 'path') break;
        const pts = pathPoints(child.d);
        if (!pts.length) break;
        // The bole is authored as a symmetric outline: two half-widths at the ground, two at the
        // crown, and a rounded foot. Reading the extremes rather than the literal indices means a
        // later edit to the path's curve handles cannot silently hand back a different tree.
        let topY = Infinity;
        for (const p of pts) {
          topY = Math.min(topY, p.y);
          grow(p.x, p.y);
        }
        let baseHalfWidth = 0;
        let topHalfWidth = 0;
        for (const p of pts) {
          if (p.y >= 0) baseHalfWidth = Math.max(baseHalfWidth, Math.abs(p.x));
          if (Math.abs(p.y - topY) < 1e-6) topHalfWidth = Math.max(topHalfWidth, Math.abs(p.x));
        }
        if (baseHalfWidth > 0) trunk = { baseHalfWidth, topHalfWidth, topY };
        break;
      }
      case 'crown-lo':
        readCrown(child, 'lo');
        break;
      case 'crown-hi':
        readCrown(child, 'hi');
        break;
      default:
        // `shadow`, `bare`, `litter`, a landing bloom, a signpost — counted as the surface's
        // budget, drawn by nobody. See the note above this function.
        marks++;
        break;
    }
  }

  if (!Number.isFinite(minX) || (!trunk && !lobes.length)) return null;

  return {
    kind: 'tree-instance',
    storyId: node.title ?? node.id ?? '',
    status: node.status ?? 'unknown',
    // The tree stands at its own planted base — `treeSpot`, which is where the surface put the
    // trunk's `y = 0`. A tree placed at its bounding-box centre would float half a crown up.
    transform: { x: here.x, y: 0, z: here.y },
    trunk,
    lobes,
    footprint: {
      cx: here.x + (minX + maxX) / 2,
      cy: here.y + (minY + maxY) / 2,
      w: maxX - minX,
      h: maxY - minY,
    },
    marks,
  };
}

function collect(node: SceneNode, at: Pt2, out: TreeInstance[]): void {
  if (node.el !== 'g') return;
  const t = parseTranslate(node.transform);
  const here = { x: at.x + t.x, y: at.y + t.y };

  if (node.kind === 'tree') {
    // The group's own translate is re-read inside `treeOf`, so pass the PARENT accumulation —
    // the same shape the plant and flower collectors use.
    const tree = treeOf(node, at);
    if (tree) out.push(tree);
    return;
  }

  for (const child of node.children) collect(child, here, out);
}

/**
 * Every hero story tree in a `buildScene` output — one per territory — as live-renderable
 * instances. Deterministic: same scene in, byte-identical array out, in scene-graph order.
 *
 * DELIBERATELY SEPARATE from `worldTo3D`, like `plantsFrom` and `flowersFrom`: that function's
 * `story-tree` descriptor is a POSITION for a sprite to stand at, and widening it into a shape
 * would change a contract the website's synced copy depends on, for an experiment whose
 * ADOPTION is a separate event and the owner's (ADR-0380 D6).
 */
export function treesFrom(scene: SceneG): TreeInstance[] {
  const out: TreeInstance[] = [];
  collect(scene, { x: 0, y: 0 }, out);
  return out;
}
