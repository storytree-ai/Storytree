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
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
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

# The set of Google accounts allowed to be `operator_email`. An allowlist rather than free text,
# because a WRONG-BUT-VALID address here is silently destructive in two directions at once
# (see the validation block below). Adding a second operator — a second machine, a second person —
# is a DELIBERATE edit to this list, which is exactly the property that makes the typo impossible.
variable "operator_allowlist" {
  type        = list(string)
  default     = ["hua.mick@gmail.com"]
  description = "Google accounts permitted as operator_email. Add an entry deliberately; never widen this to bypass a validation failure."
}

variable "operator_email" {
  type        = string
  default     = "hua.mick@gmail.com"
  description = "Your Google account — becomes the IAM database user (auth via IAM tokens, no password)."

  # ── WHY THIS IS GUARDED, measured 2026-08-24/25 ──────────────────────────────────────────────
  #
  # `infra/terraform.tfvars` is gitignored, so a fresh checkout has none and Terraform falls back to
  # an INTERACTIVE PROMPT for this value. It was answered `mick.hua@gmail.com` — the halves of
  # `hua.mick@gmail.com` transposed — on two applies a day apart, and BOTH reported success:
  #
  #   1. It granted `roles/iam.serviceAccountTokenCreator` on `storytree-claude-harness` and
  #      `storytree-codex-harness` (infra/harness-identities.tf, `user:${var.operator_email}`) to
  #      `mickhua@gmail.com` — an account the operator does not own. It stood for a day. Those two
  #      identities hold IAP access to the hosted studio, so the exposure was latent rather than
  #      live only because IAP already admits `allAuthenticatedUsers`.
  #   2. It planned to DESTROY AND RECREATE `google_sql_user.operator` below, renaming the
  #      operator's own Cloud SQL user. That failed both times only because Postgres refused
  #      (`role cannot be dropped because some objects depend on it` — 33 + 29 objects). Nothing in
  #      Terraform stopped it; the database did.
  #
  # The `default` removes the prompt (the hazard's origin) and the `validation` removes the class
  # (a valid-but-wrong address can no longer be typed in). Neither substitutes for reading the
  # plan: ALWAYS check the `N to destroy` count before confirming an apply in this directory.
  validation {
    condition     = contains(var.operator_allowlist, var.operator_email)
    error_message = <<-EOT
      operator_email must be one of var.operator_allowlist (default: hua.mick@gmail.com).

      If you typed this at a prompt, you probably transposed it — `mick.hua@` and `hua.mick@` are
      DIFFERENT Google accounts, and a wrong one here grants a stranger impersonation rights AND
      plans a destroy-and-recreate of the operator's Cloud SQL user. Both report success.

      To stop being prompted at all:  cp terraform.tfvars.example terraform.tfvars
      To add a genuinely new operator: add the address to var.operator_allowlist, deliberately.
    EOT
  }
}

resource "google_sql_database_instance" "storytree" {
  name             = "storytree-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    edition           = "ENTERPRISE"  # shared-core tiers (db-g1-small) require ENTERPRISE, not ENTERPRISE_PLUS
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
