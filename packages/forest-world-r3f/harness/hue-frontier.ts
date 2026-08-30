// hue-frontier.ts — HOW MUCH ROOM THE LAND'S FIVE COLOURS ACTUALLY HAVE.
//
// THE INCREMENT: `pull-the-four-land-colours-apart-in-hue` on
// `adopt-the-land-into-the-shipped-map-arc`. ADR-0414 D4 requires the land's status colours to
// differ by more than brightness. ADR-0462 narrowed the remaining defect to ONE pair on TWO rungs:
// `proposed`'s yellow at its two darkest lighting steps reads as `mapped`'s brown — unproven
// greenfield reading as inherited brownfield.
//
// The obvious move is "re-author the brown". This module is what says whether that move EXISTS,
// rather than assuming it does and picking one that looks nice.
//
// ⚠⚠ TWO WAYS THIS SEARCH WENT WRONG BEFORE IT WENT RIGHT, both recorded because both are cheap
// to repeat and neither announces itself.
//
// 1. RANK PAIRS BY RATIO, NOT BY DISTANCE. `colourPairs` returns rows sorted by DISTANCE, and the
//    obvious move is to take `rows[0]` as "the worst pair". It is not: every pair is read against
//    its OWN bar, and a large distance under a large bar is tighter than a small distance under a
//    small one. Ranking by distance found 1,196 "clearing" candidates on the first run — all of
//    them dusty pinks, all of them scored on a pair that was not the binding one. `tightestPair`
//    below ranks by ratio, which is the only ordering the bar makes meaningful.
//
// 2. SEARCH WIDE BEFORE CONCLUDING NOTHING EXISTS. Corrected for (1), a sweep of hue −14…+6,
//    saturation ×0.95…×1.35, value ×0.62…×1.02 returned ZERO clearing candidates, peaking at
//    0.966 — which reads exactly like "the vocabulary has no room". Widening to hue −20…+8,
//    saturation ×0.9…×1.4, value ×0.6…×1.04 returns 207. The first conclusion was a property of
//    the search box, not of the palette, and it was one assertion away from being published as a
//    finding. `sweepFamily` returns EVERY candidate including its failures, so a frontier that
//    stops short can be told apart from one that was never searched.
//
// ⚠ THE BAR CAN IN PRINCIPLE BE GAMED, AND THE RATCHET IS HERE FOR THAT — but on today's
// vocabulary it is INERT, and saying so is the point. `status-vocabulary.ts` reads every pair
// against a control in the same run (`largestRungStep`, the biggest distance ONE lighting rung
// moves a single token), which is the right shape and is why no absolute number appears in that
// file. But the bar is computed FROM the families being compared, so desaturating a family shrinks
// its own rung step and lowers the bar it must clear. The ratchet closes that: per pair,
// `max(today's bar, the candidate's own bar)` — a candidate may RAISE a bar and never lower one.
// Measured, it changes ZERO verdicts here — it reports a tighter ratio than a candidate's own bars
// would on most of them, but never turns a pass into a fail, because the pair that BINDS is
// yellow/brown and its bar is yellow's own rung step, which no edit to brown can move. Moving a
// number and deciding an outcome are different claims and this is entitled to the weaker one. It
// is kept as a cheap guard for the next family someone sweeps, not claimed as a save.
//
// Pure and browser-free: every figure comes from `status-vocabulary.ts`'s existing measures, and
// nothing here re-derives a distance.

import { colourPairs, foreignColourReads, STATUS_COLOUR, type LandColour } from './status-vocabulary.js';
import { SHADE_LEVELS, STATUS_TOKENS, parseHex, type StatusFamily } from './palette-band.js';
import { colourDistance } from './ground-cover.js';

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * Rotate a hex's hue by `deg` and scale its saturation and value, in HSV.
 *
 * ⚠ HSV, NOT the luma-weighted space every DISTANCE here is measured in. That is deliberate and the
 * two jobs are different: HSV is a way to GENERATE a family of candidates that stay recognisably
 * "the same colour, moved", while the verdict on any candidate is taken in the arc's own space by
 * `status-vocabulary.ts`. Generating in the measurement space would produce colours no one would
 * author; measuring in the generation space would produce numbers that look comparable to this
 * track's published figures and are not.
 */
