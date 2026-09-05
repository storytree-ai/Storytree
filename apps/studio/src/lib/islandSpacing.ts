// islandSpacing.ts — THE FOREST'S SPACING IS A FRACTION OF ISLAND SIZE, NOT THREE NUMBERS BY EYE.
//
// ADR-0521 (owner-directed, 2026-09-05): *"just go straight to C, this really needs to be
// procedurally determined."* The 2D row packer (`buildWorld`, TreeView.tsx) used to hold three
// absolute constants — `RANK_GAP` 40, `ISLAND_GAP` 60, `RANK_SWING` 140 units, chosen by eye and
// halved on the owner's 2026-08-16 call. ADR-0520 then sized every island from a land-per-capability
// ratio, so half the layout became derived while the gaps stayed hand-picked, and the fitted forest
// read as dots in a field (land 4.9% → 0.8% of the frame). This module is option C: the gaps are
// derived from the same input the island's size already is — its capability count, through
// `estRadius(quota)` — and the 3D map inherits the change because it lays out nothing of its own.
//
// ONE RATIO, THREE READINGS. A gap between two islands is `ISLAND_SPACING_RATIO` times the mean of
// their two estimated radii, on both axes — the row gap between the tallest island of one rank and
// the tallest of the next, the in-row gap between neighbours. A lone island on its rank swings
// sideways by its own radius plus that gap: exactly the offset a same-row neighbour would have
// given it, so its trails still sweep as diagonals rather than stacking into one corridor. Nothing
// here is a second hand-picked number; the swing is what the gap rule says a neighbour would be.
//
// ⚠ THE RATIO ITSELF IS THE OWNER'S PICK FROM A RENDERED LADDER (ADR-0521's one open input, chosen
// under ADR-0503's bold-and-scale-back protocol). `ISLAND_SPACING_RUNGS` is the ladder rendered on
// `packages/forest-world-r3f/harness/shipped-spacing.html`; the pick's provenance is on the constant.
// Changing it is a rendered ladder, never a hand edit.
//
// ⚠ THE HEX LATTICE IS THE FLOOR, NOT THE RATIO. Seeds closer than their combined ring reach are
// nudged apart by `buildWorld`'s growth-floor pass whatever the gap says, so two 2D islands never
// interpenetrate and rung 0 is "as close as the tiles allow", not "touching". The 3D island is
// smaller than its tile footprint (ADR-0520 sizes it in place), so the water between two 3D islands
// can never fall below the floor's residue — a bound the ladder shows rather than argues.

/** The three absolute gaps the packer held before ADR-0521, in ground units — TYPED AS HISTORY.
 *  A comparison page's control arm stands on them (`buildWorld`'s `spacing.legacy`), because the
 *  picture the owner saw before this landing cannot be composed from the shipped constants any
 *  more. Nothing on the shipped path reads them. */
export interface LegacySpacing {
  rankGap: number;
  islandGap: number;
  rankSwing: number;
}

export const PRE_ADR0521_SPACING: Readonly<LegacySpacing> = Object.freeze({
  rankGap: 40,
  islandGap: 60,
  rankSwing: 140,
});

/**
 * The gap between two islands as a fraction of the mean of their estimated radii — THE PICK.
 *
 * Provenance: laddered 2026-09-06 on the REAL forest — the studio's own layout of the live corpus
 * (35 islands), exported per rung and rendered through the shipped 3D mapper on the RTX 2060 —
 * at rungs {@link ISLAND_SPACING_RUNGS}; evidence `docs/research/chapter2-forest-spacing-2026-09-06/`.
 * The retired constants read as ≈0.41 (rank) / ≈0.61 (in-row) of the median island radius over
 * that corpus, so 0.5 is roughly "today" and the ladder descends from it. 0 is the boldest rung
 * (ADR-0503: ship bold, the owner scales back off the sheet): the derived gap is nothing, and the
 * spacing is entirely the hex lattice's own growth floor — islands sit as close as their tile
 * footprints allow. Measured: land 0.67% → 0.89% of the fitted frame, the layout's area 68% of
 * today's, every trail routed, the 2D map's nameplates and trails still clear. ⚠ What the ladder
 * ALSO shows is the bound: the three constants held about a third of the layout's area and this
 * removes it; the other two thirds is the 2D tile footprint (`HEX_R`, the `+ 2` quota), which no
 * ratio on the gaps can reach — that is option B's lever (ADR-0521), escalated, not decided here.
 */
export const ISLAND_SPACING_RATIO = 0;

/** The ladder the owner picks from, boldest (tightest) last. Rung 0 is the hex floor's own spacing. */
export const ISLAND_SPACING_RUNGS: readonly number[] = Object.freeze([0.5, 0.35, 0.2, 0.1, 0]);

/** The clearance between two islands of estimated radii `rA` and `rB`, at `ratio`. */
export function gapBetween(rA: number, rB: number, ratio: number): number {
  return ratio * ((rA + rB) / 2);
}

/** How far a lone island on its rank swings sideways: its own radius plus the gap a same-row
 *  neighbour of the same size would get — the offset it would have had beside such a neighbour. */
export function loneSwing(r: number, ratio: number): number {
  return r + gapBetween(r, r, ratio);
}

/** The arm ids the comparison page and the export script share: the control, then one per rung. */
export const SPACING_CONTROL_ARM = 'today';

export function spacingArmId(ratio: number): string {
  return `spacing-${ratio}`;
}
