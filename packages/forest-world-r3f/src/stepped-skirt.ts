// stepped-skirt.ts — THE ISLAND'S EDGE AS SIX ROCK LEDGES INSTEAD OF ONE FLAT WALL.
//
// THE COMPONENT. `adopt-the-land-into-the-shipped-map-arc`'s approved treatment is six components,
// and this is the last of them: "the asset kit's cliff on a six-row stepped skirt". Until now the
// shipped 3D ground's edge was ONE quad per ring edge, falling straight to `-CELL_GROUND_DEPTH`
// and wearing the parcel's own status colour darkened by its facing — a single extruded face which
// the approved render's own author calls, in terms, "a lot of frame doing nothing at 1948 px"
// (`docs/research/chapter2-land-idiom-2026-08-27/build_land.py`).
//
// ⚠⚠ WHY THIS COMPONENT NEEDED THE OWNER AND THE OTHER FIVE DID NOT. Every colour on this map's
// ground is a capability's proof state (ADR-0392 D5 / ADR-0398 D7), and the edge wall inherits the
// parcel's tint, so it reports too. A ROCK-coloured cliff is the first ground surface that reports
// nothing — a change to what the map promises, not an art choice, and ADR-0414 D1 ("the shipped map
// carries no decoration") is what made it the owner's. He settled it on 2026-09-01
// (`oq-the-island-s-cliff-needs-a-rock-colour-may-a-ground-surfa`), and the answer granted MORE than
// the question asked:
//
//     "regarding rock color, yeah stamp it the test should be overall themse color, so we should
//      have flexibility for session to add additional colors as needed, the session should just
//      look at the final and ask itself can I tell what state this island is in."
//
// So the fence moved from COMPOSITION (every ground colour must report) to OUTCOME (the island's
// state must still be readable), and the judgement is the SESSION'S to apply on the final render
// rather than the owner's to re-issue per surface. That is why this module adds a token without a
// second question, and why the evidence page beside it
// (`docs/research/chapter2-shipped-skirt-2026-09-01/`) is a picture of the four arms rather than a
// request for a verdict.
//
// ⚠ WHAT DOES NOT MOVE. The delivered pixel is still an authored `(token x level)` closure entry —
// the rock is one more ROW on the same ramp, quantised onto the same ladder, with no free shading,
// no gradient, no texture and no exception in the checker (ADR-0380 D6 fence 3). And no STATUS
// token moves: {@link SKIRT_ROCK} is a new family-less entry beside them, exactly as the harness's
// prop materials are (ADR-0406 D4), and `stepped-skirt.test.ts` holds it to the same obligation —
// no rock ledge may ever deliver a colour a status family delivers.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// THE PROFILE IS TRANSCRIBED, NOT INVENTED. Every constant below is read off the approved render's
// own build script (`build_land.py`, the `with_strata` fork), because the picture the owner stamped
// is the specification and a plausible-looking re-authoring would be a different cliff wearing this
// one's name. Two things are DELIBERATELY different, and both are the shipped map's own convention
// winning over the experiment's:
//
//  1. THE OUTWARD DIRECTION IS THE EDGE'S OWN NORMAL, NEVER A CENTROID RAY. `build_land.py` insets
//     each row along the ray from the ISLAND's centroid, which it can do because it builds one
//     island as one ring. The shipped ground is per-PARCEL, and `cell-ground-geometry.ts` already
//     carries the argument for why a centroid is wrong here: on an L-shaped parcel the centroid
//     sits in the notch, OUTSIDE the shape, so "away from the centre" points INTO the parcel along
//     the notch edges. The edge normal is a local fact and is right for every parcel shape.
//
//  2. THE LEDGES HANG FROM THE RELIEF, NOT FROM A FLAT SLAB BOTTOM. `build_land.py` interpolates
//     each row's height from the ring's top down to a constant `-SLAB_DEPTH`. The shipped prism is
//     CONSTANT-THICKNESS on purpose — the relief field reaches ±4.22 units against a 3-deep prism,
//     so a bottom pinned at `-depth` would sit ABOVE the top face wherever the land dips and every
//     wall there would be inside out. So `drop` here is a FRACTION of the parcel's own depth and
//     the ladder rides the land, which is the same interpolation with the shipped invariant kept.
//
// ⚠ AND THE SEED IS LESS MYSTERIOUS THAN IT LOOKS, which is worth writing down so nobody preserves
// it as magic. `(row * 7919) % 13` looks like a hash; for the six rows this profile has it is
// exactly `(2 * row) % 13` — 2, 4, 6, 8, 10, 12 — because 7919 ≡ 2 (mod 13). So the "seeded"
// jitter is a linear ramp over six rows, and the alternation that actually makes the bedding planes
// read comes from {@link SKIRT_INSET_IN} / {@link SKIRT_INSET_OUT}, not from the seed. It is
// transcribed rather than simplified because the render was taken with this arithmetic and a
// simplification would silently move the cliff at any other row count.

