// status-vocabulary.ts — WHICH COLOUR EACH STATE WEARS, and the instrument that says whether a
// reader can tell two of them apart. Pure, browser-free, provable under `bun test`.
//
// THE DECISION THIS CARRIES (ADR-0462, owner-settled 2026-08-27). The land's colour vocabulary is
// FIVE COLOURS OVER SIX STATES:
//
//     green   healthy
//     yellow  proposed  AND  building      <- one token, two states, deliberately
//     brown   mapped
//     black   unhealthy
//     grey    unknown  (no data, or error)
//
// Verbatim, in two parts. First: *"get rid of building and unknown they dont need colors because i
// have yet to see them ever get rendered. forgot about mapped which should be brown."* Then, on
// being shown that both ARE rendered: *"if something is building just color it yellow because its
// basicly the same as proposed, theres no value add, we can already see if wisps are working on it
// or not. Now that you mention it I have seen grey capabilities for no data or error and I dont
// mind that, so maybe error or some other edge case can color grey which can be the 'unknown'
// label."*
//
// ⚠ THE TWO STATES MOVE IN OPPOSITE DIRECTIONS AND IT IS EASY TO GET BACKWARDS. `building` MERGES
// into `proposed`'s yellow — it does not lose a colour and fall through to anything. `unknown`
// GAINS one — it had none, and fell through to the base grass family.
//
// WHY THE LIVE-WORK SIGNAL IS NOT BEING GIVEN UP, since that is the objection this decision had to
// answer: the wisp already carries it (ADR-0200 / ADR-0142 — a session's work claim IS the orbiting
// wisp on the map). The land was spending a sixth colour restating something it was not the one
// saying. Do not re-raise it.
//
// WHY THIS IS AN INSTRUMENT AND NOT JUST A TABLE. The land's colour IS a capability's status
// (ADR-0392 D5 / ADR-0398 D7), so two states that a reader cannot tell apart is the map reporting a
// proof state no capability holds — the one way this arc's work can do real harm. So the vocabulary
// is authored against a measurement and the number is published beside the picture, exactly as
// `ground-cover.ts` does for scenery colours.
//
// ONE DISTANCE, AND IT IS THE ARC'S OWN. Every figure here is in the luma-weighted space the
// compositor's quantiser snaps in (`ground-cover.ts` `LUMA_WEIGHTS`, from
// `chapter2-land-interior-fork-2026-08-15/compose.py` `W_LUMA`), NEVER CIELAB. A dE from another
// space would print numbers that LOOK comparable to this track's published 3.33 / 4.32 / 13.98 and
// are not.

import {
  SHADE_LEVELS,
  STATUS_TOKENS,
  deliveredForLevel,
  parseHex,
  type Rgb255,
  type StatusFamily,
} from './palette-band.js';
import { colourDistance, luma } from './ground-cover.js';
import { FLAT_GROUND_LEVEL, nearestStatus } from './shadow-ladder.js';

/** Re-exported so a caller reasoning about the VOCABULARY never has to reach past it into the
 *  palette module for the shape of one entry. `palette-band.ts` owns the definition. */
export type { StatusFamily };

/** The five colours the land speaks. NOT six — `proposed` and `building` share one. */
export type LandColour = 'green' | 'yellow' | 'brown' | 'black' | 'grey';

/** Every colour, in the order a legend would read them: unstarted → in flight → proven → wrong →
 *  unknown. */
export const LAND_COLOURS: readonly LandColour[] = ['yellow', 'brown', 'green', 'black', 'grey'];

/**
 * WHICH COLOUR EACH STATE WEARS — the vocabulary as data rather than as prose.
 *
 * It is hand-authored here, UPSTREAM of `STATUS_TOKENS`, and deliberately not derived from it by
 * comparing hexes. A derived map would say "these two states share a colour" precisely because
 * their tokens happened to be equal, so it could never catch the case it exists to catch — a later
 * edit that pulls `building` back off `proposed`'s token would silently redraw the map as a
 * six-colour one and this table would agree with it. An expectation computed from its subject
 * cannot fail. `status-vocabulary.test.ts` asserts the two agree, which is a real two-place edit.
 */
