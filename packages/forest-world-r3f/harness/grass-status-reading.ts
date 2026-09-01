// grass-status-reading.ts — DOES LAYER 1 MOVE WHAT A GROUND PIXEL REPORTS?
//
// ⚠⚠ THE SAME QUESTION `grain-status-reading.ts` ASKS, OF A DIFFERENT LAYER, AND IT MUST BE
// ASKED AGAIN RATHER THAN INHERITED. That module measured the GRAIN's colour half — a mix toward
// two fixed grey-green stops — and found the authored 0.13 inadmissible with a ceiling of 0.006
// once the shadow rung joined the ladder. None of that number carries here: the grass mixes
// toward a different attractor (two 3-stop GREEN ramps spanning ~100 channel units), so it is a
// larger move in a direction that is nearer some tokens and further from others. A layer priced
// against the previous layer's figure is the hazard this arc names first
// (`comparison-baseline-moves-under-the-page`'s sibling), and the remedy is to re-measure.
//
// WHY THE QUESTION IS NOT SETTLED BY ADR-0489. That decision moved the fence from COMPOSITION —
// every ground colour reports something — to OUTCOME: can a viewer still tell what state this
// island is in. What it explicitly does NOT grant (D5) is permission to REMOVE a report from a
// surface that carries one, and the parcel's top face is ~93% of the island's own pixels and is
// exactly such a surface. So the look test is the fence, and this is the arithmetic that keeps
// the look test from being asked blind: it says which mix factors cannot possibly be right,
// before anyone renders anything.
//
// ⚠ AND IT IS A MODEL, NOT A VERDICT. `nearestStatus` holds ONE reference per token at
// `FLAT_GROUND_LEVEL` and asks whether a delivered colour is nearer its own family than any
// other. That is a conservative proxy — a real viewer reads a whole island in context, not one
// swatch against a chart — and ADR-0489 D4 is a direct statement that proxies of this shape
// failed in both directions. It is reported here as a BOUND with its own name on it, and the
// session applying ADR-0489 D3 decides against the picture. What the model is genuinely good for
// is the case it rules out loudly: a fac at which a whole status walks into another's family is
// wrong however good it looks.
//
// EXHAUSTIVE RATHER THAN SAMPLED, on the same argument. The delivered colour is linear in the
// grass colour, and the grass colour is the bilinear image of the unit square in `(t, d)` — the
// base scalar and the remapped drift. Walking that square finely enough that consecutive samples
// cannot differ by a whole channel unit enumerates every colour the layer can deliver. No GPU,
// no island, no sampling error.

import {
  GRASS_COOL,
  GRASS_WARM,
  grassColourOf,
  type RampStop,
} from '../src/land-grass.js';
import { SHADE_LEVELS, deliveredForLevel, type Rgb255 } from '../src/shade-ladder.js';
import {
  SHIPPED_STATUSES,
  marginAgainst,
  ownFamily,
  shippedLadder,
  shippedReaderTable,
} from './grain-status-reading.js';
import { FLAT_GROUND_LEVEL } from './shadow-ladder.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';

/**
 * THE WALK'S RESOLUTION IN EACH AXIS — chosen so consecutive samples cannot differ by a whole
 * channel unit, which is what makes a walk an enumeration rather than a survey.
 *
 * The widest channel excursion across `t` is the cool ramp's green, 0.052 -> 0.432 linear, which
 * is 63 -> 178 delivered: 115 units. 400 steps puts consecutive samples 0.29 units apart. Across
 * `d` the two ramps are at most ~30 units apart at any fixed `t`, so 80 steps is 0.38 units.
 * Both are derived by {@link reachStepBound} rather than asserted, so a retuned ramp moves the
 * claim instead of leaving a stale one.
 */
export const GRASS_REACH_T_STEPS = 400;
export const GRASS_REACH_D_STEPS = 80;

/** The widest delivered-channel span a set of ramp stops covers, in 0..255 units — what the step
 *  counts above are sized against. */
export function rampChannelSpan(stops: readonly RampStop[]): number {
  let widest = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const stop of stops) {
      const v = stop.linear[channel];
      if (v === undefined) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    // Delivered units, not linear ones: the transfer expands the dark end, so a linear span
    // understates the walk's real step size in exactly the direction that would make it coarse.
    widest = Math.max(widest, srgbSpan(lo, hi));
  }
  return widest;
}

