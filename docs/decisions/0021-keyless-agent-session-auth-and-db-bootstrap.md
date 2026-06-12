---
status: accepted
decided: 2026-06-08
---

# ADR-0021: Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap

## Status

accepted (2026-06-08) — **operationalises** [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) §3
(IAM keyless auth) for **agent sessions**, and records the **DB-privilege bootstrap** that the keyless
runtime needs. Validated by the first live corpus migration ([ADR-0017](0017-cross-cutting-knowledge-tier.md)
/ [ADR-0019](0019-library-tier-name-and-defer-dbos.md) Phase 2).

## Date

2026-06-08

## Context

[ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) §3 decided the runtime store uses **IAM database
authentication — no DB password, no key files** — with local dev authenticating from the operator's
**Application Default Credentials** (ADC). That decision was correct but under-operationalised: an agent
session, asked to run the live migration, **assumed it had no credentials and avoided the database** —
the opposite of reality. The keyless setup *was already in place* (operator ADC on the host, plus a
dedicated service account), so no per-session OAuth was ever required. The failure was discoverability:
nothing told the agent "you are already keyless-authenticated; just use it."

Bringing the instance up and connecting then surfaced a **second, real gap**: the connection succeeded
(keyless IAM worked end to end), but the IAM database user could not create the `events` schema —
`ERROR 42501: permission denied for database storytree`. Cloud SQL creates IAM users (Terraform
`google_sql_user`, type `CLOUD_IAM_USER`) as **bare roles with no database-level `CREATE`**. The keyless
runtime needs `CREATE` to build its schema/tables, and an IAM user **cannot grant that to itself** — a
bootstrap problem that only a privileged role (the `postgres` builtin user) can resolve.

## Decision

1. **Agent sessions are keyless by default; assume credentials are present and verify, don't assume
   absence.** GCP/Cloud SQL access uses **ambient ADC** — the operator's
   `application_default_credentials.json` on the dev host (and a dedicated service account
   `claude@…iam.gserviceaccount.com` available for impersonation/headless runs). **No per-session OAuth,
   no key files in the repo.** A session that needs GCP should confirm with
   `gcloud auth application-default print-access-token` (and `gcloud auth list`), **not** assume it is
   unauthenticated. The Cloud SQL **Node connector** mints short-lived IAM tokens as the DB password;
   `STORYTREE_DB_USER` is the **IAM principal email** (`hua.mick@gmail.com`), database `storytree`,
   instance `storytree-498613:australia-southeast1:storytree-pg`.

2. **The IAM DB user is granted `CREATE` on the database once, via a codified bootstrap.** Because IAM
   users are bare roles, a one-time `GRANT CREATE ON DATABASE storytree TO "<iam-email>"` is run as the
   privileged `postgres` user. This is captured in **`infra/bootstrap-grants.sql`** (idempotent) and
   applied by **`packages/store/scripts/apply-grants.mjs`** (Cloud SQL connector, PASSWORD auth). The
   `postgres` password is a **throwaway** set with `gcloud sql users set-password postgres …` for the
   bootstrap and then discarded — it is **not a managed secret** (the Owner can reset it anytime; the
   runtime never uses it). After the grant, **every keyless migration/connection works** with no further
   privilege step.

3. **The cost posture is unchanged** ([ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) §5). The
   instance stays **STOPPED by default**; an agent doing DB work runs the burst `pnpm db:up` → work →
   `pnpm db:down`. It bills only while running.

## Consequences

- **Agents can run DB work headlessly** — the first live corpus migration loaded **73 knowledge units +
  1 comment** into the `events.library_artifact` projection + `events.library_event` log, verified by a
  read-back (`getDoc` round-trip, kind counts match `knowledge.json`), then stopped the instance. The
  Phase-2 store ([ADR-0017](0017-cross-cutting-knowledge-tier.md)) is proven against real Cloud SQL.
- **A `techstack` library artifact is derived from this ADR** (`stack-cloud-sql-keyless-iam`) so future
  agent sessions discover the keyless arrangement from the corpus itself, not by trial and error
  (the discoverability failure this ADR exists to prevent).
- **A future Cloud Run runtime SA** ([ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) §4) gets the
  same treatment: its own `CLOUD_IAM_USER` + the same one-line `CREATE` grant; `roles/cloudsql.client`
  + `roles/cloudsql.instanceUser` on the SA. No new pattern needed.
- The grant is **infra, not application state** — codified in `infra/` alongside the Terraform, so it is
  reproducible on a rebuilt instance.

## What this does NOT decide

- **Long-term management/rotation of the `postgres` bootstrap password** — it is a throwaway today; if a
  recurring privileged path is ever needed, manage it via Secret Manager (not in scope now).
- **The Cloud Run runtime SA's exact grants/roles** — lands when that executor does
  ([ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) §4).
- **Whether grants move into Terraform** — Terraform does not do SQL-level grants cleanly; the SQL file +
  runner is the deliberate seam. Revisit if a `postgresql` TF provider is later adopted.

## References

- [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) (IAM keyless auth — operationalised here),
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) / [ADR-0019](0019-library-tier-name-and-defer-dbos.md)
  (the Phase-2 store this migration fills).
- `infra/bootstrap-grants.sql`, `packages/store/scripts/apply-grants.mjs`,
  `packages/store/scripts/verify-migration.ts`, `packages/store/src/load-corpus.ts`.
- Library artifact `stack-cloud-sql-keyless-iam` (derived from this ADR).
- Owner exchange + first live migration, 2026-06-08.
