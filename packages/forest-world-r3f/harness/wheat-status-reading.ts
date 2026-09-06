// wheat-status-reading.ts — WHAT THE READER MODEL SAYS ABOUT THE WHEAT, driven with the WHEAT's
// reachable colours rather than the grass's, and PRINTED as a report on every rung of the ladder.
//
// ⚠⚠ A NEGATIVE MARGIN HERE IS NOT A REFUSAL, AND THIS MODULE FENCES NOTHING. ADR-0503 retired
// the per-pixel reader model as a fence for layers 2–6, ADR-0506 extended that to layer 1, and
// `paint-every-land-type-arc` is only possible because it did: the yellow admits a grass mix of
// ~0.01 before its darkest rungs walk into a foreign family, which is invisible, and the same
// instrument reads the shipped GREEN at 0.85 as a third `unhealthy`. The number is an INSTRUMENT
// (ADR-0489 D3/D4: proxies of this shape fail in both directions), the outcome test decides —
// look at the sheet and ask whether the island's state still reads — and what this module owes is
// an honest report: the ceiling with the grid step it was walked at, the worst margin at the
// shipped strength, and WHICH family the worst pixel reads as, per rung.
//
// ⚠ QUOTE THE STEP WITH THE CEILING. `admissibleGrassMixCeiling` walks a fixed increment and
// returns the last rung that held, so a coarser step reports a SMALLER ceiling: ADR-0492's yellow
// reads 0.008 / 0.009 / 0.0095 at steps 0.002 / 0.001 / 0.0005. A ceiling without its step is how
// two honest runs come to disagree, and every figure this module returns carries its step.
//
// ⚠ THE READER TABLE IS THE FULL SIX-TOKEN TABLE AT FLAT GROUND, UNPAINTED — the conservative
// choice `grass-status-reading.ts` argues for at length: the wheat must be told apart from an
// UNPAINTED green, clay, slate and grey, and narrowing the table to the painted set would ask
// whether the wheat is distinguishable from itself. It is also the table's known blindness: the
// shipped green is itself painted now, so "reads as healthy" means "nearer the FLAT green token
// than the flat yellow", which a viewer comparing two painted islands never does.
//
// Pure and renderer-free, like its siblings: the reachable set is enumerated from the layer's
// two scalars, never sampled off an island.

import { GRASS_COOL, GRASS_WARM, type RampStop } from '../src/land-grass.js';
import { WHEAT_ANCHORS, WHEAT_STATUS_GATE, wheatColourOf, wheatCool, wheatWarm } from '../src/land-wheat.js';
import { deliveredForLevel, toHex, type Rgb255 } from '../src/shade-ladder.js';
import { readMarginAt } from '../src/shadow-rung.js';
import { marginAgainstRows, ownFamily, shippedLadder, shippedReaderTable } from './grain-status-reading.js';
import {
  GRASS_REACH_D_STEPS,
  GRASS_REACH_T_STEPS,
  grassMixedColour,
  grassLayerVerdict,
  rampChannelSpan,
  reachStepBound,
  statusToken,
} from './grass-status-reading.js';
import { nearestStatusIn, readerRows } from './shadow-ladder.js';

/**
 * EVERY COLOUR THE WHEAT CAN DELIVER for one anchor, deduplicated — the same walk
 * `grassReachableColours` makes over `(t, d)`, on the rebased ramps.
 *
 * ⚠ THE GRASS'S STEP COUNTS ARE REUSED, AND THAT IS CHECKED RATHER THAN ASSUMED: a rebased ramp
 * can span a WIDER delivered range than the green's (a pale anchor's red runs to 250), so
 * {@link wheatReachStepBound} states the widest step for each anchor and the test holds it
 * under one channel unit — which is what makes the walk an enumeration rather than a survey.
 */
