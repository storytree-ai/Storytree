// grain-status-reading.ts — DOES THE GRAIN MOVE WHAT A GROUND PIXEL REPORTS?
//
// ⚠⚠ THIS IS THE MEASUREMENT THAT GATES THE GRAIN CROSSING, AND IT EXISTS BECAUSE THE OBVIOUS
// MOVE WAS TO ESCALATE INSTEAD. The shipped ground's guarantee today is a CLOSED PALETTE: every
// delivered land pixel is one of the 20 authored `(token x level)` entries
// (`src/banded-ground-material.ts`). The grain's COLOUR half — the mechanism the approved Cycles
// render actually used — mixes a noise-driven ramp INTO the delivered colour at fac 0.13, which
// is off-palette by construction. So "may the shipped ground leave the closed palette?" looks
// like an owner fork.
//
// IT IS A MEASUREMENT FIRST. The closure is a MEANS; the END is ADR-0392 D5 / ADR-0398 D7 —
// every capability reads as the state it holds and as no other. A 13% status-INDEPENDENT mottle
// either moves a pixel into a neighbouring status's family or it does not, and that is
// arithmetic with a definite answer. This module asks it of the FIELD's reachable colour set
// rather than of one machine's pixels, which is the only form the answer can take:
// `grain-picture-is-renderer-specific` measured SwiftShader and an RTX 2060 disagreeing on 24.5%
// of grained pixels — a different mottle, not a rounding difference — so a pixel sweep is
// corroboration and must name its GPU, while a claim about the reachable SET is renderer-free.
//
// AND IT IS EXHAUSTIVE RATHER THAN SAMPLED. The colour half is LINEAR in the grain scalar, so
// the reachable set for one `(token, level)` base is a straight SEGMENT in RGB between
// `mix(base, darkStop, fac)` and `mix(base, lightStop, fac)`. Walking that segment finely enough
// that consecutive samples cannot differ by a whole channel unit enumerates every colour the
// half can deliver for that base — no GPU, no island, no sampling error.
//
// ⚠ THE FIXTURE ISLAND IS SINGLE-STATUS, which is exactly why this is not a pixel sweep: a
// picture of that island cannot see a foreign-status read at all. All six shipped ground tokens
// are driven through the mix here.

import { deliveredForLevel, toHex, type Rgb255 } from '../src/shade-ladder.js';
import { shadowLadderFor } from '../src/shadow-rung.js';
import { GRAIN_COLOUR_MIX, grainStops } from './land-grain.js';
import { FLAT_GROUND_LEVEL, colourDistance2, nearestStatus } from './shadow-ladder.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';

/**
 * The statuses the SHIPPED ground can paint, in the order the reader table lists them.
 *
 * ⚠ ALL SIX, NOT `RENDERED_STATUSES`' FOUR. `shadow-ladder.ts` narrows to the four survivors of
 * `worldStatus`'s folds because its question was about the harness island the studio's fold has
 * already run over. This question is about the MATERIAL, which is handed whatever token map
 * `ForestWorldCanvas` builds — six rows, `SHIPPED_GROUND_COLOUR` verbatim — so narrowing here
 * would be measuring a smaller palette than the one that ships.
 */
export const SHIPPED_STATUSES: readonly string[] = [...SHIPPED_GROUND_COLOUR.keys()];

/** The DISTINCT authored ground tokens, in row order — five over six states (ADR-0462). */
export const SHIPPED_TOKENS: readonly string[] = [...new Set(SHIPPED_GROUND_COLOUR.values())];