export const STATUS_COLOUR: ReadonlyMap<string, LandColour> = new Map([
  ['healthy', 'green'],
  ['proposed', 'yellow'],
  ['building', 'yellow'],
  ['mapped', 'brown'],
  ['unhealthy', 'black'],
  ['unknown', 'grey'],
] as const);

/** The colour a state wears. Throws on an unknown state rather than defaulting — a status with no
 *  authored colour is a corpus error, and defaulting it would paint it as something. */
export function colourOfStatus(status: string): LandColour {
  const c = STATUS_COLOUR.get(status);
  if (c === undefined) throw new Error(`status-vocabulary: no authored colour for status ${JSON.stringify(status)}`);
  return c;
}

/** The states wearing one colour, sorted. `yellow` returns two; every other colour returns one. */
export function statusesWearing(colour: LandColour, vocab: ReadonlyMap<string, LandColour> = STATUS_COLOUR): string[] {
  return [...vocab.keys()].filter((s) => vocab.get(s) === colour).sort();
}

/**
 * THE PALETTE AS IT STOOD BEFORE ADR-0462 — frozen, hand-transcribed, never re-derived.
 *
 * It has two jobs and both need it to be a literal rather than a copy of anything live.
 *
 * FIRST, IT IS THE PROVENANCE ANCHOR FOR `shadow-ladder.ts`. That module's port of the
 * author-time compositor's reader model is held to be the same instrument by reproducing THREE
 * independently recorded configurations of the shadow ceiling (PR #1385's, PR #1407's folded one,
 * and the one-token collapse). Those figures were measured against THESE tokens. Read the live
 * table instead and the reproduction stops being a reproduction the moment the palette moves —
 * which it just did — and the only evidence that the metric is the metric evaporates silently,
 * looking exactly like a test that still passes.
 *
 * SECOND, IT IS THE **BEFORE** ARM of the owner's comparison. The comparison page draws each state
 * twice, once from here and once from `STATUS_TOKENS`, so "what changed" is a picture rather than a
 * memory.
 *
 * Transcribed 2026-08-27 from `palette-band.ts` at commit c2b11a2c, itself transcribed from the
 * app's `.hex-territory.st-<status>` blocks. It is HISTORY: it is never reconciled, never updated,
 * and a later palette change must not touch it.
 */
export const LEGACY_STATUS_TOKENS: ReadonlyMap<string, StatusFamily> = new Map([
  ['proposed', { top: ['#d8c069', '#ccb258', '#e2cf7e'], wheat: '#d6b271', side: '#a8914a' }],
  ['building', { top: ['#dcab52', '#d09a42', '#e6bc68'], wheat: '#d6b271', side: '#aa7d33' }],
  ['healthy', { top: ['#8cb85e', '#7dab50', '#9ac570'], wheat: '#d6b271', side: '#648244' }],
  ['mapped', { top: ['#b3946a', '#a68557', '#bda278'], wheat: '#d6b271', side: '#85683f' }],
  ['unhealthy', { top: ['#57544a', '#4a473e', '#635f52'], wheat: '#6f6852', side: '#37352c' }],
  // `unknown` had NO `.hex-territory.st-unknown` block — it kept the base grass family, and the
  // hexes here are that family as the cosy-island body carries it. Its absence IS the defect
  // ADR-0462 fixes, so the frozen table has to record what it actually delivered.
  ['unknown', { top: ['#a9c87f', '#9fc174', '#b2cf8b'], wheat: '#d6b271', side: '#87985f' }],
]);

// ---------------------------------------------------------------------------
// The separation instrument
// ---------------------------------------------------------------------------