export function wheatReachableColours(anchorHex: string): readonly Rgb255[] {
  const seen = new Map<number, Rgb255>();
  for (let i = 0; i <= GRASS_REACH_T_STEPS; i += 1) {
    const t = i / GRASS_REACH_T_STEPS;
    for (let j = 0; j <= GRASS_REACH_D_STEPS; j += 1) {
      const c = wheatColourOf(anchorHex, t, j / GRASS_REACH_D_STEPS);
      seen.set(c.r * 65536 + c.g * 256 + c.b, c);
    }
  }
  return [...seen.values()];
}

/** The widest consecutive-sample step, in delivered channel units, either rebased ramp takes
 *  across `t` at the grass's step count — under 1.0 is what the walk's exhaustiveness rests on. */
export function wheatReachStepBound(anchorHex: string): number {
  return Math.max(reachStepBound(wheatCool(anchorHex), GRASS_REACH_T_STEPS), reachStepBound(wheatWarm(anchorHex), GRASS_REACH_T_STEPS));
}

/** The widest delivered-channel span a rebased ramp covers — reported beside the green's so a
 *  reader can see how far the anchor stretched the recipe's range. */
export function wheatRampSpan(anchorHex: string) {
  return {
    cool: rampChannelSpan(wheatCool(anchorHex)),
    warm: rampChannelSpan(wheatWarm(anchorHex)),
    greenCool: rampChannelSpan(GRASS_COOL),
    greenWarm: rampChannelSpan(GRASS_WARM),
  };
}

/**
 * THE LARGEST WHEAT FACTOR EVERY READING SURVIVES on the wheat's own rows, walked at `step` —
 * `admissibleGrassMixCeiling`'s walk over the wheat's reach set, with the step returned beside
 * the number because the two are one figure.
 *
 * Exhaustive from `step` upward and stops at the first failure, so on the yellow — whose ceiling
 * is a hundredth — it costs a handful of verdicts however fine the grid.
 */
export interface WheatCeiling {
  ceiling: number;
  step: number;
}

export function wheatCeiling(anchorHex: string, step = 0.0005, top = 1.0): WheatCeiling {
  const reach = wheatReachableColours(anchorHex);
  const table = shippedReaderTable();
  const ladder = shippedLadder();
  let best = 0;
  for (let fac = step; fac <= top + 1e-9; fac += step) {
    const rounded = Math.round(fac * 10000) / 10000;
    if (!grassLayerVerdict(rounded, table, ladder, WHEAT_STATUS_GATE, reach).admissible) break;
    best = rounded;
  }
  return { ceiling: best, step };
}

/** Which family each reachable wheat colour reads as, at the shipped strength, over every rung of
 *  the shipped ladder — as SHARES of the reachable set, so a rung's report says not only that a
 *  margin is negative but what the wheat is being read AS when it is. */
export interface ReadShares {
  [status: string]: number;
}

/** The whole report for one rung of the ladder at one strength. */
export interface WheatRungReport {
  id: string;
  anchor: string;
  fac: number;
  /** Distinct delivered colours the wheat can produce on this anchor. */
  reach: number;
  /** The ceiling and the grid step it was walked at — one figure, two numbers. */
  ceiling: WheatCeiling;
  /** The tightest margin over the wheat rows at `fac`, and where. Negative is REPORTED. */
  worstMargin: number;
  worstAt: string;
  /** The delivered colour that produced it, and the family it reads as. */
  worstColour: string;
  worstReadsAs: string;
  /** Shares of `(rung, reachable colour)` pairs reading as each family at `fac`. */
  readsAs: ReadShares;
  /** The same shares at flat ground (the 0.90 rung) only — what the island's lit top face does. */
  readsAsFlat: ReadShares;
  /** The unpainted yellow's own margin at its tightest rung — the ladder's spend, not the layer's. */
  unpaintedWorstMargin: number;
}

