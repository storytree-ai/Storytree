// Offer rings (`traversal-panel-offer-fan-as-rings`, ADR-0482 D4).
//
// Every assertion here is written so the PLAUSIBLE WRONG implementation fails it, and there are two
// of them.
//
//   1. ANCHOR BY TIME. `candidate_set` and the visit that printed it usually share a millisecond, so
//      a nearest-instant match looks right on the trace you happen to open. Measured across all 759
//      local traces it is wrong for 743 of 2,106 sets — 35% — because "usually" is not "always".
//   2. TRUNCATE AT LARGE N. Capping the drawn rings at some legible maximum is the obvious answer to
//      a 28-branch fan, and it silently under-reports exactly the fans that branch the most. The
//      count never truncates; only the SPACING gives way.

import { describe, expect, it } from 'vitest';

import {
  FOLLOWED_STROKE_SCALE,
  offerPrintedByVisitId,
  offerRingGeometry,
  RING_GAP_MAX,
  RING_OUTER_MAX,
  RING_ROW_SHARE,
  ringHeadroom,
  ringOuterCap,
} from './traversalOfferRings';

describe('the mark a fan belongs to is read from the recorded id', () => {
  it('names the visit that printed the offer', () => {
    // The shape every one of the 2,106 measured sets carries.
    expect(offerPrintedByVisitId('candidate-set:ee1fa78c-f10e-44fd-a4d2-531d1064ff55')).toBe(
      'ee1fa78c-f10e-44fd-a4d2-531d1064ff55',
    );
  });

  it('answers null rather than guessing when the id carries no visit', () => {
    // FAIL CLOSED (the module header): the caller counts these and draws nothing, because the only
    // place left to park them is row 0, and row 0 now means "at the graph's surface" (ADR-0482 D3).
    expect(offerPrintedByVisitId('cs:1')).toBeNull();
    expect(offerPrintedByVisitId('')).toBeNull();
    // The prefix alone names no visit. Returning '' here would resolve to no mark anyway, but it
    // would do so by lookup miss rather than by saying the id is unusable — and a caller is entitled
    // to tell those apart.
    expect(offerPrintedByVisitId('candidate-set:')).toBeNull();
    // ⚠ LONGER THAN THE PREFIX, AND THAT IS THE WHOLE POINT OF THIS CASE. A short id like `cs:1`
    // answers null whether the prefix guard runs or not, because the slice past it is empty either
    // way — so a short id alone cannot tell a working guard from a deleted one. This one is long
    // enough that a deleted guard returns a visit id nobody recorded.
    expect(offerPrintedByVisitId('some-other-scheme:0123456789')).toBeNull();
  });
});

