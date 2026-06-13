# Hosted studio CD — keyless deploy-on-merge (ADR-0046)

Closes the merge→deploy gap [ADR-0042](../docs/decisions/0042-hosted-studio-demo-cloud-run-iap.md)
left open: merging a studio-affecting change to `main` now redeploys the Cloud Run studio
automatically, instead of waiting for someone to re-run the manual runbook (`studio-cloud.md`
§3–§4). The "Circle"→"Members" rename (PR #102) shipping to `main` but the live site serving the
old bundle is the bug this fixes.

Wired in three pieces:

- **`.github/workflows/deploy-studio.yml`** — on `push: main` (with a studio-affecting `paths:`
  filter), authenticates to GCP **keyless via WIF** (ADR-0021), builds the image with Cloud Build
  (reusing `infra/studio-cloudbuild.yaml` unchanged), then `gcloud run deploy`s with the **full
  ADR-0042 flag set** (`--iap`, runtime SA, env vars) so the security posture never drifts.
- **`infra/studio-cd.tf`** — the dedicated `storytree-studio-deployer` SA, its least-privilege IAM,
  a source-staging bucket, and the WIF binding. **Reuses** the `github-actions` WIF pool from
  `ci-presence.tf` (a project singleton — not recreated here).
- **This runbook.**

## ⚠️ ONE-TIME OWNER STEP (BLOCKING — the deploy PR is held draft until this is done)

Creating a service account + project IAM bindings needs Owner-level ADC an agent session lacks, so
this is owner-run, once. Run as the owner (`gcloud auth login`, `gcloud auth application-default
login`, project `storytree-498613`). **Run from a checkout that has BOTH `infra/ci-presence.tf` and
`infra/studio-cd.tf`** so one apply creates the WIF pool (PR #95) and the CD resources together.

PowerShell (Windows — note `;`, NOT `&&`, separates statements in PowerShell 5.1; `terraform` is the
command, there is no `terraform` folder to `cd` into):

```powershell
Set-Location C:\path\to\checkout\infra
terraform init     # downloads providers + wires the GCS backend
terraform apply    # creates the deploy SA, its IAM, the staging bucket, the WIF binding (+ the PR #95 pool if not yet applied)
```

bash:

```bash
cd infra && terraform init && terraform apply
```

**Dependency — the WIF pool must exist.** `studio-cd.tf` references the `github-actions` WIF pool
defined by `ci-presence.tf` (PR #95, merged to `main`). Applying from a checkout that has both `.tf`
files creates the pool and this unit's bindings in one run. (The binding references the pool by
literal *path*, so `terraform validate`/`plan` for `studio-cd.tf` does not require `ci-presence.tf`
to be present — but a real deploy cannot authenticate until the pool exists in GCP.)

### Verify the apply matches the workflow

The three constants hardcoded in `deploy-studio.yml` MUST equal the Terraform outputs (authored to
match — this is the paste-check):

```bash
terraform output studio_cd_workload_identity_provider  # == workload_identity_provider in deploy-studio.yml
terraform output studio_cd_service_account             # == service_account in deploy-studio.yml
terraform output studio_cd_build_staging_dir           # == STAGING_DIR env in deploy-studio.yml
```

Expected:

| deploy-studio.yml field        | value                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `workload_identity_provider`   | `projects/635716509357/locations/global/workloadIdentityPools/github-actions/providers/github` |
| `service_account`              | `storytree-studio-deployer@storytree-498613.iam.gserviceaccount.com`                           |
| `STAGING_DIR`                  | `gs://storytree-498613-studio-cd-build/source`                                                 |

After the apply succeeds and the outputs match, **undraft the deploy PR** (or remove the `hold`
label). The next studio-affecting merge to `main` will deploy automatically.

## Why it is held draft (not merged fail-soft like ci-presence)

Unlike the presence merge-retire (advisory → fail-soft, merges immediately), a **deploy that cannot
happen should be loud, not silent** — silently skipping is the exact "merged but didn't deploy"
bug. So `deploy-studio.yml` is *not* `continue-on-error`: before the apply, its auth step fails and
the run goes red. To avoid a stream of red runs on `main` between merge and apply, the PR is held
**draft** until the owner applies the IAM deliberately (and reviews the one knowingly-wide grant —
see below). It is `push: main` only, never a PR check, so even a red run blocks no merge.

## The IAM surface (review before applying)

The deploy SA `storytree-studio-deployer` gets:

| Role | Scope | Why |
| --- | --- | --- |
| `roles/iam.workloadIdentityUser` | the deploy SA | the keyless bridge — only HuaMick/Storytree workflows **on `main`** (`attribute.ref/refs/heads/main`) may impersonate it (tighter than ci-presence's repo-wide binding) |
| `roles/iam.serviceAccountUser` | on `storytree-studio-host` | actAs at deploy → the revision runs as the keyless runtime SA |
| `roles/run.admin` | **project** | deploy revisions **and** the `setIamPolicy` that `--iap` performs (binds the IAP service agent as sole invoker) |
| `roles/cloudbuild.builds.editor` | project | submit + watch the image build |
| `roles/logging.viewer` | project | stream `CLOUD_LOGGING_ONLY` build logs for a clean success/fail signal |
| `roles/storage.objectAdmin` | the `…-studio-cd-build` bucket only | upload build source |
| `roles/artifactregistry.reader` | the `storytree` repo | reference the image at deploy |

**The one knowingly-wide grant is project `roles/run.admin`** (vs the narrower `run.developer`). It
is there because the deploy re-asserts `--iap` every time (so the wall can never silently drift
off), and `--iap` needs `setIamPolicy` which `run.developer` lacks. It was left project-wide because
the first apply could not be agent-tested and project `run.admin` is the known-working CD recipe.
**Tightening options** (owner's call, can be applied later without touching the workflow):

1. Scope `run.admin` to the `storytree-studio` service resource (`google_cloud_run_v2_service_iam_member`)
   + add project `roles/run.viewer` for describe/operations. Tighter; verify the first deploy still
   succeeds (the `--iap` setIamPolicy + operation polling must resolve at resource scope).
2. Drop to `roles/run.developer` and **stop passing `--iap`** in the workflow — IAP is a sticky
   service setting that a new revision preserves — then assert it is still on in the smoke step. Most
   least-privilege; trades self-healing of the IAP posture for an assertion-only guard.

## Post-deploy verification (what CD does, and what it deliberately does NOT)

CD's smoke check asserts the **newest created revision is the newest Ready revision** (the rollout
took) — `gcloud run deploy` already fails the job if the container crashes on boot. It does **NOT**
curl the site: the service is IAP-locked, and the `studio-cloud.md` "verify behind the wall" recipe
(temporary `--no-iap` + a `run.invoker` binding + a spoofed `x-goog-authenticated-user-email` header)
**must never run in automated CD** — it would briefly drop the wall. A signed-in viewer confirms the
served bundle via the `/api/health` `code` git-HEAD stamp.

## Relationship to the manual runbook

`studio-cloud.md` §3–§4 stays valid as the **break-glass** path: the first stand-up, deploying an
arbitrary non-`main` commit, or any deploy while CD is paused. CD is additive, not a replacement.

## Rollback

Cloud Run revisions make rollback a one-liner — no pipeline machinery:

```bash
gcloud run services update-traffic storytree-studio --region australia-southeast1 \
  --project storytree-498613 --to-revisions <previous-revision>=100
```
