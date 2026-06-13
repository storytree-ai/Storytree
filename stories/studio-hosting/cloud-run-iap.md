---
id: "cloud-run-iap"
tier: capability
story: studio-hosting
title: "Cloud Run behind IAP with a least-privilege runtime service account"
outcome: "Terraform stands up the Cloud Run service gated by IAP; the runtime SA reaches Cloud SQL keylessly; the allowlist is the only door."
status: proposed
proof_mode: UAT
depends_on: [container-image, guest-scope]
---

# Cloud Run behind IAP with a least-privilege runtime service account

**Outcome —** Terraform stands up the Cloud Run service gated by IAP; the runtime SA reaches
Cloud SQL keylessly; the allowlist is the only door.

## Guidance

- Lands in `infra/` next to the existing Terraform (GCS remote state, ADR-0015). Pieces: the
  service, a runtime SA (`roles/cloudsql.client` + `roles/cloudsql.instanceUser`, an IAM DB
  user for the SA), ingress restricted so IAP is the only path, the IAP allowlist as a tf var.
- Prefer the direct Cloud Run–IAP integration; if the classic HTTPS LB is required, the
  ~US$20/mo is owner-accepted (ADR-0042). Record which path was taken in the apply notes.
- Deploy env: `PORT` (platform), `STORYTREE_STUDIO_STORE=pg`, `STORYTREE_STUDIO_DB_USER=<sa>`,
  `STORYTREE_STUDIO_ADMINS=<owner email>`, guarded mode on.
- `terraform apply` is an owner-confirmed step (new monthly cost), not an auto-merge side
  effect.

## Contracts (2)

1. **`iap-is-the-only-door`** — unauthenticated and unlisted identities never reach the app
   - **asserts —** anonymous hits stop at sign-in; an unlisted Google account is refused by
     IAP; a listed one lands in the studio.
2. **`runtime-sa-least-privilege`** — the SA holds only what serving needs
   - **asserts —** Cloud SQL client/instanceUser and nothing else; no editor/owner grants.
