// The `asset:` citation token rule — ONE definition shared by every consumer that must agree on WHAT
// a citation is (the `friction-lifecycle.ts` precedent).
//
// ADR-0298 D2 makes a friction item's `tool` routing emit a PARKED ENTRY on the arc that owns the
// remedy, and cite that arc in `references` — the outbound pointer ADR-0168 D2's routed lifecycle
// requires ("route set, output cited in `references`"). ADR-0287 D1 held the same shape against a
// free-standing `proposal` artifact before the kind was retired.
//
// THE CITATION IS NOT THE DELIVERY CEILING'S JOIN, and the split is deliberate (ADR-0298 D2). An arc
// may carry many parked entries, so a ref naming only the arc cannot say WHICH entry a recurrence
// presses on; that edge is `ArcProposal.frictionRefs`, read from the arc side. This token rule serves
// the citation half only.
//
// Consumers resolve the same token against different substrates and must not drift on the rule:
//
//   - `friction.ts` (`citedArcs`) resolves ONE doc's refs with a `store.getDoc` per ref — the WRITE
//     path's fence, where a round-trip per ref is the whole point: a ref pointing at a deleted or
//     wrong-kind artifact must not satisfy the emission.
//   - the retire dependency wall and the gate's bulk scans resolve many docs' refs against an
//     in-memory id set, where a round-trip per ref would be one live query per (item × ref).
//
// The RESOLUTION differs by substrate; the TOKEN RULE below is shared, so neither side can quietly
// widen or narrow what counts as a citation.
//
// PURE: no `node:` import, no store, no clock.

// The `asset:<id>` reference token — the corpus pointer one artifact cites another with. Defined in
// `@storytree/library` beside its two `CiteScheme` siblings since `arc-tier-extraction-arc` gave it a
// second package of readers (`@storytree/arc` MINTS one, this file RESOLVES one), and two packages
// agreeing on a token by copying it is exactly the drift this module exists to prevent.
export { ASSET_REF_PREFIX } from "@storytree/library";
import { ASSET_REF_PREFIX } from "@storytree/library";

/**
 * PURE: the artifact ids cited by a doc's `references`, in authored order — every `asset:` token,
 * prefix stripped. Takes `unknown` deliberately: both callers read `references` off an untyped
 * stored doc, so the defensive projection (not an array / non-string entries / an empty `asset:`)
 * belongs HERE rather than being re-derived, slightly differently, at each call site.
 *
 * Resolution is the CALLER's: this says which ids are pointed at, never whether they exist or what
 * kind they are. Non-`asset:` tokens (`doc:`, ADR-0107 D2's `node:`) are not corpus-artifact refs
 * and are skipped.
 */
export function citedAssetIds(references: unknown): string[] {
  if (!Array.isArray(references)) return [];
  const ids: string[] = [];
  for (const ref of references) {
    if (typeof ref !== "string") continue;
    if (!ref.startsWith(ASSET_REF_PREFIX)) continue;
    const id = ref.slice(ASSET_REF_PREFIX.length).trim();
    if (id !== "") ids.push(id);
  }
  return ids;
}
