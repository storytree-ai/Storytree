-- storytree runtime store DDL (ADR-0017): JSONB docs, history = append-only events,
-- current = projection. Relationships are id pointers held INSIDE the docs (no cross-table keys).
-- Idempotent: safe to run repeatedly (applied by migrate.ts / loadCorpus).

CREATE SCHEMA IF NOT EXISTS events;

-- Library history: one append-only event per write (created/updated/deleted).
CREATE TABLE IF NOT EXISTS events.library_event (
  seq   BIGSERIAL PRIMARY KEY,
  id    TEXT NOT NULL,
  kind  TEXT NOT NULL,
  type  TEXT NOT NULL CHECK (type IN ('created', 'updated', 'deleted')),
  doc   JSONB,
  actor TEXT NOT NULL,
  at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Library current-state projection: one row per live artifact id.
CREATE TABLE IF NOT EXISTS events.library_artifact (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  doc        JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comment history: append-only.
CREATE TABLE IF NOT EXISTS events.comment_event (
  seq   BIGSERIAL PRIMARY KEY,
  id    TEXT NOT NULL,
  type  TEXT NOT NULL,
  doc   JSONB,
  actor TEXT NOT NULL,
  at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comment current-state projection.
CREATE TABLE IF NOT EXISTS events.comment (
  id         TEXT PRIMARY KEY,
  doc        JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schema-migration ledger (design §3 "DB ledger row", Phase 3): the human-facing "which migration
-- ran + when + by whom" audit, complementing the per-row `schemaVersion` stamp inside the docs.
-- Append-only / additive: never alters the tables above.
CREATE TABLE IF NOT EXISTS events.schema_migration (
  version    INT PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor      TEXT NOT NULL
);

-- Work-hierarchy lifecycle history (drive-machinery Phase A): one append-only event per node
-- lifecycle change. Additive + reversible; the clean home for the lifecycle rows that would
-- otherwise co-mingle with library_event. Nothing writes here yet (the dry-run path uses an
-- InMemoryStore); the rollup projection in @storytree/core reads this stream once wired.
CREATE TABLE IF NOT EXISTS events.work_event (
  seq     BIGSERIAL PRIMARY KEY,
  unit_id TEXT NOT NULL,
  tier    TEXT NOT NULL,
  type    TEXT NOT NULL,            -- proposed|building|verdict|retired|...
  doc     JSONB,
  actor   TEXT NOT NULL,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signed proof rows (the prove-it-gate's output, ADR-0020 §4): stops verdicts co-mingling with
-- library_event. `doc` is the full signed Verdict; the scalar columns are the queryable spine.
CREATE TABLE IF NOT EXISTS events.verdict (
  seq        BIGSERIAL PRIMARY KEY,
  unit_id    TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  proof_mode TEXT NOT NULL,
  outcome    TEXT NOT NULL,         -- pass|fail
  commit_sha TEXT NOT NULL,
  signer     TEXT NOT NULL,
  doc        JSONB NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes (ADR-0017).
CREATE INDEX IF NOT EXISTS library_artifact_kind_idx ON events.library_artifact (kind);
CREATE INDEX IF NOT EXISTS library_event_id_idx ON events.library_event (id);
CREATE INDEX IF NOT EXISTS work_event_unit_idx ON events.work_event (unit_id);
CREATE INDEX IF NOT EXISTS verdict_unit_idx ON events.verdict (unit_id);
