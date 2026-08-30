// contact-shade.ts — CONTACT DARKENING, RE-EXPORTED. The module itself crossed into
// `src/contact-shade.ts` on 2026-08-30 and the shipped ground now wears it, so this file exists
// only so the experiment's twenty-odd consumers keep drawing the SAME pools the product draws.
//
// ⚠ DO NOT REINTRODUCE AN IMPLEMENTATION HERE. A copy is two modules that agreed on the day they
// were forked; this package has already spent an increment putting three disagreeing status
// palettes back together. `harness/scope-fence.test.ts`'s ADOPTED ledger holds both halves of the
// crossing — the file really is in `src/`, and this file really re-exports from it.
//
// The reasoning that used to live here — why the falloff is DERIVED from each caster's own
// geometry rather than dialled, why overlapping pools take a MAX rather than a SUM, why the merge
// REFUSES a grid mismatch instead of resampling, and why a contact pool takes no relief argument
// when the cast field does — moved with the code and is unabridged in its new home. So did the
// finding that inverts its own ranking on this surface: contact darkening was ranked first of ten
// mechanisms on an island carrying 155 props, and the shipped map draws ONE object.

export {
  CONTACT_SPREAD,
  buildContactField,
  contactCoverage,
  contactReach,
  mergeOcclusion,
  sameGrid,
  skyOcclusionAt,
  type ContactFieldOptions,
} from '../src/contact-shade.js';
