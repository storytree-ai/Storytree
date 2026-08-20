// flower-geometry.ts — THE THREE VERDICT FORMS, as solids. Pure, deterministic, browser-free,
// node:test-provable: plain typed arrays out, no three.js in, inside the ADR-0123 provability
// firewall with the rest of the experiment's thinking half.
//
// WHAT IS AND IS NOT THIS MODULE'S TO DECIDE. The MAPPING is settled and is not reopened here:
// ADR-0226 D4 says a bloomed daisy is proven, a closed bud is pending, and a wilted nodding
// head is failing, and that the verdict is read from the FORM. This module's whole job is to
// build those three forms as geometry a live renderer can draw, from the marks the SVG surface
// already authored. If building them had required the vocabulary to CHANGE, that would be an
// ADR-0226 question and it escalates rather than being settled under cover of an art change
// (ADR-0367 D5). It did not: every form below is the authored one, in three dimensions.
//
// NEVER ANIMATED. Motion that changes silhouette blurs the three shapes into each other — the
// ADR-0045 honesty wall. There is no time parameter anywhere in this file, so a caller cannot
// animate a flower even by accident. Grass may move; a verdict may not.
//
// THE FOUR APPEARANCE CALLS MADE HERE ARE THE SESSION'S, UNDER ADR-0392 D2, AND EACH IS NAMED
// AT THE POINT IT IS MADE rather than gathered into a note nobody reads: the head's tilt, the
// petal's thickness, the leaves' out-of-plane offset, and the failing head's bow. All four
// exist because the SVG marker is PLANAR and a solid is not — the surface never had to say
// what a daisy does in the third dimension, so somebody has to, and D2 says it is this session.
//
// THE TWO FORESHORTENINGS, AND WHICH ONE EACH NUMBER TAKES. The scene's marks are drawn at
// `LAND_CAMERA_ELEVATION_DEG`. A flower's POSITION is a ground point (recovered by the caller,
// which owns the ground plane). Its STALK HEIGHT is an upright travel, so it recovers by
// `cos(elev)`. Its WIDTH is a horizontal span, which an elevation rotation about the x axis
// does not foreshorten at all, so it is taken as drawn. And the HEAD's own radius is taken as
// drawn TOO, which is the one that deserves its reason stated: the surface authored a round
// daisy at its true size and had no camera to foreshorten it through, so dividing by `cos`
// there would inflate the bloom relative to its own petals' widths. The live camera then
// foreshortens the tilted head disc for real, which is the entire point of drawing it as one.

import {
  addLathe,
  addLobe,
  addTube,
  cubicAt,
  emptyRaw,
  finishRaw,
  type Basis,
  type GeneratedMesh,
  type Raw,
  type Vec3,
} from './mesh-kit.js';
import { LIGHT_DIRECTION, MARKER_TOKENS } from './palette-band.js';
import type { FlowerInstance } from './flower-descriptors.js';

const RAD = Math.PI / 180;

/**
 * APPEARANCE CALL 1 — WHICH WAY A BLOOM FACES. Derived, not picked: it faces the light.
 *
 * A daisy's head is a disc, and a disc in a 3D scene has three honest answers and one dishonest
 * one. Face the CAMERA and it is a billboard — a sprite wearing a mesh, and one that would swing
 * the moment the projection moved, which is the thing ADR-0380 D6 fence 4 exists to refuse. Face
 * straight UP and the bloom is geometrically impeccable and reads, at this camera, as a
 * foreshortened smear. Face the LIGHT, which is what a real daisy does all day, and the ring
 * stays a ring while the head still belongs to the scene.
 *
 * So the head tilts off vertical by the AUTHORED LIGHT's own tilt in the y–z plane, read out of
 * `LIGHT_DIRECTION` rather than chosen. That has two properties a taste number would not: it is a
 * world constant that tracks no viewer, and it cannot silently drift away from the light — if
 * someone moves the light, the blooms turn with it, and a test asserts the two agree.
 */
const HEAD_TILT_DEG = Math.atan2(LIGHT_DIRECTION.z, LIGHT_DIRECTION.y) / RAD;

