/**
 * READING THE AUTHORED DEPENDENCY EDGE OFF AN UNTRUSTED STORED PAYLOAD.
 *
 * This module was `depends-on-compat.ts` — ADR-0402's EXPAND phase, which let every reader accept
 * the pre-rename `standsOn` key while the corpus still carried it. `adrs-into-the-dag-arc-inc-06`
 * ran the MIGRATE and CONTRACT phases on 2026-08-22: the live corpus was drained through
 * `batch-migrate`, no stored row can carry the old key any more, and the fallback is GONE.
 *
 * **What was deleted is the LEGACY BRANCH, not the helper.** The branch was code whose only purpose
 * was to be deleted — a reader could no longer tell whether a legacy row still existed somewhere or
 * whether the branch was vestigial, which is precisely why inc-06 exists. The DEFENSIVE READ it sat
 * inside is a different thing and is permanent: these two functions run over the LIVE corpus, so a
 * row written by an older schema — or by a branch carrying a field this checkout does not — must
 * project as "no edges" rather than throw. A malformed doc is refused at the WRITE boundary
 * (`validateLibraryDoc`); the read side of a fail-closed gate must never be where a surprise row
 * takes the gate down, because that failure looks identical to a real cycle.
 *
 * Kept as ONE helper for the reason the compat module gave for itself, which survives the rename of
 * its subject: the rule has eight call sites — the acyclicity rung, the depth-from-work walk, the
 * combined-graph proof, the studio wire, the offline corpus derivation and both probes — and eight
 * copies of a rule is a drift surface where seven get fixed and one does not.
 *
 * ⚠ **MIGRATION #7 STAYS FOREVER AND IS NOT PART OF THIS REMOVAL** (`migrations.ts`). The migration
 * registry is append-only, and a removed migration silently breaks any old-shape document that
 * arrives later — one restored from a backup, or authored against the old schema on a long-lived
 * branch. It runs at the WRITE boundary, which is the only place the old key may still appear.
 */

/** PURE: the strings of an array-shaped field; anything else reads as empty. */
function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/**
 * Read a stored doc's authored dependency pointers.
 *
 * TOTAL over untrusted input — see the header. Returns the pointers VERBATIM (`asset:<id>` /
 * `doc:<relpath>`), filtered to non-empty strings; prefix handling stays with the caller that
 * needs it.
 */
export function readDependsOnPointers(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  return stringsOf((payload as Record<string, unknown>)["dependsOn"]);
}

/**
 * True when the stored payload CARRIES the authored dependency edge — as distinct from carrying one
 * that happens to be empty.
 *
 * The distinction is load-bearing on the wire (`renderStoredDoc`): the field is absent-by-default and
 * never `[]`, because "carries no authored edge" and "authored, and stands on nothing" are different
 * facts (ADR-0223's optional-not-defaulted rule). A caller deciding whether to EMIT the key must ask
 * this; a caller reading the pointers themselves wants {@link readDependsOnPointers}.
 */
export function hasDependsOnKey(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  return Array.isArray((payload as Record<string, unknown>)["dependsOn"]);
}