/**
 * THE LADDER THE SHIPPED GROUND ACTUALLY DRAWS — `SHADE_LEVELS` plus the derived shadow rung.
 *
 * ⚠⚠ THIS IS A CORRECTION, AND THE THING IT CORRECTS LOOKED EXACTLY LIKE A PASS. Until
 * 2026-08-30 every walk below iterated `SHADE_LEVELS` — four rungs — and reported a verdict
 * about 24 patches. The shadow crossing (PR #1736) gave the shipped material a FIFTH rung,
 * derived by {@link shadowLadderFor} and sitting BELOW the four, which is precisely where the
 * tightest margin already lived. An instrument that keeps asking about the old ladder does not
 * fail; it answers a question nobody is asking any more, in the vocabulary of the one they are.
 * The measured cost of the correction: the tightest ungrained margin falls 3.00 -> 0.93, the
 * admissible tint ceiling falls 0.031 -> 0.006, and the count of patches the tint breaks rises
 * from four to six.
 *
 * ⚠ DERIVED ON EVERY CALL RATHER THAN MEMOISED, for the reason `shadow-rung.ts`'s
 * `flatGroundLevel` gives at length: a memo is unobservable state — both sides of `if (memo ===
 * null)` return the same value — so it buys a mutant nothing can kill. The sweep behind it is
 * ~60 levels over five tokens; there is nothing here to amortise.
 */
export function shippedLadder(): readonly number[] {
  return shadowLadderFor(SHIPPED_TOKENS).levels;
}

/**
 * The reader's reference colours for the SHIPPED ground: one authored token per status,
 * delivered at `rung`.
 *
 * ⚠ IT IS NOT `liveReaderTable`, AND THE DIFFERENCE IS THE WHOLE POINT. That one is built from
 * `STATUS_TOKENS` — the HARNESS island's three-variant families, which the shipped canvas has
 * never drawn. Asking whether the shipped ground reports honestly against a table of colours it
 * cannot emit would answer a different question and look like this one.
 *
 * ⚠⚠ AND IT IS BUILT AT `FLAT_GROUND_LEVEL`, NOT AT FULL LIGHT — the correction
 * `shadow-ladder.ts` makes at length and the one this instrument got wrong first. The live
 * renderer never delivers flat ground at 1.0: a flat up-normal lands on rung 0.90, so a table of
 * full-strength tokens compares every delivered pixel against a reference the map cannot draw
 * and reports the ordinary shipped ground as already misreading. The reader's reference is what
 * lit ground LOOKS like, which is `token x 0.90`.
 *
 * ⚠ `proposed` AND `building` SHARE A TOKEN (ADR-0462: the same yellow under two keys). They are
 * therefore INDISTINGUISHABLE BY COLOUR BEFORE THE GRAIN EXISTS, which is an authored decision
 * rather than a defect this instrument may report — so `nearestStatus`'s alphabetical tie-break
 * settles between them deterministically and {@link ownFamily} treats the pair as one family.
 */
export function shippedReaderTable(rung: number = FLAT_GROUND_LEVEL) {
  const table: Record<string, Rgb255[]> = {};
  for (const status of SHIPPED_STATUSES) {
    table[status] = [deliveredForLevel(SHIPPED_GROUND_COLOUR.get(status)!, rung)];
  }
  // `satisfies` rather than an annotated return type, which is how `readerStatusTable` states the
  // same shape: the annotation widens the inferred type at the boundary and
  // `anti-slop/no-known-value-widening` fires on it.
  return table satisfies Record<string, Rgb255[]>;
}

/**
 * The set of statuses a read of `status` is allowed to come back as — itself, plus any status
 * sharing its authored token.
 *
 * WITHOUT THIS THE INSTRUMENT CONDEMNS THE PALETTE AS IT ALREADY SHIPS. `proposed` and
 * `building` are the same hex, so one of them ALWAYS reads as the other and always has; counting
 * that as a grain-induced misread would report a failure the grain did not cause and cannot fix.
 */
export function ownFamily(status: string): Set<string> {
  const token = SHIPPED_GROUND_COLOUR.get(status);
  return new Set(SHIPPED_STATUSES.filter((s) => SHIPPED_GROUND_COLOUR.get(s) === token));
}

