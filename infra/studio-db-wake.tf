# Hosted studio self-wakes its idle-stopped DB (ADR-0049, studio-cloud `hosted-db-wake`).
#
# The hosted studio (Cloud Run `storytree-studio`) authorizes members from a users projection in
# `storytree-pg`. That instance idle-stops for cost (idle-stop.tf + cost-backstop.tf, ADR-0015), and
# when it is STOPPED membership cannot be resolved — members hit the "can't resolve access" wall with
# no in-site way back, because the existing `/api/db/*` start path shells out to gcloud on the
# OPERATOR's machine, which doesn't exist in the container. ADR-0049 adds a keyless, hosted-native
# wake: the studio's RUNTIME SA calls the Cloud SQL Admin REST API directly (PATCH
# settings.activationPolicy=ALWAYS — the exact inverse of cost-backstop.tf's nightly stop), using its
# ambient metadata token (the ADR-0021 keyless posture). The endpoint is admin-gated in the app
# (seed-admin-only while the store is down — guestPolicy.ts `mayWakeDb`).
#
# This file grants the runtime SA the MINIMUM Cloud SQL permissions that wake needs, via a dedicated
# CUSTOM ROLE rather than a predefined one:
#   • narrower than roles/cloudsql.admin (which can DELETE instances/databases),
#   • narrower than roles/cloudsql.editor (the cost-backstop SA's role — also imports/exports, clones,
#     user + database management). Wake only needs get + update (start), so it gets exactly those two.
#
# ── ONE-TIME OWNER STEP (BLOCKING until done) ───────────────────────────────────────────────────
# Creating a custom role + a project IAM binding needs Owner-level ADC the agent session lacks, so
# this is owner-run, once, and PRIVILEGED enough to review deliberately (see infra/studio-cloud.md
# §6). The PR is held draft precisely so this apply happens after review:
#   cd infra && terraform init && terraform apply
# Until applied, the runtime SA lacks cloudsql.instances.update and POST /api/db/wake answers a clear
# 502 ("Cloud SQL Admin API 403: … cloudsql.instances.update denied") — the feature fails LOUDLY and
# safely (no silent no-op), and nothing else regresses.
#
# `local.studio_runtime_sa` ("storytree-studio-host@…") is defined in studio-cd.tf — all infra/*.tf
# share one Terraform module, so it is reused here rather than re-declared.

# The least-privilege custom role: get the instance + flip its activation policy (start). No delete,
# no data plane, no user/database management — the smallest grant that can wake a stopped instance.
resource "google_project_iam_custom_role" "studio_db_wake" {
  role_id     = "storytreeStudioDbWake"
  title       = "Storytree studio — wake the DB (ADR-0049)"
  description = "Lets the hosted studio runtime SA start its idle-stopped Cloud SQL instance: get + update only."
  permissions = [
    "cloudsql.instances.get",    # describe / read state (the Admin API may read before patching)
    "cloudsql.instances.update", # PATCH settings.activationPolicy=ALWAYS — the start itself
  ]
}

# Bind the custom role to the studio's runtime SA, project-wide. The studio only ever targets the one
# instance (storytree-pg); a resource-scoped binding isn't available for Cloud SQL custom roles, so
# the project scope is the tightest the platform offers — and the role's two permissions keep the
# blast radius to "can start/stop/read Cloud SQL instances", not administer them.
resource "google_project_iam_member" "studio_host_db_wake" {
  project = var.project_id
  role    = google_project_iam_custom_role.studio_db_wake.id
  member  = "serviceAccount:${local.studio_runtime_sa}"
}

output "studio_db_wake_role_id" {
  value       = google_project_iam_custom_role.studio_db_wake.role_id
  description = "The custom role granting the studio runtime SA cloudsql.instances get+update (ADR-0049)."
}
