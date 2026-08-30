// OFFER RINGS (`traversal-panel-arc`, increment `traversal-panel-offer-fan-as-rings`; ADR-0482 D4).
//
// An offer fan says: at this read, N branches were printed and M of them could ever have been
// followed. It used to be drawn as RAYS out of the spine into a band above it. The owner, looking at
// the staged panel on 2026-08-30, asked for concentric rings around the mark instead — "sort of like
// how rings on a tree signal age". This module is the whole of that geometry, and it is separate from
// the renderer for the same reason `traversalKnowledgeAxis.ts` is: the numbers are provable and the
// SVG is not.
//
// ## RINGS COUNT BRANCHES. THEY DO NOT GAUGE. ⚠
//
// ADR-0354 clause 5 keeps marks PLAIN, with no per-node gauge, and ADR-0482 D4 moved only the FAN —
// it reopened nothing else. Rings around a mark are one small step from a dial reading a value, so
// the constraint is worth stating where the radii are computed: every ring here stands for exactly
// one recorded branch, and no radius, colour, weight or count encodes a magnitude, a ratio or a
// score. A ring set that read a token count, a depth, a duration or a percentage would breach a
// clause nobody reopened.
//
// The raw `M of N` is untouched and still travels with the fan (ADR-0312 D6) — it is stated, never
// drawn, and never a ratio.
//
// ## WHICH MARK A FAN BELONGS TO IS RECORDED, NOT INFERRED
//
// "Around the mark" needs the mark. Under ADR-0482 D1 marks no longer sit on one line — they draw at
// their corpus depth, up to 16 rows down — so a ring set anchored to the spine would sit around
// nothing on most traces.
//
// The trace answers this itself. A `candidate_set` is recorded under `candidate-set:<visitId>`, the
// id of the very visit that printed it: ADR-0464 D1's own account of the retired offer printer says
// the id was pre-minted from the visit and handed to both halves, so the identity is authored rather
// than incidental. Measured 2026-08-30 across all 759 local traces: **2,106 of 2,106 offer sets carry
// the prefix, and the visit it names is present in the same trace every time** — with `surfaceId`
// agreeing in all 2,106.
//
// A TIME JOIN WOULD HAVE BEEN WRONG, which is why {@link offerPrintedByVisitId} parses the recorded
// id instead of matching instants: only 1,363 of the 2,106 sets share their exact millisecond with
// any visit, so 743 fans — 35% — would have been anchored by a nearest-match guess or dropped.
//
// FAIL CLOSED: a set whose id carries no visit, or whose visit this trace does not hold, is COUNTED
// AND NOT DRAWN. It is never parked on the spine, because the spine is row 0 and row 0 now means "at
// the graph's surface" (ADR-0482 D3) — the same sign-flipped falsehood `knowledgeAxisRow` refuses.
// The measured rate of that branch is 0 of 2,106; it is a guard, not a fallback with a story.
//
// ## HOW N IS ENCODED, AND WHY IT IS NOT ONE-RING-PER-BRANCH ALL THE WAY UP
//
// One ring per branch ALWAYS — nothing is ever truncated, top-N'd or bucketed, because a fan quietly
// showing SOME of the followable branches is exactly the over-report ADR-0312 D6's denominator
// exists to prevent. What degrades is the SPACING, never the count.
//
// Measured over the same 2,106 sets, on the drawn (observable) population: median 3, p90 8, p99 17,
// max 28, and 39 sets draw zero. So the common case is countable and the tail is not. The rule:
//
//   - the ring set is bounded by {@link ringOuterCap}, a fraction of one row's height, so a fan can
//     never reach the mark on the row below it however large N is;
//   - inside that bound the gap is {@link RING_GAP_MAX} until N stops fitting, then it compresses.
//
// At the median the rings sit 2.4px apart and are countable, and a 3-branch fan is visibly smaller
// than an 8-branch one — which is the tree-ring reading the owner asked for. Past roughly ten the
// rings close up into a dense band: no longer countable one by one, still honestly "many", and the
// exact figure stays one hover away and on `data-drawn`.
//
// ⚠ HOW CRAMPED THAT GETS DEPENDS ON THE DEPTH AXIS, NOT ON THIS MODULE, and it is worth stating
// where the radii are set. `step` — one row's height — floors at 11px, and ADR-0482 D1 gave the
// vertical up to 16 depth rows plus an unmeasured row to carry. On a trace that uses them all in a
// 320px dock every row IS the floor, which leaves a fan 2.4px of radial room whatever N is: the
// marks are at their own 2.4px minimum there for exactly the same reason. Measured on
// `fervent-feistel-259503` — 70 fans, 267 rings, 17 rows — every fan renders as a small halo rather
// than as countable rings. Nothing here can fix that; more room per row is a question about the
// depth axis against the dock's height, and it is not this increment's to answer.
//
// INNERMOST IS FIRST OFFERED. The recorded order is authoritative on WHICH ids were offered and
// never on their order (ADR-0318 D3), so it is preserved exactly and never sorted — and growing
// outward from the first is the analogy's own direction.