export function warpHex(hex: string, deg: number, satMul: number, valMul: number): string {
  const { r, g, b } = parseHex(hex);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === R) h = ((G - B) / d) % 6;
    else if (mx === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const s = Math.min(1, (mx === 0 ? 0 : d / mx) * satMul);
  const v = Math.min(1, mx * valMul);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const seg = Math.floor(h / 60) % 6;
  const rgb: readonly [number, number, number] =
    seg === 0 ? [c, x, 0]
    : seg === 1 ? [x, c, 0]
    : seg === 2 ? [0, c, x]
    : seg === 3 ? [0, x, c]
    : seg === 4 ? [x, 0, c]
    : [c, 0, x];
  return toHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

/** The same warp over a whole family. ⚠ `wheat` is NOT warped — it is the shared override every
 *  family points at, so moving it would move five colours at once while claiming to move one. */
export function warpFamily(f: StatusFamily, deg: number, satMul: number, valMul: number): StatusFamily {
  return {
    top: f.top.map((t) => warpHex(t, deg, satMul, valMul)),
    wheat: f.wheat,
    side: warpHex(f.side, deg, satMul, valMul),
  };
}

/** How far a candidate family moved from the authored one — the thing to MINIMISE, because the
 *  authored colours are what the owner already approved. */
export function familyMovement(a: StatusFamily, b: StatusFamily): number {
  let m = 0;
  for (let i = 0; i < a.top.length; i++) {
    m = Math.max(m, colourDistance(parseHex(a.top[i]!), parseHex(b.top[i]!)));
  }
  return Math.max(m, colourDistance(parseHex(a.side), parseHex(b.side)));
}

/**
 * The bar for each pair, keyed `a/b` — the floor the ratchet holds.
 *
 * ⚠ IT TAKES THE TABLE RATHER THAN READING THE LIVE ONE, because "today" moved. This sweep's
 * published figures are all statements about the palette ADR-0462 shipped, and the clay it picked
 * has since landed on `STATUS_TOKENS`. A default-argument read of the live table would quietly
 * re-baseline every recorded figure onto the answer's own palette — the search would still pass,
 * having become a different search. `status-vocabulary.ts`'s frozen `ADR0462_STATUS_TOKENS` is
 * what the reproduction tests pass here.
 */
export function todaysBars(
  tokens: ReadonlyMap<string, StatusFamily> = STATUS_TOKENS,
  vocab: ReadonlyMap<string, LandColour> = STATUS_COLOUR,
  ladder: readonly number[] = SHADE_LEVELS,
): ReadonlyMap<string, number> {
  return new Map(colourPairs(tokens, vocab, ladder).map((p) => [`${p.a}/${p.b}`, p.step] as const));
}

export interface Tightest {
  /** distance / ratcheted bar for the closest pair. Below 1 means that pair collides. */
  ratio: number;
  pair: string;
  /** Delivered pixels that read as the wrong colour — `status-vocabulary.ts`'s verdict instrument. */
  foreignReads: readonly string[];
}

/**
 * The tightest pair in a candidate vocabulary, against the RATCHETED bar.
 *
 * ⚠ Two numbers, not one, and they answer different questions. `ratio` is the separation table's
 * question — could a reader confuse these two colours across the lighting ladder. `foreignReads` is
 * the VERDICT instrument — does a delivered pixel actually get read as the wrong colour. A
 * candidate can carry zero foreign reads while sitting just under a bar, and reporting only one of
 * them would make that case invisible in whichever direction the reporter preferred.
 */
export function tightestPair(
  tokens: ReadonlyMap<string, StatusFamily>,
  bars: ReadonlyMap<string, number> = todaysBars(),
  vocab: ReadonlyMap<string, LandColour> = STATUS_COLOUR,
  ladder: readonly number[] = SHADE_LEVELS,
): Tightest {
  let ratio = Infinity;
  let pair = '';
  for (const p of colourPairs(tokens, vocab, ladder)) {
    const bar = Math.max(p.step, bars.get(`${p.a}/${p.b}`) ?? 0);
    const r = bar === 0 ? Infinity : p.distance / bar;
    if (r < ratio) {
      ratio = r;
      pair = `${p.a}/${p.b}`;
    }
  }
  return { ratio, pair, foreignReads: foreignColourReads(tokens, vocab, undefined, ladder) };
}

/** One point on the frontier. */
export interface Candidate extends Tightest {
  deg: number;
  sat: number;
  val: number;
  family: StatusFamily;
  movement: number;
}

/** The sweep's axes — declared as data so the report can state what was searched rather than
 *  leaving the reader to infer coverage from the results. */
export interface Sweep {
  deg: readonly number[];
  sat: readonly number[];
  val: readonly number[];
}

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  // ⚠ Accumulating `v += step` drifts on floats and silently drops the last rung; indexing does not.
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) out.push(from + i * step);
  return out;
};

export const DEFAULT_SWEEP: Sweep = {
  deg: range(-20, 8, 1),
  sat: range(0.9, 1.4, 0.05),
  val: range(0.6, 1.04, 0.02),
};

/** Every candidate for ONE family, measured. Nothing is filtered here — a frontier with its
 *  failures removed cannot show that the best point falls short, which is this sweep's finding. */
export function sweepFamily(
  status: string,
  sweep: Sweep = DEFAULT_SWEEP,
  tokens: ReadonlyMap<string, StatusFamily> = STATUS_TOKENS,
  ladder: readonly number[] = SHADE_LEVELS,
): Candidate[] {
  const base = tokens.get(status);
  if (!base) throw new Error(`hue-frontier: no token family for status "${status}"`);
  // ⚠ The ratchet's floor comes from the table BEING SWEPT, never from the live palette. Sweeping
  // a frozen table while ratcheting against a live one mixes two vocabularies into one verdict.
  // ⚠ AND THE SAME ARGUMENT APPLIES TO THE LADDER, which is why it is a parameter here too: a
  // reproduction of a search run on the four-rung ladder is not a reproduction if it is re-run on
  // the nine-rung one. Every ratio in this module is read against a family's largest lighting
  // step, and refining the ladder shrinks that step — so the whole table moves without a colour
  // changing.
  const bars = todaysBars(tokens, STATUS_COLOUR, ladder);
  const out: Candidate[] = [];
  for (const deg of sweep.deg) {
    for (const sat of sweep.sat) {
      for (const val of sweep.val) {
        const family = warpFamily(base, deg, sat, val);
        const candidate = new Map(tokens);
        candidate.set(status, family);
        out.push({
          deg,
          sat,
          val,
          family,
          movement: familyMovement(base, family),
          ...tightestPair(candidate, bars, STATUS_COLOUR, ladder),
        });
      }
    }
  }
  return out;
}
