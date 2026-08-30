// shadow-rung.ts — HOW DARK MAY A SHADOW GO ON THE SHIPPED GROUND? Pure, browser-free,
// node:test-provable — it imports only the authored ladder.
//
// ⚠ IT LIVES IN `src/` BECAUSE THE SHIPPED MATERIAL NEEDS THE ANSWER, not merely an instrument
// that reports it. `harness/shadow-ladder.ts` measured this question for the EXPERIMENT island
// and stays where it is: it is a reader model with a provenance argument (a port of the
// author-time compositor's `safe_depth`, held to three independently recorded configurations)
// and none of that publishes. What crossed on 2026-08-30 is the ARITHMETIC the material cannot
// run without — the derived rung, the ladder it extends, and which lit rungs a shadow may
// darken — re-asked against the tokens the SHIPPED canvas actually draws.
//
// THE QUESTION, IN ONE SENTENCE. A shadow is a LUMINANCE operation and the land's status
// colours are ordered along luminance, so darkening a parcel walks it toward another status's
// colour; past some depth a reader takes a `proposed` capability for a `healthy` one — doubt
// painted as proof, the worst available direction to be wrong (ADR-0392 D5 / ADR-0398 D7,
// ADR-0367 D5). The depth at which that happens is a CEILING, and this module DERIVES it
// rather than declaring it.
//
// ⚠⚠ AND IT IS RE-ASKED AGAINST THE SHIPPED TOKENS RATHER THAN INHERITED, which is the one
// thing a crossing here could get quietly wrong. `harness/shadow-ladder.ts`'s `SHADOW_RUNG` is
// derived against `palette-band.ts`'s `STATUS_TOKENS` — the EXPERIMENT island's vocabulary,
// which is not the shipped one (`ForestWorldCanvas`'s `GROUND_COLOUR`, ADR-0462: five colours
// over six states). The two happen to agree today at 0.77, and that agreement is MEASURED
// rather than assumed — `shadow-rung.test.ts` pins the shipped answer, and it is a derived
// number that will move if either palette does.
//
// ⚠ THE REFERENCE RUNG IS 0.90, NOT FULL LIGHT, and getting it wrong invents a scandal. The
// live renderer never delivers flat ground at `token x 1.0`: a flat up-normal lands on rung
// 0.90 ({@link flatGroundLevel}). Build the reader's references at 1.0 instead and the
// instrument reports the ORDINARY SHIPPED GROUND as already misreporting on four rungs — a
// false alarm shaped exactly like a serious live defect.

import {
  SHADE_LEVELS,
  deliveredForLevel,
  rungOfNormal,
  type Rgb255,
} from './shade-ladder.js';
import { indices } from './land-shadow.js';

/**
 * The channel weighting the author-time compositor's `snap` and `nearest_status` share, so
 * "near" means the same thing to the quantiser and to this judge. Verbatim from
 * `docs/research/chapter2-land-interior-fork-2026-08-15/compose.py:140` — NOT a new choice made
 * here, and that provenance is the reason this module can claim to measure confusability rather
 * than to have invented a metric that agrees with a preferred conclusion.
 */
export const W_LUMA: readonly [number, number, number] = [0.3, 0.59, 0.11];

/** Weighted squared distance between two delivered colours — the space the reader searches. */
export function colourDistance2(a: Rgb255, b: Rgb255): number {
  return W_LUMA[0] * (a.r - b.r) ** 2 + W_LUMA[1] * (a.g - b.g) ** 2 + W_LUMA[2] * (a.b - b.b) ** 2;
}

/**
 * The ladder level FLAT GROUND is delivered at — DERIVED from the authored light and the
 * authored ladder, never typed. It is 0.90.
 *
 * ⚠ A FUNCTION RATHER THAN A MODULE-SCOPE CONSTANT, and that is a mutation-rung finding rather
 * than a style preference: anything evaluated at IMPORT time is attributed to no test, so a
 * mutant inside a `const X = f()` comes back UNPROVEN — killed with no test named — and reds the
 * rung from inside well-covered arithmetic.
 *
 * ⚠ AND IT IS NOT MEMOISED, which it was for one gate run. A memo is unobservable state: `if
 * (memo === null)` is a branch no test can distinguish, because both sides return the same
 * number. It bought nothing either — this is one array index over a dot product — and it cost a
 * mutant nothing could kill.
 */
export function flatGroundLevel(): number {
  return SHADE_LEVELS[rungOfNormal({ x: 0, y: 1, z: 0 })]!;
}

