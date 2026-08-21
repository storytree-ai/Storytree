// IslandView.tsx — the live-rendered ISLAND (dev-only harness).
//
// The first pass of this experiment answered on a row of plants, and the owner replied with
// the arc's own standing rule: judge on the ISLAND, never a contact sheet. A plant row can
// show that one convention carries more detail; only an island can show whether the result
// reads as a place — whether the vegetation sits IN the land rather than on top of it,
// whether density reads as density, and whether a hundred small marks compose or just fight.
//
// The comparison discipline is unchanged and it is the thing that makes any of this
// readable: ONE SCENE, TWO DELIVERY CONVENTIONS. Both panels draw the same `buildScene`
// output, the same ground cells, the same plants at the same ground positions, the same
// banded palette, the same light, the same orthographic 50-degree camera. The only
// difference is the rasterisation resolution. So a difference between the panels is the
// convention and nothing else.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import {
  configureExactColour,
  createBandedMaterial,
  shadowFieldTexture,
  type ShadowTexture,
} from './banded-material.js';
import { buildContactField, mergeOcclusion } from './contact-shade.js';
import { variantAt } from './ground-variation.js';
import { buildShadowField, type ShadowCaster, type ShadowField } from './land-shadow.js';
import {
  groundBounds,
  groundCellsFrom,
  type GroundCell,
} from './island-descriptors.js';
import { flowersFrom } from './flower-descriptors.js';
import { growFlower } from './flower-geometry.js';
import {
  LAND_CELL_DEPTH as CELL_DEPTH,
  LAND_RELIEF_AMPLITUDE,
  PARCEL_BEVEL_DROP,
  landHeight,
  landNormal,
  planLandDefinition,
  signedArea2,
  wallFootY,
} from './land-definition.js';
import { islandScene, type IslandOptions } from './island-fixture.js';
import { growCanopy } from './canopy-geometry.js';
import { buildDressing, type CanopyPlacement, type DressingName } from './island-dressing.js';
import type { GeneratedMesh } from './mesh-kit.js';
import { plantsFrom, type PlantInstance } from './plant-descriptors.js';
import { growPlant } from './plant-geometry.js';
import { STATUS_TOKENS } from './palette-band.js';
import { treesFrom } from './tree-descriptors.js';
import { growTree } from './tree-geometry.js';
import {
  LAND_CAMERA_ELEVATION_DEG,
  groundFlattening,
  uprightForeshortening,
  type SceneG,
} from '@storytree/forest-world';

/** The elevation the live camera renders at — the arc's signed research angle (2026-08-16:
 *  "50 degrees looks good, i think we go with this"). NOT the angle the scene was projected
 *  at; that is `LAND_CAMERA_ELEVATION_DEG` and it is what the extractor unprojects by. */
const RENDER_ELEV_DEG = 50;


/**
 * What interior definition the LAND carries.
 *
 * Separable on purpose. The two mechanisms answer different halves of "the land is one
 * flat colour" — relief gives a big parcel's interior something to be, and the bevel gives
 * the island a structure to read — and a reader who cannot see them apart cannot tell which
 * one is doing the work. `flat` is the 2026-08-19 control, unchanged.
 */
export type LandDefinition = 'flat' | 'relief' | 'bevel' | 'full';

/**
 * Which shadow terms the land receives.
 *
 * Separable for the same reason `LandDefinition` is: the two casters answer differently to
 * the measurement. The LAND casts at most `2 x landHeightRange` of ground shadow — 5.9 units
 * at the shipped amplitude — while the median PLANT casts 4.3 and the tallest 10.2. A reader
 * who cannot see them apart cannot tell which one is drawing the picture.
 */
export type LandShadow = 'off' | 'terrain' | 'canopy' | 'both';

/**
 * What the island's RIM is made of.
 *
 * `flush` is every island this arc has rendered: the wall skirt wears the ground's own token
 * and differs from the top face only by the rung its vertical normal lands on. `material`
 * gives it the family's authored `side` token — the same token the shipped map already puts
 * on a territory's side faces — so the island's edge becomes its own material and the whole
 * thing reads as a solid with a top and a flank rather than as a coloured plane with a
 * shaded lip. It is the reference board's lever 3 ("a thick, material island edge"), which
 * the board measured as one of the three strongest separations from the references.
 *
 * IT DOES NOT TOUCH THE BEVEL, and that separation is deliberate. A capability boundary in a
 * different colour is a drawn SEAM, which is the treatment the owner removed on 2026-08-16;
 * the island's OUTER rim is not a boundary between two parcels, it is where the land stops.
 */
export type LandEdge = 'flush' | 'material';

/**
 * How many of a status family's authored ground tokens the land wears.
 *
 * `single` is every island this arc has rendered — `top[0]` everywhere. `regional` selects
 * among `top[0..2]` by a low-frequency field over ground space (`ground-variation.ts`),
 * which is the reference board's lever 7 and the one it flagged as sitting next to the
 * owner's 2026-08-16 removal of the PER-CELL hash variants. The distinction is measured
 * rather than asserted — see `variantSeamFraction`.
 *
 * ⚠ `regional-deep` adds a fourth band wearing the family's `side` token. It is the largest
 * contrast the closed palette can put on the ground — 29% against the three `top` variants'
 * 8% — and it is GATED ON AN OPEN OWNER QUESTION rather than available: `side x 0.9` reads
 * as `mapped` under the live renderer's own one-token-per-status reader and as `healthy`
 * under a three-variant one, and which reader is right is the subject of
 * `oq-the-land-s-status-colours-differ-mainly-in-brightness-and`. It exists so the owner can
 * answer that against a picture of what the answer buys (ADR-0392 D5: an art call may never
 * decide a semantic question).
 */
