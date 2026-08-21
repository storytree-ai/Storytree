// prop-structures.ts — THE POINT PROPS AND THE BUILT STRUCTURES: rocks, pots, a well, cottages,
// lanterns, an arch, a pavilion, a raised platform, crates and a moored boat. Pure,
// deterministic, browser-free, node:test-provable — plain typed arrays out, no three.js in,
// inside the ADR-0123 provability firewall with the rest of the experiment's thinking half.
//
// WHY THIS FILE EXISTS, AND IT IS A CONTENT ANSWER RATHER THAN A RENDERING ONE. ADR-0406 counted
// our island against the owner's four reference images and found FOUR kinds of object (ground,
// shrub, flower, tree) against eight to fifteen, and exactly ONE material — matte green —
// against stone AND wood AND brick AND paving AND water. The same ADR observed that his pixel-art
// garden carries NO cast shadow, NO ambient occlusion, NO relief and NO bevels and still reads as
// a place while ours does not. So the short half of the stack is the vocabulary, not the shader,
// and this module is the vocabulary: the well with its wooden roof, the terracotta pots with
// small trees in them, the stone doorway, the cottages with pitched roofs and chimneys, the
// lanterns and the boulders that his references actually contain.
//
// WHY IT IS ALLOWED, because a later reader will and should check. ADR-0406 D1: the harness
// island REPRESENTS NOTHING — it asserts no capability's proof state, no UAT verdict and no
// parcel boundary — so there is no state a decorative object or an off-status colour can
// misreport, and ADR-0367 D5 has nothing to bite on. The licence is scoped to THIS surface;
// ADR-0406 D2 leaves the product map exactly as it was.
//
// ⚠ EVERY APPEARANCE CALL BELOW IS RECORDED AT THE POINT IT IS MADE (ADR-0392 D2 / ADR-0398 D3),
// and each is grounded in one of two measured things rather than in taste: the RUNG ARITHMETIC
// (which decides whether a surface is visible at all on a banded material) and the DELIVERED-SIZE
// arithmetic (which decides whether a feature resolves at all). Both are set out next.
//
// ---------------------------------------------------------------------------------------------
// THE RUNG ARITHMETIC — the single fact that decides every shape in this file
// ---------------------------------------------------------------------------------------------
//
// The banded shader quantises `dot(n, LIGHT_DIRECTION) * 0.5 + 0.5` onto
// `SHADE_LEVELS = [0.78, 0.80, 0.90, 1.00]`, with `LIGHT_DIRECTION = norm(-0.45, 0.82, 0.35)`.
// `rungOfNormal` in `palette-band.ts` reproduces that decision exactly, so these are measured
// numbers a test asserts rather than a description:
//
//     top face (0,1,0)                      dot 0.8211   rung 2 (x0.90)
//     ANY vertical face, ANY compass bearing dot <=0.5708 rung 0 (x0.78)
//     battered side, slope 0.2               dot 0.6029   rung 1 (x0.80)
//     battered side, slope 0.4               dot 0.7233   rung 2 (x0.90)
//     pitched roof, ridge along z, -x slope  dot 0.9313   rung 3 (x1.00)  <- the ONLY rung 3
//     the same roof's +x twin                dot 0.4167   rung 0 (x0.78)
//
// THE CONSEQUENCE. A plain vertical box delivers exactly TWO colours however it is turned — a
// silhouette with a lid. That is not a shading bug to fix in the shader; it is what a closed
// four-rung ladder does to a shape with no tilted faces, and the fix is in the SHAPE. Hence the
// three levers this file uses, in descending order of strength:
//
//   1. A PITCHED ROOF WITH ITS RIDGE ALONG Z. The brightest and highest-contrast surface the
//      island can deliver — rung 3 against rung 0 on one object. Every roof here is built that
//      way. The rung-3 window is a geometric pitch between roughly 12.7 and 44.8 degrees (the
//      light's own tilt is 28.75 degrees off vertical and the rung-3 boundary is 16.06 degrees
//      wide either side of it), and every default pitch below sits inside it — see each call.
//   2. A BATTER. Leaning a wall in by slope 0.2 (11.3 degrees off vertical) lifts its lit side
//      from rung 0 to rung 1 and costs nothing. Slope 0.4 reaches rung 2 but reads as a pyramid
//      on a building, so it is used only where the form wants it.
//   3. A SECOND TOKEN. Where neither lever applies — a crate, a boat hull, a step riser — the
//      only remaining contrast is the material itself, which is why `palette-band.ts` authors
//      `stoneLight`/`stone`/`stoneDark` and `wood`/`woodLight` as pairs rather than singles.
//
// ⚠ THIS FILE CARRIES ITS OWN `addPitchedRoof` RATHER THAN CALLING THE KIT'S `addGableRoof`, AND
// THE HISTORY IS WORTH KEEPING BECAUSE THE BUG IT FOUND IS THE INSTRUCTIVE KIND. When this module
// was written, `mesh-kit.ts`'s `addGableRoof` emitted the slope normal as `norm(-hx, rise, 0)`,
// where the true outward normal of a plane running from the eave `(-hx, 0)` to the ridge
// `(0, rise)` is `norm(-rise, hx, 0)` — the two components SWAPPED, so a roof shaded as its own
// COMPLEMENT. Measured on the emitted buffers at the cottage's default 34.8-degree pitch: the kit
// emitted `(-0.8209, 0.5711, 0)` — dot 0.8388, rung 2 — where the truth is `(-0.5711, 0.8209, 0)`
// — dot 0.9313, RUNG 3. The error is invisible at a 45-degree pitch (where the swap is the
// identity) and grows without bound toward flat, so a nearly-flat roof shaded as a nearly-vertical
// WALL. Since a roof is the only rung-3 surface on the island, that normal gave away the strongest
// lever in the whole vocabulary while looking like a deliberately muted roof.
//
// THE KIT IS NOW FIXED (2026-08-21) and emits the perpendicular, so the two forms agree and a roof
// from either shades identically. This one stays because it is what the tests below measure and
// because it is ridge-along-z only by construction — the orientation that reaches rung 3 — which
// is a narrower and therefore harder-to-misuse contract than the general primitive. The lesson to
// carry rather than the code: a normal that "looks right" is not checkable by reading, and
// `rungOfNormal` on the emitted buffer is what caught this.

import {
  addBox,
  addLathe,
  addLobe,
  addPrism,
  addQuad,
  addTri,
  addTube,
  emptyRaw,
  finishRaw,
  mulberry32,
  norm,
  ringProfile,
  type GeneratedMesh,
  type Raw,
  type Vec3,
} from './mesh-kit.js';
import { PROP_TOKENS, SHARED_TOKENS } from './palette-band.js';

/**
 * A prop, as one mesh per authored TOKEN — the same shape `growTree` and `growFlower` return, so
 * a caller merges every family through one `mergeParts` and no mesh can ever wear two colours.
 */
export type PropParts = Map<string, GeneratedMesh>;

/** A point in the ground plane. The props are authored in world units with y up, so a plan point
 *  carries no y at all and cannot be confused with a `Vec3`. */
interface Plan {
  x: number;
  z: number;
}

// ---------------------------------------------------------------------------------------------
// DELIVERED-SIZE CONSTANTS — the second measured input, and the one that decides what may exist
// ---------------------------------------------------------------------------------------------

/**
 * The smallest feature that survives delivery, in ground units.
 *
 * The island spans 233.8 x 135.1 ground units and is delivered at 2 px per ground unit (about
 * 468 px wide). A feature below this width stops resolving and becomes an aliasing shimmer — a
 * chimney 0.4 units across simply disappears and takes its triangles with it.
 *
 * IT IS A FLOOR ON THE ART, NOT A HINT, and three props below are deliberately FATTER than their
 * real-world proportions because of it: the lantern's shaft, the boat's oars and the cottage's
 * chimney. Each says so where it is built. Making them realistic would be making them invisible,
 * which is the one outcome that is certainly wrong.
 */
const MIN_FEATURE = 1.0;

