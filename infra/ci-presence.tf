# CI presence-retire backstop (ADR-0033 / ADR-0041, keyless per ADR-0021).
#
# When a session's PR merges, the CI `automerge` job (.github/workflows/ci.yml) runs the
# `packages/store/src/ingest-merge.ts` writer to AUTHORITATIVELY retire that session's
# `events.session` presence row — the "session over" fact the racy SessionEnd hook misses.
#
# That writer talks to Cloud SQL over IAM (no password). For CI to authenticate WITHOUT a
# long-lived JSON key (the keyless principle — ADR-0021 forbids a key in a GH secret), this
# wires GitHub Actions OIDC → Workload Identity Federation → a dedicated, least-privilege CI
# service account that is a Cloud SQL IAM user. GitHub mints a short-lived OIDC token; GCP's
# STS exchanges it for an impersonated-SA access token; the connector mints the IAM DB token.
#
# ── ONE-TIME OWNER STEP (BLOCKING until done) ───────────────────────────────────────────────
# These resources are created by `terraform apply` run as the owner (Owner-level ADC), because
# creating a Workload Identity Pool + project IAM bindings needs admin the session ADC lacks.
# Until applied, the CI auth step is a no-op fail-soft (continue-on-error) — the merge still
# lands, presence just isn't retried that run. After apply, also run the DB grants once:
#   terraform apply
#   STORYTREE_DB_USER=hua.mick@gmail.com npx tsx infra/apply-ci-presence-grants.ts
# Full runbook: infra/ci-presence.md.

variable "github_repository" {
  type        = string
  default     = "storytree-ai/Storytree"
  description = "owner/repo allowed to impersonate the CI service account via WIF (OIDC attribute.repository)."
}

# STS token exchange + SA impersonation for the OIDC→ADC flow. (iam.googleapis.com backs the
# Workload Identity Pool itself.) disable_on_destroy=false: never yank a shared API on teardown.
resource "google_project_service" "iamcredentials" {
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

# ── Workload Identity Federation: trust GitHub Actions OIDC ───────────────────────────────────

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "OIDC federation for storytree-ai/Storytree CI (presence merge-retire)"
  depends_on                = [google_project_service.iam]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions OIDC"

  # Map the GitHub OIDC claims we key authorization on. `attribute.repository` powers the
  # principalSet binding below so ONLY this repo's workflows can impersonate the SA.
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Google requires an attribute_condition on new providers — scope token acceptance to this
  # repo (defence in depth alongside the principalSet binding).
  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ── The dedicated, least-privilege CI service account ────────────────────────────────────────

resource "google_service_account" "ci_presence" {
  account_id   = "storytree-ci-presence"
  display_name = "CI presence merge-retire (ADR-0033/0041) — keyless WIF"
}

# Connect to + log in as an IAM user on the Cloud SQL instance. Mirrors the studio host SA
# (infra/studio-cloud.md §1): cloudsql.client (open the connection) + cloudsql.instanceUser
# (IAM DB login). No broader role — the SQL grants (apply-ci-presence-grants) cap it to the
# two presence tables.
resource "google_project_iam_member" "ci_presence_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.ci_presence.email}"
}

resource "google_project_iam_member" "ci_presence_sql_instance_user" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.ci_presence.email}"
}

# Let ONLY storytree-ai/Storytree's workflows impersonate the SA (the keyless bridge). The
# principalSet is scoped by attribute.repository, so a fork / another repo cannot assume it.
resource "google_service_account_iam_member" "ci_presence_wif_user" {
  service_account_id = google_service_account.ci_presence.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# The Cloud SQL IAM user for the SA. Name is the SA email WITHOUT `.gserviceaccount.com`
# (Cloud SQL truncates it) → `storytree-ci-presence@storytree-498613.iam`, which is what
# STORYTREE_DB_USER is set to in ci.yml. Bare role until the SQL grants run.
resource "google_sql_user" "ci_presence" {
  name     = trimsuffix(google_service_account.ci_presence.email, ".gserviceaccount.com")
  instance = google_sql_database_instance.storytree.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

# ── Outputs (paste-checks for ci.yml) ────────────────────────────────────────────────────────

output "ci_presence_provider_name" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "The full WIF provider resource name — must equal `workload_identity_provider` in ci.yml's GCP auth step."
}

output "ci_presence_service_account" {
  value       = google_service_account.ci_presence.email
  description = "The CI service account — must equal `service_account` in ci.yml's GCP auth step."
}

output "ci_presence_db_user" {
  value       = google_sql_user.ci_presence.name
  description = "The Cloud SQL IAM username — must equal STORYTREE_DB_USER in ci.yml's writer step."
}