export type GroundVariation = 'single' | 'regional' | 'regional-deep';

export interface IslandViewProps {
  /** Rasterise at this many device pixels per ground unit. 1 = the sprite convention. */
  pxPerUnit: number;
  /** Present at this many CSS pixels per ground unit. */
  displayPxPerUnit: number;
  /** Plant silhouette style — the owner's "circular swirls" fork. */
  style?: 'mound' | 'foliage';
  /** Draw the vegetation at all (a bare-land control). */
  plants?: boolean;
  /** Draw the UAT flowers at all - the pre-2026-08-20 control, which is what makes "what did
   *  the flowers add" answerable rather than remembered. */
  flowers?: boolean;
  /** Draw the hero story tree at all - the same control, for the other new component. */
  tree?: boolean;
  /** Give one capability a foreign status, for the mixed-island panel. */
  island?: IslandOptions;
  /** How much interior definition the land carries. Defaults to `full`. */
  land?: LandDefinition;
  /** Relief amplitude override, for the amplitude ladder panel. */
  amplitude?: number;
  /** Which shadow terms the LAND receives. Defaults to `off`, so every panel that predates
   *  the shadow delivers exactly the pixels it delivered before. */
  shadow?: LandShadow;
  /** CONTACT DARKENING — an occlusion pool where each prop meets the ground. Defaults off
   *  for the same reason the shadow does: a panel that predates it delivers bit-identical
   *  pixels. It shares the shadow's single occlusion rung, so the two merge into one field
   *  and one texture (`mergeOcclusion`). */
  contact?: boolean;
  /** What the island's rim is made of. Defaults to `flush` — the pre-existing island. */
  edge?: LandEdge;
  /** How far the rim wall hangs below the coast, in ground units. Defaults to
   *  `LAND_CELL_DEPTH` (2.2), which is what every island this arc has rendered wears — and
   *  which delivers 2.8 pixels of island thickness at 2 px/unit under the 50-degree camera.
   *  The reference board's lever 3 asks for an edge that is a significant fraction of the
   *  silhouette; this is the number that decides whether it is. */
  wallDepth?: number;
  /** How many authored ground tokens the land wears. Defaults to `single`. */
  ground?: GroundVariation;
  /**
   * WHAT IS BUILT ON THE ISLAND — walls, paths, water, pots, buildings (ADR-0406).
   *
   * Absent means the island as this arc has always drawn it: ground, shrubs, flowers, tree, and
   * nothing else. Named means a whole DRESSING — a coherent set of props with its own placement
   * rules, authored in `island-dressing.ts` and recorded there with its reasons.
   *
   * IT IS A NAME RATHER THAN A BAG OF TOGGLES, and that is the lesson of the round the owner
   * rejected. Six islands that differed by a flag each read as one idea at six settings, because
   * a flag can only vary a quantity. A dressing varies what the place IS, which is the axis a
   * direction has to differ along to constitute a choice.
   */
  dressing?: DressingName;
  /**
   * Keep this FRACTION of the scene's plants (0..1). Defaults to 1 — every plant, as before.
   *
   * AN APPEARANCE CALL WITH AN ARITHMETIC REASON. The fixture carries 144 plants over an island
   * 233 units wide, and at the delivered 2 px per ground unit a median plant is 7.4 x 6 units,
   * so about 15 x 12 delivered pixels. A hundred and forty-four marks that size do not read as a
   * hundred and forty-four plants; they read as speckle, which is most of why the rejected round
   * looked like textured ground rather than like a place. Every one of the owner's references
   * carries between ten and thirty DISCRETE plant masses, each big enough to have a shape.
   *
   * The thinning is a stable stride rather than a random cull, so the same plants survive across
   * every island on the page — otherwise two directions would differ by which shrubs happened to
   * be drawn, and that difference would be read as the direction.
   */
  plantFraction?: number;
  /** A stable NAME for this canvas, stamped onto the element as `data-st-tag`.
   *
   *  It exists so the capture can find a specific panel by name rather than by position.
   *  Panel FILENAMES are already zipped positionally against the page's sections, which
   *  means inserting a section silently re-points every later filename at a different
   *  picture while the run still exits 0 (filed as friction
   *  `capture-panel-names-bind-to-section-order`). A measurement that compared the wrong two
   *  canvases would be worse than that, because it would produce a NUMBER rather than a
   *  mislabelled file. */
  tag?: string;
}

/** ONE shared WebGL context for the page — a browser caps simultaneous contexts near
 *  sixteen and silently LOSES the oldest, and a lost canvas delivers zero pixels, which
 *  can never FAIL a palette check and can only make one pass for the wrong reason. */
let shared: { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } | null = null;

function sharedRenderer(): { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // Off on purpose: a multisampled edge blends two palette entries into a colour on
    // neither, and would condemn the shader for the compositor's arithmetic.
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  renderer.setClearColor(0x000000, 0);
  shared = { renderer, canvas };
  return shared;
}

/** Built shadow fields, keyed by everything they depend on.
 *
 *  A CACHE RATHER THAN A CONVENIENCE. The field is a function of the land alone — its
 *  relief, its casters, the authored light — and NOT of `pxPerUnit`, so the island page's
 *  panels ask for the same handful of fields over and over. Without this the page rebuilds a
 *  285k-sample field per canvas and the capture's settled-signal wait turns into a
 *  multi-second stall that looks like a hung harness. */
const shadowFieldCache = new Map<string, ShadowTexture>();

