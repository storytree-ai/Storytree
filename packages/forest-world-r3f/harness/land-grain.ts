// land-grain.ts — THE HARNESS'S VIEW OF THE GRAIN OCTAVE, which is now the SHIPPED one.
//
// ⚠ THIS FILE IS A RE-EXPORT AND THAT IS THE POINT. The module crossed into `src/land-grain.ts`
// on 2026-08-30 (`adopt-the-land-into-the-shipped-map-arc`, the third component of the approved
// treatment to reach the shipped map). Its twenty-odd consumers in here — `banded-material.ts`,
// `frame-cost-scene.ts`, `grain.tsx`, `cover.tsx`, `IslandView.tsx`, the measure scripts — are
// untouched by the crossing precisely because this file kept their specifier alive, and the
// experiment and the product therefore evaluate ONE field rather than two that drift.
//
// `harness/scope-fence.test.ts` holds both halves of that claim: the module really is in `src/`,
// and this file really re-exports from it. Deleting either half is how a fence stops meaning
// anything.

export {
  GRAIN_LATTICE,
  GRAIN_FEATURE_RATIO,
  GRAIN_OCTAVES,
  GRAIN_ROUGHNESS,
  GRAIN_COLOUR_MIX,
  GRAIN_NORMAL_STRENGTH,
  GRAIN_RAMP,
  GRAIN_GRAD_STEP,
  grainTerms,
  grainAmplitudeSum,
  grainFeaturePeriod,
  linearToSrgb255,
  grainStops,
  grainStopHexes,
  grainHash,
  grainOctave,
  grainField,
  grainRamped,
  grainGradient,
  grainPerturbNormal,
  grainGlsl,
  grainKeepsPaletteClosed,
  grainColourAt,
} from '../src/land-grain.js';
export type { GroundNormal } from '../src/land-grain.js';
