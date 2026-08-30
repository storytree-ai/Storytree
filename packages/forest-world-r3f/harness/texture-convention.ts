// texture-convention.ts — the VERDICT half of the colour convention, and a re-export of the half
// that crossed.
//
// ⚠⚠ THE CONVENTION ITSELF NOW LIVES IN `../src/texture-convention.ts` (crossed 2026-08-30, with
// the bought kit). The shipped canvas draws bought objects and therefore has to sample them under
// the same rule, and a second copy of that rule is how this package once acquired three
// disagreeing status palettes. Everything the convention half exports is re-exported below, so
// every existing consumer of this path is untouched and the two surfaces cannot sample
// differently.
//
// WHAT STAYED HERE is the instrument: `judgeColourConvention` and its observation shape, the
// tolerance and separation floors, and `ASSET_MATERIALS` / `checkAssetMaterials` — the per-asset
// manifest of which materials a page must have found. It MEASURES the convention rather than
// being part of it, and instruments stay outside the synced tree (`scope-fence.test.ts`).

export {
  COLOUR_MAP_SLOTS,
  DATA_MAP_SLOTS,
  MIN_OPAQUE_FRACTION,
  OPAQUE_TEXEL_CUT,
  RAW_COLOUR_SPACE,
  applyRawColourConvention,
  srgbToLinearByte,
  srgbToLinearUnit,
} from '../src/texture-convention.js';
export type {
  ConventionApplication,
  ConventionMaterial,
  ConventionTexture,
  Rgb,
} from '../src/texture-convention.js';

import { MIN_OPAQUE_FRACTION, srgbToLinearByte } from '../src/texture-convention.js';
import type { Rgb } from '../src/texture-convention.js';

// ------------------------------------------------------------------ the delivered-pixel verdict

/**
 * ONE MATERIAL'S OBSERVATION, all four numbers read out of the SAME RUN.
 *
 * ⚠ THE TWO PREDICTIONS ARE RENDERED, NOT COMPUTED. `rawControl` and `managedControl` are what
 * the pipeline delivered for a flat swatch of the map's own mean and of the map's own
 * mean-after-linearising — same quad, same lights, same material minus the map. That is what
 * makes the bar a same-run control rather than a number someone picked
 * (`pixel-threshold-reads-off-a-same-run-control`), and it also means the BRDF's own constants,
 * the specular term and the calibration all cancel instead of having to be modelled.
 *
 * ⚠ AND THE LINEARISED MEAN IS `mean(srgb_to_linear(texel))`, NOT `srgb_to_linear(mean(texel))`.
 * The curve is convex, so those two differ; predicting with the wrong one would leave a
 * systematic error that the tolerance would then have to absorb, which is how a tolerance stops
 * discriminating.
 */
export interface ConventionObservation {
  /** The material's name, for the report. */
  material: string;
  /** What the asset's OWN textured swatch delivered. */
  delivered: Rgb;
  /** What a flat swatch of the map's raw mean delivered — the RAW hypothesis, measured. */
  rawControl: Rgb;
  /** What a flat swatch of the map's linearised mean delivered — the MANAGED hypothesis. */
  managedControl: Rgb;
}

/** Which hypothesis the delivered pixels matched. */
export type ConventionVerdict = 'RAW' | 'COLOUR-MANAGED' | 'NEITHER' | 'INDISCRIMINATE';

export interface ConventionJudgement {
  material: string;
  verdict: ConventionVerdict;
  /** Worst per-channel relative distance from the RAW control. */
  rawError: number;
  /** Worst per-channel relative distance from the MANAGED control. */
  managedError: number;
  /** How far apart the two hypotheses are, as a ratio — the check's own resolving power. */
  separation: number;
  ok: boolean;
  detail: string;
}

/**
 * How far a delivered colour may sit from a control and still be called a match, as a fraction.
 *
 * It absorbs texture filtering, mip selection and the difference between averaging texels on the
 * GPU and in JavaScript — NOT a modelling error, because there is no model: both hypotheses are
 * rendered. 12% is comfortably tighter than half the smallest separation the check will accept
 * (a 2.0x separation leaves 100% of headroom between the two hypotheses), so a run that passes
 * cannot also have been close to the other answer.
 */
export const CONVENTION_TOLERANCE = 0.12;

/**
 * The least the two hypotheses must differ by for the observation to mean anything.
 *
 * ⚠ FAIL-CLOSED, AND THIS IS THE NON-VACUITY FLOOR. A near-black or near-white map linearises to
 * nearly itself, so for such a map the two predictions coincide and the frame CANNOT say which
 * convention produced it. A check that quietly passed there would be reporting its own blindness
 * as a green. It refuses instead, and says why.
 */
export const MIN_HYPOTHESIS_SEPARATION = 2.0;