/**
 * APPEARANCE CALL 2 — HOW FAR A FAILING HEAD BOWS. In degrees off vertical, PAST the horizontal.
 *
 * The surface already says most of this: a failing flower's stalk arcs over, its head sinks and
 * moves to one side, and its petals are confined to the lower arc (112°–248°) so they hang. What
 * a planar drawing cannot say is which way the HEAD PLANE faces once it is a solid, and leaving
 * it at the bloom's angle would leave a wilted flower presenting itself cheerfully at the sun.
 *
 * Past 90 degrees the disc's normal turns DOWNWARD — the head is looking at the ground, which is
 * what nodding IS. How far past is the part that had to be rendered rather than reasoned: the
 * first value (118) put the head almost exactly edge-on to the delivered camera, and the wilted
 * flower read as a flat bar that could have been debris rather than a bowed head. A disc goes
 * fully edge-on at 130 degrees at this projection, so the value sits well short of that, which
 * leaves about 40 per cent of the hanging fan visible instead of 20.
 *
 * The CONSTANT is camera-free — it is a world angle and nothing here tracks a viewer. What the
 * delivered camera informed is the CHOICE, which is the honest way round: the number does not
 * change when the camera does; it was simply picked by looking at the picture the camera makes.
 *
 * Colour says "failing" too, but a colour is not a form, and ADR-0226 D4 put the verdict in the
 * form.
 */
const FAILING_HEAD_TILT_DEG = 105;

/**
 * APPEARANCE CALL 3 — A PETAL HAS THICKNESS, as a fraction of its own half-width.
 *
 * A zero-thickness sheet is the tempting answer and it is wrong on a BANDED material: a sheet
 * has one normal, so it lands wholly on one rung and the bloom reads as a flat cut-out star. A
 * petal with a little volume carries its normal around a curve and picks up two rungs, which is
 * what makes eight petals read as eight petals instead of as one polygon. Small — a petal is
 * thin — but not zero.
 */
const PETAL_THICKNESS = 0.5;

/**
 * APPEARANCE CALL 4 — HOW FAR THE TWO STALK LEAVES SIT OUT OF THE STALK'S PLANE, as a fraction
 * of the leaf's own long radius.
 *
 * The surface alternates its leaves left and right ACROSS the stalk, which in a planar drawing
 * is the only axis it has. In a solid, two leaves in the same plane read as fins on a rudder.
 * Pushing them to opposite sides in DEPTH as well as across costs nothing, adds no palette entry,
 * and is what a plant does. The offset is deterministic in the authored side, never random.
 */
const LEAF_DEPTH_SPREAD = 0.55;

/** How finely the stalk's authored cubic is sampled before being swept. Eight segments is where
 *  the bow of a failing stem stops faceting at the zoom rungs the evidence page publishes. */
const STEM_SAMPLES = 8;

/** How finely the bud's authored cubic is sampled before being revolved. Its silhouette is the
 *  pending verdict, so this is the one profile that may not be coarse. */
const BUD_SAMPLES = 10;

/** One flower, as one mesh per authored TOKEN. Keyed by token so a caller can merge across a
 *  whole island into a handful of draw calls, and so no mesh can ever wear two colours. */
export type FlowerParts = Map<string, GeneratedMesh>;

/** Which materials a flower in this state wears. Reading them from the state rather than from
 *  the mesh keeps the state → colour mapping in one place. */
function materials(state: FlowerInstance['state']): { petal: string; centre: string } {
  return state === 'failing'
    ? { petal: MARKER_TOKENS.petalFailing, centre: MARKER_TOKENS.centreFailing }
    : { petal: MARKER_TOKENS.petalProven, centre: MARKER_TOKENS.centreProven };
}

/**
 * The head's own frame: in-plane horizontal, in-plane up, and the disc's outward normal, for a
 * disc leaning back from vertical by `tiltDeg` about the world x axis.
 *
 * The normal tilts from `+y` toward `+z`; the in-plane up is `+y` projected onto that plane,
 * which necessarily leans the OTHER way — a disc that leans toward you puts its top edge back.
 * Deriving it rather than writing three literals is what stops the frame going non-orthonormal
 * under a later edit, and a non-orthonormal frame on a banded material moves rung boundaries.
 */