/**
 * THE CROSS-RUNG MINIMUM — the closest two tokens come across the WHOLE lit ladder, not at matched
 * light.
 *
 * ⚠ IT IS A DIFFERENT QUESTION FROM `ground-cover.ts`'s `separationOf`, AND BOTH ARE RIGHT.
 * Matched condition answers *can a reader tell these two parcels apart, side by side, under one
 * light* — the comparison a viewer actually makes. This one answers *can LIGHTING slide one parcel
 * onto the other's colour*, which is the failure ADR-0414 D4 is about: two tints separated mainly
 * by brightness collide as soon as the shader's ladder spans the gap between them. The ladder runs
 * 0.78..1.00, so any pair whose channels stand in a ratio inside that span has a lighting condition
 * at which they deliver the same pixel, however far apart they look in a swatch.
 *
 * The lit ladder only. The SHADOW rung is not swept here because it is not reachable by lighting —
 * `shadow-ladder.ts` derives it precisely as the deepest level at which no rendered status reads as
 * another, so its admissibility is that module's own guarantee rather than this one's to restate.
 */
export function crossRungSeparation(a: string, b: string): { distance: number; at: string } {
  let out = { distance: Infinity, at: '' };
  for (const la of SHADE_LEVELS) {
    for (const lb of SHADE_LEVELS) {
      const d = colourDistance(deliveredForLevel(a, la), deliveredForLevel(b, lb));
      if (d < out.distance) out = { distance: d, at: `${a} at ${la} vs ${b} at ${lb}` };
    }
  }
  return out;
}

/**
 * HOW MUCH OF TWO TOKENS' DIFFERENCE IS **NOT** BRIGHTNESS — `b` rescaled to `a`'s luma, then
 * measured against `a`. Exactly zero when one is a pure brightness variant of the other.
 *
 * This is the diagnostic, never the verdict, and the distinction is `shadow-ladder.ts`'s own
 * (`luma` there is "reported for the INTUITION ... `nearestStatus` is the verdict"). What makes it
 * worth printing is that it PREDICTS the verdict: measured over candidate greys, a residual near
 * zero collapses the cross-rung minimum with it — `#7a7668` residual 0.10 / cross-rung 7.90,
 * `#6d6a5f` residual 0.68 / cross-rung 1.01 — while the authored slate's 12.54 holds the pair
 * 43.53 apart. It is the mechanism behind ADR-0414 D4 stated as a number.
 */
export function chromaticSeparation(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const lb = luma(cb);
  if (lb === 0) return colourDistance(ca, cb);
  const m = luma(ca) / lb;
  return colourDistance(ca, { r: cb.r * m, g: cb.g * m, b: cb.b * m });
}

/** The largest distance ONE lighting step moves a single token — the control every separation
 *  figure here is read against, so no bar in this file is a number somebody picked. */
export function largestRungStep(token: string): number {
  let out = 0;
  for (let i = 1; i < SHADE_LEVELS.length; i++) {
    const d = colourDistance(
      deliveredForLevel(token, SHADE_LEVELS[i - 1]!),
      deliveredForLevel(token, SHADE_LEVELS[i]!),
    );
    if (d > out) out = d;
  }
  return out;
}

/** Every `top` token wearing one colour, across every state that wears it. */
export function tokensOfColour(
  colour: LandColour,
  tokens: ReadonlyMap<string, StatusFamily> = STATUS_TOKENS,
  vocab: ReadonlyMap<string, LandColour> = STATUS_COLOUR,
): string[] {
  const out: string[] = [];
  for (const status of statusesWearing(colour, vocab)) {
    for (const t of tokens.get(status)?.top ?? []) if (!out.includes(t)) out.push(t);
  }
  return out;
}

export interface ColourPair {
  a: LandColour;
  b: LandColour;
  /** The cross-rung minimum between the two colours' families. */
  distance: number;
  /** The largest single lighting step either family takes — the bar this pair is read against. */
  step: number;
  at: string;
}

/**
 * EVERY PAIR OF DISTINCT COLOURS, closest first — the vocabulary's own separation table.
 *
 * Pairs of COLOURS, never of statuses: `proposed` against `building` is not a pair at all now, it
 * is one colour asked about twice. An instrument that still enumerated statuses would report a
 * distance of zero for them and read as a catastrophic collision, which is the instrument
 * misunderstanding the decision rather than measuring it.
 */