/** The two grain stops, converted ONCE — but LAZILY, and both halves of that matter.
 *
 *  ONCE: `grainStops()` runs six `Math.pow` calls through the linear-to-sRGB transfer, and the
 *  walks below evaluate it ~48,000 times per verdict. Un-memoised, `admissibleMixCeiling` took
 *  6.4 s and timed out inside the mutation rung dry run.
 *
 *  ⚠ LAZILY, because a module-scope `const STOPS = grainStops()` runs at IMPORT time, and Stryker
 *  files code executed during import as STATIC coverage rather than against any test. Every mutant
 *  in `linearToSrgb255` was then killed with "no test named" — reported UNPROVEN, which
 *  `check:mutation-diff` treats as neither a pass nor a survivor, so a well-tested function reds
 *  the rung. Deferring the call to first use puts it back inside a test.  */
let stopsMemo: readonly [Rgb255, Rgb255] | null = null;
const stops = (): readonly [Rgb255, Rgb255] => (stopsMemo ??= grainStops());

/**
 * The colour the grain's COLOUR half delivers for `base` at grain scalar `t` in [0, 1].
 *
 * The pure twin of the shader's `mix(c, grainColour, fac)`, taking the scalar DIRECTLY rather
 * than a ground coordinate — the reachable set is a property of the scalar's range, and routing
 * it through `grainField` would make an exhaustive walk depend on which points the field happens
 * to visit.
 */
export function grainMixed(base: Rgb255, t: number, fac: number = GRAIN_COLOUR_MIX): Rgb255 {
  const [dark, light] = stops();
  const at = (lo: number, hi: number) => lo + (hi - lo) * t;
  const mix = (b: number, lo: number, hi: number) => Math.round(b + (at(lo, hi) - b) * fac);
  return {
    r: mix(base.r, dark.r, light.r),
    g: mix(base.g, dark.g, light.g),
    b: mix(base.b, dark.b, light.b),
  };
}

/**
 * How far a colour sits from its own family, and from the nearest FOREIGN one, in the weighted
 * space `nearestStatus` searches — as distances rather than squares, so the number is in channel
 * units a reader can hold.
 *
 * The MARGIN is `foreign - own`. Positive means the colour reads as its own family; the size is
 * how much room is left before it does not.
 */
export interface ReadMargin {
  own: number;
  foreign: number;
  margin: number;
}

export function readMargin(
  colour: Rgb255,
  status: string,
  table: Record<string, Rgb255[]>,
): ReadMargin {
  return marginAgainst(colour, ownFamily(status), table);
}

/** The same arithmetic with the family ALREADY RESOLVED — the form the walks call.
 *
 *  It exists for cost, not for taste: `ownFamily` builds a Set by filtering the status list, and a
 *  walk evaluates the margin ~48,000 times per verdict, so resolving the family per sample made
 *  `admissibleMixCeiling` take 6.4 s and time out inside the mutation rung's dry run — which is not
 *  a slow test, it is a test the rung then cannot use for coverage at all. Exported so the hoist is
 *  checkable rather than an internal detail a test has to reach through `readMargin` to reach. */
export function marginAgainst(
  colour: Rgb255,
  family: ReadonlySet<string>,
  table: Record<string, Rgb255[]>,
): ReadMargin {
  let own = Infinity;
  let foreign = Infinity;
  for (const [st, entries] of Object.entries(table)) {
    for (const entry of entries) {
      const d = Math.sqrt(colourDistance2(colour, entry));
      if (family.has(st)) own = Math.min(own, d);
      else foreign = Math.min(foreign, d);
    }
  }
  return { own, foreign, margin: foreign - own };
}

/** One `(status, ladder rung)` base, and what the grain's colour half can do to its reading. */
export interface GrainReadVerdict {
  status: string;
  level: number;
  /** The ungrained delivered pixel — what the shipped ground draws today. */
  base: string;
  /** Which status the ungrained pixel reads as. */
  baseReadsAs: string;
  /** The ungrained pixel's margin over the nearest foreign family. */
  baseMargin: number;
  /** The two ends of the reachable segment — `mix(base, dark)` and `mix(base, light)`. */
  reach: readonly [string, string];
  /** How many distinct colours the half can deliver for this base. */
  reachSize: number;
  /** Every status any reachable colour reads as, sorted. */
  grainedReadsAs: string[];
  /** The smallest margin any reachable colour holds. Negative means a foreign read. */
  worstMargin: number;
  /** Does EVERY reachable colour still read as the base's own family? */
  holds: boolean;
}

