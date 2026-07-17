# Hosted website editor CD — keyless deploy-on-merge (ADR-0101)

Closes the merge→deploy gap [ADR-0101](../docs/decisions/0101-hosted-web-content-editor.md) left
open ([web-editor-cloud.md](web-editor-cloud.md) "Follow-up: CD on merge"): an **editor-affecting**
change merged to storytree-web `main` now redeploys the Cloud Run editor (`storytree-web-editor`)
automatically, instead of an owner re-running `bash infra/deploy-web-editor.sh`. Mirrors the studio
CD ([studio-cd.md](studio-cd.md), ADR-0046) **minus IAP**.

Wired in three pieces:

- **`storytree-web/.github/workflows/deploy-editor.yml`** — on `push: main` with an editor-affecting
  `paths:` filter (pure content edits under `src/data/**` are excluded — in github storage mode the
  editor reads content live, so a copy edit only needs the here.now publish, not a redeploy).
  Authenticates **keyless via WIF** (ADR-0021), builds the editor image with Cloud Build
  (`storytree-web/web-editor-cloudbuild.yaml`), then `gcloud run deploy`s with the same public posture
  the manual script uses (runtime SA, the three Keystatic secrets, `--allow-unauthenticated`).
- **`infra/web-editor-cd.tf`** — the dedicated `storytree-web-editor-deployer` SA, its least-privilege
  IAM, a source-staging bucket, and — the crux — a **second, isolated WIF provider** `github-web` on
  the shared `github-actions` pool (see below). The existing `github` provider is **not touched**.
- **This runbook.**

## Why a second provider (read before applying)

The trigger lives in **storytree-ai/storytree-web**, a different repo than the parent **storytree-ai/Storytree**
that `ci-presence.tf`'s `github` provider trusts (its `attribute_condition` rejects all other repos).
Rather than widen that shared provider, `web-editor-cd.tf` **adds** a sibling provider `github-web`
scoped to `storytree-web@main` only, and leaves `github` untouched — so the CI + studio trust it backs
is provably unchanged.

The subtle trap it avoids: the studio deployer is bound to the **pool-level** principalSet
`attribute.ref/refs/heads/main` (any repo in the pool, on main). If `github-web` mapped
`attribute.ref`, a storytree-web@main token would satisfy that binding and could impersonate the
**studio** deployer. So `github-web` maps only `google.subject` + `attribute.repository` (**not**
`attribute.ref`); main is still enforced, at the provider's `attribute_condition`. The editor deployer
binds on `attribute.repository/storytree-ai/storytree-web`, which only `github-web` can mint.

## ONE-TIME OWNER STEP — the IAM apply (BLOCKING until done)

Creating a WIF provider + a service account + project IAM bindings needs Owner-level ADC an agent
session lacks, so this is owner-run, once. Run as the owner (`gcloud auth login`, `gcloud auth
application-default login`, project `storytree-498613`), from a checkout that has `infra/ci-presence.tf`
(the pool) **and** `infra/web-editor-cd.tf`:

```bash
cd infra && terraform init && terraform apply
```

PowerShell (Windows — `;` not `&&`; `terraform` is the command, there is no folder to `cd` into):

```powershell
Set-Location C:\code\storytree\infra
terraform init
terraform apply
```

