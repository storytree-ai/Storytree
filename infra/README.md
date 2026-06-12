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

### Auto-stop is idle-aware (`idle-stop.tf`)

Two Terraform-managed mechanisms keep a forgotten instance from bleeding ~$25/mo —
**without** stopping one you're actively using:

1. **Idle-aware Cloud Function** (`storytree-pg-idle-stop`, source in `functions/idle-stop/`)
   — Cloud Scheduler pings it every 15 min (`idle_check_schedule`). It reads the Cloud
   Monitoring `database/network/connections` metric and stops the instance **only after
   `idle_minutes` (default 480 = 8 h; lengthened from 60 on 2026-06-13 — sessions kept
   finding the instance stopped between same-day bursts) with zero DB connections**. While a session / the Cloud SQL
   Auth Proxy holds a connection, the timer never fires — so it "counts from the last
   request" and won't kill live work. It runs as a least-privilege SA (`sql-idle-stopper`:
   `roles/cloudsql.editor` + `roles/monitoring.viewer`, no keys) and is invoked privately
   by the scheduler over an OIDC token (not public). On any error, or when metric data is
   missing (e.g. a freshly-started instance), it **does not stop** and logs loudly.

2. **Daily hard floor** (`storytree-pg-stop-backstop`, `cost-backstop.tf`) — the original
   blunt cron, relaxed from **hourly to daily** (04:30 Australia/Sydney). It stops the
   instance unconditionally, on purpose: it's the last line of cost defense for the case
   where the idle function is itself broken. (It used to be hourly, which is what stopped an
   instance mid-session.)

Tune via `terraform apply -var=idle_minutes=120` (or set it in `terraform.tfvars`).

> **Known gap:** an Auth Proxy left running in the background keeps a connection open, so
> the idle function will treat the instance as "active" indefinitely — the daily floor is
> what catches that. Don't `pnpm db:down` at the end of a working session (owner call
> 2026-06-13 — the automation is the stopper, not sessions); just close any background proxy.

Tear the whole thing down with `terraform destroy`.

## Connect locally (after apply)

```bash
# Auth Proxy as a sidecar; app then talks to localhost:5432 with IAM auth.
cloud-sql-proxy --auto-iam-authn $(terraform output -raw instance_connection_name)
```