/** A linear span expressed in delivered 0..255 units, through the same transfer the layer uses. */
function srgbSpan(lo: number, hi: number): number {
  const at = (v: number): number => 255 * (1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055);
  return at(hi) - at(lo);
}

/** How far apart consecutive samples land, in delivered channel units, for a given step count.
 *  Under 1.0 is what makes the walk exhaustive; the tests assert it rather than trusting it. */
export function reachStepBound(stops: readonly RampStop[], steps: number): number {
  return rampChannelSpan(stops) / steps;
}

/**
 * EVERY COLOUR LAYER 1 CAN DELIVER, deduplicated — the reachable set as delivered sRGB.
 *
 * ⚠ MEMOISED LAZILY rather than at module scope, for the reason `grain-status-reading.ts` gives
 * at length: Stryker files code executed during IMPORT as static coverage attributed to no test,
 * so a module-scope `const REACH = walk()` turns every mutant inside the walk into an UNPROVEN
 * report — which `check:mutation-diff` counts as neither a pass nor a survivor and which reds
 * the rung over well-tested code.
 */
let reachMemo: readonly Rgb255[] | null = null;
export function grassReachableColours(): readonly Rgb255[] {
  if (reachMemo !== null) return reachMemo;
  const seen = new Map<number, Rgb255>();
  for (let i = 0; i <= GRASS_REACH_T_STEPS; i += 1) {
    const t = i / GRASS_REACH_T_STEPS;
    for (let j = 0; j <= GRASS_REACH_D_STEPS; j += 1) {
      const c = grassColourOf(t, j / GRASS_REACH_D_STEPS);
      seen.set(c.r * 65536 + c.g * 256 + c.b, c);
    }
  }
  reachMemo = [...seen.values()];
  return reachMemo;
}

/** The delivered pixel for a status base with the grass mixed in — the pure twin of the shader's
 *  `mix(c, st_grassColour(...), uGrassMix)`. */
export function grassMixedColour(base: Rgb255, grass: Rgb255, fac: number): Rgb255 {
  return {
    r: Math.round(base.r + (grass.r - base.r) * fac),
    g: Math.round(base.g + (grass.g - base.g) * fac),
    b: Math.round(base.b + (grass.b - base.b) * fac),
  };
}

/** One `(status, ladder rung)` base, and what layer 1 can do to its reading. */
export interface GrassReadVerdict {
  status: string;
  level: number;
  /** The UNGRASSED delivered pixel — what the shipped ground draws today. */
  base: Rgb255;
  /** That pixel's own reading margin, so the layer's cost is a delta rather than a bare number:
   *  the ladder already spends margin, and that spend is not this layer's. */
  baseMargin: number;
  /** The tightest margin anywhere in the grassed set for this base. */
  worstMargin: number;
  /** The grass colour that produced it — so a break can be looked at rather than only counted. */
  worstGrass: Rgb255;
  /** Does every reachable colour for this base still read as its own family? */
  holds: boolean;
}

/**
 * The whole walk, for one mix factor.
 *
 * ⚠ THE LADDER IS THE SHIPPED ONE INCLUDING THE SHADOW RUNG, which is the correction
 * `grain-status-reading.ts` records paying for: an instrument that keeps asking about the
 * four-rung ladder does not fail, it answers a question nobody is asking any more. The shadow
 * rung sits BELOW the four, which is precisely where the tightest margin already lives.
 */
export function grassLayerReadings(
  fac: number,
  table: Record<string, Rgb255[]> = shippedReaderTable(),
  levels: readonly number[] = shippedLadder(),
): GrassReadVerdict[] {
  const reach = grassReachableColours();
  const out: GrassReadVerdict[] = [];
  for (const status of SHIPPED_STATUSES) {
    const family = ownFamily(status);
    for (const level of levels) {
      const base = deliveredForLevel(statusToken(status), level);
      const baseMargin = marginAgainst(base, family, table).margin;
      let worst = Infinity;
      let worstGrass: Rgb255 = base;
      for (const grass of reach) {
        const m = marginAgainst(grassMixedColour(base, grass, fac), family, table).margin;
        if (m < worst) {
          worst = m;
          worstGrass = grass;
        }
      }
      out.push({
        status,
        level,
        base,
        baseMargin,
        worstMargin: worst,
        worstGrass,
        holds: worst > 0,
      });
    }
  }
  return out;
}