**Dependency — the WIF pool must exist.** `github-web` is a child of the `github-actions` pool
(`ci-presence.tf`, PR #95, already on `main` + applied for the studio/CI). One apply from a checkout
with both files orders the pool first.

### Verify the apply matches the workflow

The three constants in `deploy-editor.yml` MUST equal the Terraform outputs (authored to match):

```bash
terraform output web_editor_cd_workload_identity_provider  # == workload_identity_provider in deploy-editor.yml
terraform output web_editor_cd_service_account             # == service_account in deploy-editor.yml
terraform output web_editor_cd_build_staging_dir           # == STAGING_DIR env in deploy-editor.yml
```

Expected:

| deploy-editor.yml field      | value                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `workload_identity_provider` | `projects/635716509357/locations/global/workloadIdentityPools/github-actions/providers/github-web` |
| `service_account`            | `storytree-web-editor-deployer@storytree-498613.iam.gserviceaccount.com`                           |
| `STAGING_DIR`                | `gs://storytree-498613-web-editor-cd-build/source`                                                 |

After the apply succeeds and the outputs match, **merge the storytree-web `deploy-editor.yml` PR**
(it is held draft precisely so this apply happens first). The next editor-affecting merge to
storytree-web `main` deploys automatically; merging that PR is itself the first such push, so it
self-deploys.

## Why the workflow PR is held draft

A **deploy that cannot happen should be loud, not silent** — silently skipping is the "merged but
didn't deploy" bug. So `deploy-editor.yml` is not `continue-on-error`: before the apply its auth step
fails and the run goes red. It is `push: main` only (never a PR check), so a red run blocks no merge —
but to avoid red runs on `main` between merge and apply, the PR is held draft until the owner applies
the IAM deliberately and reviews the surface below.

## Triggering a deploy

- **Owner manual merge (the normal path).** storytree-web has no automerge — the owner merges PRs, and
  a user-token merge cascades `push: main` directly (GitHub only blocks `GITHUB_TOKEN` pushes from
  cascading), so the deploy fires. No dispatch shim is needed (unlike the studio's ADR-0061 path).
- **On demand / break-glass:** `gh workflow run deploy-editor.yml --ref main -R storytree-ai/storytree-web`.

## The IAM surface (review before applying)

The deploy SA `storytree-web-editor-deployer` gets:

| Role | Scope | Why |
| --- | --- | --- |
| `roles/iam.workloadIdentityUser` | the deploy SA | the keyless bridge — only storytree-web workflows **on `main`** (via `github-web`) may impersonate it |
| `roles/iam.serviceAccountUser` | on `storytree-web-editor-host` | actAs at deploy → the revision runs as the keyless runtime SA |
| `roles/run.admin` | **project** | deploy revisions + keep the public `--allow-unauthenticated` binding from drifting off (see tightening) |
| `roles/cloudbuild.builds.editor` | project | submit + watch the image build |
| `roles/iam.serviceAccountUser` | on the default compute SA (`635716509357-compute@`) | actAs the Cloud Build **execution** SA |
| `roles/serviceusage.serviceUsageConsumer` | project | required for SA-driven `gcloud builds submit` |
| `roles/logging.viewer` | project | stream `CLOUD_LOGGING_ONLY` build logs for a clean success/fail signal |
| `roles/storage.admin` | the `…-web-editor-cd-build` bucket only | upload build source + the `buckets.get` existence check |
| `roles/artifactregistry.reader` | the `storytree` repo | reference the image at deploy |

Plus the WIF resource: the **`github-web` provider** on the existing pool (storytree-web@main only).
The existing `github` provider, the studio deployer, and the CI presence SA are untouched.

**The one knowingly-wide grant is project `roles/run.admin`** (vs `run.developer`), mirroring the
studio CD's known-working recipe. **Tightening** (owner's call, no workflow change): drop to
`roles/run.developer` and stop passing `--allow-unauthenticated` (the allUsers invoker binding is a
sticky service setting a new revision preserves), then assert the service is still public in the smoke
step.

## Post-deploy verification

Unlike the studio (IAP-locked, so its CD must not curl it), the editor is **public** — so the smoke
step both asserts the newest created revision is the newest Ready one (the rollout took) and curls
`/keystatic` for a 200.

## Relationship to the manual runbook

`infra/deploy-web-editor.sh` / [web-editor-cloud.md](web-editor-cloud.md) stays valid as the
**break-glass** path: the first stand-up (it creates the runtime SA + syncs secrets from `web/.env`),
deploying a non-`main` commit, or any deploy while CD is paused. CD is additive.

## Rollback

```bash
gcloud run services update-traffic storytree-web-editor --region australia-southeast1 \
  --project storytree-498613 --to-revisions <previous-revision>=100
```