/** How many sides a round built thing is drawn with. Nine reads as MASONRY — a coarse ring of
 *  laid blocks; forty reads as an extruded cylinder, and at 2 px per ground unit the extra sides
 *  deliver nothing but triangles. Odd on purpose: an odd ring never presents two parallel faces
 *  to the camera, so a well drum never flattens into a slab. */
const ROUND_SIDES = 9;

/** Geodesic subdivision for a rock's lobes. ONE, not two: a rock wants to read as a faceted mass
 *  rather than as a ball, and at 32 faces the ellipsoid normals still sweep smoothly enough to
 *  cross two or three rungs, which is the whole reason a rock is lobes rather than a box. */
const ROCK_DETAIL = 1;

/** How far a door or window panel stands proud of the wall it is laid on. Purely a z-fighting
 *  clearance — large enough that no depth precision can interleave the two surfaces, small enough
 *  that at 2 px per ground unit the panel reads as painted onto the wall rather than as a slab
 *  bolted to it (0.25 units is half a delivered pixel). */
const PANEL_PROUD = 0.25;

// ---------------------------------------------------------------------------------------------
// The shared accumulator idiom — one raw soup per authored token, finished once
// ---------------------------------------------------------------------------------------------

function raw(parts: Map<string, Raw>, token: string): Raw {
  const hit = parts.get(token);
  if (hit) return hit;
  const fresh = emptyRaw();
  parts.set(token, fresh);
  return fresh;
}

/**
 * Finish the accumulated parts, RECENTRED IN PLAN on the prop's own bounding box.
 *
 * WHY THE RECENTRING IS HERE RATHER THAN LEFT TO EACH GENERATOR. Every caller places a prop by
 * asking the land how high it is at a ground point and translating by
 * `[gx, landHeight(gx, gz), gz]`, so the contract that matters is "the ground point you already
 * hold is where the prop's plan centre goes". Doing it once, at the end, over ALL parts at once
 * makes that exact for every generator — including the awkward cases a per-generator convention
 * would get subtly wrong: an odd-sided ring (a 9-gon's bbox centre is 3% of its radius off its
 * own centroid), a cottage with a porch on one side only, a yawed boat.
 *
 * The translation is uniform across every part, so nothing moves relative to anything else, and
 * y is untouched — each generator authors its own base on y = 0, which is the other half of the
 * placement contract and the half a translation cannot fix.
 *
 * The `idx.length` guard is `tree-geometry.ts`'s and is load-bearing: a token that was reached
 * but never drawn (a contents mode that emitted nothing, a degenerate ring) would otherwise ship
 * an empty buffer, and an empty buffer downstream is a draw call and a material for no pixels.
 */
