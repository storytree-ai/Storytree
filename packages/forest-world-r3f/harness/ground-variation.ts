// ground-variation.ts — REGIONAL variation in the ground's authored token. Pure,
// browser-free, node:test-provable; fenced into `harness/` with the rest of the experiment.
//
// ⚠ THIS LEVER SITS NEXT TO A REJECTED DECISION, AND THAT IS WHY THE DISTINCTION IS THE
// FIRST THING IN THE FILE RATHER THAN A FOOTNOTE.
//
// On 2026-08-16 the owner removed the ground's three hash-picked colour variants, and the
// mesh seams with them: the land had been picking one of `STATUS_TOKENS[st].top[0..2]` PER
// CELL from a hash of the cell's id, which put a colour jump on roughly two thirds of the
// cell boundaries and read as noise. The reference board (lever 7) names the shape of the
// thing the references actually have and flags the collision in as many words: *"The
// reference's variation is REGIONAL (patches, drift) rather than PER-CELL (hash noise),
// which is a real distinction and probably the way through — but it is close enough to a
// rejected decision that it should be built carefully and SHOWN, not assumed."*
//
// So this module builds the regional form, and the difference is mechanical rather than a
// matter of description:
//
//   - the HASH form draws its variant from the cell's identity, so neighbouring cells are
//     independent and a boundary shows a jump with probability 2/3;
//   - the REGIONAL form draws its variant from a low-frequency field over GROUND SPACE, so
//     neighbouring cells almost always agree and a boundary shows a jump only where a
//     region edge happens to cross it.
//
// `variantSeamFraction` below measures exactly that on a real cell set, so the claim is a
// number on the page rather than an adjective — and if the number comes back near 2/3 the
// distinction did NOT carry and the lever should be reported as failing rather than shipped
// with a better name.
//
// WHAT IT COSTS IN PALETTE TERMS: NOTHING. `top[0..2]` are already authored tokens, already
// members of `landTokens()`, already closed over by `landPalette()`. This selects among
// entries the fence already holds; it does not widen it. It is also semantically inert —
// all three variants belong to the SAME status family, so `statusFamilyOf` answers the same
// status for every one of them and the land asserts exactly what it asserted before.

/**
 * The wavelengths, in ground units, of the two waves whose sum selects a region.
 *
 * BOTH ARE LONG COMPARED WITH A CELL, AND THAT IS THE WHOLE MECHANISM RATHER THAN A TASTE.
 * The island's measured mean cell pitch is about 16.5 ground units, so a field varying on
 * that scale IS per-cell noise however it is computed. At 96 and 61 units a patch spans
 * several cells in every direction, which is what makes neighbours agree.
 *
 * They are INCOMMENSURATE (96/61 is not a simple ratio) so the sum does not repeat over the
 * island's ~234-unit span — a repeating patchwork reads as a tiling artefact, which is a
 * different defect from the one being fixed.
 */
export const REGION_WAVELENGTHS: readonly [number, number] = [96, 61];

/** The directions the two waves run along, in radians. Chosen apart rather than orthogonal
 *  so the interference pattern is patchy rather than a plaid — a grid of rectangular patches
 *  would read as authored, which is the opposite of what regional drift is for. */
export const REGION_ANGLES: readonly [number, number] = [0.7, 2.3];

/**
 * The continuous region field at a ground point: a sum of two long waves, in [-1, 1].
 *
 * Exposed rather than kept private because {@link variantAt}'s banding is a decision about a
 * continuous quantity, and a test that can only see the banded output cannot tell a field
 * that is smooth from one that is not.
 */
export function regionField(x: number, z: number): number {
  const [w0, w1] = REGION_WAVELENGTHS;
  const [a0, a1] = REGION_ANGLES;
  const p0 = (x * Math.cos(a0) + z * Math.sin(a0)) * ((2 * Math.PI) / w0);
  const p1 = (x * Math.cos(a1) + z * Math.sin(a1)) * ((2 * Math.PI) / w1);
  return (Math.sin(p0) + Math.sin(p1)) / 2;
}

/**
 * Which of a status family's three authored `top` variants a ground point wears: 0, 1 or 2.
 *
 * THE BAND EDGES ARE NOT EVEN THIRDS, AND THE REASON IS WHICH TOKEN IS WHICH. `top[0]` is
 * the family's own base — the colour the island has been rendering everywhere, and the one
 * the confusability instrument is configured against (`oneToken: true`). `top[1]` is a step
 * darker and `top[2]` a step lighter. Splitting the field into equal thirds would leave the
 * base token on only a third of the ground and make the two OFF-base variants the majority,
 * which is a recolouring of the island wearing a variation's clothes. The edges below leave
 * the base token the clear PLURALITY — measured at 40.9% of the fixture island's 164 cells,
 * against 29.3% and 29.9% for the two variants — so this reads as drift ACROSS a colour
 * rather than as a different colour.
 */