/**
 * The colours a reader has learned, one per DISTINCT authored token, delivered at the level flat
 * ground actually wears.
 *
 * ⚠ DEDUPED BY HEX, AND THE DEDUPE IS LOAD-BEARING RATHER THAN TIDY. ADR-0462 put `proposed` and
 * `building` on the same `#d8c069`, so a table keyed by STATUS holds that colour twice and every
 * yellow pixel is "nearest a foreign status" — one of the pair always wins the tie. Asked that
 * way the shipped palette condemns itself at every rung, which is a fact about the question
 * rather than about the ground. The material knows only tokens, so tokens are what it is asked
 * about: does `token x rung` still read as `token` rather than as some OTHER token?
 */
export function readerReferences(tokens: readonly string[]): { hex: string; colour: Rgb255 }[] {
  const seen = new Set<string>();
  const out: { hex: string; colour: Rgb255 }[] = [];
  const rung = flatGroundLevel();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    // ⚠ NO SEPARATE `parseHex` GUARD. It was here to make a malformed token fail where the
    // message could name it — but `deliveredForLevel` parses the same token on the next line and
    // throws the same way, so the guard could be deleted without changing any observable
    // behaviour: an unkillable mutant standing in for a check that was already made.
    out.push({ hex: token, colour: deliveredForLevel(token, rung) });
  }
  return out;
}

/** Which reference a delivered colour reads as: nearest in the weighted space. Ties go to the
 *  FIRST reference, which is what `numpy.argmin` over a stacked table does and what the
 *  compositor's port therefore did. */
export function nearestReference(
  colour: Rgb255,
  refs: readonly { hex: string; colour: Rgb255 }[],
): string {
  let best = '';
  let bestD = Infinity;
  for (const ref of refs) {
    const d = colourDistance2(colour, ref.colour);
    if (d < bestD) {
      bestD = d;
      best = ref.hex;
    }
  }
  return best;
}

/** How much closer a delivered colour is to its OWN reference than to the nearest foreign one,
 *  in weighted channel units. Positive means it reads honestly; the number is the headroom, and
 *  on this palette the tightest is 3.0 units. Reported rather than asserted on — the verdict is
 *  {@link nearestReference} — because a margin is what makes a pass or a failure quotable. */
export function readMargin(
  colour: Rgb255,
  token: string,
  refs: readonly { hex: string; colour: Rgb255 }[],
): number {
  let own = Infinity;
  let foreign = Infinity;
  for (const ref of refs) {
    const d = Math.sqrt(colourDistance2(colour, ref.colour));
    if (ref.hex === token) own = Math.min(own, d);
    else foreign = Math.min(foreign, d);
  }
  return foreign - own;
}

/**
 * THE DERIVED ANSWER: the deepest ladder level EVERY authored token can wear without reading as
 * another one — or `null` when no level below flat ground is admissible at all, which would be
 * the honest finding that a shadow cannot ship on this palette.
 *
 * It sweeps candidate levels down a 0.01 grid and asks the reader about the colour THE SHADER
 * WOULD ACTUALLY DELIVER at each — `deliveredForLevel`, integer-rounded once — rather than about
 * a float-darkened copy of an already-rounded colour. The two disagree by up to one channel unit
 * near the flip, and one channel unit is a whole rung on this grid. The shader's arithmetic is
 * the one that ships, so it is the one that decides.
 *
 * ⚠ IT BREAKS AT THE FIRST FAILURE rather than continuing to look for a deeper level that
 * happens to read correctly again. A shadow rung has to be admissible; a rung reachable only by
 * passing THROUGH an inadmissible one is not a ceiling, it is an island past a cliff.
 */
export function deepestAdmissibleRung(
  tokens: readonly string[],
  step = 0.01,
  floor = 0.3,
): number | null {
  const refs = readerReferences(tokens);
  let admissible: number | null = null;
  // ⚠ THE FLOOR IS TESTED ON THE ROUNDED CANDIDATE, not on the accumulating loop variable. Ten
  // subtractions of 0.01 land on 0.8000000000000003 rather than on 0.8, so a floor comparison
  // against the raw variable answers about an accumulation error instead of about the level the
  // sweep is actually asking the reader about — and `>` and `>=` then agree at every floor a
  // caller can pass.
  // ⚠ A MATERIALISED RANGE RATHER THAN AN ACCUMULATING COUNTER, for the reason `indices` gives
  // in `land-shadow.ts`: a mutated `-=` here does not fail a test, it sweeps upward forever, and
  // Stryker reports the hang as a TIMEOUT that no test can be credited with.
  // Stryker disable next-line ArithmeticOperator: EQUIVALENT. Starting one step ABOVE flat ground
  // rather than one below adds a probe at a level lighter than the ground itself; it is
  // admissible by construction (it sits between two authored rungs), so `admissible` is
  // overwritten by every deeper level and the returned value is unchanged.
  const start = flatGroundLevel() - step;
  for (const n of indices(probeCount(start, floor, step))) {
    const rounded = Math.round((start - n * step) * 10000) / 10000;
    if (rounded <= floor) break;
    const ok = refs.every((ref) => nearestReference(deliveredForLevel(ref.hex, rounded), refs) === ref.hex);
    if (!ok) break;
    admissible = rounded;
  }
  return admissible;
}