function finish(parts: Map<string, Raw>): PropParts {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of parts.values()) {
    if (!r.idx.length) continue;
    for (let i = 0; i < r.pos.length; i += 3) {
      const x = r.pos[i]!;
      const z = r.pos[i + 2]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const cx = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
  const cz = Number.isFinite(minZ) ? (minZ + maxZ) / 2 : 0;

  const out: PropParts = new Map();
  for (const [token, r] of parts) {
    if (!r.idx.length) continue;
    if (cx !== 0 || cz !== 0) {
      for (let i = 0; i < r.pos.length; i += 3) {
        r.pos[i] = r.pos[i]! - cx;
        r.pos[i + 2] = r.pos[i + 2]! - cz;
      }
    }
    out.set(token, finishRaw(r));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Local primitives — the three shapes the kit does not carry, plus the corrected roof
// ---------------------------------------------------------------------------------------------

/** Rotate a plan point about the world up axis, matching `yawBasis`/`addBox`'s convention
 *  exactly. Written out rather than routed through `yawBasis` because the prop generators turn
 *  CENTRES as often as they turn geometry, and a centre is two numbers, not a basis. */
function turn(yaw: number, x: number, z: number): [number, number] {
  if (!yaw) return [x, z];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

/** The same rotation applied to a direction. A yaw basis is orthonormal, so a normal takes the
 *  identical transform as a position with no inverse-transpose correction. */
function turnV(yaw: number, v: Vec3): Vec3 {
  const [x, z] = turn(yaw, v[0], v[2]);
  return [x, v[1], z];
}

/** A rectangular plan ring centred at `(cx, cz)`, then turned about the ORIGIN — which is the
 *  rotation a caller wants for a part OF a yawed building, since the building turns about its own
 *  origin and a part that turned about its own centre would slide out of the wall it belongs to. */
function rectProfileAt(cx: number, cz: number, hx: number, hz: number, yaw = 0): Plan[] {
  const corners: readonly [number, number][] = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ];
  return corners.map(([x, z]) => {
    const [rx, rz] = turn(yaw, cx + x, cz + z);
    return { x: rx, z: rz };
  });
}

/** The origin-centred case, which is what a plinth or a deck wants. */
function rectProfile(hx: number, hz: number, yaw = 0): Plan[] {
  return rectProfileAt(0, 0, hx, hz, yaw);
}

/** Turn a whole plan ring about the origin. */
function spinProfile(profile: readonly Plan[], yaw: number): Plan[] {
  if (!yaw) return profile.map((p) => ({ x: p.x, z: p.z }));
  return profile.map((p) => {
    const [x, z] = turn(yaw, p.x, p.z);
    return { x, z };
  });
}

/** Scale a plan ring about its OWN centroid — how a stepped course insets without wandering off
 *  the course below it. Scaling about the origin would drift any caller-supplied profile that is
 *  not already origin-centred, and the platform's whole point is that a caller may supply one. */
function scaleProfile(profile: readonly Plan[], k: number): Plan[] {
  const n = profile.length || 1;
  let cx = 0;
  let cz = 0;
  for (const p of profile) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;
  return profile.map((p) => ({ x: cx + (p.x - cx) * k, z: cz + (p.z - cz) * k }));
}

/**
 * A vertical band of flat faces around a plan ring — the side wall of a drum, a hull, a kerb.
 *
 * `addPrism` already does this WITH caps; this exists for the cases where the caps are wrong: a
 * well's drum has no lid, a boat has no deck, and an INWARD-facing wall (a shaft, a hull's
 * inside) is a face `addPrism` cannot emit at all — its normals always point away from the
 * centroid. An inward wall built by re-winding an `addPrism` would draw (the prop materials are
 * double-sided) and would shade as if lit from inside the object, which on a banded material is a
 * visible rung in the wrong place rather than a subtle error.
 *
 * Outward is decided by the CENTROID test, not by the winding, for the reason `addPrism` and
 * `land-definition.ts` both carry: ground `(x, y)` maps to 3D `(x, z)` and flips handedness, so
 * "the left-hand perpendicular" is not reliably the outward one. CONVEX rings only, like the rest
 * of the kit.
 */
function addWall(
  raw_: Raw,
  profile: readonly Plan[],
  y0: number,
  y1: number,
  inward = false,
): void {
  const n = profile.length;
  if (n < 3) return;
  let cx = 0;
  let cz = 0;
  for (const p of profile) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;
  for (let i = 0; i < n; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % n]!;
    let ox = -(b.z - a.z);
    let oz = b.x - a.x;
    const mx = (a.x + b.x) / 2 - cx;
    const mz = (a.z + b.z) / 2 - cz;
    if (ox * mx + oz * mz < 0) {
      ox = -ox;
      oz = -oz;
    }
    if (inward) {
      ox = -ox;
      oz = -oz;
    }
    const face = norm([ox, 0, oz]);
    if (inward) {
      addQuad(raw_, [b.x, y0, b.z], [a.x, y0, a.z], [a.x, y1, a.z], [b.x, y1, b.z], face);
    } else {
      addQuad(raw_, [a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z], face);
    }
  }
}

/** A flat cap over a CONVEX plan ring, as a fan from the centroid — `addPrism`'s cap, available
 *  on its own so a wall and its lid can wear different tokens. */
function addCap(raw_: Raw, profile: readonly Plan[], y: number, up: boolean): void {
  const n = profile.length;
  if (n < 3) return;
  let cx = 0;
  let cz = 0;
  for (const p of profile) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;
  const base = raw_.pos.length / 3;
  raw_.pos.push(cx, y, cz);
  raw_.nrm.push(0, up ? 1 : -1, 0);
  for (const p of profile) {
    raw_.pos.push(p.x, y, p.z);
    raw_.nrm.push(0, up ? 1 : -1, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = base + 1 + i;
    const b = base + 1 + ((i + 1) % n);
    if (up) raw_.idx.push(base, a, b);
    else raw_.idx.push(base, b, a);
  }
}

/** An up-facing RING between two rings of the same length — a well's coping, a boat's gunwale, a
 *  step's tread. It is the shape that lets a hollow built thing keep its hole: a fan cap would
 *  lid the well, and a lidded well is a drum. */
function addAnnulus(raw_: Raw, inner: readonly Plan[], outer: readonly Plan[], y: number): void {
  const n = Math.min(inner.length, outer.length);
  if (n < 3) return;
  const up: Vec3 = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    addQuad(
      raw_,
      [inner[i]!.x, y, inner[i]!.z],
      [outer[i]!.x, y, outer[i]!.z],
      [outer[j]!.x, y, outer[j]!.z],
      [inner[j]!.x, y, inner[j]!.z],
      up,
    );
  }
}

/**
 * A GABLE ROOF with its ridge along z, and with the CORRECT slope normal.
 *
 * See the header for why this does not call `mesh-kit.ts`'s `addGableRoof`: that emitter swaps
 * the normal's two components, so a roof shades as its complement and the island's only rung-3
 * surface lands on rung 2. The plane from the eave `(-hx, 0)` to the ridge `(0, rise)` runs along
 * `(hx, rise)`; its outward normal is the perpendicular `(-rise, hx)`, which is what is emitted
 * here and what the rung table in the header was measured from.
 *
 * THE RIDGE ALWAYS RUNS ALONG Z, and there is no option to turn it. Ridge along z puts the two
 * slopes facing -x and +x, which is rung 3 against rung 0 — the brightest and the darkest entries
 * the island can deliver, on one object. Ridge along x and the same pitch gives rung 2 against
 * rung 0, i.e. a roof no brighter than a flat lid. Every reference image reads from its roofs
 * first, so giving that away by parameter was not worth the flexibility; a caller who wants the
 * building turned turns the whole building with `yaw`, which turns the light relationship too and
 * is therefore an honest change rather than a hidden downgrade.
 */
function addPitchedRoof(
  raw_: Raw,
  centre: Vec3,
  half: { x: number; z: number },
  rise: number,
  opts: { overhang?: number; yaw?: number } = {},
): void {
  const over = opts.overhang ?? 0;
  const yaw = opts.yaw ?? 0;
  const hx = half.x + over;
  const hz = half.z + over;
  const put = (lx: number, ly: number, lz: number): Vec3 => {
    const [x, z] = turn(yaw, lx, lz);
    return [centre[0] + x, centre[1] + ly, centre[2] + z];
  };
  const face = (v: Vec3): Vec3 => turnV(yaw, norm(v));

  const e0 = put(-hx, 0, -hz);
  const e1 = put(-hx, 0, hz);
  const e2 = put(hx, 0, hz);
  const e3 = put(hx, 0, -hz);
  const r0 = put(0, rise, -hz);
  const r1 = put(0, rise, hz);
  // The two slopes. `(-rise, hx)` and `(rise, hx)`, NOT `(-hx, rise)` — see above.
  addQuad(raw_, e0, e1, r1, r0, face([-rise, hx, 0]));
  addQuad(raw_, e2, e3, r0, r1, face([rise, hx, 0]));
  // The gable ends. Both land on rung 0 whichever way the building is turned (every vertical face
  // does), which is exactly why the ends are the cheap faces to spend on and the slopes are not.
  addTri(raw_, e0, r0, e3, face([0, 0, -1]));
  addTri(raw_, e1, e2, r1, face([0, 0, 1]));
}

// ---------------------------------------------------------------------------------------------
// ROCK
// ---------------------------------------------------------------------------------------------

/**
 * A boulder or outcrop — an irregular stone mass.
 *
 * LOBES RATHER THAN A BOX, AND THE REASON IS THE RUNG LADDER RATHER THAN REALISM. A box has six
 * constant normals and therefore two colours; a union of ellipsoids sweeps its normals
 * continuously and crosses three or four rungs between its lit shoulder and its shaded flank. On
 * a banded material that sweep is the only thing that says "this is round", and a rock is the one
 * prop in the vocabulary whose whole job is to be a mass rather than a construction.
 *
 * Every lobe sits with its own bottom pole exactly on y = 0 (the octahedron's -y vertex survives
 * subdivision, so the touch is exact rather than approximate). A lobe allowed to float would read
 * as a floating rock; a lobe allowed to sink would quietly lose a third of its silhouette on land
 * that is not flat.
 */
export function growRock(opts: {
  seed?: number;
  radius?: number;
  height?: number;
  lobes?: number;
  token?: string;
}): PropParts {
  const seed = opts.seed ?? 1;
  const radius = opts.radius ?? 4;
  const height = opts.height ?? 4;
  const lobes = opts.lobes ?? 3;
  const token = opts.token ?? PROP_TOKENS.stone;

  const parts = new Map<string, Raw>();
  // A zero or negative extent would drive `addLobe`'s per-axis normal correction through a
  // divide by zero and ship NaNs into a GPU buffer, where they surface as a whole missing prop
  // rather than as an error. Refuse the input instead.
  if (!(radius > 0) || !(height > 0)) return finish(parts);

  const body = raw(parts, token);
  const rng = mulberry32(seed);

  // The main mass. Slightly shallower in z than in x so the boulder is not a sphere; the
  // asymmetry is fixed rather than seeded, so two rocks of the same seed differ only in their
  // satellites and a caller varying the seed still gets a recognisable family.
  addLobe(body, [0, height / 2, 0], [radius, height / 2, radius * 0.86], ROCK_DETAIL);

  // Satellites. FIXED DRAW ORDER and one rng() call per quantity per lobe, in a fixed sequence —
  // this is the whole determinism contract, and the reason the angle jitter is drawn before the
  // distance rather than in whatever order reads best.
  const satellites = Math.max(0, Math.floor(lobes) - 1);
  for (let i = 0; i < satellites; i++) {
    const around = (i / Math.max(1, satellites)) * Math.PI * 2 + (rng() - 0.5) * 0.9;
    const dist = radius * (0.42 + rng() * 0.34);
    const lr = radius * (0.3 + rng() * 0.26);
    const lh = lr * (0.72 + rng() * 0.4);
    addLobe(
      body,
      [Math.cos(around) * dist, lh, Math.sin(around) * dist],
      [lr, lh, lr * 0.9],
      ROCK_DETAIL,
    );
  }
  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// POT
// ---------------------------------------------------------------------------------------------

/**
 * A terracotta planter, optionally with something growing out of it. The owner's well-garden
 * reference carries several, each with a small tree in it, and they are half of why that picture
 * reads as tended rather than as landscape.
 *
 * THE PROFILE IS A CLOSED LOOP, OUT AND BACK IN. `addLathe` emits no caps, so a pot revolved from
 * an outside-only profile is an open tube you can see straight through at this camera. The
 * profile therefore climbs the outside, crosses the rim, comes back DOWN the inside and closes at
 * `r = 0` on the soil surface. The rim's vertical lip is deliberate: it is one of the few places
 * a rung-0 face is wanted, because a hard dark line at the rim is what separates a pot from a
 * mound at 2 px per ground unit.
 */
export function growPot(opts: {
  seed?: number;
  radius?: number;
  height?: number;
  contents?: 'none' | 'shrub' | 'sapling' | 'blossom' | 'marigold';
  potToken?: string;
  foliageToken?: string;
}): PropParts {
  const seed = opts.seed ?? 1;
  const radius = opts.radius ?? 3;
  const height = opts.height ?? 4.5;
  const contents = opts.contents ?? 'shrub';
  const potToken = opts.potToken ?? PROP_TOKENS.terracotta;
  const foliageToken = opts.foliageToken ?? PROP_TOKENS.hedge;

  const parts = new Map<string, Raw>();
  if (!(radius > 0) || !(height > 0)) return finish(parts);

  const soilY = height * 0.8;
  addLathe(
    raw(parts, potToken),
    [
      { r: 0, y: 0 }, // closed underside — never seen, but an open one lets the ground through
      { r: radius * 0.62, y: 0 }, // the foot, narrower than the belly: a thrown pot's stance
      { r: radius * 0.93, y: height * 0.42 }, // the belly
      { r: radius * 0.8, y: height * 0.72 }, // the waist
      { r: radius, y: height * 0.88 }, // the flare out to the rim
      { r: radius, y: height }, // the rim's vertical lip — a hard rung-0 edge, on purpose
      { r: radius * 0.86, y: height }, // over the rim
      { r: radius * 0.8, y: height * 0.9 }, // back down the inside
      { r: 0, y: soilY }, // and closed at the soil
    ],
    [0, 0, 0],
    ROUND_SIDES,
  );

  if (contents === 'none') return finish(parts);

  const rng = mulberry32(seed);
  const foliage = raw(parts, foliageToken);

  if (contents === 'sapling') {
    // A SAPLING IS A TRUNK PLUS A CROWN, and the trunk wears `SHARED_TOKENS.storyTrunk` — the
    // island's one authored bole colour — rather than a new brown. A second brown would be a
    // palette entry that says nothing the first does not.
    const trunkTop = soilY + height * 0.95;
    addTube(
      raw(parts, SHARED_TOKENS.storyTrunk),
      [
        [0, soilY - height * 0.05, 0],
        [0, (soilY + trunkTop) / 2, 0],
        [0, trunkTop, 0],
      ],
      [radius * 0.17, radius * 0.14, radius * 0.11],
      5,
    );
    addLobe(
      foliage,
      [0, trunkTop + radius * 0.5, 0],
      [radius * 0.95, radius * 0.78, radius * 0.95],
      2,
    );
    addLobe(
      foliage,
      [radius * 0.42, trunkTop + radius * 0.1, -radius * 0.2],
      [radius * 0.55, radius * 0.46, radius * 0.55],
      1,
    );
    addLobe(
      foliage,
      [-radius * 0.38, trunkTop + radius * 0.22, radius * 0.28],
      [radius * 0.5, radius * 0.44, radius * 0.5],
      1,
    );
  } else {
    // A MOUND OF THREE LOBES for the shrub-shaped contents. Three, not one: a single ellipsoid
    // reads as a ball balanced on a pot, and three overlapping ones read as growth. Their
    // placement is seeded so a row of pots is not a row of identical pots — the jitter is the
    // only thing distinguishing them, since they share a token and therefore a colour.
    const mound = soilY + radius * 0.5;
    addLobe(foliage, [0, mound, 0], [radius * 0.92, radius * 0.72, radius * 0.92], 2);
    for (let i = 0; i < 2; i++) {
      const around = (rng() - 0.5) * Math.PI * 2;
      const off = radius * (0.3 + rng() * 0.24);
      const lr = radius * (0.44 + rng() * 0.2);
      addLobe(
        foliage,
        [Math.cos(around) * off, mound + radius * (0.1 + rng() * 0.3), Math.sin(around) * off],
        [lr, lr * 0.82, lr],
        1,
      );
    }
  }

  if (contents === 'blossom' || contents === 'marigold') {
    // THE ACCENT LOBES ARE FAT FOR THEIR JOB, AND THAT IS THE RESOLUTION FLOOR TALKING. A real
    // blossom cluster on a 6-unit-wide pot would be well under a ground unit across and would
    // deliver shimmer rather than colour. At 0.28 of the pot's radius they are about 1.7 units
    // across — over `MIN_FEATURE`, so they land as flecks of the reference's own pink or orange
    // instead of as noise.
    const accent = raw(
      parts,
      contents === 'blossom' ? PROP_TOKENS.blossom : PROP_TOKENS.marigold,
    );
    const mound = soilY + radius * 0.5;
    for (let i = 0; i < 5; i++) {
      const around = (i / 5) * Math.PI * 2 + rng() * 0.8;
      const off = radius * (0.35 + rng() * 0.4);
      const lift = mound + radius * (0.25 + rng() * 0.55);
      const lr = radius * 0.28;
      addLobe(accent, [Math.cos(around) * off, lift, Math.sin(around) * off], [lr, lr, lr], 1);
    }
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// WELL
// ---------------------------------------------------------------------------------------------

/**
 * A stone well: a battered footing, a drum, a light coping ring, water set below the rim, and
 * (with `roof`) two posts carrying a small pitched roof. This is the centrepiece of the owner's
 * own well-garden reference, and it is the single prop in this file that carries the most kinds
 * of material at once — five, or six with its roof — which is the ADR-0406 count in one object.
 *
 * THE FOUR STONE TONES ARE THE CONTRAST, NOT THE GEOMETRY, and that is forced rather than chosen.
 * A drum is a ring of vertical faces, so every one of them lands on rung 0 whatever compass
 * bearing it faces — the ladder simply has no entry between rung 0 and a horizontal top. So the
 * well is read by its horizontals: a `stoneDark` footing ledge, a `stoneLight` coping (rung 2 on
 * the lightest built token, which makes it the brightest ring on the island), a `water` disc set
 * well below that rim, and a dark shaft between them. Battering the drum would have bought rung 1
 * and cost the well its cylindrical silhouette, which is the thing that says "well".
 */
export function growWell(opts: {
  radius?: number;
  wallHeight?: number;
  roof?: boolean;
  roofToken?: string;
}): PropParts {
  const radius = opts.radius ?? 6;
  const wallHeight = opts.wallHeight ?? 5;
  const roof = opts.roof ?? true;
  const roofToken = opts.roofToken ?? PROP_TOKENS.roofTile;

  const parts = new Map<string, Raw>();
  if (!(radius > 0) || !(wallHeight > 0)) return finish(parts);

  const footH = Math.min(1.2, wallHeight * 0.24);
  const copeH = Math.min(1.0, wallHeight * 0.2);
  const drum = ringProfile(0, 0, radius, ROUND_SIDES);
  const foot = ringProfile(0, 0, radius * 1.08, ROUND_SIDES);
  const copeOut = ringProfile(0, 0, radius * 1.1, ROUND_SIDES);
  const copeIn = ringProfile(0, 0, radius * 0.8, ROUND_SIDES);

  // ---- the footing: a wider course whose top LEDGE is the well's first horizontal ----------
  const dark = raw(parts, PROP_TOKENS.stoneDark);
  addWall(dark, foot, 0, footH);
  addAnnulus(dark, drum, foot, footH);

  // ---- the drum ---------------------------------------------------------------------------
  addWall(raw(parts, PROP_TOKENS.stone), drum, footH, wallHeight);

  // ---- the coping: the brightest ring on the island ----------------------------------------
  const cope = raw(parts, PROP_TOKENS.stoneLight);
  addWall(cope, copeOut, wallHeight, wallHeight + copeH);
  addAnnulus(cope, copeIn, copeOut, wallHeight + copeH);

  // ---- the shaft and the water -------------------------------------------------------------
  //
  // The water sits a THIRD of the wall height below the rim rather than at it. At the delivered
  // camera a disc flush with the coping reads as a lid; sunk, the inward-facing shaft wall above
  // it is visible as a dark crescent, and that crescent is what says the well is open. The shaft
  // is `stoneDark` and inward-facing — the one place in this file that needs a wall `addPrism`
  // cannot emit.
  const waterTop = wallHeight - Math.max(1.2, wallHeight * 0.34);
  addWall(dark, copeIn, waterTop, wallHeight + copeH, true);
  addPrism(raw(parts, PROP_TOKENS.water), copeIn, waterTop - 0.5, waterTop, { skipBottom: true });

  if (roof) {
    // The posts stand ON the coping, at 0.94 of the radius, which puts them inside the coping's
    // outer ring and outside its inner one — i.e. on the masonry, not over the hole. Their
    // half-width is set from `MIN_FEATURE`: a realistic well post on a 12-unit well would be
    // under a ground unit and would shimmer out of existence.
    const postHalf = Math.max(MIN_FEATURE * 0.85, radius * 0.14);
    const postY = wallHeight + copeH;
    const postH = Math.max(3, radius * 1.05);
    const wood = raw(parts, PROP_TOKENS.wood);
    for (const side of [-1, 1]) {
      addBox(wood, [side * radius * 0.94, postY, 0], { x: postHalf, z: postHalf }, postH, {
        skipBottom: true,
      });
    }
    // Pitch: rise `0.62r` over a half-span of `0.95r + 0.14r` = about 30 degrees, inside the
    // 12.7-44.8 degree rung-3 window. The eaves land directly over the posts.
    addPitchedRoof(
      raw(parts, roofToken),
      [0, postY + postH, 0],
      { x: radius * 0.95, z: radius * 0.62 },
      radius * 0.62,
      { overhang: radius * 0.14 },
    );
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// COTTAGE
// ---------------------------------------------------------------------------------------------

/**
 * A cottage: a dark footing course, battered stone walls, a pitched roof with an overhang, a
 * chimney with a clay pot, a dark doorway and two windows — and optionally a lean-to porch with
 * its own posts and a paved threshold.
 *
 * ANYTHING ABOVE ABOUT 15 UNITS TALL READS AS ARCHITECTURE, which is exactly what is wanted here
 * and is why the defaults are what they are: 9 units to the eaves and 8 more to the ridge puts
 * the ridge at 17 and the chimney above 20, against a typical plant at 6 and the hero tree at 88.
 * A cottage is therefore the second-biggest thing on an island and reads as the settlement.
 *
 * THREE APPEARANCE CALLS ARE MADE HERE, all recorded at their constants below: the wall's batter,
 * the roof's overhang, and the chimney's deliberate fatness.
 */
export function growCottage(opts: {
  seed?: number;
  width?: number;
  depth?: number;
  wallHeight?: number;
  rise?: number;
  yaw?: number;
  wallToken?: string;
  roofToken?: string;
  porch?: boolean;
}): PropParts {
  const seed = opts.seed ?? 1;
  const width = opts.width ?? 20;
  const depth = opts.depth ?? 15;
  const wallHeight = opts.wallHeight ?? 9;
  const rise = opts.rise ?? 8;
  const yaw = opts.yaw ?? 0;
  const wallToken = opts.wallToken ?? PROP_TOKENS.stoneLight;
  const roofToken = opts.roofToken ?? PROP_TOKENS.roofTile;
  const porch = opts.porch ?? false;

  const parts = new Map<string, Raw>();
  if (!(width > 0) || !(depth > 0) || !(wallHeight > 0)) return finish(parts);

  const rng = mulberry32(seed);
  const halfW = width / 2;
  const halfD = depth / 2;
  const footH = Math.min(1.2, wallHeight * 0.15);

  /**
   * APPEARANCE CALL — THE WALL'S BATTER, 0.2 (11.3 degrees off vertical).
   *
   * Measured, not chosen for looks: a vertical wall lands on rung 0 at every compass bearing, so
   * an un-battered cottage delivers exactly two colours — wall and roof — and reads as a
   * silhouette with a lid. At slope 0.2 the light-facing wall reaches dot 0.6029 and lifts to
   * rung 1, so the building carries FOUR tones (roof rung 3, roof rung 0, lit wall rung 1, shaded
   * wall rung 0) for the price of leaning a wall by 11 degrees, which on a stone cottage reads as
   * thick tapering masonry rather than as a mistake. Slope 0.4 would reach rung 2 but tapers the
   * wall by 22 degrees and turns the cottage into a pyramid.
   */
  const BATTER = 0.2;

  // ---- the footing -------------------------------------------------------------------------
  addBox(
    raw(parts, PROP_TOKENS.stoneDark),
    [0, 0, 0],
    { x: halfW + 0.6, z: halfD + 0.6 },
    footH,
    { yaw, skipBottom: true },
  );

  // ---- the walls ---------------------------------------------------------------------------
  addBox(
    raw(parts, wallToken),
    [0, footH, 0],
    { x: halfW, z: halfD },
    wallHeight - footH,
    { batter: BATTER, yaw, skipBottom: true },
  );

  // ---- the roof ----------------------------------------------------------------------------
  //
  // APPEARANCE CALL — THE OVERHANG, 1.5 units. An overhang is the only thing that puts a hard
  // horizontal shadow line on the wall below in a renderer with no cast shadows: the eave stops
  // and the wall starts, and the rung step from roof to wall does the rest. 1.5 units is three
  // delivered pixels, which is the smallest overhang that still reads as an eave.
  const OVERHANG = 1.5;
  // Pitch at the defaults: rise 8 over a half-span of 10 + 1.5 = 34.8 degrees, inside the
  // 12.7-44.8 degree rung-3 window, so the lit slope is the brightest surface on the island and
  // its twin is the darkest. A caller flattening `rise` below about 2.6 (12.7 degrees) drops the
  // roof to rung 2 and gives that away.
  addPitchedRoof(raw(parts, roofToken), [0, wallHeight, 0], { x: halfW, z: halfD }, rise, {
    overhang: OVERHANG,
    yaw,
  });

  // ---- the chimney -------------------------------------------------------------------------
  //
  // APPEARANCE CALL — THE CHIMNEY IS 2.6 UNITS ACROSS, which is fat for a cottage and is the
  // resolution floor rather than a stylistic choice: at 2 px per ground unit a realistic 0.4-unit
  // stack disappears entirely and takes its triangles with it. At 2.6 it lands as five delivered
  // pixels, which is enough to read as a chimney.
  //
  // It stands on the RIDGE LINE at the -z gable, which is the classic cottage arrangement and
  // also the one that guarantees the stack clears the roof surface rather than intersecting a
  // slope at a shallow angle. Its base is buried at mid-wall height, so no seam is ever visible.
  const chimHalf = Math.max(MIN_FEATURE * 1.3, width * 0.065);
  const [chimX, chimZ] = turn(yaw, 0, -(halfD - chimHalf * 1.2));
  const chimBase = wallHeight * 0.45;
  const chimTop = wallHeight + rise + 3.2;
  addBox(
    raw(parts, PROP_TOKENS.stone),
    [chimX, chimBase, chimZ],
    { x: chimHalf, z: chimHalf },
    chimTop - chimBase,
    { batter: 0.05, yaw, skipBottom: true },
  );
  // The clay pot on top. One more MATERIAL for two boxes' worth of triangles, which is the
  // cheapest kind of object count there is (ADR-0406 counts KINDS, not polygons).
  addBox(
    raw(parts, PROP_TOKENS.terracotta),
    [chimX, chimTop, chimZ],
    { x: chimHalf * 0.62, z: chimHalf * 0.62 },
    1.7,
    { yaw, skipBottom: true },
  );

  // ---- the openings ------------------------------------------------------------------------
  //
  // A DOOR IS A PANEL ON THE WALL, NOT A HOLE IN IT. A real recess would need the wall to be
  // built out of five boxes instead of one and would deliver, at this size, the same two pixels
  // of dark. So the openings are flat quads laid on the battered wall plane and pushed
  // `PANEL_PROUD` out along the WALL'S OWN NORMAL — which means they inherit the wall's rung and
  // sit dark against it. They go on the -x wall because that is the LIT wall (rung 1); a dark
  // panel on a rung-0 wall is two dark things next to each other.
  const wallOut = norm([-1, BATTER, 0]);
  const faceX = (y: number): number => -(halfW - BATTER * Math.max(0, y - footH));
  const voids = raw(parts, PROP_TOKENS.doorway);
  const panel = (y0: number, y1: number, zc: number, hz: number): void => {
    const at = (y: number, z: number): Vec3 => {
      const [x, rz] = turn(yaw, faceX(y) + wallOut[0] * PANEL_PROUD, z);
      return [x, y + wallOut[1] * PANEL_PROUD, rz];
    };
    addQuad(voids, at(y0, zc - hz), at(y0, zc + hz), at(y1, zc + hz), at(y1, zc - hz), turnV(yaw, wallOut));
  };
  // The door's offset along the wall is seeded, so a village of cottages is not a village of one
  // cottage. Bounded so the door and both windows stay on the wall at the default proportions.
  const doorZ = (rng() - 0.5) * depth * 0.18;
  const doorH = Math.min(wallHeight * 0.62, 5.4);
  panel(footH, footH + doorH, doorZ, Math.max(MIN_FEATURE, width * 0.075));
  const winY = footH + doorH * 0.58;
  const winH = Math.max(MIN_FEATURE * 2, wallHeight * 0.26);
  const winHalf = Math.max(MIN_FEATURE, width * 0.06);
  for (const side of [-1, 1]) {
    panel(winY, winY + winH, doorZ + side * depth * 0.28, winHalf);
  }

  if (porch) {
    // ---- the lean-to -----------------------------------------------------------------------
    //
    // A MONO-PITCH SLOPING AWAY FROM THE WALL, and it is the second-brightest surface on the
    // building: dropping 0.30 per unit of run gives it a normal of (-0.287, 0.958, 0), dot
    // 0.9159 — rung 3, the same full-strength entry the main roof reaches, from a much shallower
    // slope. That is the -x facing direction doing the work, which is the same reason the main
    // ridge runs along z.
    const porchDepth = Math.min(5.5, width * 0.28);
    const hiY = footH + (wallHeight - footH) * 0.82;
    const loY = hiY - porchDepth * 0.3;
    const porchHalfZ = Math.min(depth * 0.3, 5);
    const outerX = -halfW - porchDepth;
    const innerX = faceX(hiY);
    const at = (x: number, y: number, z: number): Vec3 => {
      const [rx, rz] = turn(yaw, x, z);
      return [rx, y, rz];
    };
    const roofN = turnV(yaw, norm([-(hiY - loY), porchDepth, 0]));
    addQuad(
      raw(parts, roofToken),
      at(outerX, loY, doorZ - porchHalfZ),
      at(outerX, loY, doorZ + porchHalfZ),
      at(innerX, hiY, doorZ + porchHalfZ),
      at(innerX, hiY, doorZ - porchHalfZ),
      roofN,
    );
    const posts = raw(parts, PROP_TOKENS.wood);
    for (const side of [-1, 1]) {
      const [px, pz] = turn(yaw, outerX + 0.8, doorZ + side * (porchHalfZ - 0.8));
      addBox(posts, [px, 0, pz], { x: 0.7, z: 0.7 }, loY, { skipBottom: true });
    }
    // A paved threshold. One more material for one prism, and it is the thing that stops the
    // porch looking like it is standing in the grass. It is laid under the porch and centred on
    // the door, so it moves with the seeded door offset rather than sitting square to a building
    // whose door is not.
    addPrism(
      raw(parts, PROP_TOKENS.paving),
      rectProfileAt(-halfW - porchDepth * 0.45, doorZ, porchDepth * 0.55, porchHalfZ * 0.9, yaw),
      0,
      0.6,
      { skipBottom: true },
    );
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// LANTERN
// ---------------------------------------------------------------------------------------------

/**
 * A stone lantern: a plinth, a shaft, a platform, a lit chamber and a flared cap.
 *
 * ⚠ IT IS THE ONLY THING ON THE ISLAND WEARING `PROP_TOKENS.lantern`, WHICH IS THE BRIGHTEST
 * ENTRY IN THE WHOLE PALETTE (`#f5e2a4`), AND THAT IS WHY IT IS USED SPARINGLY. Brightness is a
 * finite resource in a closed four-rung palette: the eye goes to the lightest thing in the frame
 * first, so a lantern placed anywhere becomes a focal point whether or not it was meant to be
 * one. Two or three per island reads as lighting; a row of them reads as a runway and drags
 * attention off whatever the island was actually about. The chamber is the only part wearing it —
 * the plinth, shaft, platform and cap all wear the caller's `token`.
 *
 * APPEARANCE CALL — THE SHAFT IS PROPORTIONALLY FAT. At the documented size (2.5 units across,
 * 10 tall) a realistic tapered shaft would be about 0.7 units across and would fall below
 * `MIN_FEATURE`, delivering shimmer instead of a lantern. It is drawn at 0.58 of the cap radius
 * instead, which is stubby for a Japanese toro and is the difference between a prop that resolves
 * and one that does not.
 *
 * The cap is a six-sided cone, and it is the second rung-3 surface in the file: its slope normal
 * is (-0.6925, 0.7214, 0) on the light-facing facet — dot 0.9044, rung 3. That is what makes a
 * two-metre object read at all from across an island.
 */
export function growLantern(opts: { height?: number; token?: string }): PropParts {
  const height = opts.height ?? 10;
  const token = opts.token ?? PROP_TOKENS.stone;

  const parts = new Map<string, Raw>();
  if (!(height > 0)) return finish(parts);

  // The cap's radius sets the prop's width: 2 x 1.16 x 0.11 x height is 2.55 units across at the
  // documented 10-unit height, which is the size the reference lanterns read at.
  const r = height * 0.11;
  const sides = 6;
  const stone = raw(parts, token);

  addPrism(stone, ringProfile(0, 0, r, sides), 0, height * 0.1, { skipBottom: true });
  addPrism(stone, ringProfile(0, 0, r * 0.58, sides), height * 0.1, height * 0.6, {
    skipBottom: true,
    skipTop: true,
  });
  addPrism(stone, ringProfile(0, 0, r * 1.0, sides), height * 0.6, height * 0.7, {
    skipBottom: true,
  });
  // The lit chamber. Narrower than the platform it stands on, so the platform's top face — a
  // horizontal, therefore rung 2 — shows as a bright ledge under the light rather than being
  // covered by it.
  addPrism(raw(parts, PROP_TOKENS.lantern), ringProfile(0, 0, r * 0.82, sides), height * 0.7, height * 0.88, {
    skipBottom: true,
    skipTop: true,
  });
  // The cap. Two profile points is a frustum; `addLathe` derives the slope normal from the
  // profile itself, so the cone shades as the cone it is.
  addLathe(
    stone,
    [
      { r: r * 1.16, y: height * 0.88 },
      { r: r * 0.14, y: height },
    ],
    [0, 0, 0],
    sides,
  );

  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// ARCH
// ---------------------------------------------------------------------------------------------

/**
 * A free-standing stone arch or gateway with a dark void through it — the "stone doorway" in the
 * owner's well-garden reference.
 *
 * THE VOID IS DRAWN RATHER THAN LEFT EMPTY, and that is what makes it read as a doorway instead of
 * as a gap between two piers. `PROP_TOKENS.doorway` exists for exactly this ("a doorway, a window,
 * the inside of an arch — a void rather than a surface"), and a slab of it filling the opening
 * lands on rung 0 on every face, which is the darkest thing the palette can put next to lit stone.
 * Leaving the opening genuinely open would show the ground behind it, and at 2 px per ground unit
 * ground-through-a-gap and stone are two mid-tones that do not separate.
 *
 * THE HEAD IS STEPPED, NOT CURVED. A true voussoir arch at this delivered size is four pixels of
 * curve; a single narrower block at the top of the void delivers the same read — an opening
 * narrower at its head than at its foot — for two quads.
 */
export function growArch(opts: {
  width?: number;
  height?: number;
  depth?: number;
  yaw?: number;
  token?: string;
}): PropParts {
  const width = opts.width ?? 12;
  const height = opts.height ?? 14;
  const depth = opts.depth ?? 4;
  const yaw = opts.yaw ?? 0;
  const token = opts.token ?? PROP_TOKENS.stone;

  const parts = new Map<string, Raw>();
  if (!(width > 0) || !(height > 0) || !(depth > 0)) return finish(parts);

  const pierHalf = width * 0.15; // leaves an opening 0.4 of the width — a gate, not a slot
  const footH = Math.min(1.1, height * 0.09);
  const lintelH = height * 0.17;
  const capH = Math.min(0.9, height * 0.07);
  const pierTop = height - lintelH - capH;
  const pierX = width / 2 - pierHalf;
  const halfD = depth / 2;

  const stone = raw(parts, token);
  const dark = raw(parts, PROP_TOKENS.stoneDark);
  for (const side of [-1, 1]) {
    const [fx, fz] = turn(yaw, side * pierX, 0);
    addBox(dark, [fx, 0, fz], { x: pierHalf * 1.15, z: halfD * 1.12 }, footH, {
      yaw,
      skipBottom: true,
    });
    // The pier's batter is 0.04 — too shallow to change its rung (it stays on rung 0, as every
    // near-vertical face does) and kept only because a gate pier that tapers reads as built and
    // one that does not reads as extruded. The tonal work is done by the footing and the cap.
    addBox(stone, [fx, footH, fz], { x: pierHalf, z: halfD }, pierTop - footH, {
      batter: 0.04,
      yaw,
      skipBottom: true,
    });
  }
  addBox(stone, [0, pierTop, 0], { x: width / 2, z: halfD * 1.05 }, lintelH, {
    yaw,
    skipBottom: true,
  });
  // The cap: `stoneLight` on a horizontal top face is rung 2 on the lightest built token, so the
  // arch's own head is the brightest line in it and the eye reads the opening under it.
  addBox(
    raw(parts, PROP_TOKENS.stoneLight),
    [0, pierTop + lintelH, 0],
    { x: width / 2 + capH * 0.6, z: halfD * 1.18 },
    capH,
    { yaw, skipBottom: true },
  );

  const openHalf = width / 2 - 2 * pierHalf;
  const voidHalfZ = depth * 0.16;
  const voids = raw(parts, PROP_TOKENS.doorway);
  addBox(voids, [0, 0, 0], { x: openHalf, z: voidHalfZ }, pierTop * 0.8, { yaw, skipBottom: true });
  addBox(voids, [0, pierTop * 0.8, 0], { x: openHalf * 0.68, z: voidHalfZ }, pierTop * 0.2, {
    yaw,
    skipBottom: true,
  });

  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// PAVILION
// ---------------------------------------------------------------------------------------------

/**
 * A timber pavilion: a stepped stone plinth, four or six posts, two lit eave beams and a big
 * pitched roof. Meant to be the focal MASS of an island that has no hero tree, which is why its
 * defaults make it 26 x 20 in plan and 22 to the ridge — bigger in footprint than a cottage and
 * comparable in height, so it reads as the thing the island is about.
 *
 * SIX POSTS WHEN THE PLAN IS LONG, FOUR OTHERWISE — the rule is `width >= depth * 1.35`, applied
 * mechanically rather than by taste. A long roof carried on four posts reads as a table; the
 * middle pair is what makes it read as a building. The threshold is where the unsupported span
 * exceeds the depth by a third, which is roughly where the eye starts asking the question.
 *
 * THE TWO EAVE BEAMS ARE THE ONLY REASON A PAVILION IS NOT A HAT ON STICKS. They are `woodLight`
 * boxes just under the eaves and slightly outboard of them, so their top faces (horizontal,
 * rung 2, on the light timber token) draw a bright line the full length of the building between
 * the rung-3 roof above and the rung-0 posts below. That three-tone stack is the whole silhouette.
 */
export function growPavilion(opts: {
  width?: number;
  depth?: number;
  postHeight?: number;
  rise?: number;
  yaw?: number;
  plinth?: boolean;
  roofToken?: string;
}): PropParts {
  const width = opts.width ?? 26;
  const depth = opts.depth ?? 20;
  const postHeight = opts.postHeight ?? 12;
  const rise = opts.rise ?? 10;
  const yaw = opts.yaw ?? 0;
  const plinth = opts.plinth ?? true;
  const roofToken = opts.roofToken ?? PROP_TOKENS.roofTile;

  const parts = new Map<string, Raw>();
  if (!(width > 0) || !(depth > 0) || !(postHeight > 0)) return finish(parts);

  const halfW = width / 2;
  const halfD = depth / 2;
  let deck = 0;
  if (plinth) {
    // Two courses rather than one: the step between them is a horizontal (rung 2) between two
    // verticals (rung 0), which is the only banding a plinth can have. The upper course is
    // `stoneLight`, so the deck the posts stand on is the brightest stone in the prop.
    const lowH = 1.2;
    const topH = 0.8;
    addPrism(raw(parts, PROP_TOKENS.stone), rectProfile(halfW * 0.96, halfD * 0.96, yaw), 0, lowH, {
      skipBottom: true,
    });
    addPrism(
      raw(parts, PROP_TOKENS.stoneLight),
      rectProfile(halfW * 0.88, halfD * 0.88, yaw),
      lowH,
      lowH + topH,
      { skipBottom: true },
    );
    deck = lowH + topH;
  }

  const postHalf = Math.max(MIN_FEATURE * 0.55, width * 0.042);
  const px = halfW * 0.82;
  const pz = halfD * 0.82;
  const spots: [number, number][] = [
    [-px, -pz],
    [px, -pz],
    [px, pz],
    [-px, pz],
  ];
  if (width >= depth * 1.35) spots.push([0, -pz], [0, pz]);
  const posts = raw(parts, PROP_TOKENS.wood);
  for (const [sx, sz] of spots) {
    const [x, z] = turn(yaw, sx, sz);
    addBox(posts, [x, deck, z], { x: postHalf, z: postHalf }, postHeight, { skipBottom: true });
  }

  const eaveY = deck + postHeight;
  const beams = raw(parts, PROP_TOKENS.woodLight);
  for (const side of [-1, 1]) {
    const [x, z] = turn(yaw, side * halfW * 0.94, 0);
    addBox(beams, [x, eaveY - 1.4, z], { x: 0.75, z: halfD * 0.9 }, 1.2, { yaw, skipBottom: true });
  }

  // Pitch at the defaults: rise 10 over a half-span of 13 + 2.5 = 32.8 degrees, inside the
  // rung-3 window. The overhang is deeper than a cottage's because the building is bigger and an
  // eave has to stay legible as a proportion of the roof, not as an absolute.
  addPitchedRoof(raw(parts, roofToken), [0, eaveY, 0], { x: halfW, z: halfD }, rise, {
    overhang: 2.5,
    yaw,
  });

  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// PLATFORM
// ---------------------------------------------------------------------------------------------

/**
 * A raised stone platform with a stepped edge — a terrace, a dais, the base of a shrine.
 *
 * ONE TOKEN, AND THE STEPS ARE THE CONTRAST. A platform is a horizontal thing, so its top lands
 * on rung 2 and its sides on rung 0 — the "silhouette with a lid" case in its purest form, and a
 * batter is not available because `addPrism` extrudes a profile vertically. What IS available is
 * the step: each course insets, so a stepped platform delivers an alternating band of rung-2
 * treads and rung-0 risers around its whole edge. That banding is why `courses` defaults to 2 and
 * not to 1, and it is the reason this is a stepped platform rather than a slab.
 *
 * The inset per course is `1 / (courses + 4)` of the profile, taken about the profile's own
 * CENTROID — about 17% at the default two courses, which on the default radius-20 ring is a
 * 3.3-unit tread, i.e. between six and seven delivered pixels. Below about 0.5 units a tread
 * stops resolving and the courses merge back into a slab, so a caller asking for many courses on
 * a small platform gets a smooth taper rather than steps, and that is the honest outcome.
 */
export function growPlatform(opts: {
  profile?: readonly { x: number; z: number }[];
  height?: number;
  courses?: number;
  token?: string;
}): PropParts {
  const profile = opts.profile ?? ringProfile(0, 0, 20, ROUND_SIDES);
  const height = opts.height ?? 3;
  const courses = Math.max(1, Math.floor(opts.courses ?? 2));
  const token = opts.token ?? PROP_TOKENS.stone;

  const parts = new Map<string, Raw>();
  if (profile.length < 3 || !(height > 0)) return finish(parts);

  const stone = raw(parts, token);
  const step = 1 / (courses + 4);
  for (let i = 0; i < courses; i++) {
    addPrism(
      stone,
      scaleProfile(profile, 1 - i * step),
      (height * i) / courses,
      (height * (i + 1)) / courses,
      { skipBottom: true },
    );
  }
  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// CRATES
// ---------------------------------------------------------------------------------------------

/**
 * A small stack of wooden crates and a barrel — human-scale clutter. Every one of the owner's
 * references carries some, and they do a job nothing else in the vocabulary does: they give the
 * picture its SENSE OF SCALE. A cottage next to nothing could be any size; a cottage next to a
 * waist-high crate is a cottage.
 *
 * THE TOKENS ALTERNATE `wood` AND `woodLight`, and that is forced by the ladder rather than
 * chosen. A crate is a cube: four vertical faces on rung 0 and a top on rung 2, whichever way it
 * is turned. So a stack of same-token crates is one silhouette with two colours in it and no
 * internal edges at all — you cannot tell three crates from one. Alternating the token is the
 * only lever left, and it is the same lever `palette-band.ts` authored the pair for.
 *
 * The barrel is always present when anything is: it is a lathe, so it is the one object in the
 * group whose normals sweep, and putting a curve next to the boxes is what stops the group
 * reading as a single blocky mass.
 */
export function growCrates(opts: { seed?: number; count?: number; size?: number }): PropParts {
  const seed = opts.seed ?? 1;
  const count = Math.floor(opts.count ?? 3);
  const size = opts.size ?? 3;

  const parts = new Map<string, Raw>();
  if (!(size > 0) || count <= 0) return finish(parts);

  const rng = mulberry32(seed);
  // Two thirds on the ground, the rest stacked on them. Ceil, so a single crate is a ground crate
  // and never a crate stacked on nothing.
  const ground = Math.max(1, Math.ceil(count * 0.66));
  const placed: { x: number; z: number; y: number; s: number }[] = [];

  for (let i = 0; i < count; i++) {
    const s = size * (0.78 + rng() * 0.34);
    const spin = (rng() - 0.5) * 0.7;
    let x: number;
    let z: number;
    let y: number;
    if (i < ground) {
      const around = (i / ground) * Math.PI * 2 + 0.4;
      const dist = i === 0 ? 0 : size * 0.95;
      x = Math.cos(around) * dist;
      z = Math.sin(around) * dist;
      y = 0;
    } else {
      const host = placed[(i - ground) % ground]!;
      x = host.x + (rng() - 0.5) * size * 0.25;
      z = host.z + (rng() - 0.5) * size * 0.25;
      y = host.y + host.s;
    }
    placed.push({ x, z, y, s });
    addBox(
      raw(parts, i % 2 === 0 ? PROP_TOKENS.wood : PROP_TOKENS.woodLight),
      [x, y, z],
      { x: s / 2, z: s / 2 },
      s,
      { yaw: spin, skipBottom: true },
    );
  }

  // The barrel. Closed at both ends (`r = 0` top and bottom) because `addLathe` emits no caps and
  // an open barrel at this camera is a hole you can see the ground through.
  const br = size * 0.4;
  const bh = size * 1.3;
  addLathe(
    raw(parts, PROP_TOKENS.woodLight),
    [
      { r: 0, y: 0 },
      { r: br * 0.82, y: 0 },
      { r: br, y: bh * 0.45 },
      { r: br * 0.82, y: bh },
      { r: 0, y: bh },
    ],
    [size * 1.6, 0, -size * 0.5],
    ROUND_SIDES,
  );

  return finish(parts);
}

// ---------------------------------------------------------------------------------------------
// BOAT
// ---------------------------------------------------------------------------------------------

/**
 * The hull's plan half-outline, as (position along the keel, half-beam) with both normalised to
 * -1..1. Mirrored to make the full ring.
 *
 * IT IS CONVEX BY CONSTRUCTION AND THAT IS A REQUIREMENT, NOT A COINCIDENCE: `addWall` and
 * `addCap` fan their caps from the centroid, which is correct for a convex ring and silently
 * wrong for a concave one — it emits triangles outside the shape, which reads as a rendering
 * glitch rather than as a caller error. The half-beam's slopes are strictly decreasing
 * (1.40, 0.60, 0.13, -0.23, -0.86, -2.07), so the outline is concave as a function and the ring
 * is therefore convex. Change a number here and check that list again.
 *
 * The stern is a blunt transom and the bow is a point, which is what makes a 14-unit shape read
 * as a boat rather than as a leaf at 28 delivered pixels.
 */
const HULL_OUTLINE: readonly (readonly [number, number])[] = [
  [-1.0, 0.3],
  [-0.7, 0.72],
  [-0.3, 0.96],
  [0.0, 1.0],
  [0.35, 0.92],
  [0.7, 0.62],
  [1.0, 0.0],
];

/**
 * A moored rowing boat — a hull, a bright gunwale, a thwart and two oars. For a shore or a pond
 * edge.
 *
 * THE HULL WALLS ARE VERTICAL, DELIBERATELY, AND THE CONTRAST IS ALL IN THE RIM. A real hull
 * flares outward toward the gunwale, and on this light that is actively bad: a flared face's true
 * normal tips DOWNWARD, so the more realistic the flare the darker the hull gets. Battering it
 * inward instead would light better and would read as a barge. So the hull is a vertical band on
 * rung 0 — a dark silhouette — and everything that says "boat" is horizontal and light: a
 * `woodLight` gunwale ring, a `woodLight` sole, a thwart and two oars, all on rung 2. That is
 * also how boats read in the reference images, which is the check that this is a description of
 * the subject rather than a rationalisation of the ladder.
 *
 * APPEARANCE CALL — THE OARS ARE FAT. A real oar loom is about 0.05 of the boat's length and
 * would be half a ground unit here, under `MIN_FEATURE`. They are drawn at 1.1 units across, the
 * same trade the lantern's shaft and the cottage's chimney make: proportion loses to resolution,
 * because a correct proportion that does not resolve is not on the island at all.
 */
export function growBoat(opts: {
  length?: number;
  beam?: number;
  yaw?: number;
  hullToken?: string;
}): PropParts {
  const length = opts.length ?? 14;
  const beam = opts.beam ?? 5;
  const yaw = opts.yaw ?? 0;
  const hullToken = opts.hullToken ?? PROP_TOKENS.wood;

  const parts = new Map<string, Raw>();
  if (!(length > 0) || !(beam > 0)) return finish(parts);

  const ring: Plan[] = [];
  for (const [u, w] of HULL_OUTLINE) ring.push({ x: (u * length) / 2, z: (w * beam) / 2 });
  // Back along the mirrored side, skipping the two points that are already on the centreline.
  for (let i = HULL_OUTLINE.length - 2; i >= 1; i--) {
    const [u, w] = HULL_OUTLINE[i]!;
    ring.push({ x: (u * length) / 2, z: (-w * beam) / 2 });
  }
  const hull = spinProfile(ring, yaw);
  const inner = scaleProfile(hull, 0.76);

  const gunwaleY = Math.max(1.8, beam * 0.46);
  const soleY = gunwaleY * 0.42;

  const outside = raw(parts, hullToken);
  addWall(outside, hull, 0, gunwaleY);
  addCap(outside, hull, 0, false);
  addWall(outside, inner, soleY, gunwaleY, true);

  const bright = raw(parts, PROP_TOKENS.woodLight);
  addCap(bright, inner, soleY, true); // the sole — sun-bleached, and a horizontal, so rung 2
  addAnnulus(bright, inner, hull, gunwaleY); // the gunwale — the boat's only bright outline
  // The thwart, across the beam amidships.
  const [tx, tz] = turn(yaw, 0, 0);
  addBox(bright, [tx, gunwaleY - 0.9, tz], { x: 0.55, z: beam * 0.4 }, 0.45, {
    yaw,
    skipBottom: true,
  });
  // Two oars, lying across the boat at a slight angle to each other so they read as two.
  for (const side of [-1, 1]) {
    const oarYaw = yaw + side * 0.18;
    const [ox, oz] = turn(yaw, 0, (side * beam) / 6);
    addBox(bright, [ox, gunwaleY - 0.35, oz], { x: length * 0.42, z: 0.55 }, 0.4, {
      yaw: oarYaw,
      skipBottom: true,
    });
    const [bx, bz] = turn(oarYaw, side * length * 0.36, 0);
    addBox(
      bright,
      [tx + bx, gunwaleY - 0.35, tz + bz],
      { x: length * 0.09, z: 0.9 },
      0.38,
      { yaw: oarYaw, skipBottom: true },
    );
  }

  return finish(parts);
}
