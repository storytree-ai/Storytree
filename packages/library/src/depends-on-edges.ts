/**
 * THE AUTHORED SUPPORT EDGE, READ AS AN ONWARD NAVIGATION BLOCK (ADR-0464 D2).
 *
 * `dependsOn` is the deliberately authored, narrow list of what an artifact RESTS ON — a person
 * chose each entry. Until ADR-0464 it was rendered nowhere: a `library artifact <id>` read derived
 * its follow-ups from `references`, the artifact's PROVENANCE list, which is a different and much
 * wider claim (decision tier: 1.7 authored edges against 6.6 citations, and 4.7% of the citation
 * pointers offered were ever followed). ADR-0464 D1 deletes that block; D2 makes this one its
 * replacement, and this module is the read that makes it derivable.
 *
 * It returns node DATA only — ordered, resolved edges. Shaping them into the ADR-0023 `next:`
 * envelope stays the CLI's job via the ONE shared `emitNodeEnvelope`, exactly as `renderProcessNode`
 * hands its branch-edges over (ADR-0161 decision 2 — one emitter, never a bespoke per-surface
 * `next:`). ADR-0161 dec 1 recorded the intent to migrate the other kinds' hand-authored `next[]` to
 * derived "opportunistically, per surface"; this is that migration, and it travels the same seam
 * rather than forking a second one.
 *
 * ## WHY IT RESOLVES THE TITLE AND THE KIND
 *
 * The block ADR-0464 retires printed a bare command per pointer, having thrown away the title and
 * the type grouping that the `Sources:` block directly above it had already computed — 51% of that
 * block was one repeated token, and it carried strictly less than the smaller block above it. That
 * discard is half of what ADR-0464's Context measures as the defect, so the replacement must not
 * repeat it: every edge here carries its target's title and kind, and the edges come out ordered by
 * the SAME {@link SOURCE_GROUP_ORDER} the `Sources:` block groups by, through the same
 * {@link sourceGroupOf} table. The type signal is free — the corpus is already in hand to resolve
 * the title — so declining to spend it was never a saving.
 *
 * ## THE TWO SPELLINGS ARE ONE EDGE
 *
 * A `dependsOn` entry may name a decision as `asset:adr-0139` OR as `doc:(docs/)decisions/0139-….md`
 * — all three live spellings are legal and none is legacy ({@link parseDecisionPointer}). Measured
 * over the live corpus 2026-08-27, 390 of 1,357 authored edges use the `doc:` form, and on four
 * whole tiers it is the ONLY form: principle 128/128, pattern 45/45, guardrail 35/35, techstack
 * 19/19. A reader that walked `asset:` alone would render an empty onward block for those tiers —
 * the exact "a read would offer nothing" failure D2 exists to prevent — so every pointer is
 * canonicalised through the one resolver and the two spellings of one decision collapse to one edge.
 *
 * ## UNDER-REPORT RATHER THAN PRINT A COMMAND THAT CANNOT RUN
 *
 * A `next:` line is a promise that the command runs. An entry that resolves to no artifact is
 * DROPPED, not rendered as an unknown pointer: ADR-0464 D8 leaves fourteen offered commands naming
 * nothing that exists, and reproducing that class on the surface built to replace it would be a
 * strange way to honour the decision. ADR-0260 D4's asymmetry — under-reporting is the honest
 * failure mode, and inference may never repair it — is the same rule read at render time. Measured
 * 2026-08-27 the drop is empty: all 1,357 authored edges resolve to a live row, 0 dangling.
 *
 * A `doc:` pointer at a repository file that is NOT a decision is dropped for a different and
 * narrower reason: it resolves to a FILE, not to a CLI read, which is the coverage caveat the
 * `Sources:` block already declares for the same token. The schema admits only `asset:` and `doc:`
 * ADR pointers here ({@link DependsOnRef}), and the live corpus carries no such entry.
 *
 * Pure and browser-safe: it resolves strings through a caller-supplied corpus view and touches
 * nothing, so the same derivation can run in the CLI, in the studio and in a test over a fixture.
 */

import { ASSET_REF_PREFIX, adrDocId, parseDecisionPointer } from "./decision-pointer.js";
import { SOURCE_GROUP_ORDER, sourceGroupOf, type AssetTarget } from "./knowledge-sources.js";

/**
 * One resolved onward edge, shaped to drop straight into a `NodeEdge` for the shared emitter.
 *
 * `ref` is CANONICAL — always `asset:<id>` — because the emitter strips that prefix to build the
 * pull command, and a `doc:` relpath would produce a command naming a file the verb cannot read.
 */
export interface DependsOnEdge {
  /** The canonical `asset:<id>` pointer at the target artifact. */
  readonly ref: string;
  /** The target's title and kind, e.g. `Consolidate the load-bearing set [adr]`. */
  readonly label: string;
}

/** A canonicalised entry, held while the list is ordered by {@link SOURCE_GROUP_ORDER}. */
interface CanonicalEdge extends DependsOnEdge {
  readonly group: (typeof SOURCE_GROUP_ORDER)[number];
}

/**
 * PURE and TOTAL: read an artifact's authored `dependsOn` pointers into ordered, resolved onward
 * edges (ADR-0464 D2). See the header for the four rules this encodes — canonicalise both decision
 * spellings, collapse duplicates, drop what cannot be pulled, and order by the `Sources:` grouping.
 *
 * `resolveAsset(id)` returns the target's `{ kind, title }`, or `null`/`undefined` when the corpus
 * holds no such artifact — the same callback shape {@link groupSources} takes, so a call site fills
 * it from the corpus view it already has rather than being handed one.
 */
export function dependsOnEdges(
  pointers: readonly string[],
  resolveAsset: (id: string) => AssetTarget | null | undefined,
): DependsOnEdge[] {
  const resolved: CanonicalEdge[] = [];
  const seen = new Set<string>();
  for (const pointer of pointers) {
    // DECISION FIRST: the parser answers for all three live spellings, so `doc:decisions/0139-….md`
    // and `asset:adr-0139` reach the same row id. A pointer it declines is a Library artifact if it
    // carries the `asset:` scheme, and otherwise a repository file this block cannot offer.
    const decision = parseDecisionPointer(pointer);
    const id =
      decision !== null
        ? adrDocId(decision.number)
        : pointer.startsWith(ASSET_REF_PREFIX)
          ? pointer.slice(ASSET_REF_PREFIX.length)
          : "";
    if (id === "" || seen.has(id)) continue;
    const target = resolveAsset(id);
    if (!target) continue;
    seen.add(id);
    resolved.push({
      ref: `${ASSET_REF_PREFIX}${id}`,
      // The title is what a reader recognises; the id is the honest fallback for a row that carries
      // none, so a titleless artifact still renders a label rather than a bare bracketed kind.
      label: `${target.title === "" ? id : target.title} [${target.kind}]`,
      group: sourceGroupOf(target.kind),
    });
  }
  // Order by the Sources grouping, author order preserved WITHIN a group. On the decision tier —
  // 1.7 edges, all decisions — this is the author's list unchanged; on the agent tier, 16.8 edges
  // wide across every kind in the corpus, it is what turns a flat dump into a scannable one.
  return SOURCE_GROUP_ORDER.flatMap((group) =>
    resolved.filter((edge) => edge.group === group).map(({ ref, label }) => ({ ref, label })),
  );
}