function headBasis(tiltDeg: number): Basis {
  const t = tiltDeg * RAD;
  const u: Vec3 = [1, 0, 0];
  const v: Vec3 = [0, Math.sin(t), -Math.cos(t)];
  const n: Vec3 = [0, Math.cos(t), Math.sin(t)];
  return [u, v, n];
}

/** Rotate a local direction into world space through a basis. */
function through(basis: Basis, v: Vec3): Vec3 {
  const [a, b, c] = basis;
  return [
    v[0] * a[0] + v[1] * b[0] + v[2] * c[0],
    v[0] * a[1] + v[1] * b[1] + v[2] * c[1],
    v[0] * a[2] + v[1] * b[2] + v[2] * c[2],
  ];
}

function raw(parts: Map<string, Raw>, token: string): Raw {
  const hit = parts.get(token);
  if (hit) return hit;
  const fresh = emptyRaw();
  parts.set(token, fresh);
  return fresh;
}

/**
 * Build one UAT flower as world-space geometry, standing on `y = 0` at its own planted base
 * (the caller translates it to the flower's ground point, which is where the two ground
 * foreshortenings live).
 *
 * `uprightForeshortening` is `cos` of the elevation the SCENE was projected at — NOT the one it
 * will be rendered at. Passing the render angle here is the mistake that reads as art: the
 * flowers would come out systematically wrong in height and nothing about the picture would say
 * so. `IslandView` reads it from `camera.ts`'s own helper at `LAND_CAMERA_ELEVATION_DEG`.
 */