export const REGION_BAND_EDGES: readonly [number, number] = [-0.28, 0.28];

/**
 * The edge below which a FOUR-band ground reaches for its darkest token.
 *
 * DELIBERATELY A MINORITY. The fourth band is the family's `side` token, which is 29% darker
 * than flat ground where the three `top` variants differ from it by 8% at most — so it is not
 * another step of the same drift, it is a different order of contrast. Spending it on a third
 * of the island would recolour the land; spending it on the deepest troughs of the field
 * makes it read as the shaded hollows of a landscape that has some.
 *
 * THE EDGE WAS MOVED ONCE, BY LOOKING, AND THAT IS AN APPEARANCE CALL (ADR-0392 D2). It began
 * at -0.62, which put the deep token on 12.8% of the fixture's cells — and at delivered size
 * that scattered into patches too small to read as anything, so the direction failed to show
 * what it exists to show. At -0.45 it covers 19.5%: still a clear minority behind the base
 * token's plurality, and now legible as hollows. `bandCoverage` measures it rather than this
 * comment asserting it, so a later change to the wavelengths cannot quietly make it the
 * majority.
 */
export const DEEP_BAND_EDGE = -0.45;

/**
 * {@link regionField}, banded onto the authored variants: 3 bands over the `top` family, or 4
 * with the family's `side` token in the deepest trough.
 *
 * ⚠ THE FOUR-BAND FORM IS GATED ON AN OPEN OWNER QUESTION AND MUST NOT BE SHIPPED ON THE
 * STRENGTH OF LOOKING GOOD. `side` on a TOP face is inside the closed palette and inside the
 * status family — but the land's colour is the status signal (ADR-0226), and under the live
 * renderer's own one-token-per-status reader `side x 0.9` reads as `mapped`. Under a reader
 * holding all three `top` variants it reads as `healthy`. The two defensible readers disagree,
 * which is precisely the subject of `oq-the-land-s-status-colours-differ-mainly-in-brightness-
 * and`, waiting on the owner. This function exists so the question can be answered against a
 * PICTURE of what the answer buys, not so an art pass can decide it (ADR-0392 D5).
 */
export function variantAt(x: number, z: number, bands: 3 | 4 = 3): 0 | 1 | 2 | 3 {
  const v = regionField(x, z);
  const [lo, hi] = REGION_BAND_EDGES;
  if (bands === 4 && v < DEEP_BAND_EDGE) return 3;
  if (v < lo) return 1;
  if (v > hi) return 2;
  return 0;
}

/**
 * What fraction of a cell set each band covers — reported so "a minority" and "about half" are
 * numbers rather than adjectives, and so a later change to the wavelengths or the edges cannot
 * quietly turn the deep band into the majority token.
 */
export function bandCoverage(
  cells: readonly { points: readonly { x: number; y: number }[] }[],
  bands: 3 | 4 = 3,
): number[] {
  const counts = [0, 0, 0, 0];
  for (const c of cells) {
    let x = 0;
    let y = 0;
    for (const p of c.points) {
      x += p.x;
      y += p.y;
    }
    counts[variantAt(x / c.points.length, y / c.points.length, bands)]! += 1;
  }
  const n = cells.length || 1;
  return counts.slice(0, bands).map((k) => k / n);
}

/**
 * The fraction of a cell set's SHARED boundaries across which the variant changes — the
 * measurement that decides whether "regional" is a real distinction from "per-cell hash" or
 * just a nicer word for it.
 *
 * A cell is reduced to its centroid, which is exactly how the renderer picks its variant
 * (one token per cell, so one sample per cell); two cells are neighbours if they share at
 * least two vertices, which is what a shared edge means on this decomposition. The hash form
 * scores about 2/3 on any cell set, because it draws three ways independently per cell;
 * anything much below that is variation the eye reads as regions.
 */
export function variantSeamFraction(
  cells: readonly { points: readonly { x: number; y: number }[] }[],
  bands: 3 | 4 = 3,
): { seams: number; boundaries: number; fraction: number } {
  const key = (p: { x: number; y: number }): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  const centroids = cells.map((c) => {
    let x = 0;
    let y = 0;
    for (const p of c.points) {
      x += p.x;
      y += p.y;
    }
    return { x: x / c.points.length, y: y / c.points.length };
  });
  const vertexKeys = cells.map((c) => new Set(c.points.map(key)));
  let seams = 0;
  let boundaries = 0;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      let shared = 0;
      for (const k of vertexKeys[i]!) if (vertexKeys[j]!.has(k)) shared++;
      if (shared < 2) continue;
      boundaries++;
      const a = variantAt(centroids[i]!.x, centroids[i]!.y, bands);
      const b = variantAt(centroids[j]!.x, centroids[j]!.y, bands);
      if (a !== b) seams++;
    }
  }
  return { seams, boundaries, fraction: boundaries === 0 ? 0 : seams / boundaries };
}