/**
 * Everything that stands upright on the land, as the cylinders that cast its shadow.
 *
 * THE RADIUS IS THE FOOTPRINT'S HALF-WIDTH AND THE HEIGHT IS UNPROJECTED — the same two
 * numbers each generator grows its geometry from, read the same way. Taking the height
 * straight off the descriptor would foreshorten the caster while the prop it belongs to
 * stands upright, and the shadow would be 6% short of the thing casting it.
 *
 * ALL THREE PROPS CAST, and that is a decision rather than a sweep. Excluding one would have
 * been the arbitrary act: the flowers are tiny and their shadows are near-invisible at
 * delivered size, but they are upright objects standing in the same light, and an island
 * where two of the three kinds of thing cast reads as a rendering bug rather than as a
 * choice. The hero tree is the opposite case and the one that matters — it is by far the
 * tallest thing here, so it throws by far the longest shadow.
 *
 * WHAT IS DRAWN AND WHAT CASTS ARE KEPT IN STEP by the caller passing the panel's own
 * toggles through: a caster whose mesh is not drawn would lay a shadow under nothing, which
 * is the most confusing possible artefact because every part of it looks deliberate.
 */
function castersFrom(
  scene: SceneG,
  plants: readonly PlantInstance[],
  groundFlat: number,
  up: number,
  include: { plants: boolean; flowers: boolean; tree: boolean },
): ShadowCaster[] {
  const out: ShadowCaster[] = [];
  if (include.plants) {
    for (const p of plants) {
      out.push({
        x: p.transform.x,
        z: p.transform.z / groundFlat,
        radius: Math.max(1.5, p.footprint.w) / 2,
        height: Math.max(1.2, p.footprint.h / up),
      });
    }
  }
  if (include.flowers) {
    for (const f of flowersFrom(scene)) {
      // A flower's height is its HEAD's offset above its planted base — SVG y runs down, so
      // the offset is negative — scaled by the wrapper and unprojected like any upright.
      out.push({
        x: f.transform.x,
        z: f.transform.z / groundFlat,
        radius: Math.max(0.4, (Math.abs(f.head.x) * f.scale) / 2 + 0.4),
        height: Math.max(0.5, (Math.abs(f.head.y) * f.scale) / up),
      });
    }
  }
  if (include.tree) {
    for (const t of treesFrom(scene)) {
      out.push({
        x: t.transform.x,
        z: t.transform.z / groundFlat,
        radius: Math.max(1.5, t.footprint.w) / 2,
        height: Math.max(1.2, t.footprint.h / up),
      });
    }
  }
  return out;
}

