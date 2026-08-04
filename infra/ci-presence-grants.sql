-- DB privileges for the CI service account (keyless WIF, infra/ci-presence.tf). Two jobs use it now:
--
--   1. WRITE — the merge-time claim release (ADR-0138 §4 / ADR-0200). `automerge` runs
--      packages/notice-board/src/store/ingest-merge.ts → PgClaimStore.releaseClaimsByBranch, which
--      needs to DELETE the merged branch's `events.node_claim` rows (RETURNING needs SELECT; the
--      in-transaction oldest-waiter promotion needs UPDATE) and append one `events.claim_event`
--      history row per cleared claim.
--   2. READ — the live-store gate rungs (ADR-0302 D3). `verify` runs `check:friction-drain` and
--      `check:arc-proposal-drain`, which read `friction` and `arc` documents out of the corpus.
--
-- THE READ HALF IS READ-ONLY, AND THAT IS A DECISION, NOT AN OVERSIGHT. CI has no business writing
-- the corpus: every corpus write is authored by a session or the studio through a validated write
-- path, and a CI runner is neither. So the grants below add SELECT and nothing else on the library
-- tables. Anything that later wants CI to WRITE the corpus is a new decision, not a wider grant here.
--
-- SCOPE OF THE IDENTITY, stated because the grants alone understate it: the WIF binding in
-- ci-presence.tf is keyed on `attribute.repository`, NOT on a ref, so ANY branch's workflow in
-- storytree-ai/Storytree can impersonate this SA — and after this widening that buys corpus READS
-- where before it bought only claim-row deletes. The owner considered this on 2026-08-04 and
-- ACCEPTED it: ref-scoping cannot work when `verify` runs on PR branches by definition, the repo is
-- private so only people who can already push could reach it, and a fork PR gets no token at all.
-- Recorded in ADR-0302's corrected cost note. Do NOT add a ref condition without re-deciding that.
--
-- (The events.session/session_event grants that used to lead this file were REMOVED with the
-- presence retirement, ADR-0200 D7 — the tables are dropped by schema.sql. The SA's stale
-- `ci-presence` NAME is a flagged follow-up, not this sweep.)
--
-- Idempotent. Run as the schema owner (hua.mick@gmail.com, keyless) AFTER `terraform apply`.
-- The path is relative to the REPO ROOT — run it from there, not from infra/:
--   STORYTREE_DB_USER=hua.mick@gmail.com npx tsx infra/apply-ci-presence-grants.ts

GRANT USAGE ON SCHEMA events TO "storytree-ci-presence@storytree-498613.iam";

-- The story-claim clear (ADR-0138 cap D / ADR-0142): the merge job's ingest-merge calls
-- releaseClaimsByBranch — DELETE ... RETURNING on the claim projection (RETURNING needs SELECT)
-- plus one append-only `released` history row per cleared claim. Added 2026-07-02: the clear had
-- been failing soft ("permission denied for table node_claim") on every merge since cap D landed.
-- UPDATE added 2026-07-16: the ADR-0200 graded ledger promotes the freed unit's oldest live
-- waiter inside the release transaction (`SELECT ... FOR UPDATE` + `UPDATE grade='work'` in
-- PgClaimStore.#promoteOldestWaiter) — FOR UPDATE alone requires UPDATE privilege, so without it
-- the whole release ROLLED BACK fail-soft on every merge since inc 1 (#741) landed.
GRANT SELECT, UPDATE, DELETE ON events.node_claim
  TO "storytree-ci-presence@storytree-498613.iam";
GRANT INSERT ON events.claim_event
  TO "storytree-ci-presence@storytree-498613.iam";

-- USAGE on sequences so the claim_event BIGSERIAL `seq` can advance on INSERT. Sequence-only
-- (no table INSERT elsewhere), so this cannot widen write access beyond the tables above.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA events
  TO "storytree-ci-presence@storytree-498613.iam";

-- The corpus READ half (ADR-0302 D3). `check:friction-drain` and `check:arc-proposal-drain` call
-- PgLibraryStore.queryDocs({kind}) for `friction` and `arc` documents; without this the CI runs die
-- with "permission denied for table library_artifact" and — because both checks are fail-open on the
-- substrate — report SKIP and pass, which is the silent-no-op this grant exists to prevent.
--
-- SELECT only, on the corpus projection and its append-only history. `library_artifact` is what the
-- two checks actually read today; `library_event` is the same corpus's history and is granted with
-- it so that a later READ-ONLY check does not cost a second owner-run round-trip. Neither confers
-- any write: no INSERT, no UPDATE, no DELETE, and no grant on any other table in the schema.
GRANT SELECT ON events.library_artifact, events.library_event
  TO "storytree-ci-presence@storytree-498613.iam";