/** The countable spacing, in px. Small fans get this; only a fan too big to fit gets less. */
export const RING_GAP_MAX = 2.4;
/** The absolute outer bound, in px, however tall a row is. */
export const RING_OUTER_MAX = 15;
/**
 * The share of one row's height a ring set may occupy.
 *
 * Below 0.5 by a margin: rows are one `step` apart, so 0.5 would put the outermost ring exactly on
 * the midpoint between this mark and the one below it, touching a neighbour's own outermost ring.
 */
export const RING_ROW_SHARE = 0.42;

const RING_STROKE_RATIO = 0.55;
/**
 * The thinnest a ring may be drawn, in px.
 *
 * ⚠ IT IS A FLOOR AND NOT A TARGET, AND THE FIRST DRAFT GOT THIS EXACTLY BACKWARDS. That draft
 * capped the stroke at a share of the gap, reasoning that an interstice must always survive or the
 * rings fuse into the filled disc clause 5 forbids. Rendered against a REAL trace it produced
 * strokes of **0.062px** — `fervent-feistel-259503`, 70 fans over 17 depth rows in a 320px dock, so
 * `step` sat on its 11px floor and a 27-branch fan had 2.4px of radial room. The guard was trading a
 * visible fan for an invisible one: nothing was drawn at all, in the one case a reader most needs to
 * see that a branch point happened.
 *
 * So the floor wins now, and the compressed extreme renders as a visible HALO of merged rings rather
 * than as nothing. That is not the forbidden gauge and the difference is structural, not a matter of
 * degree: once compressed, the halo's width is the row's radial room and is the SAME for 12 branches
 * as for 28, so it encodes no magnitude — it says "branches were printed here", and the count stays
 * on the hover and on `data-drawn`. `fill: none` is what keeps the mark's own interior clear, and
 * marks paint after the fan, so a ring can never obscure the node it belongs to.
 */
const RING_STROKE_MIN = 0.3;
const RING_STROKE_MAX = 1.1;

/**
 * How much heavier a FOLLOWED ring is drawn.
 *
 * ⚠ THIS IS THE ADR-0393 DEFECT'S OWN LESSON APPLIED. That defect was a legend saying "solid ray not
 * followed" over a stylesheet drawing that state DASHED, and it survived review because nothing is
 * ever followed in practice — 373 offered and 0 followed on the trace the owner looked at — so every
 * ray in every fan was the disagreeing state and the picture read as texture.
 *
 * So the rule here is: NOT-FOLLOWED is the plain ring, at full weight and never de-emphasised, and
 * FOLLOWED is the one that departs from it. The near-universal state must read on its own, not by
 * contrast with a state that never occurs.
 */
export const FOLLOWED_STROKE_SCALE = 1.8;

/** The prefix ADR-0464 D1's retired offer printer minted every candidate-set id under. */
const CANDIDATE_SET_PREFIX = 'candidate-set:';

