// prop-linear.ts — the LINEAR and GROUND-SURFACE props: walls, fences, hedges, paths, paved
// areas, steps and water channels. Pure, deterministic, browser-free, node:test-provable, inside
// the ADR-0123 provability firewall with the rest of the experiment's thinking half.
//
// WHY THIS FILE EXISTS, and the count is the whole argument. ADR-0406's diagnosis was not a
// rendering diagnosis: our island draws FOUR kinds of object (ground, shrub, flower, tree) where
// the owner's four reference images draw eight to fifteen, and every one of those references has
// three things ours has none of — a HARD BOUNDARY (a fence or a wall), a PATH with its own
// material, and stone AND wood AND paving side by side. His flat pixel-art garden carries no cast
// shadow, no ambient occlusion, no relief and no bevels and still reads as a place. So the missing
// half is CONTENT, and this module is the boundary-and-ground-surface half of it.
//
// WHY IT IS ALLOWED. ADR-0406 D1: the harness island REPRESENTS NOTHING. It asserts no
// capability's proof state and no UAT verdict, so there is no state a decorative object can
// misreport and ADR-0367 D5 has nothing to bite on. That licence is scoped to this surface —
// ADR-0406 D2 leaves the product map exactly as it was.
//
// ---------------------------------------------------------------------------------------------
// THE RUNG ARITHMETIC IS THE DESIGN, NOT A DETAIL. Every shape below is the shape it is because
// of one measured fact, and it is the fact that decides whether a built prop reads as a solid or
// as a silhouette. The authored light is `LIGHT_DIRECTION = norm(-0.45, 0.82, 0.35)` and the
// authored ladder is `SHADE_LEVELS = [0.78, 0.80, 0.90, 1.00]`, quantised from the half-lambert
// `dot(n, L) * 0.5 + 0.5`. Measured landings (reproduced exactly by `rungOfNormal`, which is what
// the test asserts against rather than eyeballing a render):
//
//     a horizontal top  (0, 1, 0)                dot  0.821   rung 2  (x0.90)
//     ANY vertical face, at EVERY compass angle  dot <=0.571  rung 0  (x0.78)
//     a face battered 0.4 toward the light       dot  0.723   rung 2  (x0.90)
//     the same face battered 0.4 away            dot -0.113   rung 0  (x0.78)
//
// The consequence: A PLAIN VERTICAL BOX DELIVERS EXACTLY TWO COLOURS HOWEVER IT IS TURNED — its
// lid and its four identical sides — so a wall built of plain boxes is a flat silhouette with a
// stripe on top. That is not a shader defect to be tuned out; it is what a closed four-rung ladder
// does to a shape with no tilted faces. The fix lives in the SHAPE and in the TOKEN, and both
// levers are used here:
//
//   1. BATTER. Leaning a box's sides by slope 0.4 lifts the light-facing side to rung 2 while its
//      opposite stays on rung 0. The arithmetic that makes this a guarantee rather than a lucky
//      orientation: the four side directions of a box are two perpendicular pairs, and the light's
//      horizontal component has magnitude 0.5707, so the best of the four always reaches at least
//      0.5707/sqrt(2) = 0.4036 — which with a 0.4 batter lands on rung 1 at the very worst
//      orientation and rung 2 at the best. `prop-linear.test.ts` sweeps sixteen orientations and
//      asserts it, with `batter: 0` as the control that shows the batter is what buys it.
//   2. A SECOND TOKEN. Where two parts of one prop are BOTH vertical — a fence post against its
//      rails — no batter can separate them, because rung 0 is where every vertical face lands. The
//      separation has to come from the material. Hence `stone` against `stoneLight`, `wood`
//      against `woodLight`: the coping is one course lighter because at 2 px per ground unit a
//      wall's top course is the only part of it that lands above rung 0, and a wall seen from its
//      shaded side would otherwise be one flat block of x0.78.
//
// ---------------------------------------------------------------------------------------------
// THE SCALE, measured on the real fixture and NOT re-derived here. The island spans 233.8 x 135.1
// ground units and delivers at 2 px per unit, so it is ~468 px wide on screen. A typical plant is
// 7.4 units wide and ~6 tall; the hero tree is 75 x 88. THE NUMBER THAT DECIDES EVERY DEFAULT
// BELOW: a feature under about ONE ground unit stops resolving and becomes an aliasing shimmer at
// delivered size. So a wall coping is 1.3 units of course, not 0.3; a fence rail is 1.1 units
// square, not 0.8 (see `growFenceRun` — that is the one default changed from the brief, and the
// reason is this line). A wall reads as architecture between about 4 and 8 units tall: comparable
// to a plant, well under the tree.
//
// ---------------------------------------------------------------------------------------------
// EVERY APPEARANCE CALL IN THIS FILE IS RECORDED WITH ITS REASON (ADR-0392 D2 / ADR-0398 D3 — an
// unrecorded art call is a violation of that decision, not an exercise of it). The calls are
// stated beside their constants; the two worth naming up front because they are what a reader
// would otherwise re-derive:
//
//   * A WALL EMITS EXACTLY THE TWO TOKENS ITS OPTIONS NAME, and a third darker FOOTING course was
//     considered and DROPPED. A footing in `stoneDark` genuinely reads better on a stone wall —
//     three value steps instead of two. But `bodyToken`/`copingToken` are the caller's whole
//     palette control, and a hidden third token would put a stone footing under a wall the caller
//     asked to build out of `wood`. The third value step comes from the batter instead (rung 2
//     lit, rung 0 shaded) plus the lighter coping, which gets to three without the wart.
//   * A HEDGE IS A BATTERED BOX WITH A LOBED CREST, not a run of lobes. A run of lobes is what
//     `growPlant`'s `mound` style already does, and the owner's verdict on it on 2026-08-19 was
//     "circular swirls" — which is a fair reading, since a banded sphere lays concentric rings
//     inside its own outline. A clipped hedge is a MASS with a broken top, so the mass is a box
//     (flat faces, two rungs, reads as clipped) and only the crest is lobed.
//
// DETERMINISM (ADR-0380 D6 fence 2, restated by ADR-0406 D5). No clock, no `Math.random`. Every
// generator draws from one `mulberry32(seed)` consumed in a FIXED ORDER — the same rule
// `plant-geometry.ts` carries, and for the same reason: inserting a draw reshuffles everything
// downstream of it, so a new jitter goes at the END of a station's draw sequence or the whole run
// changes shape.

