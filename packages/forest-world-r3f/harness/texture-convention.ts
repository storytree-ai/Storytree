// texture-convention.ts — THE COLOUR CONVENTION A BOUGHT TEXTURE MUST BE SAMPLED IN, and the
// arithmetic that can catch a texture sampled the other way.
//
// ⚠⚠ WHAT THIS EXISTS TO CATCH, because it is silent and it looks deliberate.
//
// This renderer is NOT colour-managed, on purpose. `configureExactColour` sets
// `outputColorSpace = LinearSRGBColorSpace` and `ColorManagement.enabled = false` so an authored
// token like `#8cb85e` survives the round trip byte-for-byte — the whole basis of the
// palette-closure claim ADR-0380 / ADR-0406 / ADR-0418 rest on. But `ColorManagement.enabled`
// governs `Color` VALUES, not texture transfer functions: `GLTFLoader` marks a glTF base-colour
// map `SRGBColorSpace` regardless, three decodes it in the shader, the lighting runs in linear,
// and nothing ever encodes the result back out.
//
// Measured on 2026-08-28 (`docs/research/chapter2-textured-asset-2026-08-28/` §5): the first
// live render delivered foliage at rgb(15,26,15) against a base-colour map whose own mean is
// rgb(70,90,69) — which is exactly `srgb_to_linear(70,90,69)`. It was not a lighting error and
// it was not broken-looking. **It looked like a moody art direction.** That is the whole danger:
// a bought asset dropped in the ordinary way comes out about 3.5x dark and reads as a choice.
//
// The convention is therefore: A BASE-COLOUR MAP IS SAMPLED RAW (`NoColorSpace`), which puts a
// bought asset in the same convention `createBandedMaterial` already uses — half-lambert on
// authored sRGB numbers, written out raw. DATA maps (normal, roughness, metalness, AO) are
// genuinely linear data and are LEFT ALONE; forcing them raw would be a second, opposite bug.
//
// ⚠ THE OTHER HORN OF THE FORK IS NOT TAKEN HERE. Colour-managing the whole pipeline instead is
// a materially larger decision reaching across ADR-0380 / ADR-0406 / ADR-0418 and belongs to
// whoever proposes it explicitly. If it is ever taken, THIS FILE is what has to change, and the
// check below is what will notice.

/** A colour as three 0..255 bytes. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * The sRGB electro-optical transfer function, on unit values (IEC 61966-2-1).
 *
 * This is the exact curve three's shader applies to a texel it believes is sRGB-encoded. It is
 * here so the check can PREDICT the broken delivery rather than recognise a magic number.
 */
export function srgbToLinearUnit(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** The same curve on a 0..255 byte, answering a 0..255 byte (unrounded — this feeds arithmetic). */
export function srgbToLinearByte(v: number): number {
  return srgbToLinearUnit(v / 255) * 255;
}

/**
 * THE TEXTURE SLOTS, split by what they carry. Hand-authored, and the split is the convention.
 *
 * ⚠ This list is UPSTREAM of any material it is applied to, deliberately. Deriving "which slots
 * are colour" from the material in front of you is the shape
 * `an-expectation-derived-from-its-subject-cannot-fail` warns about: a material that lost its
 * base-colour map would also lose the obligation to sample it raw, and the check would go green
 * for the reason it exists to catch.
 */
export const COLOUR_MAP_SLOTS = ['map', 'emissiveMap'] as const;

/** Slots carrying linear DATA rather than colour. Sampling these raw would be a second bug. */
export const DATA_MAP_SLOTS = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const;

/** three's own `NoColorSpace`, which is the empty string. Named so a reader is not startled. */
export const RAW_COLOUR_SPACE = '';

/** The minimal shape of a texture this convention touches — duck-typed so the pure half of the
 *  harness can reason about it without a GPU. */
export interface ConventionTexture {
  colorSpace: string;
  needsUpdate: boolean;
}

/** The minimal shape of a material. `null` and `undefined` are both "slot empty" — glTF
 *  materials use `null`, hand-built ones sometimes leave the slot off entirely. */
export type ConventionMaterial = Partial<
  Record<(typeof COLOUR_MAP_SLOTS)[number] | (typeof DATA_MAP_SLOTS)[number], ConventionTexture | null>
>;

/** What `applyRawColourConvention` did, so a caller can report it rather than assume it. */
export interface ConventionApplication {
  /** Colour slots that were present and have been put in the raw convention. */
  colourSlots: string[];
  /** Data slots that were present and were deliberately left alone. */
  dataSlots: string[];
}

/**
 * PUT ONE MATERIAL IN THE RAW COLOUR CONVENTION. Every loader path on this surface must route
 * through here — `texture-convention.test.ts` scans the harness and refuses one that does not.
 */
export function applyRawColourConvention(material: ConventionMaterial): ConventionApplication {
  const colourSlots: string[] = [];
  const dataSlots: string[] = [];
  for (const slot of COLOUR_MAP_SLOTS) {
    const tex = material[slot];
    if (!tex) continue;
    tex.colorSpace = RAW_COLOUR_SPACE;
    tex.needsUpdate = true;
    colourSlots.push(slot);
  }
  for (const slot of DATA_MAP_SLOTS) {
    if (material[slot]) dataSlots.push(slot);
  }
  return { colourSlots, dataSlots };
}

/**
 * ONLY FULLY OPAQUE TEXELS ARE COMPARED, and this is not a detail — it is what makes the source
 * mean and the delivered mean means of the SAME SET.
 *
 * ⚠ TWO SEPARATE THINGS BREAK ON A CUT-OUT MAP, and the first one produced a wrong answer before
 * this existed. (1) Reading a map's texels means drawing it into a 2D canvas, and `getImageData`
 * un-premultiplies — so every texel with alpha 0 comes back BLACK whatever its real colour is,
 * while the GPU samples that colour perfectly happily. On the pine's foliage map that dragged the
 * JavaScript mean to rgb(30,38,29) against a frame delivering rgb(72,91,71), and the check
 * reported NEITHER: a real disagreement, about the wrong thing. (2) A partly transparent texel is
 * blended against whatever is behind it, so its delivered colour is not its own.
 *
 * Cutting at fully-opaque removes both at once: `alphaTest` at this level discards every texel
 * that is not solid, and the same predicate selects the texels the source mean is taken over.
 * With nearest filtering at 1:1 the two sets are then EXACTLY equal rather than approximately.
 */
export const OPAQUE_TEXEL_CUT = 254;

/**
 * The least of a map that must be solid for the run to be able to judge it.
 *
 * A map that is almost entirely cut out delivers a handful of pixels, and a mean over a handful
 * is noise. Fail-closed, like the separation floor: refuse rather than report a verdict the frame
 * does not support.
 */
export const MIN_OPAQUE_FRACTION = 0.02;

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
  '/assets/dressing-kit.glb': [
    'Logs',
    'Pine_Branches',
    'Pine_Foliage_02',
    'Pine_Forest_Foliage',
    'Pine_Rocks_01',
    'Pine_Trunks',
  ],
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