/**
 * The step the reachable segment is walked at, as a fraction of the grain scalar.
 *
 * DERIVED, NOT TASTED. The segment's per-channel extent is at most `fac * 255` ≈ 33 units, so a
 * step of 1/2000 moves any channel by at most 0.017 — two orders inside the one-unit rounding
 * grid, which is what makes the walk an enumeration of the reachable set rather than a sample of
 * it. A test asserts consecutive samples never skip a channel value.
 */
export const GRAIN_REACH_STEPS = 2000;

/** Every `(status, rung)` base, walked across the grain's reachable segment. */
export function grainColourHalfReadings(
  fac: number = GRAIN_COLOUR_MIX,
  table: Record<string, Rgb255[]> = shippedReaderTable(),
  levels: readonly number[] = shippedLadder(),
): GrainReadVerdict[] {
  const out: GrainReadVerdict[] = [];
  for (const status of SHIPPED_STATUSES) {
    const token = SHIPPED_GROUND_COLOUR.get(status)!;
    for (const level of levels) {
      const base = deliveredForLevel(token, level);
      const family = ownFamily(status);
      const seen = new Set<string>();
      const reads = new Set<string>();
      let worst = Infinity;
      for (let i = 0; i <= GRAIN_REACH_STEPS; i++) {
        const c = grainMixed(base, i / GRAIN_REACH_STEPS, fac);
        seen.add(toHex(c));
        reads.add(nearestStatus(c, table));
        worst = Math.min(worst, marginAgainst(c, family, table).margin);
      }
      out.push({
        status,
        level,
        base: toHex(base),
        baseReadsAs: nearestStatus(base, table),
        baseMargin: marginAgainst(base, family, table).margin,
        reach: [toHex(grainMixed(base, 0, fac)), toHex(grainMixed(base, 1, fac))],
        reachSize: seen.size,
        grainedReadsAs: [...reads].sort(),
        worstMargin: worst,
        holds: [...reads].every((r) => family.has(r)),
      });
    }
  }
  return out;
}

/** The whole answer, in the form the increment asks for. */
export interface GrainClosureVerdict {
  /** Does every reachable grained colour still read as its own status family? */
  admissible: boolean;
  /** The tightest margin anywhere in the grained set, and where it is. */
  worstMargin: number;
  worstAt: string;
  /** The same figure for the UNGRAINED ground, so the grain's cost is a delta rather than a
   *  bare number — the ladder already spends margin, and that spend is not the grain's. */
  ungrainedWorstMargin: number;
  ungrainedWorstAt: string;
  /** Every `(status, rung)` whose reading the grain moves. Empty is the finding. */
  breaks: GrainReadVerdict[];
}

export function grainColourHalfVerdict(
  fac: number = GRAIN_COLOUR_MIX,
  table: Record<string, Rgb255[]> = shippedReaderTable(),
  levels: readonly number[] = shippedLadder(),
): GrainClosureVerdict {
  const readings = grainColourHalfReadings(fac, table, levels);
  let worst = Infinity;
  let worstAt = '';
  let ungrained = Infinity;
  let ungrainedAt = '';
  for (const r of readings) {
    if (r.worstMargin < worst) {
      worst = r.worstMargin;
      worstAt = `${r.status}@${r.level}`;
    }
    if (r.baseMargin < ungrained) {
      ungrained = r.baseMargin;
      ungrainedAt = `${r.status}@${r.level}`;
    }
  }
  return {
    admissible: readings.every((r) => r.holds),
    worstMargin: worst,
    worstAt,
    ungrainedWorstMargin: ungrained,
    ungrainedWorstAt: ungrainedAt,
    breaks: readings.filter((r) => !r.holds),
  };
}