import {
  addBox,
  addLobe,
  addPrism,
  addQuad,
  cross,
  emptyRaw,
  finishRaw,
  mulberry32,
  norm,
  yawBasis,
  type GeneratedMesh,
  type Raw,
  type Vec3,
} from './mesh-kit.js';
import { PROP_TOKENS } from './palette-band.js';

/** The props of one run, as one mesh per authored TOKEN — the same shape `growTree` and
 *  `growFlower` return, so `mergeParts` in `IslandView.tsx` consumes all three identically and no
 *  mesh can ever wear two colours. */
export type PropParts = Map<string, GeneratedMesh>;

/** A ground-space point. x east, z south — the same space `GroundCell` points live in, and
 *  ABSOLUTE island coordinates rather than a local frame: what comes out carries the x and z that
 *  went in, and only y is measured from 0. */
export interface GPoint {
  x: number;
  z: number;
}

/**
 * A per-point ground height lookup the caller supplies, so a run DRAPES over the relief instead of
 * bridging it.
 *
 * The default is `() => 0`, and the two modes are exclusive rather than additive: leave it out and
 * the whole run stands on y = 0 for the caller to translate onto the terrain by one
 * `landHeight(gx, gz)`, or supply it and each block/post/slab finds its own foot — in which case
 * the caller adds NO further y offset. A run that got both would sit at twice the relief.
 */
export type HeightAt = (x: number, z: number) => number;

// ---------------------------------------------------------------------------
// The budget fences
// ---------------------------------------------------------------------------

/**
 * The most stations any polyline run may place.
 *
 * IT IS A UINT16 FENCE BEFORE IT IS AN ART CHOICE. `finishRaw` does `Uint16Array.from(raw.idx)`
 * with no guard, so an index above 65535 wraps SILENTLY and the mesh comes out folded into itself
 * — a defect that looks like art. The worst per-station cost in this module is 6 paving lanes at
 * 20 vertices each (one box with `skipBottom` is 5 quads of 4 unshared corners), so 512 stations
 * is 61,440 vertices in the heaviest single token: under the ceiling with room, and the test
 * asserts it against a deliberately pathological spacing rather than trusting the arithmetic here.
 *
 * It is also the honest answer to a spacing bug. A caller asking for 0.01-unit blocks over a
 * 700-unit rim wants 70,000 blocks, which is not a wall — it is a typo, and clamping turns it into
 * a coarse wall rather than a hang or a corrupted buffer.
 */
const MAX_STATIONS = 512;

/** Ceilings on the two options that multiply a station's cost. Six lanes of paving is already a
 *  48-unit-wide path at the default slab width; six rails is a fence with no gaps left. Past these
 *  the extra geometry is invisible and only spends the vertex budget. */
const MAX_ACROSS = 6;
const MAX_RAILS = 6;
/** A flight longer than this is a ramp, and a ramp is a different prop. */
const MAX_STEPS = 64;
/** `addPrism` fans its caps from the centroid, so a very fine ring is triangles nobody sees at
 *  2 px per unit — `ringProfile`'s own note says a nine-sided drum reads as masonry and a
 *  forty-sided one reads as a cylinder. */
const MAX_PROFILE = 64;

// ---------------------------------------------------------------------------
// Recorded appearance constants
// ---------------------------------------------------------------------------

/**
 * The height of a wall's cap course, in ground units.
 *
 * THE APPEARANCE CALL: 1.3 rather than a fraction of the wall's height, because what has to be
 * true is a DELIVERED fact and not a proportional one — at 2 px per ground unit this is a 2.6 px
 * band, and anything under about 1 unit dissolves into the shimmer the arc measured. A coping
 * scaled to 8% of the wall would vanish on a 4-unit garden wall and read as a plinth on a
 * 12-unit one.
 *
 * Exported because the height contract is `height + WALL_COPING_COURSE` and a test that hard-coded
 * 1.3 would pass against a stale copy of this number.
 */
export const WALL_COPING_COURSE = 1.3;

/** How far a coping stands proud of the wall body on each face. Half a unit is a 1 px lip — under
 *  the resolving floor on its own, which is exactly why the coping's read is carried by its TOKEN
 *  (`stoneLight` against `stone`, a clear value step at any size) and the lip only sharpens it.
 *  Pushed to a "properly visible" 1.5 the coping stops reading as a cap and starts reading as a
 *  table top on a stalk. */
const COPING_PROUD = 0.5;

/** The coping's own batter. Much shallower than the body's: a cap course is nearly square in
 *  section, and a strongly battered one reads as a second, smaller wall rather than as a lid. */
const COPING_BATTER = 0.12;

/** A kerb course, for `growPavedArea` — same delivered-size argument as `WALL_COPING_COURSE`. */
const KERB_COURSE = 1.4;

// ---------------------------------------------------------------------------
// The arc-length walker — shared by every polyline generator
// ---------------------------------------------------------------------------
//
// WHY ARC LENGTH RATHER THAN PER-POINT. A polyline's points are wherever the island's geometry put
// them: the measured rim is 52 edges of 13.4-13.7 units, but a hand-authored path is three points
// with a 60-unit leg and a 4-unit dog-leg. Placing one block per input point would give a wall of
// wildly different blocks and a fence whose posts cluster at every corner, which reads as a
// generator failing rather than as a wall. So every run is measured, divided into equal spans, and
// sampled — and the spacing a caller asks for is a TARGET that is rounded to fit the run exactly,
// so blocks tile with no short remainder at the end.
//
// CLOSED LOOPS ARE OPEN POLYLINES WITH THE FIRST POINT REPEATED, and that is the documented
// contract rather than a detected special case. Pass `[a, b, c, a]` and the run closes; the only
// place closure is detected at all is `walkNodes`, which drops the duplicated final POST so a
// fence does not stand two posts in the same hole.

