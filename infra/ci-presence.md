# The CI database identity — keyless WIF setup

CI holds one Cloud SQL identity, `storytree-ci-presence`, reached from GitHub Actions with **no
long-lived key** (ADR-0021 forbids a JSON key in a repo secret). GitHub mints a short-lived OIDC
token; GCP's STS exchanges it for an impersonated-SA access token; the Cloud SQL connector mints the
IAM database token from that.

> **The NAME is stale, the identity is not.** It was created for the session-presence merge-retire
> (ADR-0033 / ADR-0041). ADR-0200 D7 retired presence altogether — `events.session` and
> `events.session_event` are dropped — and the same identity now does the two jobs below. Renaming
> the service account is a flagged follow-up, deliberately not bundled: the name appears in the
> Terraform resource, the Cloud SQL IAM user, and two `ci.yml` constants, and a rename is a
> destroy-and-recreate of a live credential.

## What uses it

**1. `automerge` — releasing the merged branch's claims (WRITE).** A branch dies on merge (ADR-0142),
and the merge is the authoritative "this branch's work is done" fact, so the job runs
[`packages/notice-board/src/store/ingest-merge.ts`](../packages/notice-board/src/store/ingest-merge.ts)
→ `PgClaimStore.releaseClaimsByBranch` to clear the branch's `events.node_claim` rows and append the
`events.claim_event` history (ADR-0138 §4 / ADR-0200). Every step is `continue-on-error: true` and the
writer never exits non-zero: the merge already landed and claim state is advisory coordination, so
this must never fail the merge job. Deliberately **ungated on the head-ref shape** — any branch shape
can hold claims, and a `claude/*` gate once let a `worktree-…` claim outlive its merge by 46 minutes.

**2. `verify` — the live-store gate rungs (READ).** Since **ADR-0302 D3** CI is no longer DB-free:
`check:friction-drain` and `check:arc-proposal-drain` run at the end of `verify` against the live
corpus, so the drain ceilings stop being local-only reds that block the dev box while CI shows green.
`STORYTREE_DB_USER` is set **per-step**, never at job level, so no live credential reaches
`pnpm -r test`.

This depends on the instance running **24/7** (ADR-0302 D2), and not incidentally: this service
account holds `roles/cloudsql.client` + `roles/cloudsql.instanceUser` and **no wake role** — waking is
bound to the studio runtime SA alone ([`studio-db-wake.tf`](studio-db-wake.tf)). Under the old
01:00–07:00 Sydney sleep window, every overnight PR would have redded on an instance CI cannot start.

## Terraform (already applied)

[`ci-presence.tf`](ci-presence.tf) owns the Workload Identity Pool, the OIDC provider, the service
account, its two Cloud SQL roles, the repo-scoped impersonation binding, and the Cloud SQL IAM user.
Creating a pool + project IAM bindings needs Owner-level ADC that an agent session lacks, so it is
owner-run:

```bash
cd infra
terraform init
terraform apply
```

The three constants hardcoded in `ci.yml` MUST equal the Terraform outputs:

```bash
terraform output ci_presence_provider_name    # == workload_identity_provider in ci.yml
terraform output ci_presence_service_account  # == service_account in ci.yml
terraform output ci_presence_db_user          # == STORYTREE_DB_USER in ci.yml
```

| `ci.yml` field               | value                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `workload_identity_provider` | `projects/635716509357/locations/global/workloadIdentityPools/github-actions/providers/github` |
| `service_account`            | `storytree-ci-presence@storytree-498613.iam.gserviceaccount.com`                                |
| `STORYTREE_DB_USER`          | `storytree-ci-presence@storytree-498613.iam`                                                    |

## ⚠️ The DB grants — owner-run, and RE-RUN whenever they widen

Terraform creates the Cloud SQL IAM user as a **bare role**. Table privileges come from
[`ci-presence-grants.sql`](ci-presence-grants.sql), applied as the schema owner. It is idempotent, so
re-running is always safe — and it must be re-run every time that file changes.

**Run it from the REPO ROOT, not from `infra/`.** The path in the command is repo-root-relative; a
session once handed the owner this command while they were sitting in `infra/`, which doubled the
path and failed.

```bash
# bash — from the repo root
STORYTREE_DB_USER=hua.mick@gmail.com npx tsx infra/apply-ci-presence-grants.ts
```

```powershell
# PowerShell — from the repo root
$env:STORYTREE_DB_USER='hua.mick@gmail.com'; npx tsx infra/apply-ci-presence-grants.ts
```

**APPLIED 2026-08-04** (was outstanding through ADR-0302 D3): the grants gained `SELECT` on
`events.library_artifact` and `events.library_event`. Verified by a direct
`information_schema.role_table_grants` probe, not by the script's exit status — the first run went
against a stale primary checkout and reported success while executing the OLD SQL. **Verify an
owner-run infra step by its EFFECT.** Before this landed, `verify`'s two live-store steps hit
"permission denied for table library_artifact" and — being fail-open on the substrate — printed SKIP
and passed.

## How each consumer behaves on a credential failure

The two jobs are deliberately opposite, and the asymmetry is the point.

**`automerge` degrades.** Every step is `continue-on-error: true` and the writer never exits non-zero:
the merge already landed, and claim state is advisory coordination, so a missing credential leaves the
claims to be cleared by the session's own closing leg. This must never fail the merge job.

**`verify` reds.** Its steps are fail-closed on the QUEUE and were fail-OPEN on the SUBSTRATE — an
absent credential or an unreachable store exited 0 and said so on stdout. **That arm is why a
credential alone did not make the ceilings gate**, and it is now closed in CI (below). The policy, and
why it is an explicit declaration rather than an `if (CI)`, is in
[`packages/cli/src/db-required.ts`](../packages/cli/src/db-required.ts).

### The ceilings are ARMED in CI — ADR-0302 D3 is complete

**Done 2026-08-05**, after both owner-run steps above succeeded and were verified in the cloud. The
two edits in `.github/workflows/ci.yml` belong together and landed together:

1. `STORYTREE_DB_REQUIRED: '1'` sits beside `STORYTREE_DB_USER` on **both** live-store steps, flipping
   an absent credential and an unreachable store from SKIP to red;
2. `continue-on-error: true` is gone from the `verify` job's GCP auth step — once a skip is no longer
   acceptable, an unauthenticated runner must not look like a pass either.

Arming was correctly refused until the preconditions held: on #1146's own `verify` both rungs printed
`SKIP — live DB not reachable (permission denied for table library_artifact)`, which armed would have
redded that PR and every one after it, on an instance no session could fix.

**The standing cost, accepted (ADR-0302 Consequences): a Cloud SQL outage now blocks every merge**,
with no bypass short of a `hold` label or a draft PR. That is the trade — an unverified ceiling is not
a passed one — and it is why the nightly sleep window had to be retired first (D2 before D3).

**To re-soften, unset BOTH.** Restoring `continue-on-error` while leaving the flag set does not
restore the old posture: the steps would still red, just two steps later and reading like a database
outage rather than an auth failure.

## Scope

CI **reads** the corpus and **writes** only claim state. It appends no `events.work_event` and no
verdicts: merge-changed files don't map to story ids, and the world's landed-work signal is verdict
blooms, not merges. Widening CI to write the corpus would be a new decision, not a wider grant.
