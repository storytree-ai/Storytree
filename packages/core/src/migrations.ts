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
export const CURRENT_SCHEMA_VERSION = 1;

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
