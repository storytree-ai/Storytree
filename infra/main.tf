# storytree runtime store — one Cloud SQL Postgres (ADR-0015).
# Single-operator footprint: local Terraform state (no GCS backend), no HA,
# public IP reached only via the Cloud SQL Auth Proxy + IAM (no password, no
# authorized-network allowlist). Stop/start is the default cost posture (§5);
# activation_policy is deliberately left to gcloud, not Terraform (see lifecycle).

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  # Remote state in GCS so it survives worktree disposal and is reachable from
  # any checkout (the infra now lives on main). Bucket has versioning on for
  # state recovery. A single operator still has no real locking contention.
  backend "gcs" {
    bucket = "storytree-498613-tfstate"
    prefix = "infra"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type    = string
  default = "storytree-498613"
}

variable "region" {
  type    = string
  default = "australia-southeast1"
}

variable "operator_email" {
  type        = string
  description = "Your Google account — becomes the IAM database user (auth via IAM tokens, no password)."
}

resource "google_sql_database_instance" "storytree" {
  name             = "storytree-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    edition           = "ENTERPRISE" # shared-core tiers (db-g1-small) require ENTERPRISE, not ENTERPRISE_PLUS
    tier              = "db-g1-small" # ~$25/mo always-on; ~$3-5/mo stopped (storage only)
    availability_type = "ZONAL"       # no HA — single operator
    disk_size         = 10
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled = true # public IP, but reachable only through the Auth Proxy
      # No authorized_networks: the Cloud SQL Auth Proxy + IAM enforce identity,
      # not IP allowlists. Add a private-IP + VPC connector later only if Cloud
      # Run defense-in-depth calls for it (ADR-0015 §3 / forward hooks).
    }

    database_flags {
      name  = "cloudsql.iam_authentication" # enables IAM database auth (ADR-0015 §3)
      value = "on"
    }
  }

  deletion_protection = false # single-operator side project; flip on if the data starts to matter

  lifecycle {
    # Stop/start is done out-of-band via gcloud (the §5 cost posture); don't let
    # Terraform treat a manually-stopped instance as drift it must "fix".
    ignore_changes = [settings[0].activation_policy]
  }
}

resource "google_sql_database" "app" {
  name     = "storytree" # one database; the `events` schema lives inside it (schema.sql). DBOS is deferred (ADR-0019) — no `dbos` schema, it stays a reserved future target.
  instance = google_sql_database_instance.storytree.name
}

# IAM database user = your Google identity. No password; the connector mints
# short-lived IAM tokens. Project-level connect/login is covered by your Owner
# role today; a dedicated runtime SA with roles/cloudsql.client +
# cloudsql.instanceUser lands when the Cloud Run executor does (ADR-0015 §4).
resource "google_sql_user" "operator" {
  name     = var.operator_email
  instance = google_sql_database_instance.storytree.name
  type     = "CLOUD_IAM_USER"
}

# The one non-secret string every session needs (ADR-0015 §3).
output "instance_connection_name" {
  value       = google_sql_database_instance.storytree.connection_name
  description = "Pass to the Auth Proxy / cloud-sql-connector, e.g. storytree-498613:australia-southeast1:storytree-pg"
}
