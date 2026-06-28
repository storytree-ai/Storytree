import { KIND_SPECS } from "./knowledge.js";

/**
 * Library schema migrations — the ordered registry of forward transforms + the write-boundary
 * upcaster (design: docs/research/library-schema-migrations-and-health-checks.md §5).
 *
 * The schema that changes lives in zod (`knowledge.ts`); the data lives inside JSONB docs, not SQL
 * columns — so migrations are JS transforms on `Record<string, unknown>` docs, numbered like
 * Flyway/Alembic but operating on documents. There are NO down-migrations: the append-only event
 * log is the backup (§5 "On down-migrations / rollback").
 *
 * The pin is per-ROW (`doc.schemaVersion`, absent => 0). `upcast` folds pending `up()` transforms
 * before validation and stamps `schemaVersion = CURRENT_SCHEMA_VERSION` ("migrate-on-write", §3) —
 * a doc authored against an old schema is forward-migrated, not rejected.
 */

/** The schema version every freshly-written structured Knowledge doc conforms to. */
export const CURRENT_SCHEMA_VERSION = 3;

/** One forward, version-numbered transform on a JSONB document. */
export interface Migration {
  /** The version this migration brings a doc UP to (applied when doc.version < this). */
  readonly version: number;
  /** Short, stable name for the human-facing "what ran" record. */
  readonly name: string;
  /** Forward transform: vN-1 -> vN. Pure; returns a new doc. */
  up(doc: Record<string, unknown>): Record<string, unknown>;
}

/**
 * The ordered forward-transform registry. Migration #1 retroactively documents what the one-shot
 * `apps/studio/data/migrate-sources.mjs` did (the seeAlso->Sources incident, PR #16): references /
 * provenance were already enriched by that original migration, so this is mostly a STAMP — it just
 * defensively drops any residual `seeAlso` that slipped through (a concurrently-authored old-shape
 * unit, design §1b pain-point #2).
 */
/** Collect the unique `asset:<id>` refs from a prose field (or pass an array through filtered). */
function assetRefsOf(value: unknown): string[] {
  if (typeof value === "string") {
    return [...new Set(value.match(/asset:[A-Za-z0-9_-]+/g) ?? [])];
  }
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value.filter((v): v is string => typeof v === "string" && /^asset:[A-Za-z0-9_-]+$/.test(v)),
      ),
    ];
  }
  return [];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "seeAlso-to-sources",
    up(doc) {
      // references/provenance already enriched by the original one-shot migrate-sources.mjs;
      // defensively drop a residual `seeAlso` if a stray old-shape doc still carries it.
      const { seeAlso: _seeAlso, ...rest } = doc;
      return rest;
    },
  },
  {
    version: 2,
    name: "agent-context-assembly-reshape",
    up(doc) {
      // ADR-0029 owner reshape (2026-06-11), agent kind only: drop the prose authority walls
      // (owns/doesNotTouch/authority — walls are enforced by code/guardrails, never described),
      // rename requiredReading -> context as a typed `asset:` ref-list (the assembly manifest),
      // and retype rules/antiPatterns as `asset:` ref-lists. The transform is mechanical: refs
      // are EXTRACTED from the old prose (context falls back to the doc's `references` asset
      // refs so the required floor stays non-empty); the dropped prose is recoverable from the
      // append-only event log (the no-down-migrations posture above).
      if (doc["kind"] !== "agent") return doc;
      const {
        owns: _owns,
        doesNotTouch: _doesNotTouch,
        authority: _authority,
        requiredReading,
        rules,
        antiPatterns,
        ...rest
      } = doc;
      // Prefer an already-new-shape `context` (a mis-stamped row), else extract from the prose.
      let context = Array.isArray(rest["context"])
        ? assetRefsOf(rest["context"])
        : assetRefsOf(requiredReading);
      if (context.length === 0) context = assetRefsOf(rest["references"]);
      const out: Record<string, unknown> = { ...rest, context };
      const rulesRefs = assetRefsOf(rules);
      if (rulesRefs.length > 0) out["rules"] = rulesRefs;
      const antiPatternRefs = assetRefsOf(antiPatterns);
      if (antiPatternRefs.length > 0) out["antiPatterns"] = antiPatternRefs;
      return out;
    },
  },
  {
    version: 3,
    name: "drop-glossary-projection-fields",
    up(doc) {
      // ADR-0135 retired docs/glossary.md (the Library's `definition` artifacts are the sole term
      // authority). The glossary-projection metadata that fed the generated file — glossarySection
      // / glossaryTerm / glossaryBody — is now inert and removed from the schema, so strip it; and
      // drop the now-dangling `doc:glossary.md` citation each carried (the file is gone). Applies to
      // every structured kind (the fields lived in commonShape). Mechanical + idempotent.
      const { glossarySection: _gs, glossaryTerm: _gt, glossaryBody: _gb, ...rest } = doc;
      if (Array.isArray(rest["references"])) {
        rest["references"] = (rest["references"] as unknown[]).filter(
          (r) => r !== "doc:glossary.md",
        );
      }
      return rest;
    },
  },
];

/**
 * True iff `doc` is a STRUCTURED Knowledge doc — i.e. its `kind` is one of the `KIND_SPECS` keys.
 * A rendered LibraryAsset (has `category` + `body`, no structured `kind`) is NOT structured: its
 * schema is `.strict()` and has no `schemaVersion` field, so stamping it would break validation.
 */
function isStructuredKnowledge(doc: Record<string, unknown>): boolean {
  const kind = doc["kind"];
  return typeof kind === "string" && Object.hasOwn(KIND_SPECS, kind);
}

/**
 * The write-boundary upcaster (design §3 "migrate-on-write", §5(c)): fold pending migrations
 * (version > the doc's current version) in order, then stamp `schemaVersion = CURRENT_SCHEMA_VERSION`.
 *
 * Only transforms/stamps STRUCTURED Knowledge docs; a LibraryAsset or any non-knowledge doc passes
 * through UNCHANGED (its schema has no `schemaVersion` field). Idempotent: `upcast(upcast(x))` deep-
 * equals `upcast(x)` — re-running applies no further migrations and re-stamps the same version.
 */
export function upcast(doc: Record<string, unknown>): Record<string, unknown> {
  if (!isStructuredKnowledge(doc)) return doc;
  let cur = doc;
  let v = typeof doc["schemaVersion"] === "number" ? doc["schemaVersion"] : 0;
  for (const m of MIGRATIONS) {
    if (m.version > v) {
      cur = m.up(cur);
      v = m.version;
    }
  }
  return { ...cur, schemaVersion: CURRENT_SCHEMA_VERSION };
}
