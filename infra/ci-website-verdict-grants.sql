-- DB privileges for the website-verdict CI identity (keyless WIF, infra/ci-website-verdict.tf).
-- ONE intended job (not yet wired into ci.yml — this grant lands with the identity; the
-- consuming job is a separate, follow-up change): driving website-experience's cross-repo
-- UAT legs (the storytree-web acceptance walks) and signing the resulting verdicts.
--
-- DELIBERATELY A SEPARATE IDENTITY FROM storytree-ci-presence, and the split is the decision
-- (infra/ci-presence.md: "Widening CI to write the corpus would be a new decision, not a
-- wider grant."). This identity can write exactly two tables and read nothing:
--
-- Idempotent. Run as the schema owner (hua.mick@gmail.com, keyless) AFTER `terraform apply`.
-- The path is relative to the REPO ROOT — run it from there, not from infra/:
--   STORYTREE_DB_USER=hua.mick@gmail.com npx tsx infra/apply-ci-website-verdict-grants.ts

GRANT USAGE ON SCHEMA events TO "storytree-ci-webverdict@storytree-498613.iam";

-- The signed proof itself (packages/orchestrator/src/store/pg-work-store.ts). SELECT is
-- needed alongside INSERT: the write path does `INSERT ... RETURNING seq, at`, and Postgres
-- requires SELECT on any column named in a RETURNING clause — the same reasoning
-- ci-presence-grants.sql already documents for node_claim's DELETE...RETURNING. No UPDATE,
-- no DELETE: a verdict is append-only, and this identity has no business correcting or
-- removing one it — or anyone else — already wrote.
GRANT INSERT, SELECT ON events.verdict
  TO "storytree-ci-webverdict@storytree-498613.iam";

-- The drive record (packages/drive/src/uat-drive.run.ts). Plain INSERT with no RETURNING
-- clause in that write path, so no SELECT is needed here.
GRANT INSERT ON events.uat_drive
  TO "storytree-ci-webverdict@storytree-498613.iam";

-- Sequence USAGE so the two tables' BIGSERIAL `seq` columns can advance on INSERT. Broad
-- (ALL SEQUENCES, matching ci-presence-grants.sql's own precedent and reasoning) but
-- harmless: a sequence grant alone cannot widen write access to any table this identity has
-- no INSERT grant on.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA events
  TO "storytree-ci-webverdict@storytree-498613.iam";

-- Explicitly NOT granted, stated so a later widening is a conscious edit to this file rather
-- than silent scope-creep:
--   * no SELECT on events.library_artifact / events.library_event — this identity never reads
--     the corpus; criterion/revision ids are resolved from the checked-out story files;
--   * no access at all to events.node_claim / events.claim_event — claim state is
--     storytree-ci-presence's job, not this identity's;
--   * no UPDATE or DELETE anywhere — every table this identity can touch is append-only from
--     its point of view.
