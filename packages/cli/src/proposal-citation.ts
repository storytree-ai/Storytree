// The friction → proposal citation edge — ONE definition shared by the two consumers that must
// agree (the `friction-lifecycle.ts` precedent, applied to the other half of ADR-0287).
//
// ADR-0287 D1 makes a friction item's `tool` routing emit a `proposal` and CITE it in `references`.
// That citation is the ONLY edge between the two kinds: there is deliberately no reverse pointer on
// the proposal, so "which friction sourced this proposal" is always answered by scanning friction
// `references` for the proposal's `asset:` token.
//
// Two consumers resolve that same edge against different substrates, and must not drift on WHAT a
// citation is:
//
//   - `friction.ts` (`citedProposals`) resolves ONE doc's refs with a `store.getDoc` per ref — the
//     WRITE path's fence, where a round-trip per ref is the whole point: a ref pointing at a deleted
//     or wrong-kind artifact must not satisfy the emission.
//   - `proposal-drain.ts` resolves EVERY friction's refs against an in-memory proposal id set — the
//     GATE's bulk scan, where a round-trip per ref would be one live query per (item × ref) across a
//     227-item worklist.
//
// The RESOLUTION differs by substrate; the TOKEN RULE below is shared, so neither side can quietly
// widen or narrow what counts as a citation.
//
// PURE: no `node:` import, no store, no clock.

/** The `asset:<id>` reference token — the corpus pointer a friction item cites its proposal with. */
export const ASSET_REF_PREFIX = "asset:";

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
