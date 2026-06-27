# Fixed nightly DB down-window — 01:00–07:00 Australia/Sydney (ADR-0114, amending ADR-0015 §5).
# Two Cloud Scheduler jobs PATCH the Cloud SQL Admin API directly: STOP at 01:00 and START at 07:00.
# Together they REPLACE the idle-aware auto-stop (removed in the ADR-0114 follow-up): the hosted studio (ADR-0042)
# is reached by trusted-circle MEMBERS who cannot `db:up`, so availability must be PREDICTABLE — up
# across waking hours, asleep only overnight — rather than depending on an idle heuristic (which left no
# morning START, so a stopped instance stayed down until a human woke it) or a quiet-hour floor.
#
# The 07:00 START is the half that was missing: it brings the instance up before members arrive, so the
# "studio is down in the morning" incident is structurally prevented. Both jobs are deliberately
# unconditional/dumb: STOP→activationPolicy=NEVER, START→activationPolicy=ALWAYS, idempotent. A manual
# `db:up` still works any time (the 07:00 start is a floor, not a ceiling; a no-op if already running).
#
# Validated 2026-06-06 (the stop): against a RUNNING instance the job succeeds and stops it (the
# sql-stopper SA issues the UPDATE). Against an instance ALREADY in the target state the Cloud SQL API
# returns a benign 400 ("properties other than activation policy ... when stopped") and the job logs a
# failed execution — harmless (a no-op). At a daily cadence that shows up at most once a day.

resource "google_project_service" "scheduler" {
  service            = "cloudscheduler.googleapis.com"
  disable_on_destroy = false
}

# Dedicated least-privilege identity for the scheduler job. roles/cloudsql.editor
# grants cloudsql.instances.update (start/stop) but NOT delete (that's admin).
resource "google_service_account" "sql_stopper" {
  account_id   = "sql-stopper"
  display_name = "Cloud Scheduler — stops/starts storytree-pg (fixed 1am–7am window, ADR-0114)"
}

resource "google_project_iam_member" "sql_stopper_editor" {
  project = var.project_id
  role    = "roles/cloudsql.editor"
  member  = "serviceAccount:${google_service_account.sql_stopper.email}"
}

resource "google_cloud_scheduler_job" "stop_db" {
  name        = "storytree-pg-stop-backstop"
  description = "Stops storytree-pg at 01:00 Sydney — start of the nightly 1am–7am down-window (ADR-0114)"
  region      = var.region
  schedule    = "0 1 * * *" # 01:00 Australia/Sydney — start of the nightly down-window (ADR-0114)
  time_zone   = "Australia/Sydney"

  http_target {
    http_method = "PATCH"
    uri         = "https://sqladmin.googleapis.com/sql/v1beta4/projects/${var.project_id}/instances/${google_sql_database_instance.storytree.name}"
    headers     = { "Content-Type" = "application/json" }
    # Body is base64-encoded per the provider contract.
    body = base64encode(jsonencode({ settings = { activationPolicy = "NEVER" } }))
    oauth_token {
      # OAuth (not OIDC) — the target is a *.googleapis.com Google API.
      service_account_email = google_service_account.sql_stopper.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  retry_config {
    retry_count = 3
  }

  depends_on = [google_project_service.scheduler]
}

# The morning START — the half ADR-0114 adds. Brings storytree-pg up at 07:00 Sydney so the hosted
# studio is reachable before members arrive (PATCH activationPolicy=ALWAYS starts a stopped instance,
# the same mechanism as `db:up`; a no-op if already running). Reuses the sql_stopper SA —
# roles/cloudsql.editor already grants instances.update for both stop and start.
resource "google_cloud_scheduler_job" "start_db" {
  name        = "storytree-pg-start-window"
  description = "Starts storytree-pg at 07:00 Sydney — end of the nightly 1am–7am down-window (ADR-0114)"
  region      = var.region
  schedule    = "0 7 * * *" # 07:00 Australia/Sydney — end of the nightly down-window (ADR-0114)
  time_zone   = "Australia/Sydney"

  http_target {
    http_method = "PATCH"
    uri         = "https://sqladmin.googleapis.com/sql/v1beta4/projects/${var.project_id}/instances/${google_sql_database_instance.storytree.name}"
    headers     = { "Content-Type" = "application/json" }
    # Body is base64-encoded per the provider contract.
    body = base64encode(jsonencode({ settings = { activationPolicy = "ALWAYS" } }))
    oauth_token {
      # OAuth (not OIDC) — the target is a *.googleapis.com Google API.
      service_account_email = google_service_account.sql_stopper.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  retry_config {
    retry_count = 3
  }

  depends_on = [google_project_service.scheduler]
}