/** A 3D vertex plus the normal it wears — the unit the emitters below trade in. */
interface V3 {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Build one merged ground mesh per status family: a top face per cell, a bevel face along
 * every boundary edge, and a wall skirt at the island's rim. Merged rather than
 * per-cell-meshed because 164 draw calls would be measuring a different thing.
 *
 * WHAT CHANGED HERE, AND WHY IT IS TWO MECHANISMS RATHER THAN ONE. The 2026-08-19 island
 * showed the bare land as a single flat green field: every cell carried the same token, and
 * every top face carried the same straight-up normal, so the whole island quantised onto one
 * rung of the ladder. Both halves of that had to move, and they are separable because they
 * fix different things — `land-definition.ts` carries the reasoning and the numbers.
 *
 *   - RELIEF gives the normal somewhere to go. Vertices ride a continuous height field and
 *     wear its analytic normal, so a big parcel's interior stops being one rung.
 *   - THE BEVEL gives the island structure to read. Boundary edges turn down over 1.6
 *     ground units, so a parcel reads as a parcel.
 *
 * NEITHER OF THEM NAMES A COLOUR. The material still emits `token * bandShade(lambert)`, so
 * the palette closure is untouched by construction and the amplitude below is free in
 * palette terms — which is true of THIS renderer and emphatically not of the author-time
 * compositor path, where the same idea cost +619 entries.
 */
function groundMeshes(
  cells: readonly GroundCell[],
  land: LandDefinition,
  amplitude: number,
  shadow: ShadowTexture | undefined,
  edge: LandEdge,
  ground: GroundVariation,
  wallDepth: number,
): THREE.Mesh[] {
  const relief = land === 'relief' || land === 'full' ? amplitude : 0;
  const bevel = land === 'bevel' || land === 'full';
  const plan = planLandDefinition(cells);

  /** Lift a ground point onto the relief field, carrying the field's analytic normal. A
   *  PER-VERTEX analytic normal rather than a per-face one: face normals would make each
   *  triangle quantise whole and deliver the land as a mosaic of hard facets, which is the
   *  rejected per-cell noise arriving by another route. */
  const onLand = (p: { x: number; y: number }, drop = 0): V3 => {
    const n = landNormal(p.x, p.y, relief);
    return {
      x: p.x,
      y: landHeight(p.x, p.y, relief) - drop,
      z: p.y,
      nx: n.x,
      ny: n.y,
      nz: n.z,
    };
  };

  /** Which authored `top` variant a cell wears. A cell gets ONE token — the mesh is merged
   *  per material — so the variant is sampled once, at the cell's own centroid, which is
   *  what `variantSeamFraction` measures the seam rate of. */
  const bands: 3 | 4 = ground === 'regional-deep' ? 4 : 3;
  const variantOf = (c: GroundCell): 0 | 1 | 2 | 3 => {
    if (ground === 'single') return 0;
    let x = 0;
    let y = 0;
    for (const p of c.points) {
      x += p.x;
      y += p.y;
    }
    return variantAt(x / c.points.length, y / c.points.length, bands);
  };

  const byStatus = new Map<string, number[]>();
  cells.forEach((c, i) => {
    const key = `${c.status}::${c.wheat ? 'wheat' : ''}::${variantOf(c)}`;
    const list = byStatus.get(key) ?? [];
    list.push(i);
    byStatus.set(key, list);
  });

  const meshes: THREE.Mesh[] = [];
  for (const [key, group] of byStatus) {
    const [status, wheat, variant] = key.split('::');
    const fam = STATUS_TOKENS[status!] ?? STATUS_TOKENS['unknown']!;
    const positions: number[] = [];
    const normals: number[] = [];
    // The RIM's own buffer. It stays empty under `edge: 'flush'`, in which case the wall
    // triangles go into the body buffer exactly as they always did and the panel delivers
    // bit-identical pixels — the same fail-quiet property the shadow toggle has.
    const wallPositions: number[] = [];
    const wallNormals: number[] = [];

    /** Where triangles land. Two buffers rather than one so the rim can wear its own token
     *  without a second pass over the geometry. */
    interface Sink {
      pos: number[];
      nrm: number[];
    }
    const body: Sink = { pos: positions, nrm: normals };
    // Under `flush` the rim writes into the BODY buffer, so there is one mesh and one token
    // exactly as before. The alternative — always splitting and giving both meshes the same
    // token — would double the ground's draw calls to express a difference of none.
    const rim: Sink = edge === 'material' ? { pos: wallPositions, nrm: wallNormals } : body;

    const tri = (a: V3, b: V3, c: V3, into: Sink = body): void => {
      into.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      into.nrm.push(a.nx, a.ny, a.nz, b.nx, b.ny, b.nz, c.nx, c.ny, c.nz);
    };
    /**
     * A flat quad `a-b-c-d`, wound so that the face the camera can see is the one pointing
     * along `want`, and normalled with `want` on all four corners.
     *
     * BOTH HALVES ARE DERIVED, NOT ASSUMED, AND THAT IS THE LESSON THIS FILE ALREADY PAID
     * FOR ONCE. SVG (x, y) maps to 3D (x, z), which flips handedness, so "the winding I
     * wrote down" is not reliably the winding that survives front-face culling — the first
     * island render lost every top face to exactly that and looked like an art problem.
     * So the geometric normal is computed and the winding chosen to agree with `want`.
     *
     * The four corners share ONE normal because a bevel face and a wall face are genuinely
     * flat. On a banded material that is what makes them read as a fold and an edge rather
     * than as a smeared gradient.
     */
    const quad = (
      a: V3,
      b: V3,
      c: V3,
      d: V3,
      want: { x: number; y: number; z: number },
      into: Sink = body,
    ): void => {
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      const gx = uy * vz - uz * vy;
      const gy = uz * vx - ux * vz;
      const gz = ux * vy - uy * vx;
      const f = (p: V3): V3 => ({ ...p, nx: want.x, ny: want.y, nz: want.z });
      if (gx * want.x + gy * want.y + gz * want.z >= 0) {
        tri(f(a), f(b), f(c), into);
        tri(f(a), f(c), f(d), into);
      } else {
        tri(f(a), f(c), f(b), into);
        tri(f(a), f(d), f(c), into);
      }
    };

    /** The unit normal of the plane through three points, flipped to point upward — the
     *  bevel's own slope, which is what gives its two sides different rungs. */
    const faceUp = (a: V3, b: V3, c: V3): { x: number; y: number; z: number } => {
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const s = ny < 0 ? -1 / len : 1 / len;
      nx *= s;
      ny *= s;
      nz *= s;
      return { x: nx, y: ny, z: nz };
    };

    for (const ci of group) {
      const cell = cells[ci]!;
      const n = cell.points.length;
      // The top face's outline: the cell's own points, pulled in along every boundary edge
      // so the bevel has somewhere to sit. `insetPoint` returns the vertex unchanged where
      // there is no boundary, so an interior cell is untouched.
      const outer = cell.points;
      const inner = bevel
        ? outer.map((_, k) => plan.insetPoint(ci, k))
        : outer.map((p) => ({ x: p.x, y: p.y }));

      // WINDING IS LOAD-BEARING HERE AND IT COST A WHOLE RENDER. With front-face culling
      // on, a polygon wound the wrong way culls its own top face — which on the first
      // island render left only the wall skirts, an island of thin green lines over holes
      // that read like a design failure. So the winding is DERIVED from the polygon's own
      // signed area: whichever way the cell was authored, its triangles face +y.
      const flip = signedArea2(inner) > 0;
      let cx = 0;
      let cy = 0;
      for (const p of inner) {
        cx += p.x;
        cy += p.y;
      }
      const mid = onLand({ x: cx / n, y: cy / n });
      for (let i = 0; i < n; i++) {
        const a = onLand(inner[i]!);
        const b = onLand(inner[(i + 1) % n]!);
        if (flip) tri(mid, b, a);
        else tri(mid, a, b);
      }

      for (let i = 0; i < n; i++) {
        const role = plan.edgeRole(ci, i);
        if (role === 'interior') continue;
        const oa = outer[i]!;
        const ob = outer[(i + 1) % n]!;
        if (bevel) {
          // The bevel: from the inset line at ground height, down and out to the original
          // edge. Two parcels each bevel their own side of a shared edge, so a capability
          // boundary comes out as a V-groove with a lit face and a shaded face — a fold in
          // the same lighting language as everything else, not a drawn line.
          const p0 = onLand(inner[i]!);
          const p1 = onLand(inner[(i + 1) % n]!);
          const p2 = onLand(ob, PARCEL_BEVEL_DROP);
          const p3 = onLand(oa, PARCEL_BEVEL_DROP);
          quad(p0, p1, p2, p3, faceUp(p0, p1, p2));
        }
        if (role !== 'rim') continue;
        // The wall skirt, so the land has thickness at the render angle. Emitted ONLY at
        // the rim now: every other edge is shared with a neighbouring cell, so its skirt
        // was always hidden — and once the ground undulates, a hidden skirt stops being
        // reliably hidden and starts poking through the terrain as a stray dark sliver.
        //
        // IT HANGS FROM THE RIM RATHER THAN REACHING A FIXED FLOOR, AND THAT IS A FIX
        // RATHER THAN A PREFERENCE. The skirt used to run from y = 0 down to a constant
        // y = -CELL_DEPTH, which is the same thing on a flat plane and is NOT the same
        // thing once the coast rises and falls: measured on this fixture, 30 of the rim's
        // 104 endpoints sit BELOW -CELL_DEPTH, so nearly a third of the coast would have
        // rendered its wall UPSIDE DOWN — a band of wall pointing up out of the land. The
        // wall now hangs a constant CELL_DEPTH below whatever the rim is doing, which
        // keeps the authored thickness everywhere and leaves the island's underside
        // undulating where nobody at a 50-degree camera can see it.
        const drop = bevel ? PARCEL_BEVEL_DROP : 0;
        const ta = onLand(oa, drop);
        const tb = onLand(ob, drop);
        const footA = wallFootY(ta.y, wallDepth);
        const footB = wallFootY(tb.y, wallDepth);
        // Outward horizontal normal, oriented AWAY from the cell's own centroid rather
        // than taken from the edge direction, which the handedness flip makes unreliable.
        const ex = ob.x - oa.x;
        const ey = ob.y - oa.y;
        const el = Math.hypot(ex, ey) || 1;
        let nx = -ey / el;
        let nz = ex / el;
        if (nx * (cx / n - (oa.x + ob.x) / 2) + nz * (cy / n - (oa.y + ob.y) / 2) > 0) {
          nx = -nx;
          nz = -nz;
        }
        quad(ta, tb, { ...tb, y: footB }, { ...ta, y: footA }, { x: nx, y: 0, z: nz }, rim);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    // ONE token for the ground and its bevel. The bevel deliberately does NOT take the
    // darker `side` token: a boundary drawn in a different colour is a drawn SEAM, which is
    // the treatment the owner removed. Wearing the ground's own token and differing only by
    // rung makes it a fold in the land instead. Colour is per-mesh, so a cell can never emit
    // a colour from another status's family.
    //
    // WHICH `top` VARIANT is the one thing that moved. Under `single` it is `top[0]` for
    // every cell, exactly as before; under `regional` it is whichever variant the
    // low-frequency field selects at this cell's centroid. All three belong to the same
    // status family, so the land asserts precisely what it asserted before.
    // Index 3 is the four-band form's deep token — the family's `side`, not a fourth member
    // of `top`. Mapped here rather than in `ground-variation.ts` because that module bands a
    // field and knows nothing about tokens, which is what keeps it node-provable.
    const variantIndex = Number(variant ?? '0');
    const groundToken = variantIndex === 3 ? fam.side : (fam.top[variantIndex] ?? fam.top[0]!);
    const token = wheat ? fam.wheat : groundToken;
    meshes.push(
      new THREE.Mesh(
        geom,
        createBandedMaterial({
          token,
          doubleSided: false,
          ...(shadow ? { shadow } : {}),
        }),
      ),
    );

    if (wallPositions.length) {
      const wallGeom = new THREE.BufferGeometry();
      wallGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(wallPositions), 3),
      );
      wallGeom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(wallNormals), 3));
      // The rim's own material: the family's authored `side` token, which is the token the
      // shipped map already puts on a territory's side faces. It is NOT a new colour and it
      // is NOT a foreign one — `side` is a member of the same family, already in
      // `landTokens()` and already closed over by `landPalette()`, so this costs the palette
      // nothing and reads as the same status.
      //
      // ⚠ The RIM only. The wall is emitted at `role === 'rim'` and nowhere else, so a
      // capability boundary is untouched by this and stays a fold in one colour.
      const wallToken = wheat ? fam.wheat : fam.side;
      meshes.push(
        new THREE.Mesh(
          wallGeom,
          createBandedMaterial({
            token: wallToken,
            doubleSided: false,
            ...(shadow ? { shadow } : {}),
          }),
        ),
      );
    }
  }
  return meshes;
}