/** The authored ground token for a status, read from the same map the shipped canvas hands the
 *  material. A named function with an explicit refusal rather than a `?? ''` fallback: an empty
 *  string reaches `parseHex` and delivers BLACK, which would show up as a status that reads
 *  perfectly and is the wrong colour. */
export function statusToken(status: string): string {
  const token = SHIPPED_GROUND_COLOUR.get(status);
  if (token === undefined) throw new Error(`grass-status-reading: unknown status ${status}`);
  return token;
}

/** The whole answer for one fac, in the shape the increment asks for. */
export interface GrassClosureVerdict {
  admissible: boolean;
  worstMargin: number;
  worstAt: string;
  ungrassedWorstMargin: number;
  ungrassedWorstAt: string;
  breaks: GrassReadVerdict[];
}

export function grassLayerVerdict(
  fac: number,
  table: Record<string, Rgb255[]> = shippedReaderTable(),
  levels: readonly number[] = shippedLadder(),
): GrassClosureVerdict {
  const readings = grassLayerReadings(fac, table, levels);
  let worst = Infinity;
  let worstAt = '';
  let plain = Infinity;
  let plainAt = '';
  for (const r of readings) {
    if (r.worstMargin < worst) {
      worst = r.worstMargin;
      worstAt = `${r.status}@${r.level}`;
    }
    if (r.baseMargin < plain) {
      plain = r.baseMargin;
      plainAt = `${r.status}@${r.level}`;
    }
  }
  return {
    admissible: readings.every(holdsReading),
    worstMargin: worst,
    worstAt,
    ungrassedWorstMargin: plain,
    ungrassedWorstAt: plainAt,
    breaks: readings.filter(isBreak),
  };
}

/** Named predicates rather than inline arrows — the mutation rung cannot attribute a mutant
 *  inside a callback body to the test that kills it. */
function holdsReading(r: GrassReadVerdict): boolean {
  return r.holds;
}
function isBreak(r: GrassReadVerdict): boolean {
  return !r.holds;
}

/**
 * THE LARGEST MIX FACTOR EVERY READING SURVIVES — the number the crossing decision is made
 * against, and the reason this instrument returns a value rather than a boolean.
 *
 * "May the ground wear the approved grass" is not one question but a family of them indexed by
 * how much of it. If a visible amount is admissible the layer simply crosses; if it is not, the
 * honest report carries the factor that IS, so the owner is looking at pictures rather than at a
 * yes and a no.
 */
export function admissibleGrassMixCeiling(
  step = 0.005,
  ceiling = 1.0,
  levels: readonly number[] = shippedLadder(),
): number {
  const table = shippedReaderTable();
  let best = 0;
  for (let fac = step; fac <= ceiling + 1e-9; fac += step) {
    const rounded = Math.round(fac * 10000) / 10000;
    if (!grassLayerVerdict(rounded, table, levels).admissible) break;
    best = rounded;
  }
  return best;
}

/**
 * THE SAME CEILING AGAINST THE LIT LADDER ALONE — the four rungs, without the shadow's.
 *
 * ⚠ IT IS REPORTED BESIDE THE SHIPPED FIGURE RATHER THAN INSTEAD OF IT, because the difference
 * between the two IS the finding `grain-status-reading.ts` recorded: the binding constraint is
 * how far the LADDER REACHES, not how far apart the colours sit. The reader holds one reference
 * per token at flat ground (0.90), so a rung's margin is spent by its distance from 0.90 in both
 * directions — and the shadow rung is the furthest. A layer that is inadmissible only because of
 * the darkest rung is a different finding from one that breaks the lit ground, and a single
 * number cannot tell them apart.
 */
export function admissibleGrassMixCeilingLit(step = 0.005, ceiling = 1.0): number {
  return admissibleGrassMixCeiling(step, ceiling, LIT_LADDER());
}

/** The lit ladder — `SHADE_LEVELS`, memoised lazily for the import-time reason above. */
let litMemo: readonly number[] | null = null;
function LIT_LADDER(): readonly number[] {
  return (litMemo ??= [...SHADE_LEVELS]);
}

/**
 * HOW MUCH COLOUR THE LAYER ADDS, at a given fac — the arc's own gap metric applied to the
 * reachable set rather than to a picture.
 *
 * Colour families are 5 bits per channel, which is the quantisation ADR-0490's context table
 * uses (shipped 9, approved 36). A picture weights them by area and this does not, so the two
 * numbers are not the same measurement and are never compared: this one answers "how many
 * families can this layer reach at all", which is an upper bound the render then spends.
 */
