// land-wheat.ts — THE WHEAT FIELD: layer 1 of the approved ground RE-PALETTISED onto the
// `building`/`proposed` yellow, so the 14 in-progress islands wear a painted stack of their own
// instead of a flat token (`paint-every-land-type-arc-inc-01`).
//
// STRUCTURE TRANSCRIBED, COLOUR RE-DERIVED — and the split is stated here because ADR-0490 D2's
// anti-A/B rule is about the recipe's STRUCTURE. Everything that decides the SHAPE of the field is
// `land-grass.ts`'s and is reused by import, never copied: the three base octaves and their two
// float mixes (`grassScalar`), the slow hue-drift noise and its 0.38–0.62 remap (`grassDrift`),
// the two 3-stop ramps at 0.28 / 0.50 / 0.74, the linear-space interpolation and the one transfer
// to sRGB. What this module owns is the COLOUR of the six stops, and it does not invent them:
// each wheat stop is an authored ANCHOR colour scaled, per channel in linear space, by the ratio
// of the corresponding green stop to the green token the recipe's ramps sit on. So the wheat
// darkens toward its dark stop, warms toward its warm ramp and lightens toward its light stop in
// exactly the proportions the approved grass does relative to its own green — a rebasing with no
// free constant, which is what makes it a derivation rather than an art call.
//
// ⚠⚠ THE SOURCE OF THE STRUCTURE IS `mat_attribute()` (`build_land.py:836-868`), AND THE FILE
// CONTAINS A DECOY: `mat_procedural()` at `:697-754` opens with a byte-identical first line and
// carries different constants from a REJECTED variant. This module never re-reads the script —
// every structural constant is `land-grass.ts`'s, which anchors on the enclosing function name and
// pins the pair that differ (`land-grass.test.ts`).
//
// ⚠⚠ IT ENTERS AS A MIX INTO THE STATUS COLOUR, NEVER AS A REPLACEMENT (ADR-0490 D5), through
// the one seam every colour layer uses — `banded-ground-material.ts`'s paint line, where the
// wheat is selected by its own per-token gate exactly as the grass is by its. The 2026-08-27 work
// that this arc's intent supersedes drew `wheat` / `yellowGrass` as whole-island COVER tokens — a
// base swapped for another base — and that is precisely the shape the owner rejected on
// 2026-09-05 (*"rather then have a whole separate base for it"*). Nothing here replaces a token:
// `mix(statusColour, wheatColour, fac)` with `fac < 1`, and the island's own yellow stays in the
// field.
//
// ⚠ HOW YELLOW IT IS, IS A LADDER FOR THE OWNER, NEVER AN AGENT PICK. Yellow is a crowded
// neighbourhood on this map — the in-progress token is itself a yellow — and the 2026-08-27 run
// measured the trade: nothing reading as a BRIGHT yellow grass gets further from a proof state
// than the shipped wheat override, and the mustard buys 1.8x the straw's separation by being
// duller. {@link WHEAT_ANCHORS} is that ladder; the pick lives in `ForestWorldCanvas.tsx` with the
// rendered sheet it was chosen from (ADR-0503 D3).
//
// ⚠ THE READER MODEL PRINTS AND DOES NOT FENCE. `harness/wheat-status-reading.ts` drives the
// per-pixel reader with THIS layer's reachable colours and reports its margin on every rung —
// negative where it is negative. ADR-0503 retired that number as a fence and ADR-0506 extended
// the retirement to layer 1; the look decides (ADR-0489 D3), and a negative margin is a report.

import {
  GRASS_COOL,
  GRASS_DRIFT_RAMP,
  GRASS_WARM,
  clamp01,
  grassDrift,
  grassScalar,
  rampGlsl,
  rampLinear,
  type LinearRgb,
  type RampStop,
} from './land-grass.js';
import { linearToSrgb255 } from './land-grain.js';
import { parseHex, type Rgb255 } from './shade-ladder.js';

/**
 * WHICH GROUND STATUSES WEAR THE WHEAT — the second half of ADR-0492 D1's per-token gate, and the
 * ONE spelling of it. The canvas turns these names into ramp ROWS and the shader tests `vStatus`
 * against them; the harness paints exactly these statuses' bases and leaves the rest alone.
 *
 * ⚠ `building` AND `proposed` ARE ONE AUTHORED TOKEN (ADR-0462), so the wheat covers both keys or
 * neither — a wheat on one of them would draw two colours for one authored state. There is no
 * `wheatfield` ground token and this module creates none: "wheat field" is the TREATMENT painted
 * onto the in-progress token, and the six tokens stay what they were.
 *
 * ⚠ DISJOINT FROM `GRASS_STATUS_GATE` BY CONSTRUCTION, and the material REFUSES a row named by
 * both: a row in two gates would be painted twice through one seam.
 */
export const WHEAT_STATUS_GATE: readonly string[] = ['building', 'proposed'];