/**
 * Merge a set of already-world-positioned meshes into ONE buffer per authored token, at
 * `offset`. Shared by the UAT flowers and the story tree because both generators return the same
 * `Map<token, mesh>` shape, and both need the same two things done to it: translated onto the
 * ground, and merged so an island's props cost a handful of draw calls rather than hundreds.
 *
 * Positions are baked rather than carried on a `Matrix4`: the banded material shades from a
 * WORLD normal, so a per-instance transform would mean one more matrix per prop for no visual
 * difference at all.
 */
function mergeParts(
  groups: readonly { parts: ReadonlyMap<string, GeneratedMesh>; offset: [number, number, number] }[],
): THREE.Mesh[] {
  const byToken = new Map<string, { pos: number[]; nrm: number[] }>();
  for (const { parts, offset } of groups) {
    for (const [token, mesh] of parts) {
      const acc = byToken.get(token) ?? { pos: [], nrm: [] };
      byToken.set(token, acc);
      for (let v = 0; v < mesh.indices.length; v++) {
        const i = mesh.indices[v]! * 3;
        acc.pos.push(
          mesh.positions[i]! + offset[0],
          mesh.positions[i + 1]! + offset[1],
          mesh.positions[i + 2]! + offset[2],
        );
        acc.nrm.push(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
      }
    }
  }
  const out: THREE.Mesh[] = [];
  for (const [token, acc] of byToken) {
    if (!acc.pos.length) continue;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(acc.pos), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(acc.nrm), 3));
    // Double-sided: a swept stalk is open at its ends and a petal is a thin lobe, so a
    // single-sided pass would punch holes exactly where a reader looks.
    out.push(new THREE.Mesh(geom, createBandedMaterial({ token, doubleSided: true })));
  }
  return out;
}

