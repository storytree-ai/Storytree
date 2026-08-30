// leaf-tint.ts — re-export. THE MODULE CROSSED INTO `src/leaf-tint.ts` ON 2026-08-30 with the
// bought kit. The shipped canvas draws ADR-0475's vocabulary, whose three leafed states are
// separated by TINT (the kit is entirely pine, so species separates only LEAFED from BARE), and a
// crown's colour is a claim about a capability's proof state — so the rule that a tint rotates hue
// and may never change value has to be the SAME rule on both surfaces.
export {
  LEAF_TINT_TOKEN,
  MIN_TINTABLE_CHANNEL,
  TINT_LUMA_TOLERANCE,
  leafTintGain,
  leafTintGainFor,
  luma,
  tintDeliveries,
  tintedMean,
} from '../src/leaf-tint.js';
export type { TintDelivery } from '../src/leaf-tint.js';