/**
 * THE GREEN THE RECIPE'S RAMPS ARE STATED AGAINST — the shipped `healthy` ground token.
 *
 * ⚠ A LITERAL HERE, AND PINNED AGAINST THE SHIPPED PALETTE by `harness/shipped-wheat-scene.test.ts`
 * (this module is `src/` and may not import the harness's transcription). It is the reference
 * every ratio below is taken relative to: the grass ramps' light stops sit within a few percent
 * of this token per channel (1.02 / 0.90 / 1.25 on the cool ramp), which is what makes "the
 * anchor plays the token's role" a reading of the recipe rather than a guess.
 */
export const GRASS_TOKEN_REFERENCE = '#8cb85e';

/**
 * sRGB byte -> LINEAR, the exact inverse of `land-grain.ts`'s {@link linearToSrgb255}: the
 * standard piecewise transfer, read backwards. Every authored anchor is an sRGB hex and every
 * ramp stop is authored in linear, so the anchor has to cross once before the ratios apply.
 *
 * ⚠ TWO STATEMENTS RATHER THAN A TERNARY, for the mutation rung's attribution: the branch and the
 * two bodies each need a line a test can be pinned to. `land-wheat.test.ts` round-trips every
 * byte through both functions.
 */
export function srgbToLinear(byte: number): number {
  const c = byte / 255;
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/** An authored `#rrggbb` as a LINEAR triple. */
export function hexToLinear(hex: string): LinearRgb {
  const p = parseHex(hex);
  return [srgbToLinear(p.r), srgbToLinear(p.g), srgbToLinear(p.b)];
}

/** One rung of the yellowness ladder: an authored anchor colour and what it is. */
export interface WheatAnchor {
  id: string;
  /** The anchor, `#rrggbb` — the colour that plays the green token's role in the rebasing. */
  hex: string;
  /** What the anchor is, for a caption. */
  what: string;
}

/**
 * THE LADDER — HOW YELLOW THE WHEAT IS, four authored anchors, none picked by eye here.
 *
 * Every hex is an AUTHORED source: `#d6b271` is the wheat token transcribed from the shipped app's
 * own CSS and carried by every status family (`harness/palette-band.ts`); the other three are
 * rows of the 2026-08-27 separation search recorded in
 * `docs/research/chapter2-ground-cover-2026-08-27/README.md` §4 — the bleached straw, the light
 * straw that sat exactly on that instrument's bar, and the mustard the search authored as
 * `YELLOW_GRASS` (`harness/ground-cover.ts`). The order is that instrument's own axis, its
 * matched-condition distance from the nearest proof state, ascending: 4.92 / 7.68 / 7.68 / 13.62
 * as measured on 2026-08-27 — the pale straw sits nearest the in-progress yellow and the mustard
 * furthest, which is the 1.8x the arc's intent quotes. `harness/shipped-wheat-scene.test.ts`
 * re-derives the ordering on the current vocabulary rather than trusting the figures.
 *
 * ⚠ THE PICK IS NOT HERE. `SHIPPED_WHEAT_ANCHOR` in `ForestWorldCanvas.tsx` names the rung that
 * ships and the sheet it was chosen from; this list is the ladder the owner scales along.
 */
export const WHEAT_ANCHORS: readonly WheatAnchor[] = [
  { id: 'straw', hex: '#d9d18a', what: 'bleached straw — the palest rung, nearest the in-progress yellow' },
  { id: 'wheat', hex: '#d6b271', what: 'the authored wheat token — the shipped app’s own wheat, a warm tan' },
  { id: 'light-straw', hex: '#c6c06a', what: 'light straw — a true yellow, on the 2026-08-27 instrument’s bar exactly' },
  { id: 'mustard', hex: '#b0b040', what: 'the measured mustard — the boldest yellow, 1.8x the straw’s separation' },
];

/** One anchor by id — refused rather than `undefined`, so a typo in a caption cannot render an
 *  arm that quietly wears no rung. */
export function wheatAnchor(id: string): WheatAnchor {
  const found = WHEAT_ANCHORS.find((a) => a.id === id);
  if (found === undefined) throw new Error(`land-wheat: no wheat anchor "${id}"`);
  return found;
}

/**
 * ONE STOP REBASED: the anchor scaled per channel by the green stop's ratio to the green
 * reference, in LINEAR space, clamped to 1.
 *
 * The ratio is the whole derivation. A green stop that is 0.20 of the token's red is a wheat stop
 * that is 0.20 of the anchor's red; the warm ramp's 1.38 red at its light stop is 1.38 of the
 * anchor's. The stop POSITION is untouched — it is the recipe's.
 *
 * ⚠ CLAMPED, NOT NORMALISED. A pale anchor times a ratio above 1 can exceed linear white on one
 * channel; clamping that channel keeps the other two where the ratio put them, where dividing
 * the whole stop down would darken a colour the derivation did not ask to darken.
 */
export function rebaseStop(stop: RampStop, anchor: LinearRgb, reference: LinearRgb): RampStop {
  return {
    at: stop.at,
    linear: [
      rebaseChannel(stop.linear[0], anchor[0], reference[0]),
      rebaseChannel(stop.linear[1], anchor[1], reference[1]),
      rebaseChannel(stop.linear[2], anchor[2], reference[2]),
    ],
  };
}

/** One channel of {@link rebaseStop}. A named function rather than an inline expression, so the
 *  mutation rung can attribute a mutant in the arithmetic to the test that kills it. */
export function rebaseChannel(stop: number, anchor: number, reference: number): number {
  return clamp01((anchor * stop) / reference);
}

/** A whole ramp rebased onto an anchor. */
export function wheatRamp(stops: readonly RampStop[], anchorHex: string): RampStop[] {
  const anchor = hexToLinear(anchorHex);
  const reference = hexToLinear(GRASS_TOKEN_REFERENCE);
  return stops.map((stop) => rebaseStop(stop, anchor, reference));
}

/** THE WHEAT'S COOL RAMP — the grass's cool ramp rebased. */
export function wheatCool(anchorHex: string): RampStop[] {
  return wheatRamp(GRASS_COOL, anchorHex);
}

/** THE WHEAT'S WARM RAMP — the grass's warm ramp rebased. */
export function wheatWarm(anchorHex: string): RampStop[] {
  return wheatRamp(GRASS_WARM, anchorHex);
}

/**
 * THE WHEAT COLOUR from its two scalars, in LINEAR space — the cool and warm ramps at the base
 * scalar `t`, selected between by the remapped drift `d`. The same arithmetic as
 * `grassLinearOf`, on the rebased ramps.
 *
 * ⚠ IT TAKES THE SCALARS RATHER THAN A GROUND COORDINATE, for the reason `grassLinearOf` gives:
 * the layer's reachable colour set is a property of the scalars' range, and the reader instrument
 * enumerates it rather than sampling an island.
 */
export function wheatLinearOf(anchorHex: string, t: number, d: number): LinearRgb {
  const cool = rampLinear(wheatCool(anchorHex), t);
  const warm = rampLinear(wheatWarm(anchorHex), t);
  return [
    cool[0] + (warm[0] - cool[0]) * d,
    cool[1] + (warm[1] - cool[1]) * d,
    cool[2] + (warm[2] - cool[2]) * d,
  ];
}

/** {@link wheatLinearOf} as a delivered sRGB pixel — interpolated in linear, converted once, the
 *  faithful order `land-grass.ts` records paying for. */
export function wheatColourOf(anchorHex: string, t: number, d: number): Rgb255 {
  const [r, g, b] = wheatLinearOf(anchorHex, t, d);
  return { r: linearToSrgb255(r), g: linearToSrgb255(g), b: linearToSrgb255(b) };
}

/** THE WHEAT COLOUR at a ground point — the GRASS's own base scalar and drift (the structure), the
 *  wheat's ramps (the colour). */
export function wheatColourAt(anchorHex: string, x: number, z: number): Rgb255 {
  return wheatColourOf(anchorHex, grassScalar(x, z), grassDrift(x, z));
}

/**
 * GLSL source for the wheat field, with the rebased stops written in from this module.
 *
 * ⚠⚠ IT DEPENDS ON `st_grassScalar`, `st_grassDrift`, `st_grassCool`, `st_grassWarm` AND
 * `st_grassSrgb`, WHICH `grassGlsl()` DECLARES, and the material refuses a `wheat` option without
 * a `grass` one for that reason. The wheat evaluates NO octave of its own: it reads the fields the
 * grass already evaluates for the same fragment, so on a painted row the noise runs once whichever
 * gate is up.
 *
 * `st_paintColour` is the one seam's colour for BOTH painted layers: on a grass row the wheat
 * term is multiplied by zero, on a wheat row the grass term is, and on every other row both are —
 * which is what lets the material composite one line rather than two.
 */
export function wheatGlsl(anchorHex: string): string {
  const [lo, hi] = GRASS_DRIFT_RAMP;
  return [
    '// GENERATED from land-wheat.ts — do not hand-edit these constants.',
    `// The wheat field: layer 1's structure (build_land.py:836-868, mat_attribute()) re-palettised`,
    `// onto the anchor ${anchorHex} — each stop is that anchor scaled per channel by the green`,
    `// stop's ratio to the green token ${GRASS_TOKEN_REFERENCE}.`,
    ...rampGlsl('st_wheatCool', wheatCool(anchorHex)),
    '',
    ...rampGlsl('st_wheatWarm', wheatWarm(anchorHex)),
    '',
    '// THE PAINTED COLOUR at a ground point, as a delivered sRGB triple in 0..1: the grass on a',
    '// grass row, the wheat on a wheat row, both from the ONE base scalar and drift the fragment',
    '// already carries.',
    'vec3 st_paintColour(vec2 p, float grassGate, float wheatGate) {',
    '  float t = st_grassScalar(p);',
    `  float d = clamp((st_grassDrift(p) - ${lo.toFixed(6)}) / ${(hi - lo).toFixed(6)}, 0.0, 1.0);`,
    '  vec3 grass = mix(st_grassCool(t), st_grassWarm(t), d);',
    '  vec3 wheat = mix(st_wheatCool(t), st_wheatWarm(t), d);',
    '  return st_grassSrgb(grass * grassGate + wheat * wheatGate);',
    '}',
  ].join('\n');
}