/**
 * The island's UAT FLOWERS — one per criterion, 1:1 (ADR-0226 D4), verdict read from the FORM.
 *
 * A flower's GROUND position unprojects by `sin(elev)` exactly as a plant's does; its own
 * heights recover by `cos(elev)` INSIDE `growFlower`. The two foreshortenings are the reason
 * this is spelled out rather than folded into one number: using the ground flattening on a
 * height is the silent error that made every plant 2.75x too tall.
 *
 * `relief` is the same argument `plantMesh` takes and for the same reason: a flower is grown
 * standing on y = 0, so on land that is no longer a plane it either floats or sinks. A flower
 * half a unit into the ground still reads as a flower, which is precisely why it is threaded
 * through rather than left to be noticed.
 */
function flowerMeshes(scene: SceneG, relief: number): THREE.Mesh[] {
  const groundFlat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const upright = uprightForeshortening(LAND_CAMERA_ELEVATION_DEG);
  return mergeParts(
    flowersFrom(scene).map((flower) => {
      const gx = flower.transform.x;
      const gz = flower.transform.z / groundFlat;
      return {
        parts: growFlower(flower, upright),
        offset: [gx, landHeight(gx, gz, relief), gz] as [number, number, number],
      };
    }),
  );
}

/**
 * The HERO STORY TREE, grown as a solid from the scene's own authored tree.
 *
 * The tree-angle fork — a raster baked at 20 degrees against a live island rendered at 50 — is
 * decided and argued at the top of `tree-descriptors.ts`. The short of it: the tree is GROWN
 * rather than composited, so the camera is genuinely a parameter and the crown stays the
 * scene's own rather than becoming this session's.
 *
 * It rides the relief field like everything else. The tree is the ONE prop where floating would
 * be obvious rather than quiet — a 92-unit trunk hanging off the ground is not subtle — but it
 * takes the same lift as the flowers so there is one rule rather than one rule and an exception.
 */
function treeMeshes(scene: SceneG, relief: number): THREE.Mesh[] {
  const groundFlat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const upright = uprightForeshortening(LAND_CAMERA_ELEVATION_DEG);
  return mergeParts(
    treesFrom(scene).map((tree) => {
      const gx = tree.transform.x;
      const gz = tree.transform.z / groundFlat;
      return {
        parts: growTree(tree, upright),
        offset: [gx, landHeight(gx, gz, relief), gz] as [number, number, number],
      };
    }),
  );
}

/**
 * THE SMALL TREES — the canopy that replaces the hero tree (owner, 2026-08-21).
 *
 * ⚠ IT TAKES ONE FORESHORTENING WHERE `treeMeshes` TAKES TWO, and the asymmetry is the point
 * rather than an oversight. A canopy tree's GROUND POSITION comes out of the layout in the
 * scene's projected space and so unprojects by `sin(elev)` exactly like every other prop — but
 * its HEIGHT is authored in `canopy-geometry.ts` in world units, so there is nothing to recover.
 * The hero tree's height comes out of a 20-degree SVG drawing and must be un-projected; applying
 * that same correction here would stretch every tree by 6%, which is precisely the size of error
 * that never looks wrong and quietly makes a grove too tall.
 */
function canopyMeshes(canopy: readonly CanopyPlacement[], relief: number): THREE.Mesh[] {
  return mergeParts(
    canopy.map((tree) => ({
      parts: growCanopy(tree.spec),
      offset: [tree.at.x, landHeight(tree.at.x, tree.at.z, relief), tree.at.z] as [
        number,
        number,
        number,
      ],
    })),
  );
}

/** One merged mesh per (status, style) for the vegetation — same merging rationale.
 *
 *  `relief` is the ground's amplitude, and passing it is not optional dressing: a plant is
 *  fitted to stand on y = 0, so the moment the land stops being a plane every plant either
 *  floats above it or sinks into it. That failure is quiet at delivered size — a shrub half
 *  a unit into the ground still looks like a shrub — which is exactly why it is threaded
 *  through here rather than left to be noticed. */
