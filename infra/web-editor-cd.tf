# Continuous deployment for the hosted website content editor (ADR-0101) — keyless, WIF (ADR-0021).
#
# Closes the merge->deploy gap ADR-0101 left open (infra/web-editor-cloud.md "Follow-up: CD on
# merge"): an editor-affecting push to storytree-web `main` triggers that repo's
# .github/workflows/deploy-editor.yml, which authenticates to GCP with NO JSON key (GitHub Actions
# OIDC -> Workload Identity Federation -> this deploy service account), builds the editor image via
# Cloud Build (web-editor-cloudbuild.yaml in storytree-web), and `gcloud run deploy`s it with the
# same public posture the manual infra/deploy-web-editor.sh uses (runtime SA, Keystatic secrets,
# --allow-unauthenticated, no IAP, no DB). Mirrors infra/studio-cd.tf (ADR-0046) — minus IAP.
#
# ── WHY A SECOND PROVIDER (the safety crux) ─────────────────────────────────────────────────────
# The trigger lives in HuaMick/storytree-web, a DIFFERENT repo than the parent HuaMick/Storytree
# that ci-presence.tf's `github` provider trusts (its attribute_condition rejects every other repo).
# We do NOT widen that provider, and we do NOT touch it — that keeps the CI + studio trust it backs
# provably unchanged. Instead we ADD a sibling provider `github-web` to the SAME pool, scoped to
# storytree-web@main only.
#
# The subtle trap this avoids: the studio deployer (studio-cd.tf) is bound to the POOL-level
# principalSet `attribute.ref/refs/heads/main` — ANY repo in the pool, on main. If `github-web`
# MAPPED attribute.ref, a storytree-web@main token would satisfy that principalSet and could
# impersonate the STUDIO deployer. So `github-web` deliberately maps ONLY google.subject +
# attribute.repository (NOT attribute.ref): its identities carry no attribute.ref, so they can never
# match the studio's ref-based binding. main is still enforced — at the provider's
# attribute_condition (token acceptance), not as a principal attribute. This editor deployer binds
# on attribute.repository/HuaMick/storytree-web, which only `github-web` can mint (the `github`
# provider rejects that repo), so only storytree-web@main can assume it.
#
# ── SEQUENCING: the pool must exist first ───────────────────────────────────────────────────────
# `github-web` is a child of the `github-actions` pool created by ci-presence.tf (PR #95). This file
# references that pool resource directly (same infra/ module), so one `terraform apply` orders the
# pool before this provider. A deploy cannot authenticate until the pool + these bindings exist;
# until then deploy-editor.yml's auth step fails loudly and the editor simply isn't auto-deployed —
# nothing else breaks.
#
# ── ONE-TIME OWNER STEP (BLOCKING until done) ───────────────────────────────────────────────────
# Creating a WIF provider + a service account + project IAM bindings needs Owner-level ADC the agent
# session lacks, so this is owner-run, once (see infra/web-editor-cd.md):
#   cd infra && terraform init && terraform apply
# Then mark the storytree-web deploy-editor.yml PR ready + merge it. The workflow constants were
# authored to match the outputs at the bottom of this file — verify with `terraform output` first.

locals {
  # The repo whose Actions OIDC may impersonate the editor deploy SA. NOTE the lowercase `storytree-web`
  # (the GitHub repo's exact name) — distinct from ci-presence's `HuaMick/Storytree`.
  web_editor_cd_github_repository = "HuaMick/storytree-web"

  # The hosted-editor runtime SA (created imperatively by infra/deploy-web-editor.sh §1 — NOT a TF
  # resource). The deployed revision runs AS this SA (Secret Manager read for the Keystatic creds;
  # no DB — narrower than the studio's host SA), so the deploy SA must be allowed to actAs it.
  web_editor_runtime_sa = "storytree-web-editor-host@${var.project_id}.iam.gserviceaccount.com"

  # Cloud Build's EXECUTION SA = the project's DEFAULT COMPUTE SA (the same 635716509357-compute the
  # studio CD uses). `gcloud builds submit` runs the build AS this SA, so the SUBMITTER (this deploy
  # SA) must be allowed to actAs it. It already has artifactregistry.writer on the `storytree` repo
  # (the studio's manual + CD builds push to it today), so nothing new is granted to the build SA.
  web_editor_build_sa = "635716509357-compute@developer.gserviceaccount.com"
}

# ── The isolated WIF provider for storytree-web (see "WHY A SECOND PROVIDER" above) ──────────────

resource "google_iam_workload_identity_pool_provider" "github_web" {
  # Child of the existing `github-actions` pool (ci-presence.tf). The explicit reference orders the
  # pool before this provider in a single apply.
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-web"
  display_name                       = "GitHub OIDC storytree-web"
  description                        = "storytree-web editor CD (ADR-0101). Accepts storytree-web@main tokens only."

  # DELIBERATELY no attribute.ref mapping — see the header. Mapping only subject + repository means a
  # storytree-web identity cannot match the studio deployer's pool-level attribute.ref/refs/heads/main
  # binding. google.subject is mandatory.
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Token acceptance is pinned to storytree-web on main (defence in depth alongside the principalSet
  # binding below). assertion.ref is read here even though it is not mapped to a principal attribute.
  attribute_condition = "assertion.repository == '${local.web_editor_cd_github_repository}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ── The dedicated, least-privilege deploy service account ────────────────────────────────────────

resource "google_service_account" "web_editor_deployer" {
  account_id   = "storytree-web-editor-deployer"
  display_name = "Website editor CD — deploy on merge (ADR-0101), keyless WIF"
}

# Only HuaMick/storytree-web's workflows (which only `github-web` can mint, and only on main) may
# impersonate the deploy SA. Bound on attribute.repository because `github-web` does not map
# attribute.ref; main is enforced at the provider's attribute_condition.
resource "google_service_account_iam_member" "web_editor_deployer_wif_user" {
  service_account_id = google_service_account.web_editor_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${local.web_editor_cd_github_repository}"
}

# actAs the runtime SA at deploy time, so the new revision runs as storytree-web-editor-host (the
# Secret Manager principal — ADR-0101). Scoped to that one SA, nothing else.
resource "google_service_account_iam_member" "web_editor_deployer_actas_runtime" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${local.web_editor_runtime_sa}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.web_editor_deployer.email}"
}