import { edgeKey, type CoastPoint } from './coast-clip.js';
import type { P2 } from './cell-ground-geometry.js';
import type { InstanceDescriptor } from './world-to-3d.js';

/** How many ledges an island's edge is cut into — the approved treatment's own number
 *  (`build_land.py`: `rows = 6 if with_strata else 1`). */
export const SKIRT_ROWS = 6;

/** The prime the row jitter is drawn from. See the module header: for six rows it reduces to
 *  `(2 * row) % 13`, and it is kept in this form because that is the arithmetic the approved
 *  render was taken with. */
export const SKIRT_INSET_SEED = 7919;

/** The jitter's period. */
export const SKIRT_INSET_PERIOD = 13;

/** The inset an ODD ledge takes, in ground units, POSITIVE MEANING INWARD (`build_land.py`
 *  subtracts `inset * outward`). Odd rows cut back into the island and are what makes the cliff
 *  read as bedding planes rather than as one face. */
export const SKIRT_INSET_IN = 0.55;

/** The inset an EVEN ledge takes — NEGATIVE, so it stands PROUD of the ring above it. The base
 *  course ends up ~0.16 units outboard of the parcel's own outline, which is what gives the
 *  island a plinth rather than a taper. */
export const SKIRT_INSET_OUT = -0.12;

/** The jitter's floor and range: each row's inset is its side's magnitude times
 *  `SKIRT_JITTER_BASE + SKIRT_JITTER_SPAN * ((row * SEED) % PERIOD) / PERIOD`. */
export const SKIRT_JITTER_BASE = 0.6;
export const SKIRT_JITTER_SPAN = 0.8;

/**
 * THE ROCK, AND IT IS A MEASUREMENT RATHER THAN A CHOICE — which is the half of the owner's
 * settlement that said "have one proposed against your approved picture".
 *
 * ⚠ HOW IT WAS TAKEN, because the method is what makes it a transcription rather than an eyedropper
 * guess. `land-combined-1948px.png` and `land-strata-1948px.png` are the SAME render differing in
 * NOTHING but the skirt material (`build_land.py`'s `with_strata` fork, and the README's §6 says so
 * in terms). So the set of pixels where the two images differ IS the skirt, exactly — no hand-drawn
 * mask and no "the dark ring is probably the cliff". Over that mask, on 76,297 skirt pixels
 * (6.67% of the island's own pixels), the approved render's MEDIAN skirt colour is
 * `rgb(77, 77, 79)`. That is this token, unrounded.
 *
 * ⚠ IT IS NEUTRAL AND THAT IS THE POINT, not a failure to find a hue. Every status family sits on
 * the green / ochre / brown axis, and the harness's prop palette already establishes the rule this
 * follows: an ornament's colour is chosen WELL OFF the axis the statuses occupy, so it can never be
 * read as one of them (ADR-0406 D4, `harness/palette-band.ts`). A neutral dark grey is as far off
 * that axis as this map has room for.
 *
 * ⚠ WHAT THE SINGLE TOKEN CANNOT DO, stated here rather than discovered later. The approved skirt
 * spans luma 20.7 (p2) to 117.6 (p90) — a 5.7x range, because a path tracer lights it. This map's
 * ladder spans 0.80 to 1.00, a 1.25x range, so ONE token cannot reproduce that spread and the
 * shipped cliff is flatter than the render's. That is the arc's standing finding arriving again —
 * a component can cross correctly and still not deliver the look — and it is measured on the
 * comparison page rather than inferred.
 */
export const SKIRT_ROCK = '#4d4d4f';

/** One ledge of the cliff: how far it is cut back from the parcel's own outline, and how far down
 *  the prism its lower edge hangs. */
export interface SkirtLedge {
  /** 1-based, top ledge first — the row index the jitter is keyed on. */
  row: number;
  /** Ground units, POSITIVE INWARD. The point is `p - inset * outward`. */
  inset: number;
  /** Fraction of the parcel's depth this ledge's LOWER edge hangs at. The last ledge is exactly
   *  1, so a stepped wall ends where the single-quad wall ended and the prism keeps its
   *  thickness. */
  drop: number;
}

