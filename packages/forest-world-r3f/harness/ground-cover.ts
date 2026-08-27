// ground-cover.ts — SCENERY GROUND COVERS, and the instrument that says whether one of them
// can be mistaken for a proof state.
//
// THE DIRECTION, verbatim, 2026-08-27, on being shown the grain crossing (PR #1665/#1667):
//
//   "land increments to model the comparisons to me, i'm sure its not that hard to do wheat
//    field or yellow grass to the same quality as we have done here, might have to get some
//    more art packs but thats small money."
//
// A GROUND COVER IS A TOKEN THE GROUND WEARS INSTEAD OF ITS STATUS FAMILY'S. That is the whole
// mechanism — no new geometry, no new shader, no new attribute channel. `wheat` already exists
// and already works this way; `yellowGrass` is authored here on the same footing.
//
// ⚠⚠ AND THAT IS EXACTLY WHY THIS FILE IS HALF INSTRUMENT. The land's colour is a capability's
// STATUS (ADR-0392 D5 / ADR-0398 D7), so a scenery colour that lands on a status family's
// colour makes the map report a proof state that no capability holds. The arc names this as the
// one way its work can do real harm. A cover is therefore never authored by eye: it is authored
// against {@link separationOf}, and the number is published beside the picture.
//
// ⚠ THE COVER TOKENS ARE DELIBERATELY **NOT** ADDED TO `landTokens()`. `capture.mjs` refuses any
// delivered pixel outside `landPalette()`, so widening that set would relax the fence on
// `island.html` and `directions.html` — two pages that draw no cover at all. A palette with
// entries nothing on the audited pages can emit reads as more coverage than it has, which is the
// argument `palette-band.ts` already makes for the crown's missing `-hi` token. The cover page
// carries its own page-local widening instead: `coverPalette()`, unioned with `landPalette()` by
// `cover-measure.mjs` and by nothing else.
//
// PURE, and held there by `scope-fence.test.ts`: no three, no react, so every claim below is
// provable in node against the same arithmetic the GPU is handed.

import {
  SHADE_LEVELS,
  STATUS_TOKENS,
  deliveredForLevel,
  paletteImageOfToken,
  parseHex,
  toHex,
  type Rgb255,
} from './palette-band.js';

/** Which scenery cover a ground cell wears instead of its status family's own token. */
export type GroundCover = 'wheat' | 'yellowGrass';

/** Every cover, in the order the comparison page draws them. */
export const GROUND_COVERS: readonly GroundCover[] = ['wheat', 'yellowGrass'];

/**
 * THE YELLOW-GRASS TOKEN — a dry mustard meadow. `rgb(176, 176, 64)`.
 *
 * AUTHORED AGAINST THE MEASUREMENT, NOT PICKED BY EYE, and the search that produced it is
 * recorded in `docs/research/chapter2-ground-cover-2026-08-27/`. The constraint that decides it
 * is not aesthetic: `proposed` (`#d8c069`) and `building` (`#dcab52`) are themselves yellows and
 * `unknown` (`#a9c87f`) is a light yellow-green, so the band a yellow grass would naturally
 * occupy is already spoken for three times over.
 *
 * Measured, at matched condition (same face, same ladder rung — the only comparison a viewer
 * actually makes on one island), its nearest status colour is **13.62**, `proposed`'s middle
 * variant at level 0.80. Two figures put that in proportion, and both are computed rather than
 * quoted — see {@link SEPARATION_FLOOR} and {@link worstStatusPair}:
 *
 *   - the shipped `wheat` override sits **7.68** from `proposed`, so this cover is 1.8x further
 *     from a proof state than a colour the app already draws;
 *   - the closest two DIFFERENT statuses sit **3.33** apart, so the map already draws a
 *     MEANINGFUL difference 4.1x quieter than this scenery colour's distance from any of them.
 *
 * ⚠ RED EQUALS GREEN, EXACTLY, AND THAT IS THE COLOUR CONSTRAINT DOING WORK. The first token
 * authored here scored 11.96 and rendered OLIVE-GREEN: the luma weights put 59% of the distance
 * on the green channel, so an optimiser handed "get far from the status families" walks straight
 * out of yellow and into green, where the distance is cheapest to buy. Nothing in the number
 * notices. `r === g` pins the hue at 60 degrees — yellow by construction — and the search then
 * runs inside that, which is the only order that produces a colour answering the request.
 *
 * ⚠ WHAT IT IS NOT IS SAFE IN THE ABSOLUTE. Within yellow-dominant grass colours the separation
 * tops out near **18.5** (`#a8a837`, a mustard dark enough to read as shadow), and every colour
 * pale enough to read as light straw falls back to the shipped wheat's own 7.6–7.7 —
 * `#c6c06a` measures 7.68, the bar exactly. There is no yellow grass that is both bright and
 * well separated, because `proposed` already owns bright yellow. That trade curve is the
 * finding, and pricing it is the owner's — `oq-how-does-the-map-report-a-capability-s-state-once-the-gro`.
 */
export const YELLOW_GRASS = '#b0b040';