/**
 * THE LARGEST MIX FACTOR EVERY READING SURVIVES — the fork's real shape, and the reason this
 * instrument returns a number instead of a boolean.
 *
 * "May the ground leave the palette" is not one question but a family of them indexed by how far
 * it leaves. If the authored 0.13 is admissible the fork does not arise; if it is not, the
 * honest escalation carries the factor that IS, so the owner is choosing between pictures rather
 * than between a yes and a no.
 */
export function admissibleMixCeiling(
  step = 0.005,
  ceiling = 1.0,
  levels: readonly number[] = shippedLadder(),
): number {
  let best = 0;
  const table = shippedReaderTable();
  for (let fac = step; fac <= ceiling + 1e-9; fac += step) {
    const rounded = Math.round(fac * 10000) / 10000;
    if (!grainColourHalfVerdict(rounded, table, levels).admissible) break;
    best = rounded;
  }
  return best;
}

/**
 * THE FINDING THE PALETTE SEARCH PRODUCED, AS A FUNCTION: which ladder LEVELS a tinted ground may
 * use at all — the contiguous band around flat ground inside which every authored token, tinted at
 * `fac`, still reads as itself.
 *
 * ⚠⚠ IT EXISTS BECAUSE THE INCREMENT'S PREMISE WAS WRONG, and this is the shape of the
 * correction. `move-the-yellow-so-the-ground-texture-can-finish` was written on the reading that
 * *"the cause is the colours, not the texture"* — pull the `proposed`/`building` yellow away from
 * `healthy`'s green and the tint fits. Measured exhaustively on 2026-08-30, it does not: over a
 * 5,000-candidate sweep of the yellow (and a second sweep moving the green with it) NOT ONE
 * palette admits the authored 0.13, and neither do synthetic maximally-separated palettes —
 * red/green/blue/black/white comes back at -9.26, a saturated hue wheel at -4.94, a pure luma
 * ladder at -39.62. Moving the yellow merely hands the binding constraint to another token.
 *
 * THE ACTUAL MECHANISM, and it is a property of the READER rather than of the palette. The reader
 * holds ONE reference per token, at {@link FLAT_GROUND_LEVEL} — what LIT flat ground looks like,
 * which is the only reference a viewer at a glance can be assumed to have. So a rung's margin is
 * spent by the DISTANCE FROM 0.90, in both directions: it peaks at 0.90 (29.3 units on the
 * shipped palette) and falls away to zero near 0.77 and near 1.10. The tint then pushes a further
 * 9-17 weighted units. What binds is therefore how far the LADDER REACHES, not how far apart the
 * colours sit — and the shipped ladder reaches 0.77, with three of its five rungs below the
 * tinted floor this function returns.
 *
 * Returns the band as `[lo, hi]` inclusive on the probe grid, or `null` when no level survives.
 */
export function admissibleLevelBand(
  fac: number = GRAIN_COLOUR_MIX,
  table: Record<string, Rgb255[]> = shippedReaderTable(),
  step = 0.01,
  span: readonly [number, number] = [0.5, 1.5],
): readonly [number, number] | null {
  const ok: number[] = [];
  const [from, to] = span;
  for (const n of levelProbes(from, to, step)) {
    const level = Math.round((from + n * step) * 10000) / 10000;
    if (level > to) break;
    if (levelSurvivesTint(level, fac, table)) ok.push(level);
  }
  if (ok.length === 0) return null;
  // CONTIGUOUS AROUND FLAT GROUND, not merely "every level that passed". The band is what a
  // ladder may span, and a ladder cannot skip a hole: a level reachable only by passing through
  // an inadmissible one is not a ceiling, it is an island past a cliff — the same reading
  // `deepestAdmissibleRung` makes about the shadow rung.
  const flat = FLAT_GROUND_LEVEL;
  if (!ok.includes(Math.round(flat * 10000) / 10000)) return null;
  let lo = flat;
  let hi = flat;
  const has = new Set(ok);
  while (has.has(Math.round((lo - step) * 10000) / 10000)) lo = Math.round((lo - step) * 10000) / 10000;
  while (has.has(Math.round((hi + step) * 10000) / 10000)) hi = Math.round((hi + step) * 10000) / 10000;
  return [lo, hi];
}