/**
 * How many levels the sweep may probe between `start` and `floor`.
 *
 * ⚠ EXTRACTED SO THE COUNT IS A VALUE A TEST CAN READ. Inside the loop it is a bound on a loop
 * that breaks on its own condition, so a count that is merely too LARGE gives the same answer and
 * no assertion about the answer can see it. The `+ 1` is what makes the range inclusive of the
 * floor's own neighbour, and a count two short stops above the true answer — which is the half
 * that IS observable, and is asserted at a floor where it bites.
 */
export function probeCount(start: number, floor: number, step: number): number {
  return Math.ceil((start - floor) / step) + 1;
}

/** Everything the material needs to wear a shadow, derived from its own token list. */
export interface ShadowLadder {
  /** The derived level a shadowed fragment lands on. */
  rung: number;
  /** `SHADE_LEVELS` plus that rung, ascending — the levels each ramp ROW is built over. */
  levels: readonly number[];
  /** Where the shadow rung sits in {@link levels}. */
  rungIndex: number;
  /** For each `SHADE_LEVELS` index, its index in {@link levels} — the remap a fragment's LIT
   *  rung goes through now that the ladder has grown an entry. */
  litIndex: readonly number[];
  /** The `SHADE_LEVELS` indices a shadow may darken: those LIGHTER than the shadow rung. A
   *  fragment already darker keeps its own level — a shadow that BRIGHTENED it would be a shadow
   *  lighting something up. */
  darkenable: readonly number[];
}

/**
 * Build it, or REFUSE.
 *
 * ⚠ THE REFUSAL IS THE POINT OF THE FUNCTION, not an edge case it also handles. A palette with
 * no admissible rung cannot wear a shadow honestly, and the only two ways to ship one anyway are
 * to darken past the ceiling (the map lies) or to leave the closure (the map lies differently).
 * Throwing is what turns that into a finding somebody has to price.
 *
 * ⚠ THE RUNG IS NOT ASSUMED TO BE THE DARKEST LEVEL. `deepestAdmissibleRung` can in principle
 * return a level that sits BETWEEN two authored rungs, so the ladder is built by SORTING and the
 * lit-rung remap is read back out of it. Assuming the shadow rung is index 0 would paint the
 * wrong colour for every fragment on this map the day the palette moves.
 */
export function shadowLadderFor(tokens: readonly string[]): ShadowLadder {
  const rung = deepestAdmissibleRung(tokens);
  if (rung === null) {
    throw new Error(
      'shadow-rung: NO ladder level below flat ground is admissible for every authored ground ' +
        'token, so a shadow cannot be drawn inside this closed palette. That is a finding to ' +
        'price and escalate — the remedy is hue separation between the status tokens, not a ' +
        'shallower shadow and not a wider palette.',
    );
  }
  const levels = [...SHADE_LEVELS, rung].sort((a, b) => a - b);
  const rungIndex = levels.indexOf(rung);
  const litIndex = SHADE_LEVELS.map((level) => levels.indexOf(level));
  return { rung, levels, rungIndex, litIndex, darkenable: rungsDarkenedBy(rung) };
}

/**
 * Which `SHADE_LEVELS` indices a shadow at `rung` may darken: those strictly LIGHTER than it.
 *
 * ⚠ EXPORTED SO A TEST CAN ASK IT ABOUT A RUNG THAT COINCIDES WITH AN AUTHORED LEVEL. Folded
 * inside {@link shadowLadderFor} the comparison was unkillable — the derived rung is never a
 * member of `SHADE_LEVELS`, so `>` and `>=` agree at every input the caller can produce, and the
 * one case that separates them was unreachable rather than untested. A level EQUAL to the shadow
 * rung must not darken: darkening it would be a shadow that changed nothing while claiming to.
 */
export function rungsDarkenedBy(rung: number, levels: readonly number[] = SHADE_LEVELS): number[] {
  const out: number[] = [];
  levels.forEach((level, i) => {
    if (level > rung) out.push(i);
  });
  return out;
}