function worstRelativeError(actual: Rgb, expected: Rgb): number {
  let worst = 0;
  for (const c of ['r', 'g', 'b'] as const) {
    // The floor of 1 byte keeps a near-zero channel from producing an infinite error; a channel
    // that dark carries no information either way and the separation floor is what guards it.
    const denom = Math.max(expected[c], 1);
    worst = Math.max(worst, Math.abs(actual[c] - expected[c]) / denom);
  }
  return worst;
}

function meanChannel(c: Rgb): number {
  return (c.r + c.g + c.b) / 3;
}

/** Judge one material's delivered pixels against its own two same-run controls. */
export function judgeColourConvention(obs: ConventionObservation): ConventionJudgement {
  const separation = meanChannel(obs.rawControl) / Math.max(meanChannel(obs.managedControl), 1e-9);
  const rawError = worstRelativeError(obs.delivered, obs.rawControl);
  const managedError = worstRelativeError(obs.delivered, obs.managedControl);

  if (!(separation >= MIN_HYPOTHESIS_SEPARATION)) {
    return {
      material: obs.material,
      verdict: 'INDISCRIMINATE',
      rawError,
      managedError,
      separation,
      ok: false,
      detail:
        `the two hypotheses are only ${separation.toFixed(2)}x apart (floor ` +
        `${MIN_HYPOTHESIS_SEPARATION}x) — this map is too dark or too flat for the frame to say ` +
        'which convention produced it, so the run refuses rather than reporting its own blindness',
    };
  }

  if (rawError <= CONVENTION_TOLERANCE) {
    return {
      material: obs.material,
      verdict: 'RAW',
      rawError,
      managedError,
      separation,
      ok: true,
      detail: `delivered within ${(rawError * 100).toFixed(1)}% of the raw control`,
    };
  }

  if (managedError <= CONVENTION_TOLERANCE) {
    return {
      material: obs.material,
      verdict: 'COLOUR-MANAGED',
      rawError,
      managedError,
      separation,
      ok: false,
      detail:
        `delivered within ${(managedError * 100).toFixed(1)}% of the COLOUR-MANAGED control — ` +
        'this material\'s base-colour map is being decoded as sRGB, so it renders about ' +
        `${separation.toFixed(1)}x dark and will look like a deliberate art choice. Route its ` +
        'loader through applyRawColourConvention()',
    };
  }

  return {
    material: obs.material,
    verdict: 'NEITHER',
    rawError,
    managedError,
    separation,
    ok: false,
    detail:
      `delivered matches neither control (raw ${(rawError * 100).toFixed(1)}%, managed ` +
      `${(managedError * 100).toFixed(1)}%, tolerance ${(CONVENTION_TOLERANCE * 100).toFixed(0)}%)`,
  };
}

// ------------------------------------------------------------------ what must be there at all

/**
 * THE MATERIALS EACH COMMITTED ASSET CARRIES — hand-authored, upstream of the loader.
 *
 * ⚠ WITHOUT THIS THE WHOLE CHECK IS VACUOUS AT ONE LEVEL UP. Every judgement above is made per
 * material FOUND IN THE ASSET. An asset whose materials failed to load carries none, every
 * judgement passes trivially, and the run reports a green over an empty set — the exact shape
 * `an-expectation-derived-from-its-subject-cannot-fail` describes. So the count and the names are
 * declared here, and adding a material to an asset is a visible two-place edit.
 */
export const ASSET_MATERIALS = {
  '/assets/pine-01.glb': ['Pine_Trunks', 'Pine_Branches'],
  // ⚠ THREE, NOT SIX, SINCE 2026-08-29. The kit was re-exported for the owner's settled
  // vocabulary — rocks and logs withdrawn, the undergrowth gone with the density rule — so
  // `Logs`, `Pine_Rocks_01` and `Pine_Foliage_02` left the asset with the objects that wore
  // them. That is a two-place edit on purpose: an asset losing a material silently would take
  // this check's whole subject with it.
  '/assets/dressing-kit.glb': ['Pine_Branches', 'Pine_Forest_Foliage', 'Pine_Trunks'],
} as const satisfies Record<string, readonly string[]>;

/** Refuse an asset whose materials are not exactly the declared ones. */
export function checkAssetMaterials(url: string, found: readonly string[]): string | null {
  // Looked up through `Object.entries` rather than by index, so the manifest can keep its
  // literal type: widening it to an open dictionary to index it would throw away the very
  // evidence that makes a typo in an asset url a compile error rather than an empty check.
  const declared = Object.entries(ASSET_MATERIALS).find(([key]) => key === url)?.[1];
  if (!declared) {
    return `texture-convention: ${url} is not declared in ASSET_MATERIALS — an undeclared asset is an unchecked one`;
  }
  const want = [...declared].sort().join(', ');
  const got = [...found].sort().join(', ');
  if (want !== got) {
    return `texture-convention: ${url} carries materials [${got}]; ASSET_MATERIALS declares [${want}]`;
  }
  return null;
}
