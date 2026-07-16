-- DB privileges for the CI presence merge-retire service account (ADR-0033/0041, keyless WIF).
-- The Cloud SQL IAM SA user (created by infra/ci-presence.tf's google_sql_user) is a bare role;
-- the CI writer (packages/store/src/ingest-merge.ts → PgPresenceStore.done) needs ONLY to retire
-- a session's presence row: SELECT + upsert the `events.session` projection and append one
-- `events.session_event` history row. Nothing else — this is the tightest grant in the repo.
--
-- Idempotent. Run as the schema owner (hua.mick@gmail.com, keyless) AFTER `terraform apply`:
--   STORYTREE_DB_USER=hua.mick@gmail.com npx tsx infra/apply-ci-presence-grants.ts

GRANT USAGE ON SCHEMA events TO "storytree-ci-presence@storytree-498613.iam";

-- The presence projection: read it, upsert it (INSERT ... ON CONFLICT DO UPDATE in done()).
GRANT SELECT, INSERT, UPDATE ON events.session
  TO "storytree-ci-presence@storytree-498613.iam";

-- The presence history: append-only — INSERT one `done` event per retire.
GRANT INSERT ON events.session_event
  TO "storytree-ci-presence@storytree-498613.iam";

-- The story-claim clear (ADR-0138 cap D / ADR-0142): the merge job's ingest-merge also calls
-- releaseClaimsByBranch — DELETE ... RETURNING on the claim projection (RETURNING needs SELECT)
-- plus one append-only `released` history row per cleared claim. Added 2026-07-02: the clear had
-- been failing soft ("permission denied for table node_claim") on every merge since cap D landed —
-- these two tables postdate the original tightest-grant set above.
-- UPDATE added 2026-07-16: the ADR-0200 graded ledger promotes the freed unit's oldest live
-- waiter inside the release transaction (`SELECT ... FOR UPDATE` + `UPDATE grade='work'` in
-- PgClaimStore.#promoteOldestWaiter) — FOR UPDATE alone requires UPDATE privilege, so without it
-- the whole release ROLLED BACK fail-soft on every merge since inc 1 (#741) landed.
GRANT SELECT, UPDATE, DELETE ON events.node_claim
  TO "storytree-ci-presence@storytree-498613.iam";
GRANT INSERT ON events.claim_event
  TO "storytree-ci-presence@storytree-498613.iam";

-- USAGE on sequences so the session_event BIGSERIAL `seq` can advance on INSERT. Sequence-only
-- (no table INSERT elsewhere), so this cannot widen write access beyond the two tables above.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA events
  TO "storytree-ci-presence@storytree-498613.iam";
