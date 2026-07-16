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

-- Suggestion history: append-only (ADR-0140 suggestions-as-proposals — a proposed edit is a record
-- distinct from a comment, carrying a proposed replacement + original + an open/accepted/rejected
-- status). Mirrors comment_event; `type` is created|transitioned. The DATA half (PgSuggestionStore,
-- packages/library/src/store/pg-suggestion-store.ts) is proven offline; this DDL is its live home,
-- consumed by the accept/reject route (accept-reject-suggestion-api) and the studio backend.
CREATE TABLE IF NOT EXISTS events.suggestion_event (
  seq   BIGSERIAL PRIMARY KEY,
  id    TEXT NOT NULL,
  type  TEXT NOT NULL,            -- created|transitioned
  doc   JSONB,
  actor TEXT NOT NULL,
  at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suggestion current-state projection: one row per suggestion id.
CREATE TABLE IF NOT EXISTS events.suggestion (
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

-- The claim LEDGER (ADR-0200: the noticeboard IS the claim ledger — ADR-0009's claim as plain
-- Postgres, now GRADED). One row per (unit, session) at one of THREE grades:
--   exploring — SHARED: any number of sessions per unit; carries the intent prose (the hovering wisp).
--   waiting   — SHARED: the queue behind a work claim, ordered by claimed_at.
--   work      — the EXCLUSIVE build/edit mutex (ADR-0121/0138 semantics unchanged): at most one
--               session per unit; a second concurrent work claim cannot insert = a HARD REFUSAL
--               that names the holder.
-- The PK is composite (unit_id, session_id) so shared-grade rows coexist; work-grade exclusivity
-- moved from the PK to the `node_claim_work_excl` partial unique index below. Granularity stays
-- the unit id, so different units never contend (the existing per-id property). Staleness reclaims
-- a crashed holder at every grade (ADR-0033's "staleness replaces release discipline"); grade
-- transitions (explore→work upgrade, downgrade, release, promote) are audited in events.claim_event.
CREATE TABLE IF NOT EXISTS events.node_claim (
  unit_id      TEXT NOT NULL,
  session_id   TEXT NOT NULL,
  grade        TEXT NOT NULL DEFAULT 'work',
  branch       TEXT NOT NULL,
  intent       TEXT NOT NULL DEFAULT '',
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_id, session_id)
);

-- MIGRATION (ADR-0200): upgrade an EXISTING pre-graded node_claim in place — the FIRST ALTER in
-- this file (everything above is CREATE IF NOT EXISTS, which never reshapes an existing table).
-- applySchema runs on every boot, so both this block and the fresh CREATE above must converge on
-- the same shape, and every statement here is a guarded no-op on re-run. Existing rows are
-- yesterday's exclusive build/work claims, so 'work' is the correct grade backfill.
ALTER TABLE events.node_claim
  ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'work';

-- Swap the old single-column PK (unit_id) for the composite (unit_id, session_id), guarded on the
-- catalog: the block acts only when the CURRENT pk column set is exactly (unit_id), so a re-run —
-- or a fresh install, whose CREATE above already made the composite PK — no-ops. Duplicate
-- (unit_id, session_id) pairs are impossible coming from the old shape (unit_id WAS the PK); if an
-- out-of-band write ever produced one, ADD CONSTRAINT would abort the transaction FAIL-CLOSED —
-- no row is ever silently dropped.
DO $$
DECLARE
  pk_name TEXT;
  pk_cols TEXT[];
BEGIN
  SELECT c.conname,
         ARRAY(SELECT a.attname::text
                 FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
                ORDER BY k.ord)
    INTO pk_name, pk_cols
    FROM pg_constraint c
   WHERE c.conrelid = 'events.node_claim'::regclass AND c.contype = 'p';

  IF pk_cols = ARRAY['unit_id'] THEN
    EXECUTE format('ALTER TABLE events.node_claim DROP CONSTRAINT %I', pk_name);
    ALTER TABLE events.node_claim
      ADD CONSTRAINT node_claim_pkey PRIMARY KEY (unit_id, session_id);
  END IF;
END $$;

-- Work-grade exclusivity (ADR-0200 D2): at most ONE work claim per unit; shared grades
-- (exploring / waiting) are unconstrained. Sits AFTER the migration block so the grade column
-- already exists on an upgraded table when this runs.
CREATE UNIQUE INDEX IF NOT EXISTS node_claim_work_excl
  ON events.node_claim (unit_id) WHERE grade = 'work';

-- Claim audit history: one append-only row per claim/reclaim/release/conflict-refused, so a refusal
-- is a TYPED event (ADR-0009 "a conflict is a hard refusal, never a warning") and the evidence for
-- "overlap conflicts are routine" accrues here (ADR-0033 §4). Sibling to events.session_event.
CREATE TABLE IF NOT EXISTS events.claim_event (
  seq        BIGSERIAL PRIMARY KEY,
  unit_id    TEXT NOT NULL,
  type       TEXT NOT NULL,          -- claimed|reclaimed|released|conflict-refused
  session_id TEXT NOT NULL,          -- the session that acted (the would-be/actual holder)
  doc        JSONB NOT NULL,         -- the full claim doc (or, for a refusal, the blocking holder)
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-session cursor over the sequenced claim_event log (ADR-0200 D4): deltas that intersect a
-- session's OWN claim set are delivered ONCE, riding outputs the agent already reads — the cursor
-- records the last seq the session has heard, advanced atomically with delivery. Self-baselined to
-- the current max seq on first read, so a fresh session never floods on backlog.
CREATE TABLE IF NOT EXISTS events.claim_cursor (
  session_id TEXT PRIMARY KEY,
  last_seq   BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes (ADR-0017).
CREATE INDEX IF NOT EXISTS claim_event_unit_idx ON events.claim_event (unit_id);
CREATE INDEX IF NOT EXISTS library_artifact_kind_idx ON events.library_artifact (kind);
CREATE INDEX IF NOT EXISTS library_event_id_idx ON events.library_event (id);
CREATE INDEX IF NOT EXISTS work_event_unit_idx ON events.work_event (unit_id);
CREATE INDEX IF NOT EXISTS verdict_unit_idx ON events.verdict (unit_id);
CREATE INDEX IF NOT EXISTS user_event_id_idx ON events.user_event (id);
CREATE INDEX IF NOT EXISTS attestation_test_idx ON events.attestation (test_id);
CREATE INDEX IF NOT EXISTS change_event_unit_idx ON events.change_event (unit_id);
