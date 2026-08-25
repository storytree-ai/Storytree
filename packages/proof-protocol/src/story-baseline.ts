import { z } from "zod";

/**
 * The story-BASELINE DATA shapes (ADR-0416 D6, published per ADR-0068 §3).
 *
 * ADR-0416 D1 makes a story's green DURABLE: the first valid whole-story pass establishes a proven
 * baseline, and work declared LATER cannot turn that baseline back into `proposed`. To say both
 * *"the story was proven"* AND *"four newer obligations remain"*, a verdict has to record WHAT it
 * covered — otherwise "declared later" is not computable and the two facts collapse into one colour,
 * which is the modelling error ADR-0416 exists to correct.
 *
 * So a story-baseline verdict carries the capability and own-proof obligation sets it was signed
 * over, plus a stable {@link storyBaselineFingerprint} of the two. Anything declared outside that
 * fingerprint is EXPANSION (ADR-0416 D2) — additive state that must stay VISIBLE ("silence is not
 * acceptable") but never a health regression.
 *
 * DATA SHAPES + the identity constructor ONLY. The FOLD that reads a baseline out of an event
 * stream and diffs today's declarations against it (`storyBaselineOf`, `expansionBeyondBaseline`)
 * is the farmer organism's ruler and lives in `@storytree/orchestrator` — the same split
 * `criterion-binding.ts` already makes between the revision id and the roll-up that reads it.
 */

/** Immutable content-bound story-baseline scope identity (ADR-0416 D6). */
export const StoryBaselineFingerprint = z
  .string()
  .regex(/^sbl1:[0-9a-f]{16}$/, "fingerprint must be an sbl1 content binding");
export type StoryBaselineFingerprint = z.infer<typeof StoryBaselineFingerprint>;

/**
 * The scope one story-baseline verdict was signed over (ADR-0416 D6) — the capability ids and the
 * own-proof obligation ids (UAT criterion ids UNION reliability-gate ids, ADR-0085) that were
 * declared at the moment the baseline was established, plus their {@link storyBaselineFingerprint}.
 *
 * Both lists are stored SORTED, and the fingerprint is computed over the sorted lists, so declaring
 * the same set in a different order is the same baseline — reordering a story's `capabilities:`
 * list is not expansion, exactly as moving a UAT item up the list is not a new revision
 * (`criterion-binding.ts`).
 *
 * The lists are kept BESIDE the fingerprint rather than replaced by it: the fingerprint answers
 * *"has the set moved?"* in one comparison, and the lists answer *"which four are new?"* — which is
 * the question ADR-0416 D2 requires the surface to be able to answer out loud.
 */
export const StoryBaselineScope = z
  .object({
    /** The capability ids the baseline's capability clause covered, sorted. */
    capabilityIds: z.array(z.string()),
    /** The own-proof obligation ids the baseline covered (criterion ids and gate ids), sorted. */
    obligationIds: z.array(z.string()),
    /** The content binding of the two sorted lists — {@link storyBaselineFingerprint}. */
    fingerprint: StoryBaselineFingerprint,
  })
  .strict();
export type StoryBaselineScope = z.infer<typeof StoryBaselineScope>;

/**
 * Browser-safe FNV-1a/64 content binding over a baseline's two declared sets (ADR-0416 D6). The
 * `sbl1:` version prefix makes the algorithm explicit and leaves a clean migration path if the
 * canonicalisation changes — the same discipline as `criterionRevisionId`'s `uatr1:`.
 *
 * Canonicalisation: each list is de-duplicated and sorted, then the two are joined under distinct
 * labelled sections. A capability id and an obligation id that happen to share a string therefore
 * cannot swap places without changing the fingerprint, and the ORDER a story declares them in
 * cannot change it at all.
 */
export function storyBaselineFingerprint(
  capabilityIds: readonly string[],
  obligationIds: readonly string[],
): StoryBaselineFingerprint {
  const canonical = `caps:\n${canonicalList(capabilityIds)}\nobligations:\n${canonicalList(obligationIds)}`;
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return StoryBaselineFingerprint.parse(`sbl1:${hash.toString(16).padStart(16, "0")}`);
}

/**
 * Build a {@link StoryBaselineScope} from the sets declared at sign time — the ONE constructor, so
 * the stored lists and the stored fingerprint can never disagree about what was covered (a
 * hand-built scope could pin a fingerprint that its own lists do not produce).
 */
export function storyBaselineScope(
  capabilityIds: readonly string[],
  obligationIds: readonly string[],
): StoryBaselineScope {
  return StoryBaselineScope.parse({
    capabilityIds: sortedUnique(capabilityIds),
    obligationIds: sortedUnique(obligationIds),
    fingerprint: storyBaselineFingerprint(capabilityIds, obligationIds),
  });
}

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function canonicalList(ids: readonly string[]): string {
  return sortedUnique(ids).join("\n");
}