# Deploy Cloud Run revisions. This is `roles/run.admin` (not the narrower run.developer) to mirror
# the known-working studio CD recipe and to keep the public --allow-unauthenticated binding from
# silently drifting off (the editor's "wall" is GitHub login at the app, but the service must stay
# publicly reachable for that login to happen). TIGHTENING (owner's call, no workflow change): drop
# to roles/run.developer and stop passing --allow-unauthenticated — the allUsers invoker binding is a
# sticky service-level setting a new revision preserves — then assert it is still public in the smoke
# step. Left project-wide because the first apply could not be agent-tested. See infra/web-editor-cd.md.
resource "google_project_iam_member" "web_editor_deployer_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.web_editor_deployer.email}"
}

# Submit + watch Cloud Build builds (the image build is delegated to Cloud Build via
# web-editor-cloudbuild.yaml). The build EXECUTION SA already has artifactregistry.writer, so nothing
# new is granted to it; the SUBMITTER (this SA) gets builds.editor here AND actAs on the build SA below.
resource "google_project_iam_member" "web_editor_deployer_cloudbuild" {
  project = var.project_id
  role    = "roles/cloudbuild.builds.editor"
  member  = "serviceAccount:${google_service_account.web_editor_deployer.email}"
}

# actAs the Cloud Build EXECUTION SA. `gcloud builds submit` runs the build AS the default compute SA,
# so the submitter needs serviceAccountUser on it (without this the submit fails "caller does not have
# permission to act as service account …-compute@" — the failure the studio CD hit on its first run).
resource "google_service_account_iam_member" "web_editor_deployer_actas_build" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${local.web_editor_build_sa}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.web_editor_deployer.email}"
}

# Stream build logs. web-editor-cloudbuild.yaml sets logging: CLOUD_LOGGING_ONLY, so `builds submit`
# needs log read to tail + report a clean success/failure. Read-only.
resource "google_project_iam_member" "web_editor_deployer_logging_viewer" {
  project = var.project_id
  role    = "roles/logging.viewer"
  member  = "serviceAccount:${google_service_account.web_editor_deployer.email}"
}

# "Use" the project's services / consume its quota — REQUIRED for an SA-driven `gcloud builds submit`
# (without serviceusage.services.use the staging-bucket access is refused). Documented prerequisite,
# hit on the studio CD's first live run.
resource "google_project_iam_member" "web_editor_deployer_serviceusage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.web_editor_deployer.email}"
}

# Reference the built image at deploy time. `gcloud run deploy --image <AR ref>` validates the image
# exists; the deploy principal needs read on the shared `storytree` AR repo (created imperatively for
# the studio — referenced here by location + name, not managed).
resource "google_artifact_registry_repository_iam_member" "web_editor_deployer_ar_reader" {
  project    = var.project_id
  location   = var.region
  repository = "storytree"
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.web_editor_deployer.email}"
}

# ── A dedicated source-staging bucket for `gcloud builds submit` ──────────────────────────────────
# Avoids over-granting the default cloudbuild bucket: the deploy SA gets full control of THIS bucket
# only, and the workflow passes --gcs-source-staging-dir to it. Short TTL so source tarballs don't
# accumulate (the image is the durable artifact).
resource "google_storage_bucket" "web_editor_cd_build_staging" {
  name                        = "${var.project_id}-web-editor-cd-build"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  lifecycle_rule {
    condition {
      age = 7 # days — staged source is ephemeral
    }
    action {
      type = "Delete"
    }
  }
}

# storage.admin (not just objectAdmin) on this bucket ONLY: `gcloud builds submit` also does a
# storage.buckets.get existence check, which objectAdmin lacks. Bucket-scoped blast radius.
resource "google_storage_bucket_iam_member" "web_editor_deployer_staging_admin" {
  bucket = google_storage_bucket.web_editor_cd_build_staging.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.web_editor_deployer.email}"
}

# ── Outputs (paste-checks for storytree-web's deploy-editor.yml) ─────────────────────────────────

output "web_editor_cd_workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github_web.name
  description = "Must equal `workload_identity_provider` in deploy-editor.yml's GCP auth step."
}

output "web_editor_cd_service_account" {
  value       = google_service_account.web_editor_deployer.email
  description = "Must equal `service_account` in deploy-editor.yml's GCP auth step."
}

output "web_editor_cd_build_staging_dir" {
  value       = "gs://${google_storage_bucket.web_editor_cd_build_staging.name}/source"
  description = "Must equal `--gcs-source-staging-dir` (STAGING_DIR) in deploy-editor.yml's build step."
}