/** How many levels {@link admissibleLevelBand} probes between `from` and `to`.
 *
 *  ⚠ EXTRACTED SO THE COUNT IS A VALUE A TEST CAN READ, for the reason `shadow-rung.ts`'s
 *  `probeCount` gives: inside the loop it bounds a loop that also breaks on its own condition, so
 *  a count that is merely too LARGE gives the same answer and no assertion about the answer can
 *  see it. A materialised range rather than an accumulating counter, so a mutated step does not
 *  hang (`mutation-rung-scores-a-hang-as-unproven`). */
export function levelProbes(from: number, to: number, step: number): number[] {
  // ⚠ THE SPAN IS ROUNDED BEFORE THE CEILING. `(0.93 - 0.9) / 0.01` is 3.0000000000000027, whose
  // ceiling is 4 rather than 3 — so an unrounded count is one probe long on most inputs, in the
  // direction that is merely generous and therefore invisible from the band it produces. Rounding
  // makes the count exact, which is what lets a test assert it as a value at all.
  const span = Math.round(((to - from) / step) * 1e6) / 1e6;
  return Array.from({ length: Math.max(0, Math.ceil(span) + 1) }, (_, i) => i);
}

/** Does every authored token, tinted at `fac`, still read as itself when delivered at `level`? */
export function levelSurvivesTint(
  level: number,
  fac: number = GRAIN_COLOUR_MIX,
  table: Record<string, Rgb255[]> = shippedReaderTable(),
): boolean {
  for (const status of SHIPPED_STATUSES) {
    const base = deliveredForLevel(SHIPPED_GROUND_COLOUR.get(status)!, level);
    const family = ownFamily(status);
    for (const i of levelProbes(0, GRAIN_REACH_STEPS, 1)) {
      if (!family.has(nearestStatus(grainMixed(base, i / GRAIN_REACH_STEPS, fac), table))) return false;
    }
  }
  return true;
}

/**
 * THE NORMAL HALF'S OWN QUESTION, which is a DIFFERENT one and is answered here so nobody
 * conflates them.
 *
 * The normal half cannot leave the palette — it perturbs the lambert BEFORE quantisation, so the
 * fragment still writes an authored ramp entry. What it CAN do is move a fragment to a
 * neighbouring RUNG of its own token's ramp. So its honest question is not "is this on-palette"
 * (it is, by construction) but "does any rung of any token read as a foreign status" — a
 * property of the LADDER, which relief and the shipped light already exercise and which is
 * therefore not a cost the grain introduces.
 */
export interface LadderReading {
  status: string;
  level: number;
  delivered: string;
  readsAs: string;
  margin: number;
}

export function ladderReadings(
  table: Record<string, Rgb255[]> = shippedReaderTable(),
  levels: readonly number[] = shippedLadder(),
): LadderReading[] {
  const out: LadderReading[] = [];
  for (const status of SHIPPED_STATUSES) {
    for (const level of levels) {
      const c = deliveredForLevel(SHIPPED_GROUND_COLOUR.get(status)!, level);
      out.push({
        status,
        level,
        delivered: toHex(c),
        readsAs: nearestStatus(c, table),
        margin: readMargin(c, status, table).margin,
      });
    }
  }
  return out;
}

/** Does every ladder rung of every shipped token still read as its own family? */
export function ladderHolds(
  table: Record<string, Rgb255[]> = shippedReaderTable(),
  levels: readonly number[] = shippedLadder(),
): boolean {
  return ladderReadings(table, levels).every((r) => ownFamily(r.status).has(r.readsAs));
}

/** The grain stops as delivered pixels — the two colours the whole question is about, so a
 *  report can print them without importing the field module. */
export function grainStopPixels(): readonly [Rgb255, Rgb255] {
  return grainStops();
}