export function grassFamiliesReachable(fac: number, levels: readonly number[] = shippedLadder()): number {
  const families = new Set<number>();
  const reach = grassReachableColours();
  for (const status of SHIPPED_STATUSES) {
    for (const level of levels) {
      const base = deliveredForLevel(statusToken(status), level);
      for (const grass of reach) {
        const c = grassMixedColour(base, grass, fac);
        families.add(((c.r >> 3) << 10) | ((c.g >> 3) << 5) | (c.b >> 3));
      }
    }
  }
  return families.size;
}

/** The two ramps' delivered ENDPOINTS, for the evidence sheet — the layer's palette stated as
 *  four pixels rather than as six linear triples nobody can picture. */
export interface GrassRampEndpoints {
  coolDark: Rgb255;
  coolLight: Rgb255;
  warmDark: Rgb255;
  warmLight: Rgb255;
}

export function grassRampEndpoints(): GrassRampEndpoints {
  const first = (stops: readonly RampStop[]): number => stops[0]!.at;
  const last = (stops: readonly RampStop[]): number => stops[stops.length - 1]!.at;
  return {
    coolDark: grassColourOf(first(GRASS_COOL), 0),
    coolLight: grassColourOf(last(GRASS_COOL), 0),
    warmDark: grassColourOf(first(GRASS_WARM), 1),
    warmLight: grassColourOf(last(GRASS_WARM), 1),
  };
}

/**
 * WHICH LADDER LEVELS A GRASSED GROUND MAY USE AT ALL — the contiguous band around flat ground
 * inside which every authored token, grassed at `fac`, still reads as itself.
 *
 * ⚠⚠ IT IS HERE BECAUSE THE CEILING ALONE MISNAMES THE CONSTRAINT, and misnames it in the
 * direction that reads as "this layer is impossible". `admissibleGrassMixCeiling` returns 0.005
 * on the shipped ladder and 0.075 on the lit one — a fifteen-fold difference produced by ONE
 * extra rung — because the reader holds a single reference per token at {@link
 * FLAT_GROUND_LEVEL} and a rung's margin is therefore spent by its DISTANCE from 0.90 in both
 * directions. What binds is how far the LADDER REACHES, not how far apart the colours sit; the
 * same mechanism `grain-status-reading.ts` measured for the grain.
 *
 * So the real fork is not "grass or no grass". It is: at a given amount of grass, how deep may
 * the shading go. This returns that as `[lo, hi]` on the probe grid, or `null` when no level
 * survives — which is what turns an impossibility into a priced trade.
 */
export function admissibleGrassLevelBand(
  fac: number,
  table: Record<string, Rgb255[]> = shippedReaderTable(),
  step = 0.01,
  span: readonly [number, number] = [0.5, 1.5],
): readonly [number, number] | null {
  const ok = new Set<number>();
  const [from, to] = span;
  const count = Math.round(((to - from) / step) * 1e6) / 1e6;
  for (let n = 0; n <= Math.ceil(count); n += 1) {
    const level = Math.round((from + n * step) * 10000) / 10000;
    if (level > to) break;
    if (grassLevelSurvives(level, fac, table)) ok.add(level);
  }
  const flat = Math.round(FLAT_GROUND_LEVEL * 10000) / 10000;
  if (!ok.has(flat)) return null;
  let lo = flat;
  let hi = flat;
  while (ok.has(Math.round((lo - step) * 10000) / 10000)) lo = Math.round((lo - step) * 10000) / 10000;
  while (ok.has(Math.round((hi + step) * 10000) / 10000)) hi = Math.round((hi + step) * 10000) / 10000;
  return [lo, hi];
}

/** Does EVERY token, delivered at `level` and grassed at `fac`, still read as its own family? */
export function grassLevelSurvives(
  level: number,
  fac: number,
  table: Record<string, Rgb255[]> = shippedReaderTable(),
): boolean {
  const reach = grassReachableColours();
  for (const status of SHIPPED_STATUSES) {
    const family = ownFamily(status);
    const base = deliveredForLevel(statusToken(status), level);
    for (const grass of reach) {
      if (marginAgainst(grassMixedColour(base, grass, fac), family, table).margin <= 0) return false;
    }
  }
  return true;
}
