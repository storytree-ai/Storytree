// map-texels.ts — re-export. THE MODULE CROSSED INTO `src/map-texels.ts` ON 2026-08-30 with the
// bought kit: a tinted crown is rotated onto a token's chromaticity at THE MAP'S OWN luminance, so
// the shipped canvas needs the map's mean and the harness measures against the same one. A second
// copy of this arithmetic is how the two surfaces would come to disagree about what a crown
// started from.
export { mapMeans } from '../src/map-texels.js';
export type { DecodedMap, MapMeans } from '../src/map-texels.js';
