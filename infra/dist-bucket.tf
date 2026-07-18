# The public distribution bucket — `storytree-dist` (ADR-0207 D5).
#
# Serves the explorer-onboarding install script (and, when packaged binaries exist, the app
# binaries + the electron-updater `latest.yml` feed) as PUBLIC objects on the existing project,
# beside the studio infra.
#
# ── WHY PUBLIC OBJECTS (the load-bearing D5 decision) ───────────────────────────────────────
# Two reasons, and both are about the AUTH MODEL, not convenience:
#   1. The install script must be fetchable PRE-AUTH — the dev runs the one-liner before they
#      have any storytree identity, so anything gated is a chicken-and-egg failure.
#   2. Auto-update INHERITS install's auth model forever. Public objects keep a day-30 update as
#      dumb-simple as a day-0 install; private GitHub releases would put a permanently-refreshing
#      token inside the shipped app.
# The binary is NOT the secret: what the private repo and IAP actually protect — the tree, the
# library, live verdicts — lives in the checkout and the live store, never in the Electron
# package. If gating is ever wanted, the documented upgrade path is serving downloads through the
# IAP-protected Cloud Run using the same Google identity as D4 — NEVER bucket IAM, which would
# recreate exactly the runtime-token problem this decision exists to avoid.
#
# ── ONE-TIME OWNER STEP (BLOCKING until done) ───────────────────────────────────────────────
# Creating a bucket + a public IAM binding needs Owner-level ADC an agent session lacks, so this
# is owner-run, once (the infra/studio-cd.tf precedent):
#   cd infra && terraform init && terraform apply
# Then publish the script and verify it is fetchable with no credentials:
#   gsutil cp infra/install.ps1 gs://storytree-dist/install.ps1
#   curl -sSf https://storage.googleapis.com/storytree-dist/install.ps1 | head -1
# Once that URL answers, the one-liner in infra/install.ps1's header is live.
#
# SCOPE (this increment): the bucket + public read, so the install script is fetchable pre-auth.
# Keeping the object FRESH automatically (publish on merge, the D5 "published by Cloud Build on
# release" clause) and the binary/`latest.yml` updater feed are deliberate FOLLOW-ONS — the
# binaries do not exist yet (pre-D5 the desktop app launches from the provisioned checkout), and
# a smaller reviewed IAM surface is easier to apply and verify first.

resource "google_storage_bucket" "dist" {
  name     = "storytree-dist"
  location = var.region # AU, matching the rest of the footprint; the audience is the AU-based
  # trusted circle. Revisit to a multi-region only if the circle goes global.
  storage_class = "STANDARD"

  # Uniform access: object ACLs are legacy and would let a single mis-set object diverge from the
  # bucket's posture. One bucket-level binding (below) is the whole access story.
  uniform_bucket_level_access = true

  # MUST stay "inherited", never "enforced": `enforced` blocks the allUsers binding outright, which
  # would silently defeat D5's pre-auth fetch. This is the one setting whose wrong value turns the
  # onboarding one-liner into a 403.
  public_access_prevention = "inherited"

  # Versioning so a bad install script (or, later, a bad binary) can be rolled back rather than
  # only overwritten — the artifacts here are what a fresh machine executes.
  versioning {
    enabled = true
  }

  # Public artifacts, cheap to republish from the repo — but never let a `terraform destroy` take
  # the published surface out from under a dev mid-install without an explicit flip.
  force_destroy = false
}

# Public read — the D5 decision made concrete. `allUsers` + objectViewer means anonymous GET on
# objects only: it grants NO listing of the bucket's configuration and NO write of any kind.
resource "google_storage_bucket_iam_member" "dist_public_read" {
  bucket = google_storage_bucket.dist.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# The base URL the installer one-liner and (later) the updater feed are built from.
output "dist_bucket_url" {
  value       = "https://storage.googleapis.com/${google_storage_bucket.dist.name}"
  description = "Public base URL, e.g. https://storage.googleapis.com/storytree-dist/install.ps1"
}
