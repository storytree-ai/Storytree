# infra — storytree runtime store (Terraform)

Provisions the one Cloud SQL Postgres that holds the runtime store (events, claims,
IDs, node rollup, the library/knowledge tier, comments) per [ADR-0015](../docs/decisions/0015-gcp-hosting-cloud-sql-event-store.md).
The DB contents live under the `events` schema (see `packages/store/src/schema.sql`).
DBOS is deferred (ADR-0019), so there is no `dbos` schema and no durable-workflow
state — durable execution stays a reserved future target, not live DB contents.

**No service-account keys.** Auth is keyless: user ADC for Terraform, IAM database
auth for the app. See ADR-0015 §3.

## One-time auth (keyless)

```bash
gcloud config set project storytree-498613
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project storytree-498613
gcloud services enable sqladmin.googleapis.com
```

## Provision

```bash
cp terraform.tfvars.example terraform.tfvars   # set operator_email
terraform init
terraform plan
terraform apply
terraform output instance_connection_name      # the non-secret string sessions need
```

## Cost posture — stop when idle (ADR-0015 §5)

Stop/start is out-of-band (not in Terraform, so it isn't treated as drift). Use the
package.json scripts (root) for manual control:

```bash
pnpm db:up        # start → ~1-2 min cold start (activation-policy ALWAYS)
pnpm db:down      # stop  → ~$3-5/mo, storage only (activation-policy NEVER)
pnpm db:status    # show state + activation policy
```

### Auto-stop is a fixed nightly window — 01:00–07:00 Australia/Sydney (`cost-backstop.tf`, ADR-0114)

The shared instance sleeps overnight and is up across the day, so the member-facing hosted studio
(ADR-0042) is reliably reachable during waking hours without anyone running `db:up`. Two
Terraform-managed Cloud Scheduler jobs PATCH the Cloud SQL Admin API directly (no app code), both
running as one least-privilege SA (`sql-stopper`: `roles/cloudsql.editor` = `instances.update`, no
keys):

1. **STOP at 01:00** (`storytree-pg-stop-backstop`) — sets `activationPolicy=NEVER`.
2. **START at 07:00** (`storytree-pg-start-window`) — sets `activationPolicy=ALWAYS`, bringing the
   instance up before members arrive (the half that used to be missing — nothing auto-started it).

Both are unconditional/idempotent — a no-op against an instance already in the target state. A manual
`pnpm db:up` still works any time inside the sleep window (the 07:00 start is a floor, not a ceiling).
The instance resource keeps `lifecycle.ignore_changes = [settings[0].activation_policy]`, so the
out-of-band start/stop is never seen as Terraform drift.

> **History (ADR-0114, amending ADR-0015 §5):** this replaced an **idle-aware Cloud Function**
> (`functions/idle-stop/`) that stopped the instance after 5 h of zero connections, plus a blunt
> 04:30 daily floor. That posture had no morning auto-start (a stopped instance stayed down until a
> human woke it) and could stop mid-day when quiet — both bad for hosted-studio members. The idle
> function was paused, then fully torn down (its SAs, scheduler, bucket, and source removed).

> Don't `pnpm db:down` at the end of a working session (owner call 2026-06-13 — the schedule is the
> stopper, not sessions).

Tear the whole thing down with `terraform destroy`.

## Connect locally (after apply)

```bash
# Auth Proxy as a sidecar; app then talks to localhost:5432 with IAM auth.
cloud-sql-proxy --auto-iam-authn $(terraform output -raw instance_connection_name)
```
