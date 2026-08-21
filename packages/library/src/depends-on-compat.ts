/**
 * ADR-0402 READ TOLERANCE — TEMPORARY, AND THE WHOLE MODULE IS THE REMOVAL UNIT.
 *
 * The rename `standsOn` -> `dependsOn` ships as registered migration #7, which runs at the WRITE
 * boundary (`upcastAndValidate`, called only from `upsertDoc` / `patchDoc`). NOTHING UPCASTS ON READ:
 * every reader of the authored dependency edge — the acyclicity rung, the depth-from-work walk, the
 * studio wire, the two probes — reads the stored payload directly. So on the day the rename lands,
 * every row still carrying the old key is INVISIBLE to all of them.
 *
 * That is not a cosmetic gap. Measured against the live store on the rename branch before this
 * module existed:
 *
 *     check:library-dag-acyclic PASS — no dependsOn cycle across 1701 artifacts (0 authored edges).
 *
 * A PASS, reported by an instrument that could see none of its subject. This module is the EXPAND
 * half of expand/migrate/contract: readers accept EITHER key until the data drains.
 *
 * **DELETE THIS MODULE, AND EVERY CALL SITE, ONCE NO STORED ROW CAN CARRY `standsOn`** — i.e. after
 * a `batch-migrate` run over the live corpus (`packages/library/src/store/batch-migrate.ts`). The
 * contract half of the pattern is a separate, deliberate act; nothing here expires on its own, which
 * is why the removal condition is stated as a fact about the DATA rather than as a date.
 *
 * ONE helper rather than a `dependsOn ?? standsOn` at each of the six call sites: the fallback is a
 * rule, and six copies of a rule is a drift surface where five get deleted and one does not.
 */

/** The pre-ADR-0402 spelling of the authored dependency edge. Read-only, never written. */
export const LEGACY_DEPENDS_ON_KEY = "standsOn";

/**
 * Read a stored doc's authored dependency pointers, tolerating the pre-ADR-0402 `standsOn` key.
 *
 * TOTAL over untrusted input, the posture {@link import("./knowledge-dag.js").dependsOnNodes} already
 * documents and for the same reason: this runs over the LIVE corpus, so a row written by an older
 * schema — or by a branch that has a field this checkout does not — must project as "no edges"
 * rather than throw. A malformed doc is refused at the WRITE boundary; the read side of a
 * fail-closed gate must never be where a surprise row takes the gate down, because that failure
 * looks identical to a real cycle.
 *
 * Returns the pointers VERBATIM (`asset:<id>` / `doc:<relpath>`), filtered to non-empty strings —
 * matching the `stringsOf` shape every call site already applied. Prefix handling stays with the
 * caller that needs it.
 *
 * The NEW key wins outright when both are present: a doc that has been migrated is authoritative,
 * and the legacy read is a fallback, never an override.
 */
export function readDependsOnPointers(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const bag = payload as Record<string, unknown>;
  const current = bag["dependsOn"];
  const raw = Array.isArray(current) ? current : bag[LEGACY_DEPENDS_ON_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/**
 * True when the stored payload CARRIES the authored dependency edge under either key — as distinct
 * from carrying one that happens to be empty.
 *
 * The distinction is load-bearing on the wire (`renderStoredDoc`): the field is absent-by-default and
 * never `[]`, because "carries no authored edge" and "authored, and stands on nothing" are different
 * facts (ADR-0223's optional-not-defaulted rule). A caller deciding whether to EMIT the key must ask
 * this; a caller reading the pointers themselves wants {@link readDependsOnPointers}.
 */
export function hasDependsOnKey(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const bag = payload as Record<string, unknown>;
  return Array.isArray(bag["dependsOn"]) || Array.isArray(bag[LEGACY_DEPENDS_ON_KEY]);
}