/**
 * THE INSET FOR ONE LEDGE, transcribed from `build_land.py`.
 *
 * ⚠ ROWS ARE 1-BASED because the source is: row 0 IS the parcel's own ring, at inset 0, and is not
 * a ledge. Asking for row 0 here would be asking for the ring, so it returns 0 rather than
 * throwing — the honest answer, and the one that keeps {@link skirtLedges} a plain loop.
 */
export function skirtInset(row: number): number {
  if (row <= 0) return 0;
  const side = row % 2 === 1 ? SKIRT_INSET_IN : SKIRT_INSET_OUT;
  const jitter =
    SKIRT_JITTER_BASE +
    (SKIRT_JITTER_SPAN * ((row * SKIRT_INSET_SEED) % SKIRT_INSET_PERIOD)) / SKIRT_INSET_PERIOD;
  return side * jitter;
}

/**
 * THE WHOLE PROFILE — every ledge, top first.
 *
 * ⚠ `rows === 1` IS THE SHIPPED WALL EXACTLY, and that is what makes the before/after a controlled
 * comparison rather than a claim: one ledge at inset 0 and drop 1 is the single quad this map has
 * always drawn, emitted by the same code path. The flat arm is not a second implementation.
 */
export function skirtLedges(rows: number = SKIRT_ROWS): readonly SkirtLedge[] {
  if (rows < 1) return [];
  const out: SkirtLedge[] = [];
  for (let row = 1; row <= rows; row += 1) {
    // ⚠ THE SINGLE-ROW CASE TAKES NO INSET AT ALL. A lone ledge cut back from its own ring would
    // be a shipped map that moved when nothing was added to it, which would make every "byte
    // identical without the skirt" claim on the comparison page false.
    out.push({ row, inset: rows === 1 ? 0 : skirtInset(row), drop: row / rows });
  }
  return out;
}

/**
 * THE EDGE'S OUTWARD UNIT NORMAL, in the module's one orientation convention.
 *
 * ⚠ `(-dz, dx)` IS OUTWARD ONLY FOR A NEGATIVELY-WOUND RING, which is the orientation
 * `normalisedRing` puts every parcel into and `cell-ground-geometry.ts` states its whole wall
 * convention against. Handed a positively-wound ring this points INTO the parcel and every ledge
 * would step the wrong way — so callers pass normalised rings, exactly as the wall loop does.
 *
 * A degenerate edge (both endpoints equal) has no direction, and the honest answer is the zero
 * vector: a zero-length edge bounds no wall, so the ledge it would inset is a quad of no area.
 */
export function outwardNormal(a: P2, b: P2): P2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len === 0) return { x: 0, z: 0 };
  return { x: -dz / len, z: dx / len };
}

/** A ring point moved onto a ledge: `p - inset * outward`, so a POSITIVE inset cuts inward. */
export function insetPoint(p: P2, outward: P2, inset: number): P2 {
  return { x: p.x - inset * outward.x, z: p.z - inset * outward.z };
}

/**
 * THE ISLAND'S RIM EDGES, as the keys {@link isRimEdge} tests against.
 *
 * A parcel set tiles its island with no gaps and no overlaps, so an edge used TWICE is an interior
 * seam and an edge used ONCE is the shore — the same census `coast-clip.ts`'s {@link rimLoops}
 * takes, and it reads the same {@link edgeKey} so the two can never disagree about which edges are
 * the shore. Measured on the shipped fixture: 354 edges, 302 interior, 52 boundary.
 *
 * ⚠⚠ THE SKIRT IS RIM-ONLY, AND THAT IS A CORRECTNESS REQUIREMENT RATHER THAN AN OPTIMISATION.
 * Every parcel emits a wall on EVERY edge, and all but the rim are buried inside the island. Cutting
 * a buried seam into six inset ledges would pull two neighbouring parcels apart along the seam they
 * share — a crack running through the island's interior, visible the moment the camera is not
 * directly overhead — while buying nothing, because nothing can see it. It is also what makes the
 * cost the ~624 triangles the arc sized this component at rather than six times the whole ground.
 */