export function growFlower(
  flower: FlowerInstance,
  uprightForeshortening: number,
): FlowerParts {
  const parts = new Map<string, Raw>();
  const k = flower.scale;
  const mat = materials(flower.state);

  // Local SVG (x, y-down) → world (x, y-up). x is a horizontal span and takes no correction;
  // y is an upright travel and recovers by the SCENE's own foreshortening.
  const wx = (x: number): number => x * k;
  const wy = (y: number): number => (-y * k) / uprightForeshortening;

  // ---- the stalk ---------------------------------------------------------------------------
  if (flower.stem) {
    const { p0, c1, c2, p3, strokeWidth } = flower.stem;
    const spine: Vec3[] = [];
    const radii: number[] = [];
    const r = (strokeWidth / 2) * k;
    for (let i = 0; i <= STEM_SAMPLES; i++) {
      const t = i / STEM_SAMPLES;
      const p = cubicAt(p0, c1, c2, p3, t);
      spine.push([wx(p.x), wy(p.y), 0]);
      // A stalk tapers: the surface draws one stroke width, but a round stem that did not
      // narrow toward the head reads as a wire. The taper is proportional, so it disappears
      // with the stalk rather than being a second size to keep in step.
      radii.push(r * (1 - 0.35 * t));
    }
    addTube(raw(parts, MARKER_TOKENS.stem), spine, radii, 6);
  }

  // ---- the leaves --------------------------------------------------------------------------
  flower.leaves.forEach((leaf, i) => {
    // The authored rotation is an SVG one: positive turns +x toward +y, which is DOWN on
    // screen, so it is a clockwise turn as drawn and its world equivalent is a rotation of the
    // in-plane frame by the negated angle.
    const a = -leaf.angleDeg * RAD;
    const up: Vec3 = [Math.sin(a), Math.cos(a), 0];
    const side: Vec3 = [Math.cos(a), -Math.sin(a), 0];
    const normal: Vec3 = [0, 0, 1];
    const depth = (i % 2 === 0 ? 1 : -1) * leaf.rx * k * LEAF_DEPTH_SPREAD;
    addLobe(
      raw(parts, MARKER_TOKENS.leaf),
      [wx(leaf.x), wy(leaf.y), depth],
      // `rx` is the leaf's long axis and `ry` its short one, and the authored rotation is what
      // swings the long axis up-and-out — so the long radius rides the frame's SIDE axis.
      [leaf.rx * k, leaf.ry * k, leaf.ry * k],
      1,
      [side, up, normal],
    );
  });

  // ---- the head ----------------------------------------------------------------------------
  const hx = wx(flower.head.x);
  const hy = wy(flower.head.y);
  const tilt = flower.state === 'failing' ? FAILING_HEAD_TILT_DEG : HEAD_TILT_DEG;
  const basis = headBasis(tilt);

  for (const petal of flower.petals) {
    // The surface's `rotate(a)` about the head sends the "up" direction `(0, -1)` to
    // `(sin a, -cos a)` — so in the head's own plane the petal points `sin a` along the
    // in-plane horizontal and `cos a` along the in-plane up. Both come straight from the
    // authored angle; nothing here re-spaces the ring.
    const a = petal.angleDeg * RAD;
    const dirLocal: Vec3 = [Math.sin(a), Math.cos(a), 0];
    const dir = through(basis, dirLocal);
    const sideLocal: Vec3 = [Math.cos(a), -Math.sin(a), 0];
    const side = through(basis, sideLocal);
    const normal = through(basis, [0, 0, 1]);
    const len = petal.length * k;
    const halfW = petal.halfWidth * k;
    // The ellipse's centre sits one half-length out, so its inner tip touches the head — the
    // authored rooting, preserved.
    addLobe(
      raw(parts, mat.petal),
      [hx + dir[0] * len, hy + dir[1] * len, dir[2] * len],
      [halfW, len, Math.max(halfW * PETAL_THICKNESS, 0.02)],
      1,
      [side, dir, normal],
    );
  }

  if (flower.centreRadius > 0) {
    const cr = flower.centreRadius * k;
    // The centre is a low dome, not a ball: it domes out of the head's plane by a bit over half
    // its radius, which is enough to catch a lighter rung than the petals around it.
    addLobe(
      raw(parts, mat.centre),
      [hx, hy, 0],
      [cr, cr, cr * 0.62],
      2,
      basis,
    );
  }

  // ---- the closed bud ----------------------------------------------------------------------
  if (flower.bud) {
    const { p0, c1, c2, p3 } = flower.bud;
    // `p3` is the planted head point; `p0` the tip. The authored curve's horizontal distance
    // from the stalk IS the bud's radius at that height, so revolving it reproduces the
    // silhouette exactly rather than approximating it with a canonical teardrop.
    const profile: { r: number; y: number }[] = [];
    for (let i = 0; i <= BUD_SAMPLES; i++) {
      // Sampled from the BASE upward, so the profile runs in the lathe's own +y.
      const t = 1 - i / BUD_SAMPLES;
      const p = cubicAt(p0, c1, c2, p3, t);
      profile.push({ r: Math.abs(p.x - p3.x) * k, y: wy(p.y) - wy(p3.y) });
    }
    // A bud is a solid of revolution about the STALK, so it takes no head tilt: an unopened bud
    // does not present a face, which is exactly the absence the pending verdict is (ADR-0045 —
    // a bud is never a bloom, and it must not be given a bloom's posture either).
    addLathe(raw(parts, MARKER_TOKENS.bud), profile, [hx, wy(p3.y), 0], 9);
  }

  const out: FlowerParts = new Map();
  for (const [token, r] of parts) if (r.idx.length) out.set(token, finishRaw(r));
  return out;
}

/** The delivered-pixel budget one flower gets under the AUTHOR-TIME sprite convention — ONE
 *  GROUND UNIT = ONE DELIVERED PIXEL — stated from the footprint alone, as arithmetic rather
 *  than as a measurement, exactly as `plant-descriptors.ts` states the plants'. What a render
 *  must still show is whether a live budget carries DETAIL; a bigger flat blob buys nothing. */
export function flowerSpriteBudget(flower: FlowerInstance, fill = 0.35): number {
  // The fill floor is LOWER than the plants' 0.7 and that is the flower's own geometry, not a
  // thumb on the scale: a stalk with a head on it leaves most of its bounding box empty, where
  // a shrub mound fills two-thirds of one.
  return Math.max(0, Math.round(flower.footprint.w * flower.footprint.h * fill));
}