describe('rings count branches and never gauge', () => {
  it('draws exactly one ring per drawn branch, at every N the traces hold', () => {
    // Measured over 2,106 sets: median 3, p90 8, p99 17, max 28. The tail is the point — a cap at
    // some "legible maximum" passes at the median and under-reports the fans that branch most.
    for (const count of [1, 3, 8, 17, 28, 60]) {
      expect(offerRingGeometry({ count, markRadius: 3, step: 30 }).radii).toHaveLength(count);
    }
  });

  it('draws nothing for a fan with no observable branch', () => {
    // 39 of the 2,106 sets. A real answer, not an edge case: every branch printed was one no CLI
    // read could ever have followed.
    const rings = offerRingGeometry({ count: 0, markRadius: 3, step: 30 });
    expect(rings.radii).toEqual([]);
    expect(rings.outer).toBe(3);
    expect(rings.strokeWidth).toBe(0);
  });

  it('keeps a small fan countable at the full spacing, and visibly smaller than a bigger one', () => {
    // The tree-ring reading the owner asked for: three rings is a smaller object than eight.
    const three = offerRingGeometry({ count: 3, markRadius: 3, step: 30 });
    const eight = offerRingGeometry({ count: 8, markRadius: 3, step: 30 });
    expect(three.gap).toBe(RING_GAP_MAX);
    expect(three.outer).toBeLessThan(eight.outer);
    expect(three.radii).toEqual([5.4, 7.8, 10.2]);
  });

  it('compresses the spacing rather than the count once a fan stops fitting', () => {
    const wide = offerRingGeometry({ count: 28, markRadius: 3, step: 30 });
    expect(wide.radii).toHaveLength(28);
    expect(wide.gap).toBeLessThan(RING_GAP_MAX);
    // Strictly increasing: rings, never a repeated radius standing in for the ones that did not fit.
    for (let index = 1; index < wide.radii.length; index += 1) {
      expect(wide.radii[index] as number).toBeGreaterThan(wide.radii[index - 1] as number);
    }
  });

  it('thins the stroke with the gap, but never below what renders', () => {
    const sparse = offerRingGeometry({ count: 3, markRadius: 3, step: 30 });
    const dense = offerRingGeometry({ count: 28, markRadius: 3, step: 30 });
    expect(dense.strokeWidth).toBeLessThan(sparse.strokeWidth);

    // ⚠ THE FLOOR IS THE POINT, and it is a correction rather than a nicety. The first draft capped
    // the stroke at a share of the gap so an interstice always survived; rendered against a real
    // trace — `fervent-feistel-259503`, 17 depth rows in a 320px dock, so `step` on its 11px floor —
    // that produced 0.062px strokes, i.e. nothing visible at all. The worst crush in the data must
    // still draw SOMETHING: an invisible fan is a branch point the picture silently dropped.
    for (const [count, step] of [
      [27, 11],
      [11, 11],
      [28, 30],
    ] as const) {
      const crushed = offerRingGeometry({
        count,
        markRadius: Math.max(2.4, Math.min(4.2, step * 0.16)),
        step,
      });
      expect(crushed.strokeWidth).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('leaves the mark itself clear — a halo, never a filled disc', () => {
    // A filled ring set around a mark is the per-node GAUGE ADR-0354 clause 5 forbids. What keeps it
    // a halo is that no radius ever lands inside the mark, plus `fill: none` on the class (pinned in
    // `TraversalSpine.test.tsx` against the stylesheet).
    for (const [count, step] of [
      [1, 11],
      [27, 11],
      [28, 40],
    ] as const) {
      const markRadius = Math.max(2.4, Math.min(4.2, step * 0.16));
      const rings = offerRingGeometry({ count, markRadius, step });
      for (const radius of rings.radii) expect(radius).toBeGreaterThan(markRadius);
    }
  });

  it('encodes no magnitude once compressed — the halo is the same width at 12 branches as at 28', () => {
    // The forbidden gauge is a drawing whose SIZE reads as a value. Past the fitting threshold every
    // fan fills exactly the row's radial room, so the compressed halo says "branches were printed
    // here" and nothing more. The count is on the hover and on `data-drawn`, never in the picture.
    const twelve = offerRingGeometry({ count: 12, markRadius: 2.4, step: 11 });
    const twentyEight = offerRingGeometry({ count: 28, markRadius: 2.4, step: 11 });
    expect(twelve.outer).toBeCloseTo(twentyEight.outer, 6);
  });

  it('emphasises FOLLOWED rather than de-emphasising not-followed', () => {
    // The ADR-0393 defect in one number: the near-universal state must read on its own. A scale
    // below 1 would put the fan's weight on the state that never occurs.
    expect(FOLLOWED_STROKE_SCALE).toBeGreaterThan(1);
  });
});

describe('a fan stays inside its own row however wide it is', () => {
  it('never reaches the mark on the row below, at any N', () => {
    // Rows are one `step` apart, so half a step is the midpoint. Staying under it means two fans on
    // adjacent rows cannot touch even when both are at their widest.
    for (const step of [11, 18, 30, 40]) {
      for (const count of [1, 5, 12, 28, 200]) {
        const markRadius = Math.max(2.4, Math.min(4.2, step * 0.16));
        const rings = offerRingGeometry({ count, markRadius, step });
        expect(rings.outer).toBeLessThanOrEqual(ringOuterCap(step, markRadius));
        expect(rings.outer).toBeLessThan(step / 2);
      }
    }
  });

  it('caps at an absolute ceiling however tall the row is', () => {
    expect(ringOuterCap(400, 4.2)).toBe(RING_OUTER_MAX);
    expect(ringOuterCap(30, 4.2)).toBe(30 * RING_ROW_SHARE);
  });

  it('keeps one ring drawable at FULL spacing on the shortest row the layout allows', () => {
    // At step 11 the row share alone (4.62px) lands barely outside a 4.2px mark, so the floor is
    // what stops the picture drawing a ring nobody can see. Asserted as an EXACT value rather than
    // as "bigger than the mark": the row share alone already clears the mark, so a floor built the
    // wrong way round — `markRadius - RING_GAP_MAX` — still passes that weaker test.
    expect(ringOuterCap(11, 4.2)).toBeCloseTo(4.2 + RING_GAP_MAX, 10);
    expect(offerRingGeometry({ count: 1, markRadius: 4.2, step: 11 }).gap).toBeCloseTo(
      RING_GAP_MAX,
      10,
    );
  });

  it('sets the stroke from the gap at the exact ratio, between the two clamps', () => {
    // Pinned as a VALUE in the un-clamped band. Both clamps hide the ratio — 0.55 and its inverse
    // land on the same floor at a crushed gap and on the same ceiling at a wide one — so a test
    // taken only at the extremes proves nothing about which way the multiplication goes.
    const rings = offerRingGeometry({ count: 10, markRadius: 3, step: 30 });
    expect(rings.gap).toBeCloseTo(0.96, 6);
    expect(rings.strokeWidth).toBeCloseTo(0.96 * 0.55, 6);
  });

  it('reserves headroom that clears the widest fan on the surface row', () => {
    // A fan on row 0 draws UPWARD past the spine; the block's top edge is the only thing above it.
    for (const step of [11, 18, 30, 40]) {
      const markRadius = Math.max(2.4, Math.min(4.2, step * 0.16));
      expect(ringHeadroom(step, markRadius)).toBeGreaterThan(
        offerRingGeometry({ count: 28, markRadius, step }).outer,
      );
    }
  });
});