export function rimEdgeKeys(cells: readonly InstanceDescriptor[]): ReadonlySet<string> {
  const uses = new Map<string, number>();
  for (const cell of cells) {
    const pts = cell.points;
    if (pts === undefined || pts.length < 3) continue;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const k = edgeKey(a, b);
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  const rim = new Set<string>();
  for (const [k, n] of uses) if (n === 1) rim.add(k);
  return rim;
}

/** Is this undirected edge on the island's rim? A thin wrapper so callers never re-spell
 *  {@link edgeKey}, which is the one place the rounding convention lives. */
export function isRimEdge(rim: ReadonlySet<string>, a: CoastPoint, b: CoastPoint): boolean {
  return rim.has(edgeKey(a, b));
}

/** How many of ONE ring's edges are on the rim — what the buffer must be sized for before a
 *  single triangle is written. Kept here beside {@link skirtExtraTriangles} rather than inlined in
 *  the builder, so the count that SIZES the buffer and the predicate that FILLS it are the same
 *  question asked once: a builder that sized off one rule and wrote off another would overrun or
 *  leave a tail of zeroed vertices, which draws as a black triangle at the origin. */
export function rimEdgeCount(ring: readonly P2[], isRim: (a: P2, b: P2) => boolean): number {
  if (ring.length < 3) return 0;
  let n = 0;
  for (let i = 0; i < ring.length; i += 1) {
    if (isRim(ring[i]!, ring[(i + 1) % ring.length]!)) n += 1;
  }
  return n;
}

/**
 * THE EXTRA TRIANGLES A SKIRT COSTS, over the single-quad wall the map already draws.
 *
 * ⚠ IT IS THE RIM'S COST ALONE and it is stated as a DELTA rather than a total, so it composes
 * with `cellGroundTriangles` instead of replacing it — which is what keeps this component's
 * arithmetic out of the shared count every other component's buffer is sized by.
 */
export function skirtExtraTriangles(rimEdges: number, rows: number): number {
  if (rimEdges <= 0 || rows <= 1) return 0;
  return rimEdges * (rows - 1) * 2;
}

/**
 * WHAT A GROUND BUILDER NEEDS TO CUT THE SKIRT — the whole component as one optional input, so a
 * caller that supplies none gets the buffer it always got.
 */
export interface GroundSkirt {
  /** Ledges per rim edge. {@link SKIRT_ROWS} is the approved treatment's six; 1 is the map as it
   *  drew before this component and is emitted by the same code path. */
  rows: number;
  /** The ramp ROW every rock ledge wears — an index into the material's authored token table,
   *  exactly as a parcel's own status row is. */
  row: number;
  /** The LINEAR colour every rock ledge wears. Carried beside {@link GroundSkirt.row} for the same
   *  reason `cellGroundGeometry` takes both a `resolve` and an `index`: the banded material selects
   *  by row, and the comparison instrument's pre-adoption arms read the colour buffer. */
  colour: { r: number; g: number; b: number };
  /** How many ledges from the TOP keep the parcel's own status tint instead of the rock.
   *
   *  ⚠ THIS IS THE OWNER'S OPTION B, KEPT AS A NUMBER RATHER THAN A BOOLEAN. His settled answer
   *  did not pick between "all six ledges are rock" and "the top ledge keeps the health tint"; it
   *  handed the session the outcome test instead. So both are arms on the comparison page and the
   *  shipped value is chosen against the picture — see `SHIPPED_SKIRT` in `ForestWorldCanvas.tsx`. */
  soilLedges: number;
  /** Is this edge on the island's rim? Injected rather than computed here so the builder does the
   *  census ONCE per call instead of once per parcel. */
  isRim: (a: P2, b: P2) => boolean;
}

/** THE UNCUT WALL — one ledge, no inset, the full drop. Every buried seam takes this, and so does
 *  every edge when no skirt was asked for at all, so it is the profile the shipped map has always
 *  drawn. Frozen at module scope because the wall loop reaches for it once per edge. */
export const FLAT_WALL: readonly SkirtLedge[] = skirtLedges(1);

/** The direction an UNCUT edge is inset along. It has none, and zero is the honest spelling: an
 *  inset of 0 along it is `p - 0 * 0`, so the emitted vertex is the ring's own coordinate to the
 *  bit rather than to within a rounding — which is what lets the no-skirt buffer be byte-identical
 *  to the one every pre-skirt figure was measured on. */
export const ZERO_NORMAL: P2 = { x: 0, z: 0 };

/** A skirt that changes nothing: one ledge, no inset, the parcel's own tint. Named rather than
 *  spelled inline wherever a control arm is built, so "the flat wall" has one definition. */
export function flatSkirt(skirt: Omit<GroundSkirt, 'rows' | 'soilLedges'>): GroundSkirt {
  return { ...skirt, rows: 1, soilLedges: 1 };
}