interface Station {
  x: number;
  z: number;
  /** The unit direction of the segment this station fell in — the segment's own, never a smoothed
   *  average, because a wall block is aligned with the wall it is part of and a block splitting
   *  the difference at a corner leans out of both. */
  dx: number;
  dz: number;
  /** Arc length from the start of the run. */
  s: number;
}

interface Measured {
  pts: readonly GPoint[];
  /** Cumulative arc length at each point; `acc[0]` is 0. */
  acc: readonly number[];
  total: number;
  closed: boolean;
}

/** Drop CONSECUTIVE duplicate points. A zero-length segment has no direction, and a station that
 *  landed in one would carry `(0, 0)` and yaw a block to NaN — so they are removed before anything
 *  is measured rather than guarded against at every use. A closed loop survives untouched: its
 *  first and last points are equal but not adjacent. */
function dedupe(points: readonly GPoint[]): GPoint[] {
  const out: GPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 1e-6) continue;
    out.push({ x: p.x, z: p.z });
  }
  return out;
}

/** Measure a run, or report that there is nothing to build. `null` for fewer than two distinct
 *  points or a run of no length — the degenerate cases every generator turns into an EMPTY MAP
 *  rather than a throw, because a caller composing an island from live geometry will hand over a
 *  one-point ring sooner or later and an island that fails to render is worse than one missing a
 *  fence. */
function measure(points: readonly GPoint[]): Measured | null {
  const pts = dedupe(points);
  if (pts.length < 2) return null;
  const acc: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
    acc.push(total);
  }
  if (!(total > 1e-6)) return null;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const closed = pts.length > 2 && Math.hypot(first.x - last.x, first.z - last.z) < 1e-6;
  return { pts, acc, total, closed };
}

/** The point and direction at arc length `s`. */
function sampleAt(m: Measured, s: number): Station {
  const want = Math.min(Math.max(s, 0), m.total);
  let i = 1;
  while (i < m.acc.length - 1 && m.acc[i]! < want) i++;
  const s0 = m.acc[i - 1]!;
  const s1 = m.acc[i]!;
  const a = m.pts[i - 1]!;
  const b = m.pts[i]!;
  const len = s1 - s0;
  const t = len > 1e-9 ? (want - s0) / len : 0;
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const l = Math.hypot(ex, ez) || 1;
  return { x: a.x + ex * t, z: a.z + ez * t, dx: ex / l, dz: ez / l, s: want };
}

/**
 * Divide a run into equal SPANS and sample their centres — the form a wall, a paving course, a
 * hedge or a channel wants, because each unit occupies a stretch of the run rather than sitting at
 * a point on it.
 *
 * `phase` shifts the sample positions along the run by a fraction of a span. That is how paving
 * gets a running bond: lane 1 is walked with `phase = 0.5`, so its joints never line up with lane
 * 0's. Shifting the SAMPLE rather than the finished slab is what keeps the bond correct on a
 * curve, where sliding a slab along its own local direction would walk it off the polyline.
 */
function walkSpans(
  points: readonly GPoint[],
  target: number,
  phase = 0,
): { stations: Station[]; span: number } {
  const m = measure(points);
  if (!m) return { stations: [], span: 0 };
  const want = Math.max(1, Math.round(m.total / Math.max(target, 1e-3)));
  const n = Math.min(want, MAX_STATIONS);
  const span = m.total / n;
  const stations: Station[] = [];
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5 + phase) * span;
    // A phased walk runs off the end of the last span rather than wrapping: a bond that wrapped
    // would put lane 1's final slab on top of its first.
    if (s > m.total) continue;
    stations.push(sampleAt(m, s));
  }
  return { stations, span };
}

/** Sample the run's NODES — both ends included — the form posts want. On a closed loop the final
 *  node coincides with the first, so it is dropped; `closed` is reported so a caller can put the
 *  closing rail in. */
function walkNodes(
  points: readonly GPoint[],
  target: number,
): { nodes: Station[]; closed: boolean } {
  const m = measure(points);
  if (!m) return { nodes: [], closed: false };
  const want = Math.max(1, Math.round(m.total / Math.max(target, 1e-3)));
  const n = Math.min(want, MAX_STATIONS - 1);
  const span = m.total / n;
  const nodes: Station[] = [];
  const last = m.closed ? n - 1 : n;
  for (let i = 0; i <= last; i++) nodes.push(sampleAt(m, i * span));
  return { nodes, closed: m.closed };
}

/**
 * The yaw that turns a box's LOCAL +X onto a run's direction.
 *
 * `yawBasis` maps local +x to `(cos y, 0, -sin y)`, so matching `(dx, dz)` needs
 * `cos y = dx` and `sin y = -dz` — hence the argument order. Deriving it once here rather than at
 * seven call sites is the difference between a fence that follows its polyline and one that is
 * mirrored across it, which on a straight run looks identical and on a corner does not.
 */
