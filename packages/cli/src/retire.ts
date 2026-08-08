import type { StoredDoc } from "@storytree/storage-protocol";

/**
 * The reference-integrity scan behind `storytree library artifact retire` (owner call, 2026-06-20):
 * a session-facing, generalized RETIRE for ANY library artifact, gated not by kind but by whether
 * anything still DEPENDS ON the target. The one gate: you cannot retire an artifact while another
 * artifact references it — a hard refusal that lists the dependents so you re-point or retire them
 * first. This is the inverse altitude of the curator's OQ-only auto-retire (curate.ts): same
 * `store.deleteDoc` rationale primitive, but a reference wall instead of the open-question fence.
 *
 * "Depends on" = an intra-library `asset:<id>` EDGE — a string value that IS a ref, which is exactly
 * what every ref-bearing field in knowledge.ts declares via `AssetRef`: the shared `references:
 * string[]` citation list, the agent kind's refList fields (`context` / `rules` / `antiPatterns`),
 * an agent's `stepRefs[].refs`, a process's `branchEdges[].ref`, and the single `arcRef` pointer on
 * an increment / open question. This still walks every string in the body — so a new ref-bearing
 * field is covered the day it is added, with no per-kind list to keep — but it counts a value only
 * when the WHOLE value is a ref.
 *
 * IT USED TO COUNT `asset:` ANYWHERE IN ANY STRING, INCLUDING PROSE, and that is the defect
 * `realizing-an-entry-drops-the-friction-edge-cli-write-fidelity` closes. A friction item's
 * `routeReason` is a long adjudication record that NAMES the artifacts it reasons about; on
 * 2026-08-03 an inline `asset:<id>` token inside one 6433-character `routeReason` hard-refused the
 * retire of eight proposals, and the migration had to delete through the store instead — the exact
 * hand-path the verb exists to replace. The arc fold makes such citations MORE common, not fewer.
 *
 * WHAT THIS GIVES UP, on purpose: an artifact can now be retired while some other artifact's PROSE
 * mentions it, leaving a dangling name in a sentence. A name in a paragraph was never an edge in the
 * graph sense, nothing resolves it, and no render breaks — whereas a declared ref that dangles is a
 * broken pull. The gate keeps the guarantee it exists to give and stops charging for the other.
 * (`tree focus`'s inbound view reads only `references[]`, so it is still the narrower of the two.)
 */

/** The `asset:<id>` shape — mirrors `AssetRef` in @storytree/library (knowledge.ts). Anchored. */
const ASSET_REF = /^asset:([A-Za-z0-9_-]+)$/;

/**
 * Every library `asset:<id>` this doc body references as an EDGE: walk all string values (recursing
 * into arrays/objects) and take the ones that ARE a ref. Order-free, deduped (a Set).
 */
export function referencedAssetIds(doc: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === "string") {
      const m = ASSET_REF.exec(v.trim());
      if (m?.[1] !== undefined) ids.add(m[1]);
    } else if (Array.isArray(v)) {
      for (const item of v) visit(item);
    } else if (typeof v === "object" && v !== null) {
      for (const item of Object.values(v)) visit(item);
    }
  };
  visit(doc);
  return ids;
}

/**
 * The other artifacts that reference `targetId` via an `asset:<targetId>` edge — the dependents that
 * must be re-pointed or retired before `targetId` can be retired. Excludes the target itself; sorted
 * by id for a stable refusal listing.
 */
export function findDependents(targetId: string, docs: readonly StoredDoc[]): StoredDoc[] {
  return docs
    .filter((d) => d.id !== targetId && referencedAssetIds(d.doc).has(targetId))
    .sort((a, b) => a.id.localeCompare(b.id));
}
