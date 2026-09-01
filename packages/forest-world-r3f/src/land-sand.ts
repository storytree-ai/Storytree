// land-sand.ts — LAYER 2 OF THE APPROVED GROUND: the shore sand and the band that carries it,
// transcribed from `docs/research/chapter2-land-idiom-2026-08-27/build_land.py:869-893`.
//
// Pure, browser-free and node-provable — the same shape `land-grass.ts` takes, and for the same
// reason: the constants are authored once in TypeScript and the GLSL that evaluates them on a GPU
// is GENERATED from them, so a shader and a test cannot hold private copies of the numbers that
// decide the look.
//
// ⚠⚠ THE SOURCE IS `mat_attribute()`, AND THE FILE CONTAINS A DECOY. `mat_procedural()` at
// `:697-754` opens with a byte-identical first line and carries different constants from a
// REJECTED variant. Every constant below is anchored on the ENCLOSING FUNCTION NAME, never on a
// grep hit, and `land-sand.test.ts` pins the anchor the same way `land-grass.test.ts` does.
//
// ⚠⚠ THE SHORE VALUE ARRIVES AS A GROUND-SPACE TEXTURE, NOT A VERTEX ATTRIBUTE (ADR-0490 D4).
// `src/shore-atlas.ts` carries that field and the argument for it; this module only consumes the
// distance it delivers. In Blender the same value is a per-vertex attribute on a 0.55-unit grid.
//
// ⚠ WHAT THIS LAYER IS FOR. Layer 1 gave the ground a green that drifts; it did not give it a
// SHORE. The approved render's beach is a distinct colour family along the water, and it is one of
// the six absent layers the arc's family-count gap is made of. This is the second of them, and the
// first that is real engineering rather than transcription — the recipe's carrier does not exist
// on the shipped mesh and had to be built.

import {
  grassScalar,
  rampLinear,
  type CyclesNoise,
  type LinearRgb,
  type RampStop,
  clamp01,
  grassNoiseField,
  noiseGlsl,
  rampGlsl,
} from './land-grass.js';
import { linearToSrgb255 } from './land-grain.js';
import { AUTHORED_SHORE_WIDTH } from './shore-fall.js';
import type { Rgb255 } from './shade-ladder.js';

/**
 * THE EDGE NOISE, `build_land.py:872`: `shore_edge = _noise(nt, 7.5, 6.0)` — roughness defaults
 * to 0.5.
 *
 * ⚠ ITS JOB IS STATED IN THE SCRIPT'S OWN COMMENT: *"break the sand line so it is not a ring"*.
 * At 233.8 / 7.5 = 31.2 ground units it turns over about seven times around an island, which is
 * slow enough to read as an irregular coast rather than as texture on the sand.
 */
export const SAND_EDGE: CyclesNoise = { scale: 7.5, detail: 6, roughness: 0.5 };

/**
 * THE DIVISOR, `build_land.py:880`: `div.inputs[1] = BEACH + 0.9`, with `BEACH = 3.1` at `:96`.
 *
 * ⚠ IT READS `AUTHORED_SHORE_WIDTH` RATHER THAN SPELLING 3.1, because `shore-fall.ts` already
 * transcribed that constant from the same script for the shore FALL — the land's shape at the
 * water. One number, one transcription: a second copy could drift from the geometry the sand is
 * supposed to sit on, and the drift would look like a sand band that has slipped off its beach.
 */
export const SAND_BEACH_WIDTH = AUTHORED_SHORE_WIDTH;
export const SAND_DIVISOR = SAND_BEACH_WIDTH + 0.9;

/**
 * THE BAND RAMP, `build_land.py:878`: `_ramp([(0.34, black), (0.70, white)])`.
 *
 * ⚠⚠ ITS OUTPUT IS THE MIX FACTOR AND ITS SENSE IS THE EASIEST THING HERE TO INVERT. Blender's
 * Mix/RGBA at `:888-892` wires the sand into input A and the grass into input B with this ramp as
 * the Factor, and Mix is `A + (B - A) * factor`. So **0 delivers SAND and 1 delivers GRASS** — the
 * ramp rises going INLAND. Reading it the other way round produces a picture that still has a
 * beach, just on the wrong side of the island: sand in the interior and grass at the water.
 */
export const SAND_BAND_RAMP: readonly [number, number] = [0.34, 0.7];

/**
 * THE SAND COLOUR RAMP, `build_land.py:885-886`. Linear RGB, like every stop in the script.
 *
 * ⚠ IT IS DRIVEN BY LAYER 1'S OWN BASE SCALAR (`mB` at `:887`), not by a noise of its own — so the
 * sand grains with exactly the same field the grass does, and the beach reads as the same ground
 * in a different colour rather than as a decal laid over it. That is why this module imports
 * {@link grassScalar} rather than declaring a fourth octave stack.
 */
export const SAND_RAMP: readonly RampStop[] = [
  { at: 0.35, linear: [0.395, 0.35, 0.252] },
  { at: 0.7, linear: [0.612, 0.556, 0.412] },
];