/**
 * PURE: the visit that PRINTED this offer, from the recorded id alone.
 *
 * `null` when the id does not carry one — which is the fail-closed branch described in the header,
 * measured at 0 of 2,106 real sets. Parsing a recorded composite id is what {@link TraversalEdge}
 * already refuses to do for its own ends, and the difference is worth being explicit about: an edge
 * id is a DISPLAY handle this repo mints for itself, while this prefix is the trace's own recorded
 * identity, written by the producer and the only place the offer→visit link survives.
 */
export function offerPrintedByVisitId(candidateSetId: string): string | null {
  if (!candidateSetId.startsWith(CANDIDATE_SET_PREFIX)) return null;
  const visitId = candidateSetId.slice(CANDIDATE_SET_PREFIX.length);
  return visitId.length > 0 ? visitId : null;
}

/**
 * PURE: the outermost radius a ring set may reach on a row `step` px tall, around a mark of radius
 * `markRadius`.
 *
 * The floor keeps one ring drawable on the shortest row the layout allows: at `step` 11 the row
 * share alone yields less than the mark's own radius, and a cap inside the mark would draw rings
 * nobody can see rather than reporting that they do not fit.
 */
export function ringOuterCap(step: number, markRadius: number): number {
  return Math.max(markRadius + RING_GAP_MAX, Math.min(RING_OUTER_MAX, step * RING_ROW_SHARE));
}

/**
 * PURE: the vertical room a ring set needs ABOVE the surface row, so the outermost ring of a fan on
 * row 0 is not clipped by the top of the block.
 *
 * Replaces the old upward offer BAND entirely. The band was 14–52px of height reserved for rays that
 * fanned up out of the spine; rings sit on the mark, so what is left to reserve is one ring set's
 * radius. On a full-height panel that hands roughly 30px back to the depth rows, which is the axis
 * ADR-0482 D1 just gave something to say.
 */
export function ringHeadroom(step: number, markRadius: number): number {
  return ringOuterCap(step, markRadius) + 2;
}

export interface OfferRingGeometry {
  /** One radius per drawn branch, innermost first — recorded order, never sorted. */
  readonly radii: readonly number[];
  /** The spacing actually used. Equal to {@link RING_GAP_MAX} until the set stops fitting. */
  readonly gap: number;
  /** The outermost radius. Never exceeds {@link ringOuterCap}. */
  readonly outer: number;
  /** The base stroke, thinned with the gap so a dense set stays rings rather than a filled disc. */
  readonly strokeWidth: number;
}

/**
 * PURE: the ring set for one fan.
 *
 * `count` is the DRAWN branch count — the observable ones, after ADR-0393 D3's removal of candidates
 * no read could ever have followed. A count of zero draws nothing and is a real answer rather than an
 * edge case: 39 of the 2,106 measured sets offered nothing observable at all.
 */
export function offerRingGeometry({
  count,
  markRadius,
  step,
}: {
  count: number;
  markRadius: number;
  step: number;
}): OfferRingGeometry {
  if (count <= 0) {
    return { radii: [], gap: 0, outer: markRadius, strokeWidth: 0 };
  }
  const room = ringOuterCap(step, markRadius) - markRadius;
  const gap = Math.min(RING_GAP_MAX, room / count);
  // A MATERIALISED RANGE, NOT A COUNTED LOOP, and that is deliberate. `for (let i = 1; i <= count;
  // i += 1)` carries mutants flipping `+=` to `-=`, which do not fail — they run forever, and a hang
  // is scored UNPROVEN rather than caught (`check:mutation-diff` maps Stryker's Timeout there). A
  // map over a length has no counter to invert, and the result's own length is an arithmetic fact a
  // single assertion pins.
  const radii = Array.from({ length: count }, (_unused, index) => markRadius + gap * (index + 1));
  return {
    radii,
    gap,
    outer: markRadius + gap * count,
    strokeWidth: Math.min(RING_STROKE_MAX, Math.max(RING_STROKE_MIN, gap * RING_STROKE_RATIO)),
  };
}
