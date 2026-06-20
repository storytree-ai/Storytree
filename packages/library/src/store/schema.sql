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

-- Session-presence history (ADR-0033): one append-only event per declare/done. `id` is the
-- worktree-derived sessionId; presence is advisory, so rows carry no signer chain.
CREATE TABLE IF NOT EXISTS events.session_event (
  seq   BIGSERIAL PRIMARY KEY,
  id    TEXT NOT NULL,
  type  TEXT NOT NULL,
  doc   JSONB,
  actor TEXT NOT NULL,
  at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Session-presence current-state projection: one row per session (upserted; staleness is always
-- derived from the doc's lastSeenAt, never stored).
CREATE TABLE IF NOT EXISTS events.session (
  id         TEXT PRIMARY KEY,
  doc        JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Members (ADR-0043): app-owned identity. IAP authenticates; the app authorizes from
-- here. History append-only; current = a one-row-per-email projection keyed by the lowercased,
-- verified email. The doc is zod-validated in @storytree/core at the write boundary; the last-admin
-- guard (no lockout) is enforced in PgUserStore's transaction. ("user" is a reserved word — quoted.)
CREATE TABLE IF NOT EXISTS events.user_event (
  seq   BIGSERIAL PRIMARY KEY,
  id    TEXT NOT NULL,
  type  TEXT NOT NULL,            -- created|updated|removed
  doc   JSONB,
  actor TEXT NOT NULL,
  at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events."user" (
  id         TEXT PRIMARY KEY,    -- the lowercased, verified email
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

-- Per-UAT-test attestations (ADR-0044): append-only SIGNED signals keyed by test id (`<story>#uat-<n>`).
-- A vouch is NOT a proof — this is a DELIBERATELY SEPARATE log from events.verdict (the conflation
-- ADR-0044 d.2 forbids): nothing here ever paints the gate-green hue, and there is NO story roll-up
-- (d.3). The latest-per-(test_id,witness) projection is derived in JS (deriveAttestations), like the
-- verdict glyphs, so there is no projection table to keep atomic. `relayed_by` records the agent that
-- scribed a relayed human attestation ("owner vouched, agent scribed"; d.4). ("attestation" is NOT a
-- reserved word — no quoting needed, unlike events."user".)
CREATE TABLE IF NOT EXISTS events.attestation (
  seq        BIGSERIAL PRIMARY KEY,
  test_id    TEXT NOT NULL,
  outcome    TEXT NOT NULL,           -- pass|fail
  witness    TEXT NOT NULL,           -- human|machine
  signer     TEXT NOT NULL,
  relayed_by TEXT,                    -- the agent/session that scribed a relayed human attestation
  doc        JSONB NOT NULL,          -- the full signed Attestation
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Binding-staleness change log (ADR-0016 §2, the `change` event the ADR adds to the vocabulary):
-- one append-only row per described/undescribed change to a proof unit's bound code, the Postgres
-- home for the `ChangeStore` seam (@storytree/core). The full signed-shape ADR-0016 `ChangeEvent`
-- lives in `doc` (so a read round-trips it byte-for-byte, including an absent description/commitSha);
-- the scalar columns are the queryable spine. `seq` is the TRANSACTION-time order the change log is
-- read back in; `at` defaults to the insertion wall-clock — the doc's own `at` is the VALID-time
-- (ADR-0016 §5 bitemporal) and is NOT necessarily a timestamp (the `storytree drift` CLI uses opaque
-- ordering strings), so it stays inside the JSONB doc, never a TIMESTAMPTZ column. Append-only /
-- additive: never alters the tables above; the latest-per-unit projection is a deferred optimization
-- (the contract `readChangeEvents` returns the full log, which `classifyDrift` consumes).
CREATE TABLE IF NOT EXISTS events.change_event (
  seq         BIGSERIAL PRIMARY KEY,
  unit_id     TEXT NOT NULL,
  hash_before TEXT NOT NULL,
  hash_after  TEXT NOT NULL,
  description TEXT,                  -- present + non-blank ⇒ DESCRIBED (drift); absent ⇒ demoted
  author      TEXT NOT NULL,
  commit_sha  TEXT,                  -- PROVENANCE only — a pointer to the diff, never the drift driver
  doc         JSONB NOT NULL,        -- the full ADR-0016 ChangeEvent (valid-time `at` lives inside)
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ADR-number allocator (ADR-0050): hand out the next ADR number ATOMICALLY so two parallel sessions
-- can't pick the same one (the recurring collision the `storytree adr new` command + the CI dup gate
-- close). Append-only allocation log — one row per number ever handed out (slug/branch/actor for the
-- "who took 0050" audit). A row is never updated or reused, so an abandoned branch's number stays
-- BURNED, never recycled (holes are fine). `number` is the PRIMARY KEY, so a racing double-allocation
-- hits a unique violation and the allocator simply recomputes + retries. The next number is
-- GREATEST(the caller's on-disk max ADR, the max already handed out) + 1 — so it RECONCILES against
-- ADRs that landed on main without going through the allocator (an offline-fallback author), never
-- re-handing a number already used. Append-only / additive: never alters the tables above.
CREATE TABLE IF NOT EXISTS events.adr_number (
  number INT PRIMARY KEY,
  slug   TEXT,
  branch TEXT,
  actor  TEXT NOT NULL,
  at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes (ADR-0017).
CREATE INDEX IF NOT EXISTS library_artifact_kind_idx ON events.library_artifact (kind);
CREATE INDEX IF NOT EXISTS library_event_id_idx ON events.library_event (id);
CREATE INDEX IF NOT EXISTS work_event_unit_idx ON events.work_event (unit_id);
CREATE INDEX IF NOT EXISTS verdict_unit_idx ON events.verdict (unit_id);
CREATE INDEX IF NOT EXISTS user_event_id_idx ON events.user_event (id);
CREATE INDEX IF NOT EXISTS attestation_test_idx ON events.attestation (test_id);
CREATE INDEX IF NOT EXISTS change_event_unit_idx ON events.change_event (unit_id);