/** The lattice spacing the edge noise delivers, in ground units — the same conversion
 *  `land-grass.ts` makes, through the island's 233.8-unit span. */
export function sandEdgeLattice(): number {
  return 233.8 / SAND_EDGE.scale;
}

/**
 * THE BAND FACTOR at a ground point: 0 is pure sand, 1 is pure grass.
 *
 * `build_land.py:873-881` — the shore distance plus the edge noise, divided by the beach width,
 * through the band ramp. The MULTIPLY_ADD at `:872-876` has its multiplier pinned to 1.0, so it
 * is an ADD and nothing else; writing it as a multiply would scale the distance by the noise
 * instead of displacing it, which collapses the band to nothing wherever the noise is near zero.
 */
export function sandBandFactor(shoreDistance: number, x: number, z: number): number {
  const edge = grassNoiseField(SAND_EDGE, x, z);
  const t = (shoreDistance + edge) / SAND_DIVISOR;
  const [lo, hi] = SAND_BAND_RAMP;
  return clamp01((t - lo) / (hi - lo));
}

/** The sand colour in LINEAR space at a given base scalar — the ramp evaluated the way Blender
 *  evaluates it, piecewise linear (`_ramp` never sets `interpolation`, whose default is LINEAR). */
export function sandLinearOf(t: number): LinearRgb {
  return rampLinear(SAND_RAMP, t);
}

/** {@link sandLinearOf} as a delivered sRGB pixel. */
export function sandColourOf(t: number): Rgb255 {
  const [r, g, b] = sandLinearOf(t);
  return { r: linearToSrgb255(r), g: linearToSrgb255(g), b: linearToSrgb255(b) };
}

/** The sand colour at a ground point — the ramp driven by layer 1's own base scalar. */
export function sandColourAt(x: number, z: number): Rgb255 {
  return sandColourOf(grassScalar(x, z));
}

/** The ramp's delivered ENDPOINTS, for the evidence sheet — the layer's palette as two pixels
 *  rather than two linear triples nobody can picture. */
export interface SandRampEndpoints {
  dark: Rgb255;
  light: Rgb255;
}

export function sandRampEndpoints(): SandRampEndpoints {
  const first = SAND_RAMP[0]!;
  const last = SAND_RAMP[SAND_RAMP.length - 1]!;
  return { dark: sandColourOf(first.at), light: sandColourOf(last.at) };
}

// ---------------------------------------------------------------- the GLSL

/**
 * GLSL source for the sand layer, with every authored constant written in from this module.
 *
 * ⚠⚠ IT DEPENDS ON `st_grassScalar` AND `st_grainOctave`, which `grassGlsl()` and `grainGlsl()`
 * declare — the sand ramp is driven by layer 1's base scalar and the edge noise reuses the one
 * lattice hash. `createBandedGroundMaterial` REFUSES a `sand` option without a `grass` one for
 * exactly the reason it already refuses grass without grain: a second copy of a field under a
 * third name is a GLSL redefinition error at best and a silent divergence at worst.
 *
 * ⚠ `uShore` IS THE DECODED DISTANCE IN GROUND UNITS, not the raw texel. The decode lives in the
 * shader stage that samples the atlas (`banded-ground-material.ts`) so that this module states the
 * recipe's arithmetic in the recipe's own units — a divisor applied to a 0..1 texel would be the
 * same expression meaning something different.
 */
export function sandGlsl(): string {
  return [
    '// GENERATED from land-sand.ts — do not hand-edit these constants.',
    '// Layer 2 of the approved ground: build_land.py:869-893, mat_attribute().',
    ...noiseGlsl('st_sandEdge', SAND_EDGE),
    '',
    ...rampGlsl('st_sandRamp', SAND_RAMP),
    '',
    '// THE BAND FACTOR: 0 is pure sand at the water, 1 is pure grass inland.',
    '// The MULTIPLY_ADD at build_land.py:872-876 pins its multiplier to 1.0, so the edge noise',
    '// DISPLACES the distance rather than scaling it.',
    'float st_sandBand(vec2 p, float shore) {',
    `  float t = (shore + st_sandEdge(p)) / ${SAND_DIVISOR.toFixed(6)};`,
    `  return clamp((t - ${SAND_BAND_RAMP[0].toFixed(6)}) / ${(
      SAND_BAND_RAMP[1] - SAND_BAND_RAMP[0]
    ).toFixed(6)}, 0.0, 1.0);`,
    '}',
    '',
    '// THE SAND COLOUR as a delivered sRGB triple in 0..1 — the ramp driven by LAYER 1`s own base',
    '// scalar, so the beach grains with the same field the grass does.',
    'vec3 st_sandColour(vec2 p) {',
    '  return st_grassSrgb(st_sandRamp(st_grassScalar(p)));',
    '}',
  ].join('\n');
}

/** How many lattice-noise octaves this layer adds per ground fragment, over layer 1's — the
 *  number the frame-cost question is asked about, derived rather than counted by hand. */
export const SAND_OCTAVES = SAND_EDGE.detail;