/** One rung's report. `fac` is the strength the wheat is judged at — the shipped one. */
export function wheatRungReport(id: string, fac: number, step = 0.0005): WheatRungReport {
  const anchor = WHEAT_ANCHORS.find((a) => a.id === id);
  if (anchor === undefined) throw new Error(`wheat-status-reading: no wheat anchor "${id}"`);
  const reach = wheatReachableColours(anchor.hex);
  const table = shippedReaderTable();
  const rows = readerRows(table);
  const ladder = shippedLadder();
  const verdict = grassLayerVerdict(fac, table, ladder, WHEAT_STATUS_GATE, reach);
  // `building` and `proposed` share a token, so ONE status's walk is the pair's; reading both
  // would double-count identical rows.
  const status = WHEAT_STATUS_GATE[0]!;
  const family = ownFamily(status);
  const token = statusToken(status);
  const counts = new Map<string, number>();
  const flatCounts = new Map<string, number>();
  let worst = Infinity;
  let worstColour = '';
  let worstReadsAs = '';
  for (const level of ladder) {
    const base = deliveredForLevel(token, level);
    for (const w of reach) {
      const c = grassMixedColour(base, w, fac);
      const readsAs = nearestStatusIn(c, rows);
      counts.set(readsAs, (counts.get(readsAs) ?? 0) + 1);
      if (level === FLAT_RUNG) flatCounts.set(readsAs, (flatCounts.get(readsAs) ?? 0) + 1);
      const m = marginAgainstRows(c, family, rows).margin;
      if (m < worst) {
        worst = m;
        worstColour = toHex(c);
        worstReadsAs = readsAs;
      }
    }
  }
  return {
    id,
    anchor: anchor.hex,
    fac,
    reach: reach.length,
    ceiling: wheatCeiling(anchor.hex, step),
    worstMargin: verdict.worstMargin,
    worstAt: verdict.worstAt,
    worstColour,
    worstReadsAs,
    readsAs: shares(counts, reach.length * ladder.length),
    readsAsFlat: shares(flatCounts, reach.length),
    unpaintedWorstMargin: verdict.ungrassedWorstMargin,
  };
}

/** The lit flat-ground rung — the reader's own reference level. */
const FLAT_RUNG = 0.9;

function shares(counts: Map<string, number>, total: number): ReadShares {
  const out: ReadShares = {};
  for (const [status, n] of [...counts.entries()].sort(byStatus)) out[status] = n / total;
  return out;
}

/** Named comparator — the mutation rung cannot attribute a mutant inside an inline arrow. */
function byStatus(a: [string, number], b: [string, number]): number {
  return a[0].localeCompare(b[0]);
}

/** The whole ladder's reports at one strength. */
export function wheatLadderReports(fac: number, step = 0.0005): WheatRungReport[] {
  return WHEAT_ANCHORS.map((a) => wheatRungReport(a.id, fac, step));
}

/**
 * THE SHADOW'S OWN MARGIN ON THE YELLOW at the deep rung the painted islands now wear — the
 * second number this row moves on the yellow, printed beside the paint's. `readMarginAt` is the
 * cast-shadow row's instrument, asked the same question of the yellow token.
 */
export interface WheatShadowMargin {
  token: string;
  derived: number;
  deep: number;
  marginDerived: number;
  marginDeep: number;
}

export function wheatShadowMargin(tokens: readonly string[], derivedRung: number, deepRung: number): WheatShadowMargin {
  const token = statusToken(WHEAT_STATUS_GATE[0]!);
  return {
    token,
    derived: derivedRung,
    deep: deepRung,
    marginDerived: readMarginAt(token, derivedRung, tokens),
    marginDeep: readMarginAt(token, deepRung, tokens),
  };
}

/** The green's report through the SAME walk, for the sheet's comparison column — the shipped grass
 *  at the shipped strength reads negative on this instrument too, and saying so beside the wheat's
 *  figure is what keeps the wheat's from reading as a defect of the wheat. */
export function greenReferenceMargin(fac: number, reach: readonly Rgb255[], statuses: readonly string[]) {
  const v = grassLayerVerdict(fac, shippedReaderTable(), shippedLadder(), statuses, reach);
  return { worstMargin: v.worstMargin, worstAt: v.worstAt };
}

export type { RampStop };
