# infra — storytree runtime store (Terraform)

Provisions the one Cloud SQL Postgres that holds the runtime store (events, claims,
IDs, node rollup, the library/knowledge tier, comments) per ADR-0015.
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

## Cost posture — the instance runs 24/7 (ADR-0302 D2)

**There is no scheduled stop or start.** Under online-or-nothing (ADR-0302) the live store is the only
source of truth, so any window in which the instance is down is a window in which CI, the gate, every
read command and the hosted studio are all down together. The instance therefore runs continuously,
and the owner accepted the roughly one-third increase in instance-hours explicitly.

Stop/start is out-of-band (not in Terraform, so it isn't treated as drift). Use the
package.json scripts (root) for manual control:

```bash
pnpm db:up        # start → ~1-2 min cold start (activation-policy ALWAYS)
pnpm db:down      # stop  → ~$3-5/mo, storage only (activation-policy NEVER)
pnpm db:status    # show state + activation policy
pnpm db:probe     # definitive reachability check (createPool + SELECT 1)
```

`pnpm db:down` is a deliberate manual off-switch and nothing calls it automatically. Under
online-or-nothing, **using it stops CI landing anything** — no session should run it at the end of a
working burst (owner call 2026-06-13, and now structural rather than merely a convention).

The instance resource keeps `lifecycle.ignore_changes = [settings[0].activation_policy]`, so an
out-of-band start/stop is never seen as Terraform drift.

> **History.** Two postures preceded this one and BOTH are gone. ADR-0015 §5 ran an **idle-aware Cloud
> Function** (`functions/idle-stop/`) that stopped the instance after 5 h of zero connections, plus a
> blunt 04:30 daily floor; it had no morning auto-start and could stop mid-day when quiet, so ADR-0114
> tore it down and replaced it with a **fixed 01:00–07:00 Australia/Sydney sleep window** — two
> Terraform-managed Cloud Scheduler jobs in `cost-backstop.tf`, running as an `sql-stopper` service
> account. ADR-0302 D2 supersedes ADR-0114 and removes that file entirely, along with the two jobs,
> the `sql-stopper` SA and its `roles/cloudsql.editor` binding. The reason the window could not
> survive is specific and worth keeping: the `storytree-ci-presence` service account holds **no wake
> role** (the wake permission is bound only to the studio runtime SA — see `studio-db-wake.tf`), so an
> overnight PR would red on an instance CI has no way to start.

> **Do not re-introduce a scheduled stop as a cost measure** without re-deciding ADR-0302. The cost
> lever that remains available is instance SIZE, not uptime.

Tear the whole thing down with `terraform destroy`.

## Connect locally (after apply)

```bash
# Auth Proxy as a sidecar; app then talks to localhost:5432 with IAM auth.
cloud-sql-proxy --auto-iam-authn $(terraform output -raw instance_connection_name)
```