/**
 * The token a cover puts on a cell of the given status.
 *
 * `wheat` IS PER-STATUS AND THAT IS NOT AN INCONSISTENCY. Five of the six families carry the
 * identical `#d6b271`; `unhealthy` carries `#6f6852` instead, because a bright gold field on a
 * failing capability would be the art contradicting the ground under it. The override is read
 * from `STATUS_TOKENS` rather than restated here, so the two copies cannot drift.
 *
 * `yellowGrass` is ONE token for every status, which is the stronger claim of the two: it says
 * outright that this cover reports nothing about the capability beneath it.
 */
export function coverTokenFor(cover: GroundCover, status: string): string {
  if (cover === 'yellowGrass') return YELLOW_GRASS;
  const fam = STATUS_TOKENS.get(status) ?? STATUS_TOKENS.get('unknown')!;
  return fam.wheat;
}

/** Every authored token a cover may put on the ground, deduped, in a stable order. */
export function coverTokens(cover: GroundCover): string[] {
  const out: string[] = [];
  for (const status of [...STATUS_TOKENS.keys()].sort()) {
    const t = coverTokenFor(cover, status);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * The page-local palette widening: every colour a cover can deliver, across the ladder.
 *
 * Unioned with `landPalette()` by the cover page's measurement and by nothing else — see this
 * file's header for why the audited pages' fence is left exactly where it is.
 */
export function coverPalette(): string[] {
  const set = new Set<string>();
  for (const cover of GROUND_COVERS) {
    for (const token of coverTokens(cover)) {
      for (const c of paletteImageOfToken(token)) set.add(toHex(c));
    }
  }
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// The separation instrument
// ---------------------------------------------------------------------------
//
// ⚠ ONE DISTANCE, AND IT IS THE ARC'S OWN. Every colour-distance figure this track has published
// — the worst matched pair at 3.37, the shipped app's 4.32, the shade rung at 13.98 — was taken
// in the LUMA-WEIGHTED space the Blender compositor's quantiser snaps in
// (`docs/research/chapter2-land-interior-fork-2026-08-15/compose.py` `W_LUMA`, read through
// `chapter2-palette-foreign-status-2026-08-18/palette_read.py` `dist`). A CIELAB dE here would
// produce numbers that LOOK comparable to those and are not, which is worse than producing none:
// a reader has no way to tell two metrics apart from a table. So the weights are transcribed and
// named, and every figure this module emits is in that one space.

/** The quantiser's own channel weights — `compose.py` `W_LUMA`, never Rec.709. */
export const LUMA_WEIGHTS: readonly [number, number, number] = [0.3, 0.59, 0.11];

/** Distance between two delivered colours, in the space above. */
export function colourDistance(a: Rgb255, b: Rgb255): number {
  const [wr, wg, wb] = LUMA_WEIGHTS;
  return Math.sqrt((a.r - b.r) ** 2 * wr + (a.g - b.g) ** 2 * wg + (a.b - b.b) ** 2 * wb);
}

/** Luma of a delivered colour, in the same weights. */
export function luma(c: Rgb255): number {
  const [wr, wg, wb] = LUMA_WEIGHTS;
  return c.r * wr + c.g * wg + c.b * wb;
}

/** How close one token comes to a status family, and where. */
export interface Separation {
  /** The token measured. */
  token: string;
  /** The nearest status family's name. */
  nearest: string;
  /** The distance to it, at matched condition. */
  distance: number;
  /** Which of that family's `top` variants, and at which ladder level. */
  at: string;
  /** The distance to every family, keyed by status. */
  per: Record<string, number>;
}

/**
 * THE MEASUREMENT — how close a token comes to reading as a capability's status.
 *
 * AT MATCHED CONDITION, which is the whole reason this figure can be defended. The 2026-08-18
 * pass established that a reader comparing a SHADED pixel to an UNSHADED swatch can always be
 * answered with "you compared two different lighting conditions", and that removing that
 * objection does not dissolve the defect but sharpens it. So each ladder rung is compared only
 * against the SAME rung: this is the distance between two colours the land draws side by side,
 * under one light, on one face.
 *
 * ⚠ THE WORST RUNG IS A DARK ONE, AND THE MINIMUM IS TAKEN OVER ALL FOUR RATHER THAN AT FULL
 * LIGHT. `deliveredForLevel` is `token x level` for every token without a shade key, so a pair's
 * distance scales LINEARLY with the rung: at 0.78 every gap is 78% of what it is at full light.
 * Measuring only the lit swatch would over-report every separation in this file by ~28%.
 *
 * ⚠ WHICH dark rung is not fixed, and the reason is rounding rather than lighting. The two
 * bottom rungs are 0.78 and 0.80 — 2.5% apart — while `deliveredForLevel` rounds to integer
 * channels, so half a unit of rounding is enough to make 0.80 the closer of the two. `#d6b271`
 * is minimal at 0.78 and `#b0b040` at 0.80. Nothing may assume the floor rung wins.
 *
 * Only the `top` faces are compared. That is the face the study stands on and the face a cover
 * actually occupies — the rim wears its own token and is a different question.
 */
export function separationOf(token: string): Separation {
  const per: Record<string, number> = {};
  let nearest = '';
  let distance = Infinity;
  let at = '';
  for (const status of STATUS_TOKENS.keys()) {
    const fam = STATUS_TOKENS.get(status)!;
    let best = Infinity;
    let bestAt = '';
    fam.top.forEach((variant, index) => {
      for (const level of SHADE_LEVELS) {
        const d = colourDistance(deliveredForLevel(token, level), deliveredForLevel(variant, level));
        if (d < best) {
          best = d;
          bestAt = `${status}.top[${index}] (${variant}) at level ${level}`;
        }
      }
    });
    per[status] = best;
    if (best < distance) {
      distance = best;
      nearest = status;
      at = bestAt;
    }
  }
  return { token, nearest, distance, at, per };
}

/** The closest two DIFFERENT statuses come to each other, at matched condition — the distance
 *  the map already draws between two MEANINGFUL states, and therefore the floor below which a
 *  scenery colour is not the map's biggest problem. */
export function worstStatusPair(): { a: string; b: string; distance: number; at: string } {
  const statuses = [...STATUS_TOKENS.keys()];
  let out = { a: '', b: '', distance: Infinity, at: '' };
  for (let i = 0; i < statuses.length; i++) {
    for (let j = i + 1; j < statuses.length; j++) {
      const sa = statuses[i]!;
      const sb = statuses[j]!;
      for (const ta of STATUS_TOKENS.get(sa)!.top) {
        for (const tb of STATUS_TOKENS.get(sb)!.top) {
          for (const level of SHADE_LEVELS) {
            const d = colourDistance(deliveredForLevel(ta, level), deliveredForLevel(tb, level));
            if (d < out.distance) out = { a: sa, b: sb, distance: d, at: `${ta} vs ${tb} at ${level}` };
          }
        }
      }
    }
  }
  return out;
}

/** The distance between each pair of ADJACENT ladder rungs for one token — "the same colour,
 *  one lighting step away". The comparison that says whether a separation is loud or quiet:
 *  a gap smaller than a rung step means the difference between scenery and a proof state is
 *  quieter than the difference between lit ground and shaded ground. */
export function shadeRungGaps(token: string): number[] {
  const rungs = SHADE_LEVELS.map((level) => deliveredForLevel(token, level));
  const out: number[] = [];
  for (let i = 1; i < rungs.length; i++) out.push(colourDistance(rungs[i - 1]!, rungs[i]!));
  return out;
}

/**
 * THE BAR A NEW COVER IS HELD TO: it may be no closer to a proof state than the cover that
 * already ships.
 *
 * This is the shipped `wheat` override's own matched-condition separation from `proposed`,
 * transcribed as a literal rather than computed from `wheat` at call time — because a bar
 * derived from its own subject cannot fail, and a bar that silently tracks the thing it
 * measures would go on passing through a change to either colour. `ground-cover.test.ts`
 * asserts the literal still equals the measurement, so a moved token REDS rather than
 * re-baselines.
 *
 * ⚠ IT IS A RELATIVE BAR AND SAYS SO. Clearing it means "does no more harm than what already
 * ships", never "is safe". Whether 7.68 was ever an acceptable distance for a scenery colour is
 * precisely the owner's open question; this bar refuses to make it worse while that is unsettled.
 *
 * ⚠ ROUNDED DOWN, not to nearest, and the reason is not fussiness. Wheat measures 7.675285…; a
 * bar transcribed as 7.68 is ABOVE its own source, so the very colour that defines the bar
 * reports as failing it by five thousandths — which prints as an `XX` beside the one row that
 * cannot possibly be wrong, and invites the next reader to "fix" a colour the app already ships.
 * Truncating leaves the reference inside its own bar and costs a candidate nothing real.
 */
export const SEPARATION_FLOOR = 7.675;

/** A candidate cover token's standing against {@link SEPARATION_FLOOR}. */
export interface CoverVerdict {
  separation: Separation;
  /** The bar it was held to. */
  floor: number;
  /** How far clear of the bar it is; negative means it collides. */
  margin: number;
  ok: boolean;
}

/** Whether a candidate cover token clears {@link SEPARATION_FLOOR}, with the numbers that decide
 *  it. Returned rather than asserted so a caller can PRINT a near miss instead of only failing. */
export function coverVerdict(token: string): CoverVerdict {
  const separation = separationOf(token);
  return {
    separation,
    floor: SEPARATION_FLOOR,
    margin: separation.distance - SEPARATION_FLOOR,
    ok: separation.distance >= SEPARATION_FLOOR,
  };
}

/** An authored token, decomposed for a report. */
export interface TokenDescription {
  token: string;
  rgb: Rgb255;
  luma: number;
}

/** Parse-and-measure convenience for a report: the token, its channels and its luma. */
export function describeToken(token: string): TokenDescription {
  const rgb = parseHex(token);
  return { token, rgb, luma: luma(rgb) };
}
