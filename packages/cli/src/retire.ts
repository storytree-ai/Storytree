import type { StoredDoc } from "@storytree/base";

/**
 * The reference-integrity scan behind `storytree library artifact retire` (owner call, 2026-06-20):
 * a session-facing, generalized RETIRE for ANY library artifact, gated not by kind but by whether
 * anything still DEPENDS ON the target. The one gate: you cannot retire an artifact while another
 * artifact references it — a hard refusal that lists the dependents so you re-point or retire them
 * first. This is the inverse altitude of the curator's OQ-only auto-retire (curate.ts): same
 * `store.deleteDoc` rationale primitive, but a reference wall instead of the open-question fence.
 *
 * "Depends on" = an intra-library `asset:<id>` edge. That edge appears in TWO places in a doc body
 * (knowledge.ts): the shared `references: string[]` citation list AND the agent kind's refList fields
 * (`context` / `rules` / `antiPatterns`), each validated as `asset:<id>` by `AssetRef`. Rather than
 * enumerate those fields per kind, this scans EVERY string value in the body for the `asset:<id>`
 * token — so it also catches a bare `asset:foo` mentioned inline in prose, and stays correct as new
 * ref-bearing fields are added. (`tree focus`'s inbound view only reads `references[]`, so it would
 * miss an agent prompt that inlines an asset — exactly the dependency this gate must not wave through.)
 */

/** The `asset:<id>` token shape — mirrors `AssetRef` in @storytree/library (knowledge.ts). */
const ASSET_REF = /asset:([A-Za-z0-9_-]+)/g;

/**
 * Every library `asset:<id>` this doc body references, anywhere in it: walk all string values
 * (recursing into arrays/objects) and pull the `asset:<id>` tokens. Order-free, deduped (a Set).
 */
export function referencedAssetIds(doc: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(ASSET_REF)) {
        if (m[1] !== undefined) ids.add(m[1]);
      }
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