export function colourPairs(
  tokens: ReadonlyMap<string, StatusFamily> = STATUS_TOKENS,
  vocab: ReadonlyMap<string, LandColour> = STATUS_COLOUR,
): ColourPair[] {
  const colours = LAND_COLOURS.filter((c) => tokensOfColour(c, tokens, vocab).length > 0);
  const rows: ColourPair[] = [];
  for (let i = 0; i < colours.length; i++) {
    for (let j = i + 1; j < colours.length; j++) {
      const as = tokensOfColour(colours[i]!, tokens, vocab);
      const bs = tokensOfColour(colours[j]!, tokens, vocab);
      let best = { distance: Infinity, at: '' };
      let step = 0;
      for (const ta of as) {
        step = Math.max(step, largestRungStep(ta));
        for (const tb of bs) {
          step = Math.max(step, largestRungStep(tb));
          const c = crossRungSeparation(ta, tb);
          if (c.distance < best.distance) best = c;
        }
      }
      rows.push({ a: colours[i]!, b: colours[j]!, distance: best.distance, step, at: best.at });
    }
  }
  return rows.sort((x, y) => x.distance - y.distance);
}

/** The closest two DIFFERENT colours come — the vocabulary's weakest link. */
export function worstColourPair(
  tokens: ReadonlyMap<string, StatusFamily> = STATUS_TOKENS,
  vocab: ReadonlyMap<string, LandColour> = STATUS_COLOUR,
): ColourPair {
  const rows = colourPairs(tokens, vocab);
  const first = rows[0];
  if (first === undefined) throw new Error('status-vocabulary: no colour pairs to compare');
  return first;
}

/**
 * WHERE A DELIVERED PIXEL READS AS THE WRONG COLOUR — the verdict instrument, and a reuse of
 * `shadow-ladder.ts`'s ported reader model rather than a second metric.
 *
 * Each colour's representative `top[0]` is delivered at every lit rung and handed to a reader whose
 * reference swatches are those same colours at FLAT GROUND's own rung. A result naming a different
 * colour is the map reporting a state the capability does not hold.
 *
 * ⚠ IT IS KEYED BY COLOUR, NOT BY STATUS, AND THAT IS WHAT THE MERGE FORCES. A status-keyed reader
 * would hold two identical yellow swatches, so `building` would "read as `proposed`" at every rung
 * and be counted a foreign read six times over — the instrument scoring the decision as its own
 * worst defect. The question after ADR-0462 is whether a pixel reads as the wrong COLOUR, and two
 * states that agreed to share one cannot fail it.
 */
export function foreignColourReads(
  tokens: ReadonlyMap<string, StatusFamily> = STATUS_TOKENS,
  vocab: ReadonlyMap<string, LandColour> = STATUS_COLOUR,
  flatGroundLevel: number = FLAT_GROUND_LEVEL,
): string[] {
  const colours = LAND_COLOURS.filter((c) => tokensOfColour(c, tokens, vocab).length > 0);
  // `nearestStatus` is the ported reader, imported rather than re-derived — an argmin written a
  // second time here would be two copies of one belief, agreeing with each other whatever the
  // pixels do. It takes a keyed table, so the keys are COLOURS; its alphabetical tie-break makes
  // the report deterministic.
  const table: Record<string, Rgb255[]> = {};
  for (const c of colours) {
    table[c] = [deliveredForLevel(tokensOfColour(c, tokens, vocab)[0]!, flatGroundLevel)];
  }
  const out: string[] = [];
  for (const c of colours) {
    const token = tokensOfColour(c, tokens, vocab)[0]!;
    for (const level of SHADE_LEVELS) {
      const read = nearestStatus(deliveredForLevel(token, level), table);
      if (read !== c) out.push(`${c}@${level}->${read}`);
    }
  }
  return out.sort();
}
