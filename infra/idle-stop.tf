# Idle-aware auto-stop (ADR-0015 §5) — resolves the deferred "idle-aware Cloud Function".
#
# A Gen2 Cloud Function (infra/functions/idle-stop), fired by Cloud Scheduler every 15 min,
# stops storytree-pg ONLY after `idle_minutes` with zero DB connections. While a session /
# the Cloud SQL Auth Proxy holds a connection the idle timer never fires, so it "counts from
# the last request" and will not stop an instance you are actively using — fixing the blunt
# hourly cron that stopped the instance mid-session. The DAILY cron in cost-backstop.tf stays
# as the hard floor for the case where THIS checker is itself broken.

variable "idle_minutes" {
  type        = number
  default     = 480 # 8 h — lengthened from 60 (owner call 2026-06-13): sessions kept finding the
  # instance stopped between same-day bursts. The daily 04:30 floor (cost-backstop.tf) still
  # caps a fallow day; an active day now stays up end-to-end. ~$25/mo fully always-on is the
  # worst-case bound (main.tf tier comment), so the extra idle burn is a few $/mo.
  description = "Stop the instance only after this many minutes with zero DB connections."
}

variable "idle_check_schedule" {
  type        = string
  default     = "*/15 * * * *"
  description = "How often the idle-checker runs (it only stops on a sustained-idle reading)."
}

# --- APIs the function + its trigger need ---
resource "google_project_service" "functions" {
  service            = "cloudfunctions.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "cloudbuild" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "monitoring" {
  service            = "monitoring.googleapis.com"
  disable_on_destroy = false
}

# --- least-privilege identity for the function: stop + read metrics, nothing else ---
resource "google_service_account" "sql_idle_stopper" {
  account_id   = "sql-idle-stopper"
  display_name = "Cloud Function — idle-aware stop of storytree-pg"
}
resource "google_project_iam_member" "idle_stopper_editor" {
  project = var.project_id
  role    = "roles/cloudsql.editor" # instances.update (start/stop) — NOT delete (that's admin)
  member  = "serviceAccount:${google_service_account.sql_idle_stopper.email}"
}
resource "google_project_iam_member" "idle_stopper_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.viewer" # read the connections time series
  member  = "serviceAccount:${google_service_account.sql_idle_stopper.email}"
}

# Deploying a Gen2 function that RUNS AS sql-idle-stopper requires the deploying identity
# (the operator's ADC) to be able to actAs that SA. Owner usually implies this, but a
# freshly-created SA can lag the check — so bind it explicitly and Terraform-managed.
resource "google_service_account_iam_member" "operator_actas_idle_stopper" {
  service_account_id = google_service_account.sql_idle_stopper.name
  role               = "roles/iam.serviceAccountUser"
  member             = "user:${var.operator_email}"
}

# --- function source: zip the dir → GCS (Cloud Build installs deps from package.json) ---
data "archive_file" "idle_stop_src" {
  type        = "zip"
  source_dir  = "${path.module}/functions/idle-stop"
  output_path = "${path.module}/.terraform-tmp/idle-stop.zip"
}
resource "google_storage_bucket" "function_src" {
  name                        = "${var.project_id}-fn-src"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
}
resource "google_storage_bucket_object" "idle_stop_src" {
  # md5 in the name => a source change uploads a new object and redeploys the function.
  name   = "idle-stop-${data.archive_file.idle_stop_src.output_md5}.zip"
  bucket = google_storage_bucket.function_src.name
  source = data.archive_file.idle_stop_src.output_path
}

# --- the function ---
resource "google_cloudfunctions2_function" "idle_stop" {
  name        = "storytree-pg-idle-stop"
  location    = var.region
  description = "Stops storytree-pg only after ${var.idle_minutes} min of zero DB connections (ADR-0015 §5)."

  build_config {
    runtime     = "nodejs22"
    entry_point = "idleStop"
    source {
      storage_source {
        bucket = google_storage_bucket.function_src.name
        object = google_storage_bucket_object.idle_stop_src.name
      }
    }
  }

  service_config {
    max_instance_count    = 1
    available_memory      = "256M"
    timeout_seconds       = 120
    service_account_email = google_service_account.sql_idle_stopper.email
    environment_variables = {
      PROJECT_ID    = var.project_id
      INSTANCE_NAME = google_sql_database_instance.storytree.name
      IDLE_MINUTES  = tostring(var.idle_minutes)
    }
  }

  depends_on = [
    google_project_service.functions,
    google_project_service.run,
    google_project_service.cloudbuild,
    google_project_service.artifactregistry,
    google_service_account_iam_member.operator_actas_idle_stopper,
  ]
}

# --- Cloud Scheduler invokes the function over HTTP with an OIDC token ---
# Gen2 functions are Cloud Run services; the caller needs run.invoker on that service
# (the function is NOT public — only this scheduler SA may invoke it).
resource "google_service_account" "idle_scheduler" {
  account_id   = "sql-idle-scheduler"
  display_name = "Cloud Scheduler — triggers the idle-stop function"
}
resource "google_cloud_run_service_iam_member" "idle_invoker" {
  project  = var.project_id
  location = google_cloudfunctions2_function.idle_stop.location
  service  = google_cloudfunctions2_function.idle_stop.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.idle_scheduler.email}"
}
resource "google_cloud_scheduler_job" "idle_check" {
  name        = "storytree-pg-idle-check"
  description = "Every 15 min: stop storytree-pg only if idle ${var.idle_minutes} min (idle-aware)."
  region      = var.region
  schedule    = var.idle_check_schedule
  time_zone   = "Australia/Sydney"

  http_target {
    http_method = "POST"
    uri         = google_cloudfunctions2_function.idle_stop.url
    oidc_token {
      service_account_email = google_service_account.idle_scheduler.email
      audience              = google_cloudfunctions2_function.idle_stop.url
    }
  }

  retry_config {
    retry_count = 1
  }

  depends_on = [
    google_project_service.scheduler,
    google_cloud_run_service_iam_member.idle_invoker,
  ]
}