function yawAlong(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/** The left-hand perpendicular of a run direction, in ground space — the ACROSS axis a path's
 *  lanes, a channel's kerbs and a hedge's width are measured on. */
function acrossOf(st: Station): { x: number; z: number } {
  return { x: -st.dz, z: st.dx };
}

/** The per-token accumulator idiom, shared with `tree-geometry.ts` and `flower-geometry.ts`: one
 *  raw soup per authored token, created on first use. */
function raw(parts: Map<string, Raw>, token: string): Raw {
  const hit = parts.get(token);
  if (hit) return hit;
  const fresh = emptyRaw();
  parts.set(token, fresh);
  return fresh;
}

/** Finish every non-empty part. THE `idx.length` GUARD IS LOAD-BEARING: a token that was reached
 *  but never drawn into would otherwise ship as a zero-vertex mesh, which `mergeParts` turns into
 *  a real material and a real draw call that paints nothing. */
function finish(parts: Map<string, Raw>): PropParts {
  const out: PropParts = new Map();
  for (const [token, r] of parts) if (r.idx.length) out.set(token, finishRaw(r));
  return out;
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

/**
 * A DRY-STONE WALL along a polyline: a run of battered blocks under a lighter cap course.
 *
 * THE HARD BOUNDARY IS THE THING THE REFERENCE IMAGES HAVE AND OUR ISLAND DOES NOT. All four of
 * the owner's references enclose their subject — a stone wall, a fence, a hedge, a kerb — and the
 * enclosure is most of why they read as a PLACE rather than as a field of objects. This is the
 * heaviest of the three boundary forms and the one that reads at the smallest size.
 *
 * WHY BLOCKS RATHER THAN ONE PRISM. A single extruded prism along the polyline would be cheaper
 * and would be a wall-shaped object. It would also have exactly two faces down its whole length,
 * so it reads as an extrusion — the "long grey ribbon" failure. Cutting the run into blocks of
 * `blockLength` gives the wall its coursing, and the per-block jitter below gives it the small
 * irregularity that separates laid stone from a bar. The joints between blocks are where the
 * batter earns its second keep: two neighbouring blocks touch at their BASES and gap slightly at
 * their TOPS, which draws the course lines for free.
 *
 * A CLOSED LOOP is an open polyline with the first point repeated at the end — pass `[a, b, c, a]`
 * and the wall closes with no special flag.
 *
 * @param points ground-space polyline in absolute island coordinates
 */
export function growWallRun(
  points: readonly GPoint[],
  opts: {
    height?: number;
    thickness?: number;
    blockLength?: number;
    coping?: boolean;
    batter?: number;
    seed?: number;
    heightAt?: HeightAt;
    bodyToken?: string;
    copingToken?: string;
  },
): PropParts {
  const height = Math.max(0.2, opts.height ?? 5);
  const thickness = Math.max(0.4, opts.thickness ?? 3);
  const blockLength = Math.max(0.5, opts.blockLength ?? 6);
  const coping = opts.coping ?? true;
  // 0.4 is THE recorded default and the rung table above is its whole justification: it is the
  // shallowest batter that puts a wall's lit face on rung 2 at a favourable orientation and keeps
  // it on rung 1 at the worst one. Below ~0.25 the wall falls back to rung 0 on every face and
  // reads as a silhouette; above ~0.6 it stops reading as a wall and starts reading as a bund.
  const batter = Math.max(0, opts.batter ?? 0.4);
  const heightAt = opts.heightAt ?? (() => 0);
  const bodyToken = opts.bodyToken ?? PROP_TOKENS.stone;
  const copingToken = opts.copingToken ?? PROP_TOKENS.stoneLight;
  const rand = mulberry32(opts.seed ?? 1);

  const parts = new Map<string, Raw>();
  const { stations, span } = walkSpans(points, blockLength);

  for (const st of stations) {
    // FIXED DRAW ORDER — length, then yaw, then height. Adding a fourth jitter goes AFTER these
    // three or every block in every wall on the island moves (plant-geometry.ts's rule).
    const lengthJitter = rand();
    const yawJitter = rand();
    const heightJitter = rand();

    // The length overrun is DELIBERATELY ONE-SIDED: a block is never shorter than its span, so
    // neighbours always overlap at the base and the wall can never open a gap you can see the
    // island through. Symmetric jitter would look better on paper and would put a hole in the
    // wall roughly half the time.
    const halfLen = (span / 2) * (1 + lengthJitter * 0.18);
    // +-0.035 rad is about +-2 degrees. Enough that the course line is not a drawn ruler; small
    // enough that the one-sided length overrun still covers the corner it opens.
    const yaw = yawAlong(st.dx, st.dz) + (yawJitter - 0.5) * 0.07;
    // A dead-level coping reads as an extrusion. +-5% of the wall's height is the undulation of a
    // wall that was LAID, and it is small enough that the height contract stays legible.
    const blockH = height * (0.95 + heightJitter * 0.1);
    const baseY = heightAt(st.x, st.z);

    addBox(raw(parts, bodyToken), [st.x, baseY, st.z], { x: halfLen, z: thickness / 2 }, blockH, {
      batter,
      yaw,
      // Nothing ever sees the underside of a wall, and 20 vertices a block is a real count over a
      // 702-unit rim.
      skipBottom: true,
    });

    if (coping) {
      addBox(
        raw(parts, copingToken),
        [st.x, baseY + blockH, st.z],
        { x: halfLen + COPING_PROUD, z: thickness / 2 + COPING_PROUD },
        WALL_COPING_COURSE,
        { batter: COPING_BATTER, yaw, skipBottom: true },
      );
    }
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------
// Fences
// ---------------------------------------------------------------------------

/**
 * A POST-AND-RAIL FENCE along a polyline: square posts at even arc-length spacing, with straight
 * rails chorded between them.
 *
 * THE LIGHTER RAILS ARE THE LOAD-BEARING ART CALL, and it is forced rather than chosen. A post and
 * a rail are both made of vertical faces plus a small top, and EVERY vertical face lands on rung 0
 * at every compass angle — so no amount of battering, spacing or proportion can make a rail read
 * against the post it crosses. The ladder physically cannot separate two vertical things. So the
 * separation is a second authored token: `wood` for the posts, `woodLight` for the rails. That is
 * also how the reference images do it (a rail catches the light along its length, a post does
 * not), so the two-token fence is the honest one as well as the only legible one.
 *
 * WHY RAILS ARE CHORDS between posts and not resampled along the polyline: a rail is a straight
 * piece of timber. Bending it to the run would be a smoother picture and a less believable one,
 * and on a closed loop the closing chord is exactly the edge the loop closes on.
 */
export function growFenceRun(
  points: readonly GPoint[],
  opts: {
    height?: number;
    postSpacing?: number;
    postHalf?: number;
    rails?: number;
    railThickness?: number;
    seed?: number;
    heightAt?: HeightAt;
    postToken?: string;
    railToken?: string;
  },
): PropParts {
  const height = Math.max(0.5, opts.height ?? 5);
  const postSpacing = Math.max(1, opts.postSpacing ?? 11);
  const postHalf = Math.max(0.3, opts.postHalf ?? 0.7);
  const rails = Math.max(0, Math.min(MAX_RAILS, Math.round(opts.rails ?? 2)));
  // ⚠ DEFAULT CHANGED FROM 0.8 TO 1.1, AND THE REASON IS THE DELIVERED SIZE RATHER THAN TASTE. At
  // 2 px per ground unit a 0.8-unit rail is 1.6 px and sits inside the shimmer band this arc
  // measured — it does not read as a thin rail, it reads as an intermittent dotted line that
  // flickers as the camera moves. 1.1 units is 2.2 px, which resolves. This is the smallest change
  // that makes the prop exist at all, and it is recorded here because a later reader looking at a
  // rail and thinking "that is chunky" needs to know it was measured, not guessed.
  const railThickness = Math.max(0.4, opts.railThickness ?? 1.1);
  const heightAt = opts.heightAt ?? (() => 0);
  const postToken = opts.postToken ?? PROP_TOKENS.wood;
  const railToken = opts.railToken ?? PROP_TOKENS.woodLight;
  const rand = mulberry32(opts.seed ?? 1);

  const parts = new Map<string, Raw>();
  const { nodes, closed } = walkNodes(points, postSpacing);
  if (!nodes.length) return finish(parts);

  // A post is small and nearly square, so its own batter is shallower than a wall's: at 0.55 a
  // 1.4-unit post would taper to a spike over 5 units of height. 0.3 still lifts one face off
  // rung 0, which is the whole job.
  const POST_BATTER = 0.3;
  // A rail is only `railThickness` tall, so its batter is a CHAMFER rather than a lean — it tilts
  // the side normals off vertical (which is what buys the rung) while barely narrowing the timber.
  const RAIL_BATTER = 0.25;

  const postY: number[] = [];
  for (const node of nodes) {
    const heightJitter = rand();
    const yawJitter = rand();
    const baseY = heightAt(node.x, node.z);
    postY.push(baseY);
    // A fence's posts are cut from a stack and driven by hand: +-4% of height and +-3 degrees of
    // yaw is what stops the run reading as a comb.
    const postH = height * (0.96 + heightJitter * 0.08);
    addBox(
      raw(parts, postToken),
      [node.x, baseY, node.z],
      { x: postHalf, z: postHalf },
      postH,
      { batter: POST_BATTER, yaw: (yawJitter - 0.5) * 0.1, skipBottom: true },
    );
  }

  if (rails > 0) {
    // Where the rails sit on the post, as a fraction of the fence's height.
    //
    // THE TOP OF THE RANGE IS COMPUTED, NOT PICKED. A post jitters down to 0.96 of `height`, and a
    // rail occupies `railThickness` ABOVE its own fraction — so the highest rail's top must clear
    // `0.96 * height - railThickness`, or the rail rides over the post cap and erases the post,
    // which is exactly the failure the two-token separation above exists to avoid. At the defaults
    // (height 5, rail 1.1) that ceiling is 0.74, and 0.70 is it with a margin. Measured on the
    // generated bounds rather than eyeballed: the first version used 0.84 and put the top rail's
    // crown at 5.30 against a 5.19 post.
    const railCeil = Math.max(0.2, (0.96 * height - railThickness) / height - 0.04);
    const fracOf = (i: number): number =>
      rails === 1
        ? Math.min(0.55, railCeil)
        : 0.34 + ((Math.min(0.7, railCeil) - 0.34) * i) / (rails - 1);

    const pairs: [Station, Station, number, number][] = [];
    for (let i = 0; i + 1 < nodes.length; i++) {
      pairs.push([nodes[i]!, nodes[i + 1]!, postY[i]!, postY[i + 1]!]);
    }
    if (closed && nodes.length > 2) {
      pairs.push([nodes[nodes.length - 1]!, nodes[0]!, postY[postY.length - 1]!, postY[0]!]);
    }

    for (const [a, b, ya, yb] of pairs) {
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len = Math.hypot(ex, ez);
      if (len < 1e-6) continue;
      const yaw = yawAlong(ex / len, ez / len);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      // The rail runs INTO both posts rather than butting against them: `postHalf` of overrun at
      // each end means a post that jittered its yaw can never expose daylight at the joint.
      const halfLen = len / 2 + postHalf;
      for (let i = 0; i < rails; i++) {
        const y = (ya + yb) / 2 + height * fracOf(i);
        addBox(
          raw(parts, railToken),
          [cx, y, cz],
          { x: halfLen, z: railThickness / 2 },
          railThickness,
          { batter: RAIL_BATTER, yaw, skipBottom: true },
        );
      }
    }
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------
// Hedges
// ---------------------------------------------------------------------------

/**
 * A CLIPPED HEDGE along a polyline: a battered box body with a run of lobes riding its crest.
 *
 * THE SHAPE IS A RESPONSE TO A MEASURED VERDICT (see the module header). A hedge grown as a run of
 * spheres is what `growPlant`'s `mound` style already is, and the owner's word for that on
 * 2026-08-19 was "circular swirls" — a banded sphere lays concentric rings inside its own outline,
 * and a row of them lays a row of targets. A clipped hedge in every reference image is a MASS: two
 * flat flanks, a flat-ish top, and a broken crest. So the mass is a box, which the batter lights on
 * two rungs like a wall, and only the CREST is lobed — enough to break the ruled line at the top
 * without turning the flanks into rings.
 *
 * ONE TOKEN, and deliberately so: `hedge` is a deeper, cooler green than any status family's
 * vegetation, and giving the crest a second lighter green would put a colour on the island that
 * means nothing and would say the highlight twice — the light already says it (the same argument
 * `TREE_TOKENS` records for the crown's `-hi` blobs).
 */
export function growHedgeRun(
  points: readonly GPoint[],
  opts: {
    height?: number;
    width?: number;
    lobeSpacing?: number;
    seed?: number;
    heightAt?: HeightAt;
    token?: string;
  },
): PropParts {
  const height = Math.max(0.5, opts.height ?? 4);
  const width = Math.max(0.5, opts.width ?? 5);
  const lobeSpacing = Math.max(0.8, opts.lobeSpacing ?? 4);
  const heightAt = opts.heightAt ?? (() => 0);
  const token = opts.token ?? PROP_TOKENS.hedge;
  const rand = mulberry32(opts.seed ?? 1);

  const parts = new Map<string, Raw>();
  const { stations, span } = walkSpans(points, lobeSpacing);
  const body = raw(parts, token);

  // The split between mass and crest. The lobe's vertical radius is 0.30 of the hedge, and its
  // centre sits half a radius below the box top, so the nominal crown lands at exactly `height` —
  // the contract a caller sizing a hedge against a 5-unit wall depends on.
  const CREST_R = 0.3;
  const bodyH = height * (1 - CREST_R / 2);

  // Detail 1 is 18 vertices and 32 triangles a lobe. Detail 2 quadruples that to buy curvature
  // nothing at this size can see: a crest lobe is ~4 units across, which is 8 delivered pixels.
  const CREST_DETAIL = 1;

  for (const st of stations) {
    const lengthJitter = rand();
    const yawJitter = rand();
    const crestJitter = rand();

    const halfLen = (span / 2) * (1 + lengthJitter * 0.14);
    const yaw = yawAlong(st.dx, st.dz) + (yawJitter - 0.5) * 0.05;
    const baseY = heightAt(st.x, st.z);

    // A hedge's flanks lean a little less than a wall's — clipped box hedging is nearly upright,
    // and 0.32 is still comfortably past the rung-0 plateau.
    addBox(body, [st.x, baseY, st.z], { x: halfLen, z: width / 2 }, bodyH, {
      batter: 0.32,
      yaw,
      skipBottom: true,
    });

    const ry = height * CREST_R * (0.9 + crestJitter * 0.2);
    addLobe(
      body,
      [st.x, baseY + bodyH - ry / 2, st.z],
      // Longer than the span so neighbouring crests fuse into one broken ridge rather than reading
      // as separate balls; slightly PROUD of the box across the run, so the lobe softens the
      // hedge's top arris instead of sitting on it like a hat.
      [halfLen * 1.25, ry, (width / 2) * 1.04],
      CREST_DETAIL,
      yawBasis(yaw),
    );
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * A LAID PATH along a polyline: individual slabs, each sitting at its own ground height.
 *
 * WHY SLABS AND NOT A RIBBON. A path is one of the three things every reference image has that our
 * island does not, and the thing that makes it read as a path rather than as a stripe is the
 * JOINTS. Each slab is also its own little platform, which is how a path drapes over relief with
 * no tessellator at all: slab N finds `heightAt` at its own centre and slab N+1 finds its own, and
 * the step between them is a joint rather than a tear.
 *
 * THE BATTER IS DOING A SECOND JOB HERE and it is the reason the default is high. At 2 px per unit
 * the authored `gap` of 0.7 units is 1.4 px, which is right at the resolving floor. A battered slab
 * inset its top by `batter * thickness` on every side, so the joint you actually SEE is
 * `gap + 2 * batter * thickness` — 1.6 units at the defaults, comfortably over 3 px. The chamfer is
 * what makes the joint legible; the gap alone would not be.
 *
 * `across` lanes are laid in a RUNNING BOND: odd lanes are walked with a half-span phase offset, so
 * the cross-joints never line up into a grid. A grid reads as a tiled floor in a spreadsheet; a
 * bond reads as paving.
 */
export function growPathRun(
  points: readonly GPoint[],
  opts: {
    width?: number;
    slabLength?: number;
    across?: number;
    thickness?: number;
    gap?: number;
    seed?: number;
    heightAt?: HeightAt;
    token?: string;
  },
): PropParts {
  const width = Math.max(0.5, opts.width ?? 8);
  const slabLength = Math.max(0.5, opts.slabLength ?? 5);
  const across = Math.max(1, Math.min(MAX_ACROSS, Math.round(opts.across ?? 2)));
  const thickness = Math.max(0.2, opts.thickness ?? 0.9);
  const gap = Math.max(0, opts.gap ?? 0.7);
  const heightAt = opts.heightAt ?? (() => 0);
  const token = opts.token ?? PROP_TOKENS.paving;
  const rand = mulberry32(opts.seed ?? 1);

  // High on purpose — see the joint arithmetic above. A slab is thin, so a 0.5 slope is a chamfer
  // of under half a unit and never reads as a pyramid.
  const SLAB_BATTER = 0.5;

  const parts = new Map<string, Raw>();
  const slabs = raw(parts, token);
  const laneWidth = width / across;

  for (let lane = 0; lane < across; lane++) {
    // The running bond. Every lane is walked independently so the phase follows the polyline
    // rather than sliding the slab off it on a curve.
    const phase = lane % 2 === 0 ? 0 : 0.5;
    const { stations, span } = walkSpans(points, slabLength, phase);
    const offset = (lane - (across - 1) / 2) * laneWidth;

    for (const st of stations) {
      const yawJitter = rand();
      const thickJitter = rand();

      const a = acrossOf(st);
      const cx = st.x + a.x * offset;
      const cz = st.z + a.z * offset;
      const baseY = heightAt(cx, cz);
      // A slab is a heavy flat thing that was dropped where it fell: 2 degrees of yaw and a tenth
      // of its thickness is the difference between paving and a decal.
      const yaw = yawAlong(st.dx, st.dz) + (yawJitter - 0.5) * 0.07;
      const t = thickness * (0.9 + thickJitter * 0.2);

      addBox(
        slabs,
        [cx, baseY, cz],
        { x: Math.max(0.1, (span - gap) / 2), z: Math.max(0.1, (laneWidth - gap) / 2) },
        t,
        { batter: SLAB_BATTER, yaw, skipBottom: true },
      );
    }
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------
// Paved areas
// ---------------------------------------------------------------------------

/**
 * A PAVED OR GRAVELLED AREA over a CONVEX ring — a plaza, a court, a yard.
 *
 * CONVEX ONLY, INHERITED FROM `addPrism` AND SAID OUT LOUD RATHER THAN VALIDATED. The caps are
 * triangle fans from the centroid, which is correct for a convex ring and silently wrong for a
 * concave one: the fan spills outside the shape and reads as a rendering glitch rather than as a
 * caller error. A concave yard is decomposed by the caller into convex pieces, exactly as the
 * land's own top faces are.
 *
 * IT IS A FLAT PLATFORM, NOT A DRAPE, and that is the one place this module's relief handling
 * differs from the runs above. A prism has one flat top by construction, so an area cannot follow
 * the ground the way a run of slabs can. Instead its TOP sits `thickness` above the HIGHEST ground
 * point under its ring, and its skirt runs down past the LOWEST by the ring's own relief spread —
 * so a court cut into a slope is a court cut into a slope, never a slab floating at one corner. On
 * flat ground (the default `heightAt`) that is simply +thickness over -thickness.
 *
 * THE KERB IS A RING OF BOXES, not a second prism, because a prism is solid: there is no way to
 * ask `addPrism` for a ring. One battered box per edge, extended by half a kerb width at each end
 * so convex corners mitre closed, is both cheaper and more controllable.
 *
 * THE PLATFORM ITSELF IS DELIBERATELY NOT BATTERED, which is the one place this module declines the
 * lever it leans on everywhere else. `addPrism` takes one profile for both its rings, so a battered
 * court would need a second inset ring — and it would buy nothing: the platform's side band is only
 * `thickness` tall, which at the 0.9 default is 1.8 px, under the size at which any rung reads at
 * all. An area's read is its TOP FACE (rung 2) against the ground around it, and its edge is what
 * the `kerb` option is for. Battering it would spend geometry on a band nobody can see and would
 * make the court's top smaller than the ring the caller authored, which is the surprising half.
 */
export function growPavedArea(
  profile: readonly GPoint[],
  opts: {
    thickness?: number;
    heightAt?: HeightAt;
    token?: string;
    kerb?: boolean;
    kerbToken?: string;
  },
): PropParts {
  const thickness = Math.max(0.2, opts.thickness ?? 0.9);
  const heightAt = opts.heightAt ?? (() => 0);
  const token = opts.token ?? PROP_TOKENS.gravel;
  const kerb = opts.kerb ?? false;
  // `stone` rather than `stoneLight`: a kerb is the DARKER edge that contains a light gravel court
  // (the reference's own reading), and `stoneLight` beside `gravel` is two near-identical values.
  const kerbToken = opts.kerbToken ?? PROP_TOKENS.stone;

  const parts = new Map<string, Raw>();
  const ring = dedupe(profile).slice(0, MAX_PROFILE);
  if (ring.length < 3) return finish(parts);

  let minH = Infinity;
  let maxH = -Infinity;
  for (const p of ring) {
    const h = heightAt(p.x, p.z);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
  }
  const topY = maxH + thickness;
  const baseY = minH - thickness - (maxH - minH);

  addPrism(raw(parts, token), ring, baseY, topY, { skipBottom: true });

  if (kerb) {
    let cx = 0;
    let cz = 0;
    for (const p of ring) {
      cx += p.x;
      cz += p.z;
    }
    cx /= ring.length;
    cz /= ring.length;

    const stone = raw(parts, kerbToken);
    const kerbWidth = Math.max(0.8, thickness * 1.8);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len = Math.hypot(ex, ez);
      if (len < 1e-6) continue;
      const dx = ex / len;
      const dz = ez / len;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      // Inward, tested against the CENTROID rather than taken from a handedness assumption — the
      // same correction `addPrism` carries, and for the same measured reason: ground (x, y) maps
      // to 3D (x, z) and flips handedness, so "the left-hand perpendicular" is not reliably the
      // inward one and a ring wound the other way would put every kerb outside its own court.
      let px = -dz;
      let pz = dx;
      if (px * (cx - mx) + pz * (cz - mz) < 0) {
        px = -px;
        pz = -pz;
      }
      addBox(
        stone,
        [mx + px * (kerbWidth / 2), topY, mz + pz * (kerbWidth / 2)],
        { x: len / 2 + kerbWidth / 2, z: kerbWidth / 2 },
        KERB_COURSE,
        { batter: 0.35, yaw: yawAlong(dx, dz), skipBottom: true },
      );
    }
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/**
 * A FLIGHT OF STEPS from `from` to `to`, climbing `rise` in total.
 *
 * STEPS ARE THE ONE PROP IN THIS MODULE THAT DOES NOT NEED A BATTER TO READ, and it is worth
 * saying why rather than leaving a reader to wonder at the small number. A flight already alternates
 * a horizontal tread (rung 2) with a near-vertical riser (rung 0) — the maximum contrast the ladder
 * offers, delivered by the form itself. The batter here is doing two smaller jobs: it lifts the
 * flight's two FLANKS off rung 0 so the staircase has sides, and it buys the base overlap described
 * below.
 *
 * THE CONSTRUCTION IS A RUN OF COLUMNS, NOT A STACK OF TREADS. Step i is one box from `baseY` up to
 * `baseY + (i+1) * rise/steps`. The exposed face between step i's top and step i+1's top IS the
 * riser, so a riser is never a separate piece that can drift out of line with its tread. And
 * because `addBox` insets its TOP by `batter * height` while leaving its base alone, each box is
 * authored `batter * height` oversized in plan — which makes the TOP exactly `width` by the tread
 * depth while the BASES overlap their neighbours underground. Without that correction a battered
 * flight opens a notch at every nosing.
 */
export function growSteps(
  from: GPoint,
  to: GPoint,
  opts: {
    steps?: number;
    width?: number;
    rise?: number;
    baseY?: number;
    token?: string;
  },
): PropParts {
  const steps = Math.max(1, Math.min(MAX_STEPS, Math.round(opts.steps ?? 4)));
  const width = Math.max(0.5, opts.width ?? 9);
  const rise = Math.max(0.1, opts.rise ?? 3);
  const baseY = opts.baseY ?? 0;
  const token = opts.token ?? PROP_TOKENS.stone;

  const parts = new Map<string, Raw>();
  const ex = to.x - from.x;
  const ez = to.z - from.z;
  const run = Math.hypot(ex, ez);
  // A flight with no run is not a short flight, it is a missing one — the same degenerate-input
  // rule the polyline generators follow.
  if (!(run > 1e-6)) return finish(parts);

  const dx = ex / run;
  const dz = ez / run;
  // Local +z runs ALONG the flight and local +x runs ACROSS it, which is the transpose of the
  // polyline convention above: a step is wide across its direction of travel, where a wall block is
  // long along it.
  const yaw = Math.atan2(dx, dz);
  const tread = run / steps;
  const riser = rise / steps;
  // Shallow: see the note above. Enough to lift the flanks, not enough to make the treads shrink
  // visibly toward the top of the flight.
  const STEP_BATTER = 0.18;

  const stone = raw(parts, token);
  for (let i = 0; i < steps; i++) {
    const h = riser * (i + 1);
    const inset = STEP_BATTER * h;
    const along = tread * (i + 0.5);
    addBox(
      stone,
      [from.x + dx * along, baseY, from.z + dz * along],
      // Oversized in plan by exactly the inset, so the TOP lands on the authored tread and the
      // BASES interlock — see the construction note.
      { x: width / 2 + inset, z: tread / 2 + inset },
      h,
      { batter: STEP_BATTER, yaw, skipBottom: true },
    );
  }

  return finish(parts);
}

// ---------------------------------------------------------------------------
// Water channels
// ---------------------------------------------------------------------------

/**
 * A STONE-LINED WATER CHANNEL along a polyline: two battered kerbs with a water surface between
 * them.
 *
 * WATER IS THE SINGLE HIGHEST-VALUE PROP MATERIAL ON THE ISLAND, because `water` is the only teal
 * in the whole authored palette — nothing else can be mistaken for it at any rung, at any size.
 * The owner's well garden and his Japanese pavilion both use a water channel as the picture's
 * organising line, which is what this is for.
 *
 * THE WATER SITS PARTWAY UP THE KERB, at `WATER_FILL` of the kerb's height, and that number is the
 * whole difference between a channel and a blue stripe. A surface flush with the ground reads as
 * paint; a surface recessed BELOW two stone lips reads as contained, because the kerb's inner faces
 * are visible above it. It cannot be recessed much further either — the kerbs are only
 * `kerbHeight` tall and at 2 px per unit the visible lip has to stay over a unit.
 *
 * THE WATER IS A STRIP BUILT FROM SPAN BOUNDARIES, not one quad per station. Quads built around
 * station CENTRES each carry their own direction, so on a curve their corners do not meet and the
 * surface opens hairline cracks you can see the island through. Boundary-to-boundary quads share
 * their corner points exactly and cannot crack. Their normals are computed from the quad's actual
 * corners rather than assumed upward, because on relief the strip is not level — and a normal that
 * was wrong by a few degrees would move a rung BOUNDARY, which reads as art rather than as a bug.
 */
export function growWaterChannel(
  points: readonly GPoint[],
  opts: {
    width?: number;
    kerbHeight?: number;
    kerbWidth?: number;
    heightAt?: HeightAt;
    waterToken?: string;
    kerbToken?: string;
  },
): PropParts {
  const width = Math.max(0.5, opts.width ?? 5);
  const kerbHeight = Math.max(0.4, opts.kerbHeight ?? 1.4);
  const kerbWidth = Math.max(0.4, opts.kerbWidth ?? 1.6);
  const heightAt = opts.heightAt ?? (() => 0);
  const waterToken = opts.waterToken ?? PROP_TOKENS.water;
  const kerbToken = opts.kerbToken ?? PROP_TOKENS.stoneLight;

  const WATER_FILL = 0.62;
  // A channel's kerb is short, so its batter is a chamfer like the fence rail's. The INNER face is
  // the one that matters — it is what the eye reads as depth against the water.
  const KERB_BATTER = 0.3;
  // The kerb run is measured against the channel's own width so a wide channel gets long kerb
  // stones and a narrow one gets short ones, which keeps the coursing in proportion.
  const kerbBlock = Math.max(2, width * 1.4);

  const parts = new Map<string, Raw>();
  const m = measure(points);
  if (!m) return finish(parts);

  // ---- the two kerbs -------------------------------------------------------------------------
  const stone = raw(parts, kerbToken);
  const { stations, span } = walkSpans(points, kerbBlock);
  for (const st of stations) {
    const a = acrossOf(st);
    const yaw = yawAlong(st.dx, st.dz);
    const arm = width / 2 + kerbWidth / 2;
    for (const side of [-1, 1]) {
      const cx = st.x + a.x * arm * side;
      const cz = st.z + a.z * arm * side;
      addBox(
        stone,
        [cx, heightAt(cx, cz), cz],
        // The 1.02 overrun is the same one-sided trick the wall uses: kerb stones overlap at the
        // base rather than risking a gap the water would leak through visually.
        { x: (span / 2) * 1.02, z: kerbWidth / 2 },
        kerbHeight,
        { batter: KERB_BATTER, yaw, skipBottom: true },
      );
    }
  }

  // ---- the water surface ---------------------------------------------------------------------
  const water = raw(parts, waterToken);
  const n = Math.max(1, stations.length);
  const rim = (s: number): { l: Vec3; r: Vec3 } => {
    const st = sampleAt(m, s);
    const a = acrossOf(st);
    const lx = st.x - a.x * (width / 2);
    const lz = st.z - a.z * (width / 2);
    const rx = st.x + a.x * (width / 2);
    const rz = st.z + a.z * (width / 2);
    return {
      l: [lx, heightAt(lx, lz) + kerbHeight * WATER_FILL, lz],
      r: [rx, heightAt(rx, rz) + kerbHeight * WATER_FILL, rz],
    };
  };

  let prev = rim(0);
  for (let i = 1; i <= n; i++) {
    const here = rim((i / n) * m.total);
    // Wound left-back, right-back, right-front, left-front. `mergeParts` makes prop materials
    // double-sided, so a reversed quad would still draw — but the NORMAL would point into the
    // channel bed and land on the wrong rung, which is a shading bug rather than a hole. Hence the
    // explicit flip below rather than a trusted winding.
    let nrm = norm(
      cross(
        [here.l[0] - prev.l[0], here.l[1] - prev.l[1], here.l[2] - prev.l[2]],
        [prev.r[0] - prev.l[0], prev.r[1] - prev.l[1], prev.r[2] - prev.l[2]],
      ),
    );
    if (nrm[1] < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    addQuad(water, prev.l, prev.r, here.r, here.l, nrm);
    prev = here;
  }

  return finish(parts);
}
