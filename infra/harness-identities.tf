# ── Per-harness identities for programmatic access to the IAP-fronted hosted studio ──────────
#
# WHY THESE EXIST. The hosted studio (`storytree-studio`, Cloud Run, `iap-enabled=true`) sits behind
# direct IAP. Reaching it from a session — to drive a UAT walk against the real deployment, or to read
# the ADR-0259 store door — needs an OIDC token AUDIENCED TO IAP's OAuth client. A user credential can
# NEVER mint one: `gcloud auth print-identity-token --audiences=…` refuses outright with *"Invalid
# account type for `--audiences`. Requires valid service account."* So a service account is not a
# convenience here, it is the only mechanism.
#
# WHY TWO, NOT ONE. Owner call, 2026-08-24: *"we should include which harness is doing it, atm we
# support codex and claude, so make sure their names are somewhere in their identities."* The studio
# stamps author/actor from the IAP identity, so a single shared identity would make every hosted
# action read as one anonymous robot. One identity per harness keeps the audit trail honest about
# WHICH runtime acted — the same reasoning that already produced `storytree-codex-claim-reader` /
# `storytree-codex-claim-writer`, and the naming follows that precedent (`storytree-<harness>-…`).
# The two supported leaves are ADR-0030 / ADR-0232: Claude Agent SDK by default, Codex opt-in.
#
# THE MEASURED RECIPE these identities serve (proved end to end 2026-08-24 against the live service,
# using the pre-existing `storytree-codex-claim-reader` as a stand-in). THREE things must line up, and
# each omission produces a DIFFERENT and misleading error, which is why this read for months as a
# structural wall rather than a missing flag:
#
#   URL="https://storytree-studio-iuknr3zuya-ts.a.run.app"
#   # (1) the audience is IAP's OAuth CLIENT ID, not the Cloud Run URL. `gcloud iap oauth-brands list`
#   #     CANNOT supply it here — the project is not in an organization, and the IAP OAuth Admin APIs
#   #     were permanently shut down in March 2026. Read it off the unauthenticated 302 instead:
#   CID=$(curl -s -D - -o /dev/null "$URL/api/health" \
#         | grep -i '^location:' | grep -oE 'client_id=[^&]+' | cut -d= -f2)
#   # (2) impersonation is mandatory (see above), and (3) --include-email is mandatory: without it IAP
#   #     rejects with `JWT 'email' claim isn't a string`, because gcloud omits email/email_verified.
#   TOK=$(gcloud auth print-identity-token \
#         --impersonate-service-account=storytree-claude-harness@storytree-498613.iam.gserviceaccount.com \
#         --audiences="$CID" --include-email)
#   curl -H "Authorization: Bearer $TOK" "$URL/api/health"
#
# ⚠ IAP VALIDATES THE EMAIL CLAIM BEFORE THE AUDIENCE. A token missing both reports ONLY the email
# fault; fix that and a fresh audience fault appears. One path wearing two costumes — do not read the
# second error as a second wall.
#
# WHAT THIS DOES NOT DO. It does not reopen remote-session access (ADR-0250 / ADR-0254 D4). A remote
# (web/VM) session holds NO GCP credential at all, so it cannot impersonate anything; this is a
# LOCAL-session mechanism and `remote-session-access-arc` is untouched. It also does not by itself
# open the studio: IAP admits the token, and the studio's OWN membership check then answers
# `403 {"error":"not a member"}`. Membership is a row in `events."user"`, granted through the
# Members panel (ADR-0043) — deliberately NOT codified here, because who may read the studio is an
# application authorization decision, not infrastructure.

resource "google_service_account" "claude_harness" {
  account_id   = "storytree-claude-harness"
  display_name = "Claude harness identity — programmatic IAP access to the hosted studio (ADR-0030)"
}

resource "google_service_account" "codex_harness" {
  account_id   = "storytree-codex-harness"
  display_name = "Codex harness identity — programmatic IAP access to the hosted studio (ADR-0232)"
}

# ── Impersonation: the local operator mints tokens AS these identities ───────────────────────
#
# Keyless by construction (ADR-0021's posture): no service-account key is created, downloaded, or
# stored. The operator's own ADC is the root of trust and `--impersonate-service-account` derives a
# short-lived token from it. This is the SAME grant shape that already makes
# `storytree-codex-claim-reader` impersonable (a service-account-level `roles/iam.serviceAccountTokenCreator`
# binding for the operator’s own account), not a broader project-level one — so the blast radius is
# exactly these two accounts.
#
# Scoped to the operator ON PURPOSE. A session inherits this through the operator's ambient ADC on a
# trusted local machine; nothing else in the project gains impersonation. If CI ever needs to mint one,
# add a SEPARATE `workloadIdentityUser` binding scoped by repository (see infra/ci-presence.tf for the
# pattern and for why it is scoped by repository rather than by ref) — do NOT widen this member.
resource "google_service_account_iam_member" "claude_harness_token_creator" {
  service_account_id = google_service_account.claude_harness.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "user:${var.operator_email}"
}

resource "google_service_account_iam_member" "codex_harness_token_creator" {
  service_account_id = google_service_account.codex_harness.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "user:${var.operator_email}"
}

# ── Explicit IAP access, so it does not rest on an accident ──────────────────────────────────
#
# Measured 2026-08-24, the Cloud Run service's IAP policy grants `roles/iap.httpsResourceAccessor` to
# **`allAuthenticatedUsers`** plus the operator’s own account. So these identities would pass IAP TODAY
# with no binding at all — IAP currently admits any authenticated Google identity, and the studio's own
# membership check is the only real authorization boundary.
#
# These two bindings are declared anyway, and that is the point: the moment `allAuthenticatedUsers` is
# tightened (which it arguably should be), the harnesses keep working and the tightening does not
# silently break UAT walks against the deployment. `_iam_member` is the ADDITIVE form — it adds exactly
# these members and never rewrites the policy — so landing this cannot remove the existing bindings.
resource "google_iap_web_cloud_run_service_iam_member" "claude_harness_iap" {
  project                = var.project_id
  location               = var.region
  cloud_run_service_name = "storytree-studio"
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = "serviceAccount:${google_service_account.claude_harness.email}"
}

resource "google_iap_web_cloud_run_service_iam_member" "codex_harness_iap" {
  project                = var.project_id
  location               = var.region
  cloud_run_service_name = "storytree-studio"
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = "serviceAccount:${google_service_account.codex_harness.email}"
}

# ── Outputs (paste-checks) ───────────────────────────────────────────────────────────────────

output "claude_harness_sa_email" {
  description = "Claude harness identity — impersonate this to mint an IAP-audience token."
  value       = google_service_account.claude_harness.email
}

output "codex_harness_sa_email" {
  description = "Codex harness identity — impersonate this to mint an IAP-audience token."
  value       = google_service_account.codex_harness.email
}