function plantMesh(
  plants: readonly PlantInstance[],
  style: 'mound' | 'foliage',
  relief: number,
): THREE.Mesh[] {
  const byStatus = new Map<string, PlantInstance[]>();
  for (const p of plants) {
    const list = byStatus.get(p.material) ?? [];
    list.push(p);
    byStatus.set(p.material, list);
  }

  // TWO DIFFERENT FORESHORTENINGS, AND USING THE WRONG ONE IS A 2.8x ERROR.
  //
  //   - a GROUND distance foreshortens by sin(elev) = 0.342 at the land camera;
  //   - an UPRIGHT height foreshortens by cos(elev) = 0.940.
  //
  // A plant's footprint carries both: its WIDTH is a ground span in x (which does not
  // foreshorten at all), its HEIGHT is the upright mark's drawn height, and its POSITION is
  // a ground point. The first render divided the height by the GROUND flattening, which
  // multiplied every plant by 2.75 and produced shrubs towering over the cells they stand
  // on. `camera.ts` names the split precisely; this is what its two helpers are for.
  const groundFlat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const upright = uprightForeshortening(LAND_CAMERA_ELEVATION_DEG);
  const meshes: THREE.Mesh[] = [];
  for (const [status, group] of byStatus) {
    const fam = STATUS_TOKENS[status] ?? STATUS_TOKENS['unknown']!;
    const positions: number[] = [];
    const normals: number[] = [];

    group.forEach((p, i) => {
      // The descriptor's footprint is in the scene's PROJECTED space, so its height was
      // foreshortened on the way out. Recover it the same way the ground is recovered —
      // otherwise the plants would be squat against land that is not.
      const mesh = growPlant({
        seed: (i + 1) * 2654435761,
        form: p.form === 'mixed' ? 'shrub' : p.form,
        width: Math.max(1.5, p.footprint.w),
        height: Math.max(1.2, p.footprint.h / upright),
        detail: 2,
        style,
      });
      // Ground position: the plant stands at its own ground contact, unprojected — and now
      // at the HEIGHT the land actually has there, so it sits IN the land rather than on a
      // remembered plane.
      const gx = p.transform.x;
      const gz = p.transform.z / groundFlat;
      const gy = landHeight(gx, gz, relief);
      for (let v = 0; v < mesh.indices.length; v++) {
        const idx = mesh.indices[v]! * 3;
        positions.push(
          mesh.positions[idx]! + gx,
          mesh.positions[idx + 1]! + gy,
          mesh.positions[idx + 2]! + gz,
        );
        normals.push(mesh.normals[idx]!, mesh.normals[idx + 1]!, mesh.normals[idx + 2]!);
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    // Vegetation wears the status's SIDE token — a darker member of the same family, so a
    // plant reads as distinct from the ground beneath it without leaving its own status.
    meshes.push(
      new THREE.Mesh(geom, createBandedMaterial({ token: fam.side, doubleSided: true })),
    );
  }
  return meshes;
}

function renderIsland(canvas: HTMLCanvasElement, props: IslandViewProps): void {
  const scene3 = new THREE.Scene();
  const scene = islandScene(props.island ?? {});
  const cells = groundCellsFrom(scene);
  const bounds = groundBounds(cells);
  const land = props.land ?? 'full';
  const amplitude = props.amplitude ?? LAND_RELIEF_AMPLITUDE;
  const relief = land === 'relief' || land === 'full' ? amplitude : 0;

  // WHAT IS BUILT ON THE ISLAND, if anything (ADR-0406). Computed BEFORE the shadow field
  // because the props have to be in it: an object that darkens no ground under itself is the
  // one artefact that reads as a rendering bug rather than as a choice, and it is exactly what
  // `contact-shade.ts` was built to prevent for the plants.
  const dressing = props.dressing ? buildDressing(props.dressing, { cells, relief }) : null;

  // A STABLE STRIDE, NOT A RANDOM CULL — see `plantFraction`. Two islands that differed by
  // WHICH shrubs were drawn would present that difference as the direction.
  //
  // The DRESSING owns the default, because how much vegetation a place carries is part of what
  // kind of place it is: a raked shrine court and a wild shore want opposite answers, and making
  // the page restate the number per island is how the two drift apart from the composition that
  // chose them. An explicit prop still overrides, for the one case that needs it — holding
  // everything constant while a single variable moves.
  const allPlants = plantsFrom(scene);
  const keep = Math.min(1, Math.max(0, props.plantFraction ?? dressing?.plantFraction ?? 1));
  const plants =
    keep >= 1
      ? allPlants
      : allPlants.filter((_, i) => Math.floor(i * keep) > Math.floor((i - 1) * keep));

  // THE SHADOW FIELD — built in ground space, before any mesh, because the ground meshes and
  // the wall skirts all sample the SAME field and a per-mesh field would let them disagree
  // about where the shadow falls along a shared edge.
  //
  // PLANTS CAST BUT DO NOT RECEIVE, and that is a call rather than an oversight (recorded in
  // the increment): at the delivered 2 px/unit a whole shrub is about five pixels, so a
  // shadow ON one has nowhere to land, while the shadow it THROWS is 8.6 px long and is most
  // of what the eye reads. Shadowing the plants would spend the one available rung on the
  // element that cannot show it.
  const mode = props.shadow ?? 'off';
  const wantShadow = mode !== 'off';
  const wantContact = props.contact === true;
  let shadowTex: ShadowTexture | undefined;
  if (wantShadow || wantContact) {
    const include = {
      plants: props.plants !== false,
      flowers: props.flowers !== false,
      tree: props.tree !== false,
    };
    const key = JSON.stringify([
      mode,
      wantContact,
      relief,
      land,
      props.island ?? {},
      include,
      // The dressing and the thinning both change WHAT CASTS, so both belong in the key. A
      // cache keyed on less than the field depends on is the quiet failure this map's own
      // header warns about — it would hand a walled island the bare island's occlusion and
      // every pool would sit under nothing.
      props.dressing ?? null,
      keep,
    ]);
    let cached = shadowFieldCache.get(key);
    if (!cached) {
      const groundFlat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
      const up = uprightForeshortening(LAND_CAMERA_ELEVATION_DEG);
      const fieldBounds = {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minY,
        maxZ: bounds.maxY,
      };
      const casters = [
        ...castersFrom(scene, plants, groundFlat, up, include),
        ...(dressing?.casters ?? []),
      ];
      // ONE occlusion field, two contributions, merged by `mergeOcclusion` — because the
      // material has exactly one occlusion rung and therefore one texture. Building them
      // separately and merging keeps the two arguments apart (a cast shadow is directional,
      // a contact pool is not) while delivering the single scalar the fragment stage
      // thresholds.
      const fields: ShadowField[] = [];
      if (wantShadow) {
        fields.push(
          buildShadowField({
            bounds: fieldBounds,
            relief,
            casters: mode === 'terrain' ? [] : casters,
            terrain: mode !== 'canopy',
            canopy: mode !== 'terrain',
          }),
        );
      }
      if (wantContact) {
        fields.push(buildContactField({ bounds: fieldBounds, casters }));
      }
      const merged = fields.length === 1 ? fields[0]! : mergeOcclusion(fields[0]!, fields[1]!);
      cached = shadowFieldTexture(merged);
      shadowFieldCache.set(key, cached);
    }
    shadowTex = cached;
  }

  for (const m of groundMeshes(
    cells,
    land,
    amplitude,
    shadowTex,
    props.edge ?? 'flush',
    props.ground ?? 'single',
    props.wallDepth ?? CELL_DEPTH,
  )) {
    scene3.add(m);
  }
  if (props.plants !== false) {
    for (const m of plantMesh(plants, props.style ?? 'mound', relief)) scene3.add(m);
  }
  if (props.flowers !== false) for (const m of flowerMeshes(scene, relief)) scene3.add(m);
  if (props.tree !== false) for (const m of treeMeshes(scene, relief)) scene3.add(m);
  // The dressing merges through exactly the same path the flowers and the tree take, so a wall
  // and a daisy are the same kind of object to this renderer: one mesh per authored token, no
  // per-instance matrix, world normals baked. That is what keeps "every delivered pixel is an
  // authored (token x level) entry" true of props without a second argument.
  if (dressing) for (const m of mergeParts(dressing.groups)) scene3.add(m);
  if (dressing) for (const m of canopyMeshes(dressing.canopy, relief)) scene3.add(m);

  // The island's on-screen size at this camera: the ground's depth foreshortens by
  // sin(RENDER_ELEV), and its width does not.
  //
  // THE FRAME IS THE SCENE'S BOUNDING BOX, NOT AN ARITHMETIC ONE, and that replaced a formula
  // rather than merely restating it. The analytic version summed what the LAND reaches —
  // `2 * landHeightRange(relief)` for the relief either side of zero, `PARCEL_BEVEL_DROP` for
  // the rim, `CELL_DEPTH` for the wall hanging below it — and was correct while the land was
  // the tallest thing on the island. It cannot be correct now: a 92-unit hero tree reaches
  // far above anything the ground knows about, and a frame that does not know the tree exists
  // CROPS IT — silently, and in a way that reads as an art choice rather than as a camera bug.
  //
  // The box is measured once every mesh is in the scene, so it contains the relief, the bevel,
  // the wall skirt AND the props by construction. Nothing has to be remembered and added.
  const elev = (RENDER_ELEV_DEG * Math.PI) / 180;
  const box = new THREE.Box3().setFromObject(scene3);
  // Where a world point lands vertically at this camera: its depth foreshortens by sin, its
  // height by cos — the same two flattenings, and using one where the other belongs is the
  // silent 2.75x error this file already paid for once. Both signs matter: z runs INTO the
  // screen, so the FAR edge (min z) is the one that rides up.
  const screenTop = -box.min.z * Math.sin(elev) + box.max.y * Math.cos(elev);
  const screenBottom = -box.max.z * Math.sin(elev) + box.min.y * Math.cos(elev);
  const screenW = Math.max(bounds.w, box.max.x - box.min.x);
  const screenH = screenTop - screenBottom;
  const pad = 3;
  const bufW = Math.max(1, Math.round((screenW + pad * 2) * props.pxPerUnit));
  const bufH = Math.max(1, Math.round((screenH + pad * 2) * props.pxPerUnit));

  const { renderer, canvas: glCanvas } = sharedRenderer();
  renderer.setSize(bufW, bufH, false);

  const cx = (box.min.x + box.max.x) / 2;
  const cz = (bounds.minY + bounds.maxY) / 2;
  // Vertical centring follows the SCENE's screen extent, so a tall crown pushes the island down
  // in frame rather than off the top of it.
  //
  // ⚠ IT IS MEASURED RELATIVE TO WHAT THE CAMERA LOOKS AT, not to the world origin. `screenTop`
  // and `screenBottom` are absolute screen heights, while the frustum's top/bottom are offsets
  // from the camera's own centre — which is the point `(cx, 0, cz)`, itself at screen height
  // `-cz * sin(elev)`. Subtracting that is the whole correction. It is invisible on THIS island,
  // whose ground bounds are symmetric so `cz` is 0, which is exactly why it is written down: an
  // island whose ground box is off-centre would frame wrong and look like a composition choice.
  const cameraCentreScreenY = -cz * Math.sin(elev);
  const cyScreen = (screenTop + screenBottom) / 2 - cameraCentreScreenY;
  const camera = new THREE.OrthographicCamera(
    -(screenW + pad * 2) / 2,
    (screenW + pad * 2) / 2,
    (screenH + pad * 2) / 2 + cyScreen,
    -(screenH + pad * 2) / 2 + cyScreen,
    -4000,
    4000,
  );
  const dist = 500;
  camera.position.set(cx, Math.sin(elev) * dist, cz + Math.cos(elev) * dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(cx, 0, cz);
  camera.updateProjectionMatrix();

  renderer.render(scene3, camera);

  canvas.width = bufW;
  canvas.height = bufH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, bufW, bufH);
    ctx.drawImage(glCanvas, 0, 0, bufW, bufH, 0, 0, bufW, bufH);
  }
  canvas.style.width = `${(screenW + pad * 2) * props.displayPxPerUnit}px`;
  canvas.style.height = `${(screenH + pad * 2) * props.displayPxPerUnit}px`;
  canvas.style.imageRendering = 'pixelated';
}

export function IslandPanel({
  label,
  note,
  ...props
}: IslandViewProps & { label: string; note: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderIsland(ref.current, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.pxPerUnit,
    props.displayPxPerUnit,
    props.style,
    props.plants,
    props.flowers,
    props.tree,
    props.island,
    props.land,
    props.amplitude,
    props.shadow,
    props.contact,
    props.edge,
    props.ground,
    props.wallDepth,
    props.dressing,
    props.plantFraction,
  ]);
  return (
    <figure className="panel">
      <figcaption>
        <strong>{label}</strong>
        <span>{note}</span>
      </figcaption>
      <div className="stage">
        <canvas ref={ref} {...(props.tag ? { 'data-st-tag': props.tag } : {})} />
      </div>
    </figure>
  );
}
